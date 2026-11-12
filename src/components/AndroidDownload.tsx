import { useEffect, useState } from 'react';
import { isNativeApp } from '../platform/native';
import { IconDownload } from './Icons';

/**
 * La APK se publica en GitHub Releases (el plan gratuito de Firebase no admite
 * archivos ejecutables). Este enlace siempre entrega la versión más reciente.
 */
const REPO = (import.meta.env.VITE_APK_REPO as string | undefined) ?? 'Doble-SS55/parksmart-arkadia';
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/parksmart-arkadia.apk`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/** Versión publicada de la APK (p. ej. "v1.0.7"), o null si no hay una disponible. */
function useApkRelease(): string | null {
  const [tag, setTag] = useState<string | null>(null);
  useEffect(() => {
    if (isNativeApp() || !import.meta.env.PROD) return;
    let alive = true;
    fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((rel: { tag_name?: string; assets?: { name: string }[] } | null) => {
        if (alive && rel?.assets?.some((a) => a.name === 'parksmart-arkadia.apk')) setTag(rel.tag_name ?? 'última');
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return tag;
}

/**
 * Aviso de instalación en el inicio.
 * - En un celular Android: botón grande para descargar la APK.
 * - En un computador: código QR para escanear con el celular y descargarla.
 */
export function AppInstallBanner() {
  const version = useApkRelease();
  const [qr, setQr] = useState<string | null>(null);
  const android = isAndroid();

  useEffect(() => {
    if (!version || android) return;
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toString(APK_URL, { type: 'svg', margin: 1, color: { dark: '#10284A', light: '#FFFFFF' } }))
      .then((svg) => alive && setQr(svg))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [version, android]);

  if (!version) return null;

  if (android) {
    return (
      <section className="install-banner" aria-label="Instalar la app">
        <div>
          <h2>Instale ParkSmart en este celular</h2>
          <p>Funciona sin internet. Al abrir el archivo, Android le pedirá permitir la instalación desde el navegador.</p>
          <p className="small muted">Versión {version}</p>
        </div>
        <a className="btn btn-primary" href={APK_URL}>
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
        <p className="small muted">Versión {version}</p>
      </div>
      <a className="btn" href={APK_URL}>
        <IconDownload />Descargar APK
      </a>
    </section>
  );
}

/** Acceso rápido en la grilla del inicio. */
export function AndroidDownload() {
  const version = useApkRelease();
  if (!version) return null;
  return (
    <a href={APK_URL}>
      <b><IconDownload />App para Android</b>
      <span>Descargue e instale la APK en su celular</span>
    </a>
  );
}
