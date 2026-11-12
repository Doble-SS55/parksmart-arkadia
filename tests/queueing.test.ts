import { describe, expect, it } from 'vitest';
import {
  convertRate,
  convertTime,
  probWaitExceeds,
  saturationRisk,
  serviceRateFromSeconds,
  solveQueue,
  stateProbability,
  type StableQueueResult,
} from '../src/core/queueing/queueing';
import { dispersionTest } from '../src/core/queueing/poissonCheck';
import { createRng } from '../src/core/random/rng';
import { poisson } from '../src/core/random/distributions';

function stable(r: ReturnType<typeof solveQueue>): StableQueueResult {
  if (r.status !== 'stable') throw new Error(`Se esperaba estable, llegó ${r.status}`);
  return r;
}

describe('M/M/1', () => {
  it('λ = 2, μ = 3 da los valores de libro', () => {
    const r = stable(solveQueue({ model: 'MM1', lambda: 2, mu: 3, servers: 1 }));
    expect(r.rho).toBeCloseTo(2 / 3, 12);
    expect(r.p0).toBeCloseTo(1 / 3, 12);
    expect(r.lq).toBeCloseTo(4 / 3, 12);
    expect(r.l).toBeCloseTo(2, 12);
    expect(r.wq).toBeCloseTo(2 / 3, 12);
    expect(r.w).toBeCloseTo(1, 12);
    expect(r.pWait).toBeCloseTo(2 / 3, 12);
  });

  it('rechaza más de un servidor', () => {
    const r = solveQueue({ model: 'MM1', lambda: 1, mu: 2, servers: 2 });
    expect(r.status).toBe('invalid');
  });
});

describe('M/M/s', () => {
  it('λ = 10, μ = 4, s = 3 (ejemplo clásico)', () => {
    const r = stable(solveQueue({ model: 'MMS', lambda: 10, mu: 4, servers: 3 }));
    expect(r.offeredLoad).toBeCloseTo(2.5, 12);
    expect(r.rho).toBeCloseTo(0.833333333333, 10);
    expect(r.p0).toBeCloseTo(1 / 22.25, 10);
    expect(r.pWait).toBeCloseTo(15.625 / 22.25, 10);
    expect(r.lq).toBeCloseTo(3.511235955, 8);
    expect(r.wq).toBeCloseTo(0.3511235955, 8);
    expect(r.l).toBeCloseTo(6.011235955, 8);
    expect(r.w).toBeCloseTo(0.6011235955, 8);
  });

  it('con s = 1 coincide con M/M/1', () => {
    const a = stable(solveQueue({ model: 'MMS', lambda: 2.3, mu: 4.1, servers: 1 }));
    const b = stable(solveQueue({ model: 'MM1', lambda: 2.3, mu: 4.1, servers: 1 }));
    for (const k of ['p0', 'lq', 'l', 'wq', 'w', 'pWait'] as const) expect(a[k]).toBeCloseTo(b[k], 12);
  });

  it('cumple la ley de Little L = λW y Lq = λWq', () => {
    for (const [lambda, mu, s] of [[5, 2, 3], [0.7, 0.3, 4], [9.9, 5, 2]] as const) {
      const r = stable(solveQueue({ model: 'MMS', lambda, mu, servers: s }));
      expect(r.l).toBeCloseTo(lambda * r.w, 12);
      expect(r.lq).toBeCloseTo(lambda * r.wq, 12);
      expect(r.l - r.lq).toBeCloseTo(lambda / mu, 12);
      expect(Math.abs(r.littleResidual)).toBeLessThan(1e-12);
    }
  });

  it('las probabilidades de estado suman 1', () => {
    const r = stable(solveQueue({ model: 'MMS', lambda: 3, mu: 2, servers: 2 }));
    let total = 0;
    for (let n = 0; n < 400; n++) total += stateProbability(r, n);
    expect(total).toBeCloseTo(1, 9);
    expect(probWaitExceeds(r, 0)).toBeCloseTo(r.pWait, 12);
  });

  it('marca como inestable ρ ≥ 1 sin valores finitos', () => {
    const r = solveQueue({ model: 'MMS', lambda: 8, mu: 4, servers: 2 });
    expect(r.status).toBe('unstable');
    expect('lq' in r).toBe(false);
    const r2 = solveQueue({ model: 'MM1', lambda: 5, mu: 4, servers: 1 });
    expect(r2.status).toBe('unstable');
  });

  it('maneja λ = 0 sin dividir por cero', () => {
    const r = stable(solveQueue({ model: 'MMS', lambda: 0, mu: 2, servers: 2 }));
    expect(r.p0).toBe(1);
    expect(r.lq).toBe(0);
    expect(r.wq).toBe(0);
    expect(r.w).toBeCloseTo(0.5, 12);
    expect(Number.isFinite(r.l)).toBe(true);
  });

  it('valida entradas inválidas', () => {
    expect(solveQueue({ model: 'MMS', lambda: -1, mu: 2, servers: 1 }).status).toBe('invalid');
    expect(solveQueue({ model: 'MMS', lambda: 1, mu: 0, servers: 1 }).status).toBe('invalid');
    expect(solveQueue({ model: 'MMS', lambda: 1, mu: 2, servers: 1.5 }).status).toBe('invalid');
    expect(solveQueue({ model: 'MMS', lambda: 1, mu: 2, servers: 0 }).status).toBe('invalid');
    expect(solveQueue({ model: 'MMS', lambda: NaN, mu: 2, servers: 1 }).status).toBe('invalid');
  });
});

describe('Unidades y riesgo', () => {
  it('convierte tasas y tiempos', () => {
    expect(convertRate(2, 'h')).toBe(120);
    expect(convertRate(2, 's')).toBeCloseTo(1 / 30, 12);
    expect(convertTime(2, 's')).toBe(120);
    expect(convertTime(30, 'h')).toBe(0.5);
    expect(serviceRateFromSeconds(5)).toBe(12);
    expect(serviceRateFromSeconds(0)).toBe(0);
  });

  it('clasifica el riesgo de saturación', () => {
    expect(saturationRisk(0.5)).toBe('bajo');
    expect(saturationRisk(0.75)).toBe('moderado');
    expect(saturationRisk(0.9)).toBe('alto');
    expect(saturationRisk(1)).toBe('critico');
  });
});

describe('Prueba de dispersión (supuesto de Poisson)', () => {
  it('no rechaza Poisson para datos Poisson', () => {
    const rng = createRng('mt19937', 3);
    const xs = Array.from({ length: 200 }, () => poisson(rng, 15));
    const t = dispersionTest(xs);
    expect(t.verdict).toBe('compatible');
    expect(t.index).toBeGreaterThan(0.75);
    expect(t.index).toBeLessThan(1.3);
  });

  it('detecta sobredispersión', () => {
    const xs = Array.from({ length: 40 }, (_, i) => (i % 2 ? 2 : 40));
    expect(dispersionTest(xs).verdict).toBe('sobredispersion');
  });

  it('informa datos insuficientes', () => {
    expect(dispersionTest([1, 2]).verdict).toBe('insuficiente');
  });
});
