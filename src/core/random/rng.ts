/**
 * Generadores pseudoaleatorios reproducibles.
 *
 * - Mersenne Twister (MT19937): mismo algoritmo y misma siembra que
 *   `random.Random(semilla)` de Python. Esto permite reproducir número por
 *   número el notebook de Colab usado para simular el sábado 7 de noviembre.
 * - Congruencial lineal multiplicativo de Park y Miller (visto en clase):
 *   X(n+1) = 16807 · X(n) mod (2^31 − 1).
 */

export type GeneratorKind = 'mt19937' | 'lcg';

export const GENERATOR_LABEL: Record<GeneratorKind, string> = {
  mt19937: 'Mersenne Twister (igual a Python)',
  lcg: 'Congruencial lineal (Park–Miller)',
};

export interface Rng {
  readonly kind: GeneratorKind;
  /** Número uniforme en [0, 1). */
  next(): number;
}

const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

export class MersenneTwister implements Rng {
  readonly kind = 'mt19937' as const;
  private mt = new Uint32Array(N);
  private mti = N + 1;

  /** Acepta enteros no negativos de cualquier tamaño (igual que Python). */
  constructor(seed: number) {
    if (!Number.isFinite(seed)) throw new Error('La semilla debe ser un número finito');
    let n = Math.floor(Math.abs(seed));
    const key: number[] = [];
    if (n === 0) key.push(0);
    while (n > 0) {
      key.push(n % 0x100000000);
      n = Math.floor(n / 0x100000000);
    }
    this.initByArray(key);
  }

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = N;
  }

  private initByArray(key: number[]): void {
    this.initGenrand(19650218);
    const mt = this.mt;
    let i = 1;
    let j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0;
      i++;
      j++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }

  /** Entero sin signo de 32 bits. */
  nextUint32(): number {
    const mt = this.mt;
    let y: number;
    if (this.mti >= N) {
      let kk = 0;
      for (; kk < N - M; kk++) {
        y = (mt[kk] & UPPER_MASK) | (mt[kk + 1] & LOWER_MASK);
        mt[kk] = mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      for (; kk < N - 1; kk++) {
        y = (mt[kk] & UPPER_MASK) | (mt[kk + 1] & LOWER_MASK);
        mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      y = (mt[N - 1] & UPPER_MASK) | (mt[0] & LOWER_MASK);
      mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      this.mti = 0;
    }
    y = mt[this.mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** Igual que random.random() de Python: 53 bits de resolución. */
  next(): number {
    const a = this.nextUint32() >>> 5;
    const b = this.nextUint32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }
}

export class ParkMillerLcg implements Rng {
  readonly kind = 'lcg' as const;
  static readonly MODULUS = 2147483647;
  static readonly MULTIPLIER = 16807;
  private state: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) throw new Error('La semilla debe ser un número finito');
    let s = Math.floor(Math.abs(seed)) % ParkMillerLcg.MODULUS;
    if (s === 0) s = 1; // el estado 0 es absorbente
    this.state = s;
  }

  next(): number {
    // 16807 · (2^31 − 2) < 2^53: el producto es exacto en doble precisión.
    this.state = (this.state * ParkMillerLcg.MULTIPLIER) % ParkMillerLcg.MODULUS;
    return (this.state - 1) / (ParkMillerLcg.MODULUS - 1);
  }
}

export function createRng(kind: GeneratorKind, seed: number): Rng {
  return kind === 'lcg' ? new ParkMillerLcg(seed) : new MersenneTwister(seed);
}
