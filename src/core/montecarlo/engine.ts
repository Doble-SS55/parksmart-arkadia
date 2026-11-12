import { poisson } from '../random/distributions';
import { createRng, type GeneratorKind, type Rng } from '../random/rng';
import { mean, summarize, type Summary } from '../stats';
import type { FlowId } from '../types';

/**
 * Montecarlo de demanda vehicular por intervalos.
 *
 * Para cada simulación y cada intervalo i, el número de llegadas de un flujo es
 *   N_i ~ Poisson(λ_i),  λ_i = base_i · factor · (1 + A·sen(iπ/P)) · b_i
 * donde base_i es el conteo observado del intervalo, factor el cambio de demanda
 * configurado, A la amplitud de la variación temporal, P el semiperiodo (en
 * intervalos) y b_i = f con probabilidad q (evento de baja actividad) o 1 en otro caso.
 *
 * Si se configura una capacidad de atención (vehículos por intervalo y por flujo),
 * los vehículos que no alcanzan a ser atendidos pasan al siguiente intervalo como
 * fila pendiente: nunca desaparecen del balance.
 */
export interface MonteCarloFlowInput {
  flow: FlowId;
  /** Conteos base por intervalo (normalmente del viernes observado). */
  base: number[];
}

export interface MonteCarloConfig {
  flows: MonteCarloFlowInput[];
  intervalMinutes: number;
  /** Multiplicador de demanda: 1.25 = +25 %. */
  demandFactor: number;
  simulations: number;
  seed: number;
  generator: GeneratorKind;
  /** Amplitud A de la variación senoidal (0 = sin variación). */
  temporalAmplitude: number;
  /** Semiperiodo P de la variación, en intervalos. */
  temporalHalfPeriod: number;
  /** Probabilidad q de un evento de baja actividad en un intervalo. */
  lowActivityProbability: number;
  /** Factor f que multiplica λ durante un evento de baja actividad. */
  lowActivityFactor: number;
  /** Intervalos adicionales extrapolados con la media de los últimos `extrapolationWindow`. */
  extraIntervals: number;
  extrapolationWindow: number;
  /** Capacidad de atención por intervalo y por flujo (vehículos). null = sin restricción. */
  capacityPerInterval: number | null;
  /** Umbral de demanda total del periodo para estimar P(total > umbral). */
  totalThreshold: number | null;
  /** Umbral de llegadas en un solo intervalo para estimar P(algún intervalo > umbral). */
  intervalThreshold: number | null;
}

export const DEFAULT_MC_CONFIG: Omit<MonteCarloConfig, 'flows'> = {
  intervalMinutes: 5,
  demandFactor: 1.2,
  simulations: 1000,
  seed: 20261107,
  generator: 'mt19937',
  temporalAmplitude: 0.1,
  temporalHalfPeriod: 12,
  lowActivityProbability: 0.045,
  lowActivityFactor: 0.18,
  extraIntervals: 0,
  extrapolationWindow: 6,
  capacityPerInterval: null,
  totalThreshold: null,
  intervalThreshold: null,
};

export function validateMonteCarloConfig(c: MonteCarloConfig): string[] {
  const e: string[] = [];
  if (!c.flows.length) e.push('Seleccione al menos un flujo.');
  for (const f of c.flows) {
    if (!f.base.length) e.push(`El flujo ${f.flow} no tiene registros base.`);
    if (f.base.some((v) => !Number.isFinite(v) || v < 0)) e.push(`El flujo ${f.flow} tiene conteos inválidos.`);
  }
  if (!(c.demandFactor >= 0) || !Number.isFinite(c.demandFactor)) e.push('El factor de demanda debe ser un número ≥ 0.');
  if (!Number.isInteger(c.simulations) || c.simulations < 1) e.push('El número de simulaciones debe ser un entero ≥ 1.');
  if (c.simulations > 50000) e.push('Máximo 50.000 simulaciones.');
  if (!Number.isFinite(c.seed) || c.seed < 0 || !Number.isInteger(c.seed)) e.push('La semilla debe ser un entero ≥ 0.');
  if (!(c.temporalAmplitude >= 0 && c.temporalAmplitude < 1)) e.push('La amplitud temporal debe estar entre 0 y 0,99.');
  if (!(c.temporalHalfPeriod > 0)) e.push('El semiperiodo de la variación debe ser > 0.');
  if (!(c.lowActivityProbability >= 0 && c.lowActivityProbability <= 1)) e.push('La probabilidad de baja actividad debe estar entre 0 y 1.');
  if (!(c.lowActivityFactor >= 0 && c.lowActivityFactor <= 1)) e.push('El factor de baja actividad debe estar entre 0 y 1.');
  if (!Number.isInteger(c.extraIntervals) || c.extraIntervals < 0 || c.extraIntervals > 288) e.push('Intervalos adicionales: entero entre 0 y 288.');
  if (c.extraIntervals > 0 && (!Number.isInteger(c.extrapolationWindow) || c.extrapolationWindow < 1)) e.push('La ventana de extrapolación debe ser un entero ≥ 1.');
  if (c.capacityPerInterval !== null && !(c.capacityPerInterval > 0)) e.push('La capacidad por intervalo debe ser > 0 o quedar vacía.');
  return e;
}

