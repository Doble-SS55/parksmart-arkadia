# Arquitectura

## Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Plataforma | Aplicación web responsive + PWA (React 19, TypeScript estricto, Vite) | Decisión del equipo: más simple de publicar y usar desde el celular. Instalable y sin conexión |
| Navegación | `react-router-dom` con `HashRouter` | Funciona en cualquier hosting estático sin reglas de redirección |
| Base de datos | SQLite (sql.js, WebAssembly) persistido en IndexedDB | Se conserva el modelo relacional, las migraciones y las transacciones; los datos sobreviven a cerrar el navegador |
| Gráficos | Componentes SVG propios | Sin dependencias pesadas; los mismos componentes se usan en pantalla y en el PDF |
| PDF | pdfmake (cargado bajo demanda) | PDF de texto real con tablas, índice, paginación y SVG; descarga directa |
| Importación | Lector .xlsx propio sobre `fflate` + parser CSV | Lee el valor guardado de celdas con fórmula (el Excel del viernes las tiene) sin librerías grandes |
| Pruebas | Vitest + sql.js en Node; Puppeteer con Chrome para extremo a extremo | Prueban el mismo código y la misma base que corre en el navegador |

## Capas

```
pages/  ──►  services/  ──►  core/   (matemática pura, sin React ni navegador)
   │             │
   │             └──►  db/repositories  ──►  db/db (interfaz Db)  ──►  sql.js
   └──►  components/ (ui, gráficos)
state/DbProvider: abre la base, migra, siembra, persiste en IndexedDB y notifica cambios
```

- `core/` no importa React ni APIs del navegador: se prueba directamente en Node.
- Los repositorios reciben un `Db` (interfaz mínima `exec/run/all/first/transaction`); en la app es sql.js sobre IndexedDB y en las pruebas sql.js en memoria.
- Cada escritura confirmada incrementa una revisión; `useQuery` recalcula las consultas que dependen de ella. El archivo SQLite se guarda en IndexedDB 250 ms después del último cambio.

## Esquema SQLite (migración 1)

| Tabla | Contenido |
|---|---|
| `accesses` | C70 y C80 |
| `datasets` | Conjuntos: nombre, fecha, `kind` (observado / simulado / manual), archivo fuente, `reference_dataset_id` y `montecarlo_run_id` para trazabilidad |
| `vehicle_records` | Conteo por intervalo: fecha, hora inicial y final, acceso, dirección, cantidad (≥ 0), origen, id de simulación, observaciones. Único por (conjunto, fecha, hora, acceso, dirección). Se borra en cascada con el conjunto |
| `server_configs` | Barreras existentes y tiempo de atención por acceso y dirección, con su procedencia (confirmado, aproximado, hipotético, sin dato) |
| `montecarlo_runs` | Parámetros y resumen estadístico de cada ejecución |
| `queue_results` | Resultados M/M/1 y M/M/s guardados |
| `scenarios` | Comparaciones de escenarios guardadas |
| `simulation_runs`, `simulation_vehicles`, `simulation_events` | Corridas de eventos discretos con tiempos individuales y bitácora de eventos |
| `reports` | Informes generados |
| `settings` | Portada del informe y versión de la semilla |

La versión del esquema se guarda en `PRAGMA user_version`; las migraciones nuevas se agregan al final de `src/db/migrations.ts`.

## Separación de datos observados y simulados

- Columna `kind` en `datasets` y `origin` en cada registro (restricción `CHECK`).
- Un registro hereda el origen de su conjunto; editar un conjunto simulado no lo vuelve observado.
- Los conjuntos sintéticos generados por Montecarlo guardan el conjunto base y la ejecución que los produjo.
- Interfaz: insignia "Observado" sólida e insignia "Simulado" rayada; trazos sólidos y punteados; aviso en pantallas que usan datos simulados.
- Informe: secciones y avisos separados, con advertencia de datos sintéticos.
