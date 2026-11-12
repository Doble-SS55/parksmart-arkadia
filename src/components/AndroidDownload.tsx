import { useEffect, useState } from 'react';
import { isNativeApp } from '../platform/native';
import { IconDownload } from './Icons';

/** La APK se publica junto a la web en esta ruta (lo hace GitHub Actions). */
export const APK_PATH = './descargas/parksmart-arkadia.apk';

const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/** true si la APK está publicada junto a la web y no estamos dentro de la APK. */
function useApkAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (isNativeApp() || !import.meta.env.PROD) return;
    let alive = true;
    fetch(APK_PATH, { method: 'HEAD', cache: 'no-store' })
      .then((r) => alive && setAvailable(r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

/**
 * Aviso de instalación en el inicio.
 * - En un celular Android: botón grande para descargar la APK.
 * - En un computador: código QR para escanear con el celular y descargarla.
 */
export function AppInstallBanner() {
  const available = useApkAvailable();
  const [qr, setQr] = useState<string | null>(null);
  const android = isAndroid();
  const url = typeof window !== 'undefined' ? new URL(APK_PATH, window.location.href).href : APK_PATH;

  useEffect(() => {
    if (!available || android) return;
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toString(url, { type: 'svg', margin: 1, color: { dark: '#10284A', light: '#FFFFFF' } }))
      .then((svg) => alive && setQr(svg))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [available, android, url]);

  if (!available) return null;

  if (android) {
    return (
      <section className="install-banner" aria-label="Instalar la app">
        <div>
          <h2>Instale ParkSmart en este celular</h2>
          <p>Funciona sin internet. Al abrir el archivo, Android le pedirá permitir la instalación desde el navegador.</p>
        </div>
        <a className="btn btn-primary" href={APK_PATH} download="parksmart-arkadia.apk">
          <IconDownload />Descargar app
        </a>
      </section>
    );
  }

  return (
    <section className="install-banner" aria-label="App para Android">
      {qr && <div className="install-qr" role="img" aria-label="Código QR para descargar la app Android" dangerouslySetInnerHTML={{ __html: qr }} />}
      <div>
        <h2>App para Android</h2>
        <p>Escanee el código con la cámara del celular para descargar la app, o abra esta página desde el celular.</p>
        <p className="small muted" style={{ wordBreak: 'break-all' }}>{url}</p>
      </div>
      <a className="btn" href={APK_PATH} download="parksmart-arkadia.apk">
        <IconDownload />Descargar APK
      </a>
    </section>
  );
}

/** Acceso rápido en la grilla del inicio. */
export function AndroidDownload() {
  const available = useApkAvailable();
  if (!available) return null;
  return (
    <a href={APK_PATH} download="parksmart-arkadia.apk">
      <b><IconDownload />App para Android</b>
      <span>Descargue e instale la APK en su celular</span>
    </a>
  );
}
