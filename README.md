# ToniCrespoWEB

Web de Toni Crespo construida con React, TypeScript y Supabase. El contenido editorial y las imágenes se sirven desde Supabase.

## Estado

- Frontend: Vite + React + TypeScript en `src/`.
- Contenido y Storage: Supabase.
- Esquema: `supabase/migrations/`.
- Copias locales recuperables: `supabase/backups/`.
- Contexto operativo para agentes: `context/`.

## Desarrollo

```bash
npm install
npm run dev
```

Usa Node 24 (la misma versión que GitHub Actions) y `npm ci` para reproducir las dependencias del lockfile.

Validacion:

```bash
npx playwright install chromium
npm run test:ci
```

Si npm falla con `SELF_SIGNED_CERT_IN_CHAIN` en este entorno, se puede instalar sin tocar la configuracion global:

```bash
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm ci
```

El build necesita el binario opcional de Rollup para Linux. Si faltara en este entorno, instalarlo asi:

```bash
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm install @rollup/rollup-linux-x64-gnu@4.62.2 --save-optional
```

## Supabase

Copia `.env.example` a `.env` solo cuando existan claves reales locales. No commitear `.env`.

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Para activar la edición web:

1. Verificar las migraciones: el proyecto actual ya tiene el esquema y los permisos de `site-assets` revisados. Para un proyecto vacío, el orden completo está documentado en [supabase/README.md](supabase/README.md).
2. Crear externamente en Supabase Auth el usuario admin y asignarle una contraseña desde Supabase.
3. Insertar ese mismo email en `admin_users`.
4. Crear `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Comprobar la conexión, el esquema y los buckets sin cambiar datos:

```bash
npm run verify:supabase -- --require-service
```

El acceso discreto a edición está en el footer. El header mantiene únicamente redes, correo y el selector de idioma con banderas. En modo edición, ese selector también permite marcar el idioma inicial de nuevos visitantes.

## Correo de contacto

El botón de correo del header y el contacto de cada obra usan la Edge Function `send-contact-email`. El navegador nunca recibe una clave SMTP o de Resend: la función obtiene de Supabase el destinatario elegido por el administrador y responde al email que introduzca el visitante.

Antes de usarla en producción, crea una cuenta de [Resend](https://resend.com/), verifica el dominio remitente y despliega la función siguiendo [supabase/README.md](supabase/README.md). No se requiere una migración SQL adicional.

El modo edición queda integrado en cada vista:

- `Trayectoria`: cambio de foto de portada, editor visual de texto y poema, y alta/baja de fotos de galería.
- `Noticias`: formulario modal de alta y borrado confirmado de cada noticia.
- `Fotografía`: carga directa de una o varias imágenes y borrado confirmado.
- `Lienzos` y `Obra en papel`: alta, edición y borrado confirmado de colección desde el listado; alta, ocultación pública y borrado de obra desde su detalle.

Los formularios guardan las versiones en español, inglés, alemán y catalán en las columnas `translations` de Supabase. La versión española es la fuente editorial; los demás idiomas se pueden completar o editar más tarde. Las imágenes subidas se guardan en los buckets existentes, y los activos nuevos eliminados se limpian de Storage. Los recursos heredados bajo `legacy/` nunca se borran automáticamente.

## Copias Supabase

El comando de copia descarga las filas de contenido, todos los archivos de todos los buckets y una copia de las migraciones actuales. Las copias se guardan localmente en `supabase/backups/` y no se suben a Git.

```bash
npm run backup:supabase
npm run verify:supabase-backup -- --latest
npm run restore:supabase -- --latest
npm run restore:supabase -- --latest --write
```

La restauración hace `upsert` y no elimina datos remotos. Las URLs de Storage se adaptan al proyecto configurado en el `.env`; las cuentas Auth se siguen creando externamente en Supabase, porque nunca se respaldan contraseñas ni sesiones. Consulta [supabase/README.md](supabase/README.md) para el flujo completo.

## Pruebas y despliegue

Las suites viven en [tests/](tests/README.md): pruebas unitarias, navegación y edición con Playwright en escritorio/móvil, regresiones de ambientes y una integración real con Supabase. La interfaz usa una API simulada y nunca escribe en producción.

Para ejecutar Auth, CRUD, traducciones, visibilidad, RLS y los cinco buckets con un Supabase temporal (requiere Docker):

```bash
npm run supabase:test:start
npm run test:supabase:local
npm run supabase:test:stop
```

La integración remota exige las tres variables `SUPABASE_TEST_*` explícitas y `--run`. Nunca reutiliza automáticamente las claves del frontend. Producción requiere además `--allow-production`: las filas temporales permanecen ocultas y sólo se eliminan datos identificados por el UUID de esa ejecución. Consulta las precauciones y límites de limpieza en [tests/README.md](tests/README.md).

```bash
npm run test:public-health -- --require-email-function
```

La comprobación pública anterior valida el contenido y las imágenes reales con la clave anónima; la comprobación de correo usa un honeypot sin enviar mensajes y no acredita entrega del proveedor.

El workflow reutilizable [quality.yml](.github/workflows/quality.yml) ejecuta las pruebas del frontend y el Supabase temporal en paralelo. [deploy-pages.yml](.github/workflows/deploy-pages.yml) lo invoca para el mismo commit de `main` y espera su éxito antes de comprobar el Supabase público, compilar y publicar. Cualquier fallo bloquea el despliegue. Las PR y otras ramas ejecutan Quality sin publicar.

GitHub sólo necesita los secretos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para la comprobación pública y el build. Las pruebas de edición usan credenciales locales efímeras: no añadas la clave de servicio de producción a Actions.

## Rutas

- `/`
- `/obra`
- `/obra/:collectionSlug`
- `/fotografia`
- `/noticias`
- `/trayectoria`
- `/contacto`
