import { unzipSync, strFromU8 } from 'fflate';
import type { Cell, Table } from './csv';

/**
 * Lector mínimo de .xlsx (Office Open XML) sin dependencias pesadas.
 * Lee la primera hoja del libro y devuelve los valores guardados en cada celda.
 * Las celdas con fórmula se leen por su último valor calculado (<v>), que es lo
 * que Excel almacena; si el archivo nunca se recalculó, se informa el problema.
 */

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textOf(xml: string): string {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += decodeXml(m[1]);
  return out;
}

export interface XlsxReadResult {
  sheetName: string;
  table: Table;
  /** Celdas con fórmula pero sin valor calculado guardado. */
  formulasWithoutValue: string[];
}

export function readXlsx(bytes: Uint8Array): XlsxReadResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('El archivo no es un .xlsx válido (no se pudo descomprimir).');
  }
  const get = (path: string) => (files[path] ? strFromU8(files[path]) : null);
  const workbook = get('xl/workbook.xml');
  if (!workbook) throw new Error('El archivo no contiene un libro de Excel (falta xl/workbook.xml).');

  const firstSheet = /<sheet\b[^>]*\/?>/.exec(workbook)?.[0];
  if (!firstSheet) throw new Error('El libro no tiene hojas.');
  const sheetName = attr(firstSheet, 'name') ?? 'Hoja1';
  const relId = attr(firstSheet, 'r:id');
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const rels = get('xl/_rels/workbook.xml.rels');
  if (rels && relId) {
    const rel = new RegExp(`<Relationship\\b[^>]*Id="${relId}"[^>]*/?>`).exec(rels)?.[0];
    const target = rel ? attr(rel, 'Target') : null;
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = get(sheetPath);
  if (!sheet) throw new Error(`No se encontró la hoja ${sheetName}.`);

  const shared: string[] = [];
  const sst = get('xl/sharedStrings.xml');
  if (sst) {
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sst))) shared.push(textOf(m[1]));
  }

  const table: Table = [];
  const formulasWithoutValue: string[] = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(sheet))) {
    const rowNumber = Number(attr(`<row ${rm[1]}>`, 'r')) || table.length + 1;
    const cells: Cell[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[2]))) {
      const tag = `<c ${cm[1]}>`;
      const ref = attr(tag, 'r') ?? '';
      const type = attr(tag, 't');
      const inner = cm[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const hasFormula = /<f\b/.test(inner);
      let value: Cell = null;
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? null;
      else if (type === 'inlineStr') value = textOf(inner);
      else if (type === 'str' && v !== undefined) value = decodeXml(v);
      else if (type === 'b' && v !== undefined) value = v === '1' ? 'VERDADERO' : 'FALSO';
      else if (type === 'e') value = null;
      else if (v !== undefined) value = Number(v);
      if (hasFormula && v === undefined) formulasWithoutValue.push(ref);
      const idx = colIndex(ref);
      while (cells.length < idx) cells.push(null);
      cells[idx] = value;
    }
    while (table.length < rowNumber - 1) table.push([]);
    table.push(cells);
  }
  return {
    sheetName,
    table: table.filter((r) => r.some((c) => c !== null && String(c).trim() !== '')),
    formulasWithoutValue,
  };
}
