/** Formato numérico en español de Colombia (coma decimal, punto de miles). */
const cache = new Map<number, Intl.NumberFormat>();

export function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  let f = cache.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    cache.set(digits, f);
  }
  return f.format(value);
}

export function fmtInt(value: number | null | undefined): string {
  return fmt(value, 0);
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${fmt(value * 100, digits)} %`;
}

export function fmtSigned(value: number | null | undefined, digits = 2, suffix = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const s = fmt(Math.abs(value), digits);
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${s}${suffix}`;
}

/** Duración en minutos expresada de forma legible (s, min). */
export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  const s = minutes * 60;
  if (s < 90) return `${fmt(s, 1)} s`;
  return `${fmt(minutes, 2)} min`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}
