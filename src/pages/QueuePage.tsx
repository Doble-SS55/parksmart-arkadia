import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BarrierSettings } from '../components/BarrierSettings';
import { DatasetPicker } from '../components/DatasetPicker';
import { IconSave, IconTrash } from '../components/Icons';
import { Callout, EmptyState, Field, Metric, NumberInput, RiskTag, Segmented, Select, SourceBadge, Stepper, useFeedback } from '../components/ui';
import { estimateArrivalRate, periodIndices } from '../core/data/aggregate';
import { fmt, fmtDateTime, fmtPct } from '../core/format';
import { formulaLines, VARIABLE_GLOSSARY } from '../core/queueing/formulas';
import { dispersionTest } from '../core/queueing/poissonCheck';
import {
  convertRate,
  convertTime,
  probWaitExceeds,
  saturationRisk,
  serviceRateFromSeconds,
  solveQueue,
  TIME_UNIT_LABEL,
  type QueueModel,
  type TimeUnit,
} from '../core/queueing/queueing';
import { ACCESS_LABEL, flowId, type AccessId, type Direction } from '../core/types';
import { queueResultsRepo, serverConfigRepo } from '../db/repositories';
import { getSeries } from '../services/datasets';
import { useDb, useQuery } from '../state/DbProvider';
import { useSelection } from '../state/selection';

export function QueueTabs() {
  return (
    <nav className="tabs" aria-label="Teoría de colas">
      <NavLink end to="/colas" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Modelo M/M/1 y M/M/s</NavLink>
      <NavLink to="/colas/escenarios" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Comparar escenarios</NavLink>
    </nav>
  );
}

