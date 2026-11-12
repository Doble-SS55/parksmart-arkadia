import { logGamma } from '../stats';
import type { Rng } from './rng';

/**
 * Poisson por el método multiplicativo de Knuth, idéntico al del notebook
 * de Colab: multiplica uniformes hasta que el producto cae por debajo de e^(−λ).
 */
export function poissonKnuth(rng: Rng, lambda: number): number {
  if (!(lambda > 0)) return 0;
  let p = 1;
  let k = 0;
  const limit = Math.exp(-lambda);
  while (p > limit) {
    k += 1;
    p *= rng.next();
  }
  return k - 1;
}

/**
 * Poisson general. Para λ < 30 usa Knuth; para λ grande usa la
 * transformación con rechazo PTRS de Hörmann (1993), cuyo costo no crece con λ.
 */
export function poisson(rng: Rng, lambda: number): number {
  if (!(lambda > 0)) return 0;
  if (lambda < 30) return poissonKnuth(rng, lambda);
  const slam = Math.sqrt(lambda);
  const loglam = Math.log(lambda);
  const b = 0.931 + 2.53 * slam;
  const a = -0.059 + 0.02483 * b;
  const invalpha = 1.1239 + 1.1328 / (b - 3.4);
  const vr = 0.9277 - 3.6224 / (b - 2);
  for (;;) {
    const u = rng.next() - 0.5;
    const v = rng.next();
    const us = 0.5 - Math.abs(u);
    const k = Math.floor(((2 * a) / us + b) * u + lambda + 0.43);
    if (us >= 0.07 && v <= vr) return k;
    if (k < 0 || (us < 0.013 && v > us)) continue;
    const lhs = Math.log(v) + Math.log(invalpha) - Math.log(a / (us * us) + b);
    const rhs = -lambda + k * loglam - logGamma(k + 1);
    if (lhs <= rhs) return k;
  }
}

/** Exponencial con media dada (inversa de la CDF). */
export function exponential(rng: Rng, mean: number): number {
  if (!(mean > 0)) return 0;
  return -mean * Math.log(1 - rng.next());
}

export function uniform(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng.next();
}
