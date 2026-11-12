import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BrandMark, IconDownload, IconMoon, IconSun } from '../components/Icons';
import { APK_URL } from '../components/AndroidDownload';
import { BarChart, ChartFrame, Legend, LineChart, useChartColors } from '../components/charts/charts';
import { Segmented } from '../components/ui';
import { fmt, fmtInt, fmtPct } from '../core/format';
import type { QueueResult } from '../core/queueing/queueing';
import { ACCESS_LABEL, type AccessId } from '../core/types';
import { useTheme } from '../state/theme';
import { LiveAccess } from './LiveAccess';
import * as D from './data';

/* ───────── utilidades ───────── */

const sec = (r: QueueResult) => D.waitSeconds(r);
const rho = (r: QueueResult) => (r.status === 'invalid' ? null : r.rho);
const pw = (r: QueueResult) => (r.status === 'stable' ? r.pWait : null);
const fmtSec = (v: number | null, d = 1) =>
  v === null ? 'sin límite' : v >= 90 ? `${fmt(v / 60, 1)}\u00a0min` : `${fmt(v, d)}\u00a0s`;
const ACCESSES: AccessId[] = ['C70', 'C80'];

function Shield({ n }: { n: '70' | '80' }) {
  return (
    <span className="l-shield" aria-label={`Carrera ${n}`}>
      {n}
    </span>
  );
}

function Section({ id, title, intro, children, tone }: { id: string; title: string; intro?: ReactNode; children: ReactNode; tone?: 'plain' | 'tint' }) {
  return (
    <section id={id} className={`l-section${tone === 'tint' ? ' l-section-tint' : ''}`} aria-labelledby={`${id}-t`}>
      <div className="l-wrap">
        <h2 id={`${id}-t`} className="l-h2">{title}</h2>
        {intro && <div className="l-intro">{intro}</div>}
        {children}
      </div>
    </section>
  );
}

/* ───────── barra superior ───────── */

