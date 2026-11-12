import { describe, expect, it } from 'vitest';
import { DEFAULT_MC_CONFIG, MonteCarloRunner, runMonteCarlo, type MonteCarloConfig } from '../src/core/montecarlo/engine';
import { FRIDAY_OBSERVED } from '../src/data/seed';

const e80 = FRIDAY_OBSERVED.map((r) => r.values[2]);
const e70 = FRIDAY_OBSERVED.map((r) => r.values[0]);

function cfg(over: Partial<MonteCarloConfig> = {}): MonteCarloConfig {
  return { ...DEFAULT_MC_CONFIG, flows: [{ flow: 'E80', base: e80 }], simulations: 500, ...over };
}

describe('Montecarlo', () => {
  it('es reproducible con semilla fija', () => {
    const a = runMonteCarlo(cfg({ seed: 11 }));
    const b = runMonteCarlo(cfg({ seed: 11 }));
    expect(Array.from(a.totals)).toEqual(Array.from(b.totals));
    expect(a.sampleTrajectories).toEqual(b.sampleTrajectories);
  });

  it('cambia con semillas distintas', () => {
    const a = runMonteCarlo(cfg({ seed: 11 }));
    const b = runMonteCarlo(cfg({ seed: 12 }));
    expect(Array.from(a.totals)).not.toEqual(Array.from(b.totals));
  });

  it('no depende del tamaño de los lotes', () => {
    const r = new MonteCarloRunner(cfg({ seed: 5 }));
    while (!r.finished) r.runBatch(7);
    expect(Array.from(r.result().totals)).toEqual(Array.from(runMonteCarlo(cfg({ seed: 5 })).totals));
  });

  it('produce conteos enteros no negativos', () => {
    const r = runMonteCarlo(cfg({ demandFactor: 0.3 }));
    expect(Array.from(r.totals).every((t) => Number.isInteger(t) && t >= 0)).toBe(true);
    expect(r.sampleTrajectories[0].arrivals.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
  });

  it('sin variación ni baja actividad, la media del total ≈ Σ base · factor', () => {
    const r = runMonteCarlo(cfg({ simulations: 4000, temporalAmplitude: 0, lowActivityProbability: 0, demandFactor: 1.25 }));
    const expected = e80.reduce((a, b) => a + b, 0) * 1.25;
    expect(r.baseTotal).toBeCloseTo(expected, 9);
    expect(Math.abs(r.totalStats.mean - expected) / expected).toBeLessThan(0.01);
    // Suma de Poisson independientes: varianza = media.
    expect(Math.abs(r.totalStats.sd ** 2 - expected) / expected).toBeLessThan(0.08);
    expect(r.meanCi95[0]).toBeLessThan(expected);
    expect(r.meanCi95[1]).toBeGreaterThan(expected);
  });

  it('los percentiles están ordenados y dentro de [mín, máx]', () => {
    const s = runMonteCarlo(cfg()).totalStats;
    expect(s.min).toBeLessThanOrEqual(s.p5);
    expect(s.p5).toBeLessThanOrEqual(s.p25);
    expect(s.p25).toBeLessThanOrEqual(s.p50);
    expect(s.p50).toBeLessThanOrEqual(s.p75);
    expect(s.p75).toBeLessThanOrEqual(s.p95);
    expect(s.p95).toBeLessThanOrEqual(s.max);
  });

  it('con capacidad limitada los vehículos no desaparecen: llegadas = atendidos + pendientes', () => {
    const r = runMonteCarlo(cfg({ flows: [{ flow: 'E80', base: e80 }, { flow: 'E70', base: e70 }], capacityPerInterval: 20, simulations: 200 }));
    for (const t of r.sampleTrajectories) {
      const arrivals = t.arrivals.reduce((a, b) => a + b, 0);
      const served = t.served.reduce((a, b) => a + b, 0);
      expect(arrivals).toBe(served + t.pending[t.pending.length - 1]);
      expect(t.served.every((s) => s <= 20)).toBe(true);
    }
    expect(r.capacity).not.toBeNull();
    expect(r.capacity!.maxPending.max).toBeGreaterThanOrEqual(r.capacity!.pendingEnd.max);
  });

  it('estima probabilidades de superar umbrales', () => {
    const r = runMonteCarlo(cfg({ totalThreshold: 0, intervalThreshold: 1000 }));
    expect(r.probTotalExceeds).toBe(1);
    expect(r.probAnyIntervalExceeds).toBe(0);
  });

  it('extrapola intervalos adicionales con la media final', () => {
    const r = runMonteCarlo(cfg({ extraIntervals: 6, simulations: 10 }));
    expect(r.intervals).toBe(30);
  });

  it('corre 10.000 simulaciones de los cuatro flujos', () => {
    const flows = (['E70', 'S70', 'E80', 'S80'] as const).map((flow, j) => ({ flow, base: FRIDAY_OBSERVED.map((r) => r.values[j]) }));
    const r = runMonteCarlo(cfg({ flows, simulations: 10000 }));
    expect(r.totals.length).toBe(10000);
    expect(r.elapsedMs).toBeLessThan(10000);
  });

  it('valida configuraciones inválidas', () => {
    expect(() => runMonteCarlo(cfg({ simulations: 0 }))).toThrow();
    expect(() => runMonteCarlo(cfg({ flows: [] }))).toThrow();
    expect(() => runMonteCarlo(cfg({ seed: -1 }))).toThrow();
  });
});
