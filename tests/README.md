# Pruebas de Toni Crespo

Las pruebas de interfaz, la integración con Supabase y la comprobación del servicio publicado son complementarias. Una interfaz que funciona con respuestas simuladas no demuestra que las políticas RLS o el correo de producción funcionen.

## Suites y alcance

| Ubicación | Qué comprueba | Servicios externos y escrituras |
| --- | --- | --- |
| `unit/*.test.mjs` | Atribución del poema, párrafos y traducciones de obras, texto escapado, medidas físicas y geometría de ambientes; código real de la función de correo con Deno y proveedor simulados (validación, CORS, destinatario y errores). | Sin acceso remoto ni envíos de correo. |
| `e2e/*.spec.ts` | React real en Chromium de escritorio y móvil táctil emulado: navegación, idiomas, portada, footer, colecciones, visor, filtros, contactos y formularios de edición. Incluye errores, reintentos, cancelaciones, archivos huérfanos y contenido oculto. | Supabase, Storage, Auth y correo **simulados** mediante `helpers/mock-supabase.ts`; las solicitudes externas se interceptan. No modifica producción. |
| `integration/*.test.mjs` | Pruebas locales de las guardas del ejecutor Supabase y del comprobador público: configuración, privilegios, HTTP, imágenes, CORS y honeypot. | Solicitudes simuladas o bloqueadas. No modifica servicios reales. |
| `integration/supabase-editing.mjs` | Auth, `is_admin`, RLS, CRUD editorial, traducciones, saltos de línea, visibilidad, ajustes aislados, Storage y borrado en cascada. | **Integración real** contra el destino elegido. Crea y elimina datos temporales; requiere consentimiento explícito. |
| `integration/public-health.mjs` | Lectura anónima del contenido y ajustes publicados, aislamiento de administradores y disponibilidad de imágenes utilizadas por la web. | Lecturas reales. Opcionalmente comprueba la función de correo mediante un honeypot que no envía mensajes. |
| `browser/*.mjs` | Comprobaciones auxiliares anteriores de ambientes y texto/editor de inicio mediante Chrome. | Mantienen sus ejecutores de compatibilidad en `scripts/`; no sustituyen las suites anteriores. |

## Comprobación habitual, sin tocar producción

Desde la raíz del repositorio, instalar las dependencias con `npm ci`. La primera ejecución de Playwright puede requerir instalar Chromium con `npx playwright install chromium`.

```bash
npm test
npm run test:ci
```

`npm test` ejecuta las pruebas locales y de interfaz. `test:ci` añade la comprobación de tipos, las regresiones de componentes y el build. Playwright inicia su propio servidor Vite en el puerto 4175; no reutiliza el servidor de desarrollo del usuario. Se puede cambiar mediante `E2E_PORT`. Las regresiones de componentes arrancan otro servidor aislado en 4177, que cierran al finalizar. Para usar un Chrome instalado, establecer `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Las capturas y trazas de fallos se generan en `test-results/`; el informe HTML está en `playwright-report/`. No contienen resultados de una integración remota por el mero hecho de que Playwright termine correctamente.

Comandos acotados:

```bash
npm run test:unit
npm run test:e2e
npm run test:components
node --test tests/integration/*.test.mjs
```

## Integración real con Supabase local

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
npm run test:public-health -- --require-email-function
```

Requiere `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; en CI ambas deben estar en el entorno. Localmente admite `.env`. Rechaza claves de servicio y sesiones de usuario.

Comprueba ocho tablas con consultas de lectura y `is_admin=false`. Exige contenido público real en inicio, trayectoria y noticias, además de los ajustes globales; por tanto no está diseñado para una base local recién migrada y vacía. Examina las imágenes efectivamente utilizadas, omitiendo portadas y fuentes antiguas que ya no se renderizan. Usa HEAD o un GET parcial cancelado, seis solicitudes concurrentes, dos reintentos y un límite global de cuatro minutos. No guarda imágenes ni descarga archivos completos.

`--skip-media` sirve para una comprobación local rápida, pero omite la verificación de imágenes y no debe utilizarse como validación completa de despliegue.

`--require-email-function` exige que `send-contact-email` responda a OPTIONS y a un POST con sólo `{"website":"health-check"}`. Este honeypot no envía un correo. Si se define `PUBLIC_HEALTH_ORIGIN` con el origen del frontend, comprueba también CORS. Un resultado correcto **no demuestra entrega**, validez de las credenciales Resend ni verificación del dominio remitente; eso necesita una prueba de envío autorizada por separado.

## Límites de la validación

La emulación móvil no sustituye una revisión en dispositivos físicos ni cubre Safari/Firefox. Las comprobaciones HTTP de imágenes no decodifican el archivo completo ni evalúan su calidad visual. Las pruebas de permisos cubren los flujos de la aplicación, pero no reemplazan una auditoría integral de seguridad ni pruebas de carga. No presentar una suite simulada o una comprobación de sólo lectura como validación de escritura o entrega de correo en producción.
