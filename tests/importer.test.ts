import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/core/importer/csv';
import { findRecordIssues, normalizeTable } from '../src/core/importer/normalize';
import { readXlsx } from '../src/core/importer/xlsx';
import { saveImport, getSummary } from '../src/services/datasets';
import { createTestDb } from './helpers';

const root = resolve(__dirname, '..');

describe('Importación de Excel', () => {
  it('lee el Excel original del viernes (celdas con fórmula, valor guardado)', () => {
    const bytes = new Uint8Array(readFileSync(resolve(root, 'data-fuente/datos del 6 nov.xlsx')));
    const { table, formulasWithoutValue, sheetName } = readXlsx(bytes);
    expect(sheetName).toBe('Hoja1');
    expect(formulasWithoutValue).toHaveLength(0);
    expect(table[0]).toEqual(['Desde', 'Hasta', 'Entrada 70', 'Salida 70', 'Entrada 80', 'Salida 80', 'Entradas total', 'Salidas total']);
    expect(table[1]).toEqual(['17:30', '17:35', 7, 8, 24, 6, 31, 14]);
    const n = normalizeTable(table, { date: '2026-11-06', origin: 'observado' });
    expect(n.format).toBe('ancho');
    expect(n.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    expect(n.records).toHaveLength(96);
    expect(n.records.filter((r) => r.direction === 'entrada').reduce((a, r) => a + r.count, 0)).toBe(856);
  });

  it('lee horas guardadas como fracción de día y celdas en línea', () => {
    const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Desde</t></is></c><c r="B1" t="inlineStr"><is><t>Hasta</t></is></c><c r="C1" t="inlineStr"><is><t>Entrada 70</t></is></c></row>
      <row r="2"><c r="A2"><v>0.75</v></c><c r="B2"><v>0.75347222222</v></c><c r="C2"><v>12</v></c></row>
    </sheetData></worksheet>`;
    const wb = `<workbook xmlns:r="r"><sheets><sheet name="Datos" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const rels = `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`;
    const zip = zipSync({ 'xl/workbook.xml': strToU8(wb), 'xl/_rels/workbook.xml.rels': strToU8(rels), 'xl/worksheets/sheet1.xml': strToU8(sheet) });
    const { table, sheetName } = readXlsx(zip);
    expect(sheetName).toBe('Datos');
    const n = normalizeTable(table, { date: '2026-11-10', origin: 'observado' });
    expect(n.records[0]).toMatchObject({ startTime: '18:00', endTime: '18:05', count: 12, access: 'C70', direction: 'entrada' });
  });

  it('rechaza un archivo que no es xlsx', () => {
    expect(() => readXlsx(new Uint8Array([1, 2, 3]))).toThrow(/xlsx válido/);
  });
});

describe('Importación de CSV', () => {
  it('lee el CSV del sábado en formato ancho', () => {
    const text = readFileSync(resolve(root, 'data-fuente/arkadia_sabado_7_simulado.csv'), 'utf8');
    const n = normalizeTable(parseCsv(text), { date: '2026-11-07', origin: 'simulado' });
    expect(n.records).toHaveLength(96);
    expect(n.records.every((r) => r.origin === 'simulado')).toBe(true);
  });

  it('acepta formato largo con punto y coma, comillas y horas a. m./p. m.', () => {
    const csv = 'fecha;hora_inicio;hora_fin;acceso;dirección;cantidad;observaciones\n' +
      '08/11/2026;6:00 p. m.;6:05 p. m.;Carrera 70;Entrada;15;"lluvia; poca visibilidad"\n' +
      '2026-11-08;18:00;18:05;80;salida;9;\n';
    const n = normalizeTable(parseCsv(csv), { date: '2026-11-08', origin: 'manual' });
    expect(n.format).toBe('largo');
    expect(n.records).toHaveLength(2);
    expect(n.records[0]).toMatchObject({ date: '2026-11-08', startTime: '18:00', access: 'C70', direction: 'entrada', count: 15, notes: 'lluvia; poca visibilidad' });
    expect(n.records[1]).toMatchObject({ access: 'C80', direction: 'salida', count: 9 });
  });

  it('detecta datos inválidos: horas, cantidades negativas o decimales, accesos desconocidos', () => {
    const csv = 'fecha,hora_inicio,hora_fin,acceso,direccion,cantidad\n' +
      '2026-11-08,18:00,17:55,70,entrada,5\n' +
      '2026-11-08,18:05,18:10,70,entrada,-2\n' +
      '2026-11-08,18:10,18:15,70,entrada,3.5\n' +
      '2026-11-08,18:15,18:20,90,entrada,4\n' +
      '2026-11-08,xx,18:25,70,entrada,4\n';
    const n = normalizeTable(parseCsv(csv), { date: '2026-11-08', origin: 'manual' });
    const errors = n.issues.filter((i) => i.level === 'error').map((i) => i.message).join(' | ');
    expect(errors).toMatch(/posterior/);
    expect(errors).toMatch(/negativa/);
    expect(errors).toMatch(/entero/);
    expect(errors).toMatch(/Acceso no reconocido/);
    expect(errors).toMatch(/Hora inicial inválida/);
    expect(n.records).toHaveLength(0);
  });

  it('detecta duplicados, huecos e intervalos incompletos', () => {
    const issues = findRecordIssues([
      { date: 'd', startTime: '18:00', endTime: '18:05', access: 'C70', direction: 'entrada', count: 1 },
      { date: 'd', startTime: '18:00', endTime: '18:05', access: 'C70', direction: 'entrada', count: 2 },
      { date: 'd', startTime: '18:10', endTime: '18:15', access: 'C70', direction: 'entrada', count: 2 },
    ]);
    const text = issues.map((i) => i.message).join(' | ');
    expect(text).toMatch(/duplicado/);
    expect(text).toMatch(/hueco entre 18:05 y 18:10/);
    expect(text).toMatch(/faltan flujos/);
  });

  it('advierte si los totales del archivo no cuadran', () => {
    const csv = 'Desde,Hasta,Entrada 70,Salida 70,Entrada 80,Salida 80,Entradas total,Salidas total\n18:00,18:05,1,2,3,4,99,6\n';
    const n = normalizeTable(parseCsv(csv), { date: '2026-11-08', origin: 'observado' });
    expect(n.issues.some((i) => /total de entradas/.test(i.message))).toBe(true);
  });

  it('informa columnas no reconocidas', () => {
    const n = normalizeTable([['a', 'b'], [1, 2]], { date: '2026-11-08', origin: 'observado' });
    expect(n.format).toBeNull();
    expect(n.issues[0].level).toBe('error');
  });

  it('guarda la importación en un conjunto nuevo con el origen elegido', async () => {
    const db = await createTestDb(true);
    const text = readFileSync(resolve(root, 'data-fuente/arkadia_sabado_7_simulado.csv'), 'utf8');
    const n = normalizeTable(parseCsv(text), { date: '2026-11-14', origin: 'simulado' });
    const id = saveImport(db, { name: 'Copia sábado', date: '2026-11-14', kind: 'simulado', sourceFile: 'x.csv' }, n);
    const { summary } = getSummary(db, id);
    expect(summary.totalEntries).toBe(1046);
  });
});
