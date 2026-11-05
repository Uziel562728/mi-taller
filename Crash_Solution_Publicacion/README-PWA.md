# Crash Solution — PWA

El proyecto se compila con Vite; no publiques directamente esta carpeta ni abras el HTML con file://.

- Desarrollo: npm run dev desde la raíz del repositorio.
- Vercel: npm run build (base /), publicar dist.
- GitHub Pages: npm run build:pages (base /mi-taller/), publicar dist mediante el workflow preparado.
- Instalación: Android y escritorio desde el menú del navegador; iPhone desde Compartir → Agregar a pantalla de inicio. Se necesita HTTPS o localhost.
- Actualizaciones: aceptar Actualizar cuando aparezca el aviso. Se guarda el trabajo abierto antes de recargar; no se borran IndexedDB ni la cola de sincronización.
- Los datos guardados solo en otro dominio no se transfieren automáticamente. Conservar el origen anterior y sincronizar o respaldar antes de cambiar.

La configuración requerida, los límites de las comprobaciones y los pasos manuales están en [la guía de Pages y PWA](../docs/github-pages-pwa.md). La publicación queda pendiente de autorización.
