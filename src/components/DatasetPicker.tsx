import { useId } from 'react';
import type { Dataset } from '../core/types';
import { OriginBadge } from './ui';

export function datasetOptionLabel(d: Dataset): string {
  const tag = d.kind === 'observado' ? 'observado' : d.kind === 'simulado' ? 'simulado' : 'manual';
  return d.name.toLowerCase().includes(tag) ? d.name : `${d.name} (${tag})`;
}

export function DatasetPicker({
  datasets, value, onChange, label = 'Conjunto de datos', filter,
}: { datasets: Dataset[]; value: Dataset | null; onChange: (id: number) => void; label?: string; filter?: (d: Dataset) => boolean }) {
  const id = useId();
  const list = filter ? datasets.filter(filter) : datasets;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value?.id ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
        {list.map((d) => (
          <option key={d.id} value={d.id}>{datasetOptionLabel(d)}</option>
        ))}
      </select>
      {value && (
        <span className="field-hint row" style={{ gap: 6 }}>
          <OriginBadge origin={value.kind} />
          {value.kind === 'simulado' && <span>Datos sintéticos: no son mediciones reales.</span>}
        </span>
      )}
    </div>
  );
}
