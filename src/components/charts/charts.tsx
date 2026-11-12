import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Gráficos SVG propios (sin dependencias). Usan colores explícitos para poder
 * renderizarse también como texto SVG dentro del informe PDF.
 * Convención: observado = trazo sólido; simulado = trazo punteado.
 */

export interface ChartPalette {
  E70: string;
  S70: string;
  E80: string;
  S80: string;
  sign: string;
  warn: string;
  warnFill: string;
  bad: string;
  grid: string;
  axis: string;
  band: string;
}

/** Paleta clara: pantalla en modo claro y siempre en el informe PDF. */
export const CHART_COLORS: ChartPalette = {
  E70: '#1565D8',
  S70: '#7FA9E8',
  E80: '#0E8A7E',
  S80: '#7CC4BB',
  sign: '#10284A',
  warn: '#B57A00',
  warnFill: '#F2B01E',
  bad: '#C62E2E',
  grid: '#E3E8EE',
  axis: '#5A6878',
  band: '#1565D8',
};

/** Paleta oscura: mismos tonos, más luminosos para fondo oscuro. */
export const CHART_COLORS_DARK: ChartPalette = {
  E70: '#5B9BFF',
  S70: '#A9C7F7',
  E80: '#34C3B1',
  S80: '#93DCD2',
  sign: '#E6ECF4',
  warn: '#E8B44A',
  warnFill: '#F2B01E',
  bad: '#FF7272',
  grid: '#26364D',
  axis: '#9AA9BD',
  band: '#5B9BFF',
};

export const ChartPaletteContext = createContext<ChartPalette>(CHART_COLORS);

export function useChartColors(): ChartPalette {
  return useContext(ChartPaletteContext);
}

const FONT = "Overpass, 'Segoe UI', Roboto, sans-serif";

function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function ticks(max: number, count = 4): number[] {
  const top = niceMax(max);
  const step = top / count;
  return Array.from({ length: count + 1 }, (_, i) => +(i * step).toFixed(6));
}

