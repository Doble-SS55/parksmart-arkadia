import { useState } from 'react';
import { PARAMETER_SOURCE_LABEL, ACCESS_LABEL, type ParameterSource, type ServerConfig } from '../core/types';
import { serverConfigRepo } from '../db/repositories';
import { useDb, useQuery } from '../state/DbProvider';
import { Field, NumberInput, Select, SourceBadge, useFeedback } from './ui';

const SOURCES = (Object.keys(PARAMETER_SOURCE_LABEL) as ParameterSource[]).map((s) => ({ value: s, label: PARAMETER_SOURCE_LABEL[s] }));

function Editor({ cfg }: { cfg: ServerConfig }) {
  const { db } = useDb();
  const { toast } = useFeedback();
  const [draft, setDraft] = useState(cfg);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ServerConfig>(k: K, v: ServerConfig[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const save = () => {
    if (!Number.isInteger(draft.existingServers) || draft.existingServers < 1) return setError('Las barreras deben ser un entero ≥ 1.');
    if (!(draft.meanServiceSeconds > 0)) return setError('El tiempo medio de atención debe ser mayor que 0.');
    if (draft.serviceMinSeconds !== null && draft.serviceMaxSeconds !== null && draft.serviceMinSeconds > draft.serviceMaxSeconds) {
      return setError('El mínimo no puede superar al máximo.');
    }
    setError(null);
    serverConfigRepo.upsert(db, draft);
    toast(`Parámetros de ${ACCESS_LABEL[cfg.access]} (${cfg.direction}) guardados.`);
  };
  return (
    <details className="disclosure" style={{ borderTop: '1px solid var(--line)', padding: '6px 0' }}>
      <summary>
        {ACCESS_LABEL[cfg.access]} · {cfg.direction} — {cfg.existingServers} barrera(s), {cfg.meanServiceSeconds} s
      </summary>
      <div className="form" style={{ padding: '8px 0' }}>
        <div className="row small"><SourceBadge source={cfg.serversSource} /><SourceBadge source={cfg.serviceSource} /></div>
        <div className="row-2">
          <NumberInput label="Barreras existentes" value={draft.existingServers} min={1} step={1} onChange={(v) => set('existingServers', v === '' ? 0 : v)} />
          <Select<ParameterSource> label="Procedencia" value={draft.serversSource} options={SOURCES} onChange={(v) => set('serversSource', v)} />
        </div>
        <div className="row-2">
          <NumberInput label="Atención media" suffix="s" value={draft.meanServiceSeconds} min={0} step={0.1} onChange={(v) => set('meanServiceSeconds', v === '' ? 0 : v)} />
          <Select<ParameterSource> label="Procedencia" value={draft.serviceSource} options={SOURCES} onChange={(v) => set('serviceSource', v)} />
        </div>
        <div className="row-2">
          <NumberInput label="Mínimo observado" suffix="s" value={draft.serviceMinSeconds ?? ''} min={0} step={0.1} onChange={(v) => set('serviceMinSeconds', v === '' ? null : v)} />
          <NumberInput label="Máximo observado" suffix="s" value={draft.serviceMaxSeconds ?? ''} min={0} step={0.1} onChange={(v) => set('serviceMaxSeconds', v === '' ? null : v)} />
        </div>
        <Field label="Notas" htmlFor={`notes-${cfg.access}-${cfg.direction}`}>
          <textarea id={`notes-${cfg.access}-${cfg.direction}`} className="textarea" value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />
        </Field>
        {error && <span className="field-error" role="alert">{error}</span>}
        <div><button type="button" className="btn btn-primary btn-small" onClick={save}>Guardar parámetros</button></div>
      </div>
    </details>
  );
}

/** Edición de barreras existentes y tiempos de atención por acceso y dirección. */
export function BarrierSettings() {
  const configs = useQuery((db) => serverConfigRepo.list(db));
  return (
    <section className="section">
      <div className="section-head">
        <h2>Parámetros de las barreras</h2>
        <p>Valores que usan por defecto colas, escenarios y el simulador.</p>
      </div>
      {configs.map((c) => (
        <Editor key={`${c.access}-${c.direction}-${c.existingServers}-${c.meanServiceSeconds}-${c.serversSource}-${c.serviceSource}`} cfg={c} />
      ))}
    </section>
  );
}
