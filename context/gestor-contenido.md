# Gestor de contenido del catálogo

Acceso: **Edición web → Configurar web → Administrar contenido**. Ruta `/admin/contenido`; `/admin/organizar-obras` continúa funcionando como acceso compatible. Solo pueden entrar administradores verificados con el modo edición activo.

## Dos archivos independientes

- **Lienzos** y **Obra en papel** tienen colecciones propias. La navegación, los destinos al crear y el arrastre se limitan a la rama elegida. La base de datos también rechaza los movimientos entre ramas y el cambio de soporte de una colección.
- Cada rama tiene una colección permanente **Obras recientes**, inicialmente vacía y visible, para subir nuevas obras antes de reunirlas en una colección definitiva. Siempre aparece primero; no se renombra ni se elimina, pero se puede ocultar y editar su descripción.
- La migración no reclasifica ni mueve las obras existentes. La búsqueda localiza obras en todas las colecciones de la rama, incluidas las ocultas, y permite saltar a su colección. Los filtros no eliminan nada del borrador.

## Trabajo diario

1. Elige Lienzos u Obra en papel. Escoge una colección en el lateral o en los selectores de los dos paneles.
2. **Nueva obra** y **Añadir obra aquí** abren la ficha con su imagen y un selector de destino dentro de esa rama. **Nueva colección** crea una colección del soporte activo.
3. Desde **Gestionar** (los tres puntos de una obra), puedes editar su ficha, cambiar visibilidad/disponibilidad o eliminarla con confirmación.
4. **Visible al público** y **Disponible** son independientes. Una obra no disponible sigue mostrándose con su etiqueta; su contacto es una consulta, no una afirmación de disponibilidad. Una obra oculta no se muestra. Una colección oculta también oculta sus obras en la web y en las consultas públicas de la API.
5. Arrastra desde el asa, usa las flechas o **Mover** para cambiar el orden o la colección. En pantalla táctil mantén pulsada brevemente el asa; desliza el resto de la tarjeta para desplazarte. Teclado: espacio, flechas, espacio; Escape cancela.
6. El orden es un borrador: puedes deshacer/rehacer, cambiar de rama sin perderlo y revisar **Guardar cambios → Guardar organización**. Las fichas y estados se guardan al confirmar sus acciones. Si tienes orden pendiente, el gestor exige guardarlo o descartarlo antes de editar el contenido.

**Gestionar colección** permite editar, mostrar u ocultar. Solo se permite eliminar colecciones vacías y no permanentes. La comprobación se hace en una transacción para impedir que una obra añadida por otra persona se borre accidentalmente.

La descripción aparece **justo debajo del nombre de cada colección en el listado**, antes del contador de obras, sin tener que entrar. También se conserva dentro de la colección, debajo del título y antes de las obras, tanto en Lienzos como en Obra en papel y en las rutas compatibles `/obra/:slug`. Es texto plano con párrafos y saltos de línea, sin recortes ni ejecución de HTML; una descripción vacía no deja un bloque en blanco.

En **Editar colección → Alineación de la descripción** se puede elegir **Justificada** o **Centrada**, con vista previa antes de guardar. La elección se guarda por colección en `description_alignment` y se aplica a todos los idiomas, al listado y al detalle, en ordenador y móvil. Las colecciones existentes conservan la justificación hasta que se elija centrar; cancelar no cambia el texto ni su alineación.

Al editar una colección existente se abre el idioma actual de la web; crear una nueva sigue empezando por español. Las traducciones se guardan independientemente: editar una no sobrescribe las demás, y una traducción ausente usa el texto base en español, también en la vista previa. Todo esto se aplica asimismo a «Obras recientes», sin cambiar sus nombres protegidos.

Al eliminar una obra desde este gestor se elimina su ficha, pero se conserva el archivo de imagen para no romper posibles referencias compartidas. No hay papelera de fichas: se recomienda ocultar si se quiere recuperar la obra posteriormente. Ocultar una fila no convierte en privados archivos alojados en buckets públicos; la limpieza de archivos huérfanos es una tarea independiente.

La web muestra todas las colecciones publicadas de cada rama, incluidas las importadas y las vacías. Se ha retirado el filtro antiguo que exigía encontrar «lienzo» en los textos de una obra: ni la técnica, ni las traducciones, ni los datos incompletos deciden si aparece una colección. Las obras o colecciones ocultadas expresamente siguen ocultas.

Los avisos naranjas señalan fichas con título, medidas, técnica o imagen pendientes de revisar. El contador de una colección cuenta obras afectadas, no campos; una colección vacía no necesita revisión por estar vacía. Los motivos se pueden abrir con ratón, teclado o tacto desde **Revisar ficha**, y el filtro **Por revisar** permite localizarlas. La descripción, el pie de obra y las traducciones son opcionales. Corregir y guardar la ficha actualiza los avisos automáticamente.

**Editar ficha → Imagen de la obra** permite añadir o sustituir la fotografía. Si no se elige archivo, se conserva la actual. La sustitución actualiza imagen, miniatura y resolución en una sola escritura; no altera las medidas físicas introducidas, el origen de importación ni los archivos anteriores. Ante una respuesta de escritura incierta se conserva también el archivo recién subido y se aconseja recargar antes de repetir. Pueden quedar archivos huérfanos para limpieza posterior, pero no se borra a ciegas una imagen que podría estar referenciada.

