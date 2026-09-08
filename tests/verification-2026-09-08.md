# Verificación del 8 de septiembre de 2026

## Resultados locales y del backend real

- 68 pruebas unitarias y de guardas: correctas, incluidas 30 comprobaciones del código de correo con proveedor simulado.
- 50 pruebas Playwright: correctas en escritorio y móvil táctil emulado, con Supabase simulado y solicitudes externas bloqueadas.
- Regresiones de componentes: texto/editor de inicio y 161 comprobaciones de ambientes, con navegación en cinco tamaños de pantalla.
- Comprobación de tipos de aplicación y tests y compilación de producción: correctas. Vite conserva un aviso no bloqueante de tamaño del bundle principal.
- Integración real contra un Supabase local recién creado desde las cinco migraciones: 14 comprobaciones correctas.
- Integración real contra el proyecto publicado: 14 comprobaciones correctas de Auth, edición, permisos, traducciones y Storage. Las filas editoriales temporales permanecieron ocultas. Se verificó la eliminación de sus usuarios, sesiones, registros y archivos; no se modificaron cuentas administrativas existentes ni contenido del cliente.
- Salud pública: ocho tablas consultadas; 230 URLs únicas de imágenes utilizadas por la interfaz responden correctamente. La lista de administradores no es accesible anónimamente.

## Fallos corregidos durante la verificación

1. El inicio de sesión no recargaba las obras previamente ocultas. Ahora el contenido se recarga al cambiar de identidad y descarta respuestas antiguas.
2. Editar el texto alternativo de una noticia no actualizaba sus imágenes hijas. Ahora se sincroniza y se respeta la traducción seleccionada.
3. Faltaban las políticas de acceso de `site-assets`. Reparación aplicada mediante la migración remota `20260908105629_restore_site_assets_policies.sql`.
4. Una excepción de red del proveedor de correo no producía una respuesta controlada. Ahora devuelve JSON con CORS y existe un tiempo máximo de espera.
5. En Chromium 153, marcar el idioma predeterminado cerraba inesperadamente el menú al deshabilitar la estrella enfocada. Reproducido con el mismo navegador de GitHub y corregido trasladando antes el foco al selector adyacente, sin relajar la comprobación del guardado.

## Bloqueo real de publicación: correo

Se publicó `send-contact-email`, versión 1, con verificación JWT activa. El preflight permite el origen de GitHub Pages. Una petición honeypot, sin campos de correo ni envío, devuelve HTTP 503: «El servicio de correo no está configurado todavía».

Se necesitan `RESEND_API_KEY` y `CONTACT_FROM_EMAIL` en los secretos de Edge Functions, con un dominio remitente verificado en Resend. El control obligatorio previo al despliegue falla mientras falte esta configuración. No se ha enviado ningún mensaje real ni se ha acreditado entrega.

## Alcance de seguridad y límites

Los avisos de Supabase sobre la ejecución de `is_admin()` como SECURITY DEFINER se revisaron: la función únicamente consulta la pertenencia del email firmado por Auth, tiene un `search_path` fijo y no acepta datos que concedan privilegios. Las pruebas verifican que ni anónimos ni usuarios normales pueden editar o escalar mediante metadatos. No se cambiaron estas políticas a invoker ni se revocó una función necesaria para RLS.

La [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) sigue desactivada; es una mejora de endurecimiento pendiente, no una prueba de fallo de inicio de sesión. Véanse los avisos sobre [ejecución anónima de SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) y [ejecución autenticada](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

La emulación de Chromium no cubre todos los navegadores o dispositivos físicos. El SDK real y los E2E con backend simulado son comprobaciones complementarias, no un inicio de sesión con las contraseñas de los administradores existentes. Este informe no afirma que el correo ni un nuevo despliegue estén funcionando mientras persista el bloqueo anterior.
