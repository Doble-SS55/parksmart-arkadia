/**
 * Prueba funcional de extremo a extremo sobre la versión de producción.
 *
 * Requisitos: haber corrido `npm run build` y tener Chrome o Chromium instalado.
 * Uso:  CHROME_PATH=/ruta/a/chrome npm run e2e
 *
 * Levanta `vite preview`, abre la app como un teléfono (390 × 844) y recorre los
 * criterios de aceptación: navegación, formularios, importación, Montecarlo
 * reproducible, simulador, informe PDF, persistencia al reabrir y modo sin conexión.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = resolve(import.meta.dirname, '..');
const chrome = process.env.CHROME_PATH
  ?? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if (!chrome) throw new Error('No se encontró Chrome. Defina CHROME_PATH.');
if (!existsSync(join(root, 'dist/index.html'))) throw new Error('Primero ejecute npm run build.');

const PORT = 4321;
const BASE = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const downloads = mkdtempSync(join(tmpdir(), 'psa-dl-'));
const browser = await puppeteer.launch({
  executablePath: chrome, headless: true, args: ['--no-sandbox'], userDataDir: mkdtempSync(join(tmpdir(), 'psa-profile-')),
});
const errors = [];
async function open(path, { landing = false } = {}) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text()) && errors.push(m.text()));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await page.goto(BASE + (landing ? 'presentacion/' : '') + path, { waitUntil: 'networkidle0' });
  await sleep(900);
  return page;
}
const text = (page) => page.evaluate(() => document.body.innerText);
const click = (page, label) =>
  page.evaluate((l) => {
    const all = [...document.querySelectorAll('button, a')].filter((b) => !b.disabled);
    const el = all.find((b) => b.textContent.trim() === l) ?? all.find((b) => b.textContent.trim().includes(l));
    if (!el) throw new Error(`No se encontró "${l}"`);
    el.click();
  }, label);
const setValue = (page, selector, value) =>
  page.evaluate((s, v) => {
    const el = document.querySelector(s);
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);

try {
  // 0. Página de presentación en /presentacion/
  let landing = await open('', { landing: true });
  const lt = await text(landing);
  check('Landing: secciones del proyecto', ['Cómo lo trabajamos', 'Evidencias de la toma de datos', 'Lo que encontramos', 'Plan de mejoramiento', 'La aplicación'].every((s) => lt.includes(s)));
  await landing.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await landing.evaluate(() => Promise.all([...document.images].map((i) => (i.loading = 'eager', i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))));
  check('Landing: fotos de evidencia cargadas', await landing.evaluate(() => [...document.querySelectorAll('.l-photo img')].filter((i) => i.naturalWidth > 0).length === 3));
  check('Landing: sin desborde horizontal en el celular', await landing.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('Landing: enlace a la app', await landing.evaluate(() => [...document.querySelectorAll('a')].some((a) => a.href === location.origin + '/')));
  await landing.close();

  // 1. Dashboard con datos del viernes y del sábado
  let page = await open('');
  let t = await text(page);
  check('Dashboard muestra el viernes observado', t.includes('856') && t.includes('709') && t.includes('Observado en campo'));
  await page.select('select', String((await page.$$eval('select option', (o) => o.map((x) => [x.value, x.textContent]))).find(([, l]) => l.includes('Sábado'))[0]));
  await sleep(500);
  t = await text(page);
  check('Dashboard muestra el sábado como simulado', t.includes('1.046') && t.includes('Está viendo datos simulados'));

  // 2. Navegación por todas las secciones
  for (const [path, marker] of [['#/datos', 'Datos vehiculares'], ['#/colas', 'Teoría de colas'], ['#/colas/escenarios', 'Indicadores por escenario'], ['#/simular', 'Montecarlo'], ['#/simular/visual', 'Simulador visual'], ['#/informe', 'Informe PDF']]) {
    await page.evaluate((p) => (location.hash = p), path);
    await sleep(700);
    check(`Navega a ${path}`, (await text(page)).includes(marker));
  }

  // 3. Formulario: validación y registro manual
  await page.evaluate(() => (location.hash = '#/datos/registro/nuevo'));
  await sleep(600);
  await click(page, 'Guardar registro');
  await sleep(300);
  check('El formulario valida campos vacíos', (await text(page)).includes('Ingrese la cantidad de vehículos'));
  await setValue(page, '#rf-date', '2026-11-13');
  await setValue(page, '#rf-start', '18:00');
  await setValue(page, '#rf-end', '18:05');
  await setValue(page, '#rf-count', '37');
  await click(page, 'Guardar registro');
  await sleep(800);
  check('Guarda un registro manual', (await text(page)).includes('Conteos manuales'));

  // 4. Importación de archivo CSV
  await click(page, 'Importar');
  await sleep(400);
  const input = await page.$('#import-file');
  await input.uploadFile(join(root, 'data-fuente/arkadia_sabado_7_simulado.csv'));
  await sleep(700);
  await setValue(page, '#imp-name', 'Copia importada del sábado');
  await setValue(page, '#imp-date', '2026-11-21');
  await sleep(400);
  t = await text(page);
  check('Vista previa de la importación', t.includes('96') && t.includes('registros válidos'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Importar 96')).click());
  await sleep(800);
  check('Importa el archivo en un conjunto nuevo', (await text(page)).includes('Copia importada del sábado'));

  // 5. Colas M/M/1 y M/M/s
  await page.evaluate(() => (location.hash = '#/colas'));
  await sleep(700);
  t = await text(page);
  check('Calcula M/M/s con ecuaciones', t.includes('Resultados M/M/2') && t.includes('Erlang C') && t.includes('Ley de Little'));
  await click(page, 'M/M/1');
  await sleep(400);
  check('Cambia a M/M/1', (await text(page)).includes('Resultados M/M/1'));
  await setValue(page, 'input[type=number]', '60');
  await sleep(400);
  check('Detecta un sistema sin equilibrio (ρ ≥ 1)', (await text(page)).includes('no tiene equilibrio estacionario'));

  // 6. Montecarlo reproducible
  await page.evaluate(() => (location.hash = '#/simular'));
  await sleep(700);
  const runOnce = async () => {
    await click(page, 'Ejecutar');
    await sleep(2500);
    return page.evaluate(() => [...document.querySelectorAll('p')].find((p) => p.textContent.includes('Control de reproducibilidad'))?.textContent);
  };
  const a = await runOnce();
  const b = await runOnce();
  check('Montecarlo con la misma semilla es reproducible', !!a && a === b, a ?? '');
  await click(page, 'Guardar ejecución');
  await sleep(400);
  await click(page, 'Reproducir notebook');
  await sleep(500);
  check('Reproduce el notebook del sábado', (await text(page)).includes('96 de 96 valores coinciden'));

  // 7. Simulador visual
  await page.evaluate(() => (location.hash = '#/simular/visual'));
  await sleep(700);
  await click(page, 'Iniciar');
  await sleep(2500);
  await click(page, 'Pausar');
  const m1 = await page.evaluate(() => document.querySelector('.metrics')?.innerText);
  await sleep(800);
  const m2 = await page.evaluate(() => document.querySelector('.metrics')?.innerText);
  check('El simulador avanza y la pausa congela el estado', !!m1 && m1 === m2);
  await click(page, 'Completar al instante');
  await sleep(500);
  check('Compara simulación con teoría', (await text(page)).includes('Simulación frente a teoría'));
  await click(page, 'Guardar simulación');
  await sleep(500);

  // 8. Informe PDF
  await page.evaluate(() => (location.hash = '#/informe'));
  await sleep(700);
  await click(page, 'Descargar informe PDF');
  let pdf = null;
  for (let i = 0; i < 30 && !pdf; i++) {
    await sleep(500);
    pdf = readdirSync(downloads).find((f) => f.endsWith('.pdf'));
  }
  const header = pdf ? readFileSync(join(downloads, pdf)).subarray(0, 5).toString() : '';
  check('Descarga el informe PDF', header === '%PDF-', pdf ?? 'sin archivo');

  // 8b. Modo oscuro
  await page.evaluate(() => document.querySelector('[aria-label="Activar modo oscuro"]').click());
  await sleep(300);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('Activa el modo oscuro', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && bg === 'rgb(12, 20, 32)', bg);

  // 9. Cerrar y abrir sin perder datos
  await page.close();
  page = await open('#/datos');
  t = await text(page);
  check('Conserva los datos al reabrir', t.includes('Copia importada del sábado') && t.includes('Conteos manuales'));
  check('Conserva el modo oscuro al reabrir', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  check('Muestra el nombre ParkSmart Arkadia', (await page.title()) === 'ParkSmart Arkadia' && (await text(page)).includes('ParkSmart'));

  // 10. Sin conexión
  await page.evaluate(async () => navigator.serviceWorker && (await navigator.serviceWorker.ready));
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);
  check('Funciona sin conexión', (await text(page)).includes('Datos vehiculares'));

  check('Sin errores de JavaScript en la consola', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('Ejecución de la prueba', false, e.message);
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} de ${results.length} verificaciones correctas`);
process.exit(failed ? 1 : 0);
