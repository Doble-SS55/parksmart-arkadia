import { exponential, uniform } from '../random/distributions';
import { createRng, type GeneratorKind, type Rng } from '../random/rng';

/**
 * Simulación de eventos discretos de una cola con s barreras y fila única compartida.
 *
 * El reloj es tiempo SIMULADO en minutos. La velocidad de reproducción visual
 * solo decide hasta qué instante se llama `advanceTo`; el resultado matemático
 * es el mismo sin importar si se avanza de golpe o en pasos pequeños (pausar y
 * reanudar no altera nada), porque los eventos se procesan siempre en el mismo
 * orden y los números aleatorios se extraen al procesar cada evento.
 */

export type ServiceDistribution = 'exponencial' | 'uniforme' | 'constante';

export const SERVICE_DISTRIBUTION_LABEL: Record<ServiceDistribution, string> = {
  exponencial: 'Exponencial (supuesto M/M/s)',
  uniforme: 'Uniforme entre mínimo y máximo',
  constante: 'Constante',
};

export type DesEventType = 'llegada' | 'inicio_servicio' | 'fin_servicio' | 'liberacion_servidor' | 'asignacion_cola';

export const EVENT_LABEL: Record<DesEventType, string> = {
  llegada: 'Llegada',
  inicio_servicio: 'Inicio de servicio',
  fin_servicio: 'Fin de servicio',
  liberacion_servidor: 'Barrera liberada',
  asignacion_cola: 'Siguiente en fila asignado',
};

export interface DesConfig {
  /** Tasa de llegada λ en vehículos por minuto. */
  arrivalRatePerMin: number;
  servers: number;
  /** Tiempo medio de servicio en minutos. */
  meanServiceMin: number;
  serviceDistribution: ServiceDistribution;
  /** Solo para la distribución uniforme (minutos). */
  serviceMinMin?: number;
  serviceMaxMin?: number;
  /** Duración del periodo de llegadas, en minutos. */
  horizonMin: number;
  seed: number;
  generator?: GeneratorKind;
}

export interface DesLogEntry {
  seq: number;
  time: number;
  type: DesEventType;
  vehicleId: number;
  serverId: number | null;
}

export interface Vehicle {
  id: number;
  arrival: number;
  serviceStart: number | null;
  serviceEnd: number | null;
  serviceDuration: number | null;
  server: number | null;
}

export interface ServerState {
  id: number;
  vehicleId: number | null;
  busyTime: number;
  served: number;
}

interface PendingEvent {
  time: number;
  seq: number;
  kind: 'arrival' | 'departure';
  vehicleId: number;
  serverId: number | null;
}

/** Montículo binario mínimo por (tiempo, secuencia). */
class EventHeap {
  private items: PendingEvent[] = [];
  get size(): number {
    return this.items.length;
  }
  peek(): PendingEvent | undefined {
    return this.items[0];
  }
  private less(a: PendingEvent, b: PendingEvent): boolean {
    return a.time < b.time || (a.time === b.time && a.seq < b.seq);
  }
  push(e: PendingEvent): void {
    const it = this.items;
    it.push(e);
    let i = it.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(it[i], it[p])) break;
      [it[i], it[p]] = [it[p], it[i]];
      i = p;
    }
  }
  pop(): PendingEvent | undefined {
    const it = this.items;
    if (!it.length) return undefined;
    const top = it[0];
    const last = it.pop()!;
    if (it.length) {
      it[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < it.length && this.less(it[l], it[m])) m = l;
        if (r < it.length && this.less(it[r], it[m])) m = r;
        if (m === i) break;
        [it[i], it[m]] = [it[m], it[i]];
        i = m;
      }
    }
    return top;
  }
}

export interface DesMetrics {
  clock: number;
  arrived: number;
  served: number;
  inService: number;
  inQueue: number;
  busyServers: number;
  /** Espera promedio en fila de los vehículos que ya iniciaron servicio (min). */
  avgWait: number;
  /** Tiempo promedio en el sistema de los vehículos atendidos (min). */
  avgSystem: number;
  maxWait: number;
  /** Utilización observada: tiempo ocupado / (s · reloj). */
  utilization: number;
  maxQueue: number;
  /** Promedio temporal de vehículos en fila y en el sistema. */
  timeAvgQueue: number;
  timeAvgSystem: number;
  /** Tasa de llegada observada en la simulación (veh/min). */
  observedArrivalRate: number;
}

