import {
  saturationRisk,
  serviceRateFromSeconds,
  solveQueue,
  type QueueResult,
  type SaturationRisk,
} from '../queueing/queueing';
import { ACCESS_LABEL, type AccessId } from '../types';

/**
 * Comparador de escenarios para las barreras de ENTRADA.
 * Cada acceso se modela como un sistema M/M/s independiente (no comparten fila).
 * Se evalúa la demanda promedio del periodo y la del intervalo pico.
 */

export interface AccessDemand {
  /** λ promedio del periodo (veh/min). */
  avg: number;
  /** λ del intervalo de 5 min con más llegadas (veh/min). */
  peak: number;
}

export interface ScenarioInput {
  id: string;
  name: string;
  description: string;
  /** Procedencia de la demanda base. */
  source: 'observado' | 'simulado';
  demand: Record<AccessId, AccessDemand>;
  servers: Record<AccessId, number>;
  existingServers: Record<AccessId, number>;
  serviceSeconds: number;
  /** Supuestos hipotéticos del escenario (se muestran siempre). */
  hypotheses: string[];
}

export interface ScenarioAccessResult {
  access: AccessId;
  lambda: number;
  peakLambda: number;
  servers: number;
  existingServers: number;
  /** Barreras que no existen hoy y que el escenario supone. */
  hypotheticalServers: number;
  mu: number;
  /** Capacidad máxima de atención en veh/h. */
  capacityPerHour: number;
  avg: QueueResult;
  peak: QueueResult;
  risk: SaturationRisk;
  peakRisk: SaturationRisk;
}

export interface ScenarioResult {
  input: ScenarioInput;
  perAccess: Record<AccessId, ScenarioAccessResult>;
  /** Peor riesgo entre accesos considerando el pico. */
  worstRisk: SaturationRisk;
}

const RISK_ORDER: SaturationRisk[] = ['bajo', 'moderado', 'alto', 'critico'];

export function evaluateScenario(input: ScenarioInput): ScenarioResult {
  const mu = serviceRateFromSeconds(input.serviceSeconds);
  const perAccess = {} as Record<AccessId, ScenarioAccessResult>;
  let worst: SaturationRisk = 'bajo';
  for (const access of ['C70', 'C80'] as AccessId[]) {
    const s = input.servers[access];
    const model = s === 1 ? 'MM1' : 'MMS';
    const avg = solveQueue({ model, lambda: input.demand[access].avg, mu, servers: s });
    const peak = solveQueue({ model, lambda: input.demand[access].peak, mu, servers: s });
    const rhoOf = (r: QueueResult) => (r.status === 'invalid' ? Infinity : r.rho);
    const risk = saturationRisk(rhoOf(avg));
    const peakRisk = saturationRisk(rhoOf(peak));
    if (RISK_ORDER.indexOf(peakRisk) > RISK_ORDER.indexOf(worst)) worst = peakRisk;
    perAccess[access] = {
      access,
      lambda: input.demand[access].avg,
      peakLambda: input.demand[access].peak,
      servers: s,
      existingServers: input.existingServers[access],
      hypotheticalServers: Math.max(0, s - input.existingServers[access]),
      mu,
      capacityPerHour: s * mu * 60,
      avg,
      peak,
      risk,
      peakRisk,
    };
  }
  return { input, perAccess, worstRisk: worst };
}

export interface MetricDiff {
  base: number | null;
  value: number | null;
  absolute: number | null;
  percent: number | null;
}

export function diff(base: number | null, value: number | null): MetricDiff {
  if (base === null || value === null || !Number.isFinite(base) || !Number.isFinite(value)) {
    return { base, value, absolute: null, percent: null };
  }
  return { base, value, absolute: value - base, percent: base !== 0 ? ((value - base) / base) * 100 : null };
}

/** Espera promedio en fila en segundos (null si no hay equilibrio). */
export function waitSeconds(r: QueueResult): number | null {
  return r.status === 'stable' ? r.wq * 60 : null;
}

export function rhoOf(r: QueueResult): number | null {
  return r.status === 'invalid' ? null : r.rho;
}

export function lqOf(r: QueueResult): number | null {
  return r.status === 'stable' ? r.lq : null;
}

export interface PresetOptions {
  friday: Record<AccessId, AccessDemand>;
  saturday: Record<AccessId, AccessDemand> | null;
  existingServers: Record<AccessId, number>;
  serviceSeconds: number;
  /** Fuente del tiempo de servicio para etiquetar supuestos. */
  serviceIsApproximate: boolean;
  demandIncreases: number[];
  serviceReduction: number;
  /** Fracción de las entradas de la 80 que pasan a la 70. */
  redistribution: number;
}

