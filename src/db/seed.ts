import { FRIDAY_OBSERVED, FRIDAY_SOURCE_FILE, SATURDAY_SIMULATED, SATURDAY_SOURCE_FILE, type SeedRow } from '../data/seed';
import { FLOW_IDS, flowKey, type NewVehicleRecord, type RecordOrigin, type ServerConfig } from '../core/types';
import type { Db } from './db';
import { datasetsRepo, recordsRepo, serverConfigRepo, settingsRepo } from './repositories';

export const SEED_VERSION = '1';
export const SATURDAY_SIMULATION_ID = 'NB-20261107';

export const DEFAULT_SERVER_CONFIGS: ServerConfig[] = [
  ...(['C70', 'C80'] as const).map((access) => ({
    access,
    direction: 'entrada' as const,
    existingServers: 2,
    serversSource: 'confirmado' as const,
    meanServiceSeconds: 5,
    serviceMinSeconds: 4,
    serviceMaxSeconds: 6,
    serviceSource: 'aproximado' as const,
    notes:
      'El equipo confirmó 2 carriles de entrada por acceso. Tiempo de servicio tomado de la subida de barrera ' +
      'observada (4–6 s); falta confirmar si incluye todo el ciclo del vehículo.',
  })),
  ...(['C70', 'C80'] as const).map((access) => ({
    access,
    direction: 'salida' as const,
    existingServers: 1,
    serversSource: 'sin_dato' as const,
    meanServiceSeconds: 5,
    serviceMinSeconds: 4,
    serviceMaxSeconds: 6,
    serviceSource: 'aproximado' as const,
    notes: 'Número de barreras de salida sin confirmar (la salida es por otro lado). Valor provisional configurable.',
  })),
];

export function seedRowsToRecords(
  rows: SeedRow[],
  datasetId: number,
  date: string,
  origin: RecordOrigin,
  simulationId: string | null,
): NewVehicleRecord[] {
  const out: NewVehicleRecord[] = [];
  for (const row of rows) {
    FLOW_IDS.forEach((fid, j) => {
      const { access, direction } = flowKey(fid);
      out.push({
        datasetId, date, startTime: row.start, endTime: row.end, access, direction,
        count: row.values[j], origin, simulationId, notes: null,
      });
    });
  }
  return out;
}

/** Carga los datos iniciales una sola vez (idempotente). */
export function seedDatabase(db: Db): boolean {
  if (settingsRepo.get(db, 'seed_version') === SEED_VERSION) return false;
  db.transaction(() => {
    const fridayId = datasetsRepo.create(db, {
      name: 'Viernes 6 nov — observado',
      date: '2026-11-06',
      kind: 'observado',
      sourceFile: FRIDAY_SOURCE_FILE,
      description:
        'Conteos de campo por observación directa, 17:30–19:30, intervalos de 5 minutos, accesos carrera 70 y carrera 80.',
      isSeed: true,
    });
    recordsRepo.insertMany(db, seedRowsToRecords(FRIDAY_OBSERVED, fridayId, '2026-11-06', 'observado', null));

    const saturdayId = datasetsRepo.create(db, {
      name: 'Sábado 7 nov — simulado',
      date: '2026-11-07',
      kind: 'simulado',
      sourceFile: SATURDAY_SOURCE_FILE,
      description:
        'DATOS SINTÉTICOS. Montecarlo Poisson del notebook de Colab (semilla 20261107) a partir del viernes observado; ' +
        '18:00–20:00. Aumentos supuestos: E70 +25 %, S70 +15 %, E80 +30 %, S80 +20 %. No son mediciones.',
      referenceDatasetId: fridayId,
      isSeed: true,
    });
    recordsRepo.insertMany(db, seedRowsToRecords(SATURDAY_SIMULATED, saturdayId, '2026-11-07', 'simulado', SATURDAY_SIMULATION_ID));

    for (const c of DEFAULT_SERVER_CONFIGS) serverConfigRepo.upsert(db, c);

    settingsRepo.set(db, 'team', 'Santiago Solís\nJuan Fernando Gómez Ocampo');
    settingsRepo.set(db, 'course', 'Modelamiento y Simulación Computacional');
    settingsRepo.set(db, 'teacher', 'Juan Carlos Briñez de León');
    settingsRepo.set(db, 'institution', '');
    settingsRepo.set(db, 'seed_version', SEED_VERSION);
  });
  return true;
}
