import { useRef } from 'react';
import type { DiscreteEventSimulator } from '../core/des/engine';
import { useMeasuredWidth } from './charts/charts';

const CAR_W = 30;
const CAR_H = 18;
const GAP = 8;

/** Escena SVG derivada exclusivamente del estado del motor en el instante actual. */
export function Stage({ sim, speed }: { sim: DiscreteEventSimulator; speed: number }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(600);
  const s = sim.config.servers;
  const laneH = 46;
  const top = 26;
  const height = top + s * laneH + 30;
  const barrierX = Math.round(width * 0.66);
  const queueY = top + (s * laneH) / 2;
  const headX = barrierX - 54;
  const fitAll = Math.max(1, Math.floor((headX - 10) / (CAR_W + GAP)));
  // Si no caben todos, se reservan 64 px a la izquierda para el contador "+N".
  const capacity = sim.queue.length > fitAll ? Math.max(1, Math.floor((headX - 74) / (CAR_W + GAP))) : fitAll;
  // Duración de la salida en pantalla: ≈0,9 s reales, sin superar 1,5 tiempos medios de servicio
  // para que los vehículos que salen no se amontonen a velocidades altas.
  const exitSpan = Math.min((speed * 0.9) / 60, sim.config.meanServiceMin * 1.5);
  const clock = sim.clock;
  const display = useRef(new Map<number, { x: number; y: number }>());

  const targets: { id: number; x: number; y: number; color: string }[] = [];
  sim.queue.slice(0, capacity).forEach((id, k) => {
    targets.push({ id, x: headX - k * (CAR_W + GAP) - CAR_W, y: queueY - CAR_H / 2, color: '#F2B01E' });
  });
  sim.servers.forEach((srv, i) => {
    if (srv.vehicleId !== null) {
      targets.push({ id: srv.vehicleId, x: barrierX - CAR_W - 6, y: top + i * laneH + (laneH - CAR_H) / 2, color: '#4C8EF0' });
    }
  });
  const leaving: typeof sim.vehicles = [];
  const perLane = new Map<number, number>();
  // Recorre desde el final (salidas más recientes) y muestra como máximo dos por barrera.
  for (let i = sim.vehicles.length - 1; i >= 0 && i >= sim.vehicles.length - 400; i--) {
    const v = sim.vehicles[i];
    if (v.serviceEnd === null || clock - v.serviceEnd >= exitSpan || clock < v.serviceEnd) continue;
    const lane = v.server ?? 0;
    const n = perLane.get(lane) ?? 0;
    if (n >= 2) continue;
    perLane.set(lane, n + 1);
    leaving.push(v);
  }
  leaving.forEach((v) => {
    const p = (clock - v.serviceEnd!) / exitSpan;
    const lane = v.server ?? 0;
    targets.push({ id: v.id, x: barrierX + 14 + p * (width - barrierX), y: top + lane * laneH + (laneH - CAR_H) / 2, color: '#2BB3A3' });
  });

  // Suavizado visual: cada vehículo se desplaza hacia su posición objetivo.
  const map = display.current;
  const alive = new Set(targets.map((t) => t.id));
  for (const key of [...map.keys()]) if (!alive.has(key)) map.delete(key);
  const shown = targets.map((t) => {
    const prev = map.get(t.id) ?? { x: Math.min(t.x, -CAR_W), y: t.y };
    const next = { x: prev.x + (t.x - prev.x) * 0.35, y: prev.y + (t.y - prev.y) * 0.35 };
    map.set(t.id, next);
    return { ...t, ...next };
  });
  const overflow = sim.queue.length - capacity;

  return (
    <div ref={ref} className="sim-stage">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Simulación: ${sim.queue.length} vehículos en fila, ${sim.servers.filter((x) => x.vehicleId !== null).length} en atención`}>
        <rect x={0} y={top - 10} width={barrierX} height={s * laneH + 20} fill="#38424f" />
        <line x1={0} x2={barrierX - 40} y1={queueY} y2={queueY} stroke="#5d6a7a" strokeDasharray="14 10" strokeWidth={2} />
        {sim.servers.map((srv, i) => {
          const y = top + i * laneH;
          const busy = srv.vehicleId !== null;
          return (
            <g key={i}>
              <rect x={barrierX - 40} y={y + 2} width={width - barrierX + 40} height={laneH - 4} fill="#3f4a58" />
              <rect x={barrierX} y={y + 4} width={10} height={laneH - 8} fill="#d5dbe3" rx={2} />
              <g transform={`rotate(${busy ? -70 : 0} ${barrierX + 5} ${y + 8})`}>
                <rect x={barrierX + 5} y={y + 5} width={laneH - 6} height={6} fill={busy ? '#2BB3A3' : '#C62E2E'} rx={2} />
                <rect x={barrierX + 15} y={y + 5} width={6} height={6} fill="#ffffff" />
              </g>
              <text x={barrierX - 36} y={y + 13} fontSize={10} fill="#c9d3df" fontFamily="Overpass, sans-serif">B{i + 1}</text>
            </g>
          );
        })}
        {shown.map((c) => (
          <g key={c.id} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}>
            <rect width={CAR_W} height={CAR_H} rx={4} fill={c.color} />
            <rect x={CAR_W - 9} y={3} width={5} height={CAR_H - 6} rx={1} fill="rgba(16,40,74,.35)" />
          </g>
        ))}
        {overflow > 0 && (
          <g>
            <rect x={4} y={queueY - 13} width={56} height={26} rx={4} fill="#C62E2E" />
            <text x={32} y={queueY + 5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff" fontFamily="Overpass, sans-serif">+{overflow}</text>
          </g>
        )}
        <text x={8} y={16} fontSize={12} fill="#c9d3df" fontFamily="Overpass, sans-serif">Fila: {sim.queue.length}</text>
        <text x={width - 8} y={16} textAnchor="end" fontSize={12} fill="#c9d3df" fontFamily="Overpass, sans-serif">Salida →</text>
      </svg>
    </div>
  );
}
