import { excelFractionToHHMM, excelSerialToISODate, formatHHMM, normalizeDate, parseHHMM } from '../time';
import type { AccessId, Direction, Issue, NewVehicleRecord, RecordOrigin } from '../types';
import type { Cell, Table } from './csv';

/**
 * Convierte una tabla (CSV o Excel) en registros vehiculares.
 * Admite dos formatos:
 *  - Ancho (el del estudio): Desde | Hasta | Entrada 70 | Salida 70 | Entrada 80 | Salida 80 [| totales]
 *  - Largo: fecha | hora_inicio | hora_fin | acceso | direccion | cantidad [| origen | observaciones]
 */

export type TableFormat = 'ancho' | 'largo';

export interface NormalizeOptions {
  /** Fecha a usar si el archivo no la trae (YYYY-MM-DD). */
  date: string;
  origin: RecordOrigin;
  datasetId?: number;
  simulationId?: string | null;
}

export interface NormalizeResult {
  format: TableFormat | null;
  records: Omit<NewVehicleRecord, 'datasetId'>[];
  issues: Issue[];
  rowsRead: number;
}

export const normalizeHeader = (h: Cell): string =>
  String(h ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const WIDE_FLOWS: { header: string; access: AccessId; direction: Direction }[] = [
  { header: 'entrada 70', access: 'C70', direction: 'entrada' },
  { header: 'salida 70', access: 'C70', direction: 'salida' },
  { header: 'entrada 80', access: 'C80', direction: 'entrada' },
  { header: 'salida 80', access: 'C80', direction: 'salida' },
];

function findCol(headers: string[], ...names: string[]): number {
  for (const n of names) {
    const i = headers.indexOf(n);
    if (i !== -1) return i;
  }
  return -1;
}

export function cellToTime(c: Cell): string | null {
  if (c === null || c === '') return null;
  if (typeof c === 'number') return c < 1 ? excelFractionToHHMM(c) : null;
  const m = parseHHMM(String(c));
  return m === null ? null : formatHHMM(m);
}

function cellToDate(c: Cell): string | null {
  if (c === null || c === '') return null;
  if (typeof c === 'number') return excelSerialToISODate(c);
  return normalizeDate(String(c));
}

function cellToCount(c: Cell): number | null {
  if (c === null || c === '') return null;
  const n = typeof c === 'number' ? c : Number(String(c).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

function parseAccess(c: Cell): AccessId | null {
  const s = normalizeHeader(c).replace(/^(carrera|cra|cr|kr|acceso)\s*/, '');
  if (s === '70' || s === 'c70') return 'C70';
  if (s === '80' || s === 'c80') return 'C80';
  return null;
}

function parseDirection(c: Cell): Direction | null {
  const s = normalizeHeader(c);
  if (s.startsWith('entra') || s === 'e' || s === 'ingreso') return 'entrada';
  if (s.startsWith('sali') || s === 's' || s === 'egreso') return 'salida';
  return null;
}

function parseOrigin(c: Cell): RecordOrigin | null {
  const s = normalizeHeader(c);
  if (s.startsWith('obs') || s === 'real' || s === 'campo') return 'observado';
  if (s.startsWith('sim')) return 'simulado';
  if (s.startsWith('man')) return 'manual';
  return null;
}

export function detectFormat(headers: string[]): TableFormat | null {
  const hasWide = WIDE_FLOWS.filter((f) => headers.includes(f.header)).length >= 1 && findCol(headers, 'desde', 'hora inicio', 'inicio') !== -1;
  if (hasWide) return 'ancho';
  const hasLong =
    findCol(headers, 'acceso') !== -1 &&
    findCol(headers, 'direccion', 'sentido') !== -1 &&
    findCol(headers, 'cantidad', 'vehiculos', 'conteo') !== -1;
  return hasLong ? 'largo' : null;
}

export function normalizeTable(table: Table, opts: NormalizeOptions): NormalizeResult {
  const issues: Issue[] = [];
  const records: NormalizeResult['records'] = [];
  if (table.length < 2) {
    issues.push({ level: 'error', message: 'El archivo no tiene filas de datos (se necesita un encabezado y al menos una fila).' });
    return { format: null, records, issues, rowsRead: 0 };
  }
  const headers = table[0].map(normalizeHeader);
  const format = detectFormat(headers);
  if (!format) {
    issues.push({
      level: 'error',
      message:
        'No se reconocieron las columnas. Use el formato del estudio (Desde, Hasta, Entrada 70, Salida 70, Entrada 80, Salida 80) ' +
        'o el formato largo (fecha, hora_inicio, hora_fin, acceso, direccion, cantidad).',
    });
    return { format: null, records, issues, rowsRead: table.length - 1 };
  }

  const pushCount = (row: number, raw: Cell, base: Omit<NewVehicleRecord, 'datasetId' | 'count'>) => {
    const n = cellToCount(raw);
    if (n === null) {
      issues.push({ level: 'error', row, message: `Cantidad vacía o no numérica (${base.access} ${base.direction}).` });
      return;
    }
    if (n < 0) {
      issues.push({ level: 'error', row, message: `Cantidad negativa (${n}) en ${base.access} ${base.direction}.` });
      return;
    }
    if (!Number.isInteger(n)) {
      issues.push({ level: 'error', row, message: `La cantidad ${n} no es un número entero de vehículos.` });
      return;
    }
    records.push({ ...base, count: n });
  };

  const checkTimes = (row: number, start: string | null, end: string | null, rawStart: Cell, rawEnd: Cell) => {
    if (!start) {
      issues.push({ level: 'error', row, message: `Hora inicial inválida: "${rawStart ?? ''}".` });
      return false;
    }
    if (!end) {
      issues.push({ level: 'error', row, message: `Hora final inválida: "${rawEnd ?? ''}".` });
      return false;
    }
    if ((parseHHMM(end) ?? 0) <= (parseHHMM(start) ?? 0)) {
      issues.push({ level: 'error', row, message: `La hora final (${end}) debe ser posterior a la inicial (${start}).` });
      return false;
    }
    return true;
  };

  if (format === 'ancho') {
    const cStart = findCol(headers, 'desde', 'hora inicio', 'inicio');
    const cEnd = findCol(headers, 'hasta', 'hora fin', 'fin');
    const cDate = findCol(headers, 'fecha');
    const cTotIn = findCol(headers, 'entradas total', 'total entradas');
    const cTotOut = findCol(headers, 'salidas total', 'total salidas');
    const flowCols = WIDE_FLOWS.map((f) => ({ ...f, col: headers.indexOf(f.header) }));
    for (const f of flowCols) {
      if (f.col === -1) issues.push({ level: 'advertencia', message: `No hay columna "${f.header}": ese flujo quedará sin datos.` });
    }
    for (let r = 1; r < table.length; r++) {
      const rowNum = r + 1;
      const row = table[r];
      const start = cellToTime(row[cStart] ?? null);
      const end = cEnd === -1 ? null : cellToTime(row[cEnd] ?? null);
      if (!checkTimes(rowNum, start, end, row[cStart] ?? null, cEnd === -1 ? null : row[cEnd] ?? null)) continue;
      const date = cDate !== -1 ? cellToDate(row[cDate] ?? null) ?? opts.date : opts.date;
      for (const f of flowCols) {
        if (f.col === -1) continue;
        pushCount(rowNum, row[f.col] ?? null, {
          date, startTime: start!, endTime: end!, access: f.access, direction: f.direction,
          origin: opts.origin, simulationId: opts.simulationId ?? null, notes: null,
        });
      }
      const sumOf = (dir: Direction) => records
        .filter((x) => x.startTime === start && x.date === date && x.direction === dir)
        .reduce((a, b) => a + b.count, 0);
      if (cTotIn !== -1) {
        const t = cellToCount(row[cTotIn] ?? null);
        if (t !== null && t !== sumOf('entrada')) issues.push({ level: 'advertencia', row: rowNum, message: `El total de entradas del archivo (${t}) no coincide con la suma de accesos (${sumOf('entrada')}).` });
      }
      if (cTotOut !== -1) {
        const t = cellToCount(row[cTotOut] ?? null);
        if (t !== null && t !== sumOf('salida')) issues.push({ level: 'advertencia', row: rowNum, message: `El total de salidas del archivo (${t}) no coincide con la suma de accesos (${sumOf('salida')}).` });
      }
    }
  } else {
    const cDate = findCol(headers, 'fecha');
    const cStart = findCol(headers, 'hora inicio', 'desde', 'inicio');
    const cEnd = findCol(headers, 'hora fin', 'hasta', 'fin');
    const cAcc = findCol(headers, 'acceso');
    const cDir = findCol(headers, 'direccion', 'sentido');
    const cCount = findCol(headers, 'cantidad', 'vehiculos', 'conteo');
    const cOrigin = findCol(headers, 'origen');
    const cNotes = findCol(headers, 'observaciones', 'notas');
    for (let r = 1; r < table.length; r++) {
      const rowNum = r + 1;
      const row = table[r];
      const start = cStart === -1 ? null : cellToTime(row[cStart] ?? null);
      const end = cEnd === -1 ? null : cellToTime(row[cEnd] ?? null);
      if (!checkTimes(rowNum, start, end, cStart === -1 ? null : row[cStart] ?? null, cEnd === -1 ? null : row[cEnd] ?? null)) continue;
      const access = parseAccess(row[cAcc] ?? null);
      const direction = parseDirection(row[cDir] ?? null);
      if (!access) {
        issues.push({ level: 'error', row: rowNum, message: `Acceso no reconocido: "${row[cAcc] ?? ''}" (use 70 u 80).` });
        continue;
      }
      if (!direction) {
        issues.push({ level: 'error', row: rowNum, message: `Dirección no reconocida: "${row[cDir] ?? ''}" (use entrada o salida).` });
        continue;
      }
      let date = opts.date;
      if (cDate !== -1 && row[cDate] !== null && row[cDate] !== '') {
        const d = cellToDate(row[cDate] ?? null);
        if (!d) {
          issues.push({ level: 'error', row: rowNum, message: `Fecha inválida: "${row[cDate]}".` });
          continue;
        }
        date = d;
      }
      let origin = opts.origin;
      if (cOrigin !== -1 && row[cOrigin]) {
        const o = parseOrigin(row[cOrigin]);
        if (!o) issues.push({ level: 'advertencia', row: rowNum, message: `Origen "${row[cOrigin]}" no reconocido; se usa "${opts.origin}".` });
        else if (o !== opts.origin) {
          issues.push({ level: 'advertencia', row: rowNum, message: `La fila dice origen "${o}" pero el conjunto es "${opts.origin}". Se conserva el origen del conjunto para no mezclar datos.` });
        }
      }
      const notes = cNotes !== -1 && row[cNotes] ? String(row[cNotes]) : null;
      pushCount(rowNum, row[cCount] ?? null, {
        date, startTime: start!, endTime: end!, access, direction, origin, simulationId: opts.simulationId ?? null, notes,
      });
    }
  }

  issues.push(...findRecordIssues(records));
  return { format, records, issues, rowsRead: table.length - 1 };
}

/**
 * Revisión de consistencia de un conjunto de registros: duplicados, intervalos
 * de duración distinta, huecos entre intervalos y flujos faltantes.
 */
export function findRecordIssues(
  records: Pick<NewVehicleRecord, 'date' | 'startTime' | 'endTime' | 'access' | 'direction' | 'count'>[],
  rowOf?: (index: number) => number | undefined,
): Issue[] {
  const issues: Issue[] = [];
  const seen = new Map<string, number>();
  records.forEach((r, i) => {
    const key = `${r.date}|${r.startTime}|${r.access}|${r.direction}`;
    if (seen.has(key)) {
      issues.push({ level: 'error', row: rowOf?.(i), message: `Registro duplicado: ${r.date} ${r.startTime} ${r.access} ${r.direction}.` });
    } else seen.set(key, i);
    if (r.count < 0 || !Number.isInteger(r.count)) issues.push({ level: 'error', row: rowOf?.(i), message: `Cantidad inválida (${r.count}) en ${r.startTime} ${r.access} ${r.direction}.` });
  });

  const byDate = new Map<string, Map<string, { end: string; flows: Set<string> }>>();
  for (const r of records) {
    const d = byDate.get(r.date) ?? new Map();
    const slot = d.get(r.startTime) ?? { end: r.endTime, flows: new Set<string>() };
    slot.flows.add(`${r.access}-${r.direction}`);
    d.set(r.startTime, slot);
    byDate.set(r.date, d);
  }
  for (const [date, slots] of byDate) {
    const starts = [...slots.keys()].sort((a, b) => (parseHHMM(a) ?? 0) - (parseHHMM(b) ?? 0));
    const lengths = starts.map((s) => (parseHHMM(slots.get(s)!.end) ?? 0) - (parseHHMM(s) ?? 0));
    const counts = new Map<number, number>();
    lengths.forEach((l) => counts.set(l, (counts.get(l) ?? 0) + 1));
    const mode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    starts.forEach((s, i) => {
      if (mode !== undefined && lengths[i] !== mode) {
        issues.push({ level: 'advertencia', message: `${date} ${s}: el intervalo dura ${lengths[i]} min y el resto ${mode} min.` });
      }
      const flows = slots.get(s)!.flows;
      if (flows.size < 4) {
        issues.push({ level: 'advertencia', message: `${date} ${s}: faltan flujos (hay ${flows.size} de 4). El intervalo está incompleto.` });
      }
      if (i > 0) {
        const prevEnd = parseHHMM(slots.get(starts[i - 1])!.end) ?? 0;
        const cur = parseHHMM(s) ?? 0;
        if (cur > prevEnd) issues.push({ level: 'advertencia', message: `${date}: hay un hueco entre ${formatHHMM(prevEnd)} y ${s}.` });
        if (cur < prevEnd) issues.push({ level: 'advertencia', message: `${date}: el intervalo de las ${s} se superpone con el anterior.` });
      }
    });
  }
  return issues;
}
