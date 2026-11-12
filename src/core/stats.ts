/** Estadística descriptiva básica usada por los módulos de datos y Montecarlo. */

export function sum(values: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i];
  return s;
}

export function mean(values: ArrayLike<number>): number {
  return values.length === 0 ? NaN : sum(values) / values.length;
}

/** Varianza muestral (divisor n − 1). */
export function sampleVariance(values: ArrayLike<number>): number {
  const n = values.length;
  if (n < 2) return NaN;
  const m = mean(values);
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (values[i] - m) ** 2;
  return acc / (n - 1);
}

export function sampleSd(values: ArrayLike<number>): number {
  return Math.sqrt(sampleVariance(values));
}

export function minOf(values: ArrayLike<number>): number {
  let m = Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] < m) m = values[i];
  return m;
}

export function maxOf(values: ArrayLike<number>): number {
  let m = -Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] > m) m = values[i];
  return m;
}

/** Cuantil con interpolación lineal (tipo 7 de Hyndman y Fan, el de Excel PERCENTIL.INC). */
export function quantileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function sortedCopy(values: ArrayLike<number>): Float64Array {
  const copy = Float64Array.from(values as ArrayLike<number>);
  copy.sort();
  return copy;
}

export interface Summary {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export function summarize(values: ArrayLike<number>): Summary {
  const sorted = sortedCopy(values);
  return {
    n: sorted.length,
    mean: mean(sorted),
    sd: sorted.length > 1 ? sampleSd(sorted) : 0,
    min: sorted.length ? sorted[0] : NaN,
    max: sorted.length ? sorted[sorted.length - 1] : NaN,
    p5: quantileSorted(sorted, 0.05),
    p25: quantileSorted(sorted, 0.25),
    p50: quantileSorted(sorted, 0.5),
    p75: quantileSorted(sorted, 0.75),
    p95: quantileSorted(sorted, 0.95),
  };
}

/** ln Γ(x) por la aproximación de Lanczos (g = 7, n = 9). */
export function logGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Función gamma incompleta regularizada inferior P(a, x). */
export function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let del = 1 / a;
    let s = del;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      s += del;
      if (Math.abs(del) < Math.abs(s) * 1e-15) break;
    }
    return s * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // Fracción continua de Lentz para Q(a, x)
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** CDF de la chi-cuadrado con k grados de libertad. */
export function chiSquareCdf(x: number, k: number): number {
  return regularizedGammaP(k / 2, x / 2);
}
