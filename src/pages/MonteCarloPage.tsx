import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChartFrame, useChartColors, Histogram, Legend, LineChart } from '../components/charts/charts';
import { IconDice, IconPlay, IconSave, IconTrash } from '../components/Icons';
import { Callout, Field, Metric, NumberInput, Progress, Select, useFeedback } from '../components/ui';
import { fmt, fmtDateTime, fmtInt, fmtPct, fmtSigned } from '../core/format';
import { DEFAULT_MC_CONFIG, runMonteCarloAsync, validateMonteCarloConfig, type MonteCarloConfig, type MonteCarloResult } from '../core/montecarlo/engine';
import { NOTEBOOK_PARAMS, reproduceNotebookSaturday, type NotebookResult } from '../core/montecarlo/notebookReference';
import { histogram, toStoredParams, toStoredSummary } from '../core/montecarlo/summary';
import { GENERATOR_LABEL, type GeneratorKind } from '../core/random/rng';
import { serviceRateFromSeconds } from '../core/queueing/queueing';
import { addMinutesHHMM } from '../core/time';
import { FLOW_IDS, FLOW_LABEL, flowKey, type FlowId } from '../core/types';
import { montecarloRepo, serverConfigRepo, type MonteCarloRunRecord } from '../db/repositories';
import { getSeries, saveSyntheticDataset } from '../services/datasets';
import { useDb, useQuery } from '../state/DbProvider';
import { useSelection } from '../state/selection';

export function SimTabs() {
  return (
    <nav className="tabs" aria-label="Simulación">
      <NavLink end to="/simular" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Montecarlo</NavLink>
      <NavLink to="/simular/visual" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Simulador visual</NavLink>
    </nav>
  );
}

const SIM_PRESETS = [1, 100, 1000, 10000];

