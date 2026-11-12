import { poissonKnuth } from '../random/distributions';
import { MersenneTwister } from '../random/rng';
import { addMinutesHHMM } from '../time';

/**
 * Reproducción fiel del notebook "Arkadia_Montecarlo_Colab.ipynb"
 * (escenario del sábado 7 de noviembre de 2026).
 *
 * Parámetros del notebook:
 *  - SEMILLA = 20261107, generador random.Random de Python (Mersenne Twister).
 *  - AUMENTOS = [1.25, 1.15, 1.30, 1.20] para E70, S70, E80, S80 (hipótesis).
 *  - Base: intervalos 18:00–19:30 del viernes; 19:30–20:00 se extrapola con la
 *    media de los seis últimos intervalos del viernes (19:00–19:30).
 *  - λ = media · aumento · (1 + 0,10·sen(iπ/12)); con probabilidad 0,045 el
 *    intervalo tiene baja actividad y λ se multiplica por 0,18.
 *  - Conteo ~ Poisson(λ) (método de Knuth) truncado a un tope = int(1,35 · máximo del viernes).
 *
 * Advertencia (se muestra en la app): el tope del notebook RECORTA vehículos.
 * Es un supuesto del notebook, no una capacidad física medida. El motor
 * Montecarlo general de la app no recorta: acumula los excedentes como fila.
 */
export const NOTEBOOK_PARAMS = {
  seed: 20261107,
  increases: [1.25, 1.15, 1.3, 1.2] as const,
  temporalAmplitude: 0.1,
  temporalHalfPeriod: 12,
  lowActivityProbability: 0.045,
  lowActivityFactor: 0.18,
  capMultiplier: 1.35,
  startTime: '18:00',
  intervalMinutes: 5,
  /** Índice del primer intervalo del viernes usado (18:00). */
  fridayOffset: 6,
  extrapolatedIntervals: 6,
  extrapolationWindow: 6,
} as const;

export interface NotebookRow {
  start: string;
  end: string;
  /** E70, S70, E80, S80 */
  values: [number, number, number, number];
}

export interface NotebookResult {
  rows: NotebookRow[];
  caps: [number, number, number, number];
  totals: [number, number, number, number];
  /** Intervalos en que el tope recortó el valor simulado, por flujo. */
  truncations: { start: string; flow: number; drawn: number; cap: number }[];
}

/**
 * @param friday Matriz 24 × 4 con los conteos del viernes en orden E70, S70, E80, S80.
 */
export function reproduceNotebookSaturday(friday: number[][]): NotebookResult {
  if (friday.length !== 24 || friday.some((r) => r.length !== 4)) {
    throw new Error('Se esperaban 24 intervalos de cinco minutos con 4 flujos (igual que el notebook).');
  }
  const P = NOTEBOOK_PARAMS;
  const rng = new MersenneTwister(P.seed);
  const tail = friday.slice(18, 24);
  const means = [0, 1, 2, 3].map((j) => tail.reduce((acc, r) => acc + r[j], 0) / tail.length);
  const base: number[][] = [
    ...friday.slice(P.fridayOffset),
    ...Array.from({ length: P.extrapolatedIntervals }, () => means.slice()),
  ];
  const caps = [0, 1, 2, 3].map((j) =>
    Math.max(1, Math.trunc(Math.max(...friday.map((r) => r[j])) * P.capMultiplier)),
  ) as [number, number, number, number];

  const rows: NotebookRow[] = [];
  const truncations: NotebookResult['truncations'] = [];
  base.forEach((b, i) => {
    const start = addMinutesHHMM(P.startTime, P.intervalMinutes * i);
    const values = [0, 0, 0, 0] as [number, number, number, number];
    for (let j = 0; j < 4; j++) {
      let lam = b[j] * P.increases[j] * (1 + P.temporalAmplitude * Math.sin((i * Math.PI) / P.temporalHalfPeriod));
      if (rng.next() < P.lowActivityProbability) lam *= P.lowActivityFactor;
      const drawn = poissonKnuth(rng, lam);
      if (drawn > caps[j]) truncations.push({ start, flow: j, drawn, cap: caps[j] });
      values[j] = Math.min(drawn, caps[j]);
    }
    rows.push({ start, end: addMinutesHHMM(start, P.intervalMinutes), values });
  });
  const totals = [0, 1, 2, 3].map((j) => rows.reduce((acc, r) => acc + r.values[j], 0)) as NotebookResult['totals'];
  return { rows, caps, totals, truncations };
}
