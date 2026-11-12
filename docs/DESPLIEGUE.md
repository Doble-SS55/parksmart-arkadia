# Despliegue: web en Firebase Hosting + APK Android

Un solo código, dos salidas:

| Salida | Cómo se genera | Dónde queda |
|---|---|---|
| **Web** (producción) | GitHub Actions al hacer `push` a `main` | `https://parksmart-arkadia.web.app` |
| **Web** (pruebas) | `push` a la rama `pruebas` | `https://parksmart-arkadia-pruebas.web.app` (sin indexar en buscadores) |
| **APK Android** | GitHub Actions en cada `push` y pull request | Pestaña *Actions* (artefacto `android`), dentro de la web en `/descargas/parksmart-arkadia.apk` y en *Releases* al crear una etiqueta `v*` |

El flujo está en `.github/workflows/ci-cd.yml` y sigue el mismo esquema de Firebase que MAC-TEA-front (sitios `produccion` y `pruebas`, mismos encabezados de seguridad). Antes de publicar corre las 76 pruebas, la compilación y las pruebas de extremo a extremo en Chrome; si algo falla, no publica.

## 1. Subir el código a GitHub (una vez)

1. En github.com crear un repositorio **vacío** (sin README ni .gitignore), por ejemplo `Doble-SS55/parksmart-arkadia`.
2. En `Documentos\parksmart-arkadia`, desde `cmd`:

```bat
git init -b main
git add .
git commit -m "ParkSmart Arkadia: web, APK y despliegue"
git remote add origin https://github.com/Doble-SS55/parksmart-arkadia.git
git push -u origin main
git push origin main:pruebas
```

Con esto, en la pestaña **Actions** del repositorio ya se compila la APK. El paso "Publicar en Firebase Hosting" mostrará un aviso hasta completar la sección 2.

## 2. Conectar Firebase Hosting (una vez)

Requisitos: Firebase CLI (`npm install -g firebase-tools`) y la cuenta de Google con la que manejan MAC-TEA.

```bat
firebase login
firebase projects:create parksmart-arkadia --display-name "ParkSmart Arkadia"
firebase hosting:sites:create parksmart-arkadia-pruebas --project parksmart-arkadia
firebase init hosting:github --project parksmart-arkadia
```

En `firebase init hosting:github`:

- Repositorio: `Doble-SS55/parksmart-arkadia`.
- *Set up the workflow to run a build script before every deploy?* → **No**.
- *Set up automatic deployment… when a PR is merged?* → **No**.
- Si pregunta si sobrescribir `firebase.json`, responder **No**.

El comando crea en GitHub el secreto `FIREBASE_SERVICE_ACCOUNT_PARKSMART_ARKADIA`. Si generó archivos `.github/workflows/firebase-hosting-*.yml`, bórrelos: el flujo `ci-cd.yml` ya hace la publicación.

Después:

```bat
git add .
git commit -m "Conectar Firebase"
git push
```

**Si el ID `parksmart-arkadia` ya está ocupado** en Firebase, use otro (por ejemplo `parksmart-arkadia-eafit`) y cámbielo en tres lugares: `.firebaserc`, `projectId:` en `ci-cd.yml` y el nombre del secreto (`FIREBASE_SERVICE_ACCOUNT_<ID EN MAYÚSCULAS CON GUIONES BAJOS>`) en `ci-cd.yml`.

Publicar a mano (como en MAC-TEA), sin esperar a GitHub:

```bat
npm run build
firebase deploy --only hosting:produccion
```

## 3. Instalar la APK en un celular Android

1. Abrir `https://parksmart-arkadia.web.app` en el celular y tocar **App para Android** en el inicio (o descargar `parksmart-arkadia.apk` desde *Actions* o *Releases*).
2. Android pedirá permitir la instalación desde el navegador ("Instalar apps desconocidas"). Aceptar solo para esta instalación.
3. Abrir **ParkSmart Arkadia**. Funciona sin internet.

En la APK, el PDF, el CSV y el respaldo se entregan con el menú **Compartir** (guardar en Archivos o Drive, enviar por WhatsApp, etc.).

Los datos de la APK y los de la web son independientes (cada uno tiene su propia base SQLite). Para pasar datos de uno a otro: *Informe → Descargar respaldo* y *Restaurar respaldo*.

## 4. Versión con descarga permanente (Release)

```bat
git tag v1.0.0
git push --tags
```

GitHub crea un *Release* "ParkSmart Arkadia v1.0.0" con la APK adjunta: un enlace estable para el docente.

## 5. APK firmada de producción (opcional; necesaria para Google Play)

Sin estos secretos se compila una APK de **depuración**, que se instala y funciona igual. Para Google Play (o para que las actualizaciones conserven la misma firma), cree un almacén de claves **una sola vez** y guárdelo fuera del repositorio:

```bat
keytool -genkeypair -v -keystore parksmart-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias parksmart
```

(`keytool` viene con cualquier JDK, por ejemplo Temurin 21.) Luego, en PowerShell, copie el archivo en Base64 al portapapeles:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("parksmart-release.jks")) | Set-Clipboard
```

En GitHub → *Settings → Secrets and variables → Actions*, cree:

| Secreto | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | El texto copiado |
| `ANDROID_KEYSTORE_PASSWORD` | Contraseña del almacén |
| `ANDROID_KEY_ALIAS` | `parksmart` |
| `ANDROID_KEY_PASSWORD` | Contraseña de la clave |

Desde el siguiente `push`, el flujo genera `parksmart-arkadia.apk` firmada y `parksmart-arkadia.aab` (el formato que pide Google Play). **No pierda el `.jks` ni las contraseñas**: sin ellos no se pueden publicar actualizaciones de la misma app en Google Play. Publicar en la tienda requiere además una cuenta de desarrollador de Google Play.

## 6. Compilar la APK en el computador (opcional)

Con Android Studio instalado:

```bat
npm run android
```

Esto compila la web, la copia al proyecto `android/` y abre Android Studio, donde *Build → Build APK(s)* genera la APK.

## Número de versión

Cada compilación en GitHub usa `versionCode = número de ejecución` y `versionName = 1.0.<número>`, así Android acepta cada APK nueva como actualización de la anterior (si tienen la misma firma).