function TopBar() {
  const { resolved, toggle } = useTheme();
  return (
    <header className="l-top">
      <a href="#inicio" className="brand" aria-label="ParkSmart Arkadia, inicio">
        <BrandMark className="brand-mark" />
        <span className="brand-name">ParkSmart <span>Arkadia</span></span>
      </a>
      <nav className="l-nav" aria-label="Secciones">
        <a href="#proceso">Proceso</a>
        <a href="#evidencias">Evidencias</a>
        <a href="#resultados">Resultados</a>
        <a href="#plan">Plan de mejora</a>
        <a href="#app">La app</a>
      </nav>
      <button type="button" className="icon-btn theme-toggle" onClick={toggle} aria-label={resolved === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
        {resolved === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
      <a className="l-btn l-btn-light l-top-cta" href="../">Abrir la app</a>
    </header>
  );
}

/* ───────── portada ───────── */

function Hero() {
  const peak = D.lambdas.friday.C80;
  return (
    <section id="inicio" className="l-hero" aria-labelledby="hero-t">
      <div className="l-wrap">
        <div className="l-sign">
          <div className="l-sign-head">
            <span className="l-p" aria-hidden>P</span>
            <div>
              <p className="l-sign-kicker">Centro Comercial Arkadia, Medellín</p>
              <p className="l-sign-routes">
                Accesos por la <Shield n="70" /> y por la <Shield n="80" />
              </p>
            </div>
          </div>
          <h1 id="hero-t" className="l-h1">¿Cuánto espera un carro para entrar al parqueadero de Arkadia?</h1>
          <p className="l-lead">
            Un viernes de 5:30 a 7:30 de la noche contamos, en el andén, cada carro que entró y salió por los dos accesos. Con ese conteo
            armamos un modelo de colas, simulamos el sábado y construimos una app para que cualquiera repita las cuentas. Esta página cuenta
            cómo lo hicimos, qué encontramos y qué proponemos.
          </p>
          <LiveAccess
            lambda={peak.peakLambdaPerMin}
            servers={D.SERVERS}
            serviceSeconds={D.SERVICE_S}
            speed={8}
            seed={11}
            label={`Simulación en vivo del acceso por la 80 en su peor momento del viernes (${fmt(peak.peakLambdaPerMin, 1)} carros por minuto, ${D.SERVERS} barreras, ${fmtInt(D.SERVICE_S)} s por carro en promedio). Cada carro amarillo espera, el azul está en la barrera y el verde ya entró.`}
          />
          <div className="l-hero-actions">
            <a className="l-btn l-btn-amber" href="../">Abrir la aplicación</a>
            <a className="l-btn l-btn-outline" href={APK_URL}><IconDownload />Descargar para Android</a>
            <a className="l-btn l-btn-text" href="#plan">Ir al plan de mejora</a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────── el reto ───────── */

function Reto() {
  return (
    <Section
      id="reto"
      title="El reto"
      intro={
        <p>
          El Reto 3 del curso pide modelar el flujo de vehículos en el acceso a un centro comercial el fin de semana: tomar datos reales,
          construir un modelo de teoría de colas, desarrollar una app con informe en PDF y, con los resultados, proponer un plan de
          mejoramiento. Elegimos Arkadia porque tiene dos accesos con comportamientos distintos sobre dos vías muy cargadas.
        </p>
      }
    >
      <div className="l-facts">
        <div className="l-fact">
          <p className="l-fact-head"><Shield n="70" /> Acceso por la carrera 70</p>
          <p>Dos carriles de entrada, cada uno con su barrera.</p>
        </div>
        <div className="l-fact">
          <p className="l-fact-head"><Shield n="80" /> Acceso por la carrera 80</p>
          <p>Dos carriles de entrada, cada uno con su barrera. Es el acceso con más demanda.</p>
        </div>
        <div className="l-fact">
          <p className="l-fact-head"><span className="l-fact-num">{fmtInt(D.SERVICE_RANGE[0])}–{fmtInt(D.SERVICE_RANGE[1])} s</span></p>
          <p>Lo que tarda en subir la barrera, medido en campo. Usamos {fmtInt(D.SERVICE_S)} s como tiempo de atención y lo dejamos ajustable porque es el dato más incierto del estudio.</p>
        </div>
      </div>
      <p className="l-note">
        Cada acceso se modela como un sistema independiente: los carros que llegan por la 70 no hacen fila con los de la 80.
      </p>
    </Section>
  );
}

/* ───────── proceso ───────── */

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: 'Contar en campo',
    body: (
      <>
        Nos paramos frente a los accesos el viernes 6 de noviembre de 5:30 a 7:30 p. m. y registramos en el celular cada carro que entraba
        o salía, separado por acceso y por sentido. Lo agrupamos en intervalos de 5 minutos: {fmtInt(D.friday.series.starts.length)} intervalos
        por flujo, {fmtInt(D.friday.summary.totalEntries)} entradas y {fmtInt(D.friday.summary.totalExits)} salidas.
      </>
    ),
  },
  {
    title: 'Comprobar que las llegadas son aleatorias',
    body: (
      <>
        El modelo M/M/s supone llegadas de Poisson. Con la prueba de dispersión (varianza entre media) obtuvimos D = {fmt(D.dispersion.E70.index, 2)} en la 70
        (p = {fmt(D.dispersion.E70.pValue, 2)}) y D = {fmt(D.dispersion.E80.index, 2)} en la 80 (p = {fmt(D.dispersion.E80.pValue, 2)}). Ninguna rechaza el
        supuesto al 5 %, así que el modelo es razonable para estos datos.
      </>
    ),
  },
  {
    title: 'Construir el modelo de colas',
    body: (
      <>
        La tasa de llegada λ sale del conteo; la tasa de atención μ, del tiempo en la barrera ({fmtInt(D.SERVICE_S)} s, o sea {fmtInt(60 / D.SERVICE_S)} carros por
        minuto por barrera). Con {D.SERVERS} barreras por acceso usamos M/M/{D.SERVERS} con la fórmula de Erlang C para la probabilidad de esperar, la fila
        promedio y el tiempo de espera, y verificamos la ley de Little en cada cálculo.
      </>
    ),
  },
  {
    title: 'Simular el sábado con Montecarlo',
    body: (
      <>
        En Google Colab generamos el sábado de 6:00 a 8:00 p. m. con conteos de Poisson tomando el viernes como base. Después reescribimos el
        generador dentro de la app y reprodujimos el notebook valor por valor: {D.notebookCheck.matches} de {D.notebookCheck.total} coinciden.
        El sábado es una simulación y así se marca en todas partes (líneas punteadas e insignia rayada).
      </>
    ),
  },
  {
    title: 'Simular carro por carro',
    body: (
      <>
        Con un motor de eventos discretos seguimos a cada vehículo: llega, espera si las barreras están ocupadas, se atiende y entra. Es la
        animación de esta página. Sirve para comprobar que la teoría y la simulación dicen lo mismo y para ver qué pasa cuando la teoría ya no aplica.
      </>
    ),
  },
  {
    title: 'Llevarlo a una app',
    body: (
      <>
        Todo lo anterior quedó en ParkSmart Arkadia: se ingresan o importan datos de campo, se elige M/M/1 o M/M/s, se ven las ecuaciones con
        los valores reemplazados y se descarga el informe en PDF. Funciona en el navegador y como app de Android, sin internet.
      </>
    ),
  },
];

function Proceso() {
  return (
    <Section
      id="proceso"
      tone="tint"
      title="Cómo lo trabajamos"
      intro={<p>El trabajo siguió seis pasos, en este orden. Cada uno dependió del anterior.</p>}
    >
      <ol className="l-road">
        {STEPS.map((s, i) => (
          <li key={s.title} className="l-stop">
            <span className="l-stop-n" aria-hidden>{i + 1}</span>
            <div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="l-tools">
        <b>Herramientas:</b> Excel para el registro, Python en Google Colab para el Montecarlo, React y TypeScript para la app, SQLite para
        guardar los datos en el dispositivo y GitHub con Firebase para publicarla.
      </p>
    </Section>
  );
}

/* ───────── evidencias ───────── */

const PHOTOS = [
  { src: '../evidencias/conteo-acceso.jpg', alt: 'Integrante del equipo en el andén registrando en el celular un carro que cruza hacia el parqueadero', caption: 'Registro de un vehículo en el celular en el momento en que cruza hacia el acceso.' },
  { src: '../evidencias/conteo-noche.jpg', alt: 'Integrante del equipo en el sendero peatonal frente a un acceso vehicular, de noche', caption: 'Punto de observación sobre el andén, con vista directa a la entrada de los carros.' },
  { src: '../evidencias/conteo-equipo.jpg', alt: 'Integrante del equipo con los pulgares arriba y el tráfico de la vía detrás', caption: 'La jornada se hizo en la hora de más movimiento, con el tráfico de la vía en pleno.' },
];

function Evidencias() {
  return (
    <Section
      id="evidencias"
      title="Evidencias de la toma de datos"
      intro={
        <p>
          Los datos del viernes vienen de observación directa: nadie nos entregó una base de datos. Estas fotos son de la jornada de conteo en
          los accesos de Arkadia.
        </p>
      }
    >
      <div className="l-photos">
        {PHOTOS.map((p) => (
          <figure key={p.src} className="l-photo">
            <img src={p.src} alt={p.alt} loading="lazy" decoding="async" width={900} height={1200} />
            <figcaption>{p.caption}</figcaption>
          </figure>
        ))}
      </div>

      <div className="l-evidence-grid">
        <div>
          <h3 className="l-h3">Así quedó el registro</h3>
          <p className="l-muted">Primeros seis intervalos del viernes, en vehículos por cada 5 minutos.</p>
          <div className="table-wrap">
            <table className="table l-table">
              <thead>
                <tr><th scope="col">Intervalo</th><th scope="col" className="num">Entrada 70</th><th scope="col" className="num">Salida 70</th><th scope="col" className="num">Entrada 80</th><th scope="col" className="num">Salida 80</th></tr>
              </thead>
              <tbody>
                {D.fridaySample.map((r) => (
                  <tr key={r.start}>
                    <th scope="row">{r.start}–{r.end}</th>
                    {r.values.map((v, j) => <td key={j} className="num">{fmtInt(v)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="l-h3">¿Por qué la muestra es válida?</h3>
          <ul className="l-list">
            <li>Cubre las dos horas de más movimiento de la tarde del viernes, que es cuando importa saber si se forma fila.</li>
            <li>Son {fmtInt(D.friday.series.starts.length * 4)} registros ({fmtInt(D.friday.series.starts.length)} intervalos por cuatro flujos) y {fmtInt(D.friday.summary.totalEntries + D.friday.summary.totalExits)} vehículos contados uno por uno.</li>
            <li>La prueba de dispersión no rechaza que las llegadas sean de Poisson en ninguno de los dos accesos, que es el supuesto del modelo.</li>
            <li>Es un solo día. Por eso el plan propone repetir el conteo un sábado real antes de tomar decisiones costosas.</li>
          </ul>
        </div>
      </div>
    </Section>
  );
}

/* ───────── resultados ───────── */

function Resultados() {
  const P = useChartColors();
  const [day, setDay] = useState<'viernes' | 'sabado'>('viernes');
  const set = day === 'viernes' ? D.friday : D.saturday;
  const dashed = day === 'sabado';
  const c80 = D.queues.find((q) => q.access === 'C80')!;

  return (
    <Section
      id="resultados"
      tone="tint"
      title="Lo que encontramos"
      intro={
        <p>
          Con {fmtInt(D.SERVICE_S)} s por carro, las barreras de entrada trabajan con holgura. En el peor intervalo del viernes, la 80 recibe{' '}
          {fmt(D.lambdas.friday.C80.peakLambdaPerMin, 1)} carros por minuto y sus dos barreras están ocupadas el {fmtPct(rho(c80.fridayPeak), 0)} del tiempo:
          la espera promedio es de {fmtSec(sec(c80.fridayPeak))}. Ni siquiera el sábado simulado, más cargado, forma filas apreciables.
        </p>
      }
    >
      <div className="signboard l-board">
        <div className="signboard-head">
          <h3 className="l-board-title">Vehículos contados</h3>
          <Segmented<'viernes' | 'sabado'>
            label="Día"
            value={day}
            onChange={setDay}
            options={[{ value: 'viernes', label: 'Viernes observado' }, { value: 'sabado', label: 'Sábado simulado' }]}
          />
        </div>
        <div className="sign-accesses">
          {ACCESSES.map((a) => {
            return (
              <div key={a} className="sign-access">
                <span className="sign-access-name"><Shield n={a === 'C70' ? '70' : '80'} /> {ACCESS_LABEL[a]}</span>
                <span className="sign-figure">{fmtInt(set.summary.entriesByAccess[a])} <small>entradas</small></span>
                <span className="sign-sub"><b>{fmtInt(set.summary.exitsByAccess[a])}</b> salidas en dos horas</span>
              </div>
            );
          })}
        </div>
        <p className="l-board-note">
          {day === 'viernes'
            ? 'Viernes 6 de noviembre, 5:30 a 7:30 p. m. Datos observados en campo.'
            : 'Sábado 7 de noviembre, 6:00 a 8:00 p. m. Datos simulados con Montecarlo a partir del viernes: no son mediciones.'}
        </p>
      </div>

      <figure className="l-figure">
        <ChartFrame
          legend={<Legend items={[{ label: 'Entrada 70', color: P.E70, dashed }, { label: 'Entrada 80', color: P.E80, dashed }]} />}
        >
          {(w) => (
            <LineChart
              title={`Entradas por intervalo de 5 minutos, ${day === 'viernes' ? 'viernes observado' : 'sábado simulado'}`}
              labels={set.series.starts}
              width={w}
              height={260}
              yLabel="vehículos"
              series={[
                { name: 'Entrada 70', values: set.series.values.E70, color: P.E70, dashed, width: 2.5 },
                { name: 'Entrada 80', values: set.series.values.E80, color: P.E80, dashed, width: 2.5 },
              ]}
            />
          )}
        </ChartFrame>
        <figcaption>Entradas por cada 5 minutos. La 80 recibe más carros que la 70 en casi todos los intervalos.</figcaption>
      </figure>

      <h3 className="l-h3">El modelo M/M/{D.SERVERS}, acceso por acceso</h3>
      <div className="table-wrap">
        <table className="table l-table">
          <thead>
            <tr>
              <th scope="col">Acceso y momento</th>
              <th scope="col" className="num">Llegadas por minuto (λ)</th>
              <th scope="col" className="num">Utilización (ρ)</th>
              <th scope="col" className="num">Probabilidad de esperar</th>
              <th scope="col" className="num">Espera en fila (Wq)</th>
            </tr>
          </thead>
          <tbody>
            {D.queues.flatMap((q) => {
              const rows: [string, QueueResult, boolean][] = [
                ['viernes, promedio', q.fridayAvg, false],
                ['viernes, pico', q.fridayPeak, false],
                ['sábado, pico', q.saturdayPeak, true],
              ];
              return rows.map(([when, r, sim]) => (
                <tr key={q.access + when}>
                  <th scope="row">
                    {ACCESS_LABEL[q.access]}, {when}
                    {sim && <span className="badge badge-simulado l-inline-badge">Simulado</span>}
                  </th>
                  <td className="num">{r.status === 'invalid' ? '—' : fmt(r.lambda, 2)}</td>
                  <td className="num">{fmtPct(rho(r), 1)}</td>
                  <td className="num">{fmtPct(pw(r), 1)}</td>
                  <td className="num">{fmtSec(sec(r), 2)}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
      <p className="l-note">
        Con {D.SERVERS} barreras de {fmtInt(D.SERVICE_S)} s cada acceso puede atender hasta {fmtInt(D.capacity.accessPerHour)} carros por hora. El pico del
        viernes en la 80 equivale a {fmtInt(D.capacity.peakFridayC80PerHour)} carros por hora, y el del sábado simulado a {fmtInt(D.capacity.peakSaturdayC80PerHour)}.
      </p>
    </Section>
  );
}

/* ───────── plan de mejoramiento ───────── */

function Playground() {
  const [day, setDay] = useState<'viernes' | 'sabado'>('sabado');
  const [servers, setServers] = useState<'1' | '2' | '3'>('2');
  const [cycle, setCycle] = useState<'5' | '8' | '12' | '15'>('12');
  const lambda = (day === 'viernes' ? D.lambdas.friday : D.lambdas.saturday).C80.peakLambdaPerMin;
  const s = Number(servers);
  const t = Number(cycle);
  const theory = D.mmsFor(lambda, s, t);
  const stable = theory.status === 'stable';

  return (
    <div className="l-play">
      <div className="l-play-controls">
        <div>
          <p className="l-control-label">Demanda en la 80</p>
          <Segmented label="Demanda" value={day} onChange={setDay} options={[{ value: 'viernes', label: 'Pico viernes' }, { value: 'sabado', label: 'Pico sábado (simulado)' }]} />
        </div>
        <div>
          <p className="l-control-label">Barreras abiertas</p>
          <Segmented label="Barreras" value={servers} onChange={setServers} options={[{ value: '1', label: '1' }, { value: '2', label: '2 (hoy)' }, { value: '3', label: '3' }]} />
        </div>
        <div>
          <p className="l-control-label">Segundos por carro en la barrera</p>
          <Segmented label="Tiempo de atención" value={cycle} onChange={setCycle} options={D.CYCLES.map((c) => ({ value: String(c) as '5', label: `${c} s` }))} />
        </div>
      </div>
      <LiveAccess
        lambda={lambda}
        servers={s}
        serviceSeconds={t}
        speed={15}
        seed={3}
        horizon={30}
        label={`${fmt(lambda, 1)} carros por minuto, ${s} ${s === 1 ? 'barrera' : 'barreras'}, ${t} s por carro. La animación corre 15 veces más rápido que la realidad y se reinicia cada 30 minutos simulados.`}
      />
      <div className={`l-verdict ${stable ? (theory.rho < 0.6 ? 'is-good' : theory.rho < 0.85 ? 'is-warn' : 'is-bad') : 'is-bad'}`}>
        {theory.status === 'stable' ? (
          <p>
            <b>Teoría M/M/{s}:</b> barreras ocupadas el {fmtPct(theory.rho, 0)} del tiempo, {fmtPct(theory.pWait, 0)} de los carros espera y la espera
            promedio en fila es de {fmtSec(theory.wq * 60)}.
          </p>
        ) : theory.status === 'unstable' ? (
          <p>
            <b>Teoría M/M/{s}:</b> llegan {fmt(lambda, 1)} carros por minuto y solo se pueden atender {fmt(theory.capacity, 1)}. Con ρ = {fmt(theory.rho, 2)} la
            fila crece sin límite: no existe un tiempo de espera estable.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Strategy({ title, data, children }: { title: string; data: { value: string; label: string }[]; children: ReactNode }) {
  return (
    <article className="l-strategy">
      <h4>{title}</h4>
      <div className="l-strategy-body">{children}</div>
      <dl className="l-evidence">
        {data.map((d) => (
          <div key={d.label}>
            <dt>{d.label}</dt>
            <dd>{d.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function Plan() {
  const P = useChartColors();
  const robust = useMemo(() => D.robustness(), []);
  const byId = (id: string) => D.scenarios.find((s) => s.input.id === id)!;
  const one = byId('barreras-1');
  const three = byId('barreras-3');
  const base = byId('viernes');
  const redis = byId('redistribucion');
  const sat5 = D.cycleSensitivity[0];
  const sat12 = D.cycleSensitivity.find((c) => c.seconds === 12)!;
  const sat15 = D.cycleSensitivity.find((c) => c.seconds === 15)!;
  const r212 = robust.find((r) => r.servers === 2 && r.seconds === 12)!;
  const r112 = robust.find((r) => r.servers === 1 && r.seconds === 12)!;
  const R = D.redistributionAt12;

  const chartRows: { id: string; label: string }[] = [
    { id: 'viernes', label: 'Viernes hoy' },
    { id: 'sabado', label: 'Sábado simulado' },
    { id: 'barreras-1', label: '1 barrera' },
    { id: 'barreras-3', label: '3 barreras' },
    { id: 'demanda-0.1', label: 'Demanda +10 %' },
    { id: 'demanda-0.25', label: 'Demanda +25 %' },
    { id: 'servicio', label: 'Atención −20 %' },
    { id: 'redistribucion', label: '20 % de la 80 a la 70' },
  ];

  return (
    <Section
      id="plan"
      title="Plan de mejoramiento"
      intro={
        <>
          <p>
            El modelo dice que hoy la entrada no es un cuello de botella. Por eso el plan no empieza por poner más barreras: busca proteger el
            margen que existe, saber si de verdad existe y convertirlo en beneficio. Todas las cifras de esta sección salen del mismo motor de la
            app con los datos del viernes y del sábado simulado; las propuestas son escenarios hipotéticos, no cambios ya hechos en Arkadia.
          </p>
          <p>
            La variable que más mueve los resultados es el tiempo que cada carro ocupa la barrera. Medimos la subida ({fmtInt(D.SERVICE_RANGE[0])} a {fmtInt(D.SERVICE_RANGE[1])} s),
            pero el ciclo completo puede ser más largo si incluye tomar el tiquete o la lectura de la placa. Pruebe el efecto en el acceso por la 80:
          </p>
        </>
      }
    >
      <Playground />

      <h3 className="l-h3">Qué pasa si el ciclo de atención crece</h3>
      <p className="l-muted">Acceso por la 80 en el pico del sábado simulado ({fmt(D.lambdas.saturday.C80.peakLambdaPerMin, 1)} carros por minuto).</p>
      <div className="table-wrap">
        <table className="table l-table">
          <thead>
            <tr>
              <th scope="col">Segundos por carro</th>
              <th scope="col" className="num">2 barreras: ρ</th>
              <th scope="col" className="num">2 barreras: espera</th>
              <th scope="col" className="num">1 barrera: ρ</th>
              <th scope="col" className="num">1 barrera: espera</th>
            </tr>
          </thead>
          <tbody>
            {D.cycleSensitivity.map((c) => (
              <tr key={c.seconds}>
                <th scope="row">{c.seconds} s</th>
                <td className="num">{fmtPct(rho(c.saturdayPeak), 0)}</td>
                <td className="num">{fmtSec(sec(c.saturdayPeak))}</td>
                <td className="num">{fmtPct(rho(c.saturdayPeakOne), 0)}</td>
                <td className="num">{c.saturdayPeakOne.status === 'unstable' ? 'la fila no para de crecer' : fmtSec(sec(c.saturdayPeakOne))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="l-objectives">
        <section className="l-objective" aria-labelledby="obj-1">
          <header>
            <h3 id="obj-1">Optimizar los tiempos de atención</h3>
            <p>Meta: ciclo promedio por carro de {fmtInt(Math.floor(D.cycleLimit.saturday))} s o menos en la 80.</p>
          </header>
          <Strategy
            title="Medir el ciclo completo antes de invertir"
            data={[
              { value: `${fmt(sec(sat5.saturdayPeak), 1)} s → ${fmt(sec(sat12.saturdayPeak), 1)} s`, label: 'Espera en el pico del sábado si el ciclo pasa de 5 a 12 s' },
            ]}
          >
            <p>
              Cronometrar al menos 30 carros por acceso desde que llegan a la barrera hasta que esta baja, en viernes y sábado. Es el dato que más
              cambia las conclusiones y hoy es una aproximación. Con él, la app recalcula todo en segundos.
            </p>
          </Strategy>
          <Strategy
            title="Mantener el ciclo por debajo del límite"
            data={[
              { value: `${fmt(D.cycleLimit.saturday, 1)} s`, label: 'Ciclo máximo para no pasar de 85 % de ocupación el sábado' },
              { value: fmtSec(sec(sat15.saturdayPeak), 0), label: `Espera promedio con 15 s por carro (ρ = ${fmt(rho(sat15.saturdayPeak), 2)})` },
            ]}
          >
            <p>
              Todo lo que alargue la parada en la barrera (tiquetes que se atascan, lectores de placa lentos, cobros en la entrada) debe evitarse en
              las horas pico. La relación no es lineal: de 12 a 15 s la espera pasa de {fmtSec(sec(sat12.saturdayPeak), 0)} a {fmtSec(sec(sat15.saturdayPeak), 0)} porque el sistema
              queda al borde de la saturación.
            </p>
          </Strategy>
        </section>

        <section className="l-objective" aria-labelledby="obj-2">
          <header>
            <h3 id="obj-2">Mejorar la eficiencia del sistema</h3>
            <p>Meta: ocupación de las barreras por debajo de 85 % en el pico y ningún carro pendiente al final de la hora.</p>
          </header>
          <Strategy
            title="Las dos barreras abiertas en las horas pico"
            data={[
              { value: fmtSec(sec(one.perAccess.C80.peak), 1), label: 'Espera en el pico del viernes con 1 barrera (frente a ' + fmtSec(sec(base.perAccess.C80.peak), 2) + ' con 2)' },
              { value: fmtPct(r112.probPending, 0), label: 'Simulaciones con carros pendientes: 1 barrera a 12 s' },
              { value: fmtPct(r212.probPending, 0), label: 'Lo mismo con 2 barreras a 12 s' },
            ]}
          >
            <p>
              Cerrar una barrera por mantenimiento o por falla en el pico es el riesgo más serio que encontramos. En 1.000 simulaciones de Montecarlo
              con demanda 25 % mayor a la del viernes, una sola barrera a 12 s deja carros esperando al final en el {fmtPct(r112.probPending, 0)} de los casos y
              la fila más larga llega a {fmtInt(r112.maxQueueP95)} carros (percentil 95). Con dos barreras, {fmtInt(r212.maxQueueP95)}. El mantenimiento debe programarse fuera del pico.
            </p>
          </Strategy>
          <Strategy
            title="Repartir mejor la demanda entre los accesos"
            data={[
              { value: `${fmtPct(rho(R.before.C80), 0)} → ${fmtPct(rho(R.after.C80), 0)}`, label: `Ocupación de la 80 si el 20 % de sus carros usa la 70 (sábado, ${R.seconds} s)` },
              { value: `${fmtSec(sec(R.before.C80), 1)} → ${fmtSec(sec(R.after.C80), 1)}`, label: 'Espera en la 80 en ese mismo caso' },
            ]}
          >
            <p>
              La 80 carga más que la 70. Señalización en las vías y en la app del centro comercial puede sugerir la 70 cuando la 80 está llena. Con
              {' '}{fmtInt(D.SERVICE_S)} s la ganancia es pequeña ({fmtSec(sec(base.perAccess.C80.peak), 2)} a {fmtSec(sec(redis.perAccess.C80.peak), 2)}), pero si el ciclo es de {R.seconds} s la espera en la 80 baja de
              {' '}{fmtSec(sec(R.before.C80), 1)} a {fmtSec(sec(R.after.C80), 1)}, mientras la 70 sube de {fmtSec(sec(R.before.C70), 1)} a {fmtSec(sec(R.after.C70), 1)}. Funciona como un seguro.
            </p>
          </Strategy>
        </section>

        <section className="l-objective" aria-labelledby="obj-3">
          <header>
            <h3 id="obj-3">Aumentar la rentabilidad</h3>
            <p>No tenemos costos ni tarifas del parqueadero, así que no damos cifras en pesos. Sí podemos decir dónde no gastar y dónde hay margen.</p>
          </header>
          <Strategy
            title="No invertir en una tercera barrera"
            data={[
              { value: `${fmtSec(sec(base.perAccess.C80.peak), 2)} → ${fmtSec(sec(three.perAccess.C80.peak), 2)}`, label: 'Espera en el pico del viernes en la 80 con 3 barreras' },
            ]}
          >
            <p>
              Una tercera barrera le ahorraría a cada carro menos de medio segundo. Con un ciclo de {fmtInt(D.SERVICE_S)} s esa inversión no se justifica; el dinero rinde más
              en lo que acorta el ciclo y en mantener funcionando las dos barreras existentes.
            </p>
          </Strategy>
          <Strategy
            title="Usar la capacidad que sobra"
            data={[
              { value: `${fmt(D.headroom.friday, 1)} veces`, label: 'Pico del viernes que cabría en la 80 sin pasar de 85 % de ocupación' },
              { value: `${fmt(D.headroom.saturday, 1)} veces`, label: 'Lo mismo para el pico del sábado simulado' },
            ]}
          >
            <p>
              La entrada puede recibir bastante más demanda que la actual sin formar filas, siempre que el ciclo se mantenga en {fmtInt(D.SERVICE_S)} s y haya cupos
              adentro (la ocupación del parqueadero no la medimos). Eso permite programar eventos, promociones nocturnas o temporada de diciembre
              sin que la entrada se vuelva un problema, y es ahí donde está el ingreso adicional.
            </p>
          </Strategy>
        </section>
      </div>

      <h3 className="l-h3">Los escenarios lado a lado</h3>
      <p className="l-muted">Espera promedio en fila en el intervalo pico, en segundos, con {fmtInt(D.SERVICE_S)} s por carro. Todos menos los dos primeros son hipotéticos.</p>
      <figure className="l-figure">
        <ChartFrame legend={<Legend items={[{ label: 'Carrera 70', color: P.E70 }, { label: 'Carrera 80', color: P.E80 }]} />}>
          {(w) => (
            <BarChart
              title="Espera en fila en el pico por escenario"
              width={w}
              height={300}
              categories={chartRows.map((r) => r.label)}
              valueFormat={(v) => fmt(v, v < 1 ? 2 : 1)}
              groups={ACCESSES.map((a) => ({
                name: ACCESS_LABEL[a],
                color: a === 'C70' ? P.E70 : P.E80,
                values: chartRows.map((r) => sec(byId(r.id).perAccess[a].peak)),
              }))}
            />
          )}
        </ChartFrame>
      </figure>

      <h3 className="l-h3">Indicadores para hacer seguimiento</h3>
      <div className="table-wrap">
        <table className="table l-table">
          <thead>
            <tr><th scope="col">Indicador</th><th scope="col">Meta</th><th scope="col">Hoy, según el modelo</th><th scope="col">Cómo medirlo</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row">Ciclo por carro en la barrera</th><td>{fmtInt(Math.floor(D.cycleLimit.saturday))} s o menos</td><td>{fmtInt(D.SERVICE_S)} s (aproximado)</td><td>Cronómetro, 30 carros por acceso</td></tr>
            <tr><th scope="row">Ocupación de barreras en el pico</th><td>Menos de 85 %</td><td>{fmtPct(rho(D.queues[1].fridayPeak), 0)} viernes, {fmtPct(rho(D.queues[1].saturdayPeak), 0)} sábado simulado</td><td>Conteo por 5 min y la app</td></tr>
            <tr><th scope="row">Espera promedio en fila</th><td>Menos de 30 s</td><td>{fmtSec(sec(D.queues[1].fridayPeak), 2)} en el pico del viernes</td><td>La app (teoría y simulación)</td></tr>
            <tr><th scope="row">Barreras operando en el pico</th><td>2 de 2</td><td>2 de 2</td><td>Registro de mantenimiento</td></tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ───────── la app ───────── */

const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/** Código QR de la APK para escanear desde un computador (no depende de la API de GitHub). */
function ApkQr() {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (isAndroid()) return;
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toString(APK_URL, { type: 'svg', margin: 1, color: { dark: '#10284A', light: '#FFFFFF' } }))
      .then((s) => alive && setSvg(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!svg) return null;
  return (
    <div className="l-qr">
      <div className="l-qr-code" role="img" aria-label="Código QR para descargar la app Android" dangerouslySetInnerHTML={{ __html: svg }} />
      <p>Escanee el código con la cámara de un celular Android para descargar la app. Al abrir el archivo, Android pedirá permitir la instalación.</p>
    </div>
  );
}

function LaApp() {
  return (
    <Section
      id="app"
      tone="tint"
      title="La aplicación"
      intro={<p>ParkSmart Arkadia hace todo lo que pide el reto y un poco más. Se usa en el navegador del celular o se instala en Android.</p>}
    >
      <div className="l-app-grid">
        <ul className="l-list l-list-check">
          <li>Ingresar datos de campo a mano o importarlos desde Excel o CSV, con validación de duplicados y huecos.</li>
          <li>Elegir M/M/1 o M/M/s, el acceso, el periodo y el número de barreras.</li>
          <li>Ver las ecuaciones con los valores reemplazados y los resultados, con aviso cuando el sistema no tiene equilibrio.</li>
          <li>Simular con Montecarlo (semilla reproducible) y carro por carro con eventos discretos.</li>
          <li>Comparar escenarios y descargar el informe académico en PDF.</li>
          <li>Funciona sin internet y guarda los datos en el dispositivo.</li>
        </ul>
        <div className="l-app-actions">
          <a className="l-btn l-btn-primary" href="../">Abrir la aplicación</a>
          <a className="l-btn l-btn-ghost" href={APK_URL}><IconDownload />Descargar APK para Android</a>
          <ApkQr />
        </div>
      </div>
    </Section>
  );
}

/* ───────── límites y equipo ───────── */

function Limites() {
  return (
    <Section id="limites" title="Lo que este estudio no dice">
      <ul className="l-list">
        <li>Es un solo viernes de dos horas. El sábado es una simulación construida a partir de ese viernes.</li>
        <li>El tiempo de atención es una aproximación de campo (subida de la barrera). Si el ciclo real es más largo, las esperas crecen como muestra la tabla del plan.</li>
        <li>M/M/s supone llegadas de Poisson y tiempos de atención exponenciales en estado estable; el pico real dura poco.</li>
        <li>No medimos la ocupación interna del parqueadero, las salidas (los valores de salida son provisionales) ni costos o tarifas.</li>
      </ul>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="l-footer">
      <div className="l-wrap l-footer-grid">
        <div>
          <a href="#inicio" className="brand" aria-label="ParkSmart Arkadia, inicio">
            <BrandMark className="brand-mark" />
            <span className="brand-name">ParkSmart <span>Arkadia</span></span>
          </a>
          <p className="l-footer-team">Santiago Solís y Juan Fernando Gómez Ocampo</p>
        </div>
        <div>
          <p>Reto 3, Modelamiento y Simulación Computacional 2026-2</p>
          <p>Docente: Juan Carlos Briñez de León</p>
          <p>Universidad Católica Luis Amigó, Medellín</p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <>
      <a className="l-skip" href="#reto">Saltar al contenido</a>
      <TopBar />
      <main>
        <Hero />
        <Reto />
        <Proceso />
        <Evidencias />
        <Resultados />
        <Plan />
        <LaApp />
        <Limites />
      </main>
      <Footer />
    </>
  );
}
