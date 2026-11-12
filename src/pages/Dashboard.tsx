import { Link } from 'react-router-dom';
import { ChartFrame, useChartColors, BarChart, Legend, LineChart } from '../components/charts/charts';
import { AndroidDownload, AppInstallBanner } from '../components/AndroidDownload';
import { DatasetPicker } from '../components/DatasetPicker';
import { IconCar, IconCompare, IconDice, IconInfo, IconQueue, IconReport, IconTable } from '../components/Icons';
import { isNativeApp } from '../platform/native';
import { Callout, EmptyState, OriginBadge, RiskTag, SourceBadge } from '../components/ui';
import { estimateArrivalRate } from '../core/data/aggregate';
import { fmt, fmtDuration, fmtInt, fmtPct } from '../core/format';
import { saturationRisk, serviceRateFromSeconds, solveQueue } from '../core/queueing/queueing';
import { formatLongDate } from '../core/time';
import { ACCESS_LABEL, FLOW_IDS, FLOW_LABEL, type AccessId } from '../core/types';
import { serverConfigRepo } from '../db/repositories';
import { getSummary } from '../services/datasets';
import { useQuery } from '../state/DbProvider';
import { useSelection } from '../state/selection';

export default function Dashboard() {
  const { datasets, selected, setSelectedId } = useSelection();
  const CC = useChartColors();
  const data = useQuery((db) => (selected ? getSummary(db, selected.id) : null), [selected?.id]);
  const configs = useQuery((db) => serverConfigRepo.list(db));

  if (!selected || !data) {
    return (
      <EmptyState icon={<IconTable />} title="Aún no hay conjuntos de datos" action={<Link className="btn btn-primary" to="/datos">Importar datos</Link>}>
        Importe un archivo Excel o CSV con los conteos por intervalo para empezar.
      </EmptyState>
    );
  }

  const { series, summary } = data;
  const simulated = selected.kind === 'simulado';
  const period = summary.firstStart ? `${summary.firstStart}–${summary.lastEnd}` : 'sin registros';

  const congestion = (['C70', 'C80'] as AccessId[]).map((access) => {
    const cfg = configs.find((c) => c.access === access && c.direction === 'entrada');
    const est = estimateArrivalRate(series, access === 'C70' ? 'E70' : 'E80');
    if (!cfg || est.intervals === 0) return { access, cfg, est, avg: null, peak: null };
    const mu = serviceRateFromSeconds(cfg.meanServiceSeconds);
    const model = cfg.existingServers === 1 ? 'MM1' : 'MMS';
    return {
      access,
      cfg,
      est,
      avg: solveQueue({ model, lambda: est.lambdaPerMin, mu, servers: cfg.existingServers }),
      peak: solveQueue({ model, lambda: est.peakLambdaPerMin, mu, servers: cfg.existingServers }),
    };
  });

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Accesos al parqueadero</h1>
          <p>Centro Comercial Arkadia, Medellín · Carrera 70 y carrera 80</p>
        </div>
        <div style={{ minWidth: 'min(100%, 320px)' }}>
          <DatasetPicker datasets={datasets} value={selected} onChange={setSelectedId} />
        </div>
      </div>

      <AppInstallBanner />

      <section
        className="signboard"
        aria-label="Resumen de los accesos"
        style={simulated ? { backgroundImage: 'repeating-linear-gradient(-45deg, rgba(242,176,30,.10) 0 10px, transparent 10px 20px)' } : undefined}
      >
        <div className="signboard-head">
          <h2>
            <strong>{formatLongDate(selected.date)}</strong> · {period}
          </h2>
          <OriginBadge origin={selected.kind} />
        </div>
        <div className="sign-accesses">
          {(['C70', 'C80'] as AccessId[]).map((a) => {
            const entries = summary.entriesByAccess[a];
            const exits = summary.exitsByAccess[a];
            return (
              <div key={a} className="sign-access" style={simulated ? { borderLeftStyle: 'dashed' } : undefined}>
                <span className="sign-access-name">
                  <span className="sign-route">{a.slice(1)}</span>
                  {ACCESS_LABEL[a]}
                </span>
                <span className="sign-figure num">
                  {fmtInt(entries)}
                  <small>entradas</small>
                </span>
                <span className="sign-sub num">
                  <b>{fmtInt(exits)}</b> salidas · <b>{fmt(summary.durationMinutes ? entries / summary.durationMinutes : 0, 2)}</b> entradas/min
                </span>
              </div>
            );
          })}
        </div>
        <dl className="sign-stats">
          <div className="sign-stat">
            <dt>Entradas totales</dt>
            <dd className="num">{fmtInt(summary.totalEntries)}</dd>
          </div>
          <div className="sign-stat">
            <dt>Salidas totales</dt>
            <dd className="num">{fmtInt(summary.totalExits)}</dd>
          </div>
          <div className="sign-stat">
            <dt>Entradas por minuto</dt>
            <dd className="num">{fmt(summary.entriesPerMinute, 2)}</dd>
          </div>
          <div className="sign-stat">
            <dt>Saldo dentro del parqueadero</dt>
            <dd className="num">{summary.totalEntries - summary.totalExits >= 0 ? '+' : ''}{fmtInt(summary.totalEntries - summary.totalExits)}</dd>
          </div>
        </dl>
      </section>

      {simulated && (
        <Callout tone="warn" title="Está viendo datos simulados">
          Este conjunto es sintético (Montecarlo). Sirve para explorar escenarios, no reemplaza una medición en campo.
        </Callout>
      )}
      {summary.incompleteIntervals > 0 && (
        <Callout tone="warn">{`${summary.incompleteIntervals} intervalo(s) no tienen los cuatro flujos registrados. Revise el módulo de datos.`}</Callout>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Vehículos por intervalo de {series.intervalMinutes} minutos</h2>
          <p>{simulated ? 'Trazo punteado: datos simulados' : 'Trazo sólido: datos observados'}</p>
        </div>
        <ChartFrame
          legend={<Legend items={FLOW_IDS.map((f) => ({ label: FLOW_LABEL[f], color: CC[f], dashed: simulated }))} />}
        >
          {(w) => (
            <LineChart
              width={w}
              title={`Vehículos por intervalo, ${selected.name}`}
              labels={series.starts}
              yLabel="vehículos"
              series={FLOW_IDS.map((f) => ({ name: FLOW_LABEL[f], values: series.values[f], color: CC[f], dashed: simulated }))}
            />
          )}
        </ChartFrame>
      </section>

      <div className="grid-2">
        <section className="section">
          <div className="section-head">
            <h2>Comparación entre accesos</h2>
          </div>
          <ChartFrame
            legend={<Legend items={[{ label: 'Entradas', color: CC.E70 }, { label: 'Salidas', color: CC.S70 }]} />}
          >
            {(w) => (
              <BarChart
                width={w}
                title="Entradas y salidas por acceso"
                categories={['Carrera 70', 'Carrera 80']}
                groups={[
                  { name: 'Entradas', color: CC.E70, values: [summary.entriesByAccess.C70, summary.entriesByAccess.C80], hatched: simulated },
                  { name: 'Salidas', color: CC.S70, values: [summary.exitsByAccess.C70, summary.exitsByAccess.C80], hatched: simulated },
                ]}
              />
            )}
          </ChartFrame>
          <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr><th>Momento</th><th>Intervalo</th><th className="n">Vehículos</th></tr>
            </thead>
            <tbody>
              <tr><td>Mayor demanda de entrada</td><td>{summary.peakEntries?.start}–{summary.peakEntries?.end}</td><td className="n">{summary.peakEntries?.value}</td></tr>
              <tr><td>Menor demanda de entrada</td><td>{summary.lowEntries?.start}–{summary.lowEntries?.end}</td><td className="n">{summary.lowEntries?.value}</td></tr>
              <tr><td>Más movimiento (entran + salen)</td><td>{summary.peakTraffic?.start}–{summary.peakTraffic?.end}</td><td className="n">{summary.peakTraffic?.value}</td></tr>
              <tr><td>Menos movimiento</td><td>{summary.lowTraffic?.start}–{summary.lowTraffic?.end}</td><td className="n">{summary.lowTraffic?.value}</td></tr>
            </tbody>
          </table>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Congestión en las entradas</h2>
            <p>M/M/s con las barreras configuradas</p>
          </div>
          <div className="stack">
            {congestion.map(({ access, cfg, est, avg, peak }) => (
              <div key={access} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3>{ACCESS_LABEL[access]}</h3>
                  {peak && peak.status !== 'invalid' && <RiskTag risk={saturationRisk(peak.rho)} prefix="Pico:" />}
                </div>
                {cfg && avg && peak ? (
                  <>
                    <p className="small muted">
                      {cfg.existingServers} barrera(s) · {fmt(cfg.meanServiceSeconds, 1)} s por vehículo · λ = {fmt(est.lambdaPerMin, 2)} veh/min (pico {fmt(est.peakLambdaPerMin, 2)})
                    </p>
                    <div className="metrics" style={{ marginTop: 8 }}>
                      <div className="metric"><span className="metric-label">Utilización promedio</span><span className="metric-value num">{avg.status === 'invalid' ? '—' : fmtPct(avg.rho)}</span></div>
                      <div className="metric"><span className="metric-label">Utilización en el pico</span><span className="metric-value num">{peak.status === 'invalid' ? '—' : fmtPct(peak.rho)}</span></div>
                      <div className="metric"><span className="metric-label">Espera en fila (prom.)</span><span className="metric-value num">{avg.status === 'stable' ? fmtDuration(avg.wq) : 'Sin equilibrio'}</span></div>
                    </div>
                    <div className="row small" style={{ marginTop: 8 }}>
                      <SourceBadge source={cfg.serversSource} />
                      <SourceBadge source={cfg.serviceSource} />
                    </div>
                  </>
                ) : (
                  <p className="small muted">Faltan parámetros o registros de entrada para este acceso.</p>
                )}
              </div>
            ))}
            <Link to="/colas" className="btn btn-small">Ajustar barreras y tiempos</Link>
          </div>
        </section>
      </div>

      <section aria-label="Accesos rápidos">
        <div className="quick">
          <Link to="/datos"><b><IconTable />Datos</b><span>Importar, registrar y validar conteos</span></Link>
          <Link to="/colas"><b><IconQueue />Teoría de colas</b><span>M/M/1 y M/M/s con fórmulas</span></Link>
          <Link to="/simular"><b><IconDice />Montecarlo</b><span>Escenarios de demanda con semilla</span></Link>
          <Link to="/simular/visual"><b><IconCar />Simulador visual</b><span>Eventos discretos con barreras</span></Link>
          <Link to="/colas/escenarios"><b><IconCompare />Comparar escenarios</b><span>Barreras, demanda y atención</span></Link>
          <Link to="/informe"><b><IconReport />Informe PDF</b><span>Documento para entregar</span></Link>
          <AndroidDownload />
          {!isNativeApp() && <a href="./presentacion/"><b><IconInfo />El proyecto</b><span>Cómo lo trabajamos y plan de mejoramiento</span></a>}
        </div>
      </section>
    </div>
  );
}
