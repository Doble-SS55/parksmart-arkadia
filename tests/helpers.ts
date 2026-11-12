import initSqlJs from 'sql.js';
import { SqlJsDb } from '../src/db/db';
import { migrate } from '../src/db/migrations';
import { seedDatabase } from '../src/db/seed';

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

/** Base de datos SQLite real (sql.js) en memoria, migrada y opcionalmente con semilla. */
export async function createTestDb(seed = true, data?: Uint8Array): Promise<SqlJsDb> {
  SQL ??= await initSqlJs();
  const db = new SqlJsDb(data ? new SQL.Database(data) : new SQL.Database());
  migrate(db);
  if (seed) seedDatabase(db);
  return db;
}
