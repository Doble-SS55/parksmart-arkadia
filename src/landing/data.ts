/**
 * Cifras de la landing. Todo se calcula aquí con el mismo motor de la aplicación,
 * a partir de los datos semilla (viernes observado y sábado simulado).
 * No hay resultados escritos a mano.
 */
import { buildFlowSeries, estimateArrivalRate, summarizeSeries } from '../core/data/aggregate';
import { runMonteCarlo, DEFAULT_MC_CONFIG } from '../core/montecarlo/engine';
import { reproduceNotebookSaturday } from '../core/montecarlo/notebookReference';
import { dispersionTest } from '../core/queueing/poissonCheck';
import { serviceRateFromSeconds, solveQueue, type QueueResult } from '../core/queueing/queueing';
import { buildPresetScenarios, evaluateScenario, waitSeconds } from '../core/scenarios/compare';
import { FLOW_IDS, type AccessId } from '../core/types';
import { FRIDAY_OBSERVED, SATURDAY_SIMULATED } from '../data/seed';
import { DEFAULT_SERVER_CONFIGS, seedRowsToRecords } from '../db/seed';

const fridaySeries = buildFlowSeries(seedRowsToRecords(FRIDAY_OBSERVED, 0, '2026-11-06', 'observado', null));
const saturdaySeries = buildFlowSeries(seedRowsToRecords(SATURDAY_SIMULATED, 0, '2026-11-07', 'simulado', null));
export const friday = { series: fridaySeries, summary: summarizeSeries(fridaySeries) };
export const saturday = { series: saturdaySeries, summary: summarizeSeries(saturdaySeries) };

const entry = DEFAULT_SERVER_CONFIGS.find((c) => c.access === 'C80' && c.direction === 'entrada')!;
export const SERVERS = entry.existingServers;
export const SERVICE_S = entry.meanServiceSeconds;
export const SERVICE_RANGE = [entry.serviceMinSeconds ?? SERVICE_S, entry.serviceMaxSeconds ?? SERVICE_S] as const;
const MU = serviceRateFromSeconds(SERVICE_S);

const demand = (series: typeof fridaySeries, access: AccessId) => estimateArrivalRate(series, access === 'C70' ? 'E70' : 'E80');

export const lambdas = {
  friday: { C70: demand(fridaySeries, 'C70'), C80: demand(fridaySeries, 'C80') },
  saturday: { C70: demand(saturdaySeries, 'C70'), C80: demand(saturdaySeries, 'C80') },
};

const mms = (lambda: number, servers: number, serviceSeconds = SERVICE_S): QueueResult =>
  solveQueue({ model: servers === 1 ? 'MM1' : 'MMS', lambda, mu: serviceRateFromSeconds(serviceSeconds), servers });

/** Teoría de colas con los parámetros del estudio (2 barreras, 5 s). */
export const queues = (['C70', 'C80'] as AccessId[]).map((access) => ({
  access,
  fridayAvg: mms(lambdas.friday[access].lambdaPerMin, SERVERS),
  fridayPeak: mms(lambdas.friday[access].peakLambdaPerMin, SERVERS),
  saturdayPeak: mms(lambdas.saturday[access].peakLambdaPerMin, SERVERS),
}));

export const dispersion = {
  E70: dispersionTest(fridaySeries.values.E70),
  E80: dispersionTest(fridaySeries.values.E80),
};

/** El notebook de Colab se reproduce con el motor de la app y se compara con el CSV entregado. */
export const notebookCheck = (() => {
  const matrix = fridaySeries.starts.map((_, i) => FLOW_IDS.map((f) => fridaySeries.values[f][i]));
  const nb = reproduceNotebookSaturday(matrix);
  let matches = 0;
  nb.rows.forEach((row, i) => FLOW_IDS.forEach((f, j) => (matches += saturdaySeries.values[f][i] === row.values[j] ? 1 : 0)));
  return { matches, total: nb.rows.length * 4, truncations: nb.truncations.length };
})();

/** Escenarios estándar del comparador. */
export const scenarios = buildPresetScenarios({
  friday: { C70: { avg: lambdas.friday.C70.lambdaPerMin, peak: lambdas.friday.C70.peakLambdaPerMin }, C80: { avg: lambdas.friday.C80.lambdaPerMin, peak: lambdas.friday.C80.peakLambdaPerMin } },
  saturday: { C70: { avg: lambdas.saturday.C70.lambdaPerMin, peak: lambdas.saturday.C70.peakLambdaPerMin }, C80: { avg: lambdas.saturday.C80.lambdaPerMin, peak: lambdas.saturday.C80.peakLambdaPerMin } },
  existingServers: { C70: SERVERS, C80: SERVERS },
  serviceSeconds: SERVICE_S,
  serviceIsApproximate: true,
  demandIncreases: [0.1, 0.25],
  serviceReduction: 0.2,
  redistribution: 0.2,
}).map(evaluateScenario);

