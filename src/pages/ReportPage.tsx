import { useState } from 'react';
import { IconDownload, IconReport, IconUpload } from '../components/Icons';
import { Callout, Field, Segmented, Select, useFeedback } from '../components/ui';
import { fmtDateTime } from '../core/format';
import { reportsRepo, settingsRepo, montecarloRepo, simulationRepo, queueResultsRepo } from '../db/repositories';
import { downloadPdf } from '../platform/pdf';
import { downloadBlob } from '../platform/storage';
import { buildReportData } from '../services/reportData';
import { buildReportDocument } from '../services/reportPdf';
import { useDb, useQuery } from '../state/DbProvider';
import { useSelection } from '../state/selection';
import { useTheme, type ThemePreference } from '../state/theme';

export default function ReportPage() {
  const { db, replaceDatabase } = useDb();
  const { toast, confirm } = useFeedback();
  const { datasets } = useSelection();
  const { preference, setPreference } = useTheme();
  const observed = datasets.filter((d) => d.kind !== 'simulado');
  const simulated = datasets.filter((d) => d.kind === 'simulado');
  const [obsId, setObsId] = useState<number>(observed[0]?.id ?? 0);
  const [simId, setSimId] = useState<number>(simulated[0]?.id ?? 0);
  const [includeExits, setIncludeExits] = useState(true);
  const [includeAnnex, setIncludeAnnex] = useState(true);
  const [busy, setBusy] = useState(false);
  const settings = useQuery((d) => ({
    team: settingsRepo.get(d, 'team') ?? '',
    course: settingsRepo.get(d, 'course') ?? '',
    teacher: settingsRepo.get(d, 'teacher') ?? '',
    institution: settingsRepo.get(d, 'institution') ?? '',
  }));
  const [team, setTeam] = useState(settings.team);
  const [course, setCourse] = useState(settings.course);
  const [teacher, setTeacher] = useState(settings.teacher);
  const [institution, setInstitution] = useState(settings.institution);
  const reports = useQuery((d) => reportsRepo.list(d).slice(0, 8));
  const counts = useQuery((d) => ({
    mc: montecarloRepo.list(d).length,
    des: simulationRepo.list(d).length,
    queues: queueResultsRepo.list(d).length,
  }));

  const saveSettings = () => {
    db.transaction(() => {
      settingsRepo.set(db, 'team', team.trim());
      settingsRepo.set(db, 'course', course.trim());
      settingsRepo.set(db, 'teacher', teacher.trim());
      settingsRepo.set(db, 'institution', institution.trim());
    });
  };

  const generate = async () => {
    if (!obsId) return;
    setBusy(true);
    try {
      saveSettings();
      const options = { observedDatasetId: obsId, simulatedDatasetId: simId || null, includeExits, includeAnnex };
      const doc = buildReportDocument(buildReportData(db, options));
      const n = new Date();
      const pad = (x: number) => String(x).padStart(2, '0');
      const stamp = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}-${pad(n.getHours())}${pad(n.getMinutes())}`;
      const fileName = `informe-parksmart-arkadia-${stamp}.pdf`;
      await downloadPdf(doc, fileName);
      reportsRepo.create(db, { title: 'Informe de modelamiento y simulación', fileName, params: options });
      toast('Informe PDF listo.');
    } catch (e) {
      toast(`No se pudo generar el informe: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      await downloadBlob(new Blob([db.export().slice().buffer], { type: 'application/x-sqlite3' }), `parksmart-arkadia-${stamp}.sqlite`);
      toast('Respaldo de la base de datos listo.');
    } catch (e) {
      toast(`No se pudo guardar el respaldo: ${(e as Error).message}`, 'error');
    }
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    const ok = await confirm({
      title: 'Restaurar respaldo',
      message: `Se reemplazarán todos los datos de este dispositivo por el contenido de "${file.name}".`,
      confirmLabel: 'Restaurar',
      danger: true,
    });
    if (!ok) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (new TextDecoder().decode(bytes.slice(0, 15)) !== 'SQLite format 3') throw new Error('El archivo no es una base SQLite.');
      await replaceDatabase(bytes);
      toast('Respaldo restaurado.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const resetAll = async () => {
    const ok = await confirm({
      title: 'Restablecer datos de ejemplo',
      message: 'Se borrarán los conjuntos importados, registros manuales, simulaciones y resultados guardados. Quedarán solo los datos del viernes y del sábado originales. Descargue un respaldo antes si lo necesita.',
      confirmLabel: 'Borrar y restablecer',
      danger: true,
    });
    if (!ok) return;
    await replaceDatabase(null);
    toast('Se restablecieron los datos de ejemplo.');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Informe PDF</h1>
          <p>Documento académico generado con los datos y resultados guardados en la aplicación.</p>
        </div>
      </div>

      <div className="grid-2 grid-config">
        <section className="section form" aria-label="Portada">
          <h2>Portada</h2>
          <Field label="Integrantes (uno por línea)" htmlFor="rp-team">
            <textarea id="rp-team" className="textarea" value={team} onChange={(e) => setTeam(e.target.value)} />
          </Field>
          <Field label="Curso" htmlFor="rp-course">
            <input id="rp-course" className="input" value={course} onChange={(e) => setCourse(e.target.value)} />
          </Field>
          <Field label="Docente" htmlFor="rp-teacher">
            <input id="rp-teacher" className="input" value={teacher} onChange={(e) => setTeacher(e.target.value)} />
          </Field>
          <Field label="Institución (opcional)" htmlFor="rp-inst">
            <input id="rp-inst" className="input" value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </Field>
          <button type="button" className="btn btn-small" onClick={() => { saveSettings(); toast('Datos de portada guardados.'); }}>Guardar portada</button>
        </section>

        <section className="section form" aria-label="Contenido del informe">
          <h2>Contenido</h2>
          <Select<number> label="Datos observados" value={obsId} onChange={setObsId} options={observed.map((d) => ({ value: d.id, label: d.name }))} />
          <Select<number> label="Datos simulados" value={simId} onChange={setSimId} options={[{ value: 0, label: 'No incluir' }, ...simulated.map((d) => ({ value: d.id, label: d.name }))]} />
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={includeExits} onChange={(e) => setIncludeExits(e.target.checked)} />
            Incluir las barreras de salida en el análisis de colas
          </label>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={includeAnnex} onChange={(e) => setIncludeAnnex(e.target.checked)} />
            Incluir anexos con los conteos por intervalo
          </label>
          <Callout>
            <p>Se incluyen: objetivo, datos y procedencia, metodología, parámetros, fórmulas, resultados de colas, verificación de Poisson, Montecarlo, eventos discretos, escenarios, interpretación, limitaciones, conclusiones y recomendaciones.</p>
            <p>{`Guardados que entrarán al informe: ${counts.queues} resultado(s) de colas, ${counts.mc ? 'la última' : 'ninguna'} ejecución Montecarlo y ${counts.des ? 'la última' : 'ninguna'} simulación de eventos discretos.`}</p>
          </Callout>
          {(!counts.mc || !counts.des) && (
            <Callout tone="warn">
              {`${!counts.mc ? 'Guarde una ejecución en Simular › Montecarlo. ' : ''}${!counts.des ? 'Guarde una corrida en Simular › Simulador visual. ' : ''}Sin ellas esas secciones quedarán vacías.`}
            </Callout>
          )}
          <button type="button" className="btn btn-primary btn-block" onClick={generate} disabled={busy || !obsId}>
            <IconReport />{busy ? 'Generando…' : 'Descargar informe PDF'}
          </button>
        </section>
      </div>

      {reports.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Informes generados</h2><p>Para volver a descargar uno, genérelo de nuevo: siempre usa los datos actuales.</p></div>
          <ul className="issue-list" style={{ maxHeight: 'none' }}>
            {reports.map((r) => (
              <li key={r.id}><span>{r.fileName}</span><span className="muted">· {fmtDateTime(r.createdAt)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Apariencia</h2>
          <p>El informe PDF siempre sale en colores claros para imprimir.</p>
        </div>
        <Segmented<ThemePreference>
          label="Tema"
          value={preference}
          onChange={setPreference}
          options={[{ value: 'sistema', label: 'Según el dispositivo' }, { value: 'claro', label: 'Claro' }, { value: 'oscuro', label: 'Oscuro' }]}
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Datos de este dispositivo</h2>
          <p>La base de datos SQLite vive en el navegador. Respáldela para pasarla a otro equipo.</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={exportBackup}><IconDownload />Descargar respaldo (.sqlite)</button>
          <label className="btn">
            <IconUpload />Restaurar respaldo
            <input type="file" accept=".sqlite,.db,application/x-sqlite3" className="visually-hidden" onChange={(e) => importBackup(e.target.files?.[0])} />
          </label>
          <button type="button" className="btn btn-danger" onClick={resetAll}>Restablecer datos de ejemplo</button>
        </div>
      </section>
    </div>
  );
}