/** Serie base extendida con intervalos extrapolados (como hace el notebook). */
export function extendBase(base: number[], extra: number, window: number): number[] {
  if (extra <= 0 || base.length === 0) return base.slice();
  const tail = base.slice(Math.max(0, base.length - window));
  const m = mean(tail);
  return [...base, ...Array.from({ length: extra }, () => m)];
}

export interface CapacityStats {
  capacityPerInterval: number;
  meanServed: number;
  /** Fila pendiente al final del periodo (todos los flujos sumados). */
  pendingEnd: Summary;
  probPendingAtEnd: number;
  /** Máximo de vehículos pendientes durante el periodo, por simulación. */
  maxPending: Summary;
  /** Fracción de intervalos en que la demanda superó la capacidad. */
  overloadedIntervalShare: number;
}

export interface Trajectory {
  flow: FlowId;
  lambdas: number[];
  arrivals: number[];
  served: number[];
  pending: number[];
  lowActivity: boolean[];
}

export interface MonteCarloResult {
  config: MonteCarloConfig;
  intervals: number;
  /** Total esperado sin ruido (Σ base·factor) de los flujos elegidos. */
  baseTotal: number;
  /** Total observado en la base (sin factor ni extrapolación). */
  observedTotal: number;
  totals: Float64Array;
  totalStats: Summary;
  /** Intervalo de confianza 95 % para la media del total. */
  meanCi95: [number, number];
  perInterval: { mean: number[]; p5: number[]; p95: number[]; max: number[] };
  perFlow: Record<string, Summary>;
  probTotalExceeds: number | null;
  probAnyIntervalExceeds: number | null;
  capacity: CapacityStats | null;
  /** Trayectoria completa de la simulación 1 (para generar registros sintéticos). */
  sampleTrajectories: Trajectory[];
  elapsedMs: number;
}

/**
 * Ejecutor por lotes: permite correr miles de simulaciones sin congelar la
 * interfaz (la pantalla llama `runBatch` en varios ciclos). El resultado no
 * depende del tamaño de los lotes porque las simulaciones son secuenciales.
 */
export class MonteCarloRunner {
  readonly config: MonteCarloConfig;
  private rng: Rng;
  private bases: number[][];
  private done = 0;
  private totals: Float64Array;
  private intervalSamples: Float64Array[];
  private flowTotals: Float64Array[];
  private exceedTotal = 0;
  private exceedInterval = 0;
  private servedSum = 0;
  private pendingEnd: Float64Array;
  private maxPending: Float64Array;
  private overloaded = 0;
  private trajectories: Trajectory[] = [];
  private started = Date.now();
  readonly intervals: number;

  constructor(config: MonteCarloConfig) {
    const errors = validateMonteCarloConfig(config);
    if (errors.length) throw new Error(errors.join(' '));
    this.config = config;
    this.rng = createRng(config.generator, config.seed);
    this.bases = config.flows.map((f) => extendBase(f.base, config.extraIntervals, config.extrapolationWindow));
    this.intervals = Math.max(...this.bases.map((b) => b.length));
    const n = config.simulations;
    this.totals = new Float64Array(n);
    this.intervalSamples = Array.from({ length: this.intervals }, () => new Float64Array(n));
    this.flowTotals = config.flows.map(() => new Float64Array(n));
    this.pendingEnd = new Float64Array(n);
    this.maxPending = new Float64Array(n);
  }

  get completed(): number {
    return this.done;
  }

  get finished(): boolean {
    return this.done >= this.config.simulations;
  }

