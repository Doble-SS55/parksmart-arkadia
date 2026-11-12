import { fmt } from '../format';
import { convertRate, convertTime, type StableQueueResult, type TimeUnit, type UnstableQueueResult } from './queueing';

export interface FormulaLine {
  symbol: string;
  name: string;
  expression: string;
  substituted: string;
}

const U: Record<TimeUnit, string> = { s: 's', min: 'min', h: 'h' };

/** Fórmulas del modelo con los valores numéricos reemplazados, en la unidad pedida. */
export function formulaLines(r: StableQueueResult | UnstableQueueResult, unit: TimeUnit): FormulaLine[] {
  const lam = convertRate(r.lambda, unit);
  const mu = convertRate(r.mu, unit);
  const s = r.servers;
  const rate = `veh/${U[unit]}`;
  const lines: FormulaLine[] = [
    { symbol: 'λ', name: 'Tasa de llegada', expression: 'λ = vehículos que llegan / duración del periodo', substituted: `λ = ${fmt(lam, 4)} ${rate}` },
    { symbol: 'μ', name: 'Tasa de servicio por barrera', expression: 'μ = 1 / tiempo medio de atención', substituted: `μ = ${fmt(mu, 4)} ${rate}` },
  ];
  if (s === 1) {
    lines.push({ symbol: 'ρ', name: 'Utilización', expression: 'ρ = λ / μ', substituted: `ρ = ${fmt(lam, 4)} / ${fmt(mu, 4)} = ${fmt(r.rho, 4)}` });
  } else {
    lines.push(
      { symbol: 'a', name: 'Carga ofrecida (erlangs)', expression: 'a = λ / μ', substituted: `a = ${fmt(lam, 4)} / ${fmt(mu, 4)} = ${fmt(r.offeredLoad, 4)}` },
      { symbol: 'ρ', name: 'Utilización por barrera', expression: 'ρ = λ / (s·μ)', substituted: `ρ = ${fmt(lam, 4)} / (${s} · ${fmt(mu, 4)}) = ${fmt(r.rho, 4)}` },
    );
  }
  if (r.status === 'unstable') {
    lines.push({
      symbol: 'ρ ≥ 1',
      name: 'Condición de estabilidad',
      expression: 'Se requiere ρ < 1 para que exista estado estacionario',
      substituted: `ρ = ${fmt(r.rho, 4)} ≥ 1 → Lq, L, Wq y W no tienen valor finito`,
    });
    return lines;
  }
  const wq = convertTime(r.wq, unit);
  const w = convertTime(r.w, unit);
  if (s === 1) {
    lines.push(
      { symbol: 'P₀', name: 'Probabilidad de sistema vacío', expression: 'P₀ = 1 − ρ', substituted: `P₀ = 1 − ${fmt(r.rho, 4)} = ${fmt(r.p0, 4)}` },
      { symbol: 'Lq', name: 'Vehículos promedio en fila', expression: 'Lq = ρ² / (1 − ρ)', substituted: `Lq = ${fmt(r.rho, 4)}² / (1 − ${fmt(r.rho, 4)}) = ${fmt(r.lq, 4)}` },
    );
  } else {
    lines.push(
      {
        symbol: 'P₀',
        name: 'Probabilidad de sistema vacío',
        expression: 'P₀ = [ Σₙ₌₀^(s−1) aⁿ/n! + aˢ / (s!·(1 − ρ)) ]⁻¹',
        substituted: `P₀ = ${fmt(r.p0, 6)}`,
      },
      {
        symbol: 'C(s,a)',
        name: 'Probabilidad de esperar (Erlang C)',
        expression: 'C = aˢ / (s!·(1 − ρ)) · P₀',
        substituted: `C = ${fmt(r.pWait, 4)}`,
      },
      {
        symbol: 'Lq',
        name: 'Vehículos promedio en fila',
        expression: 'Lq = C · ρ / (1 − ρ)',
        substituted: `Lq = ${fmt(r.pWait, 4)} · ${fmt(r.rho, 4)} / (1 − ${fmt(r.rho, 4)}) = ${fmt(r.lq, 4)}`,
      },
    );
  }
  lines.push(
    { symbol: 'Wq', name: 'Espera promedio en fila', expression: 'Wq = Lq / λ', substituted: `Wq = ${fmt(r.lq, 4)} / ${fmt(lam, 4)} = ${fmt(wq, 4)} ${U[unit]}` },
    { symbol: 'W', name: 'Tiempo promedio en el sistema', expression: 'W = Wq + 1/μ', substituted: `W = ${fmt(wq, 4)} + 1/${fmt(mu, 4)} = ${fmt(w, 4)} ${U[unit]}` },
    { symbol: 'L', name: 'Vehículos promedio en el sistema', expression: 'L = λ · W  (ley de Little)', substituted: `L = ${fmt(lam, 4)} · ${fmt(w, 4)} = ${fmt(r.l, 4)}` },
  );
  return lines;
}

export const VARIABLE_GLOSSARY: [string, string][] = [
  ['λ', 'Tasa media de llegada de vehículos a la barrera (vehículos por unidad de tiempo).'],
  ['μ', 'Tasa media de atención de UNA barrera: 1 / tiempo medio de servicio.'],
  ['s', 'Número de barreras que atienden en paralelo con una fila compartida.'],
  ['a', 'Carga ofrecida λ/μ: cuántas barreras estarían ocupadas en promedio.'],
  ['ρ', 'Utilización de cada barrera, λ/(s·μ). Debe ser menor que 1 para que la fila no crezca sin límite.'],
  ['P₀', 'Probabilidad de que no haya ningún vehículo en el sistema.'],
  ['C', 'Probabilidad de que un vehículo que llega tenga que esperar (fórmula de Erlang C).'],
  ['Lq', 'Número promedio de vehículos esperando en fila (sin contar los que están en la barrera).'],
  ['L', 'Número promedio de vehículos en el sistema (en fila + en atención).'],
  ['Wq', 'Tiempo promedio que un vehículo espera en fila antes de llegar a la barrera.'],
  ['W', 'Tiempo promedio total desde que llega hasta que pasa la barrera.'],
];
