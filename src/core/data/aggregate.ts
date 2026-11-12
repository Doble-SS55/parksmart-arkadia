import { parseHHMM } from '../time';
import { FLOW_IDS, flowId, type AccessId, type FlowId, type VehicleRecord } from '../types';

/** Serie alineada por intervalo para los cuatro flujos. */
export interface FlowSeries {
  /** Horas de inicio ordenadas (HH:MM). */
  starts: string[];
  ends: string[];
  values: Record<FlowId, number[]>;
  /** true si en ese intervalo faltó algún flujo. */
  incomplete: boolean[];
  intervalMinutes: number;
}

export function buildFlowSeries(records: Pick<VehicleRecord, 'startTime' | 'endTime' | 'access' | 'direction' | 'count'>[]): FlowSeries {
  const byStart = new Map<string, { end: string; values: Partial<Record<FlowId, number>> }>();
  for (const r of records) {
    const slot = byStart.get(r.startTime) ?? { end: r.endTime, values: {} };
    const id = flowId(r.access, r.direction);
    slot.values[id] = (slot.values[id] ?? 0) + r.count;
    byStart.set(r.startTime, slot);
  }
  const starts = [...byStart.keys()].sort((a, b) => (parseHHMM(a) ?? 0) - (parseHHMM(b) ?? 0));
  const values = { E70: [], S70: [], E80: [], S80: [] } as Record<FlowId, number[]>;
  const ends: string[] = [];
  const incomplete: boolean[] = [];
  for (const s of starts) {
    const slot = byStart.get(s)!;
    ends.push(slot.end);
    let missing = false;
    for (const f of FLOW_IDS) {
      const v = slot.values[f];
      if (v === undefined) missing = true;
      values[f].push(v ?? 0);
    }
    incomplete.push(missing);
  }
  let intervalMinutes = 5;
  if (starts.length) {
    const a = parseHHMM(starts[0]);
    const b = parseHHMM(ends[0]);
    if (a !== null && b !== null && b > a) intervalMinutes = b - a;
  }
  return { starts, ends, values, incomplete, intervalMinutes };
}

export interface IntervalExtreme {
  start: string;
  end: string;
  value: number;
}

export interface DatasetSummary {
  intervals: number;
  durationMinutes: number;
  firstStart: string | null;
  lastEnd: string | null;
  totalsByFlow: Record<FlowId, number>;
  totalEntries: number;
  totalExits: number;
  entriesByAccess: Record<AccessId, number>;
  exitsByAccess: Record<AccessId, number>;
  /** Entradas totales por minuto en el periodo. */
  entriesPerMinute: number;
  exitsPerMinute: number;
  /** Intervalo con más y menos entradas (ambos accesos). */
  peakEntries: IntervalExtreme | null;
  lowEntries: IntervalExtreme | null;
  /** Intervalo con más movimiento total (entradas + salidas). */
  peakTraffic: IntervalExtreme | null;
  lowTraffic: IntervalExtreme | null;
  peakByFlow: Record<FlowId, IntervalExtreme | null>;
  incompleteIntervals: number;
}

function extreme(series: FlowSeries, values: number[], pick: 'max' | 'min'): IntervalExtreme | null {
  if (!values.length) return null;
  let idx = 0;
  for (let i = 1; i < values.length; i++) {
    if (pick === 'max' ? values[i] > values[idx] : values[i] < values[idx]) idx = i;
  }
  return { start: series.starts[idx], end: series.ends[idx], value: values[idx] };
}

export function summarizeSeries(series: FlowSeries): DatasetSummary {
  const totalsByFlow = { E70: 0, S70: 0, E80: 0, S80: 0 } as Record<FlowId, number>;
  for (const f of FLOW_IDS) totalsByFlow[f] = series.values[f].reduce((a, b) => a + b, 0);
  const n = series.starts.length;
  const durationMinutes = n * series.intervalMinutes;
  const entries = series.starts.map((_, i) => series.values.E70[i] + series.values.E80[i]);
  const traffic = series.starts.map(
    (_, i) => entries[i] + series.values.S70[i] + series.values.S80[i],
  );
  const totalEntries = totalsByFlow.E70 + totalsByFlow.E80;
  const totalExits = totalsByFlow.S70 + totalsByFlow.S80;
  const peakByFlow = {} as Record<FlowId, IntervalExtreme | null>;
  for (const f of FLOW_IDS) peakByFlow[f] = extreme(series, series.values[f], 'max');
  return {
    intervals: n,
    durationMinutes,
    firstStart: n ? series.starts[0] : null,
    lastEnd: n ? series.ends[n - 1] : null,
    totalsByFlow,
    totalEntries,
    totalExits,
    entriesByAccess: { C70: totalsByFlow.E70, C80: totalsByFlow.E80 },
    exitsByAccess: { C70: totalsByFlow.S70, C80: totalsByFlow.S80 },
    entriesPerMinute: durationMinutes ? totalEntries / durationMinutes : 0,
    exitsPerMinute: durationMinutes ? totalExits / durationMinutes : 0,
    peakEntries: extreme(series, entries, 'max'),
    lowEntries: extreme(series, entries, 'min'),
    peakTraffic: extreme(series, traffic, 'max'),
    lowTraffic: extreme(series, traffic, 'min'),
    peakByFlow,
    incompleteIntervals: series.incomplete.filter(Boolean).length,
  };
}

/** Índices [inicio, fin) de los intervalos cuyo inicio está dentro del periodo pedido. */
export function periodIndices(series: FlowSeries, from: string | null, to: string | null): [number, number] {
  const fromMin = from ? parseHHMM(from) : null;
  const toMin = to ? parseHHMM(to) : null;
  let start = 0;
  let end = series.starts.length;
  if (fromMin !== null) {
    const i = series.starts.findIndex((s) => (parseHHMM(s) ?? 0) >= fromMin);
    start = i === -1 ? series.starts.length : i;
  }
  if (toMin !== null) {
    const i = series.ends.findIndex((e) => (parseHHMM(e) ?? 0) > toMin);
    end = i === -1 ? series.starts.length : i;
  }
  return [start, Math.max(start, end)];
}

export interface ArrivalEstimate {
  flow: FlowId;
  intervals: number;
  minutes: number;
  vehicles: number;
  /** λ promedio en veh/min. */
  lambdaPerMin: number;
  /** λ del intervalo pico, en veh/min. */
  peakLambdaPerMin: number;
  peakInterval: IntervalExtreme | null;
  counts: number[];
}

/** Estima la tasa de llegada de un flujo en un rango de intervalos. */
export function estimateArrivalRate(series: FlowSeries, flow: FlowId, range?: [number, number]): ArrivalEstimate {
  const [a, b] = range ?? [0, series.starts.length];
  const counts = series.values[flow].slice(a, b);
  const vehicles = counts.reduce((x, y) => x + y, 0);
  const minutes = counts.length * series.intervalMinutes;
  let peakIdx = -1;
  for (let i = 0; i < counts.length; i++) if (peakIdx === -1 || counts[i] > counts[peakIdx]) peakIdx = i;
  return {
    flow,
    intervals: counts.length,
    minutes,
    vehicles,
    lambdaPerMin: minutes ? vehicles / minutes : 0,
    peakLambdaPerMin: peakIdx >= 0 ? counts[peakIdx] / series.intervalMinutes : 0,
    peakInterval: peakIdx >= 0 ? { start: series.starts[a + peakIdx], end: series.ends[a + peakIdx], value: counts[peakIdx] } : null,
    counts,
  };
}
