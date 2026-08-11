# Ambientes de obra

## Sistema actual

Los ambientes ya no utilizan marcos o huecos fijos dentro de fotografías preexistentes. Ese sistema obligaba a calibrar cada fondo para un único tamaño y hacía que las obras cuadradas, verticales o panorámicas pareciesen pegadas al escenario.

La interfaz usa una composición híbrida:

1. Fondo fotográfico frontal con una pared limpia y sin obra instalada.
2. Plano de pared seguro definido una vez por fondo (`x`, `y`, `width`, `height`) y con unas dimensiones virtuales en centímetros (`widthCm`, `heightCm`).
3. Marco generado por CSS sobre esa zona, con sombra y acabado distinto para lienzo o lámina.
4. Imagen original de Toni dentro del marco, sin generación, recorte ni deformación.

El cálculo en `src/components/artworks/ArtworkShowcaseList.tsx` conserva el ratio real de la obra. Prioriza las dimensiones físicas cuando existen, corrige el orden en los registros antiguos si contradice el ratio de la imagen, y convierte directamente los centímetros de la obra al plano de pared virtual. Una obra de 30 x 30 cm, por tanto, se sitúa en un escenario diseñado para esa escala en vez de competir visualmente con un lienzo de 140 cm. Las láminas sobre papel se presentan con marco y passepartout; los lienzos usan un canto fino de galería.

## Calibración y límite de escala física

Cada fondo tiene un plano de pared virtual con una medida y un intervalo de obra admisible. El selector reúne las tres escenas que corresponden al lado mayor de la obra. Esto garantiza coherencia entre las piezas de 30 cm, los lienzos medios de 90 a 146 cm y los formatos panorámicos de hasta 220 cm, sin limitar cada obra a una única vista.

La calibración es visual y consistente dentro de la interfaz, no una medición arquitectónica certificada. Los interiores se generaron sin una referencia física verificable; por ello no se puede afirmar, por ejemplo, que el banco mida exactamente lo que sugiere el plano virtual.

No debe comunicarse como escala real. Para alcanzarla se necesita, por cada escena, al menos una referencia física conocida y estable, por ejemplo:

1. El ancho real del banco o sofá y su ancho exacto en píxeles dentro de la imagen.
2. La altura de suelo a techo o el tamaño conocido de un panel.
3. Una plantilla PSD/3D con plano de pared y escala definidos.

Con esa referencia se podrá sustituir la medida virtual por un factor píxeles/cm y calcular la obra a tamaño arquitectónicamente verificable dentro de la zona de pared. Hasta entonces, la solución debe entenderse como una presentación visualmente proporcionada y calibrada por intervalos de tamaño.

Los escenarios no se usan indistintamente: cada uno se ha encuadrado para su intervalo. Esto evita que una lámina pequeña aparezca perdida en una pared de gran formato o que un díptico panorámico quede comprimido en un estudio cerrado.

## Fondos activos

