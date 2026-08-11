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

La versión actual de Vite requiere Node `20.19+` o `22.12+` para iniciar `npm run dev`. El build puede completar con Node 18, pero el servidor de desarrollo no.

Validacion:

```bash
npm run lint
npm run build
```

Si npm falla con `SELF_SIGNED_CERT_IN_CHAIN` en este entorno, se puede instalar sin tocar la configuracion global:

```bash
npm_config_strict_ssl=false npm_config_fetch_timeout=60000 npm_config_fetch_retries=1 npm_config_maxsockets=2 npm install
```

El build necesita el binario opcional de Rollup para Linux. Si faltara en este entorno, instalarlo asi:

```bash
npm_config_strict_ssl=false npm install @rollup/rollup-linux-x64-gnu@4.62.2 --save-optional
```

## Supabase

Copia `.env.example` a `.env` solo cuando existan claves reales locales. No commitear `.env`.

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Para activar la edición web:

1. En el proyecto Supabase actual, ejecutar `supabase/migrations/20260811110000_contextual_editing.sql` en el SQL Editor si todavía no se ha aplicado. Para un proyecto vacío, el orden completo está documentado en [supabase/README.md](supabase/README.md).
2. Crear externamente en Supabase Auth el usuario admin y asignarle una contraseña desde Supabase.
3. Insertar ese mismo email en `admin_users`.
4. Crear `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Comprobar la conexión, el esquema y los buckets sin cambiar datos:

```bash
npm run verify:supabase -- --require-service
```

El botón de Ajustes del header abre el acceso a edición. Supabase es obligatorio tanto para el contenido público como para el modo de edición.

## Correo de contacto

El botón azul de correo del header y el contacto de cada obra usan la Edge Function `send-contact-email`. El navegador nunca recibe una clave SMTP o de Resend: la función mantiene el destinatario Toni Crespo y responde al email que introduzca el visitante.

Antes de usarla en producción, crea una cuenta de [Resend](https://resend.com/), verifica el dominio remitente y despliega la función siguiendo [supabase/README.md](supabase/README.md). No se requiere una migración SQL adicional.

El modo edición queda integrado en cada vista:

- `Trayectoria`: cambio de foto de portada, editor visual de texto y alta/baja de fotos de galería.
- `Noticias`: formulario modal de alta y borrado confirmado de cada noticia.
- `Fotografía`: carga directa de una o varias imágenes y borrado confirmado.
- `Lienzos` y `Láminas`: alta, edición y borrado confirmado de colección desde el listado; alta y borrado de obra desde su detalle.

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

## Pruebas de integracion Supabase

La prueba remota valida la conexion que usa el modo edicion: crea un usuario Auth admin temporal, comprueba RLS, lecturas publicas, traducciones, altas y borrados de Trayectoria, Noticias, Fotografia, Lienzos, Laminas y Storage. Todos los datos creados usan el prefijo `e2e-tonicrespo-` y los archivos viven bajo `e2e/`; se eliminan al terminar, incluso si una comprobacion falla.

Usa preferiblemente un proyecto Supabase separado para pruebas y aplica las mismas migraciones que en produccion. Configura estas variables en `.env` o `.env.test`:

```env
SUPABASE_TEST_URL=
SUPABASE_TEST_ANON_KEY=
SUPABASE_TEST_SERVICE_ROLE_KEY=
```

Para una comprobacion local intencional, el script tambien puede reutilizar `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` del `.env` actual:

```bash
npm run test:supabase -- --run
```

La clave de servicio solo se usa en el proceso Node para crear y borrar el usuario temporal; nunca se carga en el navegador.

El workflow [quality.yml](.github/workflows/quality.yml) ejecuta `lint` y `build` en cada push y pull request. Para activar tambien la prueba remota en GitHub, crea los secretos `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` y `SUPABASE_TEST_SERVICE_ROLE_KEY`, y define la variable de repositorio `RUN_SUPABASE_INTEGRATION=true`. Tambien se puede lanzar manualmente desde Actions marcando `Run the remote Supabase integration test`.

## Rutas

- `/`
- `/obra`
- `/obra/:collectionSlug`
- `/fotografia`
- `/noticias`
- `/trayectoria`
- `/contacto`
