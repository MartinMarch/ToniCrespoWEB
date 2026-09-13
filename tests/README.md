# Pruebas de Toni Crespo

Las pruebas de interfaz, la integración con Supabase y la comprobación del servicio publicado son complementarias. Una interfaz que funciona con respuestas simuladas no demuestra que las políticas RLS funcionen. Los contactos por correo usan `mailto:`: las pruebas comprueban el enlace y el borrador, no que el visitante envíe el mensaje desde su aplicación.

## Suites y alcance

| Ubicación | Qué comprueba | Servicios externos y escrituras |
| --- | --- | --- |
| `unit/*.test.mjs` | Atribución del poema, párrafos y traducciones de obras, texto escapado, medidas físicas y geometría de ambientes; contrato del workflow exclusivo del edge, sin publicaciones Pages; también se conservan las pruebas del código heredado de correo con Deno y proveedor simulados. | Sin acceso remoto ni envíos de correo. La función Resend ya no pertenece al flujo activo. |
| `e2e/*.spec.ts` | React real en Chromium de escritorio y móvil táctil emulado: navegación, idiomas, portada, footer, colecciones, visor, filtros, contactos `mailto:` y formularios de edición. Incluye errores, reintentos, cancelaciones, archivos huérfanos y contenido oculto. | Supabase, Storage y Auth **simulados** mediante `helpers/mock-supabase.ts`; las solicitudes externas se interceptan. No modifica producción ni envía correos. |
| `integration/*.test.mjs` | Pruebas locales de las guardas del ejecutor Supabase y del comprobador público: configuración, privilegios, HTTP, imágenes, CORS y honeypot. | Solicitudes simuladas o bloqueadas. No modifica servicios reales. |
| `integration/supabase-editing.mjs` | Auth, `is_admin`, RLS, CRUD editorial, traducciones, saltos de línea, visibilidad, ajustes aislados, Storage y borrado en cascada. | **Integración real** contra el destino elegido. Crea y elimina datos temporales; requiere consentimiento explícito. |
| `integration/catalog-live-rollback.sql` | Comprobación manual posterior a la migración: permisos, disponibilidad, edición, movimientos, conflictos, ocultación y borrados del catálogo. | **SQL real** mediante conexión de confianza, fuera de CI. Simula permisos dentro de una transacción y termina en `ROLLBACK`; no toca Storage ni crea usuarios. |
| `integration/public-health.mjs` | Lectura anónima del contenido y ajustes publicados, dirección de contacto válida, aislamiento de administradores y disponibilidad de imágenes utilizadas por la web. | Lecturas reales. No invoca Resend en el flujo activo; conserva un diagnóstico opcional de la función heredada. |
| `browser/*.mjs` | Comprobaciones auxiliares anteriores de ambientes y texto/editor de inicio mediante Chrome. | Mantienen sus ejecutores de compatibilidad en `scripts/`; no sustituyen las suites anteriores. |

## Comprobación habitual, sin tocar producción

Desde la raíz del repositorio, instalar las dependencias con `npm ci`. La primera ejecución de Playwright puede requerir instalar Chromium con `npx playwright install chromium`.

```bash
npm test
npm run test:ci
```