export function validateDesConfig(c: DesConfig): string[] {
  const e: string[] = [];
  if (!(c.arrivalRatePerMin >= 0) || !Number.isFinite(c.arrivalRatePerMin)) e.push('La tasa de llegada debe ser ≥ 0.');
  if (!Number.isInteger(c.servers) || c.servers < 1 || c.servers > 8) e.push('El número de barreras debe ser un entero entre 1 y 8.');
  if (!(c.meanServiceMin > 0)) e.push('El tiempo medio de servicio debe ser mayor que cero.');
  if (c.serviceDistribution === 'uniforme') {
    const lo = c.serviceMinMin ?? NaN;
    const hi = c.serviceMaxMin ?? NaN;
    if (!(lo > 0) || !(hi >= lo)) e.push('Para la distribución uniforme, el mínimo debe ser > 0 y el máximo ≥ mínimo.');
  }
  if (!(c.horizonMin > 0) || c.horizonMin > 100000) e.push('La duración debe ser mayor que 0 y como máximo 100.000 minutos.');
  if (!Number.isInteger(c.seed) || c.seed < 0) e.push('La semilla debe ser un entero ≥ 0.');
  return e;
}

export class DiscreteEventSimulator {
  readonly config: DesConfig;
  private rng: Rng;
  private heap = new EventHeap();
  private seq = 0;
  private logSeq = 0;
  clock = 0;
  readonly vehicles: Vehicle[] = [];
  readonly queue: number[] = [];
  readonly servers: ServerState[];
  readonly log: DesLogEntry[] = [];
  private areaQueue = 0;
  private areaBusy = 0;
  private lastTime = 0;
  private maxQueue = 0;
  private waitSum = 0;
  private waitCount = 0;
  private maxWait = 0;
  private systemSum = 0;
  private servedCount = 0;

  constructor(config: DesConfig) {
    const errors = validateDesConfig(config);
    if (errors.length) throw new Error(errors.join(' '));
    this.config = config;
    this.rng = createRng(config.generator ?? 'mt19937', config.seed);
    this.servers = Array.from({ length: config.servers }, (_, id) => ({ id, vehicleId: null, busyTime: 0, served: 0 }));
    if (config.arrivalRatePerMin > 0) {
      const first = exponential(this.rng, 1 / config.arrivalRatePerMin);
      if (first <= config.horizonMin) this.schedule(first, 'arrival', 0, null);
    }
  }

  private schedule(time: number, kind: PendingEvent['kind'], vehicleId: number, serverId: number | null): void {
    this.heap.push({ time, seq: this.seq++, kind, vehicleId, serverId });
  }

  private record(type: DesEventType, vehicleId: number, serverId: number | null): void {
    this.log.push({ seq: this.logSeq++, time: this.clock, type, vehicleId, serverId });
  }

  private drawService(): number {
    const c = this.config;
    if (c.serviceDistribution === 'constante') return c.meanServiceMin;
    if (c.serviceDistribution === 'uniforme') return uniform(this.rng, c.serviceMinMin!, c.serviceMaxMin!);
    return exponential(this.rng, c.meanServiceMin);
  }

  private accumulate(to: number): void {
    const dt = to - this.lastTime;
    if (dt > 0) {
      this.areaQueue += dt * this.queue.length;
      const busy = this.busyCount();
      this.areaBusy += dt * busy;
      for (const s of this.servers) if (s.vehicleId !== null) s.busyTime += dt;
    }
    this.lastTime = to;
  }

  private busyCount(): number {
    let b = 0;
    for (const s of this.servers) if (s.vehicleId !== null) b++;
    return b;
  }

