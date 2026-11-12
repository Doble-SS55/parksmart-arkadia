import { useMemo, useState } from 'react';
import { BarChart, ChartFrame, useChartColors, Legend } from '../components/charts/charts';
import { IconSave, IconTrash } from '../components/Icons';
import { Callout, EmptyState, Field, NumberInput, RiskTag, Select, useFeedback } from '../components/ui';
import { fmt, fmtDateTime, fmtPct, fmtSigned } from '../core/format';
import { RISK_LABEL } from '../core/queueing/queueing';
import {
  buildPresetScenarios,
  diff,
  evaluateScenario,
  lqOf,
  rhoOf,
  waitSeconds,
  type ScenarioResult,
} from '../core/scenarios/compare';
import { ACCESS_LABEL, type AccessId } from '../core/types';
import { scenariosRepo, serverConfigRepo } from '../db/repositories';
import { entryDemand, getSeries } from '../services/datasets';
import { useDb, useQuery } from '../state/DbProvider';
import { useSelection } from '../state/selection';
import { QueueTabs } from './QueuePage';

export interface StoredComparison {
  rows: {
    id: string;
    name: string;
    source: string;
    hypotheses: string[];
    perAccess: Record<AccessId, { servers: number; hypotheticalServers: number; lambda: number; peakLambda: number; rho: number | null; peakRho: number | null; wqSeconds: number | null; peakWqSeconds: number | null; lq: number | null; risk: string; peakRisk: string; capacityPerHour: number }>;
  }[];
}

export function toStoredComparison(results: ScenarioResult[]): StoredComparison {
  return {
    rows: results.map((r) => ({
      id: r.input.id,
      name: r.input.name,
      source: r.input.source,
      hypotheses: r.input.hypotheses,
      perAccess: Object.fromEntries(
        (['C70', 'C80'] as AccessId[]).map((a) => {
          const p = r.perAccess[a];
          return [a, {
            servers: p.servers, hypotheticalServers: p.hypotheticalServers, lambda: p.lambda, peakLambda: p.peakLambda,
            rho: rhoOf(p.avg), peakRho: rhoOf(p.peak), wqSeconds: waitSeconds(p.avg), peakWqSeconds: waitSeconds(p.peak),
            lq: lqOf(p.avg), risk: p.risk, peakRisk: p.peakRisk, capacityPerHour: p.capacityPerHour,
          }];
        }),
      ) as StoredComparison['rows'][number]['perAccess'],
    })),
  };
}

function DiffCell({ base, value, digits = 2, unit = '' }: { base: number | null; value: number | null; digits?: number; unit?: string }) {
  const d = diff(base, value);
  if (value === null) return <td className="n" style={{ color: 'var(--bad)', fontWeight: 700 }}>Sin equilibrio</td>;
  return (
    <td className="n">
      <b>{fmt(value, digits)}{unit}</b>
      {d.absolute !== null && Math.abs(d.absolute) > 1e-9 && (
        <div className={`small ${d.absolute < 0 ? 'diff-better' : 'diff-worse'}`}>
          {fmtSigned(d.absolute, digits, unit)}{d.percent !== null ? ` (${fmtSigned(d.percent, 0, ' %')})` : ''}
        </div>
      )}
    </td>
  );
}

