import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SqlJsDb } from '../db/db';
import { migrate } from '../db/migrations';
import { seedDatabase } from '../db/seed';
import { clearDatabaseFile, loadDatabaseFile, requestPersistentStorage, saveDatabaseFile } from '../platform/storage';
import { BrandMark } from '../components/Icons';

interface DbContextValue {
  db: SqlJsDb;
  /** Cambia con cada escritura; las consultas dependen de este número. */
  revision: number;
  saving: boolean;
  lastSavedAt: Date | null;
  saveError: string | null;
  /** Reemplaza la base completa (restaurar respaldo o datos de ejemplo). */
  replaceDatabase(bytes: Uint8Array | null): Promise<void>;
}

const DbContext = createContext<DbContextValue | null>(null);

let sqlPromise: Promise<SqlJsStatic> | null = null;
const loadSql = () => (sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl }));

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SqlJsDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const dbRef = useRef<SqlJsDb | null>(null);

  const persist = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setSaving(true);
    timer.current = window.setTimeout(async () => {
      const current = dbRef.current;
      if (!current) return;
      try {
        await saveDatabaseFile(current.export());
        setLastSavedAt(new Date());
        setSaveError(null);
      } catch (e) {
        setSaveError(`No se pudo guardar en el navegador: ${(e as Error).message}`);
      } finally {
        setSaving(false);
      }
    }, 250);
  }, []);

  const open = useCallback(
    async (bytes: Uint8Array | null) => {
      const SQL = await loadSql();
      const instance = new SqlJsDb(bytes ? new SQL.Database(bytes) : new SQL.Database(), () => {
        setRevision((r) => r + 1);
        persist();
      });
      migrate(instance);
      seedDatabase(instance);
      dbRef.current?.raw.close();
      dbRef.current = instance;
      setDb(instance);
      setRevision((r) => r + 1);
      persist();
    },
    [persist],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bytes = await loadDatabaseFile().catch(() => null);
        if (cancelled) return;
        await open(bytes);
        void requestPersistentStorage();
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const replaceDatabase = useCallback(
    async (bytes: Uint8Array | null) => {
      if (!bytes) await clearDatabaseFile();
      await open(bytes);
    },
    [open],
  );

  const value = useMemo(
    () => (db ? { db, revision, saving, lastSavedAt, saveError, replaceDatabase } : null),
    [db, revision, saving, lastSavedAt, saveError, replaceDatabase],
  );

  if (error) {
    return (
      <div className="splash">
        <BrandMark className="brand-mark" />
        <h1>No se pudo abrir la base de datos</h1>
        <p>{error}</p>
        <p>Recargue la página. Si el problema continúa, use un navegador actualizado (Chrome, Edge, Firefox o Safari).</p>
      </div>
    );
  }
  if (!value) {
    return (
      <div className="splash" role="status">
        <BrandMark className="brand-mark" />
        <p>Abriendo la base de datos…</p>
      </div>
    );
  }
  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb debe usarse dentro de DbProvider');
  return ctx;
}

/** Ejecuta una consulta y la recalcula cuando cambia la base o las dependencias. */
export function useQuery<T>(fn: (db: SqlJsDb) => T, deps: unknown[] = []): T {
  const { db, revision } = useDb();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => fn(db), [db, revision, ...deps]);
}
