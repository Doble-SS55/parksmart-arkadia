# ParkSmart Arkadia

Aplicación web, pensada primero para celular, para el **modelamiento y la simulación estocástica del flujo vehicular** en los accesos al parqueadero del Centro Comercial Arkadia (Medellín), por la carrera 70 y la carrera 80.

Reto 3 · Modelamiento y Simulación Computacional · Santiago Solís, Juan Fernando Gómez Ocampo.

El sitio tiene dos partes:

- **`/`**: la aplicación (la misma que trae la APK).
- **`/presentacion/`**: página de presentación del proyecto (cómo lo trabajamos, evidencias de la toma de datos, resultados y plan de mejoramiento, con cifras calculadas por el mismo motor de la app). Código en `src/landing/` y `presentacion/index.html`.

La aplicación incluye:

- **Datos**: importación de Excel (.xlsx) y CSV, registro manual, edición, eliminación con confirmación, filtros, validación de duplicados, huecos e intervalos incompletos, y exportación a CSV.
- **Teoría de colas** M/M/1 y M/M/s con fórmulas, valores sustituidos, Erlang C, ley de Little, prueba del supuesto de Poisson y sensibilidad al número de barreras.
- **Montecarlo** reproducible con semilla (Mersenne Twister idéntico a Python o congruencial de Park–Miller), percentiles, intervalos, probabilidades de superar umbrales, capacidad con fila acumulada y **reproducción exacta del notebook del sábado** (96 de 96 valores).
- **Simulador visual de eventos discretos** con barreras, fila compartida, controles de reproducción y comparación con la teoría.
- **Comparador de escenarios** (viernes observado, sábado simulado, 1–3 barreras, cambios de demanda, de atención y de reparto entre accesos) que distingue barreras existentes de hipotéticas.
- **Informe PDF** académico descargable con portada, índice, paginación, gráficos, tablas, interpretación, limitaciones, conclusiones y recomendaciones.
- **Base de datos SQLite** dentro del navegador (persistente) y funcionamiento **sin conexión** (PWA instalable).

## Datos de partida

| Conjunto | Origen | Archivo |
|---|---|---|
| Viernes 6 nov 2026, 17:30–19:30 | **Observado en campo** | `data-fuente/datos del 6 nov.xlsx` |
| Sábado 7 nov 2026, 18:00–20:00 | **Simulado** (Montecarlo) | `data-fuente/arkadia_sabado_7_simulado.csv`, generado por `data-fuente/Arkadia_Montecarlo_Colab.ipynb` |

La app trae ambos conjuntos cargados (generados con `scripts/build_seed.py`, que lee los archivos originales). Los observados y los simulados se distinguen en toda la app, la base de datos, los gráficos (sólido / punteado) y el informe.

**Parámetros de campo** (configurables en *Colas › Parámetros de las barreras*):

| Parámetro | Valor | Procedencia |
|---|---|---|
| Barreras de entrada por acceso | 2 | Confirmado por el equipo (2 carriles de entrada) |
| Tiempo de atención | 5 s (rango 4–6 s) | Aproximación de campo: subida de barrera. Falta confirmar si incluye todo el ciclo |
| Barreras de salida | 1 | Sin dato (valor provisional) |

## Ejecutar en el computador

Requisitos: **Node.js 20 o superior** (incluye npm).

```bash
npm install
npm run dev        # http://localhost:5173 (aplicación) y http://localhost:5173/presentacion/ (presentación)
```

Para verla en el celular en la misma red Wi-Fi: `npm run dev -- --host` y abrir en el teléfono la dirección "Network" que muestra la consola.

## Publicar en la web

```bash
npm run build      # genera la carpeta dist/
```

`dist/` es un sitio estático y usa rutas relativas, así que funciona en cualquier hosting:

- **Firebase Hosting** (configurado): ver [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).
- También sirve en Netlify, Vercel o GitHub Pages subiendo la carpeta `dist`.

Una vez publicada, en el celular se puede **instalar** desde el menú del navegador ("Agregar a pantalla de inicio" / "Instalar app"). Funciona sin internet después de la primera visita.


## App Android (APK) y publicación en Google Cloud

El mismo código se empaqueta como APK con **Capacitor** (carpeta `android/`) y la web se publica en **Firebase Hosting**, igual que MAC-TEA-front. GitHub Actions (`.github/workflows/ci-cd.yml`) hace todo en cada `push`: pruebas, web, APK y publicación. La APK se publica en GitHub Releases y la web la ofrece con un botón y un código QR (el plan gratuito de Firebase no admite archivos .apk).

Pasos completos (crear el repositorio, conectar Firebase, instalar la APK, firma para Google Play): **[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)**.

## Pruebas

```bash
npm test           # 76 pruebas unitarias y de integración (Vitest)
npm run build
npm run e2e        # 30 verificaciones de extremo a extremo en Chrome (necesita Chrome; CHROME_PATH si no lo encuentra)
npm run check      # tipos + pruebas + compilación
```

Cubren: M/M/1 y M/M/s con valores de libro, ρ ≥ 1, λ = 0, entradas inválidas y ley de Little; generador idéntico a Python y reproducción del notebook; reproducibilidad, conteos no negativos y conservación de vehículos en Montecarlo; servidores sin solapamiento, tiempos no negativos, balance y pausa/reanudación idénticas en eventos discretos; importación del Excel original y de CSV con errores; SQLite (migraciones, transacciones, cascadas, persistencia); separación observado/simulado; escenarios; PDF; y, en el navegador, navegación, formularios, importación, descarga del PDF, persistencia al reabrir y modo sin conexión.

## Estructura

```
src/
  core/          motor matemático y de simulación (sin React): colas, Montecarlo,
                 eventos discretos, generadores, escenarios, importación, estadística
  db/            SQLite: interfaz, migraciones, repositorios, datos semilla
  services/      casos de uso (conjuntos, informe)
  platform/      navegador y APK: IndexedDB, descargas/compartir, PDF
  state/         proveedor de base de datos y selección compartida
  components/    interfaz reutilizable y gráficos SVG
  pages/         pantallas
  landing/       página de presentación del proyecto (/presentacion/)
  styles/        sistema visual
tests/           pruebas Vitest        tests-e2e/  prueba de extremo a extremo
docs/            ARQUITECTURA.md, METODOLOGIA.md, DESPLIEGUE.md
android/         proyecto Android generado por Capacitor (ícono, colores, firma)
.github/         flujo de GitHub Actions: pruebas, APK y Firebase
public/evidencias/  fotos de la toma de datos
data-fuente/     archivos originales del estudio
scripts/         build_seed.py
```

Más detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) y [docs/METODOLOGIA.md](docs/METODOLOGIA.md).

## Limitaciones conocidas

- Un solo día observado y dos horas de registro.
- El tiempo de atención es una aproximación (subida de barrera); cronometrar el ciclo completo cambiaría los resultados de espera.
- M/M/s supone llegadas Poisson y atención exponencial en estado estacionario.
- Los datos del sábado son sintéticos.
- Los datos viven en el navegador de cada dispositivo; para pasarlos a otro equipo use *Informe › Descargar respaldo (.sqlite)*.
