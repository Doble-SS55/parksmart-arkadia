import { Capacitor } from '@capacitor/core';

/** true cuando la app corre dentro de la APK de Android (Capacitor) y no en un navegador. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();
