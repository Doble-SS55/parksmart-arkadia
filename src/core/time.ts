/** Utilidades de tiempo. Todas las horas se manejan como minutos desde medianoche. */

export function parseHHMM(value: string): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\s*$/i.exec(value);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const suffix = m[4]?.toLowerCase().replace(/[\s.]/g, '');
  if (suffix) {
    if (h < 1 || h > 12) return null;
    if (suffix === 'pm' && h !== 12) h += 12;
    if (suffix === 'am' && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatHHMM(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMinutesHHMM(hhmm: string, delta: number): string {
  const base = parseHHMM(hhmm);
  if (base === null) throw new Error(`Hora inválida: ${hhmm}`);
  return formatHHMM(base + delta);
}

/** Excel guarda las horas como fracción del día (0.5 = 12:00). */
export function excelFractionToHHMM(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const fraction = value % 1;
  return formatHHMM(Math.round(fraction * 1440));
}

/** Convierte una fecha serial de Excel (sistema 1900) a YYYY-MM-DD. */
export function excelSerialToISODate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const ms = Math.round((Math.floor(serial) - 25569) * 86400000);
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Acepta YYYY-MM-DD, DD/MM/YYYY o DD-MM-YYYY. */
export function normalizeDate(value: string): string | null {
  const v = value.trim();
  if (isISODate(v)) return v;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isISODate(iso) ? iso : null;
  }
  return null;
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function formatLongDate(iso: string): string {
  if (!isISODate(iso)) return iso;
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export function formatShortDate(iso: string): string {
  if (!isISODate(iso)) return iso;
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}
