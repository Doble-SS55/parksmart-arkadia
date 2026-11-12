import { useEffect, useRef, useState } from 'react';
import { DiscreteEventSimulator, type DesConfig } from '../core/des/engine';
import { fmt, fmtInt } from '../core/format';
import { Stage } from '../components/SimStage';
import { IconPause, IconPlay } from '../components/Icons';

export interface LiveAccessProps {
  /** Llegadas por minuto. */
  lambda: number;
  servers: number;
  serviceSeconds: number;
  /** Segundos simulados por segundo real. */
  speed?: number;
  seed?: number;
  /** Minutos simulados antes de volver a empezar con otra semilla. */
  horizon?: number;
  label: string;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function makeSim(p: LiveAccessProps, round: number): DiscreteEventSimulator {
  const mean = p.serviceSeconds / 60;
  const config: DesConfig = {
    arrivalRatePerMin: p.lambda,
    servers: p.servers,
    meanServiceMin: mean,
    serviceDistribution: 'exponencial',
    serviceMinMin: mean * 0.8,
    serviceMaxMin: mean * 1.2,
    horizonMin: p.horizon ?? 30,
    seed: (p.seed ?? 7) + round,
  };
  return new DiscreteEventSimulator(config);
}

/**
 * Acceso simulado en vivo con el mismo motor de eventos discretos de la app.
 * Se detiene fuera de pantalla y no arranca solo si el sistema pide reducir el movimiento.
 */
export function LiveAccess(props: LiveAccessProps) {
  const { lambda, servers, serviceSeconds, speed = 10, seed, horizon, label } = props;
  const round = useRef(0);
  const sim = useRef<DiscreteEventSimulator>(makeSim(props, 0));
  const [, setTick] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Nueva simulación cuando cambian los parámetros.
  useEffect(() => {
    round.current = 0;
    sim.current = makeSim({ lambda, servers, serviceSeconds, seed, horizon, label }, 0);
    setTick((x) => x + 1);
  }, [lambda, servers, serviceSeconds, seed, horizon, label]);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    let raf = 0;
    let last: number | null = null;
    const step = (t: number) => {
      const dt = last === null ? 0 : Math.min(0.1, (t - last) / 1000);
      last = t;
      const s = sim.current;
      if (document.visibilityState === 'visible') {
        s.advanceTo(Math.min(s.config.horizonMin, s.clock + (dt * speed) / 60));
        if (s.finished) {
          round.current += 1;
          sim.current = makeSim({ lambda, servers, serviceSeconds, seed, horizon, label }, round.current);
        }
        setTick((x) => x + 1);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, visible, speed, lambda, servers, serviceSeconds, seed, horizon, label]);

  const m = sim.current.metrics();
  const minutes = Math.floor(sim.current.clock);
  const seconds = Math.floor((sim.current.clock - minutes) * 60);

  return (
    <div className="l-live" ref={box}>
      <Stage key={`${sim.current.config.seed}:${lambda}:${servers}:${serviceSeconds}`} sim={sim.current} speed={speed} />
      <div className="l-live-bar">
        <button type="button" className="l-live-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausar la simulación' : 'Reproducir la simulación'}>
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <dl className="l-live-stats" aria-live="off">
          <div><dt>Reloj simulado</dt><dd>{minutes}:{String(seconds).padStart(2, '0')}</dd></div>
          <div><dt>Llegaron</dt><dd>{fmtInt(m.arrived)}</dd></div>
          <div><dt>En fila</dt><dd>{fmtInt(m.inQueue)}</dd></div>
          <div><dt>Espera promedio</dt><dd>{fmt(m.avgWait * 60, 1)} s</dd></div>
          <div><dt>Fila más larga</dt><dd>{fmtInt(m.maxQueue)}</dd></div>
        </dl>
      </div>
      <p className="l-live-label">{label}</p>
    </div>
  );
}
