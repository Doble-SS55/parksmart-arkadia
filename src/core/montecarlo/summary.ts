import type { Summary } from '../stats';
import type { CapacityStats, MonteCarloConfig, MonteCarloResult } from './engine';

export interface Histogram {
  edges: number[];
  counts: number[];
}

/** Histograma con anchos de clase enteros "bonitos" para conteos de vehículos. */
export function histogram(values: ArrayLike<number>, targetBins = 20): Histogram {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }
  if (!Number.isFinite(min)) return { edges: [0, 1], counts: [0] };
  const span = Math.max(1, max - min);
  const raw = span / targetBins;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const width = Math.max(1, Math.ceil(step));
  const start = Math.floor(min / width) * width;
  const nBins = Math.max(1, Math.floor((max - start) / width) + 1);
  const counts = new Array<number>(nBins).fill(0);
  for (let i = 0; i < values.length; i++) counts[Math.min(nBins - 1, Math.floor((values[i] - start) / width))]++;
  const edges = Array.from({ length: nBins + 1 }, (_, i) => start + i * width);
  return { edges, counts };
}

/** Versión compacta de un resultado Montecarlo para guardar en la base de datos. */
export interface StoredMonteCarloSummary {
  intervals: number;
  baseTotal: number;
  observedTotal: number;
  totalStats: Summary;
  meanCi95: [number, number];
  perInterval: MonteCarloResult['perInterval'];
  perFlow: Record<string, Summary>;
  probTotalExceeds: number | null;
  probAnyIntervalExceeds: number | null;
  capacity: CapacityStats | null;
  histogram: Histogram;
  elapsedMs: number;
}

export function toStoredSummary(r: MonteCarloResult): StoredMonteCarloSummary {
  return {
    intervals: r.intervals,
    baseTotal: r.baseTotal,
    observedTotal: r.observedTotal,
    totalStats: r.totalStats,
    meanCi95: r.meanCi95,
    perInterval: r.perInterval,
    perFlow: r.perFlow,
    probTotalExceeds: r.probTotalExceeds,
    probAnyIntervalExceeds: r.probAnyIntervalExceeds,
    capacity: r.capacity,
    histogram: histogram(r.totals),
    elapsedMs: r.elapsedMs,
  };
}

export type StoredMonteCarloParams = Omit<MonteCarloConfig, 'flows'> & { flows: { flow: string; baseTotal: number; intervals: number }[] };

export function toStoredParams(c: MonteCarloConfig): StoredMonteCarloParams {
  const { flows, ...rest } = c;
  return { ...rest, flows: flows.map((f) => ({ flow: f.flow, baseTotal: f.base.reduce((a, b) => a + b, 0), intervals: f.base.length })) };
}
