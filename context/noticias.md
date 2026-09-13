# Noticias: feed y editor

## Visualización

`/noticias` presenta un feed continuo, sin fondos de tarjeta, esquinas redondeadas ni brillo. En móvil las imágenes ocupan el ancho de pantalla; en escritorio el contenido se centra con un ancho de lectura limitado. Se mantienen la tipografía y el fondo configurados para la web.

El buscador está siempre arriba. **Filtros** despliega fechas desde/hasta y categoría; muestra un contador de filtros, resultados y una acción para limpiar. La búsqueda admite mayúsculas y acentos y utiliza la categoría traducida. Un rango de fechas invertido muestra una explicación.

Cada noticia muestra todas sus imágenes en una galería de desplazamiento horizontal nativo, sin limitarse a las primeras cuatro. Tiene flechas, indicadores de posición, teclado y apertura de imagen ampliada; deslizar no abre la ampliación accidentalmente. No hay reproducción automática. Se respeta el movimiento reducido y las proporciones de las imágenes, sin recortar carteles. El enlace **Visitar la noticia** aparece siempre al final del contenido cuando hay una URL HTTP(S) válida. No se renderizan enlaces ejecutables ni con credenciales. Las descripciones y pies conservan sus saltos de línea.

## Edición

**Añadir noticia / Editar noticia** divide el formulario en información, contenido/traducciones y galería. Guardar y Cancelar permanecen accesibles mientras el cuerpo se desplaza. Las noticias existentes se abren en el idioma de la web; las nuevas empiezan por español.

- Las selecciones sucesivas de archivos se acumulan. Cada imagen tiene miniatura, nombre, estado y controles para moverla o quitarla. La primera será portada.
- En móvil se ven dos columnas de miniaturas; los controles principales tienen al menos 44 píxeles. Al quitar una imagen con teclado, el foco pasa a la vecina o al selector si no quedan imágenes.
- La selección y los cambios de orden son un borrador local hasta Guardar. Cancelar no modifica la galería publicada. Los archivos locales se comprueban y decodifican antes de subirlos; se rechazan archivos vacíos, formatos no admitidos, duplicados seleccionados y tamaños superiores a 25 MB.
- Quitar una imagen guardada retira su referencia de esa noticia al guardar, pero **no borra el archivo de Storage**, que podría compartirse con otro contenido. Las subidas se reutilizan durante los reintentos. Tras errores inciertos pueden quedar archivos sin referencia para una limpieza independiente y deliberada.
- Un guardado confirmado seguido de un error de recarga conserva el formulario y el listado anterior; **Volver a cargar** repite solo la lectura. Una respuesta de escritura incierta ofrece **Comprobar guardado** y bloquea la repetición a ciegas. No se simula una confirmación de guardado cuando falla la petición.

## Supabase

Migración `supabase/migrations/20260913205901_news_item_atomic_save.sql`, aplicada el 13 de septiembre de 2026 al proyecto `aqleunaqzixdatttvqby`. Añade únicamente `save_news_item(uuid, jsonb, jsonb)`: texto y galería se confirman o revierten juntos. `image_items = null` conserva la galería y actualiza su texto alternativo; `[]` la vacía y elimina la portada de la ficha. La edición conserva publicación, slug y orden de la noticia.

La función utiliza permisos del llamante, comprueba la identidad y autorización administrativa, mantiene RLS y limita la espera por bloqueos a cinco segundos. Anónimos no pueden ejecutarla; autenticados que no sean administradores tampoco pueden guardar. Las fechas son DATE, sin conversiones dependientes de la zona horaria.

Se verificó que la activación no modificó ninguna de las 11 noticias ni sus 15 referencias de imagen (huellas iguales antes/después). No se desplegó el frontend. Los asesores no añadieron avisos de seguridad; permanecen los preexistentes de `is_admin()` y protección frente a contraseñas filtradas, documentados en `gestor-contenido.md`.

## Comprobaciones

`tests/e2e/news.spec.ts` cubre móvil y escritorio, swipe real, teclado, filtros, enlaces, idiomas, galería, archivos, errores y reintentos. `tests/unit/news-presentation.test.mjs` y `news-service.test.mjs` prueban las reglas de presentación y el contrato de guardado. El runner PostgreSQL existente incluye `tests/integration/news-atomic-sql.mjs`: atomicidad incluso cuando falla una segunda imagen, roles, datos inválidos, fechas, galerías y concurrencia. Estas pruebas forman parte de los comandos de calidad ya usados por el workflow, sin escribir en producción.

Resultado del 13 de septiembre: 199 pruebas unitarias, 38 PostgreSQL, 36 casos de navegador focales y 62 de regresión de edición/visualización correctos. Tipos y compilación de producción correctos; sigue el aviso preexistente de Vite por un bundle principal de más de 500 kB. Se inspeccionaron capturas a 320, 390 y 1440 px, incluidas miniaturas y foco de teclado.

`tests/integration/news-live-rollback.sql` se ejecutó manualmente contra Supabase: creó una noticia solo dentro de una transacción, comprobó edición, galerías, traducciones y denegación de usuarios no administradores, y revirtió todas las escrituras. Las 11 noticias y 15 imágenes conservaron sus huellas. No crea usuarios, no modifica archivos de Storage ni comprueba un intercambio de contraseña en navegador; no se ejecuta automáticamente contra producción.
