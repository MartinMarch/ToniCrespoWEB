# Supabase

Esta carpeta es la fuente de verdad local para el esquema y las copias operativas de Toni Crespo.

## Estructura

- `migrations/`: cambios de esquema versionados. Se ejecutan en orden por nombre.
- `backups/`: snapshots locales descargados desde el proyecto Supabase. Su contenido se ignora en Git porque incluye obra, textos y metadatos de administradores.

## Qué SQL ejecutar

### Proyecto actual de Toni Crespo

Las dos primeras migraciones ya están aplicadas en el proyecto que contiene el contenido migrado. En el SQL Editor ejecuta ahora, y solo una vez, el contenido completo de:

```text
supabase/migrations/20260811110000_contextual_editing.sql
```

Es la migración que añade las columnas `translations` y la función de borrado de obras. Corrige el error de edición contextual que muestra la web.

No vuelvas a ejecutar `20260810210000_admin_editing.sql` ni `20260811100000_site_assets_bucket.sql` sobre este proyecto: sus tablas, buckets y políticas ya existen y el SQL Editor puede devolver errores de políticas duplicadas.

### Proyecto Supabase nuevo y vacío

Ejecuta una sola vez los archivos completos, exactamente en este orden:

1. `supabase/migrations/20260810210000_admin_editing.sql`
2. `supabase/migrations/20260811100000_site_assets_bucket.sql`
3. `supabase/migrations/20260811110000_contextual_editing.sql`

Después restaura una copia con `npm run restore:supabase -- --latest --write` o carga el contenido desde una copia válida.

### Drafts

No hay drafts que ejecutar. `supabase/drafts/` se eliminó deliberadamente porque contenía borradores antiguos y no aplicados; no forma parte del esquema actual.

Después valida el proyecto:

```bash
npm run verify:supabase -- --require-service
```

Este comando no modifica datos. Comprueba las columnas `translations`, la función de borrado de obras, la lectura pública y los cinco buckets requeridos.

## Correo de contacto

No hay SQL que ejecutar para esta funcionalidad. El código vive en `supabase/functions/send-contact-email/index.ts` y se ejecuta de forma segura en Supabase Edge Functions. Usa Resend para el envío, con el destinatario fijado en el secreto `CONTACT_RECIPIENT_EMAIL`; el cliente no puede cambiarlo.

1. Crea una cuenta en Resend y verifica el dominio que usarás como remitente.
2. Instala e inicia sesión en Supabase CLI, y enlaza este repositorio al proyecto correcto.
3. Configura los secretos. Sustituye los valores de ejemplo por los reales y conserva el dominio remitente verificado por Resend:

```bash
supabase link --project-ref <PROJECT_REF>
supabase secrets set \
  RESEND_API_KEY=<RESEND_API_KEY> \
  CONTACT_FROM_EMAIL='Toni Crespo <contacto@tu-dominio-verificado.com>' \
  CONTACT_RECIPIENT_EMAIL=tonicrespo.art@gmail.com \
  CONTACT_ALLOWED_ORIGINS='https://tonicrespo.com,https://www.tonicrespo.com,http://localhost:5173'
supabase functions deploy send-contact-email
```

No pongas `RESEND_API_KEY` ni estas variables como `VITE_*`, ni las añadas a `.env` del frontend. El archivo `supabase/functions/send-contact-email/.env.example` solo sirve de guía para desarrollo local. La función valida los campos, limita longitudes, usa `reply_to` con el email del visitante y contiene un campo antispam oculto.

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