export default function ScenariosPage() {
  const { db } = useDb();
  const CC = useChartColors();
  const { toast } = useFeedback();
  const { datasets } = useSelection();
  const observed = datasets.filter((d) => d.kind !== 'simulado');
  const simulated = datasets.filter((d) => d.kind === 'simulado');
  const [baseId, setBaseId] = useState<number>(observed[0]?.id ?? 0);
  const [simId, setSimId] = useState<number>(simulated[0]?.id ?? 0);
  const configs = useQuery((d) => serverConfigRepo.list(d));
  const entryCfg = (a: AccessId) => configs.find((c) => c.access === a && c.direction === 'entrada');
  const [serviceSeconds, setServiceSeconds] = useState<number | ''>(entryCfg('C80')?.meanServiceSeconds ?? 5);
  const [inc1, setInc1] = useState<number | ''>(10);
  const [inc2, setInc2] = useState<number | ''>(25);
  const [reduction, setReduction] = useState<number | ''>(20);
  const [redistribution, setRedistribution] = useState<number | ''>(20);
  const [access, setAccess] = useState<AccessId>('C80');
  const saved = useQuery((d) => scenariosRepo.list<Record<string, unknown>, StoredComparison>(d).slice(0, 5));

  const baseSeries = useQuery((d) => (baseId ? getSeries(d, baseId) : null), [baseId]);
  const simSeries = useQuery((d) => (simId ? getSeries(d, simId) : null), [simId]);

  const results = useMemo(() => {
    if (!baseSeries || serviceSeconds === '' || serviceSeconds <= 0) return null;
    const existing = { C70: entryCfg('C70')?.existingServers ?? 1, C80: entryCfg('C80')?.existingServers ?? 1 };
    const presets = buildPresetScenarios({
      friday: entryDemand(baseSeries),
      saturday: simSeries ? entryDemand(simSeries) : null,
      existingServers: existing,
      serviceSeconds,
      serviceIsApproximate: entryCfg('C80')?.serviceSource !== 'confirmado',
      demandIncreases: [inc1, inc2].filter((x): x is number => x !== '' && x > 0).map((x) => x / 100),
      serviceReduction: reduction === '' ? 0 : Math.min(0.9, reduction / 100),
      redistribution: redistribution === '' ? 0 : Math.min(1, redistribution / 100),
    });
    return presets.map(evaluateScenario);
  }, [baseSeries, simSeries, serviceSeconds, inc1, inc2, reduction, redistribution, configs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!observed.length) return <EmptyState title="Se necesita un conjunto observado">Importe los conteos de campo para comparar escenarios.</EmptyState>;

  const base = results?.[0];
  const baseName = datasets.find((d) => d.id === baseId)?.name ?? '';

  const save = () => {
    if (!results) return;
    scenariosRepo.create(db, {
      name: `Comparación de ${results.length} escenarios`,
      description: `Base: ${baseName}. Atención ${serviceSeconds} s.`,
      baseDatasetId: baseId,
      params: { baseId, simId, serviceSeconds, inc1, inc2, reduction, redistribution },
      results: toStoredComparison(results),
    });
    toast('Comparación guardada. Se incluirá en el informe PDF.');
  };

  const improved = results && base
    ? results.slice(1).filter((r) => {
        const b = waitSeconds(base.perAccess[access].peak);
        const v = waitSeconds(r.perAccess[access].peak);
        return v !== null && (b === null || v < b);
      })
    : [];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Teoría de colas</h1>
          <p>Escenarios hipotéticos para las barreras de entrada. Nada de esto está implementado en Arkadia.</p>
        </div>
      </div>
      <QueueTabs />

      <div className="grid-2 grid-config">
        <section className="section form" aria-label="Parámetros de la comparación">
          <Select<number> label="Demanda base (observada)" value={baseId} onChange={setBaseId} options={observed.map((d) => ({ value: d.id, label: d.name }))} />
          <Select<number>
            label="Escenario simulado a comparar"
            value={simId}
            onChange={setSimId}
            options={[{ value: 0, label: 'Ninguno' }, ...simulated.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <NumberInput label="Tiempo medio de atención" suffix="s" value={serviceSeconds} min={0} step={0.1} onChange={setServiceSeconds} error={serviceSeconds === '' || serviceSeconds <= 0 ? 'Debe ser mayor que 0.' : null} />
          <div className="row-2">
            <NumberInput label="Aumento de demanda A" suffix="%" value={inc1} min={0} step={1} onChange={setInc1} />
            <NumberInput label="Aumento de demanda B" suffix="%" value={inc2} min={0} step={1} onChange={setInc2} />
          </div>
          <NumberInput label="Reducción del tiempo de atención" suffix="%" value={reduction} min={0} max={90} step={1} onChange={setReduction} />
          <NumberInput label="Entradas de la 80 que pasan a la 70" suffix="%" value={redistribution} min={0} max={100} step={1} onChange={setRedistribution} />
          <Callout>
            {`Barreras de entrada existentes: carrera 70 = ${entryCfg('C70')?.existingServers ?? '?'}, carrera 80 = ${entryCfg('C80')?.existingServers ?? '?'}. Cualquier barrera adicional se marca como hipotética.`}
          </Callout>
        </section>

        <div className="stack" style={{ marginTop: 0 }}>
          {!results ? (
            <Callout tone="bad">Revise el tiempo de atención para calcular los escenarios.</Callout>
          ) : (
            <>
              <section className="section">
                <div className="section-head">
                  <h2>Espera en fila en el intervalo pico</h2>
                  <Field label="Acceso">
                    <div className="segmented" role="group" aria-label="Acceso del gráfico">
                      {(['C70', 'C80'] as AccessId[]).map((a) => (
                        <button key={a} type="button" aria-pressed={access === a} onClick={() => setAccess(a)}>{a === 'C70' ? '70' : '80'}</button>
                      ))}
                    </div>
                  </Field>
                </div>
                <ChartFrame legend={<Legend items={[{ label: 'Demanda promedio', color: CC.E80 }, { label: 'Intervalo pico', color: CC.sign }]} />}>
                  {(w) => (
                    <BarChart
                      width={w}
                      height={w < 640 ? 320 : 260}
                      title={`Espera promedio en fila por escenario, ${ACCESS_LABEL[access]} (segundos)`}
                      categories={results.map((r) => r.input.name)}
                      valueFormat={(v) => fmt(v, 1)}
                      groups={[
                        { name: 'Promedio', color: CC.E80, values: results.map((r) => waitSeconds(r.perAccess[access].avg)) },
                        { name: 'Pico', color: CC.sign, values: results.map((r) => waitSeconds(r.perAccess[access].peak)) },
                      ]}
                    />
                  )}
                </ChartFrame>
                <p className="small muted">Segundos de espera en fila. "∞" indica que el escenario no alcanza equilibrio (ρ ≥ 1).</p>
              </section>

              <section className="section">
                <div className="section-head">
                  <h2>Indicadores por escenario</h2>
                  <p>Diferencias frente a "{results[0].input.name}". Verde: mejora; rojo: empeora.</p>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Escenario</th><th>Acceso</th><th className="n">Barreras</th><th className="n">λ prom. (veh/min)</th>
                        <th className="n">ρ prom.</th><th className="n">ρ pico</th><th className="n">Wq prom. (s)</th><th className="n">Wq pico (s)</th>
                        <th className="n">Capacidad (veh/h)</th><th>Riesgo en pico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.flatMap((r) =>
                        (['C70', 'C80'] as AccessId[]).map((a, i) => {
                          const p = r.perAccess[a];
                          const b = base!.perAccess[a];
                          return (
                            <tr key={r.input.id + a} className={r.input.source === 'simulado' ? 'row-sim' : undefined}>
                              {i === 0 && (
                                <td rowSpan={2} style={{ whiteSpace: 'normal', minWidth: 150, verticalAlign: 'top' }}>
                                  <b>{r.input.name}</b>
                                  {r.input.source === 'simulado' && <div><span className="badge badge-simulado">Simulado</span></div>}
                                </td>
                              )}
                              <td>{a === 'C70' ? '70' : '80'}</td>
                              <td className="n">{p.servers}{p.hypotheticalServers ? <span className="badge badge-hipotetico" style={{ marginLeft: 4 }}>+{p.hypotheticalServers} hip.</span> : null}</td>
                              <td className="n">{fmt(p.lambda, 2)}</td>
                              <DiffCell base={rhoOf(b.avg)} value={rhoOf(p.avg)} digits={3} />
                              <DiffCell base={rhoOf(b.peak)} value={rhoOf(p.peak)} digits={3} />
                              <DiffCell base={waitSeconds(b.avg)} value={waitSeconds(p.avg)} digits={2} />
                              <DiffCell base={waitSeconds(b.peak)} value={waitSeconds(p.peak)} digits={2} />
                              <td className="n">{fmt(p.capacityPerHour, 0)}</td>
                              <td><RiskTag risk={p.peakRisk} /></td>
                            </tr>
                          );
                        }),
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-small" onClick={save}><IconSave />Guardar comparación</button>
                </div>
              </section>

              <section className="section">
                <div className="section-head"><h2>Lectura de resultados ({ACCESS_LABEL[access]})</h2></div>
                <div className="stack">
                  <p>
                    Con la demanda de "{results[0].input.name}", la utilización en el pico es{' '}
                    <b>{fmtPct(rhoOf(base!.perAccess[access].peak))}</b> y el riesgo de saturación es{' '}
                    <b>{RISK_LABEL[base!.perAccess[access].peakRisk].toLowerCase()}</b>.
                  </p>
                  <p>
                    {improved.length
                      ? `Reducen la espera en el pico: ${improved.map((r) => r.input.name).join(', ')}.`
                      : 'Ningún escenario reduce la espera en el pico frente a la base.'}
                  </p>
                  {results.some((r) => r.worstRisk === 'critico') && (
                    <Callout tone="bad">
                      {`Escenarios sin equilibrio (fila creciente en el pico): ${results.filter((r) => r.worstRisk === 'critico').map((r) => r.input.name).join(', ')}.`}
                    </Callout>
                  )}
                  <details className="disclosure">
                    <summary>Supuestos de cada escenario</summary>
                    <ul className="small">
                      {results.map((r) => (
                        <li key={r.input.id}><b>{r.input.name}:</b> {r.input.description} {r.input.hypotheses.join(' ')}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {saved.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Comparaciones guardadas</h2></div>
          <ul className="issue-list" style={{ maxHeight: 'none' }}>
            {saved.map((s) => (
              <li key={s.id} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span><b>{s.name}</b> · {s.description} · <span className="muted">{fmtDateTime(s.createdAt)}</span></span>
                <button type="button" className="icon-btn" aria-label="Eliminar comparación" onClick={() => scenariosRepo.remove(db, s.id)}><IconTrash /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
