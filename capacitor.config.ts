import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.parksmart.arkadia',
  appName: 'ParkSmart Arkadia',
  // La APK empaqueta la misma compilación web: funciona sin internet.
  webDir: 'dist',
  android: {
    backgroundColor: '#10284A',
  },
  plugins: {
    SystemBars: {
      // La app dibuja de borde a borde y usa env(safe-area-inset-*) para no quedar bajo la barra de estado.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // Fondo azul oscuro en la barra superior: íconos del sistema en claro.
      style: 'DARK',
    },
  },
};

export default config;