  runBatch(size: number): number {
    const c = this.config;
    const end = Math.min(c.simulations, this.done + size);
    const cap = c.capacityPerInterval;
    for (let sim = this.done; sim < end; sim++) {
      let total = 0;
      let anyExceed = false;
      let maxPend = 0;
      let pendEndAll = 0;
      const recordTrajectory = sim === 0;
      const pending = new Float64Array(this.bases.length);
      const intervalSums = new Float64Array(this.intervals);
      const pendingByInterval = new Float64Array(this.intervals);
      for (let f = 0; f < this.bases.length; f++) {
        const base = this.bases[f];
        const traj: Trajectory | null = recordTrajectory
          ? { flow: c.flows[f].flow, lambdas: [], arrivals: [], served: [], pending: [], lowActivity: [] }
          : null;
        let flowTotal = 0;
        for (let i = 0; i < base.length; i++) {
          let lambda = base[i] * c.demandFactor * (1 + c.temporalAmplitude * Math.sin((i * Math.PI) / c.temporalHalfPeriod));
          const low = c.lowActivityProbability > 0 && this.rng.next() < c.lowActivityProbability;
          if (low) lambda *= c.lowActivityFactor;
          const arrivals = poisson(this.rng, lambda);
          flowTotal += arrivals;
          intervalSums[i] += arrivals;
          let served = arrivals;
          if (cap !== null) {
            const demand = pending[f] + arrivals;
            if (demand > cap) this.overloaded++;
            served = Math.min(demand, cap);
            pending[f] = demand - served;
            pendingByInterval[i] += pending[f];
            this.servedSum += served;
          }
          if (traj) {
            traj.lambdas.push(lambda);
            traj.arrivals.push(arrivals);
            traj.served.push(served);
            traj.pending.push(pending[f]);
            traj.lowActivity.push(low);
          }
        }
        this.flowTotals[f][sim] = flowTotal;
        total += flowTotal;
        if (traj) this.trajectories.push(traj);
      }
      if (cap !== null) {
        pendEndAll = pending.reduce((a, b) => a + b, 0);
        for (let i = 0; i < this.intervals; i++) if (pendingByInterval[i] > maxPend) maxPend = pendingByInterval[i];
      }
      for (let i = 0; i < this.intervals; i++) {
        this.intervalSamples[i][sim] = intervalSums[i];
        if (c.intervalThreshold !== null && intervalSums[i] > c.intervalThreshold) anyExceed = true;
      }
      this.totals[sim] = total;
      if (c.totalThreshold !== null && total > c.totalThreshold) this.exceedTotal++;
      if (anyExceed) this.exceedInterval++;
      this.pendingEnd[sim] = pendEndAll;
      this.maxPending[sim] = maxPend;
    }
    this.done = end;
    return this.done;
  }

  result(): MonteCarloResult {
    if (!this.finished) throw new Error('La simulación no ha terminado.');
    const c = this.config;
    const n = c.simulations;
    const totalStats = summarize(this.totals);
    const half = n > 1 ? (1.96 * totalStats.sd) / Math.sqrt(n) : 0;
    const perInterval = { mean: [] as number[], p5: [] as number[], p95: [] as number[], max: [] as number[] };
    for (let i = 0; i < this.intervals; i++) {
      const s = summarize(this.intervalSamples[i]);
      perInterval.mean.push(s.mean);
      perInterval.p5.push(s.p5);
      perInterval.p95.push(s.p95);
      perInterval.max.push(s.max);
    }
    const perFlow: Record<string, Summary> = {};
    c.flows.forEach((f, idx) => (perFlow[f.flow] = summarize(this.flowTotals[idx])));
    const baseTotal = this.bases.reduce((acc, b) => acc + b.reduce((x, y) => x + y, 0), 0) * c.demandFactor;
    const observedTotal = c.flows.reduce((acc, f) => acc + f.base.reduce((x, y) => x + y, 0), 0);
    let capacity: CapacityStats | null = null;
    if (c.capacityPerInterval !== null) {
      capacity = {
        capacityPerInterval: c.capacityPerInterval,
        meanServed: this.servedSum / n,
        pendingEnd: summarize(this.pendingEnd),
        probPendingAtEnd: this.pendingEnd.filter((v) => v > 0).length / n,
        maxPending: summarize(this.maxPending),
        overloadedIntervalShare: this.overloaded / (n * this.bases.reduce((a, b) => a + b.length, 0)),
      };
    }
    return {
      config: c,
      intervals: this.intervals,
      baseTotal,
      observedTotal,
      totals: this.totals,
      totalStats,
      meanCi95: [totalStats.mean - half, totalStats.mean + half],
      perInterval,
      perFlow,
      probTotalExceeds: c.totalThreshold !== null ? this.exceedTotal / n : null,
      probAnyIntervalExceeds: c.intervalThreshold !== null ? this.exceedInterval / n : null,
      capacity,
      sampleTrajectories: this.trajectories,
      elapsedMs: Date.now() - this.started,
    };
  }
}

export function runMonteCarlo(config: MonteCarloConfig): MonteCarloResult {
  const runner = new MonteCarloRunner(config);
  runner.runBatch(config.simulations);
  return runner.result();
}

/** Ejecuta por lotes cediendo el control al navegador entre lotes. */
export async function runMonteCarloAsync(
  config: MonteCarloConfig,
  onProgress?: (done: number, total: number) => void,
  batchSize = 250,
): Promise<MonteCarloResult> {
  const runner = new MonteCarloRunner(config);
  while (!runner.finished) {
    runner.runBatch(batchSize);
    onProgress?.(runner.completed, config.simulations);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return runner.result();
}
