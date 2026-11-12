import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconPause, IconPlay, IconReset, IconSave } from '../components/Icons';
import { Callout, Field, Metric, NumberInput, Segmented, Select, Stepper, useFeedback } from '../components/ui';
import { estimateArrivalRate } from '../core/data/aggregate';
import {
  DiscreteEventSimulator,
  EVENT_LABEL,
  SERVICE_DISTRIBUTION_LABEL,
  type DesConfig,
  type ServiceDistribution,
} from '../core/des/engine';
import { fmt, fmtDateTime, fmtInt, fmtPct } from '../core/format';
import { serviceRateFromSeconds, solveQueue } from '../core/queueing/queueing';
import { ACCESS_LABEL, type AccessId } from '../core/types';
import { serverConfigRepo, simulationRepo } from '../db/repositories';
import { getSeries } from '../services/datasets';
import { useDb, useQuery } from '../state/DbProvider';
import { useSelection } from '../state/selection';
import { SimTabs } from './MonteCarloPage';
import { Stage } from '../components/SimStage';

const SPEEDS = [
  { value: '1', label: '1×' },
  { value: '5', label: '5×' },
  { value: '15', label: '15×' },
  { value: '60', label: '60×' },
];

type Status = 'listo' | 'corriendo' | 'pausado' | 'terminado';

