import { describe, expect, it } from 'vitest';
import { MersenneTwister, ParkMillerLcg, createRng } from '../src/core/random/rng';
import { exponential, poisson, poissonKnuth } from '../src/core/random/distributions';
import { mean, sampleVariance } from '../src/core/stats';

describe('Mersenne Twister compatible con Python', () => {
  it('reproduce random.Random(20261107).random() de Python 3', () => {
    // Valores obtenidos con: python3 -c "import random; r=random.Random(20261107); print([r.random() for _ in range(3)])"
    const r = new MersenneTwister(20261107);
    expect(r.next()).toBe(0.5646031473641774);
    expect(r.next()).toBe(0.3803022685759956);
    expect(r.next()).toBe(0.8077327015566571);
  });

  it('reproduce random.Random(1).random()', () => {
    expect(new MersenneTwister(1).next()).toBe(0.13436424411240122);
  });

  it('misma semilla, misma secuencia; semilla distinta, secuencia distinta', () => {
    const a = createRng('mt19937', 42);
    const b = createRng('mt19937', 42);
    const c = createRng('mt19937', 43);
    const sa = Array.from({ length: 50 }, () => a.next());
    const sb = Array.from({ length: 50 }, () => b.next());
    const sc = Array.from({ length: 50 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });
});

describe('Congruencial de Park–Miller', () => {
  it('cumple el valor de control X(10000) = 1043618065 con semilla 1', () => {
    // Prueba clásica de Park y Miller (1988) para el estándar mínimo.
    const g = new ParkMillerLcg(1);
    let u = 0;
    for (let i = 0; i < 10000; i++) u = g.next();
    expect(Math.round(u * (ParkMillerLcg.MODULUS - 1) + 1)).toBe(1043618065);
  });

  it('produce valores en [0, 1)', () => {
    const g = new ParkMillerLcg(12345);
    for (let i = 0; i < 1000; i++) {
      const u = g.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });
});

describe('Distribuciones', () => {
  it('Poisson tiene media y varianza ≈ λ (Knuth y PTRS)', () => {
    for (const lambda of [3, 12, 45, 120]) {
      const rng = createRng('mt19937', 7);
      const xs = Array.from({ length: 20000 }, () => poisson(rng, lambda));
      expect(Math.abs(mean(xs) - lambda) / lambda).toBeLessThan(0.02);
      expect(Math.abs(sampleVariance(xs) - lambda) / lambda).toBeLessThan(0.06);
      expect(xs.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
    }
  });

  it('Poisson con λ ≤ 0 devuelve 0', () => {
    const rng = createRng('mt19937', 1);
    expect(poissonKnuth(rng, 0)).toBe(0);
    expect(poisson(rng, -3)).toBe(0);
  });

  it('exponencial tiene la media pedida', () => {
    const rng = createRng('lcg', 99);
    const xs = Array.from({ length: 20000 }, () => exponential(rng, 0.5));
    expect(Math.abs(mean(xs) - 0.5)).toBeLessThan(0.02);
  });
});