| Escenario | Archivo | Plano de pared virtual | Lado mayor admisible | Uso preferente |
| --- | --- | --- | --- | --- |
| Estudio de lámina | `/media-images/mockups/generated/small-print-wall-v3.jpg` | 90 x 80 cm; 52% x 69%, centrado | 0-65 cm | Láminas y piezas pequeñas, especialmente 30 x 30 cm |
| Rincón de nogal | `/media-images/mockups/generated/small-print-cabinet-v1.jpg` | 95 x 82 cm; 54% x 66%, centrado | 0-65 cm | Láminas y piezas pequeñas |
| Dormitorio | `/media-images/mockups/generated/small-print-bedroom-bench-v1.jpg` | 100 x 82 cm; 58% x 65%, centrado | 0-65 cm | Láminas y piezas pequeñas |
| Salón de lienzo medio | `/media-images/mockups/generated/medium-canvas-wall-v2.jpg` | 240 x 144 cm; 61% x 55%, centrado | 66-160 cm | Lienzos cuadrados, verticales y medios |
| Salón de lino | `/media-images/mockups/generated/medium-canvas-sofa-v1.jpg` | 270 x 160 cm; 72% x 61%, centrado | 66-160 cm | Lienzos cuadrados, verticales y medios |
| Aparador de nogal | `/media-images/mockups/generated/medium-canvas-sideboard-v1.jpg` | 250 x 160 cm; 73% x 66%, centrado | 66-160 cm | Lienzos cuadrados, verticales y medios |
| Sala de díptico | `/media-images/mockups/generated/wide-diptych-wall-v2.jpg` | 360 x 168 cm; 75% x 52%, centrado | 160-260 cm | Dípticos y lienzos horizontales grandes |
| Galería de caliza | `/media-images/mockups/generated/wide-diptych-limestone-bench-v1.jpg` | 430 x 175 cm; 78% x 58%, centrado | 160-260 cm | Dípticos y lienzos horizontales grandes |
| Galería de roble | `/media-images/mockups/generated/wide-diptych-oak-bench-v1.jpg` | 430 x 170 cm; 80% x 61%, centrado | 160-260 cm | Dípticos y lienzos horizontales grandes |

Los nueve fondos se generaron como interiores fotográficos frontales con pared vacía y se exportaron a JPEG de 1536 x 1024. Los tres escenarios de lámina están deliberadamente más cerrados para que una pieza de 30 cm conserve una presencia legible y verosímil.

## Registro de generación

Modo usado: `imagegen` integrado.

Prompts resumidos:

- Estudio mediterráneo íntimo y cerrado, banco de roble de 90 cm, plano de pared vacío para una lámina de 30 x 30 cm y vista perfectamente frontal.
- Rincón de lectura con mueble bajo de nogal de 92 cm y pared vacía para una lámina de 30 x 30 cm.
- Dormitorio mediterráneo con banco de roble de 96 cm y pared vacía para una lámina de 30 x 30 cm.
- Salón editorial contemporáneo, sofá bajo de lino de 220 cm, plano de pared vacío para lienzos de 90 x 90 cm a 146 x 146 cm y vista perfectamente frontal.
- Salón de lino de 240 cm y pared frontal vacía para lienzos de 90 x 90 cm a 146 x 146 cm.
- Comedor residencial con aparador de nogal de 210 cm y pared frontal vacía para lienzos medios.
- Sala mediterránea de piedra, banco de travertino largo de 280 cm, plano de pared vacío para dípticos de 180 x 90 cm a 220 x 120 cm y vista perfectamente frontal.
- Sala con banco de caliza de 330 cm y pared frontal vacía para formatos panorámicos de 180 a 220 cm.
- Galería residencial de pared carbón y banco de roble de 350 cm para formatos panorámicos de 180 a 220 cm.

Las obras de Toni no se enviaron a generación ni se alteraron. Solo se generaron los fondos vacíos; el marco y la obra se componen en el navegador con CSS.

## Mantenimiento

Para añadir un fondo nuevo no hay que modificar obras individuales:

1. Usar una imagen frontal, a nivel de ojos, con una pared realmente vacía y suficiente espacio libre.
2. Guardarla en `media-images/mockups/generated/` en una relación aproximada 3:2.
3. Añadir una entrada a `roomMockups` con etiqueta, archivo, tono, intervalo de lado mayor y plano de pared seguro con sus centímetros virtuales.
4. Comprobar una obra cuadrada, una vertical, un díptico horizontal y una lámina desde el modal de Ambientes, verificando que cada una se asigne al intervalo correcto.

No deben usarse fondos con marcos, cuadros, espejos o perspectivas oblicuas dentro de la zona destinada a la obra. La imagen de la obra debe seguir siendo siempre el archivo original del catálogo.

## Recursos anteriores

Los fondos antiguos de `media-images/mockups/` se conservan por si hicieran falta en el futuro, pero ya no se cargan en la interfaz. La razón es que sus huecos fijos no permiten una adaptación fiable a los distintos formatos y medidas de la colección.
