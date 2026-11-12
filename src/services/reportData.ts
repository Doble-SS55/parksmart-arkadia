import { estimateArrivalRate, type ArrivalEstimate, type DatasetSummary, type FlowSeries } from '../core/data/aggregate';
import type { DesMetrics, DesConfig } from '../core/des/engine';
import { reproduceNotebookSaturday } from '../core/montecarlo/notebookReference';
import { dispersionTest, type DispersionTest } from '../core/queueing/poissonCheck';
import { saturationRisk, serviceRateFromSeconds, solveQueue, type QueueResult, type SaturationRisk } from '../core/queueing/queueing';
import { buildPresetScenarios, evaluateScenario, type ScenarioResult } from '../core/scenarios/compare';
import { FLOW_IDS, flowId, type AccessId, type Dataset, type Direction, type ServerConfig } from '../core/types';
import type { Db } from '../db/db';
import {
  datasetsRepo,
  montecarloRepo,
  queueResultsRepo,
  serverConfigRepo,
  settingsRepo,
  simulationRepo,
  type MonteCarloRunRecord,
  type QueueResultRecord,
  type SimulationRunRecord,
} from '../db/repositories';
import { entryDemand, getSummary } from './datasets';

export interface ReportOptions {
  observedDatasetId: number;
  simulatedDatasetId: number | null;
  includeExits: boolean;
  includeAnnex: boolean;
}

export interface QueueRow {
  access: AccessId;
  direction: Direction;
  config: ServerConfig;
  estimate: ArrivalEstimate;
  avg: QueueResult;
  peak: QueueResult;
  risk: SaturationRisk;
  peakRisk: SaturationRisk;
  dispersion: DispersionTest;
}

export interface DatasetBlock {
  dataset: Dataset;
  series: FlowSeries;
  summary: DatasetSummary;
  reference: Dataset | null;
}

export interface ReportData {
  generatedAt: Date;
  team: string[];
  course: string;
  teacher: string;
  institution: string;
  observed: DatasetBlock;
  simulated: DatasetBlock | null;
  configs: ServerConfig[];
  queues: QueueRow[];
  savedQueueResults: QueueResultRecord[];
  montecarlo: MonteCarloRunRecord | null;
  notebook: { matches: number; total: number; truncations: number; totals: number[] } | null;
  scenarios: ScenarioResult[];
  simulation: SimulationRunRecord<DesConfig, DesMetrics> | null;
  options: ReportOptions;
}

function block(db: Db, dataset: Dataset): DatasetBlock {
  const { series, summary } = getSummary(db, dataset.id);
  return {
    dataset,
    series,
    summary,
    reference: dataset.referenceDatasetId ? datasetsRepo.get(db, dataset.referenceDatasetId) : null,
  };
}

/** Reúne todo lo que necesita el informe a partir del estado actual de la base de datos. */
export function buildReportData(db: Db, options: ReportOptions): ReportData {
  const observedDs = datasetsRepo.get(db, options.observedDatasetId);
  if (!observedDs) throw new Error('El conjunto observado elegido no existe.');
  const simulatedDs = options.simulatedDatasetId ? datasetsRepo.get(db, options.simulatedDatasetId) : null;
  const observed = block(db, observedDs);
  const simulated = simulatedDs ? block(db, simulatedDs) : null;
  const configs = serverConfigRepo.list(db);

  const queues: QueueRow[] = [];
  for (const access of ['C70', 'C80'] as AccessId[]) {
    for (const direction of (options.includeExits ? ['entrada', 'salida'] : ['entrada']) as Direction[]) {
      const config = configs.find((c) => c.access === access && c.direction === direction);
      if (!config) continue;
      const estimate = estimateArrivalRate(observed.series, flowId(access, direction));
      const mu = serviceRateFromSeconds(config.meanServiceSeconds);
      const model = config.existingServers === 1 ? 'MM1' : 'MMS';
      const avg = solveQueue({ model, lambda: estimate.lambdaPerMin, mu, servers: config.existingServers });
      const peak = solveQueue({ model, lambda: estimate.peakLambdaPerMin, mu, servers: config.existingServers });
      const rho = (r: QueueResult) => (r.status === 'invalid' ? Infinity : r.rho);
      queues.push({
        access, direction, config, estimate, avg, peak,
        risk: saturationRisk(rho(avg)), peakRisk: saturationRisk(rho(peak)),
        dispersion: dispersionTest(estimate.counts),
      });
    }
  }

  let notebook: ReportData['notebook'] = null;
  if (observed.series.starts.length === 24 && simulated) {
    try {
      const matrix = observed.series.starts.map((_, i) => FLOW_IDS.map((f) => observed.series.values[f][i]));
      const nb = reproduceNotebookSaturday(matrix);
      let matches = 0;
      nb.rows.forEach((row) => {
        const idx = simulated.series.starts.indexOf(row.start);
        FLOW_IDS.forEach((f, j) => {
          if (idx >= 0 && simulated.series.values[f][idx] === row.values[j]) matches++;
        });
      });
      notebook = { matches, total: nb.rows.length * 4, truncations: nb.truncations.length, totals: nb.totals };
    } catch {
      notebook = null;
    }
  }

  const entry = (a: AccessId) => configs.find((c) => c.access === a && c.direction === 'entrada');
  const scenarios = buildPresetScenarios({
    friday: entryDemand(observed.series),
    saturday: simulated ? entryDemand(simulated.series) : null,
    existingServers: { C70: entry('C70')?.existingServers ?? 1, C80: entry('C80')?.existingServers ?? 1 },
    serviceSeconds: entry('C80')?.meanServiceSeconds ?? 5,
    serviceIsApproximate: entry('C80')?.serviceSource !== 'confirmado',
    demandIncreases: [0.1, 0.25],
    serviceReduction: 0.2,
    redistribution: 0.2,
  }).map(evaluateScenario);

  return {
    generatedAt: new Date(),
    team: (settingsRepo.get(db, 'team') ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
    course: settingsRepo.get(db, 'course') ?? '',
    teacher: settingsRepo.get(db, 'teacher') ?? '',
    institution: settingsRepo.get(db, 'institution') ?? '',
    observed,
    simulated,
    configs,
    queues,
    savedQueueResults: queueResultsRepo.list(db).slice(0, 6),
    montecarlo: montecarloRepo.list(db)[0] ?? null,
    notebook,
    scenarios,
    simulation: simulationRepo.list<DesConfig, DesMetrics>(db)[0] ?? null,
    options,
  };
}