export default function SimulatorPage() {
  const { db } = useDb();
  const { toast } = useFeedback();
  const { datasets } = useSelection();
  const [datasetId, setDatasetId] = useState<number>(datasets.find((d) => d.kind === 'observado')?.id ?? datasets[0]?.id ?? 0);
  const [access, setAccess] = useState<AccessId>('C80');
  const [demandSource, setDemandSource] = useState<'promedio' | 'pico' | 'manual'>('pico');
  const [manualLambda, setManualLambda] = useState<number | ''>(6);
  const cfg = useQuery((d) => serverConfigRepo.get(d, access, 'entrada'), [access]);
  const series = useQuery((d) => (datasetId ? getSeries(d, datasetId) : null), [datasetId]);
  const savedRuns = useQuery((d) => simulationRepo.list<DesConfig & { label?: string }, ReturnType<DiscreteEventSimulator['metrics']>>(d).slice(0, 5));

  const [servers, setServers] = useState(cfg?.existingServers ?? 2);
  const [serviceSeconds, setServiceSeconds] = useState<number | ''>(cfg?.meanServiceSeconds ?? 5);
  const [distribution, setDistribution] = useState<ServiceDistribution>('exponencial');
  const [horizon, setHorizon] = useState<number | ''>(30);
  const [seed, setSeed] = useState<number | ''>(7);
  const [speed, setSpeed] = useState('15');

  useEffect(() => {
    if (cfg) {
      setServers(cfg.existingServers);
      setServiceSeconds(cfg.meanServiceSeconds);
    }
  }, [cfg?.access, cfg?.existingServers, cfg?.meanServiceSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const estimate = useMemo(() => (series ? estimateArrivalRate(series, access === 'C70' ? 'E70' : 'E80') : null), [series, access]);
  const lambda = demandSource === 'manual'
    ? (manualLambda === '' ? NaN : manualLambda)
    : demandSource === 'pico' ? estimate?.peakLambdaPerMin ?? NaN : estimate?.lambdaPerMin ?? NaN;

  const config: DesConfig | null = useMemo(() => {
    if (!Number.isFinite(lambda) || serviceSeconds === '' || horizon === '' || seed === '') return null;
    const mean = serviceSeconds / 60;
    const lo = (cfg?.serviceMinSeconds ?? serviceSeconds * 0.8) / 60;
    const hi = (cfg?.serviceMaxSeconds ?? serviceSeconds * 1.2) / 60;
    return {
      arrivalRatePerMin: lambda,
      servers,
      meanServiceMin: distribution === 'uniforme' ? (lo + hi) / 2 : mean,
      serviceDistribution: distribution,
      serviceMinMin: lo,
      serviceMaxMin: hi,
      horizonMin: horizon,
      seed,
    };
  }, [lambda, serviceSeconds, horizon, seed, servers, distribution, cfg]);

  const configError = useMemo(() => {
    if (!config) return 'Complete la tasa de llegada, el tiempo de atención, la duración y la semilla.';
    try {
      new DiscreteEventSimulator({ ...config, horizonMin: Math.min(config.horizonMin, 0.001) });
      if (config.horizonMin > 240) return 'Para la animación use una duración de hasta 240 minutos.';
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [config]);

  const simRef = useRef<DiscreteEventSimulator | null>(null);
  const [status, setStatus] = useState<Status>('listo');
  const [, setTick] = useState(0);
  const raf = useRef<number | null>(null);
  const lastFrame = useRef<number | null>(null);
  const speedRef = useRef(Number(speed));
  speedRef.current = Number(speed);
  const [savedId, setSavedId] = useState<number | null>(null);

  const stopLoop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    lastFrame.current = null;
  };

  const loop = useCallback((t: number) => {
    const sim = simRef.current;
    if (!sim) return;
    const dtReal = lastFrame.current === null ? 0 : Math.min(0.1, (t - lastFrame.current) / 1000);
    lastFrame.current = t;
    // speed = segundos simulados por segundo real
    sim.advanceTo(Math.min(sim.config.horizonMin, sim.clock + (dtReal * speedRef.current) / 60));
    setTick((x) => x + 1);
    if (sim.finished) {
      setStatus('terminado');
      stopLoop();
      return;
    }
    raf.current = requestAnimationFrame(loop);
  }, []);

  const reset = useCallback(() => {
    stopLoop();
    simRef.current = config && !configError ? new DiscreteEventSimulator(config) : null;
    setSavedId(null);
    setStatus('listo');
    setTick((x) => x + 1);
  }, [config, configError]);

  useEffect(() => {
    reset();
    return stopLoop;
  }, [reset]);

  const start = () => {
    if (!simRef.current) reset();
    if (!simRef.current) return;
    setStatus('corriendo');
    raf.current = requestAnimationFrame(loop);
  };
  const pause = () => {
    stopLoop();
    setStatus('pausado');
  };
  const instant = () => {
    if (!simRef.current) return;
    stopLoop();
    simRef.current.runToEnd();
    setStatus('terminado');
    setTick((x) => x + 1);
  };

  const sim = simRef.current;
  const m = sim?.metrics();
  const theory = useMemo(() => {
    if (!config) return null;
    return solveQueue({ model: config.servers === 1 ? 'MM1' : 'MMS', lambda: config.arrivalRatePerMin, mu: 1 / config.meanServiceMin, servers: config.servers });
  }, [config]);

  const save = () => {
    if (!sim || !m) return;
    const id = simulationRepo.create(
      db,
      { name: `${ACCESS_LABEL[access]} · ${sim.config.servers} barrera(s) · λ ${fmt(sim.config.arrivalRatePerMin, 2)} veh/min`, params: { ...sim.config, label: ACCESS_LABEL[access] }, summary: m },
      sim.vehicles,
      sim.log,
    );
    setSavedId(id);
    toast('Simulación guardada con sus vehículos y eventos.');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Simulación</h1>
          <p>Eventos discretos: cada vehículo tiene llegada, inicio y fin de atención. La animación muestra el estado real del motor.</p>
        </div>
      </div>
      <SimTabs />

      <div className="grid-2 grid-config">
        <section className="section form" aria-label="Configuración del simulador">
          <Select<number> label="Datos para la demanda" value={datasetId} onChange={setDatasetId} options={datasets.map((d) => ({ value: d.id, label: `${d.name} (${d.kind})` }))} />
          <Field label="Acceso (entrada)">
            <Segmented<AccessId> label="Acceso" value={access} onChange={setAccess} options={[{ value: 'C70', label: 'Carrera 70' }, { value: 'C80', label: 'Carrera 80' }]} />
          </Field>
          <Field label="Demanda λ" hint={demandSource !== 'manual' && estimate ? `${fmt(lambda, 2)} veh/min (${demandSource === 'pico' ? `pico ${estimate.peakInterval?.start}` : 'promedio del periodo'})` : undefined}>
            <Segmented label="Demanda" value={demandSource} onChange={setDemandSource} options={[{ value: 'promedio', label: 'Promedio' }, { value: 'pico', label: 'Pico' }, { value: 'manual', label: 'Manual' }]} />
          </Field>
          {demandSource === 'manual' && <NumberInput label="Llegadas" suffix="veh/min" value={manualLambda} min={0} step={0.1} onChange={setManualLambda} />}
          <Field label="Barreras" hint={cfg ? (servers > cfg.existingServers ? `${servers - cfg.existingServers} hipotética(s); existen ${cfg.existingServers}.` : `Existentes: ${cfg.existingServers}.`) : undefined}>
            <Stepper label="barreras" value={servers} min={1} max={4} onChange={setServers} />
          </Field>
          <NumberInput label="Tiempo medio de atención" suffix="s" value={serviceSeconds} min={0} step={0.1} onChange={setServiceSeconds} />
          <Select<ServiceDistribution>
            label="Distribución del tiempo de atención"
            value={distribution}
            onChange={setDistribution}
            options={(Object.keys(SERVICE_DISTRIBUTION_LABEL) as ServiceDistribution[]).map((d) => ({ value: d, label: SERVICE_DISTRIBUTION_LABEL[d] }))}
            hint={distribution === 'uniforme' ? `Entre ${cfg?.serviceMinSeconds ?? '—'} y ${cfg?.serviceMaxSeconds ?? '—'} s (rango del acceso).` : undefined}
          />
          <div className="row-2">
            <NumberInput label="Duración" suffix="min simulados" value={horizon} min={1} max={240} step={1} onChange={setHorizon} />
            <NumberInput label="Semilla" value={seed} min={0} step={1} onChange={setSeed} />
          </div>
          <Field label="Velocidad de reproducción" hint="Segundos simulados por segundo real. No cambia los resultados.">
            <Segmented label="Velocidad" value={speed} onChange={setSpeed} options={SPEEDS} />
          </Field>
          {configError && <Callout tone="bad">{configError}</Callout>}
          <p className="small muted">Los cambios de parámetros reinician la simulación.</p>
        </section>

        <div className="stack" style={{ marginTop: 0 }}>
          <section className="section">
            <div className="section-head">
              <h2>{ACCESS_LABEL[access]} · {servers} barrera(s)</h2>
              <p className="num">t = {fmt(m?.clock ?? 0, 2)} / {horizon || 0} min</p>
            </div>
            {sim && m ? <Stage sim={sim} speed={Number(speed)} /> : <div className="sim-stage" style={{ height: 160 }} />}
            <div className="row" style={{ marginTop: 12 }}>
              {status === 'corriendo' ? (
                <button type="button" className="btn" onClick={pause}><IconPause />Pausar</button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={start} disabled={!sim || status === 'terminado'}>
                  <IconPlay />{status === 'pausado' ? 'Reanudar' : 'Iniciar'}
                </button>
              )}
              <button type="button" className="btn" onClick={reset}><IconReset />Reiniciar</button>
              <button type="button" className="btn btn-ghost" onClick={instant} disabled={!sim || status === 'terminado'}>Completar al instante</button>
            </div>
            <div className="legend">
              <span className="legend-item"><span style={{ width: 14, height: 10, background: '#F2B01E', display: 'inline-block' }} /> En fila</span>
              <span className="legend-item"><span style={{ width: 14, height: 10, background: '#4C8EF0', display: 'inline-block' }} /> En atención (barrera arriba)</span>
              <span className="legend-item"><span style={{ width: 14, height: 10, background: '#2BB3A3', display: 'inline-block' }} /> Atendido, saliendo</span>
            </div>
          </section>

          {m && (
            <section className="section" aria-live="off">
              <div className="section-head"><h2>Indicadores de la simulación</h2><p>Estado: {status}</p></div>
              <div className="metrics">
                <Metric label="Llegaron" value={fmtInt(m.arrived)} />
                <Metric label="Atendidos" value={fmtInt(m.served)} />
                <Metric label="En fila" value={fmtInt(m.inQueue)} />
                <Metric label="Barreras ocupadas" value={`${m.busyServers} / ${servers}`} />
                <Metric label="Espera promedio en fila" value={fmt(m.avgWait * 60, 2)} unit="s" note={`máx. ${fmt(m.maxWait * 60, 1)} s`} />
                <Metric label="Utilización observada" value={fmtPct(m.utilization)} />
                <Metric label="Fila máxima" value={fmtInt(m.maxQueue)} unit="veh" />
                <Metric label="Fila promedio (tiempo)" value={fmt(m.timeAvgQueue, 3)} unit="veh" />
              </div>
              <p className="small muted" style={{ marginTop: 8 }}>
                Balance: {m.arrived} llegadas = {m.served} atendidos + {m.inService} en atención + {m.inQueue} en fila.
              </p>
            </section>
          )}

          {status === 'terminado' && m && theory && (
            <section className="section">
              <div className="section-head"><h2>Simulación frente a teoría M/M/s</h2><p>Una sola corrida tiene variación aleatoria</p></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Indicador</th><th className="n">Simulación</th><th className="n">Teoría</th></tr></thead>
                  <tbody>
                    <tr><td>Utilización ρ</td><td className="n">{fmtPct(m.utilization)}</td><td className="n">{theory.status === 'invalid' ? '—' : fmtPct(theory.rho)}</td></tr>
                    <tr><td>Espera en fila Wq (s)</td><td className="n">{fmt(m.avgWait * 60, 2)}</td><td className="n">{theory.status === 'stable' ? fmt(theory.wq * 60, 2) : 'sin equilibrio'}</td></tr>
                    <tr><td>Vehículos en fila Lq</td><td className="n">{fmt(m.timeAvgQueue, 3)}</td><td className="n">{theory.status === 'stable' ? fmt(theory.lq, 3) : '∞'}</td></tr>
                    <tr><td>Tiempo en el sistema W (s)</td><td className="n">{fmt(m.avgSystem * 60, 2)}</td><td className="n">{theory.status === 'stable' ? fmt(theory.w * 60, 2) : '∞'}</td></tr>
                  </tbody>
                </table>
              </div>
              {distribution !== 'exponencial' && <p className="small muted" style={{ marginTop: 8 }}>La teoría supone atención exponencial; con atención {distribution} la espera simulada suele ser menor.</p>}
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={save} disabled={!!savedId}><IconSave />{savedId ? 'Guardada' : 'Guardar simulación'}</button>
              </div>
            </section>
          )}

          {sim && sim.log.length > 0 && (
            <section className="section">
              <div className="section-head"><h2>Últimos eventos</h2><p>Minutos simulados</p></div>
              <ol className="event-log num">
                {sim.log.slice(-10).reverse().map((e) => (
                  <li key={e.seq}>
                    <span>{fmt(e.time, 3)}</span>
                    <span>{EVENT_LABEL[e.type]} · vehículo {e.vehicleId + 1}{e.serverId !== null ? ` · barrera ${e.serverId + 1}` : ''}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      {savedRuns.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Simulaciones guardadas</h2></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nombre</th><th className="n">Vehículos</th><th className="n">Eventos</th><th className="n">Espera (s)</th><th className="n">Utilización</th><th>Fecha</th></tr></thead>
              <tbody>
                {savedRuns.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="n">{r.vehicles}</td>
                    <td className="n">{r.events}</td>
                    <td className="n">{fmt(r.summary.avgWait * 60, 2)}</td>
                    <td className="n">{fmtPct(r.summary.utilization)}</td>
                    <td className="small">{fmtDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Callout>
        {`Tiempo de atención por defecto: ${cfg?.meanServiceSeconds ?? '—'} s (${cfg?.serviceSource === 'confirmado' ? 'confirmado' : 'aproximación de campo, por confirmar'}). μ = ${fmt(serviceRateFromSeconds(serviceSeconds === '' ? 0 : serviceSeconds), 2)} veh/min por barrera.`}
      </Callout>
    </div>
  );
}