const fmtTick = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} k` : v.toLocaleString('es-CO', { maximumFractionDigits: 2 }));

/** Mide el ancho disponible para dibujar el gráfico a tamaño real (texto legible en celular). */
export function useMeasuredWidth<T extends HTMLElement>(fallback = 600): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(260, Math.floor(el.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function ChartFrame({ children, legend }: { children: (width: number) => ReactNode; legend?: ReactNode }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  return (
    <div ref={ref}>
      {children(width)}
      {legend}
    </div>
  );
}

export interface LineSeries {
  name: string;
  values: (number | null)[];
  color: string;
  dashed?: boolean;
  width?: number;
}

export interface BandSeries {
  name: string;
  lower: number[];
  upper: number[];
  color: string;
}

export function LineChart({
  labels, series, band, width, height = 240, yLabel, title, interactive = true,
}: {
  labels: string[]; series: LineSeries[]; band?: BandSeries; width: number; height?: number; yLabel?: string; title: string; interactive?: boolean;
}) {
  const P = useChartColors();
  const [hover, setHover] = useState<number | null>(null);
  const m = { top: 14, right: 12, bottom: 32, left: 40 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const all = [...series.flatMap((s) => s.values.filter((v): v is number => v !== null)), ...(band?.upper ?? [])];
  const ys = ticks(Math.max(1, ...all));
  const yMax = ys[ys.length - 1];
  const n = labels.length;
  const x = (i: number) => m.left + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => m.top + ih - (v / yMax) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const bandPath = band
    ? `M${band.upper.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('L')}L${band.lower
        .map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
        .reverse()
        .join('L')}Z`
    : '';
  const onMove = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - m.left) / iw) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  return (
    <div>
      <svg
        className="chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        xmlns="http://www.w3.org/2000/svg"
        fontFamily={FONT}
        onMouseMove={interactive ? (e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect()) : undefined}
        onMouseLeave={interactive ? () => setHover(null) : undefined}
        onTouchStart={interactive ? (e) => onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect()) : undefined}
        onTouchMove={interactive ? (e) => onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect()) : undefined}
      >
        <title>{title}</title>
        {ys.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={P.grid} />
            <text x={m.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={P.axis}>{fmtTick(t)}</text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 ? (
            <text key={l + i} x={x(i)} y={height - 10} textAnchor="middle" fontSize={11} fill={P.axis}>{l}</text>
          ) : null,
        )}
        {yLabel && (
          <text x={12} y={m.top + ih / 2} transform={`rotate(-90 12 ${m.top + ih / 2})`} textAnchor="middle" fontSize={11} fill={P.axis}>{yLabel}</text>
        )}
        {band && <path d={bandPath} fill={band.color} opacity={0.14} />}
        {series.map((s) => (
          <path
            key={s.name}
            d={path(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width ?? 2.25}
            strokeDasharray={s.dashed ? '6 4' : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + ih} stroke={P.sign} strokeOpacity={0.35} />
            {series.map((s) =>
              s.values[hover] !== null && s.values[hover] !== undefined ? (
                <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill="#fff" stroke={s.color} strokeWidth={2} />
              ) : null,
            )}
          </g>
        )}
      </svg>
      {interactive && (
        <div className="chart-tip num" aria-live="polite">
          {hover !== null ? (
            <>
              <b>{labels[hover]}</b>
              {series.map((s) => (
                <span key={s.name}> · {s.name}: <b>{s.values[hover] === null ? '—' : fmtTick(+s.values[hover]!.toFixed(2))}</b></span>
              ))}
              {band && <span> · {band.name}: {fmtTick(+band.lower[hover].toFixed(1))}–{fmtTick(+band.upper[hover].toFixed(1))}</span>}
            </>
          ) : (
            <span className="muted">Toque o pase el cursor sobre el gráfico para ver los valores.</span>
          )}
        </div>
      )}
    </div>
  );
}

export interface BarGroup {
  name: string;
  color: string;
  values: (number | null)[];
  /** Relleno rayado para datos simulados o hipotéticos. */
  hatched?: boolean;
}

export function BarChart({
  categories, groups, width, height = 220, title, valueFormat = fmtTick, maxValue,
}: {
  categories: string[]; groups: BarGroup[]; width: number; height?: number; title: string; valueFormat?: (v: number) => string; maxValue?: number;
}) {
  const P = useChartColors();
  const rotate = (width - 48) / Math.max(1, categories.length) < 72 && categories.some((c) => c.length > 8);
  const m = { top: 18, right: 8, bottom: rotate ? 96 : 40, left: 40 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const all = groups.flatMap((g) => g.values.filter((v): v is number => v !== null && Number.isFinite(v)));
  const ys = ticks(maxValue ?? Math.max(1, ...all));
  const yMax = ys[ys.length - 1];
  const band = iw / Math.max(1, categories.length);
  const barW = Math.min(36, (band * 0.75) / Math.max(1, groups.length));
  const y = (v: number) => m.top + ih - (Math.min(v, yMax) / yMax) * ih;
  const hatchId = `hatch-${title.replace(/[^a-z0-9]/gi, '').slice(0, 20)}`;
  return (
    <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg" fontFamily={FONT}>
      <title>{title}</title>
      <defs>
        {groups.map((g, gi) => (
          <pattern key={gi} id={`${hatchId}-${gi}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={g.color} opacity={0.35} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={g.color} strokeWidth="3" />
          </pattern>
        ))}
      </defs>
      {ys.map((t) => (
        <g key={t}>
          <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={P.grid} />
          <text x={m.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={P.axis}>{fmtTick(t)}</text>
        </g>
      ))}
      {categories.map((c, ci) => {
        const cx = m.left + band * ci + band / 2;
        const start = cx - (barW * groups.length) / 2;
        return (
          <g key={c}>
            {groups.map((g, gi) => {
              const v = g.values[ci];
              if (v === null || !Number.isFinite(v)) {
                return (
                  <text key={gi} x={start + barW * gi + barW / 2} y={m.top + ih - 4} textAnchor="middle" fontSize={10} fill={P.bad}>∞</text>
                );
              }
              return (
                <g key={gi}>
                  <rect
                    x={start + barW * gi + 1}
                    y={y(v)}
                    width={barW - 2}
                    height={Math.max(0, m.top + ih - y(v))}
                    fill={g.hatched ? `url(#${hatchId}-${gi})` : g.color}
                    stroke={g.hatched ? g.color : 'none'}
                  />
                  {barW >= 18 && (
                    <text x={start + barW * gi + barW / 2} y={y(v) - 4} textAnchor="middle" fontSize={10} fill={P.sign}>{valueFormat(v)}</text>
                  )}
                </g>
              );
            })}
            {rotate ? (
              <text x={cx} y={m.top + ih + 12} textAnchor="end" fontSize={10.5} fill={P.axis} transform={`rotate(-45 ${cx} ${m.top + ih + 12})`}>
                {c.length > 20 ? `${c.slice(0, 19)}…` : c}
              </text>
            ) : (
              <text x={cx} y={height - 22} textAnchor="middle" fontSize={11} fill={P.axis}>
                {c.length > 16 && band < 110 ? `${c.slice(0, 14)}…` : c}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Histogram({
  edges, counts, width, height = 220, title, markers = [], color, xLabel,
}: {
  edges: number[]; counts: number[]; width: number; height?: number; title: string;
  markers?: { value: number; label: string; color: string; dashed?: boolean }[]; color?: string; xLabel?: string;
}) {
  const P = useChartColors();
  const m = { top: 22, right: 12, bottom: 36, left: 40 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const ys = ticks(Math.max(1, ...counts));
  const yMax = ys[ys.length - 1];
  const x0 = edges[0];
  const x1 = edges[edges.length - 1];
  const x = (v: number) => m.left + ((v - x0) / Math.max(1e-9, x1 - x0)) * iw;
  const y = (v: number) => m.top + ih - (v / yMax) * ih;
  const xt = [...new Set(ticks(x1 - x0, Math.max(2, Math.floor(iw / 80))).map((t) => Math.round(x0 + t)))].filter((t) => t <= x1);
  return (
    <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg" fontFamily={FONT}>
      <title>{title}</title>
      {ys.map((t) => (
        <g key={t}>
          <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={P.grid} />
          <text x={m.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={P.axis}>{fmtTick(t)}</text>
        </g>
      ))}
      {counts.map((c, i) => (
        <rect key={i} x={x(edges[i]) + 0.5} y={y(c)} width={Math.max(0.5, x(edges[i + 1]) - x(edges[i]) - 1)} height={m.top + ih - y(c)} fill={color ?? P.E70} opacity={0.85} />
      ))}
      {xt.map((t) => (
        <text key={t} x={x(t)} y={height - 18} textAnchor="middle" fontSize={11} fill={P.axis}>{fmtTick(t)}</text>
      ))}
      {xLabel && <text x={m.left + iw / 2} y={height - 3} textAnchor="middle" fontSize={11} fill={P.axis}>{xLabel}</text>}
      {markers
        .filter((mk) => mk.value >= x0 && mk.value <= x1)
        .map((mk, i) => (
          <g key={mk.label}>
            <line x1={x(mk.value)} x2={x(mk.value)} y1={m.top - 4} y2={m.top + ih} stroke={mk.color} strokeWidth={2} strokeDasharray={mk.dashed ? '5 3' : undefined} />
            <text x={x(mk.value)} y={m.top - 8 + (i % 2) * 0} textAnchor={x(mk.value) > width - 60 ? 'end' : x(mk.value) < 60 ? 'start' : 'middle'} fontSize={10} fill={mk.color} fontWeight={700}>
              {mk.label}
            </text>
          </g>
        ))}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label} className="legend-item" style={{ color: i.color }}>
          <span className={`legend-swatch${i.dashed ? ' dashed' : ''}`} />
          <span style={{ color: 'var(--muted)' }}>{i.label}</span>
        </span>
      ))}
    </div>
  );
}