export default function QueuePage() {
  const { db } = useDb();
  const { toast } = useFeedback();
  const { datasets, selected } = useSelection();
  const [datasetId, setDatasetId] = useState<number | null>(selected?.id ?? null);
  const dataset = datasets.find((d) => d.id === datasetId) ?? selected;
  const [access, setAccess] = useState<AccessId>('C80');
  const [direction, setDirection] = useState<Direction>('entrada');
  const [model, setModel] = useState<QueueModel>('MMS');
  const [demandMode, setDemandMode] = useState<'promedio' | 'pico'>('promedio');
  const [unit, setUnit] = useState<TimeUnit>('min');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const series = useQuery((d) => (dataset ? getSeries(d, dataset.id) : null), [dataset?.id]);
  const cfg = useQuery((d) => serverConfigRepo.get(d, access, direction), [access, direction]);
  const saved = useQuery((d) => queueResultsRepo.list(d).slice(0, 6));

  const [servers, setServers] = useState(cfg?.existingServers ?? 1);
  const [serviceSeconds, setServiceSeconds] = useState<number | ''>(cfg?.meanServiceSeconds ?? 5);
  useEffect(() => {
    if (!cfg) return;
    setServers(cfg.existingServers);
    setServiceSeconds(cfg.meanServiceSeconds);
  }, [cfg?.access, cfg?.direction, cfg?.existingServers, cfg?.meanServiceSeconds]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setFrom('');
    setTo('');
  }, [dataset?.id]);

  const s = model === 'MM1' ? 1 : servers;
  const flow = flowId(access, direction);
  const range = useMemo(() => (series ? periodIndices(series, from || null, to || null) : ([0, 0] as [number, number])), [series, from, to]);
  const estimate = useMemo(() => (series ? estimateArrivalRate(series, flow, range) : null), [series, flow, range]);
  const exitEstimate = useMemo(
    () => (series ? estimateArrivalRate(series, flowId(access, direction === 'entrada' ? 'salida' : 'entrada'), range) : null),
    [series, access, direction, range],
  );
  const lambda = estimate ? (demandMode === 'pico' ? estimate.peakLambdaPerMin : estimate.lambdaPerMin) : NaN;
  const mu = serviceRateFromSeconds(serviceSeconds === '' ? 0 : serviceSeconds);
  const result = useMemo(() => solveQueue({ model, lambda, mu, servers: s }), [model, lambda, mu, s]);
  const dispersion = useMemo(() => (estimate ? dispersionTest(estimate.counts) : null), [estimate]);
  const sensitivity = useMemo(
    () => Array.from({ length: 4 }, (_, i) => i + 1).map((k) => ({ k, r: solveQueue({ model: k === 1 ? 'MM1' : 'MMS', lambda, mu, servers: k }) })),
    [lambda, mu],
  );

  if (!dataset || !series) {
    return <EmptyState title="No hay datos para modelar">Importe o registre conteos en el módulo de datos.</EmptyState>;
  }
  if (estimate && estimate.intervals === 0) {
    // periodo vacío: se informa en el panel de resultados
  }

  const hypothetical = cfg ? Math.max(0, s - cfg.existingServers) : 0;
  const rate = (v: number) => fmt(convertRate(v, unit), unit === 's' ? 4 : 3);
  const time = (v: number) => fmt(convertTime(v, unit), unit === 'h' ? 5 : 3);
  const minStable = Number.isFinite(lambda) && mu > 0 ? Math.floor(lambda / mu) + 1 : null;

  const saveResult = () => {
    if (result.status === 'invalid') return;
    queueResultsRepo.create(db, {
      datasetId: dataset.id,
      access,
      direction,
      model,
      lambda,
      mu,
      servers: s,
      periodStart: series.starts[range[0]] ?? null,
      periodEnd: series.ends[range[1] - 1] ?? null,
      stable: result.status === 'stable',
      result: {
        ...result,
        meta: {
          datasetName: dataset.name, datasetKind: dataset.kind, demandMode, serviceSeconds, hypotheticalServers: hypothetical,
          serviceSource: cfg?.serviceSource, serversSource: cfg?.serversSource,
        },
      } as typeof result & { meta: Record<string, unknown> },
    });
    toast('Resultado guardado. Aparecerá en el informe PDF.');
  };

  const startOptions = series.starts.map((t) => ({ value: t, label: t }));
  const endOptions = series.ends.map((t) => ({ value: t, label: t }));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Teoría de colas</h1>
          <p>Cada acceso y cada dirección se modelan como un sistema independiente con fila única.</p>
        </div>
      </div>
      <QueueTabs />

      <div className="grid-2 grid-config">
        <section className="section form" aria-label="Configuración del modelo">
          <DatasetPicker datasets={datasets} value={dataset} onChange={setDatasetId} />
          <Field label="Acceso">
            <Segmented<AccessId> label="Acceso" value={access} onChange={setAccess} options={[{ value: 'C70', label: 'Carrera 70' }, { value: 'C80', label: 'Carrera 80' }]} />
          </Field>
          <Field
            label="Barrera"
            hint={direction === 'entrada'
              ? 'Llegadas = vehículos contados entrando por este acceso.'
              : 'Supuesto: las llegadas a la barrera de salida se aproximan con los vehículos contados saliendo.'}
          >
            <Segmented<Direction> label="Barrera" value={direction} onChange={setDirection} options={[{ value: 'entrada', label: 'Entrada' }, { value: 'salida', label: 'Salida' }]} />
          </Field>
          <div className="row-2">
            <Select<string> label="Desde" value={from || series.starts[0] || ''} onChange={setFrom} options={startOptions} />
            <Select<string> label="Hasta" value={to || series.ends[series.ends.length - 1] || ''} onChange={setTo} options={endOptions} />
          </div>
          <Field label="Demanda a evaluar" hint={demandMode === 'pico' ? `Intervalo pico: ${estimate?.peakInterval?.start ?? '—'}–${estimate?.peakInterval?.end ?? ''}` : 'Promedio de todo el periodo elegido.'}>
            <Segmented label="Demanda" value={demandMode} onChange={setDemandMode} options={[{ value: 'promedio', label: 'Promedio' }, { value: 'pico', label: 'Intervalo pico' }]} />
          </Field>
          <Field label="Modelo">
            <Segmented<QueueModel> label="Modelo" value={model} onChange={(m) => { setModel(m); if (m === 'MM1') setServers(1); else if (servers === 1 && cfg) setServers(Math.max(2, cfg.existingServers)); }} options={[{ value: 'MM1', label: 'M/M/1' }, { value: 'MMS', label: 'M/M/s' }]} />
          </Field>
          <Field label="Número de barreras (s)" hint={cfg ? `Existentes: ${cfg.existingServers}. ${hypothetical ? `${hypothetical} barrera(s) hipotética(s).` : ''}` : undefined}>
            <div className="row">
              <Stepper label="barreras" value={s} min={1} max={model === 'MM1' ? 1 : 12} onChange={setServers} />
              {cfg && <SourceBadge source={hypothetical ? 'hipotetico' : cfg.serversSource} />}
            </div>
          </Field>
          <NumberInput
            label="Tiempo medio de atención por vehículo"
            suffix="s"
            value={serviceSeconds}
            min={0}
            step={0.1}
            onChange={setServiceSeconds}
            error={serviceSeconds === '' || serviceSeconds <= 0 ? 'Debe ser mayor que 0 segundos.' : null}
            hint={cfg ? <span className="row" style={{ gap: 6 }}>Valor del acceso: {cfg.meanServiceSeconds} s {cfg.serviceMinSeconds !== null ? `(rango ${cfg.serviceMinSeconds}–${cfg.serviceMaxSeconds} s)` : ''} <SourceBadge source={serviceSeconds === cfg.meanServiceSeconds ? cfg.serviceSource : 'hipotetico'} /></span> : undefined}
          />
          <Field label="Unidad para mostrar resultados">
            <Segmented<TimeUnit> label="Unidad" value={unit} onChange={setUnit} options={[{ value: 's', label: 'Segundos' }, { value: 'min', label: 'Minutos' }, { value: 'h', label: 'Horas' }]} />
          </Field>
        </section>

        <div className="stack" style={{ marginTop: 0 }}>
          {dataset.kind === 'simulado' && <Callout tone="warn">La tasa de llegada sale de datos simulados, no de una medición.</Callout>}
          {estimate && (
            <section className="section">
              <div className="section-head">
                <h2>Tasa de llegada estimada</h2>
                <p>{ACCESS_LABEL[access]} · {direction} · {series.starts[range[0]] ?? '—'}–{series.ends[range[1] - 1] ?? '—'}</p>
              </div>
              <div className="metrics">
                <Metric label="Vehículos en el periodo" value={estimate.vehicles} note={`${estimate.intervals} intervalos · ${estimate.minutes} min`} />
                <Metric label="λ promedio" value={rate(estimate.lambdaPerMin)} unit={`veh/${unit}`} />
                <Metric label="λ del intervalo pico" value={rate(estimate.peakLambdaPerMin)} unit={`veh/${unit}`} />
                <Metric
                  label={direction === 'entrada' ? 'Salidas observadas (referencia)' : 'Entradas observadas (referencia)'}
                  value={rate(exitEstimate?.lambdaPerMin ?? 0)}
                  unit={`veh/${unit}`}
                  note="No se usa como λ ni como μ"
                />
              </div>
            </section>
          )}

          <section className="section" aria-live="polite">
            <div className="section-head">
              <h2>Resultados {model === 'MM1' ? 'M/M/1' : `M/M/${s}`}</h2>
              {result.status !== 'invalid' && <RiskTag risk={saturationRisk(result.rho)} />}
            </div>
            {result.status === 'invalid' && (
              <Callout tone="bad" title="No se puede calcular">
                <ul style={{ margin: 0, paddingLeft: 18 }}>{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                {estimate?.intervals === 0 && <p>El periodo elegido no tiene intervalos: revise "Desde" y "Hasta".</p>}
              </Callout>
            )}
            {result.status === 'unstable' && (
              <>
                <Callout tone="bad" title="El sistema no tiene equilibrio estacionario">
                  <p>{result.message}</p>
                  {minStable !== null && <p>Con estos datos se necesitarían al menos <b>{minStable}</b> barrera(s) para que ρ &lt; 1 (sin contar otras mejoras).</p>}
                </Callout>
                <div className="metrics" style={{ marginTop: 12 }}>
                  <Metric label="λ" value={rate(result.lambda)} unit={`veh/${unit}`} />
                  <Metric label="Capacidad s·μ" value={rate(result.capacity)} unit={`veh/${unit}`} />
                  <Metric label="Utilización ρ" value={fmt(result.rho, 3)} />
                </div>
              </>
            )}
            {result.status === 'stable' && (
              <>
                <div className="metrics">
                  <Metric label="λ (llegadas)" value={rate(result.lambda)} unit={`veh/${unit}`} />
                  <Metric label="μ (por barrera)" value={rate(result.mu)} unit={`veh/${unit}`} />
                  <Metric label="Barreras s" value={result.servers} />
                  <Metric label="Utilización ρ" value={fmtPct(result.rho)} note={fmt(result.rho, 4)} />
                  <Metric label="P₀ sistema vacío" value={fmt(result.p0, 4)} />
                  <Metric label={s > 1 ? 'Prob. de esperar (Erlang C)' : 'Prob. de esperar'} value={fmtPct(result.pWait)} />
                  <Metric label="Lq en fila" value={fmt(result.lq, 4)} unit="veh" />
                  <Metric label="L en el sistema" value={fmt(result.l, 4)} unit="veh" />
                  <Metric label="Wq espera en fila" value={time(result.wq)} unit={unit} />
                  <Metric label="W tiempo total" value={time(result.w)} unit={unit} />
                </div>
                <p className="small muted" style={{ marginTop: 10 }}>
                  Ley de Little: L = λ·W → {fmt(result.l, 6)} = {fmt(result.lambda * result.w, 6)} (diferencia {result.littleResidual.toExponential(1)}).
                  {' '}Probabilidad de esperar más de 30 s: {fmtPct(probWaitExceeds(result, 0.5), 2)}.
                </p>
              </>
            )}
            {result.status !== 'invalid' && (
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-small" onClick={saveResult}><IconSave />Guardar resultado</button>
              </div>
            )}
          </section>

          {result.status !== 'invalid' && (
            <section className="section">
              <div className="section-head">
                <h2>Ecuaciones con los valores actuales</h2>
                <p>Unidad: {TIME_UNIT_LABEL[unit]}</p>
              </div>
              <ol className="formula-list">
                {formulaLines(result, unit).map((f) => (
                  <li key={f.symbol + f.name} className="formula">
                    <span className="small"><b>{f.name}</b></span>
                    <span className="formula-expr">{f.expression}</span>
                    <span className="formula-sub num">{f.substituted}</span>
                  </li>
                ))}
              </ol>
              <details className="disclosure" style={{ marginTop: 10 }}>
                <summary>Significado de cada variable</summary>
                <table className="table">
                  <tbody>
                    {VARIABLE_GLOSSARY.map(([k, v]) => (
                      <tr key={k}><td><b>{k}</b></td><td style={{ whiteSpace: 'normal' }}>{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
          )}

          <section className="section">
            <div className="section-head">
              <h2>Sensibilidad al número de barreras</h2>
              <p>Misma demanda y tiempo de atención</p>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Barreras</th><th className="n">ρ</th><th className="n">Prob. esperar</th><th className="n">Lq</th><th className="n">Wq ({unit})</th><th>Estado</th></tr></thead>
                <tbody>
                  {sensitivity.map(({ k, r }) => (
                    <tr key={k}>
                      <td>{k}{cfg && k > cfg.existingServers ? ' (hipotética)' : cfg && k === cfg.existingServers ? ' (existente)' : ''}</td>
                      <td className="n">{r.status === 'invalid' ? '—' : fmt(r.rho, 3)}</td>
                      <td className="n">{r.status === 'stable' ? fmtPct(r.pWait) : '—'}</td>
                      <td className="n">{r.status === 'stable' ? fmt(r.lq, 3) : '∞'}</td>
                      <td className="n">{r.status === 'stable' ? time(r.wq) : '∞'}</td>
                      <td>{r.status === 'invalid' ? '—' : <RiskTag risk={saturationRisk(r.rho)} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {dispersion && (
            <section className="section">
              <div className="section-head">
                <h2>¿Las llegadas parecen Poisson?</h2>
                <p>Índice de dispersión de los conteos por intervalo</p>
              </div>
              <div className="metrics">
                <Metric label="Media por intervalo" value={fmt(dispersion.mean, 2)} />
                <Metric label="Varianza" value={fmt(dispersion.variance, 2)} />
                <Metric label="D = s² / x̄" value={fmt(dispersion.index, 3)} />
                <Metric label="Valor p" value={fmt(dispersion.pValue, 3)} note={`χ² = ${fmt(dispersion.chiSquare, 2)}, gl = ${dispersion.df}`} />
              </div>
              <div style={{ marginTop: 10 }}>
                <Callout tone={dispersion.verdict === 'compatible' ? 'good' : dispersion.verdict === 'insuficiente' ? 'info' : 'warn'}>{dispersion.explanation}</Callout>
              </div>
            </section>
          )}

          <Callout tone="info" title="Supuestos del modelo">
            <p>Llegadas Poisson, tiempos de atención exponenciales, fila única por acceso, disciplina primero en llegar primero en ser atendido, capacidad de fila ilimitada y estado estacionario.</p>
            <p>El tiempo de atención por defecto proviene de la subida de barrera observada (4–6 s). Si no incluye todo el ciclo del vehículo, la espera real será mayor.</p>
          </Callout>
        </div>
      </div>

      <BarrierSettings />

      {saved.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Resultados guardados</h2><p>Los más recientes se incluyen en el informe</p></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fecha</th><th>Acceso</th><th>Modelo</th><th className="n">λ (veh/min)</th><th className="n">ρ</th><th className="n">Wq (s)</th><th /></tr></thead>
              <tbody>
                {saved.map((q) => (
                  <tr key={q.id}>
                    <td className="small">{fmtDateTime(q.createdAt)}</td>
                    <td>{ACCESS_LABEL[q.access]} · {q.direction}</td>
                    <td>{q.model === 'MM1' ? 'M/M/1' : `M/M/${q.servers}`}</td>
                    <td className="n">{fmt(q.lambda, 3)}</td>
                    <td className="n">{q.result.status === 'invalid' ? '—' : fmt(q.result.rho, 3)}</td>
                    <td className="n">{q.result.status === 'stable' ? fmt(q.result.wq * 60, 2) : '∞'}</td>
                    <td><button type="button" className="icon-btn" aria-label="Eliminar resultado guardado" onClick={() => queueResultsRepo.remove(db, q.id)}><IconTrash /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
