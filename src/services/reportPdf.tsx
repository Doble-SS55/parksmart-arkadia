import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { renderToStaticMarkup } from 'react-dom/server';
import { BarChart, CHART_COLORS, Histogram, LineChart } from '../components/charts/charts';
import { fmt, fmtInt, fmtPct } from '../core/format';
import { formulaLines, VARIABLE_GLOSSARY } from '../core/queueing/formulas';
import { RISK_LABEL, type QueueResult } from '../core/queueing/queueing';
import { rhoOf, waitSeconds } from '../core/scenarios/compare';
import { formatLongDate } from '../core/time';
import { ACCESS_LABEL, FLOW_IDS, FLOW_LABEL, PARAMETER_SOURCE_LABEL, type AccessId } from '../core/types';
import type { ReportData } from './reportData';

/**
 * Construye la definición pdfmake del informe académico.
 * Todo el contenido proviene de `ReportData`, que se arma con el estado real de la base.
 */

const C = {
  sign: '#10284A',
  action: '#1565D8',
  muted: '#5A6878',
  line: '#D5DBE3',
  soft: '#F2F5F8',
  warn: '#B57A00',
  warnSoft: '#FDF3DC',
  bad: '#C62E2E',
  good: '#0E8A7E',
};

const PAGE_W = 515; // ancho útil A4 con márgenes de 40 pt

function svg(node: React.ReactElement): string {
  const html = renderToStaticMarkup(node);
  const start = html.indexOf('<svg');
  const end = html.lastIndexOf('</svg>');
  if (start === -1 || end === -1) throw new Error('El gráfico no produjo un SVG.');
  return html.slice(start, end + 6).replace(/font-family="[^"]*"/g, 'font-family="Roboto"');
}

function h1(text: string): Content {
  return { text, style: 'h1', tocItem: true, headlineLevel: 1, margin: [0, 18, 0, 8] } as Content;
}
function h2(text: string): Content {
  return { text, style: 'h2', headlineLevel: 2, margin: [0, 12, 0, 6] } as Content;
}
const NUMERIC = /^[−+-]?[\d.,]+(\s?(%|s|veh|min))?$/;
function p(text: string | Content[], extra: Record<string, unknown> = {}): Content {
  return { text, style: 'body', margin: [0, 0, 0, 6], ...extra } as Content;
}
function note(text: string, tone: 'warn' | 'info' = 'info'): Content {
  return {
    table: { widths: ['*'], body: [[{ text, style: 'note', fillColor: tone === 'warn' ? C.warnSoft : C.soft, margin: [8, 6, 8, 6] }]] },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => (tone === 'warn' ? C.warn : C.action) },
    margin: [0, 4, 0, 8],
  };
}
function table(header: string[], rows: (string | number)[][], widths?: (string | number)[], align?: ('left' | 'right')[]): Content {
  const alignOf = (c: string | number, i: number): 'left' | 'right' =>
    align?.[i] ?? (typeof c === 'number' || (i > 0 && NUMERIC.test(String(c).trim())) ? 'right' : 'left');
  const body: TableCell[][] = [
    header.map((h, i) => ({ text: h, style: 'th', alignment: rows[0] ? alignOf(rows[0][i], i) : 'left' })),
    ...rows.map((r) => r.map((c, i) => ({ text: String(c), style: 'td', alignment: alignOf(c, i) }))),
  ];
  return {
    table: { headerRows: 1, keepWithHeaderRows: 1, widths: widths ?? header.map(() => '*'), body, dontBreakRows: true },
    layout: {
      fillColor: (row: number) => (row === 0 ? C.soft : null),
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.3),
      vLineWidth: () => 0,
      hLineColor: () => C.line,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, 2, 0, 10],
  };
}
function bullets(items: string[]): Content {
  return { ul: items.map((t) => ({ text: t, style: 'body', margin: [0, 0, 0, 3] })), margin: [0, 0, 0, 8] };
}

const wq = (r: QueueResult) => (r.status === 'stable' ? `${fmt(r.wq * 60, 2)} s` : 'sin equilibrio');
const lq = (r: QueueResult) => (r.status === 'stable' ? fmt(r.lq, 3) : '∞');
const rho = (r: QueueResult) => (r.status === 'invalid' ? '—' : fmt(r.rho, 3));

