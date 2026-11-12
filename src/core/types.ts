/**
 * Tipos de dominio de ParkSmart Arkadia.
 * Estos tipos no dependen de React ni del navegador: los usan el motor
 * matemático, los repositorios, la interfaz y las pruebas.
 */

export type AccessId = 'C70' | 'C80';
export type Direction = 'entrada' | 'salida';

/**
 * Origen de un registro. Regla del proyecto: los datos observados y los
 * simulados nunca se mezclan sin etiqueta.
 */
export type RecordOrigin = 'observado' | 'simulado' | 'manual';

/** Identificador corto de un flujo: E70, S70, E80, S80. */
export type FlowId = 'E70' | 'S70' | 'E80' | 'S80';

export interface FlowKey {
  access: AccessId;
  direction: Direction;
}

export const ACCESSES: readonly AccessId[] = ['C70', 'C80'];
export const DIRECTIONS: readonly Direction[] = ['entrada', 'salida'];
export const FLOW_IDS: readonly FlowId[] = ['E70', 'S70', 'E80', 'S80'];

export const ACCESS_LABEL: Record<AccessId, string> = {
  C70: 'Carrera 70',
  C80: 'Carrera 80',
};

export const FLOW_LABEL: Record<FlowId, string> = {
  E70: 'Entrada 70',
  S70: 'Salida 70',
  E80: 'Entrada 80',
  S80: 'Salida 80',
};

export const ORIGIN_LABEL: Record<RecordOrigin, string> = {
  observado: 'Observado en campo',
  simulado: 'Simulado',
  manual: 'Ingresado manualmente',
};

export function flowId(access: AccessId, direction: Direction): FlowId {
  return `${direction === 'entrada' ? 'E' : 'S'}${access === 'C70' ? '70' : '80'}` as FlowId;
}

export function flowKey(id: FlowId): FlowKey {
  return {
    direction: id.startsWith('E') ? 'entrada' : 'salida',
    access: id.endsWith('70') ? 'C70' : 'C80',
  };
}

export interface Dataset {
  id: number;
  name: string;
  /** Fecha del conjunto en formato YYYY-MM-DD. */
  date: string;
  kind: RecordOrigin;
  sourceFile: string | null;
  description: string | null;
  intervalMinutes: number;
  /** Conjunto observado usado como referencia (trazabilidad de simulaciones). */
  referenceDatasetId: number | null;
  montecarloRunId: number | null;
  isSeed: boolean;
  createdAt: string;
  recordCount?: number;
}

export interface VehicleRecord {
  id: number;
  datasetId: number;
  date: string;
  /** HH:MM */
  startTime: string;
  /** HH:MM */
  endTime: string;
  access: AccessId;
  direction: Direction;
  count: number;
  origin: RecordOrigin;
  simulationId: string | null;
  notes: string | null;
}

export type NewVehicleRecord = Omit<VehicleRecord, 'id'>;

/** Procedencia de un parámetro de servicio o de servidores. */
export type ParameterSource = 'confirmado' | 'aproximado' | 'hipotetico' | 'sin_dato';

export const PARAMETER_SOURCE_LABEL: Record<ParameterSource, string> = {
  confirmado: 'Confirmado en campo',
  aproximado: 'Aproximación de campo',
  hipotetico: 'Hipotético',
  sin_dato: 'Sin dato (valor provisional)',
};

export interface ServerConfig {
  access: AccessId;
  direction: Direction;
  /** Barreras existentes en el acceso para esa dirección. */
  existingServers: number;
  serversSource: ParameterSource;
  /** Tiempo medio de atención por vehículo, en segundos. */
  meanServiceSeconds: number;
  serviceMinSeconds: number | null;
  serviceMaxSeconds: number | null;
  serviceSource: ParameterSource;
  notes: string | null;
}

export interface Issue {
  level: 'error' | 'advertencia';
  message: string;
  /** Fila del archivo (1 = encabezado) o id de registro, si aplica. */
  row?: number;
}
