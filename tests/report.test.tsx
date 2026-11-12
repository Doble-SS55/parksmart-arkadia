import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as pdfmakeNs from 'pdfmake';
import { describe, expect, it } from 'vitest';
import { datasetsRepo, montecarloRepo, simulationRepo } from '../src/db/repositories';
import { DEFAULT_MC_CONFIG, runMonteCarlo } from '../src/core/montecarlo/engine';
import { toStoredParams, toStoredSummary } from '../src/core/montecarlo/summary';
import { DiscreteEventSimulator } from '../src/core/des/engine';
import { buildReportData } from '../src/services/reportData';
import { buildReportDocument } from '../src/services/reportPdf';
import { getSeries } from '../src/services/datasets';
import { createTestDb } from './helpers';

const pdfmake = ((pdfmakeNs as unknown as { default?: typeof pdfmakeNs }).default ?? pdfmakeNs) as typeof pdfmakeNs;
const fonts = resolve(__dirname, '../node_modules/pdfmake/build/fonts/Roboto');
pdfmake.setFonts({
  Roboto: {
    normal: `${fonts}/Roboto-Regular.ttf`, bold: `${fonts}/Roboto-Medium.ttf`,
    italics: `${fonts}/Roboto-Italic.ttf`, bolditalics: `${fonts}/Roboto-MediumItalic.ttf`,
  },
});

async function seededData(withRuns: boolean) {
  const db = await createTestDb(true);
  const ds = datasetsRepo.list(db);
  const friday = ds.find((d) => d.kind === 'observado')!;
  const saturday = ds.find((d) => d.kind === 'simulado')!;
  if (withRuns) {
    const series = getSeries(db, friday.id);
    const r = runMonteCarlo({ ...DEFAULT_MC_CONFIG, simulations: 300, flows: [{ flow: 'E80', base: series.values.E80 }], totalThreshold: 650 });
    montecarloRepo.create(db, { name: 'E80 +20 %', baseDatasetId: friday.id, flows: ['E80'], seed: r.config.seed, generator: 'mt19937', simulations: 300, params: toStoredParams(r.config), summary: toStoredSummary(r) });
    const sim = new DiscreteEventSimulator({ arrivalRatePerMin: 5.8, servers: 2, meanServiceMin: 5 / 60, serviceDistribution: 'exponencial', horizonMin: 30, seed: 7 });
    sim.runToEnd();
    simulationRepo.create(db, { name: 'Carrera 80 · 2 barreras', params: sim.config, summary: sim.metrics() }, sim.vehicles, sim.log);
  }
  return buildReportData(db, { observedDatasetId: friday.id, simulatedDatasetId: saturday.id, includeExits: true, includeAnnex: true });
}

describe('Informe PDF', () => {
  it('reúne los datos reales de la aplicación', async () => {
    const data = await seededData(false);
    expect(data.observed.summary.totalEntries).toBe(856);
    expect(data.simulated?.summary.totalEntries).toBe(1046);
    expect(data.queues).toHaveLength(4);
    expect(data.notebook).toEqual({ matches: 96, total: 96, truncations: expect.any(Number), totals: [380, 375, 666, 514] });
    expect(data.team).toEqual(['Santiago Solís', 'Juan Fernando Gómez Ocampo']);
    expect(data.scenarios.length).toBeGreaterThanOrEqual(8);
  });

  it('genera un PDF válido con varias páginas, con y sin ejecuciones guardadas', async () => {
    for (const withRuns of [false, true]) {
      const doc = buildReportDocument(await seededData(withRuns));
      const buffer = await pdfmake.createPdf(doc).getBuffer();
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      const pages = (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      expect(pages).toBeGreaterThanOrEqual(8);
      const out = process.env.REPORT_OUT;
      if (out && withRuns) {
        mkdirSync(out, { recursive: true });
        writeFileSync(resolve(out, 'informe-prueba.pdf'), buffer);
      }
    }
  }, 60000);

  it('advierte en el documento sobre datos simulados y parámetros aproximados', async () => {
    const doc = buildReportDocument(await seededData(false));
    const text = JSON.stringify(doc.content);
    expect(text).toMatch(/SINTÉTICOS/);
    expect(text).toMatch(/aproximación de campo/i);
    expect(text).toMatch(/hipotétic/i);
  });
});
