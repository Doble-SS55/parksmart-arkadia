import { describe, expect, it } from 'vitest';
import { buildPresetScenarios, diff, evaluateScenario, waitSeconds } from '../src/core/scenarios/compare';

const friday = { C70: { avg: 326 / 120, peak: 21 / 5 }, C80: { avg: 530 / 120, peak: 29 / 5 } };
const saturday = { C70: { avg: 380 / 120, peak: 28 / 5 }, C80: { avg: 666 / 120, peak: 39 / 5 } };

const presets = buildPresetScenarios({
  friday, saturday, existingServers: { C70: 2, C80: 2 }, serviceSeconds: 5, serviceIsApproximate: true,
  demandIncreases: [0.1, 0.25], serviceReduction: 0.2, redistribution: 0.2,
});

describe('Comparador de escenarios', () => {
  it('construye los escenarios estándar', () => {
    expect(presets.map((p) => p.id)).toEqual([
      'viernes', 'sabado', 'barreras-1', 'barreras-2', 'barreras-3', 'demanda-0.1', 'demanda-0.25', 'servicio', 'redistribucion',
    ]);
  });

  it('distingue barreras existentes de hipotéticas', () => {
    const three = evaluateScenario(presets.find((p) => p.id === 'barreras-3')!);
    expect(three.perAccess.C80.hypotheticalServers).toBe(1);
    expect(presets.find((p) => p.id === 'barreras-3')!.hypotheses.join(' ')).toMatch(/HIPOTÉTICA/);
    const two = evaluateScenario(presets.find((p) => p.id === 'barreras-2')!);
    expect(two.perAccess.C80.hypotheticalServers).toBe(0);
  });

  it('modela cada acceso como sistema independiente con M/M/s', () => {
    const r = evaluateScenario(presets[0]);
    expect(r.perAccess.C70.avg.status).toBe('stable');
    expect(r.perAccess.C80.mu).toBe(12);
    expect(r.perAccess.C80.capacityPerHour).toBe(1440);
  });

  it('más barreras o menos tiempo de atención reducen la espera', () => {
    const one = evaluateScenario(presets.find((p) => p.id === 'barreras-1')!);
    const two = evaluateScenario(presets.find((p) => p.id === 'barreras-2')!);
    const fast = evaluateScenario(presets.find((p) => p.id === 'servicio')!);
    expect(waitSeconds(two.perAccess.C80.avg)!).toBeLessThan(waitSeconds(one.perAccess.C80.avg)!);
    expect(waitSeconds(fast.perAccess.C80.avg)!).toBeLessThan(waitSeconds(two.perAccess.C80.avg)!);
  });

  it('la redistribución conserva el total de entradas', () => {
    const r = presets.find((p) => p.id === 'redistribucion')!;
    expect(r.demand.C70.avg + r.demand.C80.avg).toBeCloseTo(friday.C70.avg + friday.C80.avg, 12);
  });

  it('marca riesgo crítico cuando la demanda supera la capacidad', () => {
    const r = evaluateScenario({ ...presets[0], serviceSeconds: 30, servers: { C70: 1, C80: 1 } });
    expect(r.perAccess.C80.avg.status).toBe('unstable');
    expect(r.worstRisk).toBe('critico');
    expect(waitSeconds(r.perAccess.C80.avg)).toBeNull();
  });

  it('calcula diferencias absolutas y porcentuales', () => {
    expect(diff(10, 15)).toEqual({ base: 10, value: 15, absolute: 5, percent: 50 });
    expect(diff(null, 3).absolute).toBeNull();
    expect(diff(0, 3).percent).toBeNull();
  });
});
