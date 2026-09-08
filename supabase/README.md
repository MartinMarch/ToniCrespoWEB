# Supabase

Esta carpeta es la fuente de verdad local para el esquema y las copias operativas de Toni Crespo.

## Estructura

- `migrations/`: cambios de esquema versionados. Se ejecutan en orden por nombre.
- `backups/`: snapshots locales descargados desde el proyecto Supabase. Su contenido se ignora en Git porque incluye obra, textos y metadatos de administradores.

## Qué SQL ejecutar

### Proyecto actual de Toni Crespo

Revisado el 8 de septiembre de 2026: el esquema de edición, traducciones y ajustes globales ya está aplicado. Se ha aplicado por MCP la reparación `20260908105629_restore_site_assets_policies.sql`, que añade únicamente los permisos ausentes del bucket `site-assets` sin modificar archivos ni contenido.

El esquema anterior se aplicó manualmente y no constaba en el historial remoto de migraciones. No ejecutes `db push` indiscriminadamente ni repitas todo el historial sobre producción: primero compara el estado real. La reparación nueva es idempotente y queda registrada remotamente.

No vuelvas a ejecutar `20260810210000_admin_editing.sql` ni `20260811100000_site_assets_bucket.sql` sobre este proyecto: sus tablas, buckets y políticas ya existen y el SQL Editor puede devolver errores de políticas duplicadas.

### Proyecto Supabase nuevo y vacío

Ejecuta una sola vez los archivos completos, exactamente en este orden:

1. `supabase/migrations/20260810210000_admin_editing.sql`
2. `supabase/migrations/20260811100000_site_assets_bucket.sql`
3. `supabase/migrations/20260811110000_contextual_editing.sql`
4. `supabase/migrations/20260904120000_final_site_settings.sql`
5. `supabase/migrations/20260908105629_restore_site_assets_policies.sql`

Después restaura una copia con `npm run restore:supabase -- --latest --write` o carga el contenido desde una copia válida.

Para pruebas locales, `supabase/config.toml` define el proyecto aislado `tonicrespo-tests` en los puertos 55321/55322. `npm run supabase:test:start` aplica las migraciones automáticamente sobre una base vacía, sin importar contenido del cliente. `npm run test:supabase:local` verifica la edición y `npm run supabase:test:stop` elimina sólo esa infraestructura temporal. Más detalles en [tests/README.md](../tests/README.md).

### Drafts

No hay drafts que ejecutar. `supabase/drafts/` se eliminó deliberadamente porque contenía borradores antiguos y no aplicados; no forma parte del esquema actual.

Después valida el proyecto:

```bash
npm run verify:supabase -- --require-service
```

Este comando no modifica datos. Comprueba las columnas `translations`, la configuración global, la función de borrado de obras, la lectura pública y los cinco buckets requeridos.

## Correo de contacto

El flujo activo usa enlaces `mailto:` y no requiere Resend, SMTP ni Edge Functions. El destinatario se guarda en `site_settings`, clave `global`, dentro de `value.contact.email`; el correo predeterminado es `eulaliaricart@gmail.com` y sigue siendo editable por el administrador.

El header abre la aplicación de correo del visitante con sólo ese destinatario. El contacto de una obra prepara además un borrador con la información de la obra. Es necesario tener una aplicación de correo configurada y enviar el mensaje desde ella: la web no realiza ni confirma el envío.

La validación obligatoria del despliegue sigue comprobando las pruebas de frontend y Supabase local, las lecturas públicas, las imágenes y una dirección de contacto válida. No depende de credenciales de un proveedor de correo.

### Función heredada, fuera del flujo activo

Se conservan el código `supabase/functions/send-contact-email/index.ts`, sus pruebas unitarias y la función publicada con verificación JWT. El frontend ya no la invoca; no se ha eliminado ni modificado su configuración remota para este cambio.

`npm run test:public-health -- --require-email-function` es sólo un diagnóstico opcional de esa función mediante un honeypot sin envío. Puede devolver un error por falta de `RESEND_API_KEY` o `CONTACT_FROM_EMAIL`; no forma parte de los requisitos del despliegue actual. Reactivar el envío web requeriría una decisión explícita, credenciales del proveedor, dominio remitente verificado y una prueba de entrega autorizada. Nunca exponer secretos de correo como variables `VITE_*`.

## Contenido y copias

Para descargar la copia lógica completa que usa la web, incluidas todas las filas de contenido y todos los archivos de cada bucket:

```bash
npm run backup:supabase
```

Se creará un directorio con fecha dentro de `supabase/backups/` que contiene:

```text
manifest.json
schema/migrations/
database/*.json
storage/<bucket>/<ruta original>
auth/admin-users.json
```

`auth/admin-users.json` solo conserva identificadores y emails de administradores. Las contraseñas, tokens y sesiones de Supabase Auth no se pueden ni se deben exportar.

Para restaurar un snapshot en el proyecto indicado por el `.env` actual:

```bash
npm run restore:supabase -- --latest
npm run restore:supabase -- --latest --write
```

La primera orden solo muestra el alcance. La segunda sube archivos y hace `upsert` de las tablas por sus claves primarias; no borra datos que ya existan en el destino. Antes de restaurar en un proyecto nuevo, aplica primero las migraciones. Las URLs de Storage se reescriben automáticamente del proyecto de origen al proyecto destino.

Para una copia con un nombre fijo:

```bash
npm run backup:supabase -- --output supabase/backups/antes-de-cambios
```

Se puede sustituir solo ese directorio local añadiendo `--overwrite`.

## Límite de una clave de servicio

`SUPABASE_SERVICE_ROLE_KEY` permite exportar las tablas propias de la web y los buckets, pero no permite crear un `pg_dump` físico, aplicar DDL remoto ni recuperar contraseñas Auth. Para una copia física de PostgreSQL hace falta además una cadena de conexión de base de datos obtenida en Supabase Dashboard, y una instalación local de `pg_dump`.
