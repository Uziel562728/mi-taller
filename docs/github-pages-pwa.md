# Crash Solution: implementación preparada para GitHub Pages

URL prevista: **https://uziel562728.github.io/mi-taller/**. Esta implementación se preparó localmente; no se habilitó Pages, no se hizo push y no se modificó Supabase ni Vercel.

## Configuración que debe habilitar el propietario

1. En `Uziel562728/mi-taller` → **Settings → Secrets and variables → Actions → Variables**, crear estas variables de repositorio:
   - `VITE_SUPABASE_URL`: URL pública del proyecto Supabase existente.
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: clave **publishable** o **anon** del mismo proyecto. Es pública por diseño y se incluirá en el JavaScript. No usar `service_role`, claves secretas, contraseñas, tokens personales de GitHub ni tokens de Supabase CLI.
2. En **Settings → Actions → General**, permitir los workflows y las acciones oficiales de GitHub utilizadas. El workflow declara sus permisos: lectura de contenido para compilar; `pages: write` e `id-token: write` únicamente en el trabajo de despliegue. No requiere guardar credenciales privadas.
3. En **Settings → Pages → Build and deployment → Source**, seleccionar **GitHub Actions**. No seleccionar una carpeta de `main`, no publicar el código fuente directamente y no crear otro repositorio.
4. Revisar el entorno **github-pages** y limitar los despliegues a `main`. Si se desea aprobar cada publicación, configurar un revisor requerido antes del primer push del workflow; su disponibilidad depende del plan y los permisos del repositorio.
5. Después de autorizar la publicación, subir esta implementación a `main`. El archivo `.github/workflows/pages.yml` ejecutará `npm ci`, validará la configuración pública, correrá `npm test`, compilará con `npm run build:pages`, verificará los recursos y publicará únicamente `dist`. También admite ejecución manual desde Actions en `main`.

Agregar el workflow a `main` habilita publicaciones automáticas futuras. Por eso no se subió durante esta preparación. GitHub proporciona el token efímero del workflow; no debe copiarse ninguna credencial privada al archivo YAML.

## Supabase Auth: revisión manual pendiente de autorización

En el proyecto existente, **Authentication → URL Configuration → Redirect URLs**, revisar y, si faltan, agregar con autorización estas direcciones exactas:

- `https://uziel562728.github.io/mi-taller/`
- `https://uziel562728.github.io/mi-taller/#update-password`

Conservar las direcciones de localhost y Vercel existentes. No hace falta cambiar el **Site URL** global para mantener ambos alojamientos: el frontend envía el destino correspondiente a su propio build. Revisar que las plantillas de confirmación, invitación y recuperación respeten `RedirectTo`/`ConfirmationURL`, en lugar de forzar siempre `SiteURL`. No se cambiaron plantillas, Email, SMTP, RLS, JWT ni funciones.

Las pruebas simuladas comprueban las URLs que envían registro, invitaciones y recuperación. El handler existente de `admin-management` admite el origen de Pages y la ruta `/mi-taller/#update-password`; no se modificó su código. Esto no verifica la allow-list real, la entrega de correo ni un enlace de un solo uso: requieren una prueba manual autorizada con correo controlado después de publicar. Nunca enviar contraseñas ni tokens por el chat.

## Builds, rutas y recursos

- Desarrollo: `npm run dev`, raíz local habitual. Se retira el worker local anterior sin borrar trabajos.
- Vercel: `npm run build`; salida `dist`; base `/`. Su configuración remota no cambia.
- Pages: `npm run build:pages`; salida `dist`; base `/mi-taller/`.
- Verificación: `node scripts/verify-pwa-build.mjs /` o `node scripts/verify-pwa-build.mjs /mi-taller/`, según el build anterior.
- Vista previa de Pages: `npm run preview -- --host localhost --port 4173 --strictPort --base=/mi-taller/`, luego abrir `http://localhost:4173/mi-taller/`.

La navegación sigue usando hashes (`#/trabajos`, `#/stock`, `#update-password`, etc.). GitHub Pages recibe `/mi-taller/` al recargar: no requiere un servidor de rutas ni rewrites. Usar enlaces con hash, no inventar rutas como `/mi-taller/stock`. El `<base>` del HTML y los callbacks evitan perder la subcarpeta. Se comprueban Atrás/Adelante y la interpretación de la misma ruta al recargar.

El manifiesto se publica en `/mi-taller/manifest.webmanifest`, con nombre Crash Solution, `standalone`, iconos PNG de 192 y 512 píxeles reales y `id`, `scope`, `start_url` relativos a esa ruta estable. La versión anterior dejaba el manifiesto dentro de `assets/`, desalineando las rutas de sus iconos.

