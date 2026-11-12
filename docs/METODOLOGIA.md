# Metodología matemática

Convención de unidades: internamente todas las tasas están en **vehículos por minuto** y todos los tiempos en **minutos**. La interfaz solo convierte para mostrar (s, min, h).

## 1. Tasa de llegada

Para una barrera (acceso + dirección) y un periodo de *n* intervalos de 5 minutos:

- λ promedio = vehículos contados / (5·*n*) veh/min.
- λ pico = conteo del intervalo con más llegadas / 5 veh/min.

La tasa de salida observada **no** se usa como λ de la entrada ni como μ. Para una barrera de salida, sus llegadas se aproximan con los vehículos contados saliendo (supuesto explícito en la app).

## 2. Tasa de servicio

μ = 60 / tiempo medio de atención en segundos (veh/min por barrera). Con 5 s, μ = 12 veh/min.

## 3. M/M/1

ρ = λ/μ · P₀ = 1 − ρ · Lq = ρ²/(1 − ρ) · Wq = Lq/λ · W = Wq + 1/μ · L = λW · P(esperar) = ρ.

## 4. M/M/s

a = λ/μ · ρ = λ/(sμ)

P₀ = [ Σₙ₌₀^(s−1) aⁿ/n! + aˢ/(s!(1 − ρ)) ]⁻¹

C(s, a) = aˢ/(s!(1 − ρ)) · P₀ (Erlang C, probabilidad de esperar)

Lq = C·ρ/(1 − ρ) · Wq = Lq/λ · W = Wq + 1/μ · L = λW

P(Wq > t) = C·e^(−(sμ − λ)t)

Los términos aⁿ/n! se calculan de forma iterativa para evitar factoriales grandes.

**Validaciones**: λ < 0, μ ≤ 0, s no entero o < 1, M/M/1 con s ≠ 1 y valores no numéricos se rechazan con un mensaje. Si **ρ ≥ 1** el sistema no tiene estado estacionario: la app no muestra Lq, L, Wq ni W finitos y explica que la fila crece sin límite. Si **λ = 0**: P₀ = 1, Lq = Wq = L = 0 y W = 1/μ, sin divisiones por cero.

**Riesgo de saturación** (convención del informe): bajo ρ < 0,70; moderado 0,70–0,85; alto 0,85–1; crítico ρ ≥ 1.

## 5. Supuesto de Poisson

Índice de dispersión D = s²/x̄ de los conteos por intervalo. Bajo Poisson, (n − 1)·D ~ χ²(n − 1). Valor p bilateral con la gamma incompleta regularizada. D > 1 significativo = sobredispersión (demanda que cambia en el tiempo).

## 6. Montecarlo

Para cada simulación, flujo e intervalo *i*:

λᵢ = baseᵢ · factor · (1 + A·sen(iπ/P)) · bᵢ, con bᵢ = f con probabilidad q (baja actividad) o 1.

Nᵢ ~ Poisson(λᵢ): método de Knuth para λ < 30 y PTRS de Hörmann para λ ≥ 30.

Generadores reproducibles con semilla:

- **Mersenne Twister MT19937** con la misma siembra (`init_by_array`) y el mismo `random()` de 53 bits que Python. Verificado contra Python y contra el notebook.
- **Congruencial de Park–Miller**: Xₙ₊₁ = 16807·Xₙ mod (2³¹ − 1); verificado con el valor de control X₁₀₀₀₀ = 1 043 618 065.

Resultados: media, desviación estándar, mínimo, máximo, percentiles P5–P95 (interpolación lineal, como PERCENTIL.INC), IC 95 % de la media (x̄ ± 1,96·s/√n), intervalo empírico del 90 %, P(total > umbral) y P(algún intervalo > umbral).

**Capacidad**: si se configura *c* vehículos por intervalo, atendidos = min(pendientes + llegadas, c) y el resto pasa al siguiente intervalo. Ningún vehículo se descarta: llegadas = atendidos + pendientes.

### Escenario de referencia del sábado (notebook)

Semilla 20261107; aumentos E70 1,25 · S70 1,15 · E80 1,30 · S80 1,20; A = 0,10; P = 12; q = 0,045; f = 0,18; base 18:00–19:30 del viernes y 19:30–20:00 extrapolado con la media de 19:00–19:30; tope = ⌊1,35·máximo del viernes⌋. La app reproduce **los 96 valores** del CSV entregado. El tope del notebook recorta vehículos (supuesto, no capacidad física); el motor general de la app no recorta.

## 7. Eventos discretos

Eventos: llegada, inicio de servicio, fin de servicio, liberación de barrera y asignación del siguiente en fila. Cola de prioridad por (tiempo, secuencia). Llegadas con tiempos entre llegadas exponenciales de media 1/λ; atención exponencial (M/M/s), uniforme (mín–máx observado) o constante.

Cada vehículo registra llegada, inicio, fin, espera (inicio − llegada) y tiempo en el sistema. Las integrales de tiempo (fila y barreras ocupadas) se acumulan solo en los eventos, de modo que avanzar en pasos pequeños (pausar y reanudar) produce exactamente el mismo resultado que avanzar de una vez. La velocidad de la animación solo decide hasta qué instante simulado se avanza.

Utilización observada = tiempo ocupado / (s · reloj). En corridas largas coincide con la teoría M/M/s (verificado en las pruebas: error < 8 % en Wq y < 0,02 en ρ).

## 8. Escenarios

Cada acceso se evalúa como un sistema M/M/s independiente con la demanda promedio y la del intervalo pico. Se reportan diferencias absolutas y porcentuales frente al viernes observado. Las barreras por encima de las existentes se etiquetan como hipotéticas y ningún escenario se presenta como implementado.