function NotebookCard({ baseId }: { baseId: number }) {
  const { datasets } = useSelection();
  const series = useQuery((d) => getSeries(d, baseId), [baseId]);
  const saturday = datasets.find((d) => d.kind === 'simulado' && d.isSeed);
  const satSeries = useQuery((d) => (saturday ? getSeries(d, saturday.id) : null), [saturday?.id]);
  const [res, setRes] = useState<NotebookResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = () => {
    try {
      setErr(null);
      const matrix = series.starts.map((_, i) => FLOW_IDS.map((f) => series.values[f][i]));
      setRes(reproduceNotebookSaturday(matrix));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const comparison = useMemo(() => {
    if (!res || !satSeries) return null;
    let equal = 0;
    let total = 0;
    res.rows.forEach((row) => {
      const idx = satSeries.starts.indexOf(row.start);
      FLOW_IDS.forEach((f, j) => {
        total++;
        if (idx >= 0 && satSeries.values[f][idx] === row.values[j]) equal++;
      });
    });
    return { equal, total };
  }, [res, satSeries]);

  return (
    <section className="section">
      <div className="section-head">
        <h2>Escenario de referencia: sábado 7 de noviembre</h2>
        <p>Reproduce el notebook de Colab con sus mismos parámetros</p>
      </div>
      <p className="small">
        Semilla {NOTEBOOK_PARAMS.seed} · Mersenne Twister (igual a Python) · aumentos E70 +25 %, S70 +15 %, E80 +30 %, S80 +20 % ·
        variación senoidal ±10 % · baja actividad con probabilidad 4,5 % (λ × 0,18) · 19:30–20:00 extrapolado con la media de 19:00–19:30.
      </p>
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn" onClick={run}><IconPlay />Reproducir notebook</button>
      </div>
      {err && <div style={{ marginTop: 10 }}><Callout tone="bad">{err}</Callout></div>}
      {res && (
        <div className="stack">
          {comparison && (
            <Callout tone={comparison.equal === comparison.total ? 'good' : 'warn'} title={`${comparison.equal} de ${comparison.total} valores coinciden con el CSV del sábado guardado`}>
              {comparison.equal === comparison.total
                ? 'La app genera exactamente los mismos números que el notebook: el generador y el algoritmo son equivalentes.'
                : 'Hay diferencias con el conjunto del sábado guardado (¿se modificó el conjunto base o el del sábado?).'}
            </Callout>
          )}
          <div className="metrics">
            {FLOW_IDS.map((f, j) => <Metric key={f} label={`${FLOW_LABEL[f]} (total)`} value={res.totals[j]} note={`tope ${res.caps[j]}`} />)}
          </div>
          <Callout tone="warn" title="Diferencia metodológica con el notebook">
            <p>
              El notebook recorta cada conteo a un tope de 1,35 × el máximo del viernes. Ese tope es un supuesto, no una capacidad física
              medida, y los vehículos recortados desaparecen. En esta corrida el tope recortó {res.truncations.length} valor(es)
              {res.truncations.length ? ` (${res.truncations.map((t) => `${t.start} ${FLOW_IDS[t.flow]}: ${t.drawn}→${t.cap}`).join(', ')})` : ''}.
            </p>
            <p>El motor Montecarlo de esta pantalla no recorta: si configura una capacidad, el exceso queda en fila.</p>
          </Callout>
        </div>
      )}
    </section>
  );
}

export default function MonteCarloPage() {
  const { db } = useDb();
  const CC = useChartColors();
  const { toast } = useFeedback();
  const { datasets, setSelectedId } = useSelection();
  const observed = datasets.filter((d) => d.kind === 'observado');
  const [baseId, setBaseId] = useState<number>(observed[0]?.id ?? datasets[0]?.id ?? 0);
  const base = datasets.find((d) => d.id === baseId) ?? null;
  const series = useQuery((d) => (baseId ? getSeries(d, baseId) : null), [baseId]);
  const configs = useQuery((d) => serverConfigRepo.list(d));
  const runs = useQuery((d) => montecarloRepo.list(d));

  const [flows, setFlows] = useState<FlowId[]>(['E80']);
  const [changePct, setChangePct] = useState<number | ''>(20);
  const [simulations, setSimulations] = useState<number | ''>(1000);
  const [seed, setSeed] = useState<number | ''>(DEFAULT_MC_CONFIG.seed);
  const [generator, setGenerator] = useState<GeneratorKind>('mt19937');
  const [amplitude, setAmplitude] = useState<number | ''>(10);
  const [halfPeriod, setHalfPeriod] = useState<number | ''>(12);
  const [lowProb, setLowProb] = useState<number | ''>(4.5);
  const [lowFactor, setLowFactor] = useState<number | ''>(18);
  const [extra, setExtra] = useState<number | ''>(0);
  const [capacityMode, setCapacityMode] = useState<'ninguna' | 'barreras' | 'manual'>('ninguna');
  const [manualCap, setManualCap] = useState<number | ''>(40);
  const [totalThreshold, setTotalThreshold] = useState<number | ''>('');
  const [intervalThreshold, setIntervalThreshold] = useState<number | ''>('');
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [savedRunId, setSavedRunId] = useState<number | null>(null);
  const [runName, setRunName] = useState('');
  const [synthDate, setSynthDate] = useState('2026-11-14');
  const [compare, setCompare] = useState<number[]>([]);

  const step = series?.intervalMinutes ?? 5;
  const barrierCapacity = useMemo(() => {
    // Capacidad por intervalo y por flujo con las barreras configuradas: s · μ · duración del intervalo.
    if (!flows.length) return null;
    const caps = flows.map((f) => {
      const k = flowKey(f);
      const c = configs.find((x) => x.access === k.access && x.direction === k.direction);
      return c ? c.existingServers * serviceRateFromSeconds(c.meanServiceSeconds) * step : null;
    });
    return caps.every((c) => c !== null) ? Math.min(...(caps as number[])) : null;
  }, [flows, configs, step]);

  const config: MonteCarloConfig | null = useMemo(() => {
    if (!series) return null;
    const n = (v: number | '', d: number) => (v === '' ? d : v);
    return {
      ...DEFAULT_MC_CONFIG,
      flows: flows.map((f) => ({ flow: f, base: series.values[f] })),
      intervalMinutes: step,
      demandFactor: 1 + n(changePct, 0) / 100,
      simulations: n(simulations, 0),
      seed: n(seed, -1),
      generator,
      temporalAmplitude: n(amplitude, 0) / 100,
      temporalHalfPeriod: n(halfPeriod, 12),
      lowActivityProbability: n(lowProb, 0) / 100,
      lowActivityFactor: n(lowFactor, 100) / 100,
      extraIntervals: n(extra, 0),
      extrapolationWindow: 6,
      capacityPerInterval: capacityMode === 'ninguna' ? null : capacityMode === 'barreras' ? barrierCapacity : n(manualCap, 0),
      totalThreshold: totalThreshold === '' ? null : totalThreshold,
      intervalThreshold: intervalThreshold === '' ? null : intervalThreshold,
    };
  }, [series, flows, step, changePct, simulations, seed, generator, amplitude, halfPeriod, lowProb, lowFactor, extra, capacityMode, barrierCapacity, manualCap, totalThreshold, intervalThreshold]);

  const errors = config ? validateMonteCarloConfig(config) : ['Seleccione un conjunto base.'];

  const run = async () => {
    if (!config || errors.length) return;
    setProgress(0);
    setResult(null);
    setSavedRunId(null);
    try {
      const r = await runMonteCarloAsync(config, (done, total) => setProgress(done / total));
      setResult(r);
      setRunName(`${flows.join('+')} ${fmtSigned(r.config.demandFactor * 100 - 100, 0, ' %')} · semilla ${r.config.seed}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setProgress(null);
    }
  };

  const saveRun = (): number | null => {
    if (!result || !base) return null;
    if (savedRunId) return savedRunId;
    const id = montecarloRepo.create(db, {
      name: runName.trim() || `Ejecución ${new Date().toLocaleString('es-CO')}`,
      baseDatasetId: base.id,
      flows: result.config.flows.map((f) => f.flow),
      seed: result.config.seed,
      generator: result.config.generator,
      simulations: result.config.simulations,
      params: toStoredParams(result.config),
      summary: toStoredSummary(result),
    });
    setSavedRunId(id);
    toast('Ejecución guardada.');
    return id;
  };

  const generateDataset = () => {
    if (!result || !base || !series) return;
    const runId = saveRun();
    if (!runId) return;
    try {
      const id = saveSyntheticDataset(db, {
        name: `Simulado MC #${runId} (${result.config.flows.map((f) => f.flow).join('+')})`,
        date: synthDate,
        base,
        baseSeries: series,
        result,
        runId,
      });
      setSelectedId(id);
      toast('Conjunto simulado creado. Está disponible en Datos e Inicio.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const labels = useMemo(() => {
    if (!result || !series) return [];
    const start = series.starts[0] ?? '00:00';
    return Array.from({ length: result.intervals }, (_, i) => addMinutesHHMM(start, i * step));
  }, [result, series, step]);

  const baseLine = useMemo(() => {
    if (!result || !series) return [];
    return labels.map((_, i) => (i < series.starts.length ? flows.reduce((a, f) => a + series.values[f][i], 0) : null));
  }, [result, series, labels, flows]);

  const hist = useMemo(() => (result ? histogram(result.totals) : null), [result]);
  const compared = runs.filter((r) => compare.includes(r.id));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Simulación</h1>
          <p>Escenarios hipotéticos de demanda a partir de los conteos observados.</p>
        </div>
      </div>
      <SimTabs />

      <div className="grid-2 grid-config">
        <section className="section form" aria-label="Configuración de Montecarlo">
          <Select<number> label="Conjunto base" value={baseId} onChange={setBaseId} options={datasets.map((d) => ({ value: d.id, label: `${d.name} (${d.kind})` }))} hint={base?.kind === 'simulado' ? 'Atención: la base es simulada.' : 'Se recomienda partir de datos observados.'} />
          <Field label="Flujos a simular">
            <div className="chips" role="group" aria-label="Flujos">
              {FLOW_IDS.map((f) => (
                <button key={f} type="button" className="chip" aria-pressed={flows.includes(f)} onClick={() => setFlows((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))}>
                  {FLOW_LABEL[f]}
                </button>
              ))}
            </div>
          </Field>
          <NumberInput label="Cambio de demanda" suffix="%" value={changePct} step={1} onChange={setChangePct} hint="+20 aumenta la media 20 %; −15 la reduce. Es la media de Poisson, no un resultado fijo." />
          <Field label="Número de simulaciones">
            <div className="chips" role="group" aria-label="Simulaciones">
              {SIM_PRESETS.map((n) => (
                <button key={n} type="button" className="chip" aria-pressed={simulations === n} onClick={() => setSimulations(n)}>{fmtInt(n)}</button>
              ))}
            </div>
          </Field>
          <div className="row-2">
            <NumberInput label="Semilla" value={seed} step={1} min={0} onChange={setSeed} />
            <div className="field">
              <span className="field-label">&nbsp;</span>
              <button type="button" className="btn" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}><IconDice />Otra semilla</button>
            </div>
          </div>
          <Select<GeneratorKind> label="Generador pseudoaleatorio" value={generator} onChange={setGenerator} options={(Object.keys(GENERATOR_LABEL) as GeneratorKind[]).map((g) => ({ value: g, label: GENERATOR_LABEL[g] }))} />
          <details className="disclosure">
            <summary>Variación temporal, baja actividad y capacidad</summary>
            <div className="form" style={{ paddingTop: 8 }}>
              <div className="row-2">
                <NumberInput label="Amplitud senoidal" suffix="%" value={amplitude} min={0} max={99} step={1} onChange={setAmplitude} />
                <NumberInput label="Semiperiodo" suffix="intervalos" value={halfPeriod} min={1} step={1} onChange={setHalfPeriod} />
              </div>
              <div className="row-2">
                <NumberInput label="Prob. baja actividad" suffix="%" value={lowProb} min={0} max={100} step={0.5} onChange={setLowProb} />
                <NumberInput label="Demanda en baja actividad" suffix="%" value={lowFactor} min={0} max={100} step={1} onChange={setLowFactor} />
              </div>
              <NumberInput label="Intervalos adicionales" value={extra} min={0} step={1} onChange={setExtra} hint="Se extrapolan con la media de los 6 últimos intervalos (como el notebook)." />
              <Select<'ninguna' | 'barreras' | 'manual'>
                label="Capacidad de atención"
                value={capacityMode}
                onChange={setCapacityMode}
                options={[
                  { value: 'ninguna', label: 'Sin límite (solo demanda)' },
                  { value: 'barreras', label: `Barreras configuradas (${barrierCapacity !== null ? `${fmt(barrierCapacity, 1)} veh/intervalo` : 'sin dato'})` },
                  { value: 'manual', label: 'Valor manual' },
                ]}
                hint="Vehículos que puede atender cada flujo por intervalo. El exceso queda pendiente en fila."
              />
              {capacityMode === 'manual' && <NumberInput label="Capacidad" suffix="veh por intervalo" value={manualCap} min={0} step={1} onChange={setManualCap} />}
              <div className="row-2">
                <NumberInput label="Umbral del total" suffix="veh" value={totalThreshold} min={0} step={1} onChange={setTotalThreshold} />
                <NumberInput label="Umbral por intervalo" suffix="veh" value={intervalThreshold} min={0} step={1} onChange={setIntervalThreshold} />
              </div>
            </div>
          </details>
          {errors.length > 0 && <Callout tone="bad"><ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
          <button type="button" className="btn btn-primary btn-block" disabled={errors.length > 0 || progress !== null} onClick={run}>
            <IconPlay />{progress !== null ? 'Simulando…' : `Ejecutar ${fmtInt(simulations === '' ? 0 : simulations)} simulaciones`}
          </button>
          {progress !== null && <Progress value={progress} label="Progreso de la simulación" />}
        </section>

        <div className="stack" style={{ marginTop: 0 }}>
          {!result ? (
            <section className="section">
              <div className="empty">
                <IconDice />
                <h3>Configure y ejecute la simulación</h3>
                <p>Con la misma semilla se obtienen exactamente los mismos resultados.</p>
              </div>
            </section>
          ) : (
            <>
              <Callout tone="warn">Resultados sintéticos: describen un escenario hipotético, no una medición.</Callout>
              <section className="section">
                <div className="section-head">
                  <h2>Total de vehículos del periodo</h2>
                  <p>{fmtInt(result.config.simulations)} simulaciones · {result.intervals} intervalos · {fmt(result.elapsedMs / 1000, 2)} s</p>
                </div>
                <div className="metrics">
                  <Metric label="Promedio" value={fmt(result.totalStats.mean, 1)} note={`IC 95 % de la media: ${fmt(result.meanCi95[0], 1)}–${fmt(result.meanCi95[1], 1)}`} />
                  <Metric label="Desviación estándar" value={fmt(result.totalStats.sd, 2)} />
                  <Metric label="Mínimo / máximo" value={`${fmtInt(result.totalStats.min)} / ${fmtInt(result.totalStats.max)}`} />
                  <Metric label="Mediana (P50)" value={fmt(result.totalStats.p50, 0)} />
                  <Metric label="Intervalo empírico 90 %" value={`${fmt(result.totalStats.p5, 0)}–${fmt(result.totalStats.p95, 0)}`} note="P5 a P95" />
                  <Metric label="Observado en la base" value={fmtInt(result.observedTotal)} note={`Esperado con el factor: ${fmt(result.baseTotal, 1)}`} />
                  {result.probTotalExceeds !== null && <Metric label={`P(total > ${result.config.totalThreshold})`} value={fmtPct(result.probTotalExceeds)} />}
                  {result.probAnyIntervalExceeds !== null && <Metric label={`P(algún intervalo > ${result.config.intervalThreshold})`} value={fmtPct(result.probAnyIntervalExceeds)} />}
                </div>
                <p className="small muted" style={{ marginTop: 8 }}>
                  Control de reproducibilidad · totales de las simulaciones 1 a {Math.min(5, result.totals.length)}:{' '}
                  <b className="num">{Array.from(result.totals.slice(0, 5)).join(', ')}</b>
                </p>
              </section>

              {hist && (
                <section className="section">
                  <div className="section-head"><h2>Distribución del total simulado</h2></div>
                  <ChartFrame legend={<Legend items={[{ label: 'Media', color: CC.sign }, { label: 'P5 y P95', color: CC.warn, dashed: true }, { label: 'Observado', color: CC.bad }]} />}>
                    {(w) => (
                      <Histogram
                        width={w}
                        title="Histograma del total de vehículos simulado"
                        edges={hist.edges}
                        counts={hist.counts}
                        xLabel="vehículos en el periodo"
                        markers={[
                          { value: result.totalStats.mean, label: 'media', color: CC.sign },
                          { value: result.totalStats.p5, label: 'P5', color: CC.warn, dashed: true },
                          { value: result.totalStats.p95, label: 'P95', color: CC.warn, dashed: true },
                          { value: result.observedTotal, label: 'obs.', color: CC.bad },
                        ]}
                      />
                    )}
                  </ChartFrame>
                </section>
              )}

              <section className="section">
                <div className="section-head"><h2>Llegadas por intervalo</h2><p>Media simulada con banda P5–P95 frente a la base observada</p></div>
                <ChartFrame legend={<Legend items={[{ label: 'Base observada', color: CC.sign }, { label: 'Media simulada', color: CC.E70, dashed: true }, { label: 'Banda P5–P95', color: CC.band }]} />}>
                  {(w) => (
                    <LineChart
                      width={w}
                      title="Llegadas por intervalo simuladas frente a la base"
                      labels={labels}
                      yLabel="vehículos"
                      band={{ name: 'P5–P95', lower: result.perInterval.p5, upper: result.perInterval.p95, color: CC.band }}
                      series={[
                        { name: 'Base', values: baseLine, color: CC.sign },
                        { name: 'Media simulada', values: result.perInterval.mean, color: CC.E70, dashed: true },
                      ]}
                    />
                  )}
                </ChartFrame>
              </section>

              {result.capacity && (
                <section className="section">
                  <div className="section-head"><h2>Demanda frente a capacidad</h2><p>{fmt(result.capacity.capacityPerInterval, 1)} veh por intervalo y flujo</p></div>
                  <div className="metrics">
                    <Metric label="Atendidos (promedio)" value={fmt(result.capacity.meanServed, 1)} />
                    <Metric label="Pendientes al final (prom.)" value={fmt(result.capacity.pendingEnd.mean, 2)} note={`P95: ${fmt(result.capacity.pendingEnd.p95, 0)}`} />
                    <Metric label="P(quedan pendientes)" value={fmtPct(result.capacity.probPendingAtEnd)} />
                    <Metric label="Máximo en fila (prom.)" value={fmt(result.capacity.maxPending.mean, 1)} note={`peor caso ${fmtInt(result.capacity.maxPending.max)}`} />
                    <Metric label="Intervalos sobrecargados" value={fmtPct(result.capacity.overloadedIntervalShare)} />
                  </div>
                  <p className="small muted" style={{ marginTop: 8 }}>Llegadas = atendidos + pendientes: ningún vehículo se descarta.</p>
                </section>
              )}

              <section className="section form">
                <div className="section-head"><h2>Guardar y generar datos</h2></div>
                <Field label="Nombre de la ejecución" htmlFor="mc-name">
                  <input id="mc-name" className="input" value={runName} onChange={(e) => setRunName(e.target.value)} disabled={!!savedRunId} />
                </Field>
                <div className="row">
                  <button type="button" className="btn" onClick={saveRun} disabled={!!savedRunId}><IconSave />{savedRunId ? `Guardada (#${savedRunId})` : 'Guardar ejecución'}</button>
                </div>
                <div className="row-2">
                  <Field label="Fecha del conjunto sintético" htmlFor="mc-date">
                    <input id="mc-date" className="input" type="date" value={synthDate} onChange={(e) => setSynthDate(e.target.value)} />
                  </Field>
                  <div className="field">
                    <span className="field-label">&nbsp;</span>
                    <button type="button" className="btn" onClick={generateDataset}>Generar registros sintéticos</button>
                  </div>
                </div>
                <p className="small muted">Crea un conjunto con origen "simulado" usando la trayectoria de la simulación 1, enlazado a la base y a esta ejecución.</p>
              </section>
            </>
          )}
        </div>
      </div>

      {base && <NotebookCard baseId={observed.find((d) => d.isSeed)?.id ?? base.id} />}

      <section className="section">
        <div className="section-head">
          <h2>Ejecuciones guardadas</h2>
          <p>Marque dos para compararlas</p>
        </div>
        {runs.length === 0 ? (
          <p className="muted small">Aún no hay ejecuciones guardadas.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Comparar</th><th>Nombre</th><th className="n">Simulaciones</th><th className="n">Factor</th><th className="n">Media</th><th className="n">DE</th><th className="n">P5–P95</th><th>Fecha</th><th /></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Comparar ${r.name}`}
                        checked={compare.includes(r.id)}
                        onChange={(e) => setCompare((c) => (e.target.checked ? [...c, r.id].slice(-2) : c.filter((x) => x !== r.id)))}
                      />
                    </td>
                    <td><b>{r.name}</b><div className="small muted">{r.flows.join(' + ')} · semilla {r.seed}</div></td>
                    <td className="n">{fmtInt(r.simulations)}</td>
                    <td className="n">{fmt(r.params.demandFactor, 2)}</td>
                    <td className="n">{fmt(r.summary.totalStats.mean, 1)}</td>
                    <td className="n">{fmt(r.summary.totalStats.sd, 1)}</td>
                    <td className="n">{fmt(r.summary.totalStats.p5, 0)}–{fmt(r.summary.totalStats.p95, 0)}</td>
                    <td className="small">{fmtDateTime(r.createdAt)}</td>
                    <td><button type="button" className="icon-btn" aria-label={`Eliminar ${r.name}`} onClick={() => montecarloRepo.remove(db, r.id)}><IconTrash /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {compared.length === 2 && <RunComparison a={compared[0]} b={compared[1]} />}
      </section>
    </div>
  );
}

function RunComparison({ a, b }: { a: MonteCarloRunRecord; b: MonteCarloRunRecord }) {
  const rows: [string, number, number, number][] = [
    ['Media del total', a.summary.totalStats.mean, b.summary.totalStats.mean, 1],
    ['Desviación estándar', a.summary.totalStats.sd, b.summary.totalStats.sd, 2],
    ['P5', a.summary.totalStats.p5, b.summary.totalStats.p5, 0],
    ['Mediana', a.summary.totalStats.p50, b.summary.totalStats.p50, 0],
    ['P95', a.summary.totalStats.p95, b.summary.totalStats.p95, 0],
    ['Máximo', a.summary.totalStats.max, b.summary.totalStats.max, 0],
  ];
  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ marginBottom: 8 }}>Comparación: {a.name} frente a {b.name}</h3>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Indicador</th><th className="n">#{a.id}</th><th className="n">#{b.id}</th><th className="n">Diferencia</th><th className="n">Variación</th></tr></thead>
          <tbody>
            {rows.map(([label, x, y, d]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="n">{fmt(x, d)}</td>
                <td className="n">{fmt(y, d)}</td>
                <td className="n">{fmtSigned(y - x, d)}</td>
                <td className="n">{x ? fmtSigned(((y - x) / x) * 100, 1, ' %') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