## Activación de Supabase

Migraciones aplicadas al proyecto `aqleunaqzixdatttvqby` el 12 de septiembre de 2026; sus versiones locales coinciden con las registradas por Supabase MCP:

1. `supabase/migrations/20260912144544_artwork_organization.sql`: guardado transaccional del orden.
2. `supabase/migrations/20260912144600_artwork_catalog_branches.sql`: disponibilidad, ramas, dos colecciones recientes, protecciones y borrado seguro de colecciones vacías.

Son pasos separados del despliegue del frontend. No hay inicialización automática ni inserciones de colecciones desde el navegador. Si una rama carece de «Obras recientes», el gestor indica que falta activar la actualización. Las lecturas admiten datos anteriores; guardar los campos nuevos exige la migración.

La activación se verificó conservando exactamente los campos anteriores de las 206 obras y las 12 colecciones existentes (huellas del catálogo iguales antes/después); se añadieron únicamente los campos nuevos y las dos colecciones recientes vacías. El frontend no se desplegó.

El 13 de septiembre de 2026 se aplicó `supabase/migrations/20260913093831_collection_description_alignment.sql`: campo `description_alignment`, obligatorio, valor predeterminado `justify` y restricción a `justify`/`center`. Conserva las políticas RLS; la migración limita la espera por bloqueos a cinco segundos. Las huellas de todos los campos anteriores de las 14 colecciones y las 206 obras coincidieron antes y después. No se cambiaron textos, traducciones, visibilidad ni orden, ni se desplegó el frontend.

La descripción en el listado y su alineación se verificaron con 187 pruebas unitarias, 27 pruebas PostgreSQL locales, 24 casos de navegador específicos y 64 de edición/visualización y contraste. Pasaron los tipos y la compilación de producción. La comprobación pública real de las ocho tablas pasó (sin repetir la descarga/comprobación de imágenes, ajena a este cambio). `tests/integration/collection-description-live-rollback.sql` confirmó en Supabase el guardado de texto con párrafos y de ambas alineaciones en cuatro colecciones —normal y reciente en cada rama—, las restricciones y el rechazo a no administradores. Las escrituras de prueba se revirtieron y no quedó texto de prueba. La huella de las obras siguió igual; la de colecciones cambió tras una actualización concurrente de `retorn-al-jardi-dhivern` a las 09:41:58 UTC, posterior a la activación, que se conservó sin intervenir. Se mantuvieron únicamente los avisos de seguridad preexistentes documentados abajo.

## Seguridad y fallos

Las funciones de modificación usan permisos del llamante, RLS y comprobación administrativa, siguiendo las [pautas de funciones de Supabase](https://supabase.com/docs/guides/database/functions). El guardado del orden compara la pertenencia y posiciones originales para rechazar cambios concurrentes sin guardar a medias.

Si se confirma una escritura pero falla la recarga, se bloquean más cambios hasta **Recargar catálogo**, sin repetir la creación de obras. Si se pierde una respuesta de red, no se debe suponer que la operación falló: recargar y comprobar antes de repetir. Los formularios se conservan al cancelar una navegación; mientras se está guardando no se permite salir desde el panel.

## Pruebas

```bash
npm run lint
npm run lint:tests
npm run test:unit
npm run test:organization:sql
npx playwright test tests/e2e/artwork-organizer.spec.ts tests/e2e/content-manager.spec.ts
npm run test:components
npm run build
```

Las pruebas de navegador simulan Supabase. La suite SQL usa PostgreSQL temporal privado y comprueba permisos, ramas, colecciones permanentes, conflictos y transacciones reales. Ninguna de estas suites modifica el proyecto publicado. GitHub ejecuta las pruebas como requisito del despliegue, cuando se haga push.

`tests/integration/catalog-live-rollback.sql` es una comprobación manual posterior a la migración, ejecutada en la base real mediante una conexión de confianza. Simula dentro de una transacción los permisos de un administrador existente y prueba disponibilidad, edición multilineal, traducciones, altas, ocultación, movimientos, conflictos y borrados; acaba con `ROLLBACK`, sin tocar Storage ni dejar cambios del ensayo. No verifica el intercambio de contraseña del navegador ni se ejecuta automáticamente contra producción. `npm run test:public-health` comprueba además mediante la API pública los campos nuevos, las imágenes y que no se filtren obras de colecciones ocultas.

La revisión real posterior a la activación devolvió 14 colecciones públicas, 206 obras y 230 URLs de imagen correctas. Los avisos detectaron 183 fichas por revisar en 9 colecciones: 32 títulos de importación, 161 medidas pendientes o no válidas y 183 técnicas pendientes; no faltaban imágenes. Es un diagnóstico de los campos estructurados en ese momento, no un cambio ni una corrección automática del contenido.

Los asesores de seguridad no señalaron las nuevas funciones. Se mantuvieron los avisos preexistentes de ejecución de `is_admin()` con permisos del propietario ([anónimo](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [autenticado](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)) y de [protección frente a contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). `is_admin()` se usa deliberadamente en las políticas y no devuelve datos personales; esta comprobación no sustituye una auditoría de seguridad completa.
