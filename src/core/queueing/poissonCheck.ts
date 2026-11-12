import { chiSquareCdf, mean, sampleVariance } from '../stats';

/**
 * Prueba del índice de dispersión para conteos por intervalo.
 * Bajo un proceso de Poisson la varianza es igual a la media, de modo que
 * D = s²/x̄ ≈ 1 y (n − 1)·D sigue aproximadamente una χ² con n − 1 grados de libertad.
 */
export interface DispersionTest {
  n: number;
  mean: number;
  variance: number;
  index: number;
  chiSquare: number;
  df: number;
  /** Valor p bilateral. */
  pValue: number;
  verdict: 'compatible' | 'sobredispersion' | 'subdispersion' | 'insuficiente';
  explanation: string;
}

export function dispersionTest(counts: number[], alpha = 0.05): DispersionTest {
  const n = counts.length;
  const m = mean(counts);
  const v = sampleVariance(counts);
  if (n < 5 || !(m > 0) || !Number.isFinite(v)) {
    return {
      n, mean: m, variance: v, index: NaN, chiSquare: NaN, df: n - 1, pValue: NaN,
      verdict: 'insuficiente',
      explanation: 'Se necesitan al menos 5 intervalos con conteos positivos para evaluar el supuesto de Poisson.',
    };
  }
  const index = v / m;
  const df = n - 1;
  const chiSquare = df * index;
  const cdf = chiSquareCdf(chiSquare, df);
  const pValue = Math.min(1, 2 * Math.min(cdf, 1 - cdf));
  let verdict: DispersionTest['verdict'] = 'compatible';
  let explanation =
    `D = ${index.toFixed(2)} y p = ${pValue.toFixed(3)} ≥ ${alpha}: no hay evidencia para rechazar que los conteos ` +
    'por intervalo sigan una distribución de Poisson.';
  if (pValue < alpha) {
    verdict = index > 1 ? 'sobredispersion' : 'subdispersion';
    explanation =
      index > 1
        ? `D = ${index.toFixed(2)} y p = ${pValue.toFixed(3)} < ${alpha}: los conteos varían más de lo que predice Poisson ` +
          '(sobredispersión, típica de demanda que cambia en el tiempo). El modelo M/M/s sigue siendo una aproximación útil, ' +
          'pero conviene leer sus resultados como valores promedio.'
        : `D = ${index.toFixed(2)} y p = ${pValue.toFixed(3)} < ${alpha}: los conteos son más regulares de lo que predice Poisson ` +
          '(subdispersión). M/M/s tenderá a sobrestimar la espera.';
  }
  return { n, mean: m, variance: v, index, chiSquare, df, pValue, verdict, explanation };
}