  private startService(vehicleId: number, server: ServerState, fromQueue: boolean): void {
    const v = this.vehicles[vehicleId];
    if (fromQueue) this.record('asignacion_cola', vehicleId, server.id);
    server.vehicleId = vehicleId;
    v.server = server.id;
    v.serviceStart = this.clock;
    const wait = this.clock - v.arrival;
    this.waitSum += wait;
    this.waitCount++;
    if (wait > this.maxWait) this.maxWait = wait;
    const d = this.drawService();
    v.serviceDuration = d;
    this.record('inicio_servicio', vehicleId, server.id);
    this.schedule(this.clock + d, 'departure', vehicleId, server.id);
  }

  private process(e: PendingEvent): void {
    this.accumulate(e.time);
    this.clock = e.time;
    if (e.kind === 'arrival') {
      const id = this.vehicles.length;
      this.vehicles.push({ id, arrival: e.time, serviceStart: null, serviceEnd: null, serviceDuration: null, server: null });
      this.record('llegada', id, null);
      const next = e.time + exponential(this.rng, 1 / this.config.arrivalRatePerMin);
      if (next <= this.config.horizonMin) this.schedule(next, 'arrival', 0, null);
      const free = this.servers.find((s) => s.vehicleId === null);
      if (free) this.startService(id, free, false);
      else {
        this.queue.push(id);
        if (this.queue.length > this.maxQueue) this.maxQueue = this.queue.length;
      }
    } else {
      const server = this.servers[e.serverId!];
      const v = this.vehicles[e.vehicleId];
      v.serviceEnd = e.time;
      this.systemSum += e.time - v.arrival;
      this.servedCount++;
      server.served++;
      this.record('fin_servicio', v.id, server.id);
      server.vehicleId = null;
      this.record('liberacion_servidor', v.id, server.id);
      const nextId = this.queue.shift();
      if (nextId !== undefined) this.startService(nextId, server, true);
    }
  }

  /** Procesa todos los eventos con tiempo ≤ t. Devuelve el número de eventos procesados. */
  advanceTo(t: number): number {
    let processed = 0;
    let top = this.heap.peek();
    while (top && top.time <= t) {
      this.process(this.heap.pop()!);
      processed++;
      top = this.heap.peek();
    }
    // El reloj avanza sin acumular: las integrales se cierran solo en eventos,
    // así el resultado es idéntico bit a bit sin importar el tamaño del paso.
    if (t > this.clock) this.clock = t;
    return processed;
  }

  /** Corre hasta el fin del periodo de llegadas. Con `drain`, atiende además a los que quedaron. */
  runToEnd(drain = false): void {
    this.advanceTo(this.config.horizonMin);
    if (drain) {
      let top = this.heap.peek();
      while (top) {
        this.process(this.heap.pop()!);
        top = this.heap.peek();
      }
    }
  }

  get finished(): boolean {
    return this.clock >= this.config.horizonMin;
  }

  /** Tiempo ocupado de una barrera hasta el reloj actual (min). */
  serverBusyTime(id: number): number {
    const s = this.servers[id];
    return s.busyTime + (s.vehicleId !== null ? Math.max(0, this.clock - this.lastTime) : 0);
  }

  /** Tiempo del próximo evento pendiente (o null). */
  nextEventTime(): number | null {
    return this.heap.peek()?.time ?? null;
  }

  metrics(): DesMetrics {
    const clock = this.clock;
    const inService = this.busyCount();
    const tail = Math.max(0, clock - this.lastTime);
    const areaQueue = this.areaQueue + tail * this.queue.length;
    const areaBusy = this.areaBusy + tail * inService;
    return {
      clock,
      arrived: this.vehicles.length,
      served: this.servedCount,
      inService,
      inQueue: this.queue.length,
      busyServers: inService,
      avgWait: this.waitCount ? this.waitSum / this.waitCount : 0,
      avgSystem: this.servedCount ? this.systemSum / this.servedCount : 0,
      maxWait: this.maxWait,
      utilization: clock > 0 ? areaBusy / (this.config.servers * clock) : 0,
      maxQueue: this.maxQueue,
      timeAvgQueue: clock > 0 ? areaQueue / clock : 0,
      timeAvgSystem: clock > 0 ? (areaQueue + areaBusy) / clock : 0,
      observedArrivalRate: clock > 0 ? this.vehicles.length / Math.min(clock, this.config.horizonMin) : 0,
    };
  }
}
