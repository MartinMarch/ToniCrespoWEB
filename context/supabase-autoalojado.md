# Supabase autoalojado — migración del 9 de octubre de 2026

## Destino y publicación

La aplicación utiliza `https://supabase-bufon.duckdns.org`, publicado por Caddy hacia la VM 108 del OptiPlex (`192.168.68.74:8000`). PostgreSQL 17.11, Auth y Storage pertenecen a esta instancia. La entrada pública no publica Studio. El registro de cuentas está cerrado; se conservan las dos cuentas y sus permisos de administrador.

`.env.production` contiene exclusivamente la URL y una clave `sb_publishable_…`, diseñada para distribuirse al navegador. No autoriza escrituras por sí misma: RLS distingue visitantes, usuarios autenticados y administradores. Los secretos de servicio y del servidor permanecen fuera del repositorio.

Actions carga este archivo tanto para la prueba pública como para compilar. Los secretos antiguos de Cloud no intervienen. Un push a `main` ejecuta Quality, la comprobación pública y la publicación de una release; el consumidor de edge-proxy valida y activa la release. Se mantienen `deploy-pages.yml`, el formato del manifiesto, los checksums y la publicación atómica. El dominio principal es `https://tonicrespo.com`.

## Qué se ha trasladado

| Contenido | Cantidad |
| --- | ---: |
| Obras | 219 |
| Colecciones | 13 |
| Páginas | 4 |
| Fotografías | 7 |
| Noticias | 9 |
| Imágenes asociadas a noticias | 12 |
| Ajustes globales | 1 |
| Administradores / cuentas Auth | 2 / 2 |
| Archivos en cinco buckets | 283 (395.449.748 bytes) |

Se conservaron IDs, fechas, textos, traducciones, visibilidad y hashes de contraseña. Las referencias a Storage cambian de origen y conservan las rutas. No se copiaron sesiones activas: es necesario volver a iniciar sesión. Los objetos se cargaron mediante la API de Storage y recibieron nuevos identificadores internos de Storage; la aplicación utiliza las rutas, no esos identificadores.

El esquema reconstruido se contrastó con Cloud: 87 columnas, 20 índices, 18 restricciones, 7 funciones, 2 triggers, 23 políticas y 224 concesiones de permisos coinciden. La migración `restore_site_assets_policy_roles` incorpora cuatro políticas que estaban en Cloud pero diferían del historial local. El historial se aplicó manualmente sobre un destino vacío: no ejecutar `db push` sobre esta instancia sin reconciliar antes su historial de migraciones.

## Comprobaciones

Se compararon todas las filas de las ocho tablas y las dos tablas de cuentas, normalizando únicamente el formato de fecha y el origen de las URLs. Los hashes de contraseña coinciden. Los 283 archivos se descargaron del destino y sus SHA-256 coinciden con el origen.

La integración real superó 14 comprobaciones: autenticación, CRUD, traducciones, permisos de administrador, denegación a visitantes y usuarios sin permisos, y operaciones en los cinco buckets. Las cuentas y filas temporales se eliminaron. La compilación pasó 202 pruebas unitarias/de integración local, TypeScript y build. La vista previa navegó por seis secciones sin errores ni peticiones al antiguo proyecto Cloud.

## Correo y límites

El contacto de la web utiliza `mailto:` y conserva su destinatario editorial. La antigua función `send-contact-email` está copiada en el servidor, con verificación JWT, pero no se usa desde la web ni tiene configurado el proveedor Resend local. No confundirla con el flujo de contacto activo.

Auth no tiene SMTP configurado: el acceso con las contraseñas existentes funciona, pero recuperación de contraseña e invitaciones por correo requieren configurar SMTP. No se han enviado correos de prueba ni cambiado contraseñas. Un nuevo proyecto debe estudiar su aislamiento: añadir tablas a esta instancia comparte Auth y base de datos; no crea automáticamente otro proyecto independiente como en Cloud.

## Copias y reversión

La copia de origen, los hashes, el contrato del esquema y los scripts operativos están en `/root/projects/tonicrespo-migration` del Beelink. El subdirectorio `private` tiene permisos 0700 y contiene datos personales, hashes de contraseña y secretos: no se sube a Git ni se comparte. También conserva el volcado y la configuración del destino antes de importar.

El proyecto Cloud permanece intacto. Antes de borrarlo, verificar el acceso administrativo del propietario desde la web publicada y el acceso exterior. La evidencia de publicación y las copias posteriores se documentan en `/root/HOMELAB-DOCUMENTATION/SERVICIES/TONICRESPO-SUPABASE.md`.

Para revertir el frontend, cambiar la configuración pública al proyecto Cloud y publicar un nuevo commit pasando las comprobaciones. Si ya hubo ediciones locales, hay que trasladarlas primero: volver a la copia antigua sin sincronizar perdería esos cambios. Conservar las releases previas de Caddy; una publicación nueva es preferible a alterar manualmente el consumidor automático.

Referencia: [guía oficial de restauración de Cloud a self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform).
