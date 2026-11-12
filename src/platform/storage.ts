import { isNativeApp } from './native';

/**
 * Persistencia del archivo SQLite en IndexedDB del navegador.
 * Así los datos sobreviven a cerrar la pestaña, recargar o reiniciar el teléfono.
 */
// Nombre interno heredado del primer nombre del proyecto: cambiarlo dejaría
// inaccesibles los datos ya guardados en los navegadores donde se usó la app.
const DB_NAME = 'queuesmart-arkadia';
const STORE = 'files';
const KEY = 'sqlite';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDatabaseFile(): Promise<Uint8Array | null> {
  if (typeof indexedDB === 'undefined') return null;
  const idb = await open();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result as ArrayBuffer) : null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDatabaseFile(bytes: Uint8Array): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const idb = await open();
  const copy = bytes.slice().buffer;
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(copy, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearDatabaseFile(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const idb = await open();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Pide al navegador que no borre los datos ante falta de espacio. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Entrega un archivo al usuario.
 * - En el navegador: descarga directa.
 * - En la APK: lo guarda en el teléfono y abre el menú "Compartir" (Drive, WhatsApp, Archivos…),
 *   porque el visor web de Android no permite descargas con enlaces.
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  if (isNativeApp()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const saved = await Filesystem.writeFile({ path: fileName, data: await blobToBase64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title: fileName, url: saved.uri, dialogTitle: 'Guardar o compartir' });
    } catch (e) {
      // Cerrar el menú de compartir no es un error.
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text: string, fileName: string, mime = 'text/csv;charset=utf-8'): Promise<void> {
  return downloadBlob(new Blob(['\uFEFF', text], { type: mime }), fileName);
}