const scale = (d: Record<AccessId, AccessDemand>, f: number): Record<AccessId, AccessDemand> => ({
  C70: { avg: d.C70.avg * f, peak: d.C70.peak * f },
  C80: { avg: d.C80.avg * f, peak: d.C80.peak * f },
});

const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Construye el conjunto estándar de escenarios a comparar. */
export function buildPresetScenarios(o: PresetOptions): ScenarioInput[] {
  const ex = o.existingServers;
  const serviceNote = o.serviceIsApproximate
    ? `Tiempo de servicio ${o.serviceSeconds} s (aproximación de campo, por confirmar).`
    : `Tiempo de servicio ${o.serviceSeconds} s.`;
  const common = { existingServers: ex, serviceSeconds: o.serviceSeconds };
  const list: ScenarioInput[] = [
    {
      id: 'viernes', name: 'Viernes observado', source: 'observado', servers: { ...ex }, ...common,
      description: 'Demanda medida en campo con las barreras existentes.', demand: o.friday, hypotheses: [serviceNote],
    },
  ];
  if (o.saturday) {
    list.push({
      id: 'sabado', name: 'Sábado simulado', source: 'simulado', servers: { ...ex }, ...common,
      description: 'Demanda sintética del notebook Montecarlo (no medida).', demand: o.saturday,
      hypotheses: [serviceNote, 'La demanda del sábado es simulada a partir del viernes con aumentos supuestos.'],
    });
  }
  for (const s of [1, 2, 3]) {
    const same = s === ex.C70 && s === ex.C80;
    list.push({
      id: `barreras-${s}`, name: `${s} barrera${s > 1 ? 's' : ''} por acceso`, source: 'observado',
      servers: { C70: s, C80: s }, ...common, demand: o.friday,
      description: same ? 'Coincide con la configuración existente.' : 'Demanda del viernes con otro número de barreras.',
      hypotheses: [
        serviceNote,
        ...(['C70', 'C80'] as AccessId[])
          .filter((a) => s !== ex[a])
          .map((a) => (s > ex[a]
            ? `${ACCESS_LABEL[a]}: ${s - ex[a]} barrera(s) HIPOTÉTICA(S) que hoy no existe(n).`
            : `${ACCESS_LABEL[a]}: se supone ${ex[a] - s} barrera(s) menos de las existentes.`)),
      ],
    });
  }
  for (const inc of o.demandIncreases) {
    list.push({
      id: `demanda-${inc}`, name: `Demanda +${pct(inc)}`, source: 'observado', servers: { ...ex }, ...common,
      demand: scale(o.friday, 1 + inc), description: `Viernes con ${pct(inc)} más vehículos en ambos accesos.`,
      hypotheses: [serviceNote, `Incremento de demanda hipotético de ${pct(inc)}.`],
    });
  }
  if (o.serviceReduction > 0) {
    const t = +(o.serviceSeconds * (1 - o.serviceReduction)).toFixed(2);
    list.push({
      id: 'servicio', name: `Atención −${pct(o.serviceReduction)}`, source: 'observado', servers: { ...ex },
      existingServers: ex, serviceSeconds: t, demand: o.friday,
      description: `Tiempo de atención de ${o.serviceSeconds} s a ${t} s (p. ej. lectura automática de placas).`,
      hypotheses: [`Reducción hipotética del tiempo de atención a ${t} s; no implementada en Arkadia.`],
    });
  }
  if (o.redistribution > 0) {
    const moved = { avg: o.friday.C80.avg * o.redistribution, peak: o.friday.C80.peak * o.redistribution };
    list.push({
      id: 'redistribucion', name: `${pct(o.redistribution)} de la 80 → 70`, source: 'observado', servers: { ...ex }, ...common,
      demand: {
        C70: { avg: o.friday.C70.avg + moved.avg, peak: o.friday.C70.peak + moved.peak },
        C80: { avg: o.friday.C80.avg - moved.avg, peak: o.friday.C80.peak - moved.peak },
      },
      description: 'Parte de los conductores de la 80 usa la entrada de la 70 (señalización o información en vía).',
      hypotheses: [serviceNote, `Redistribución hipotética: ${pct(o.redistribution)} de las entradas de la 80 pasan a la 70; los picos se suponen simultáneos.`],
    });
  }
  return list;
}
