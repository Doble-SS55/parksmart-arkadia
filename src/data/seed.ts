/**
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
export interface SeedRow {
  start: string;
  end: string;
  values: [number, number, number, number];
}

export const FRIDAY_SOURCE_FILE = 'datos del 6 nov.xlsx';
export const SATURDAY_SOURCE_FILE = 'arkadia_sabado_7_simulado.csv (Arkadia_Montecarlo_Colab.ipynb)';

export const FRIDAY_OBSERVED: SeedRow[] = [
  {
    "start": "17:30",
    "end": "17:35",
    "values": [
      7,
      8,
      24,
      6
    ]
  },
  {
    "start": "17:35",
    "end": "17:40",
    "values": [
      13,
      8,
      16,
      7
    ]
  },
  {
    "start": "17:40",
    "end": "17:45",
    "values": [
      10,
      5,
      17,
      10
    ]
  },
  {
    "start": "17:45",
    "end": "17:50",
    "values": [
      9,
      4,
      12,
      13
    ]
  },
  {
    "start": "17:50",
    "end": "17:55",
    "values": [
      21,
      9,
      23,
      12
    ]
  },
  {
    "start": "17:55",
    "end": "18:00",
    "values": [
      15,
      5,
      27,
      10
    ]
  },
  {
    "start": "18:00",
    "end": "18:05",
    "values": [
      19,
      11,
      24,
      18
    ]
  },
  {
    "start": "18:05",
    "end": "18:10",
    "values": [
      13,
      9,
      29,
      18
    ]
  },
  {
    "start": "18:10",
    "end": "18:15",
    "values": [
      16,
      7,
      9,
      12
    ]
  },
  {
    "start": "18:15",
    "end": "18:20",
    "values": [
      15,
      4,
      29,
      14
    ]
  },
  {
    "start": "18:20",
    "end": "18:25",
    "values": [
      9,
      15,
      27,
      17
    ]
  },
  {
    "start": "18:25",
    "end": "18:30",
    "values": [
      16,
      8,
      27,
      14
    ]
  },
  {
    "start": "18:30",
    "end": "18:35",
    "values": [
      15,
      15,
      27,
      16
    ]
  },
  {
    "start": "18:35",
    "end": "18:40",
    "values": [
      21,
      14,
      29,
      25
    ]
  },
  {
    "start": "18:40",
    "end": "18:45",
    "values": [
      18,
      15,
      28,
      11
    ]
  },
  {
    "start": "18:45",
    "end": "18:50",
    "values": [
      13,
      17,
      27,
      22
    ]
  },
  {
    "start": "18:50",
    "end": "18:55",
    "values": [
      10,
      17,
      29,
      28
    ]
  },
  {
    "start": "18:55",
    "end": "19:00",
    "values": [
      17,
      16,
      20,
      24
    ]
  },
  {
    "start": "19:00",
    "end": "19:05",
    "values": [
      12,
      16,
      17,
      24
    ]
  },
  {
    "start": "19:05",
    "end": "19:10",
    "values": [
      9,
      11,
      18,
      25
    ]
  },
  {
    "start": "19:10",
    "end": "19:15",
    "values": [
      13,
      19,
      18,
      26
    ]
  },
  {
    "start": "19:15",
    "end": "19:20",
    "values": [
      11,
      13,
      17,
      19
    ]
  },
  {
    "start": "19:20",
    "end": "19:25",
    "values": [
      16,
      17,
      17,
      29
    ]
  },
  {
    "start": "19:25",
    "end": "19:30",
    "values": [
      8,
      18,
      19,
      28
    ]
  }
];

export const SATURDAY_SIMULATED: SeedRow[] = [
  {
    "start": "18:00",
    "end": "18:05",
    "values": [
      17,
      14,
      24,
      24
    ]
  },
  {
    "start": "18:05",
    "end": "18:10",
    "values": [
      16,
      13,
      32,
      2
    ]
  },
  {
    "start": "18:10",
    "end": "18:15",
    "values": [
      16,
      5,
      10,
      16
    ]
  },
  {
    "start": "18:15",
    "end": "18:20",
    "values": [
      19,
      5,
      39,
      15
    ]
  },
  {
    "start": "18:20",
    "end": "18:25",
    "values": [
      8,
      16,
      37,
      26
    ]
  },
  {
    "start": "18:25",
    "end": "18:30",
    "values": [
      26,
      12,
      39,
      13
    ]
  },
  {
    "start": "18:30",
    "end": "18:35",
    "values": [
      23,
      15,
      28,
      14
    ]
  },
  {
    "start": "18:35",
    "end": "18:40",
    "values": [
      24,
      18,
      39,
      4
    ]
  },
  {
    "start": "18:40",
    "end": "18:45",
    "values": [
      19,
      22,
      34,
      15
    ]
  },
  {
    "start": "18:45",
    "end": "18:50",
    "values": [
      17,
      25,
      39,
      23
    ]
  },
  {
    "start": "18:50",
    "end": "18:55",
    "values": [
      16,
      3,
      39,
      30
    ]
  },
  {
    "start": "18:55",
    "end": "19:00",
    "values": [
      28,
      22,
      36,
      35
    ]
  },
  {
    "start": "19:00",
    "end": "19:05",
    "values": [
      13,
      21,
      23,
      7
    ]
  },
  {
    "start": "19:05",
    "end": "19:10",
    "values": [
      9,
      9,
      23,
      34
    ]
  },
  {
    "start": "19:10",
    "end": "19:15",
    "values": [
      18,
      15,
      25,
      26
    ]
  },
  {
    "start": "19:15",
    "end": "19:20",
    "values": [
      13,
      20,
      15,
      22
    ]
  },
  {
    "start": "19:20",
    "end": "19:25",
    "values": [
      20,
      20,
      20,
      35
    ]
  },
  {
    "start": "19:25",
    "end": "19:30",
    "values": [
      10,
      19,
      21,
      36
    ]
  },
  {
    "start": "19:30",
    "end": "19:35",
    "values": [
      14,
      18,
      21,
      36
    ]
  },
  {
    "start": "19:35",
    "end": "19:40",
    "values": [
      1,
      15,
      20,
      22
    ]
  },
  {
    "start": "19:40",
    "end": "19:45",
    "values": [
      13,
      19,
      26,
      18
    ]
  },
  {
    "start": "19:45",
    "end": "19:50",
    "values": [
      15,
      15,
      16,
      6
    ]
  },
  {
    "start": "19:50",
    "end": "19:55",
    "values": [
      8,
      16,
      30,
      25
    ]
  },
  {
    "start": "19:55",
    "end": "20:00",
    "values": [
      17,
      18,
      30,
      30
    ]
  }
];
