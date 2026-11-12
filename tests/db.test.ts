import { describe, expect, it } from 'vitest';
import { runMonteCarlo, DEFAULT_MC_CONFIG } from '../src/core/montecarlo/engine';
import { toStoredParams, toStoredSummary } from '../src/core/montecarlo/summary';
import { currentVersion, MIGRATIONS } from '../src/db/migrations';
import {
  DuplicateRecordError,
  datasetsRepo,
  montecarloRepo,
  recordsRepo,
  serverConfigRepo,
  settingsRepo,
  simulationRepo,
} from '../src/db/repositories';
import { seedDatabase } from '../src/db/seed';
import { getSummary, recordsToCsv, saveSyntheticDataset } from '../src/services/datasets';
import { DiscreteEventSimulator } from '../src/core/des/engine';
import { parseCsv } from '../src/core/importer/csv';
import { createTestDb } from './helpers';

describe('Persistencia SQLite', () => {
  it('aplica las migraciones y deja la versión del esquema', async () => {
    const db = await createTestDb(false);
    expect(currentVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((t) => t.name);
    for (const t of ['datasets', 'vehicle_records', 'accesses', 'server_configs', 'scenarios', 'montecarlo_runs', 'queue_results', 'simulation_runs', 'simulation_events', 'reports']) {
      expect(tables).toContain(t);
    }
  });

  it('carga la semilla una sola vez con los totales originales', async () => {
    const db = await createTestDb(true);
    expect(seedDatabase(db)).toBe(false);
    const ds = datasetsRepo.list(db);
    expect(ds).toHaveLength(2);
    const friday = ds.find((d) => d.kind === 'observado')!;
    const saturday = ds.find((d) => d.kind === 'simulado')!;
    expect(friday.recordCount).toBe(96);
    expect(saturday.referenceDatasetId).toBe(friday.id);
    const f = getSummary(db, friday.id).summary;
    expect(f.totalsByFlow).toEqual({ E70: 326, S70: 281, E80: 530, S80: 428 });
    expect(f.totalEntries).toBe(856);
    expect(f.totalExits).toBe(709);
    expect(f.durationMinutes).toBe(120);
    expect(f.peakEntries?.start).toBe('18:35');
    expect(f.peakEntries?.value).toBe(50);
    const s = getSummary(db, saturday.id).summary;
    expect(s.firstStart).toBe('18:00');
    expect(s.lastEnd).toBe('20:00');
  });

  it('mantiene separados los datos observados y simulados', async () => {
    const db = await createTestDb(true);
    const obs = recordsRepo.list(db, { origin: 'observado' });
    const sim = recordsRepo.list(db, { origin: 'simulado' });
    expect(obs.every((r) => r.date === '2026-11-06' && r.simulationId === null)).toBe(true);
    expect(sim.every((r) => r.date === '2026-11-07' && r.simulationId === 'NB-20261107')).toBe(true);
  });

  it('rechaza registros duplicados y conteos negativos', async () => {
    const db = await createTestDb(true);
    const r = recordsRepo.list(db)[0];
    const { id: _id, ...copy } = r;
    expect(() => recordsRepo.insert(db, copy)).toThrow(DuplicateRecordError);
    expect(() => recordsRepo.insert(db, { ...copy, startTime: '23:00', endTime: '23:05', count: -1 })).toThrow();
  });

  it('crea, edita y elimina registros', async () => {
    const db = await createTestDb(true);
    const dsId = datasetsRepo.create(db, { name: 'Manual', date: '2026-11-10', kind: 'manual' });
    const id = recordsRepo.insert(db, {
      datasetId: dsId, date: '2026-11-10', startTime: '18:00', endTime: '18:05', access: 'C70', direction: 'entrada',
      count: 9, origin: 'manual', simulationId: null, notes: 'prueba',
    });
    recordsRepo.update(db, id, { ...recordsRepo.get(db, id)!, count: 12 });
    expect(recordsRepo.get(db, id)!.count).toBe(12);
    recordsRepo.remove(db, id);
    expect(recordsRepo.get(db, id)).toBeNull();
    datasetsRepo.remove(db, dsId);
    expect(datasetsRepo.get(db, dsId)).toBeNull();
  });

  it('borrar un conjunto borra sus registros en cascada', async () => {
    const db = await createTestDb(true);
    const sat = datasetsRepo.list(db).find((d) => d.kind === 'simulado')!;
    datasetsRepo.remove(db, sat.id);
    expect(recordsRepo.list(db, { datasetId: sat.id })).toHaveLength(0);
    expect(recordsRepo.list(db)).toHaveLength(96);
  });

  it('revierte la transacción si algo falla (no deja registros a medias)', async () => {
    const db = await createTestDb(true);
    const before = recordsRepo.list(db).length;
    const r = recordsRepo.list(db)[0];
    const { id: _id, ...copy } = r;
    expect(() => recordsRepo.insertMany(db, [{ ...copy, startTime: '22:00', endTime: '22:05' }, copy])).toThrow();
    expect(recordsRepo.list(db).length).toBe(before);
  });

  it('sobrevive a exportar y reabrir el archivo (cerrar y abrir la app)', async () => {
    const db = await createTestDb(true);
    settingsRepo.set(db, 'institution', 'Universidad de prueba');
    const reopened = await createTestDb(false, db.export());
    expect(datasetsRepo.list(reopened)).toHaveLength(2);
    expect(settingsRepo.get(reopened, 'institution')).toBe('Universidad de prueba');
    expect(serverConfigRepo.get(reopened, 'C80', 'entrada')?.existingServers).toBe(2);
  });

  it('guarda una ejecución Montecarlo y genera un conjunto simulado trazable', async () => {
    const db = await createTestDb(true);
    const friday = datasetsRepo.list(db).find((d) => d.kind === 'observado')!;
    const { series } = getSummary(db, friday.id);
    const result = runMonteCarlo({
      ...DEFAULT_MC_CONFIG, simulations: 50,
      flows: [{ flow: 'E80', base: series.values.E80 }, { flow: 'E70', base: series.values.E70 }],
    });
    const runId = montecarloRepo.create(db, {
      name: 'Prueba', baseDatasetId: friday.id, flows: ['E80', 'E70'], seed: result.config.seed,
      generator: result.config.generator, simulations: 50, params: toStoredParams(result.config), summary: toStoredSummary(result),
    });
    const synthId = saveSyntheticDataset(db, { name: 'Sintético', date: '2026-11-14', base: friday, baseSeries: series, result, runId });
    const synth = datasetsRepo.get(db, synthId)!;
    expect(synth.kind).toBe('simulado');
    expect(synth.referenceDatasetId).toBe(friday.id);
    expect(synth.montecarloRunId).toBe(runId);
    const recs = recordsRepo.list(db, { datasetId: synthId });
    expect(recs).toHaveLength(48);
    expect(recs.every((r) => r.origin === 'simulado' && r.simulationId === `MC-${runId}`)).toBe(true);
    // El conjunto observado no cambia.
    expect(getSummary(db, friday.id).summary.totalEntries).toBe(856);
    expect(montecarloRepo.get(db, runId)!.summary.totalStats.n).toBe(50);
  });

  it('guarda una simulación de eventos discretos con vehículos y eventos', async () => {
    const db = await createTestDb(true);
    const sim = new DiscreteEventSimulator({ arrivalRatePerMin: 3, servers: 2, meanServiceMin: 0.1, serviceDistribution: 'exponencial', horizonMin: 30, seed: 1 });
    sim.runToEnd();
    const id = simulationRepo.create(db, { name: 'DES', params: sim.config, summary: sim.metrics() }, sim.vehicles, sim.log);
    const saved = simulationRepo.list(db)[0];
    expect(saved.id).toBe(id);
    expect(saved.vehicles).toBe(sim.vehicles.length);
    expect(saved.events).toBe(sim.log.length);
  });

  it('exporta registros a CSV que se puede volver a leer', async () => {
    const db = await createTestDb(true);
    const csv = recordsToCsv(recordsRepo.list(db, { origin: 'observado' }), datasetsRepo.list(db));
    const table = parseCsv(csv);
    expect(table[0]).toContain('cantidad');
    expect(table).toHaveLength(97);
    const total = table.slice(1).reduce((a, r) => a + Number(r[7]), 0);
    expect(total).toBe(856 + 709);
  });
});
