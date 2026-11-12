import type { StoredMonteCarloParams, StoredMonteCarloSummary } from '../core/montecarlo/summary';
import type { QueueModel, QueueResult } from '../core/queueing/queueing';
import type {
  AccessId,
  Dataset,
  Direction,
  FlowId,
  NewVehicleRecord,
  ParameterSource,
  RecordOrigin,
  ServerConfig,
  VehicleRecord,
} from '../core/types';
import type { Db, SqlParam } from './db';

/* ───────────────────────── Conjuntos de datos ───────────────────────── */

interface DatasetRow {
  id: number;
  name: string;
  date: string;
  kind: RecordOrigin;
  source_file: string | null;
  description: string | null;
  interval_minutes: number;
  reference_dataset_id: number | null;
  montecarlo_run_id: number | null;
  is_seed: number;
  created_at: string;
  record_count?: number;
}

const toDataset = (r: DatasetRow): Dataset => ({
  id: r.id,
  name: r.name,
  date: r.date,
  kind: r.kind,
  sourceFile: r.source_file,
  description: r.description,
  intervalMinutes: r.interval_minutes,
  referenceDatasetId: r.reference_dataset_id,
  montecarloRunId: r.montecarlo_run_id,
  isSeed: !!r.is_seed,
  createdAt: r.created_at,
  recordCount: r.record_count,
});

export interface NewDataset {
  name: string;
  date: string;
  kind: RecordOrigin;
  sourceFile?: string | null;
  description?: string | null;
  intervalMinutes?: number;
  referenceDatasetId?: number | null;
  montecarloRunId?: number | null;
  isSeed?: boolean;
}

export const datasetsRepo = {
  list(db: Db): Dataset[] {
    return db
      .all<DatasetRow>(
        `SELECT d.*, (SELECT COUNT(*) FROM vehicle_records r WHERE r.dataset_id = d.id) AS record_count
         FROM datasets d ORDER BY d.is_seed DESC, d.date, d.id`,
      )
      .map(toDataset);
  },
  get(db: Db, id: number): Dataset | null {
    const r = db.first<DatasetRow>(
      `SELECT d.*, (SELECT COUNT(*) FROM vehicle_records r WHERE r.dataset_id = d.id) AS record_count FROM datasets d WHERE id = ?`,
      [id],
    );
    return r ? toDataset(r) : null;
  },
  create(db: Db, d: NewDataset): number {
    return db.run(
      `INSERT INTO datasets (name, date, kind, source_file, description, interval_minutes, reference_dataset_id, montecarlo_run_id, is_seed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.name, d.date, d.kind, d.sourceFile ?? null, d.description ?? null, d.intervalMinutes ?? 5,
        d.referenceDatasetId ?? null, d.montecarloRunId ?? null, d.isSeed ? 1 : 0],
    ).lastInsertRowId;
  },
  rename(db: Db, id: number, name: string, description: string | null): void {
    db.run('UPDATE datasets SET name = ?, description = ? WHERE id = ?', [name, description, id]);
  },
  remove(db: Db, id: number): void {
    db.run('DELETE FROM datasets WHERE id = ?', [id]);
  },
};

/* ───────────────────────── Registros vehiculares ───────────────────────── */

interface RecordRow {
  id: number;
  dataset_id: number;
  date: string;
  start_time: string;
  end_time: string;
  access_id: AccessId;
  direction: Direction;
  count: number;
  origin: RecordOrigin;
  simulation_id: string | null;
  notes: string | null;
}

const toRecord = (r: RecordRow): VehicleRecord => ({
  id: r.id,
  datasetId: r.dataset_id,
  date: r.date,
  startTime: r.start_time,
  endTime: r.end_time,
  access: r.access_id,
  direction: r.direction,
  count: r.count,
  origin: r.origin,
  simulationId: r.simulation_id,
  notes: r.notes,
});

export interface RecordFilter {
  datasetId?: number;
  date?: string;
  access?: AccessId;
  direction?: Direction;
  origin?: RecordOrigin;
}

export class DuplicateRecordError extends Error {
  constructor(message = 'Ya existe un registro para ese conjunto, fecha, hora, acceso y dirección.') {
    super(message);
    this.name = 'DuplicateRecordError';
  }
}

function wrapUnique<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (String((e as Error)?.message ?? e).includes('UNIQUE')) throw new DuplicateRecordError();
    throw e;
  }
}

export const recordsRepo = {
  list(db: Db, f: RecordFilter = {}): VehicleRecord[] {
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (f.datasetId !== undefined) (where.push('dataset_id = ?'), params.push(f.datasetId));
    if (f.date) (where.push('date = ?'), params.push(f.date));
    if (f.access) (where.push('access_id = ?'), params.push(f.access));
    if (f.direction) (where.push('direction = ?'), params.push(f.direction));
    if (f.origin) (where.push('origin = ?'), params.push(f.origin));
    const sql = `SELECT * FROM vehicle_records ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY dataset_id, date, start_time, access_id, direction`;
    return db.all<RecordRow>(sql, params).map(toRecord);
  },
  get(db: Db, id: number): VehicleRecord | null {
    const r = db.first<RecordRow>('SELECT * FROM vehicle_records WHERE id = ?', [id]);
    return r ? toRecord(r) : null;
  },
  insert(db: Db, r: NewVehicleRecord): number {
    return wrapUnique(() =>
      db.run(
        `INSERT INTO vehicle_records (dataset_id, date, start_time, end_time, access_id, direction, count, origin, simulation_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.datasetId, r.date, r.startTime, r.endTime, r.access, r.direction, r.count, r.origin, r.simulationId, r.notes],
      ).lastInsertRowId,
    );
  },
  insertMany(db: Db, records: NewVehicleRecord[]): number {
    return db.transaction(() => {
      for (const r of records) recordsRepo.insert(db, r);
      return records.length;
    });
  },
  update(db: Db, id: number, r: NewVehicleRecord): void {
    wrapUnique(() =>
      db.run(
        `UPDATE vehicle_records SET dataset_id = ?, date = ?, start_time = ?, end_time = ?, access_id = ?, direction = ?,
           count = ?, origin = ?, simulation_id = ?, notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?`,
        [r.datasetId, r.date, r.startTime, r.endTime, r.access, r.direction, r.count, r.origin, r.simulationId, r.notes, id],
      ),
    );
  },
  remove(db: Db, id: number): void {
    db.run('DELETE FROM vehicle_records WHERE id = ?', [id]);
  },
};

