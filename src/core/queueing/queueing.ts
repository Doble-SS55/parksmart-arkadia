/**
 * Teoría de colas M/M/1 y M/M/s.
 *
 * Convención interna de unidades: todas las tasas se expresan en vehículos
 * por MINUTO y todos los tiempos en MINUTOS. La conversión a otras unidades
 * se hace solo para mostrar resultados (ver `convertRate` y `convertTime`).
 */

export type QueueModel = 'MM1' | 'MMS';
export type TimeUnit = 's' | 'min' | 'h';

export const TIME_UNIT_LABEL: Record<TimeUnit, string> = { s: 'segundos', min: 'minutos', h: 'horas' };

export interface QueueInput {
  model: QueueModel;
  /** Tasa de llegada λ (vehículos/min). */
  lambda: number;
  /** Tasa de servicio μ por servidor (vehículos/min). */
  mu: number;
  /** Número de servidores s. En M/M/1 debe ser 1. */
  servers: number;
}

export interface InvalidQueueResult {
  status: 'invalid';
  errors: string[];
}

export interface UnstableQueueResult {
  status: 'unstable';
  model: QueueModel;
  lambda: number;
  mu: number;
  servers: number;
  /** Carga ofrecida a = λ/μ (erlangs). */
  offeredLoad: number;
  rho: number;
  /** Capacidad máxima de atención s·μ (vehículos/min). */
  capacity: number;
  message: string;
}

export interface StableQueueResult {
  status: 'stable';
  model: QueueModel;
  lambda: number;
  mu: number;
  servers: number;
  offeredLoad: number;
  rho: number;
  capacity: number;
  p0: number;
  /** Probabilidad de que un vehículo tenga que esperar (Erlang C; en M/M/1 es ρ). */
  pWait: number;
  lq: number;
  l: number;
  /** Minutos. */
  wq: number;
  /** Minutos. */
  w: number;
  /** Ley de Little: L − λW (debe ser ~0). */
  littleResidual: number;
}

export type QueueResult = InvalidQueueResult | UnstableQueueResult | StableQueueResult;

export function validateQueueInput(input: QueueInput): string[] {
  const errors: string[] = [];
  const { lambda, mu, servers, model } = input;
  if (!Number.isFinite(lambda)) errors.push('La tasa de llegada λ no es un número válido.');
  else if (lambda < 0) errors.push('La tasa de llegada λ no puede ser negativa.');
  if (!Number.isFinite(mu)) errors.push('La tasa de servicio μ no es un número válido.');
  else if (mu < 0) errors.push('La tasa de servicio μ no puede ser negativa.');
  else if (mu === 0) errors.push('La tasa de servicio μ es cero: ningún vehículo podría ser atendido. Revise el tiempo promedio de servicio.');
  if (!Number.isFinite(servers)) errors.push('El número de servidores no es válido.');
  else if (!Number.isInteger(servers)) errors.push('El número de servidores debe ser un entero.');
  else if (servers < 1) errors.push('Debe haber al menos un servidor.');
  else if (servers > 200) errors.push('El número de servidores es demasiado grande para este análisis (máximo 200).');
  if (model === 'MM1' && Number.isInteger(servers) && servers !== 1) {
    errors.push('El modelo M/M/1 tiene exactamente un servidor. Use M/M/s para más barreras.');
  }
  return errors;
}

/**
 * Calcula las medidas de desempeño en estado estacionario.
 * Si ρ ≥ 1 no existe estado estacionario y no se devuelven valores finitos.
 */