## Actualizaciones y datos offline

El build calcula una versión a partir del HTML, JavaScript, CSS, worker, manifiesto e iconos. La instalación comprueba la coincidencia entre worker, lista offline y HTML; una descarga incompleta o mezclada no activa esa versión. Las descargas de instalación y comprobación evitan la caché HTTP del navegador.

Cuando hay una actualización lista, se muestra **Actualizar**. Antes de activar el worker se guarda el trabajo abierto, la navegación y la operación local idempotente de sincronización. Si falla el guardado, no se recarga. Las otras pestañas reciben el aviso sin una recarga forzada. Los chunks anteriores se conservan mientras puedan ser necesarios para pestañas antiguas, y se limpia exclusivamente el shell de ese scope cuando queda una pestaña de la versión actual.

No se borran ni renombran IndexedDB, localStorage, claves de sesión ni colas. Supabase, solicitudes autenticadas, URLs con parámetros y datos privados no se incorporan a la caché del worker. La separación por usuario/taller y la protección al cerrar sesión siguen siendo las existentes.

**Cambio de origen:** Vercel y GitHub Pages tienen almacenes locales distintos. Iniciar sesión en Pages no mueve los borradores de Vercel. Antes del cambio, sincronizar los trabajos pendientes válidos desde Vercel; para borradores exclusivamente locales, conservar un respaldo y planificar la importación manual. No borrar datos del sitio anterior ni importar duplicados de trabajos que ya se sincronizaron. Mantener el mismo backend permite recuperar los trabajos que ya estén sincronizados, sujeto a los permisos de la cuenta.

## Verificación manual después de autorizar la publicación

1. Abrir la URL HTTPS de Pages. En DevTools → Application comprobar el manifiesto, sus iconos y el worker con scope `/mi-taller/`. Confirmar que los recursos responden correctamente.
2. Android/Chrome: menú **Instalar aplicación** o **Agregar a pantalla de inicio**. iPhone/Safari: **Compartir → Agregar a pantalla de inicio → Abrir como app web**, si aparece. Escritorio compatible: icono o menú de instalación del navegador. La disponibilidad del control depende del sistema y navegador.
3. Abrir la aplicación instalada y verificar el modo standalone. Autenticarse con una cuenta propia, abrir un trabajo de prueba y recorrer Trabajos, Stock y perfiles. Comprobar Atrás/Adelante y F5 sin perder el paso o los datos.
4. Con el shell ya instalado y una sesión válida, desconectar la red y verificar apertura, edición de un borrador y un presupuesto PDF. Recuperar la conexión y verificar la sincronización existente.
5. Con un correo controlado y autorización, probar confirmación, invitación y recuperación desde Pages. Confirmar que el enlace regresa a `/mi-taller/`, permite configurar la contraseña y asigna el taller correcto.
6. Autorizar y publicar una segunda versión. Mantener un trabajo con cambios abierto en la primera, volver a la app y aceptar **Actualizar**. Verificar que cambia la versión y conserva el borrador y su navegación. Repetir con dos pestañas y sin conexión: no debe activarse una descarga incompleta ni recargarse la otra pestaña sin aceptación.

La prueba de instalación real, los correos y dos publicaciones reales permanecen pendientes: no se realizaron despliegues durante esta preparación. La herramienta de navegador local tampoco pudo abrir la vista previa (`Cannot read properties of undefined (reading 'timeoutMs')`). Las pruebas automatizadas cubren el manifiesto, recursos, rutas, callbacks simulados, actualización y conservación local; no sustituyen esas comprobaciones en dispositivos reales.

## Resultado de la verificación local

- `npm test`: **189 aprobadas y 7 omitidas** (6 pruebas remotas y una auditoría opcional).
- `npm run build` y `node scripts/verify-pwa-build.mjs /`: correctos.
- `npm run build:pages` y `node scripts/verify-pwa-build.mjs /mi-taller/`: correctos.
- La vista previa local respondió HTTP 200 para HTML, worker, lista offline, manifiesto e iconos PNG, con tipos de contenido correctos.
- `git diff --check`: correcto. No se hizo commit ni push de esta implementación; los archivos quedan preparados para revisión local.

Referencias: [GitHub Pages con Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Vite en Pages](https://vite.dev/guide/static-deploy#github-pages), [redirecciones de Supabase](https://supabase.com/docs/guides/auth/redirect-urls).
