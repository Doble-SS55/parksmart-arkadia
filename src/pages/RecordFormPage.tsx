import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Callout, Field, OriginBadge, Segmented, Select, useFeedback } from '../components/ui';
import { addMinutesHHMM, formatHHMM, isISODate, parseHHMM } from '../core/time';
import type { AccessId, Direction } from '../core/types';
import { DuplicateRecordError, datasetsRepo, recordsRepo } from '../db/repositories';
import { useDb, useQuery } from '../state/DbProvider';
import { useSelection } from '../state/selection';

const NEW_MANUAL = -1;

export default function RecordFormPage() {
  const { id } = useParams();
  const isNew = id === 'nuevo';
  const recordId = isNew ? null : Number(id);
  const { db } = useDb();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const { datasets } = useSelection();
  const existing = useQuery((d) => (recordId ? recordsRepo.get(d, recordId) : null), [recordId]);

  const firstManual = datasets.find((d) => d.kind === 'manual');
  const [datasetId, setDatasetId] = useState<number>(existing?.datasetId ?? firstManual?.id ?? NEW_MANUAL);
  const [newDatasetName, setNewDatasetName] = useState('Conteos manuales');
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().slice(0, 10));
  const [start, setStart] = useState(existing?.startTime ?? '18:00');
  const [end, setEnd] = useState(existing?.endTime ?? '18:05');
  const [access, setAccess] = useState<AccessId>(existing?.access ?? 'C70');
  const [direction, setDirection] = useState<Direction>(existing?.direction ?? 'entrada');
  const [count, setCount] = useState<string>(existing ? String(existing.count) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [submitted, setSubmitted] = useState(false);

  const dataset = datasets.find((d) => d.id === datasetId) ?? null;
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!isISODate(date)) e.date = 'Ingrese una fecha válida.';
    const s = parseHHMM(start);
    const f = parseHHMM(end);
    if (s === null) e.start = 'Use el formato HH:MM.';
    if (f === null) e.end = 'Use el formato HH:MM.';
    if (s !== null && f !== null && f <= s) e.end = 'La hora final debe ser posterior a la inicial.';
    const n = Number(count);
    if (count.trim() === '') e.count = 'Ingrese la cantidad de vehículos.';
    else if (!Number.isFinite(n) || !Number.isInteger(n)) e.count = 'Debe ser un número entero.';
    else if (n < 0) e.count = 'No puede ser negativa.';
    if (datasetId === NEW_MANUAL && !newDatasetName.trim()) e.dataset = 'Escriba un nombre para el conjunto.';
    return e;
  }, [date, start, end, count, datasetId, newDatasetName]);

  if (!isNew && !existing) {
    return <Callout tone="bad">No existe el registro solicitado. <Link to="/datos">Volver a datos</Link></Callout>;
  }

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    try {
      db.transaction(() => {
        let dsId = datasetId;
        if (dsId === NEW_MANUAL) {
          dsId = datasetsRepo.create(db, { name: newDatasetName.trim(), date, kind: 'manual', description: 'Conteos ingresados manualmente en la aplicación.' });
        }
        const ds = datasetsRepo.get(db, dsId)!;
        const rec = {
          datasetId: dsId,
          date,
          startTime: formatHHMM(parseHHMM(start)!),
          endTime: formatHHMM(parseHHMM(end)!),
          access,
          direction,
          count: Number(count),
          origin: ds.kind,
          simulationId: existing?.simulationId ?? null,
          notes: notes.trim() || null,
        };
        if (recordId) recordsRepo.update(db, recordId, rec);
        else recordsRepo.insert(db, rec);
      });
      toast(recordId ? 'Registro actualizado.' : 'Registro guardado.');
      navigate('/datos');
    } catch (e) {
      toast(e instanceof DuplicateRecordError ? e.message : `No se pudo guardar: ${(e as Error).message}`, 'error');
    }
  };

  const err = (k: string) => (submitted ? errors[k] : undefined);

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="page-head">
        <div>
          <h1>{recordId ? 'Editar registro' : 'Nuevo registro'}</h1>
          <p>Un registro es el número de vehículos de un flujo en un intervalo.</p>
        </div>
      </div>
      <section className="section form" style={{ maxWidth: 640 }}>
        <Select<number>
          label="Conjunto de datos"
          value={datasetId}
          onChange={setDatasetId}
          options={[
            ...datasets.map((d) => ({ value: d.id, label: `${d.name} (${d.kind})` })),
            { value: NEW_MANUAL, label: '+ Nuevo conjunto manual' },
          ]}
          hint={dataset ? <span className="row" style={{ gap: 6 }}>El registro tendrá el origen del conjunto: <OriginBadge origin={dataset.kind} short /></span> : 'Se creará un conjunto con origen "manual".'}
        />
        {datasetId === NEW_MANUAL && (
          <Field label="Nombre del nuevo conjunto" htmlFor="rf-dsname" error={err('dataset')}>
            <input id="rf-dsname" className="input" value={newDatasetName} onChange={(e) => setNewDatasetName(e.target.value)} />
          </Field>
        )}
        {dataset?.kind === 'simulado' && (
          <Callout tone="warn">Está editando un conjunto simulado. Los cambios no lo convierten en datos observados.</Callout>
        )}
        <Field label="Fecha" htmlFor="rf-date" error={err('date')}>
          <input id="rf-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="row-2">
          <Field label="Hora inicial" htmlFor="rf-start" error={err('start')}>
            <input
              id="rf-start"
              className="input num"
              type="time"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (parseHHMM(e.target.value) !== null && isNew) setEnd(addMinutesHHMM(e.target.value, 5));
              }}
            />
          </Field>
          <Field label="Hora final" htmlFor="rf-end" error={err('end')}>
            <input id="rf-end" className="input num" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Acceso">
          <Segmented<AccessId> label="Acceso" value={access} onChange={setAccess} options={[{ value: 'C70', label: 'Carrera 70' }, { value: 'C80', label: 'Carrera 80' }]} />
        </Field>
        <Field label="Dirección">
          <Segmented<Direction> label="Dirección" value={direction} onChange={setDirection} options={[{ value: 'entrada', label: 'Entrada' }, { value: 'salida', label: 'Salida' }]} />
        </Field>
        <Field label="Vehículos en el intervalo" htmlFor="rf-count" error={err('count')}>
          <input id="rf-count" className="input num" type="number" inputMode="numeric" min={0} step={1} value={count} onChange={(e) => setCount(e.target.value)} aria-invalid={err('count') ? true : undefined} />
        </Field>
        <Field label="Observaciones (opcional)" htmlFor="rf-notes">
          <textarea id="rf-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Lluvia, evento, cierre de un carril…" />
        </Field>
        <div className="row">
          <button type="submit" className="btn btn-primary">{recordId ? 'Guardar cambios' : 'Guardar registro'}</button>
          <Link to="/datos" className="btn">Cancelar</Link>
        </div>
      </section>
    </form>
  );
}
