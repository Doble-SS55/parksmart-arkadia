import { buildFlowSeries, estimateArrivalRate, summarizeSeries, type DatasetSummary, type FlowSeries } from '../core/data/aggregate';
import { toCsv } from '../core/importer/csv';
import type { NormalizeResult } from '../core/importer/normalize';
import type { MonteCarloResult } from '../core/montecarlo/engine';
import type { AccessDemand } from '../core/scenarios/compare';
import { addMinutesHHMM } from '../core/time';
import { flowKey, type AccessId, type Dataset, type NewVehicleRecord, type RecordOrigin, type VehicleRecord } from '../core/types';
import type { Db } from '../db/db';
import { DuplicateRecordError, datasetsRepo, recordsRepo } from '../db/repositories';

export function getSeries(db: Db, datasetId: number): FlowSeries {
  return buildFlowSeries(recordsRepo.list(db, { datasetId }));
}

export function getSummary(db: Db, datasetId: number): { series: FlowSeries; summary: DatasetSummary } {
  const series = getSeries(db, datasetId);
  return { series, summary: summarizeSeries(series) };
}

/** Demanda de entrada por acceso (promedio y pico), en veh/min. */
export function entryDemand(series: FlowSeries): Record<AccessId, AccessDemand> {
  const e70 = estimateArrivalRate(series, 'E70');
  const e80 = estimateArrivalRate(series, 'E80');
  return {
    C70: { avg: e70.lambdaPerMin, peak: e70.peakLambdaPerMin },
    C80: { avg: e80.lambdaPerMin, peak: e80.peakLambdaPerMin },
  };
}

export interface ImportMeta {
  name: string;
  date: string;
  kind: RecordOrigin;
  sourceFile: string;
  description?: string;
  referenceDatasetId?: number | null;
}

/** Guarda en un conjunto nuevo los registros válidos de una importación. */
export function saveImport(db: Db, meta: ImportMeta, normalized: NormalizeResult): number {
  if (!normalized.records.length) throw new Error('No hay registros válidos para importar.');
  if (normalized.issues.some((i) => i.level === 'error' && /duplicado/i.test(i.message))) {
    throw new DuplicateRecordError('El archivo tiene registros duplicados. Corríjalos antes de importar.');
  }
  return db.transaction(() => {
    const id = datasetsRepo.create(db, {
      name: meta.name,
      date: meta.date,
      kind: meta.kind,
      sourceFile: meta.sourceFile,
      description: meta.description ?? null,
      referenceDatasetId: meta.referenceDatasetId ?? null,
    });
    recordsRepo.insertMany(
      db,
      normalized.records.map((r) => ({ ...r, datasetId: id, origin: meta.kind })),
    );
    return id;
  });
}

/**
 * Crea un conjunto SIMULADO con la trayectoria de la simulación 1 de una
 * ejecución Montecarlo. Conserva la referencia al conjunto base y a la ejecución.
 */
export function saveSyntheticDataset(
  db: Db,
  opts: { name: string; date: string; base: Dataset; baseSeries: FlowSeries; result: MonteCarloResult; runId: number; startTime?: string },
): number {
  const { result, baseSeries } = opts;
  const step = baseSeries.intervalMinutes;
  const start = opts.startTime ?? baseSeries.starts[0] ?? '00:00';
  const simulationId = `MC-${opts.runId}`;
  return db.transaction(() => {
    const id = datasetsRepo.create(db, {
      name: opts.name,
      date: opts.date,
      kind: 'simulado',
      sourceFile: null,
      description:
        `DATOS SINTÉTICOS generados por Montecarlo (ejecución #${opts.runId}, semilla ${result.config.seed}, ` +
        `factor ${result.config.demandFactor}). Base: "${opts.base.name}".`,
      referenceDatasetId: opts.base.id,
      montecarloRunId: opts.runId,
      intervalMinutes: step,
    });
    const records: NewVehicleRecord[] = [];
    for (const t of result.sampleTrajectories) {
      const { access, direction } = flowKey(t.flow);
      t.arrivals.forEach((count, i) => {
        const s = addMinutesHHMM(start, i * step);
        records.push({
          datasetId: id, date: opts.date, startTime: s, endTime: addMinutesHHMM(s, step), access, direction, count,
          origin: 'simulado', simulationId, notes: t.lowActivity[i] ? 'Intervalo con evento de baja actividad' : null,
        });
      });
    }
    recordsRepo.insertMany(db, records);
    return id;
  });
}

export function recordsToCsv(records: VehicleRecord[], datasets: Dataset[]): string {
  const names = new Map(datasets.map((d) => [d.id, d.name]));
  return toCsv(
    ['id', 'conjunto', 'fecha', 'hora_inicio', 'hora_fin', 'acceso', 'direccion', 'cantidad', 'origen', 'id_simulacion', 'observaciones'],
    records.map((r) => [
      r.id, names.get(r.datasetId) ?? r.datasetId, r.date, r.startTime, r.endTime, r.access === 'C70' ? '70' : '80',
      r.direction, r.count, r.origin, r.simulationId ?? '', r.notes ?? '',
    ]),
  );
}
