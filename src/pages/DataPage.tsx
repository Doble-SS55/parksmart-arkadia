import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconDownload, IconEdit, IconPlus, IconTable, IconTrash, IconUpload } from '../components/Icons';
import { Callout, EmptyState, Field, Modal, OriginBadge, Segmented, Select, useFeedback } from '../components/ui';
import { parseCsv } from '../core/importer/csv';
import { findRecordIssues, normalizeTable, type NormalizeResult } from '../core/importer/normalize';
import { readXlsx } from '../core/importer/xlsx';
import { formatShortDate, isISODate } from '../core/time';
import { ACCESS_LABEL, type AccessId, type Direction, type Issue, type RecordOrigin } from '../core/types';
import { datasetsRepo, recordsRepo } from '../db/repositories';
import { downloadText } from '../platform/storage';
import { recordsToCsv, saveImport } from '../services/datasets';
import { useDb, useQuery } from '../state/DbProvider';
import { useSelection } from '../state/selection';

const PAGE = 120;

function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <Callout tone="good">Sin problemas: no hay duplicados, huecos ni valores inválidos.</Callout>;
  return (
    <ul className="issue-list">
      {issues.map((i, k) => (
        <li key={k} className={`issue-${i.level}`}>
          <span className="lvl">{i.level === 'error' ? 'Error' : 'Aviso'}</span>
          <span>{i.row ? `Fila ${i.row}: ` : ''}{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db } = useDb();
  const { toast } = useFeedback();
  const { setSelectedId } = useSelection();
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<ReturnType<typeof parseCsv> | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [kind, setKind] = useState<RecordOrigin>('observado');
  const [busy, setBusy] = useState(false);

  const normalized: NormalizeResult | null = useMemo(
    () => (table && isISODate(date) ? normalizeTable(table, { date, origin: kind }) : null),
    [table, date, kind],
  );
  const errors = normalized?.issues.filter((i) => i.level === 'error') ?? [];
  const duplicates = errors.some((e) => /duplicado/i.test(e.message));

  const reset = () => {
    setFileName('');
    setTable(null);
    setReadError(null);
    setName('');
    setDate('');
    setKind('observado');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReadError(null);
    setTable(null);
    setFileName(file.name);
    setName(file.name.replace(/\.(xlsx|csv|txt)$/i, ''));
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const res = readXlsx(new Uint8Array(await file.arrayBuffer()));
        if (res.formulasWithoutValue.length) {
          setReadError(`Hay ${res.formulasWithoutValue.length} celdas con fórmula sin valor calculado (p. ej. ${res.formulasWithoutValue.slice(0, 3).join(', ')}). Abra el archivo en Excel, guárdelo y vuelva a importarlo.`);
        }
        setTable(res.table);
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        setTable(parseCsv(await file.text()));
      } else {
        setReadError('Formato no soportado. Use un archivo .xlsx o .csv.');
        return;
      }
      const m = /(\d{4}-\d{2}-\d{2})/.exec(file.name);
      setDate((d) => d || (m ? m[1] : ''));
    } catch (e) {
      setReadError((e as Error).message);
    }
  };

  const doImport = () => {
    if (!normalized) return;
    setBusy(true);
    try {
      const id = saveImport(db, { name: name.trim() || fileName, date, kind, sourceFile: fileName }, normalized);
      toast(`Importados ${normalized.records.length} registros en "${name.trim() || fileName}".`);
      setSelectedId(id);
      reset();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Importar conteos"
      onClose={() => {
        reset();
        onClose();
      }}
      actions={
        <>
          <button type="button" className="btn" onClick={() => { reset(); onClose(); }}>Cancelar</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!normalized || !normalized.records.length || duplicates || !name.trim() || busy}
            onClick={doImport}
          >
            Importar {normalized?.records.length ? `${normalized.records.length} registros` : ''}
          </button>
        </>
      }
    >
      <p className="small muted">
        Formato del estudio: <b>Desde, Hasta, Entrada 70, Salida 70, Entrada 80, Salida 80</b>. También se acepta el formato
        largo: <b>fecha, hora_inicio, hora_fin, acceso, direccion, cantidad</b>. Los conteos no se convierten en tiempos de atención.
      </p>
      <Field label="Archivo (.xlsx o .csv)" htmlFor="import-file">
        <input id="import-file" className="input" type="file" accept=".xlsx,.csv,.txt,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
      </Field>
      {readError && <Callout tone="bad">{readError}</Callout>}
      {table && (
        <>
          <div className="row-2">
            <Field label="Nombre del conjunto" htmlFor="imp-name">
              <input id="imp-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Fecha de los datos" htmlFor="imp-date" error={date && !isISODate(date) ? 'Fecha inválida' : null} hint="Se usa si el archivo no trae fecha">
              <input id="imp-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Origen de los datos">
            <Segmented<RecordOrigin>
              label="Origen"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'observado', label: 'Observado en campo' },
                { value: 'simulado', label: 'Simulado' },
                { value: 'manual', label: 'Manual' },
              ]}
            />
          </Field>
          {!isISODate(date) ? (
            <Callout>Indique la fecha de los datos para revisar el archivo.</Callout>
          ) : normalized && (
            <>
              <p className="small">
                Formato detectado: <b>{normalized.format ?? 'no reconocido'}</b> · {normalized.rowsRead} filas leídas ·{' '}
                <b>{normalized.records.length}</b> registros válidos
              </p>
              {duplicates && <Callout tone="bad">El archivo tiene registros duplicados. Corríjalos antes de importar.</Callout>}
              {errors.length > 0 && !duplicates && normalized.records.length > 0 && (
                <Callout tone="warn">{`Se importarán solo los registros válidos; ${errors.length} problema(s) se omitirán.`}</Callout>
              )}
              <IssueList issues={normalized.issues} />
            </>
          )}
        </>
      )}
    </Modal>
  );
}