/* ───────────────────────── Configuración de barreras ───────────────────────── */

interface ServerRow {
  access_id: AccessId;
  direction: Direction;
  existing_servers: number;
  servers_source: ParameterSource;
  mean_service_seconds: number;
  service_min_seconds: number | null;
  service_max_seconds: number | null;
  service_source: ParameterSource;
  notes: string | null;
}

export const serverConfigRepo = {
  list(db: Db): ServerConfig[] {
    return db.all<ServerRow>('SELECT * FROM server_configs ORDER BY access_id, direction').map((r) => ({
      access: r.access_id,
      direction: r.direction,
      existingServers: r.existing_servers,
      serversSource: r.servers_source,
      meanServiceSeconds: r.mean_service_seconds,
      serviceMinSeconds: r.service_min_seconds,
      serviceMaxSeconds: r.service_max_seconds,
      serviceSource: r.service_source,
      notes: r.notes,
    }));
  },
  get(db: Db, access: AccessId, direction: Direction): ServerConfig | null {
    return serverConfigRepo.list(db).find((c) => c.access === access && c.direction === direction) ?? null;
  },
  upsert(db: Db, c: ServerConfig): void {
    db.run(
      `INSERT INTO server_configs (access_id, direction, existing_servers, servers_source, mean_service_seconds,
         service_min_seconds, service_max_seconds, service_source, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (access_id, direction) DO UPDATE SET
         existing_servers = excluded.existing_servers, servers_source = excluded.servers_source,
         mean_service_seconds = excluded.mean_service_seconds, service_min_seconds = excluded.service_min_seconds,
         service_max_seconds = excluded.service_max_seconds, service_source = excluded.service_source,
         notes = excluded.notes, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      [c.access, c.direction, c.existingServers, c.serversSource, c.meanServiceSeconds,
        c.serviceMinSeconds, c.serviceMaxSeconds, c.serviceSource, c.notes],
    );
  },
};

/* ───────────────────────── Montecarlo ───────────────────────── */

export interface MonteCarloRunRecord {
  id: number;
  name: string;
  baseDatasetId: number | null;
  flows: FlowId[];
  seed: number;
  generator: string;
  simulations: number;
  params: StoredMonteCarloParams;
  summary: StoredMonteCarloSummary;
  createdAt: string;
}

interface McRow {
  id: number;
  name: string;
  base_dataset_id: number | null;
  flows: string;
  seed: number;
  generator: string;
  simulations: number;
  params_json: string;
  summary_json: string;
  created_at: string;
}

const toMc = (r: McRow): MonteCarloRunRecord => ({
  id: r.id,
  name: r.name,
  baseDatasetId: r.base_dataset_id,
  flows: r.flows.split(',') as FlowId[],
  seed: r.seed,
  generator: r.generator,
  simulations: r.simulations,
  params: JSON.parse(r.params_json),
  summary: JSON.parse(r.summary_json),
  createdAt: r.created_at,
});

export const montecarloRepo = {
  list(db: Db): MonteCarloRunRecord[] {
    return db.all<McRow>('SELECT * FROM montecarlo_runs ORDER BY id DESC').map(toMc);
  },
  get(db: Db, id: number): MonteCarloRunRecord | null {
    const r = db.first<McRow>('SELECT * FROM montecarlo_runs WHERE id = ?', [id]);
    return r ? toMc(r) : null;
  },
  create(db: Db, run: Omit<MonteCarloRunRecord, 'id' | 'createdAt'>): number {
    return db.run(
      `INSERT INTO montecarlo_runs (name, base_dataset_id, flows, seed, generator, simulations, params_json, summary_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [run.name, run.baseDatasetId, run.flows.join(','), run.seed, run.generator, run.simulations,
        JSON.stringify(run.params), JSON.stringify(run.summary)],
    ).lastInsertRowId;
  },
  remove(db: Db, id: number): void {
    db.run('DELETE FROM montecarlo_runs WHERE id = ?', [id]);
  },
};

/* ───────────────────────── Resultados de colas ───────────────────────── */

export interface QueueResultRecord {
  id: number;
  datasetId: number | null;
  access: AccessId;
  direction: Direction;
  model: QueueModel;
  lambda: number;
  mu: number;
  servers: number;
  periodStart: string | null;
  periodEnd: string | null;
  stable: boolean;
  result: QueueResult & { meta?: Record<string, unknown> };
  createdAt: string;
}

export const queueResultsRepo = {
  list(db: Db): QueueResultRecord[] {
    return db
      .all<{
        id: number; dataset_id: number | null; access_id: AccessId; direction: Direction; model: QueueModel;
        lambda: number; mu: number; servers: number; period_start: string | null; period_end: string | null;
        stable: number; results_json: string; created_at: string;
      }>('SELECT * FROM queue_results ORDER BY id DESC')
      .map((r) => ({
        id: r.id, datasetId: r.dataset_id, access: r.access_id, direction: r.direction, model: r.model,
        lambda: r.lambda, mu: r.mu, servers: r.servers, periodStart: r.period_start, periodEnd: r.period_end,
        stable: !!r.stable, result: JSON.parse(r.results_json), createdAt: r.created_at,
      }));
  },
  create(db: Db, q: Omit<QueueResultRecord, 'id' | 'createdAt'>): number {
    return db.run(
      `INSERT INTO queue_results (dataset_id, access_id, direction, model, lambda, mu, servers, period_start, period_end, stable, results_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [q.datasetId, q.access, q.direction, q.model, q.lambda, q.mu, q.servers, q.periodStart, q.periodEnd,
        q.stable ? 1 : 0, JSON.stringify(q.result)],
    ).lastInsertRowId;
  },
  remove(db: Db, id: number): void {
    db.run('DELETE FROM queue_results WHERE id = ?', [id]);
  },
};

/* ───────────────────────── Escenarios ───────────────────────── */

export interface ScenarioRecord<P = unknown, R = unknown> {
  id: number;
  name: string;
  description: string | null;
  baseDatasetId: number | null;
  params: P;
  results: R;
  createdAt: string;
}

export const scenariosRepo = {
  list<P, R>(db: Db): ScenarioRecord<P, R>[] {
    return db
      .all<{ id: number; name: string; description: string | null; base_dataset_id: number | null; params_json: string; results_json: string; created_at: string }>(
        'SELECT * FROM scenarios ORDER BY id DESC',
      )
      .map((r) => ({
        id: r.id, name: r.name, description: r.description, baseDatasetId: r.base_dataset_id,
        params: JSON.parse(r.params_json) as P, results: JSON.parse(r.results_json) as R, createdAt: r.created_at,
      }));
  },
  create(db: Db, s: Omit<ScenarioRecord, 'id' | 'createdAt'>): number {
    return db.run(
      'INSERT INTO scenarios (name, description, base_dataset_id, params_json, results_json) VALUES (?, ?, ?, ?, ?)',
      [s.name, s.description, s.baseDatasetId, JSON.stringify(s.params), JSON.stringify(s.results)],
    ).lastInsertRowId;
  },
  remove(db: Db, id: number): void {
    db.run('DELETE FROM scenarios WHERE id = ?', [id]);
  },
};

/* ───────────────────────── Simulación de eventos discretos ───────────────────────── */

export interface SimulationRunRecord<P = unknown, S = unknown> {
  id: number;
  name: string;
  params: P;
  summary: S;
  createdAt: string;
  vehicles?: number;
  events?: number;
}

export const simulationRepo = {
  list<P, S>(db: Db): SimulationRunRecord<P, S>[] {
    return db
      .all<{ id: number; name: string; params_json: string; summary_json: string; created_at: string; vehicles: number; events: number }>(
        `SELECT r.*, (SELECT COUNT(*) FROM simulation_vehicles v WHERE v.run_id = r.id) AS vehicles,
                (SELECT COUNT(*) FROM simulation_events e WHERE e.run_id = r.id) AS events
         FROM simulation_runs r ORDER BY r.id DESC`,
      )
      .map((r) => ({
        id: r.id, name: r.name, params: JSON.parse(r.params_json) as P, summary: JSON.parse(r.summary_json) as S,
        createdAt: r.created_at, vehicles: r.vehicles, events: r.events,
      }));
  },
  create(
    db: Db,
    run: { name: string; params: unknown; summary: unknown },
    vehicles: { id: number; arrival: number; serviceStart: number | null; serviceEnd: number | null; server: number | null }[],
    events: { seq: number; time: number; type: string; vehicleId: number; serverId: number | null }[],
  ): number {
    return db.transaction(() => {
      const id = db.run('INSERT INTO simulation_runs (name, params_json, summary_json) VALUES (?, ?, ?)', [
        run.name, JSON.stringify(run.params), JSON.stringify(run.summary),
      ]).lastInsertRowId;
      for (const v of vehicles) {
        db.run('INSERT INTO simulation_vehicles (run_id, vehicle_id, arrival, service_start, service_end, server_id) VALUES (?, ?, ?, ?, ?, ?)', [
          id, v.id, v.arrival, v.serviceStart, v.serviceEnd, v.server,
        ]);
      }
      for (const e of events) {
        db.run('INSERT INTO simulation_events (run_id, seq, time_min, type, vehicle_id, server_id) VALUES (?, ?, ?, ?, ?, ?)', [
          id, e.seq, e.time, e.type, e.vehicleId, e.serverId,
        ]);
      }
      return id;
    });
  },
  vehicles(db: Db, runId: number) {
    return db.all<{ vehicle_id: number; arrival: number; service_start: number | null; service_end: number | null; server_id: number | null }>(
      'SELECT * FROM simulation_vehicles WHERE run_id = ? ORDER BY vehicle_id',
      [runId],
    );
  },
  remove(db: Db, id: number): void {
    db.run('DELETE FROM simulation_runs WHERE id = ?', [id]);
  },
};

/* ───────────────────────── Informes y ajustes ───────────────────────── */

export interface ReportRecord {
  id: number;
  title: string;
  fileName: string;
  params: Record<string, unknown>;
  createdAt: string;
}

export const reportsRepo = {
  list(db: Db): ReportRecord[] {
    return db
      .all<{ id: number; title: string; file_name: string; params_json: string; created_at: string }>('SELECT * FROM reports ORDER BY id DESC')
      .map((r) => ({ id: r.id, title: r.title, fileName: r.file_name, params: JSON.parse(r.params_json), createdAt: r.created_at }));
  },
  create(db: Db, r: { title: string; fileName: string; params: Record<string, unknown> }): number {
    return db.run('INSERT INTO reports (title, file_name, params_json) VALUES (?, ?, ?)', [r.title, r.fileName, JSON.stringify(r.params)]).lastInsertRowId;
  },
};

export const settingsRepo = {
  get(db: Db, key: string): string | null {
    return db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null;
  },
  set(db: Db, key: string, value: string): void {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]);
  },
};
