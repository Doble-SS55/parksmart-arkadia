import { describe, expect, it } from 'vitest';
import { reproduceNotebookSaturday } from '../src/core/montecarlo/notebookReference';
import { FRIDAY_OBSERVED, SATURDAY_SIMULATED } from '../src/data/seed';

describe('Reproducción del notebook del sábado 7 de noviembre', () => {
  const friday = FRIDAY_OBSERVED.map((r) => [...r.values]);

  it('reproduce exactamente los 96 valores del CSV entregado por el notebook', () => {
    const result = reproduceNotebookSaturday(friday);
    expect(result.rows).toHaveLength(24);
    result.rows.forEach((row, i) => {
      expect(row.start).toBe(SATURDAY_SIMULATED[i].start);
      expect(row.end).toBe(SATURDAY_SIMULATED[i].end);
      expect(row.values).toEqual(SATURDAY_SIMULATED[i].values);
    });
  });

  it('calcula los mismos topes del notebook (int(1,35 · máximo del viernes))', () => {
    const { caps } = reproduceNotebookSaturday(friday);
    expect(caps).toEqual([28, 25, 39, 39]);
  });

  it('rechaza una base con un número de intervalos distinto de 24', () => {
    expect(() => reproduceNotebookSaturday(friday.slice(0, 20))).toThrow();
  });
});