export default function DataPage() {
  const { db } = useDb();
  const { confirm, toast } = useFeedback();
  const navigate = useNavigate();
  const { datasets } = useSelection();
  const [datasetId, setDatasetId] = useState<number | 0>(0);
  const [access, setAccess] = useState<AccessId | ''>('');
  const [direction, setDirection] = useState<Direction | ''>('');
  const [origin, setOrigin] = useState<RecordOrigin | ''>('');
  const [date, setDate] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [importOpen, setImportOpen] = useState(false);
  const [showIssues, setShowIssues] = useState(false);

  const records = useQuery(
    (d) => recordsRepo.list(d, {
      datasetId: datasetId || undefined, access: access || undefined, direction: direction || undefined,
      origin: origin || undefined, date: date || undefined,
    }),
    [datasetId, access, direction, origin, date],
  );
  const dates = useMemo(() => [...new Set(datasets.map((d) => d.date))].sort(), [datasets]);
  const dsName = useMemo(() => new Map(datasets.map((d) => [d.id, d])), [datasets]);
  const issues = useMemo(() => {
    if (!showIssues) return [];
    const groups = new Map<number, typeof records>();
    for (const r of records) groups.set(r.datasetId, [...(groups.get(r.datasetId) ?? []), r]);
    return [...groups.entries()].flatMap(([id, recs]) =>
      findRecordIssues(recs).map((i) => ({ ...i, message: `${dsName.get(id)?.name ?? id}: ${i.message}` })),
    );
  }, [showIssues, records, dsName]);

  const removeRecord = async (id: number) => {
    const r = records.find((x) => x.id === id);
    if (!r) return;
    const ok = await confirm({
      title: 'Eliminar registro',
      message: `Se eliminará el conteo de ${r.startTime}–${r.endTime}, ${ACCESS_LABEL[r.access]}, ${r.direction} (${r.count} vehículos). Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar registro',
      danger: true,
    });
    if (!ok) return;
    recordsRepo.remove(db, id);
    toast('Registro eliminado.');
  };

  const removeDataset = async (id: number) => {
    const d = dsName.get(id);
    if (!d) return;
    const ok = await confirm({
      title: 'Eliminar conjunto',
      message: `Se eliminarán "${d.name}" y sus ${d.recordCount ?? 0} registros. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar conjunto',
      danger: true,
    });
    if (!ok) return;
    datasetsRepo.remove(db, id);
    if (datasetId === id) setDatasetId(0);
    toast('Conjunto eliminado.');
  };

  const exportCsv = async () => {
    if (!records.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      await downloadText(recordsToCsv(records, datasets), `parksmart-registros-${stamp}.csv`);
      toast(`Exportados ${records.length} registros a CSV.`);
    } catch (e) {
      toast(`No se pudo exportar: ${(e as Error).message}`, 'error');
    }
  };

  const shown = records.slice(0, limit);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Datos vehiculares</h1>
          <p>Conteos por intervalo. Los observados y los simulados se guardan por separado.</p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}><IconUpload />Importar</button>
          <Link className="btn" to="/datos/registro/nuevo"><IconPlus />Nuevo registro</Link>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Conjuntos de datos</h2>
          <p>{datasets.length} conjunto(s)</p>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Nombre</th><th>Origen</th><th>Fecha</th><th className="n">Registros</th><th>Procedencia</th><th><span className="visually-hidden">Acciones</span></th></tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id} className={d.kind === 'simulado' ? 'row-sim' : undefined}>
                  <td><b>{d.name}</b></td>
                  <td><OriginBadge origin={d.kind} short /></td>
                  <td>{formatShortDate(d.date)}</td>
                  <td className="n">{d.recordCount}</td>
                  <td className="small muted" style={{ whiteSpace: 'normal', minWidth: 180 }}>
                    {d.sourceFile ?? (d.montecarloRunId ? `Montecarlo #${d.montecarloRunId}` : 'Registro manual')}
                    {d.referenceDatasetId ? ` · base: ${dsName.get(d.referenceDatasetId)?.name ?? `#${d.referenceDatasetId}`}` : ''}
                  </td>
                  <td>
                    <button type="button" className="icon-btn" aria-label={`Eliminar conjunto ${d.name}`} onClick={() => removeDataset(d.id)}><IconTrash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Registros</h2>
          <div className="row">
            <button type="button" className="btn btn-small" onClick={() => setShowIssues((v) => !v)}>
              {showIssues ? 'Ocultar revisión' : 'Revisar consistencia'}
            </button>
            <button type="button" className="btn btn-small" onClick={exportCsv} disabled={!records.length}><IconDownload />Exportar CSV</button>
          </div>
        </div>
        <div className="row-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 12 }}>
          <Select<number>
            label="Conjunto"
            value={datasetId}
            onChange={(v) => { setDatasetId(v); setLimit(PAGE); }}
            options={[{ value: 0, label: 'Todos' }, ...datasets.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <Select<string> label="Fecha" value={date} onChange={(v) => setDate(v)} options={[{ value: '', label: 'Todas' }, ...dates.map((d) => ({ value: d, label: formatShortDate(d) }))]} />
          <Select<string> label="Acceso" value={access} onChange={(v) => setAccess(v as AccessId | '')} options={[{ value: '', label: 'Ambos' }, { value: 'C70', label: 'Carrera 70' }, { value: 'C80', label: 'Carrera 80' }]} />
          <Select<string> label="Dirección" value={direction} onChange={(v) => setDirection(v as Direction | '')} options={[{ value: '', label: 'Ambas' }, { value: 'entrada', label: 'Entrada' }, { value: 'salida', label: 'Salida' }]} />
          <Select<string> label="Origen" value={origin} onChange={(v) => setOrigin(v as RecordOrigin | '')} options={[{ value: '', label: 'Todos' }, { value: 'observado', label: 'Observado' }, { value: 'simulado', label: 'Simulado' }, { value: 'manual', label: 'Manual' }]} />
        </div>

        {showIssues && <div style={{ marginBottom: 12 }}><IssueList issues={issues} /></div>}

        {records.length === 0 ? (
          <EmptyState icon={<IconTable />} title="No hay registros con estos filtros" action={<Link className="btn" to="/datos/registro/nuevo"><IconPlus />Registrar un conteo</Link>}>
            Cambie los filtros, importe un archivo o registre un conteo a mano.
          </EmptyState>
        ) : (
          <>
            <p className="small muted" style={{ marginBottom: 8 }}>
              {records.length} registro(s) · {records.reduce((a, r) => a + r.count, 0).toLocaleString('es-CO')} vehículos
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Intervalo</th><th>Fecha</th><th>Acceso</th><th>Dirección</th><th className="n">Vehículos</th><th>Origen</th><th>Conjunto</th><th><span className="visually-hidden">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className={r.origin === 'simulado' ? 'row-sim' : undefined}>
                      <td><b>{r.startTime}–{r.endTime}</b></td>
                      <td>{formatShortDate(r.date)}</td>
                      <td>{r.access === 'C70' ? '70' : '80'}</td>
                      <td>{r.direction}</td>
                      <td className="n"><b>{r.count}</b></td>
                      <td><OriginBadge origin={r.origin} short /></td>
                      <td className="small muted">{dsName.get(r.datasetId)?.name}</td>
                      <td>
                        <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                          <button type="button" className="icon-btn" aria-label={`Editar registro ${r.startTime} ${r.access} ${r.direction}`} onClick={() => navigate(`/datos/registro/${r.id}`)}><IconEdit /></button>
                          <button type="button" className="icon-btn" aria-label={`Eliminar registro ${r.startTime} ${r.access} ${r.direction}`} onClick={() => removeRecord(r.id)}><IconTrash /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {records.length > limit && (
              <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={() => setLimit((l) => l + PAGE)}>
                Mostrar {Math.min(PAGE, records.length - limit)} más de {records.length - limit} restantes
              </button>
            )}
          </>
        )}
      </section>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