export function buildReportDocument(d: ReportData): TDocumentDefinitions {
  const obs = d.observed;
  const sim = d.simulated;
  const S = obs.summary;
  const serviceApprox = d.configs.some((c) => c.serviceSource !== 'confirmado');
  const generated = d.generatedAt.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });

  /* ───── Gráficos ───── */
  const demandChart = svg(
    <LineChart
      width={PAGE_W}
      height={230}
      interactive={false}
      title="Vehículos por intervalo"
      labels={obs.series.starts}
      yLabel="vehículos"
      series={FLOW_IDS.map((f) => ({ name: FLOW_LABEL[f], values: obs.series.values[f], color: CHART_COLORS[f] }))}
    />,
  );
  const simChart = sim
    ? svg(
        <LineChart
          width={PAGE_W}
          height={210}
          interactive={false}
          title="Vehículos por intervalo (simulado)"
          labels={sim.series.starts}
          yLabel="vehículos"
          series={FLOW_IDS.map((f) => ({ name: FLOW_LABEL[f], values: sim.series.values[f], color: CHART_COLORS[f], dashed: true }))}
        />,
      )
    : null;
  const accessChart = svg(
    <BarChart
      width={PAGE_W}
      height={200}
      title="Entradas y salidas por acceso"
      categories={sim ? ['C70 observado', 'C80 observado', 'C70 simulado', 'C80 simulado'] : ['Carrera 70', 'Carrera 80']}
      groups={[
        { name: 'Entradas', color: CHART_COLORS.E70, values: sim ? [S.entriesByAccess.C70, S.entriesByAccess.C80, sim.summary.entriesByAccess.C70, sim.summary.entriesByAccess.C80] : [S.entriesByAccess.C70, S.entriesByAccess.C80] },
        { name: 'Salidas', color: CHART_COLORS.S70, values: sim ? [S.exitsByAccess.C70, S.exitsByAccess.C80, sim.summary.exitsByAccess.C70, sim.summary.exitsByAccess.C80] : [S.exitsByAccess.C70, S.exitsByAccess.C80] },
      ]}
    />,
  );
  const scenarioChart = svg(
    <BarChart
      width={PAGE_W}
      height={240}
      title="Espera en fila en el intervalo pico por escenario (s), carrera 80"
      categories={d.scenarios.map((s) => s.input.name)}
      valueFormat={(v) => fmt(v, 1)}
      groups={[
        { name: 'C70', color: CHART_COLORS.E70, values: d.scenarios.map((s) => waitSeconds(s.perAccess.C70.peak)) },
        { name: 'C80', color: CHART_COLORS.E80, values: d.scenarios.map((s) => waitSeconds(s.perAccess.C80.peak)) },
      ]}
    />,
  );
  const mc = d.montecarlo;
  const mcChart = mc
    ? svg(
        <Histogram
          width={PAGE_W}
          height={200}
          title="Distribución del total simulado"
          edges={mc.summary.histogram.edges}
          counts={mc.summary.histogram.counts}
          xLabel="vehículos en el periodo"
          markers={[
            { value: mc.summary.totalStats.mean, label: 'media', color: CHART_COLORS.sign },
            { value: mc.summary.totalStats.p5, label: 'P5', color: CHART_COLORS.warn, dashed: true },
            { value: mc.summary.totalStats.p95, label: 'P95', color: CHART_COLORS.warn, dashed: true },
          ]}
        />,
      )
    : null;

  /* ───── Interpretación y conclusiones derivadas de los resultados ───── */
  const entries = d.queues.filter((q) => q.direction === 'entrada');
  const worst = [...entries].sort((a, b) => (rhoOf(b.peak) ?? 99) - (rhoOf(a.peak) ?? 99))[0];
  const base = d.scenarios[0];
  const better = d.scenarios.slice(1).filter((s) => {
    const b = waitSeconds(base.perAccess.C80.peak);
    const v = waitSeconds(s.perAccess.C80.peak);
    return v !== null && b !== null && v < b - 1e-9;
  });
  const critical = d.scenarios.filter((s) => s.worstRisk === 'critico');
  const satScenario = d.scenarios.find((s) => s.input.id === 'sabado');

  const interpretation: string[] = [
    `En el periodo observado entraron ${fmtInt(S.totalEntries)} vehículos (${fmt(S.entriesPerMinute, 2)} por minuto) y salieron ${fmtInt(S.totalExits)}. ` +
      `La carrera 80 concentró el ${fmtPct(S.totalEntries ? S.entriesByAccess.C80 / S.totalEntries : 0)} de las entradas. ` +
      `El intervalo de mayor demanda de entrada fue ${S.peakEntries?.start}–${S.peakEntries?.end} con ${S.peakEntries?.value} vehículos.`,
    ...entries.map((q) =>
      `${ACCESS_LABEL[q.access]}: con ${q.config.existingServers} barrera(s) y ${fmt(q.config.meanServiceSeconds, 1)} s por vehículo, la utilización promedio es ` +
      `${q.avg.status === 'invalid' ? '—' : fmtPct(q.avg.rho)} y en el intervalo pico ${q.peak.status === 'invalid' ? '—' : fmtPct(q.peak.rho)}; ` +
      `la espera promedio en fila resulta ${wq(q.avg)} (pico: ${wq(q.peak)}). Riesgo de saturación en el pico: ${RISK_LABEL[q.peakRisk].toLowerCase()}.`,
    ),
  ];
  if (satScenario && sim) {
    interpretation.push(
      `Con la demanda simulada del sábado (sintética), la utilización en el pico de la carrera 80 sería ${fmtPct(rhoOf(satScenario.perAccess.C80.peak))} ` +
        `y la espera ${satScenario.perAccess.C80.peak.status === 'stable' ? `${fmt(waitSeconds(satScenario.perAccess.C80.peak), 2)} s` : 'no alcanzaría equilibrio'}. ` +
        'Este resultado depende de los aumentos supuestos en el notebook y no de una medición.',
    );
  }
  if (critical.length) interpretation.push(`Escenarios sin equilibrio en el pico (fila creciente): ${critical.map((s) => s.input.name).join(', ')}.`);

  const conclusions: string[] = [
    `El modelo M/M/s, alimentado con los conteos del ${formatLongDate(obs.dataset.date)}, indica que el acceso con mayor exigencia es ${worst ? ACCESS_LABEL[worst.access] : '—'}` +
      `${worst && worst.peak.status !== 'invalid' ? `, con una utilización de ${fmtPct(worst.peak.rho)} en el intervalo pico` : ''}.`,
    serviceApprox
      ? 'Los resultados de espera dependen fuertemente del tiempo de atención, que hoy proviene de la subida de barrera observada (4–6 s). Si el ciclo real del vehículo es más largo, la congestión será mayor que la calculada.'
      : 'El tiempo de atención usado fue confirmado en campo.',
    better.length
      ? `Entre los escenarios hipotéticos, reducen la espera en el pico de la carrera 80: ${better.map((s) => s.input.name).join(', ')}.`
      : 'Ningún escenario hipotético reduce de forma apreciable la espera en el pico frente a la situación observada.',
    d.notebook
      ? `La aplicación reproduce el notebook de Colab del sábado: ${d.notebook.matches} de ${d.notebook.total} valores coinciden con el archivo entregado.`
      : 'No se verificó la reproducción del notebook del sábado con el conjunto elegido.',
  ];

  const recommendations: string[] = [
    'Cronometrar en campo el ciclo completo de atención por vehículo (desde que se detiene en la barrera hasta que la cruza) en una muestra de al menos 30 vehículos por acceso, y reemplazar el valor aproximado de la aplicación.',
    'Repetir el conteo un sábado real entre 18:00 y 20:00 para validar la simulación Montecarlo del sábado.',
    'Verificar el número de barreras de salida por acceso: hoy está marcado como "sin dato".',
  ];
  const hyp3 = d.scenarios.find((s) => s.input.id === 'barreras-3');
  if (hyp3 && (hyp3.perAccess.C80.hypotheticalServers > 0 || hyp3.perAccess.C70.hypotheticalServers > 0)) {
    recommendations.push(
      'Antes de considerar una barrera adicional (hoy inexistente, por lo tanto hipotética), comparar su beneficio en el pico con medidas de menor costo como la lectura automática de placas o la información en vía para repartir la demanda entre accesos.',
    );
  }
  if (critical.length) recommendations.push('Atender primero los escenarios marcados como sin equilibrio: en ellos la fila crece durante todo el pico.');

  /* ───── Documento ───── */
  const content: Content[] = [
    // Portada
    { text: 'ParkSmart Arkadia', color: '#FFFFFF', fontSize: 30, bold: true, margin: [0, 40, 0, 6] },
    { text: 'Modelamiento y simulación estocástica del flujo vehicular en los accesos al parqueadero del Centro Comercial Arkadia, Medellín', color: '#DCE4EF', fontSize: 14, margin: [0, 0, 0, 30] },
    { text: 'Reto 3 · Teoría de colas M/M/1 y M/M/s, simulación Montecarlo y simulación de eventos discretos', color: '#A9BAD3', fontSize: 11, margin: [0, 0, 0, 120] },
    { text: 'Integrantes', style: 'h2', margin: [0, 30, 0, 4] },
    ...(d.team.length ? d.team : ['(sin integrantes registrados)']).map((t) => ({ text: t, fontSize: 12, margin: [0, 0, 0, 2] }) as Content),
    { text: 'Curso', style: 'h2', margin: [0, 14, 0, 4] },
    { text: d.course || '—', fontSize: 12 },
    ...(d.teacher ? [{ text: 'Docente', style: 'h2', margin: [0, 14, 0, 4] } as Content, { text: d.teacher, fontSize: 12 } as Content] : []),
    ...(d.institution ? [{ text: 'Institución', style: 'h2', margin: [0, 14, 0, 4] } as Content, { text: d.institution, fontSize: 12 } as Content] : []),
    { text: `Fecha de generación: ${generated}`, fontSize: 10, color: C.muted, margin: [0, 30, 0, 0] },
    {
      text: 'Los datos observados y los datos simulados se identifican por separado en todo el documento. Los valores marcados como hipotéticos o aproximados no son mediciones.',
      fontSize: 9, color: C.muted, margin: [0, 6, 0, 0], pageBreak: 'after',
    },

    { toc: { title: { text: 'Contenido', style: 'h1' } } } as Content,
    { text: '', pageBreak: 'after' },

    h1('1. Objetivo del análisis'),
    p('Modelar el flujo vehicular en los accesos al parqueadero del Centro Comercial Arkadia (carrera 70 y carrera 80) para estimar la utilización de las barreras de entrada, la longitud de las filas y los tiempos de espera, y evaluar escenarios hipotéticos de mejora con teoría de colas, simulación Montecarlo y simulación de eventos discretos.'),

    h1('2. Descripción y procedencia de los datos'),
    h2('2.1 Datos observados'),
    table(['Campo', 'Valor'], [
      ['Conjunto', obs.dataset.name],
      ['Origen', 'Observado en campo (observación directa)'],
      ['Fecha', formatLongDate(obs.dataset.date)],
      ['Periodo', `${S.firstStart ?? '—'}–${S.lastEnd ?? '—'} (${S.durationMinutes} min, ${S.intervals} intervalos de ${obs.series.intervalMinutes} min)`],
      ['Archivo fuente', obs.dataset.sourceFile ?? '—'],
      ['Flujos', 'Entrada 70, salida 70, entrada 80, salida 80'],
      ['Registros', String(obs.dataset.recordCount ?? S.intervals * 4)],
    ], [120, '*'], ['left', 'left']),
    ...(obs.dataset.description ? [p(obs.dataset.description)] : []),
    ...(sim
      ? [
          h2('2.2 Datos simulados'),
          note('Los datos de esta sección son SINTÉTICOS. Se generaron por simulación Montecarlo y no son mediciones reales.', 'warn'),
          table(['Campo', 'Valor'], [
            ['Conjunto', sim.dataset.name],
            ['Origen', 'Simulado (Montecarlo)'],
            ['Fecha del escenario', formatLongDate(sim.dataset.date)],
            ['Periodo', `${sim.summary.firstStart ?? '—'}–${sim.summary.lastEnd ?? '—'}`],
            ['Fuente', sim.dataset.sourceFile ?? (sim.dataset.montecarloRunId ? `Ejecución Montecarlo #${sim.dataset.montecarloRunId}` : '—')],
            ['Conjunto de referencia', sim.reference?.name ?? '—'],
          ], [120, '*'], ['left', 'left']),
          ...(sim.dataset.description ? [p(sim.dataset.description)] : []),
        ]
      : []),
    p('Los conteos por intervalo no se convirtieron en tiempos individuales de atención: el tiempo de servicio es un parámetro aparte.'),

    h1('3. Metodología'),
    bullets([
      'Estimación de la tasa de llegada λ de cada barrera como vehículos contados entre la duración del periodo (y, por separado, en el intervalo de 5 minutos con más llegadas). La tasa de salida observada no se usa como tasa de llegada ni como tasa de servicio.',
      'Modelos de colas M/M/1 y M/M/s en estado estacionario, uno por acceso y dirección (las entradas de la 70 y la 80 no comparten fila).',
      'Verificación del supuesto de llegadas Poisson con el índice de dispersión D = s²/x̄ y su prueba χ².',
      'Simulación Montecarlo: conteos por intervalo ~ Poisson(λᵢ) con λᵢ = base · factor · (1 + A·sen(iπ/P)) y eventos ocasionales de baja actividad; generador Mersenne Twister reproducible con semilla (o congruencial lineal de Park–Miller).',
      'Simulación de eventos discretos con llegadas exponenciales, s barreras y fila compartida, registrando llegada, inicio y fin de atención de cada vehículo.',
      'Comparación de escenarios hipotéticos (número de barreras, demanda, tiempo de atención y reparto entre accesos).',
    ]),

    h1('4. Parámetros'),
    table(
      ['Acceso', 'Dirección', 'Barreras', 'Procedencia', 'Atención (s)', 'Rango (s)', 'Procedencia'],
      d.configs.map((c) => [
        ACCESS_LABEL[c.access], c.direction, c.existingServers, PARAMETER_SOURCE_LABEL[c.serversSource], fmt(c.meanServiceSeconds, 1),
        c.serviceMinSeconds !== null ? `${fmt(c.serviceMinSeconds, 1)}–${fmt(c.serviceMaxSeconds, 1)}` : '—', PARAMETER_SOURCE_LABEL[c.serviceSource],
      ]),
      [62, 48, 42, 80, 52, 50, '*'],
      ['left', 'left', 'right', 'left', 'right', 'right', 'left'],
    ),
    ...(serviceApprox
      ? [note('El tiempo de atención proviene de la subida de barrera observada por el equipo (4–6 s). Falta confirmar si incluye todo el ciclo del vehículo; por eso se marca como aproximación de campo.', 'warn')]
      : []),

    h1('5. Fórmulas'),
    ...(() => {
      const ref = entries.find((q) => q.avg.status !== 'invalid');
      if (!ref || ref.avg.status === 'invalid') return [p('No hay resultados válidos para mostrar fórmulas.')];
      const lines = formulaLines(ref.avg, 'min');
      return [
        p(`Ejemplo con ${ACCESS_LABEL[ref.access]} (entrada, demanda promedio, unidades en minutos):`),
        table(['Indicador', 'Expresión', 'Con los valores'], lines.map((l) => [l.name, l.expression, l.substituted]), [110, 170, '*'], ['left', 'left', 'left']),
        p('Para M/M/1 (s = 1): ρ = λ/μ, P₀ = 1 − ρ, Lq = ρ²/(1 − ρ), Wq = Lq/λ, W = Wq + 1/μ, L = λ·W.'),
        table(['Variable', 'Significado'], VARIABLE_GLOSSARY.map(([k, v]) => [k, v]), [50, '*'], ['left', 'left']),
      ];
    })(),

    h1('6. Resultados'),
    h2('6.1 Demanda observada'),
    { svg: demandChart, width: PAGE_W, margin: [0, 0, 0, 4] },
    p('Trazo sólido: datos observados. Azul: entrada y salida 70; verde: entrada y salida 80 (tono claro = salida).', { style: 'caption' }),
    table(
      ['Flujo', 'Total', 'Por minuto', 'Intervalo pico', 'Máximo'],
      FLOW_IDS.map((f) => [FLOW_LABEL[f], S.totalsByFlow[f], fmt(S.durationMinutes ? S.totalsByFlow[f] / S.durationMinutes : 0, 2), `${S.peakByFlow[f]?.start ?? '—'}–${S.peakByFlow[f]?.end ?? ''}`, S.peakByFlow[f]?.value ?? 0]),
      ['*', 50, 60, 90, 50],
    ),
    { svg: accessChart, width: PAGE_W, margin: [0, 0, 0, 4] },
    p('Barras oscuras: entradas; barras claras: salidas.', { style: 'caption' }),
    ...(sim && simChart
      ? [h2('6.2 Demanda simulada (sábado)'), note('Datos sintéticos (trazo punteado).', 'warn'), { svg: simChart, width: PAGE_W } as Content,
          table(['Indicador', 'Observado', 'Simulado'], [
            ['Entradas totales', S.totalEntries, sim.summary.totalEntries],
            ['Salidas totales', S.totalExits, sim.summary.totalExits],
            ['Entradas por minuto', fmt(S.entriesPerMinute, 2), fmt(sim.summary.entriesPerMinute, 2)],
            ['Pico de entradas (5 min)', S.peakEntries?.value ?? 0, sim.summary.peakEntries?.value ?? 0],
          ], ['*', 90, 90])]
      : []),
    h2(`6.${sim ? 3 : 2} Teoría de colas por acceso (datos observados)`),
    table(
      ['Barrera', 's', 'λ prom.', 'λ pico', 'μ', 'ρ prom.', 'ρ pico', 'Lq', 'Wq prom.', 'Wq pico', 'Riesgo pico'],
      d.queues.map((q) => [
        `${q.access === 'C70' ? '70' : '80'} ${q.direction}`, q.config.existingServers, fmt(q.estimate.lambdaPerMin, 2), fmt(q.estimate.peakLambdaPerMin, 2),
        fmt(q.avg.status === 'invalid' ? NaN : q.avg.mu, 1), rho(q.avg), rho(q.peak), lq(q.avg), wq(q.avg), wq(q.peak), RISK_LABEL[q.peakRisk],
      ]),
      [52, 18, 38, 38, 30, 38, 38, 34, 50, 50, '*'],
      ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'left'],
    ),
    p('Tasas en vehículos por minuto. Wq = espera promedio en fila. "Sin equilibrio" indica ρ ≥ 1: la fila crece mientras dure esa demanda.', { style: 'caption' }),
    ...(entries.some((q) => q.avg.status === 'stable')
      ? [table(
          ['Barrera', 'P₀', 'Prob. esperar', 'L', 'W (s)', 'Little: L − λW'],
          entries.filter((q) => q.avg.status === 'stable').map((q) => {
            const r = q.avg as Extract<QueueResult, { status: 'stable' }>;
            return [`${q.access === 'C70' ? '70' : '80'} entrada`, fmt(r.p0, 4), fmtPct(r.pWait), fmt(r.l, 4), fmt(r.w * 60, 2), r.littleResidual.toExponential(1)];
          }),
          ['*', 50, 70, 50, 50, 80],
        )]
      : []),
    h2('Verificación del supuesto de Poisson'),
    table(
      ['Barrera', 'Media', 'Varianza', 'D', 'χ²', 'gl', 'Valor p', 'Lectura'],
      d.queues.map((q) => [
        `${q.access === 'C70' ? '70' : '80'} ${q.direction}`, fmt(q.dispersion.mean, 2), fmt(q.dispersion.variance, 2), fmt(q.dispersion.index, 3),
        fmt(q.dispersion.chiSquare, 2), q.dispersion.df, fmt(q.dispersion.pValue, 3),
        { compatible: 'Compatible con Poisson', sobredispersion: 'Sobredispersión', subdispersion: 'Subdispersión', insuficiente: 'Datos insuficientes' }[q.dispersion.verdict],
      ]),
      [56, 38, 46, 34, 38, 22, 40, '*'],
      ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'left'],
    ),
    ...(d.savedQueueResults.length
      ? [h2('Resultados guardados desde la aplicación'), table(
          ['Fecha', 'Barrera', 'Modelo', 'λ', 'μ', 'ρ', 'Wq (s)'],
          d.savedQueueResults.map((q) => [
            new Date(`${q.createdAt}`).toLocaleDateString('es-CO'), `${q.access === 'C70' ? '70' : '80'} ${q.direction}`,
            q.model === 'MM1' ? 'M/M/1' : `M/M/${q.servers}`, fmt(q.lambda, 3), fmt(q.mu, 2),
            q.result.status === 'invalid' ? '—' : fmt(q.result.rho, 3), q.result.status === 'stable' ? fmt(q.result.wq * 60, 2) : '∞',
          ]),
          [70, 70, 50, 50, 50, 50, '*'],
        )]
      : []),

    h2(`6.${sim ? 4 : 3} Simulación Montecarlo`),
    ...(d.notebook
      ? [p(`Reproducción del notebook del sábado 7 de noviembre (semilla 20261107): ${d.notebook.matches} de ${d.notebook.total} valores coinciden con el archivo entregado. ` +
          `Totales: E70 ${d.notebook.totals[0]}, S70 ${d.notebook.totals[1]}, E80 ${d.notebook.totals[2]}, S80 ${d.notebook.totals[3]}. ` +
          `El notebook recorta los conteos a un tope supuesto (1,35 × máximo del viernes); en esta corrida el tope recortó ${d.notebook.truncations} valor(es).`)]
      : []),
    ...(mc && mcChart
      ? [
          note('Resultados sintéticos de un escenario hipotético.', 'warn'),
          table(['Parámetro', 'Valor'], [
            ['Ejecución', `${mc.name} (#${mc.id})`],
            ['Flujos', mc.flows.map((f) => FLOW_LABEL[f]).join(', ')],
            ['Simulaciones', fmtInt(mc.simulations)],
            ['Semilla / generador', `${mc.seed} / ${mc.generator === 'lcg' ? 'Park–Miller' : 'Mersenne Twister'}`],
            ['Factor de demanda', fmt(mc.params.demandFactor, 2)],
            ['Variación temporal / baja actividad', `${fmtPct(mc.params.temporalAmplitude, 0)} / ${fmtPct(mc.params.lowActivityProbability, 1)} (λ × ${fmt(mc.params.lowActivityFactor, 2)})`],
            ['Capacidad por intervalo', mc.params.capacityPerInterval !== null ? `${fmt(mc.params.capacityPerInterval, 1)} veh` : 'sin restricción'],
          ], [150, '*'], ['left', 'left']),
          table(['Media', 'DE', 'Mín.', 'P5', 'Mediana', 'P95', 'Máx.', 'Observado'], [[
            fmt(mc.summary.totalStats.mean, 1), fmt(mc.summary.totalStats.sd, 1), fmtInt(mc.summary.totalStats.min), fmt(mc.summary.totalStats.p5, 0),
            fmt(mc.summary.totalStats.p50, 0), fmt(mc.summary.totalStats.p95, 0), fmtInt(mc.summary.totalStats.max), fmtInt(mc.summary.observedTotal),
          ]]),
          { svg: mcChart, width: PAGE_W } as Content,
          p(`IC 95 % para la media del total: ${fmt(mc.summary.meanCi95[0], 1)}–${fmt(mc.summary.meanCi95[1], 1)}. Intervalo empírico del 90 %: ${fmt(mc.summary.totalStats.p5, 0)}–${fmt(mc.summary.totalStats.p95, 0)} vehículos.` +
            (mc.summary.probTotalExceeds !== null ? ` P(total > ${mc.params.totalThreshold}) = ${fmtPct(mc.summary.probTotalExceeds)}.` : '') +
            (mc.summary.capacity ? ` Con capacidad, quedan vehículos pendientes al final en el ${fmtPct(mc.summary.capacity.probPendingAtEnd)} de las simulaciones.` : '')),
        ]
      : [p('No hay ejecuciones Montecarlo guardadas. Guarde una desde el módulo Simular para incluirla.')]),

    h2(`6.${sim ? 5 : 4} Simulación de eventos discretos`),
    ...(d.simulation
      ? [table(['Indicador', 'Valor'], [
          ['Configuración', d.simulation.name],
          ['Duración simulada', `${fmt(d.simulation.params.horizonMin, 0)} min`],
          ['Distribución de atención', d.simulation.params.serviceDistribution],
          ['Vehículos que llegaron / atendidos', `${d.simulation.summary.arrived} / ${d.simulation.summary.served}`],
          ['Espera promedio en fila', `${fmt(d.simulation.summary.avgWait * 60, 2)} s (máx. ${fmt(d.simulation.summary.maxWait * 60, 1)} s)`],
          ['Utilización observada', fmtPct(d.simulation.summary.utilization)],
          ['Fila máxima / promedio', `${d.simulation.summary.maxQueue} / ${fmt(d.simulation.summary.timeAvgQueue, 3)} veh`],
          ['Eventos registrados', String(d.simulation.events ?? '—')],
        ], [170, '*'], ['left', 'left'])]
      : [p('No hay simulaciones de eventos discretos guardadas. Guarde una desde el simulador visual para incluirla.')]),

    h1('7. Comparación de escenarios'),
    note('Todos los escenarios distintos al observado son hipotéticos y no están implementados en Arkadia. Las barreras adicionales a las existentes se marcan como hipotéticas.', 'warn'),
    { svg: scenarioChart, width: PAGE_W } as Content,
    table(
      ['Escenario', 'Acc.', 's', 'λ prom.', 'ρ prom.', 'ρ pico', 'Wq prom. (s)', 'Wq pico (s)', 'Riesgo pico'],
      d.scenarios.flatMap((s) => (['C70', 'C80'] as AccessId[]).map((a) => {
        const r = s.perAccess[a];
        return [
          a === 'C70' ? s.input.name + (s.input.source === 'simulado' ? ' (simulado)' : '') : '', a === 'C70' ? '70' : '80',
          `${r.servers}${r.hypotheticalServers ? ` (+${r.hypotheticalServers} hip.)` : ''}`, fmt(r.lambda, 2), rho(r.avg), rho(r.peak),
          waitSeconds(r.avg) === null ? 'sin equil.' : fmt(waitSeconds(r.avg), 2), waitSeconds(r.peak) === null ? 'sin equil.' : fmt(waitSeconds(r.peak), 2), RISK_LABEL[r.peakRisk],
        ];
      })),
      [100, 22, 52, 38, 38, 38, 46, 46, '*'],
      ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'left'],
    ),
    bullets(d.scenarios.map((s) => `${s.input.name}: ${s.input.description} ${s.input.hypotheses.join(' ')}`)),

    h1('8. Interpretación de resultados'),
    ...interpretation.map((t) => p(t)),

    h1('9. Limitaciones'),
    bullets([
      'Un solo día de observación (viernes) y dos horas de registro: la muestra no captura la variación entre días ni eventos especiales.',
      'El tiempo de atención es una aproximación (subida de barrera de 4–6 s), no un cronometraje del ciclo completo de cada vehículo.',
      'M/M/s supone llegadas Poisson y atención exponencial en estado estacionario; la demanda real cambia durante el pico y la atención en barrera es más regular que una exponencial.',
      'Los datos del sábado son simulados con aumentos supuestos; no son mediciones.',
      'El modelo no incluye la circulación interna ni las entradas por piso, que ocurren después de la barrera.',
      'Las barreras de salida no se confirmaron en campo.',
    ]),

    h1('10. Conclusiones'),
    bullets(conclusions),

    h1('11. Recomendaciones'),
    bullets(recommendations),
    note('Las recomendaciones distinguen entre lo existente y lo hipotético; ninguna mejora evaluada se ha implementado en Arkadia.'),
  ];

  if (d.options.includeAnnex) {
    content.push(
      { text: '', pageBreak: 'before' },
      h1('Anexo A. Conteos observados por intervalo'),
      table(
        ['Intervalo', 'Entrada 70', 'Salida 70', 'Entrada 80', 'Salida 80', 'Entradas', 'Salidas'],
        obs.series.starts.map((s, i) => [
          `${s}–${obs.series.ends[i]}`, obs.series.values.E70[i], obs.series.values.S70[i], obs.series.values.E80[i], obs.series.values.S80[i],
          obs.series.values.E70[i] + obs.series.values.E80[i], obs.series.values.S70[i] + obs.series.values.S80[i],
        ]),
        [80, '*', '*', '*', '*', '*', '*'],
      ),
    );
    if (sim) {
      content.push(
        h1('Anexo B. Conteos simulados por intervalo (sintéticos)'),
        table(
          ['Intervalo', 'Entrada 70', 'Salida 70', 'Entrada 80', 'Salida 80', 'Entradas', 'Salidas'],
          sim.series.starts.map((s, i) => [
            `${s}–${sim.series.ends[i]}`, sim.series.values.E70[i], sim.series.values.S70[i], sim.series.values.E80[i], sim.series.values.S80[i],
            sim.series.values.E70[i] + sim.series.values.E80[i], sim.series.values.S70[i] + sim.series.values.S80[i],
          ]),
          [80, '*', '*', '*', '*', '*', '*'],
        ),
      );
    }
  }

  return {
    pageSize: 'A4',
    // Evita títulos huérfanos al final de una página.
    pageBreakBefore: (node, queries) => !!node.headlineLevel && queries.getFollowingNodesOnPage().length <= 1,
    background: (page: number) =>
      page === 1 ? { canvas: [{ type: 'rect', x: 0, y: 0, w: 595.28, h: 330, color: C.sign }] } : null,
    pageMargins: [40, 50, 40, 50],
    info: { title: 'Informe ParkSmart Arkadia', author: d.team.join(', '), subject: 'Reto 3 — Modelamiento y simulación computacional' },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#14202E', lineHeight: 1.2 },
    header: (page: number) =>
      page === 1
        ? null
        : { text: 'ParkSmart Arkadia · Informe de modelamiento y simulación', fontSize: 8, color: C.muted, margin: [40, 24, 40, 0] },
    footer: (page: number, pages: number) =>
      page === 1
        ? null
        : {
            columns: [
              { text: `Generado: ${generated}`, fontSize: 8, color: C.muted },
              { text: `Página ${page} de ${pages}`, fontSize: 8, color: C.muted, alignment: 'right' },
            ],
            margin: [40, 16, 40, 0],
          },
    styles: {
      h1: { fontSize: 16, bold: true, color: C.sign },
      h2: { fontSize: 12, bold: true, color: C.sign },
      body: { fontSize: 10, lineHeight: 1.3 },
      caption: { fontSize: 8.5, color: C.muted, italics: true },
      note: { fontSize: 9 },
      th: { bold: true, fontSize: 8.5, color: C.sign },
      td: { fontSize: 8.5 },
    },
    content,
  };
}
