import type { Database, SqlValue } from 'sql.js';

export type SqlParam = string | number | null;

/** Interfaz mínima de base de datos que usan los repositorios. */
export interface Db {
  exec(sql: string): void;
  run(sql: string, params?: SqlParam[]): { lastInsertRowId: number; changes: number };
  all<T>(sql: string, params?: SqlParam[]): T[];
  first<T>(sql: string, params?: SqlParam[]): T | null;
  /** Ejecuta `fn` dentro de una transacción; revierte todo si lanza un error. */
  transaction<T>(fn: () => T): T;
}

/**
 * Adaptador sobre sql.js (SQLite compilado a WebAssembly).
 * `onChange` se llama tras cada escritura confirmada para persistir el archivo.
 */
export class SqlJsDb implements Db {
  private depth = 0;
  readonly raw: Database;
  private onChange?: () => void;

  constructor(raw: Database, onChange?: () => void) {
    this.raw = raw;
    this.onChange = onChange;
    raw.exec('PRAGMA foreign_keys = ON;');
  }

  exec(sql: string): void {
    this.raw.exec(sql);
    if (this.depth === 0) this.onChange?.();
  }

  run(sql: string, params: SqlParam[] = []): { lastInsertRowId: number; changes: number } {
    this.raw.run(sql, params as SqlValue[]);
    const changes = this.raw.getRowsModified();
    const id = this.raw.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0];
    if (this.depth === 0) this.onChange?.();
    return { lastInsertRowId: Number(id ?? 0), changes };
  }

  all<T>(sql: string, params: SqlParam[] = []): T[] {
    const stmt = this.raw.prepare(sql);
    try {
      stmt.bind(params as SqlValue[]);
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      return out;
    } finally {
      stmt.free();
    }
  }

  first<T>(sql: string, params: SqlParam[] = []): T | null {
    return this.all<T>(sql, params)[0] ?? null;
  }

  transaction<T>(fn: () => T): T {
    const savepoint = `sp${this.depth}`;
    this.raw.exec(this.depth === 0 ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
    this.depth++;
    try {
      const result = fn();
      this.depth--;
      this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
      if (this.depth === 0) this.onChange?.();
      return result;
    } catch (e) {
      this.depth--;
      this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}`);
      throw e;
    }
  }

  export(): Uint8Array {
    return this.raw.export();
  }
}
