import type { Db } from './db';

/**
 * Migraciones versionadas. La versión aplicada se guarda en PRAGMA user_version.
 * Para cambiar el esquema se agrega una nueva entrada; nunca se edita una existente.
 */
export const MIGRATIONS: { version: number; description: string; sql: string }[] = [
  {
    version: 1,
    description: 'Esquema inicial',
    sql: `
      CREATE TABLE accesses (
        id TEXT PRIMARY KEY CHECK (id IN ('C70','C80')),
        name TEXT NOT NULL,
        description TEXT
      );

      CREATE TABLE datasets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('observado','simulado','manual')),
        source_file TEXT,
        description TEXT,
        interval_minutes INTEGER NOT NULL DEFAULT 5 CHECK (interval_minutes > 0),
        reference_dataset_id INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
        montecarlo_run_id INTEGER REFERENCES montecarlo_runs(id) ON DELETE SET NULL,
        is_seed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE vehicle_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        access_id TEXT NOT NULL REFERENCES accesses(id),
        direction TEXT NOT NULL CHECK (direction IN ('entrada','salida')),
        count INTEGER NOT NULL CHECK (count >= 0),
        origin TEXT NOT NULL CHECK (origin IN ('observado','simulado','manual')),
        simulation_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE (dataset_id, date, start_time, access_id, direction)
      );
      CREATE INDEX idx_records_dataset ON vehicle_records(dataset_id, start_time);

      CREATE TABLE server_configs (
        access_id TEXT NOT NULL REFERENCES accesses(id),
        direction TEXT NOT NULL CHECK (direction IN ('entrada','salida')),
        existing_servers INTEGER NOT NULL CHECK (existing_servers >= 1),
        servers_source TEXT NOT NULL,
        mean_service_seconds REAL NOT NULL CHECK (mean_service_seconds > 0),
        service_min_seconds REAL,
        service_max_seconds REAL,
        service_source TEXT NOT NULL,
        notes TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        PRIMARY KEY (access_id, direction)
      );

      CREATE TABLE montecarlo_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        base_dataset_id INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
        flows TEXT NOT NULL,
        seed INTEGER NOT NULL,
        generator TEXT NOT NULL,
        simulations INTEGER NOT NULL,
        params_json TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE queue_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
        access_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        model TEXT NOT NULL CHECK (model IN ('MM1','MMS')),
        lambda REAL NOT NULL,
        mu REAL NOT NULL,
        servers INTEGER NOT NULL,
        period_start TEXT,
        period_end TEXT,
        stable INTEGER NOT NULL,
        results_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE scenarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        base_dataset_id INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
        params_json TEXT NOT NULL,
        results_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE simulation_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        params_json TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE simulation_vehicles (
        run_id INTEGER NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
        vehicle_id INTEGER NOT NULL,
        arrival REAL NOT NULL,
        service_start REAL,
        service_end REAL,
        server_id INTEGER,
        PRIMARY KEY (run_id, vehicle_id)
      );

      CREATE TABLE simulation_events (
        run_id INTEGER NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        time_min REAL NOT NULL,
        type TEXT NOT NULL,
        vehicle_id INTEGER NOT NULL,
        server_id INTEGER,
        PRIMARY KEY (run_id, seq)
      );

      CREATE TABLE reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        file_name TEXT NOT NULL,
        params_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT INTO accesses (id, name, description) VALUES
        ('C70', 'Acceso carrera 70', 'Acceso vehicular al parqueadero por la carrera 70'),
        ('C80', 'Acceso carrera 80', 'Acceso vehicular al parqueadero por la carrera 80');
    `,
  },
];

export function currentVersion(db: Db): number {
  return Number(db.first<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0);
}

export function migrate(db: Db): number {
  let version = currentVersion(db);
  for (const m of MIGRATIONS) {
    if (m.version <= version) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
    version = m.version;
  }
  return version;
}