/**
 * Sensibilidad al ciclo de atención: el dato que falta confirmar en campo.
 * Para la carrera 80 en el pico del viernes y del sábado simulado.
 */
export const CYCLES = [5, 8, 12, 15];
export const cycleSensitivity = CYCLES.map((t) => ({
  seconds: t,
  fridayPeak: mms(lambdas.friday.C80.peakLambdaPerMin, SERVERS, t),
  saturdayPeak: mms(lambdas.saturday.C80.peakLambdaPerMin, SERVERS, t),
  saturdayPeakOne: mms(lambdas.saturday.C80.peakLambdaPerMin, 1, t),
}));

/** Ciclo máximo que mantiene la utilización del pico por debajo de 0,85 (umbral de riesgo alto). */
export const maxCycleSeconds = (lambdaPerMin: number, servers: number, rho = 0.85) => (rho * servers * 60) / lambdaPerMin;
export const cycleLimit = {
  friday: maxCycleSeconds(lambdas.friday.C80.peakLambdaPerMin, SERVERS),
  saturday: maxCycleSeconds(lambdas.saturday.C80.peakLambdaPerMin, SERVERS),
  saturdayOneBarrier: maxCycleSeconds(lambdas.saturday.C80.peakLambdaPerMin, 1),
};

/** Capacidad horaria frente a la demanda pico (veh/h). */
export const capacity = {
  perBarrierPerHour: MU * 60,
  accessPerHour: MU * 60 * SERVERS,
  peakFridayC80PerHour: lambdas.friday.C80.peakLambdaPerMin * 60,
  peakSaturdayC80PerHour: lambdas.saturday.C80.peakLambdaPerMin * 60,
};

/** Vehículos-minuto de espera acumulados en la carrera 80 durante las dos horas, con la demanda promedio. */
export function totalWaitMinutes(r: QueueResult, lambdaPerMin: number, minutes: number): number | null {
  return r.status === 'stable' ? lambdaPerMin * minutes * r.wq : null;
}

/**
 * Montecarlo de robustez para la carrera 80: demanda del viernes +25 % (como el sábado),
 * 1.000 simulaciones con semilla fija, y la capacidad por intervalo de cada configuración.
 */
export function robustness() {
  const base = fridaySeries.values.E80;
  const step = fridaySeries.intervalMinutes;
  const run = (servers: number, seconds: number) => {
    const cap = servers * serviceRateFromSeconds(seconds) * step;
    const r = runMonteCarlo({
      ...DEFAULT_MC_CONFIG,
      flows: [{ flow: 'E80', base }],
      demandFactor: 1.25,
      simulations: 1000,
      seed: 20261107,
      capacityPerInterval: cap,
    });
    return {
      servers,
      seconds,
      capacityPerInterval: cap,
      probPending: r.capacity!.probPendingAtEnd,
      overloadedShare: r.capacity!.overloadedIntervalShare,
      maxQueueP95: r.capacity!.maxPending.p95,
      meanTotal: r.totalStats.mean,
    };
  };
  return [run(2, SERVICE_S), run(2, 12), run(1, 12), run(1, 15)];
}

export { waitSeconds };

/** Cuántas veces cabe la demanda pico en la capacidad de un acceso antes de llegar a ρ = 0,85. */
export const headroom = {
  friday: (0.85 * capacity.accessPerHour) / capacity.peakFridayC80PerHour,
  saturday: (0.85 * capacity.accessPerHour) / capacity.peakSaturdayC80PerHour,
};

/** Desviar el 20 % de la demanda de la 80 hacia la 70, en el pico del sábado y con un ciclo de 12 s. */
export const redistributionAt12 = (() => {
  const shift = 0.2 * lambdas.saturday.C80.peakLambdaPerMin;
  return {
    seconds: 12,
    before: { C70: mms(lambdas.saturday.C70.peakLambdaPerMin, SERVERS, 12), C80: mms(lambdas.saturday.C80.peakLambdaPerMin, SERVERS, 12) },
    after: { C70: mms(lambdas.saturday.C70.peakLambdaPerMin + shift, SERVERS, 12), C80: mms(lambdas.saturday.C80.peakLambdaPerMin - shift, SERVERS, 12) },
  };
})();

/** Primeros intervalos del conteo del viernes, tal como quedaron registrados. */
export const fridaySample = fridaySeries.starts.slice(0, 6).map((start, i) => ({
  start,
  end: fridaySeries.ends[i],
  values: FLOW_IDS.map((f) => fridaySeries.values[f][i]),
}));

export const mmsFor = mms;
