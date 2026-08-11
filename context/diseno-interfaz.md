# Diseño de interfaz actual

Actualizado: 2026-08-10.

## Dirección visual

La interfaz se ha rediseñado como portfolio de artista contemporáneo: luminosa, editorial, contenida y centrada en las imágenes. La referencia de composición fue una web de artista con navegación sobria y dos accesos principales de obra, adaptada al contenido y navegación de Toni Crespo.

## Tipografía y color

- Tipografía principal: `Platypi` desde Google Fonts, con fallback `Times New Roman`.
- Tipografía aplicada a logotipo, navegación, títulos y texto de interfaz.
- Fondo general: blanco en la parte superior hasta gris crema más oscuro en el extremo inferior.
- Texto principal: negro suave `#111111`.
- Superficies y bordes: blancos y grises neutros de bajo contraste.
- No se utilizan tarjetas anidadas ni fondos decorativos independientes.

## Header

- Fondo blanco y posición sticky.
- Logo SVG a la izquierda, navegación alineada en la misma línea y redes a la derecha.
- Navegación visible: `Obra`, `Fotografía`, `Noticias`, `Trayectoria`.
- Cada enlace y el logo tienen un aumento sutil al hacer hover.
- El header se oculta con una transición al bajar más de 48 px y vuelve al subir o al cambiar de ruta.
- Instagram y WhatsApp son botones circulares con relleno de color en hover; no muestran tooltip ni texto visible.
- Junto a Instagram y WhatsApp hay un botón circular de Ajustes con icono de engranaje. Abre un panel flotante con selección de idioma, modo claro/oscuro y botón de edición web.
- El botón de edición abre login si no hay sesión admin; con sesión activa muestra un panel de gestión flotante para Trayectoria, Noticias, Fotografía, Lienzos y Láminas.
- Las preferencias de idioma y tema se guardan en `localStorage` y aplican `lang` y `data-theme` en el elemento raíz.
- El tema oscuro usa negros y grises, invierte el logo SVG para conservar legibilidad y evita convertir el portfolio en una paleta de color adicional.

## Inicio

- Dos accesos principales: `Lienzos` y `Láminas`.
- Las portadas ocupan la parte principal de la pantalla y escalan sutilmente al hover.
- En escritorio se disponen en dos columnas separadas; en móvil en una columna.
- Debajo se muestra el texto de presentación que llega de la web actual.

## Obra

- La ruta `/obra` solo dirige a los dos soportes principales.
- `/lienzos` y `/laminas` presentan colecciones, cada una con primera obra destacada.
- Las colecciones y obras incluyen breadcrumb compacto con enlaces de vuelta.
- En la vista de obra, las imágenes son grandes, con metadatos debajo y acciones de contacto y Ambientes.
- El botón de Ambientes abre una interfaz a pantalla completa con carrusel horizontal y controles de flecha/paginación.

## Modal de obra y Ambientes

- La imagen principal se puede abrir a pantalla completa con botón circular de cierre.
- En escritorio, el modal de obra incluye lupa rectangular activada por puntero. En móvil no se activa para evitar interferir con el gesto táctil.
- El modal de Ambientes presenta el nombre de la obra centrado, una escena activa de gran tamaño, escenas adyacentes atenuadas y controles accesibles por ratón, teclado o scroll.
- En móvil se prioriza una composición compacta: título, escena a ancho completo, flechas sobre la escena y paginación debajo.

## Fotografía, noticias y trayectoria

- Fotografía: una columna de imágenes limpias, sin nombres visibles sobre las fotos.
- Noticias: listado vertical de tarjetas horizontales claras; soporta imagen principal, miniaturas, búsqueda y lightbox de imagen.
- Trayectoria: título compacto, retrato principal contenido por calidad de imagen, texto y dos imágenes secundarias al final.

## Footer

- Tres zonas en escritorio: marca y Mallorca, navegación, datos de contacto.
- En móvil se apila y alinea a la izquierda.
- El enlace de contacto no se duplica como página independiente: la información está centralizada aquí.

## Responsive y accesibilidad

- Mínimo de viewport: 320 px.
- Las rejillas de Inicio y de colecciones pasan a una columna en móvil.
- Los textos usan límites y wrapping para no desbordar botones o tarjetas.
- Las imágenes se cargan con `loading="lazy"` salvo las necesarias en la primera vista.
- Los modales se cierran con Escape en escritorio y con botón o clic fuera de su contenido.
- `prefers-reduced-motion` desactiva las transiciones del carrusel de Ambientes.