`npm test` ejecuta las pruebas locales y de interfaz. `test:ci` añade la comprobación de tipos, las pruebas del extractor de WordPress, las regresiones de componentes y el build. Playwright inicia su propio servidor Vite en el puerto 4175; no reutiliza el servidor de desarrollo del usuario. Se puede cambiar mediante `E2E_PORT`. Las regresiones de componentes arrancan otro servidor aislado en 4177, que cierran al finalizar. Para usar un Chrome instalado, establecer `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Las capturas y trazas de fallos se generan en `test-results/`; el informe HTML está en `playwright-report/`. No contienen resultados de una integración remota por el mero hecho de que Playwright termine correctamente.

Comandos acotados:

```bash
npm run test:unit
npm run test:e2e
npm run test:components
node --test tests/integration/*.test.mjs
```

## Integración real con Supabase local

### Reorganización atómica de obras

```bash
npm run test:organization:sql
# Opcional: revisar también los avisos de seguridad de la función nueva.
npm run test:organization:sql -- --advisors
```

Requiere las herramientas del servidor PostgreSQL (`pg_config`, `initdb`, `pg_ctl`, `psql`). El ejecutor crea un clúster privado temporal conectado únicamente por socket Unix, aplica las migraciones del repositorio y lo elimina al terminar. No lee `.env`, no abre puertos y no accede a Supabase remoto. Comprueba permisos reales, transacciones, conflictos concurrentes, colisiones de identificadores y conservación de imágenes, textos y estados publicado/oculto. GitHub ejecuta esta prueba antes del resto de la calidad y del despliegue.

`e2e/artwork-organizer.spec.ts` cubre por separado la interfaz del panel con Supabase simulado: acceso administrativo, miniaturas, arrastre con ratón/teclado/táctil, movimiento mediante controles, búsqueda, borradores, deshacer/rehacer, confirmaciones, guardado y recuperación de errores. Estas pruebas no reorganizan el catálogo real.

`e2e/content-manager.spec.ts` amplía la cobertura al gestor: separación de ramas, colecciones recientes permanentes, creación/edición/eliminación, visibilidad y disponibilidad independientes, etiqueta pública, filtros y recuperación después de guardar. Las pruebas SQL también verifican estas restricciones frente a consultas directas y cambios concurrentes. Véase [guía del gestor](../context/gestor-contenido.md).

También comprueba el catálogo heredado en los cuatro idiomas sin filtros por palabras de la técnica, los avisos editoriales y su reparación, y el reemplazo opcional de imágenes sin borrar archivos compartidos. Una respuesta de escritura incierta conserva el archivo subido: un error HTTP no demuestra que la obra no se haya guardado.

`e2e/collection-description.spec.ts` recorre la edición y publicación simulada de descripciones en colecciones normales y recientes, los cuatro idiomas, el listado antes de entrar y las rutas de soporte y `/obra/:slug`. Comprueba la aparición inmediata debajo del título, alineación justificada o centrada persistente, vista previa y cancelación/reintento, párrafos y saltos de línea sin recortes, recargas, apertura del editor en el idioma visitado, texto vacío, escape de HTML y márgenes móviles sin solapar las obras.

`e2e/news.spec.ts` comprueba el listado de noticias sin marcos móviles, galerías completas con deslizamiento táctil y navegación por teclado, filtros compactos y enlaces seguros. Incluye selección incremental de archivos, vista previa, orden, retirada de todas las imágenes, traducciones y guardado atómico simulado. Distingue un rechazo confirmado de una respuesta perdida o un fallo al recargar después de guardar: no repite escrituras inciertas ni elimina sus imágenes. El mock del RPC verifica el contrato de la interfaz; no demuestra las transacciones ni los permisos de la base publicada.

`integration/collection-description-live-rollback.sql` es una comprobación **manual**, mediante conexión de confianza, del guardado real de descripción/alineación en una colección normal y una reciente de cada rama. Verifica permisos administrativos, conservación de otros campos y restricciones del valor. Simula las claims de un administrador confirmado existente, no su intercambio de contraseña. No crea usuarios ni toca Storage: todas las escrituras editoriales se revierten con `ROLLBACK`. No forma parte del workflow automático ni debe ejecutarse como un test de producción ordinario.

### Comprobación manual posterior a la migración

`integration/catalog-live-rollback.sql` se ejecuta completo mediante una conexión Supabase de confianza, únicamente con autorización para el proyecto concreto. No pertenece al workflow ni se ejecuta desde el navegador. Requiere un administrador ya existente y confirmado; simula sus claims de sesión y los de otros roles solo dentro de la transacción, sin leer contraseñas ni crear usuarios de Auth. Comprueba permisos y operaciones reales del catálogo y acaba con `ROLLBACK`, sin dejar cambios del ensayo ni modificar Storage. No sustituye una prueba del inicio de sesión real por contraseña ni las pruebas E2E con Auth simulado.

### Auth, CRUD, RLS y Storage

Requiere Docker en funcionamiento. La pila de pruebas es independiente del proyecto publicado y se construye a partir de las migraciones del repositorio.

```bash
npm run supabase:test:start
npm run test:supabase:local
npm run supabase:test:stop
```

Usar estos comandos sólo con la instancia de pruebas; no detener ni restablecer otros proyectos Supabase. `supabase:test:stop` elimina los contenedores y volúmenes temporales de `tonicrespo-tests`, sin crear una copia; no guardar allí contenido que se necesite conservar. El ejecutor local obtiene sus propias credenciales del servicio local y las entrega a la suite mediante variables `SUPABASE_TEST_*`.

La integración comprueba, entre otros casos:

- Administrador temporal autenticado; usuario normal y anónimo sin permisos de edición. Los metadatos editables por el usuario no conceden administración.
- Inserciones, actualizaciones y borrados denegados a clientes no autorizados; RPC de borrado sin elevación de privilegios.
- Descripciones con líneas y párrafos, traducciones independientes, ocultación de obras y recuperación de su visibilidad en el proyecto aislado.
- Trayectoria, colecciones, obras, fotografía, noticias e imágenes asociadas; actualización de portada y borrados en cascada.
- Ajustes en una clave de prueba, sin escribir `site_settings.global`.
- Subida a los cinco buckets y sustitución de un archivo en `site-assets`, con comprobaciones de permisos y limpieza.

Esta suite se conecta mediante el SDK, no mediante un navegador conectado a la base real. No prueba la entrega de correo, ni modifica las cuentas administrativas reales.

## Integración contra un proyecto de pruebas remoto

Definir `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` y `SUPABASE_TEST_SERVICE_ROLE_KEY` —o `SUPABASE_TEST_SECRET_KEY`— en el entorno o en `.env.test`. Nunca guardar claves en Git ni exponer una clave de servicio mediante variables `VITE_*`.

```bash
npm run test:supabase -- --run
```

La suite exige `--run` o `SUPABASE_TEST_RUN=true`. No reutiliza automáticamente las credenciales de producción de `.env`. La precedencia es `.env`, `.env.test` y finalmente las variables del proceso.

Si el destino coincide con el proyecto publicado conocido o con el host de `VITE_SUPABASE_URL`, exige además `--allow-production`. Ese permiso debe concederse conscientemente: sigue siendo una prueba con escrituras temporales. En producción, las filas editoriales permanecen con `is_published:false`; las transiciones a publicación sólo se prueban en el proyecto aislado. Las lecturas del contenido real publicado son de sólo lectura.

Cada ejecución utiliza un UUID: filas y claves con prefijo `e2e-tonicrespo-<UUID>`, archivos bajo `e2e/<UUID>/` y dos usuarios temporales `@tests.invalid`. La limpieza se ejecuta tras éxito o fallo normal y verifica filas, imágenes hijas, ajustes, archivos, permisos y usuarios. Primero retira la autorización administrativa y revoca las sesiones; después elimina los usuarios.

No interrumpir a la fuerza la ejecución. Un apagado, `SIGKILL` o fallo de red durante la creación de recursos puede impedir la limpieza completa. Conservar el identificador de ejecución y revisar exclusivamente sus recursos; no borrar prefijos generales ni contenido real. Los archivos temporales están en buckets públicos: ocultar la fila editorial no convierte el archivo en privado.

## Salud del Supabase publicado

```bash
npm run test:public-health
```

Requiere `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; en CI ambas deben estar en el entorno. Localmente admite `.env`. Rechaza claves de servicio y sesiones de usuario.

Comprueba ocho tablas con consultas de lectura y `is_admin=false`. Exige contenido público real en inicio, trayectoria y noticias, además de los ajustes globales y una dirección de contacto válida sin prefijo `mailto:` ni parámetros; por tanto no está diseñado para una base local recién migrada y vacía. Examina las imágenes efectivamente utilizadas, omitiendo portadas y fuentes antiguas que ya no se renderizan. Usa HEAD o un GET parcial cancelado, hasta seis solicitudes concurrentes y un límite global de cuatro minutos. Espacia los inicios al menos 250 ms por origen; ante HTTP 429, 5xx o errores de red permite sólo dos reintentos, con esperas de 1 y 2 segundos como mínimo. Respeta `Retry-After` en segundos o fecha y comparte la pausa de un 429 entre los trabajadores del mismo origen. Si la espera exigida excede el tiempo global disponible, falla sin reenviar antes de lo indicado. Un 429 persistente, una imagen ausente o un permiso denegado siguen bloqueando el despliegue; nunca se omiten imágenes para dar la prueba por correcta. Las pruebas unitarias simulan el reloj y las esperas. No guarda imágenes ni descarga archivos completos.

El control público exige además los campos `collections.is_recent` y `artworks.is_available`, y verifica que las obras accesibles pertenezcan a una colección publicada. Una migración pendiente o una política que exponga obras de una colección oculta hacen fallar esta comprobación.

`--skip-media` sirve para una comprobación local rápida, pero omite la verificación de imágenes y no debe utilizarse como validación completa de despliegue.

El despliegue mantiene como requisitos las pruebas de frontend y Supabase local, esta comprobación pública completa y el build. No exige la antigua función de correo: el frontend abre `mailto:` al destinatario configurado, por defecto `eulaliaricart@gmail.com`. El header sólo incluye el destinatario; el contacto de una obra prepara un borrador. Hace falta una aplicación de correo configurada y una acción de envío del visitante; no se confirma entrega desde la web.

### Diagnóstico opcional del correo heredado

```bash
npm run test:public-health -- --require-email-function
```

Esta opción no se ejecuta en el despliegue ni representa el contacto activo. Exige que la función heredada `send-contact-email` responda a OPTIONS y a un POST con sólo `{"website":"health-check"}`. El honeypot no envía un correo y puede fallar si faltan secretos Resend, sin afectar los enlaces `mailto:`. Si se define `PUBLIC_HEALTH_ORIGIN`, comprueba también CORS. Un resultado correcto no demuestra entrega ni validez de las credenciales del proveedor.

## Límites de la validación

La emulación móvil no sustituye una revisión en dispositivos físicos ni cubre Safari/Firefox. Las comprobaciones HTTP de imágenes no decodifican el archivo completo ni evalúan su calidad visual. Las pruebas de permisos cubren los flujos de la aplicación, pero no reemplazan una auditoría integral de seguridad ni pruebas de carga. No presentar una suite simulada o una comprobación de sólo lectura como validación de escritura o entrega de correo en producción.
