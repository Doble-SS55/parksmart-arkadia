import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Dataset } from '../core/types';
import { datasetsRepo } from '../db/repositories';
import { useQuery } from './DbProvider';

const KEY = 'qsa.selectedDataset';

interface SelectionValue {
  datasets: Dataset[];
  selected: Dataset | null;
  setSelectedId(id: number): void;
}

const SelectionContext = createContext<SelectionValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const datasets = useQuery((db) => datasetsRepo.list(db));
  const [id, setId] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(KEY);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });
  const selected = useMemo(
    () => datasets.find((d) => d.id === id) ?? datasets.find((d) => d.kind === 'observado') ?? datasets[0] ?? null,
    [datasets, id],
  );
  useEffect(() => {
    try {
      if (selected) localStorage.setItem(KEY, String(selected.id));
    } catch {
      /* almacenamiento no disponible: la selección vive solo en memoria */
    }
  }, [selected]);
  const value = useMemo(() => ({ datasets, selected, setSelectedId: setId }), [datasets, selected]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection fuera de SelectionProvider');
  return ctx;
}
