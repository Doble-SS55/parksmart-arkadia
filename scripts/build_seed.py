"""Genera src/data/seed.ts a partir de los archivos originales de data-fuente/.

Uso: python3 scripts/build_seed.py
Lee los valores calculados del Excel del viernes (las celdas son fórmulas que
apuntan a otro libro; openpyxl con data_only=True devuelve el valor guardado).
"""
import csv, json, pathlib, openpyxl

root = pathlib.Path(__file__).resolve().parent.parent
wb = openpyxl.load_workbook(root / 'data-fuente' / 'datos del 6 nov.xlsx', data_only=True)
ws = wb.active
friday = []
for r in list(ws.iter_rows(values_only=True))[1:]:
    desde, hasta, e70, s70, e80, s80, et, st = r
    assert e70 + e80 == et and s70 + s80 == st, r
    friday.append({'start': desde, 'end': hasta, 'values': [int(e70), int(s70), int(e80), int(s80)]})

saturday = []
with open(root / 'data-fuente' / 'arkadia_sabado_7_simulado.csv', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        vals = [int(r['Entrada 70']), int(r['Salida 70']), int(r['Entrada 80']), int(r['Salida 80'])]
        assert vals[0] + vals[2] == int(r['Entradas total']) and vals[1] + vals[3] == int(r['Salidas total'])
        saturday.append({'start': r['Desde'], 'end': r['Hasta'], 'values': vals})

out = f'''/**
 * Datos semilla generados por scripts/build_seed.py — no editar a mano.
 *
 * - FRIDAY_OBSERVED: conteos de campo del viernes 6 de noviembre de 2026
 *   (archivo "datos del 6 nov.xlsx", 17:30–19:30, intervalos de 5 min).
 * - SATURDAY_SIMULATED: simulación Montecarlo del sábado 7 de noviembre de 2026
 *   (archivo "arkadia_sabado_7_simulado.csv", salida del notebook de Colab).
 *   SON DATOS SINTÉTICOS, NO MEDICIONES.
 *
 * Orden de los valores: Entrada 70, Salida 70, Entrada 80, Salida 80.
 */
export interface SeedRow {{
  start: string;
  end: string;
  values: [number, number, number, number];
}}

export const FRIDAY_SOURCE_FILE = 'datos del 6 nov.xlsx';
export const SATURDAY_SOURCE_FILE = 'arkadia_sabado_7_simulado.csv (Arkadia_Montecarlo_Colab.ipynb)';

export const FRIDAY_OBSERVED: SeedRow[] = {json.dumps(friday, indent=2)};

export const SATURDAY_SIMULATED: SeedRow[] = {json.dumps(saturday, indent=2)};
'''
(root / 'src' / 'data' / 'seed.ts').write_text(out, encoding='utf-8')
print('friday', len(friday), 'saturday', len(saturday))
