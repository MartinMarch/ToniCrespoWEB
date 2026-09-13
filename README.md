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
npx playwright install chromium webkit
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

El correo funciona mediante enlaces `mailto:`. El botón del header abre la aplicación de correo del visitante únicamente con el destinatario; desde «Me interesa» de una obra se prepara además un borrador con su información. El destinatario predeterminado es `eulaliaricart@gmail.com` y el administrador puede cambiarlo en los ajustes de contacto guardados en Supabase.

El visitante necesita una aplicación o servicio de correo configurado y debe enviar el mensaje personalmente. La web no confirma un envío ni una entrega. Este flujo no requiere Resend, SMTP ni una Edge Function; el código heredado de `send-contact-email` se conserva, pero el frontend no lo utiliza.

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
npm run test:public-health
```

La comprobación pública valida el contenido, las imágenes reales y el formato del correo de contacto con la clave anónima. No invoca servicios de envío. La opción `--require-email-function` se conserva exclusivamente para diagnosticar la antigua función Resend: no forma parte del flujo activo ni del despliegue.

El workflow reutilizable [quality.yml](.github/workflows/quality.yml) ejecuta las pruebas del frontend y el Supabase temporal en paralelo. [Deploy edge-proxy](.github/workflows/deploy-pages.yml) lo invoca para el mismo commit de `main` y espera su éxito antes de comprobar el Supabase público, compilar y publicar la release para el edge. Cualquier fallo bloquea la publicación. Las PR y otras ramas ejecutan Quality sin publicar.

GitHub sólo necesita los secretos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para la comprobación pública y el build. Las pruebas de edición usan credenciales locales efímeras: no añadas la clave de servicio de producción a Actions.

### Publicación en edge-proxy

El único destino de despliegue es el edge-proxy, que sirve la web en [https://tonicrespo.duckdns.org](https://tonicrespo.duckdns.org). Ya no se compila ni publica para GitHub Pages; el workflow tampoco solicita permisos de Pages ni OIDC.

El nombre visible del workflow es `Deploy edge-proxy`. Se conserva el archivo `deploy-pages.yml` y ese mismo identificador en `release.json` para mantener la compatibilidad con la validación del consumidor del edge. Renombrarlo requiere actualizar también esa configuración en el servidor.

Cada push a `main` ejecuta el mismo workflow de despliegue. Después de superar Quality y la comprobación pública, el job `publish-edge` compila con `VITE_BASE_PATH=/` y publica una release `edge-<SHA completo del commit>` con tres archivos:

- `site.tar.gz`: contenido compilado de `dist/`, con `index.html` en la raíz del paquete.
- `site.tar.gz.sha256`: checksum SHA-256 del paquete.
- `release.json`: sitio, repositorio, commit, ejecución de Actions, base y checksum esperados.

El workflow usa el `GITHUB_TOKEN` temporal del propio repositorio para publicar. Repetir una ejecución valida la release existente del mismo commit y conserva sus archivos; nunca los sobreescribe. Para publicar una nueva compilación, crea un nuevo commit.

El LXC `edge-proxy` consulta periódicamente las releases públicas y sólo despliega las que superan la validación de origen, commit, checksum y ejecución correcta del workflow. Descarga los archivos compilados y cambia la versión activa de forma atómica; Caddy sirve las rutas React con fallback a `index.html`. La configuración de dominio, el instalador y el servicio de consulta viven en [MartinMarch/edge-proxy](https://github.com/MartinMarch/edge-proxy).

Este flujo no requiere una conexión SSH entrante desde GitHub, credenciales de GitHub permanentes en el LXC ni un runner de Actions dentro de producción. Los secretos DuckDNS y los certificados permanecen en el servidor.

Una release publicada no confirma por sí sola su activación. El consumidor espera a que el workflow completo termine correctamente y vuelve a consultar cada cinco minutos, con hasta 15 segundos adicionales. Desde el LXC se puede verificar, sin reiniciar servicios:

```bash
readlink /opt/edge-proxy/www/tonicrespo/current
systemctl list-timers --all edge-proxy-static-pull.timer --no-pager
journalctl -u edge-proxy-static-pull.service -n 20 --no-pager
```

El enlace debe apuntar a `releases/<SHA del commit publicado>` y el registro mostrar ese mismo SHA como `published` o `unchanged`. `release.json` es un archivo de la release de GitHub, no un endpoint público del sitio; consultar esa ruta en la web no acredita qué versión sirve Caddy.

Para previsualizar el build estático en local, usar `VITE_BASE_PATH=/ npm run build` y después `npm run preview`. El servidor de preview es sólo para comprobaciones locales; en producción sirve Caddy.

Retirar el workflow de Pages evita futuras publicaciones una vez subido este cambio, pero no retira automáticamente una publicación anterior. Si esa URL sigue disponible, se debe despublicar por separado desde la configuración de GitHub Pages del repositorio.

## Extraer el catálogo del WordPress original

`npm run export:wordpress` crea una carpeta nueva en `exports/` con las imágenes públicas por colección, fichas TXT/JSON, catálogo CSV e índice HTML sin conexión. No requiere credenciales ni modifica la web o Supabase. `npm run test:wordpress-export` comprueba el parser de galerías.

Consulta [el método y sus límites](context/extraccion-wordpress.md), especialmente para obras antiguas borradas o galerías actualmente vacías. Las extracciones quedan fuera de Git y no se incluyen en el despliegue.

## Rutas

- `/`
- `/obra`
- `/obra/:collectionSlug`
- `/fotografia`
- `/noticias`
- `/trayectoria`
- `/contacto`