export function solveQueue(input: QueueInput): QueueResult {
  const errors = validateQueueInput(input);
  if (errors.length) return { status: 'invalid', errors };

  const { lambda, mu, model } = input;
  const s = model === 'MM1' ? 1 : input.servers;
  const a = lambda / mu;
  const rho = a / s;
  const capacity = s * mu;

  if (rho >= 1) {
    return {
      status: 'unstable',
      model,
      lambda,
      mu,
      servers: s,
      offeredLoad: a,
      rho,
      capacity,
      message:
        `ρ = ${rho.toFixed(3)} ≥ 1: los vehículos llegan al menos tan rápido como pueden ser atendidos ` +
        `(λ = ${lambda.toFixed(3)} veh/min frente a s·μ = ${capacity.toFixed(3)} veh/min). ` +
        'El sistema no alcanza un equilibrio estacionario: la fila crece sin límite mientras se mantenga esta demanda, ' +
        'por lo que Lq, L, Wq y W no tienen un valor finito.',
    };
  }

  if (lambda === 0) {
    return {
      status: 'stable', model, lambda, mu, servers: s, offeredLoad: 0, rho: 0, capacity,
      p0: 1, pWait: 0, lq: 0, l: 0, wq: 0, w: 1 / mu, littleResidual: 0,
    };
  }

  let p0: number;
  let pWait: number;
  let lq: number;

  if (s === 1) {
    p0 = 1 - rho;
    pWait = rho;
    lq = (rho * rho) / (1 - rho);
  } else {
    // Σ_{n=0}^{s−1} aⁿ/n!  y  aˢ/s!  calculados de forma iterativa (estable numéricamente).
    let term = 1;
    let partial = 0;
    for (let n = 0; n < s; n++) {
      partial += term;
      term *= a / (n + 1);
    }
    const lastTerm = term / (1 - rho); // aˢ / (s! (1 − ρ))
    p0 = 1 / (partial + lastTerm);
    pWait = lastTerm * p0; // Erlang C
    lq = (pWait * rho) / (1 - rho);
  }

  const wq = lq / lambda;
  const w = wq + 1 / mu;
  const l = lambda * w;
  return {
    status: 'stable', model, lambda, mu, servers: s, offeredLoad: a, rho, capacity,
    p0, pWait, lq, l, wq, w, littleResidual: l - lambda * w,
  };
}

/** P(Wq > t) = C · e^(−(sμ − λ)t), con t en minutos. */
export function probWaitExceeds(result: StableQueueResult, tMinutes: number): number {
  if (result.lambda === 0) return 0;
  return result.pWait * Math.exp(-(result.capacity - result.lambda) * tMinutes);
}

/** Probabilidad de que haya exactamente n vehículos en el sistema. */
export function stateProbability(result: StableQueueResult, n: number): number {
  const { offeredLoad: a, servers: s, p0 } = result;
  if (n < 0 || !Number.isInteger(n)) return 0;
  let value = p0;
  for (let k = 1; k <= n; k++) value *= k <= s ? a / k : a / s;
  return value;
}

/** Tasa (por minuto) → tasa en la unidad pedida. */
export function convertRate(perMinute: number, unit: TimeUnit): number {
  return unit === 'h' ? perMinute * 60 : unit === 's' ? perMinute / 60 : perMinute;
}

/** Tiempo (en minutos) → tiempo en la unidad pedida. */
export function convertTime(minutes: number, unit: TimeUnit): number {
  return unit === 'h' ? minutes / 60 : unit === 's' ? minutes * 60 : minutes;
}

/** μ por servidor (veh/min) a partir del tiempo medio de servicio en segundos. */
export function serviceRateFromSeconds(meanServiceSeconds: number): number {
  return meanServiceSeconds > 0 ? 60 / meanServiceSeconds : 0;
}

export type SaturationRisk = 'bajo' | 'moderado' | 'alto' | 'critico';

export const RISK_LABEL: Record<SaturationRisk, string> = {
  bajo: 'Bajo',
  moderado: 'Moderado',
  alto: 'Alto',
  critico: 'Crítico (sin equilibrio)',
};

/** Umbrales convencionales de utilización usados en el informe. */
export function saturationRisk(rho: number): SaturationRisk {
  if (rho >= 1) return 'critico';
  if (rho >= 0.85) return 'alto';
  if (rho >= 0.7) return 'moderado';
  return 'bajo';
}
