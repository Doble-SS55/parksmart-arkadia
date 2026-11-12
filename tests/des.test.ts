import { describe, expect, it } from 'vitest';
import { DiscreteEventSimulator, type DesConfig } from '../src/core/des/engine';
import { solveQueue } from '../src/core/queueing/queueing';

const base: DesConfig = {
  arrivalRatePerMin: 4,
  servers: 2,
  meanServiceMin: 0.4,
  serviceDistribution: 'exponencial',
  horizonMin: 120,
  seed: 2026,
};

describe('Motor de eventos discretos', () => {
  it('ningún servidor atiende dos vehículos a la vez', () => {
    const sim = new DiscreteEventSimulator({ ...base, horizonMin: 600 });
    sim.runToEnd(true);
    for (let s = 0; s < base.servers; s++) {
      const mine = sim.vehicles.filter((v) => v.server === s).sort((a, b) => a.serviceStart! - b.serviceStart!);
      for (let i = 1; i < mine.length; i++) {
        expect(mine[i].serviceStart!).toBeGreaterThanOrEqual(mine[i - 1].serviceEnd! - 1e-12);
      }
    }
  });

  it('ningún vehículo termina antes de empezar ni espera tiempo negativo', () => {
    const sim = new DiscreteEventSimulator(base);
    sim.runToEnd(true);
    expect(sim.vehicles.length).toBeGreaterThan(300);
    for (const v of sim.vehicles) {
      expect(v.serviceStart!).toBeGreaterThanOrEqual(v.arrival);
      expect(v.serviceEnd!).toBeGreaterThanOrEqual(v.serviceStart!);
      expect(v.serviceStart! - v.arrival).toBeGreaterThanOrEqual(0);
    }
  });

  it('conserva el balance llegadas = atendidos + en servicio + en fila en todo momento', () => {
    const sim = new DiscreteEventSimulator({ ...base, arrivalRatePerMin: 6 });
    for (let t = 0.5; t <= 120; t += 0.5) {
      sim.advanceTo(t);
      const m = sim.metrics();
      expect(m.arrived).toBe(m.served + m.inService + m.inQueue);
      expect(m.busyServers).toBeLessThanOrEqual(base.servers);
    }
  });

  it('pausar y reanudar (avanzar en pasos) da exactamente el mismo resultado', () => {
    const a = new DiscreteEventSimulator(base);
    a.runToEnd();
    const b = new DiscreteEventSimulator(base);
    for (let t = 0; t <= 120; t += 0.37) b.advanceTo(t);
    b.advanceTo(120);
    expect(b.vehicles).toEqual(a.vehicles);
    expect(b.metrics()).toEqual(a.metrics());
    expect(b.log.map((e) => [e.type, e.vehicleId, e.serverId])).toEqual(a.log.map((e) => [e.type, e.vehicleId, e.serverId]));
  });

  it('registra los cinco tipos de evento', () => {
    const sim = new DiscreteEventSimulator({ ...base, arrivalRatePerMin: 6 });
    sim.runToEnd(true);
    const types = new Set(sim.log.map((e) => e.type));
    for (const t of ['llegada', 'inicio_servicio', 'fin_servicio', 'liberacion_servidor', 'asignacion_cola']) {
      expect(types.has(t as never)).toBe(true);
    }
  });

  it('en una corrida larga se aproxima a la teoría M/M/s', () => {
    const cfg = { ...base, horizonMin: 30000 };
    const sim = new DiscreteEventSimulator(cfg);
    sim.runToEnd();
    const m = sim.metrics();
    const theory = solveQueue({ model: 'MMS', lambda: 4, mu: 2.5, servers: 2 });
    if (theory.status !== 'stable') throw new Error('teoría inestable');
    expect(Math.abs(m.avgWait - theory.wq) / theory.wq).toBeLessThan(0.08);
    expect(Math.abs(m.utilization - theory.rho)).toBeLessThan(0.02);
    expect(Math.abs(m.timeAvgQueue - theory.lq) / theory.lq).toBeLessThan(0.1);
  });

  it('con λ = 0 no llega nadie', () => {
    const sim = new DiscreteEventSimulator({ ...base, arrivalRatePerMin: 0 });
    sim.runToEnd();
    expect(sim.metrics().arrived).toBe(0);
    expect(sim.metrics().utilization).toBe(0);
  });

  it('el servicio uniforme (menos variable) produce menos espera que el exponencial', () => {
    const exp = new DiscreteEventSimulator({ ...base, horizonMin: 20000 });
    const uni = new DiscreteEventSimulator({
      ...base, horizonMin: 20000, serviceDistribution: 'uniforme', serviceMinMin: 0.3, serviceMaxMin: 0.5,
    });
    exp.runToEnd();
    uni.runToEnd();
    expect(uni.metrics().avgWait).toBeLessThan(exp.metrics().avgWait);
  });

  it('rechaza configuraciones inválidas', () => {
    expect(() => new DiscreteEventSimulator({ ...base, servers: 0 })).toThrow();
    expect(() => new DiscreteEventSimulator({ ...base, meanServiceMin: 0 })).toThrow();
    expect(() => new DiscreteEventSimulator({ ...base, serviceDistribution: 'uniforme' })).toThrow();
  });
});
