import { useEffect, useState } from 'react';
import { isNativeApp } from '../platform/native';
import { IconDownload } from './Icons';

const APK_URL = './descargas/parksmart-arkadia.apk';

/** Enlace a la APK publicada junto a la web. Solo aparece si el archivo existe y no estamos dentro de la APK. */
export function AndroidDownload() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (isNativeApp() || !import.meta.env.PROD) return;
    let alive = true;
    fetch(APK_URL, { method: 'HEAD', cache: 'no-store' })
      .then((r) => alive && setAvailable(r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!available) return null;
  return (
    <a href={APK_URL} download="parksmart-arkadia.apk">
      <b><IconDownload />App para Android</b>
      <span>Descargue e instale la APK en su celular</span>
    </a>
  );
}
