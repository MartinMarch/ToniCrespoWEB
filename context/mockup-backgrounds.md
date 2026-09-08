# Ambientes de obra · versión local 2026-09-08

## Presentación

Nueve interiores nuevos generados con la herramienta integrada de imagegen. Solo se han generado paredes y mobiliario: las obras del catálogo no se han enviado a IA ni alterado.

La obra se superpone **sin marco, borde ni paspartú añadido**, tanto en lienzo como en papel. Se conserva una sombra suave y un ajuste de luminosidad por ambiente. La imagen utiliza `object-fit: contain`: no se recorta ni se deforma; si una fotografía ya tiene margen dentro del archivo original, este sistema no lo elimina.

Los fondos están en `src/assets/rooms/*-v2.webp`, a 1536 × 1024. Se ha cambiado únicamente la codificación PNG a WebP (calidad 88), sin recortar, redimensionar ni retocar los resultados. Pesan aproximadamente 1 MB entre todos. Vite los incluye en el build con nombres versionados; ya no se necesitan las antiguas URLs de fondos remotos para abrir los ambientes. No se han borrado recursos remotos ni hecho deploy.

## Escala

El catálogo `src/data/roomScenes.ts` define:

- Ancho de referencia del mueble en cm y su ancho observado como porcentaje de la fotografía final.
- Rectángulo de pared libre de muebles y objetos, comprobado visualmente.
- Centro de colocación, rango preferente de tamaños y luminosidad.

Se aplica **un único factor de escala** a ambos ejes, en `src/lib/artworkRoomGeometry.ts`:

```text
anchoObra% = anchoObraCm / anchoMuebleCm × anchoMueble%
altoObra%  = altoObraCm / anchoMuebleCm × anchoMueble% × relaciónAnchoAltoFoto
```

El fondo se muestra completo a 3:2 en ordenador y móvil. Reducir la pantalla reduce toda la escena en la misma proporción. No se estrecha ni se reduce una obra conocida para hacerla caber en un ambiente: se elige otra pared. Si ninguna es suficiente, la interfaz lo indica sin inventar otra escala.

Los cm/mm/m/pulgadas explícitos, las comas decimales y los dípticos con un único tamaño global en el campo de medidas están contemplados. La orientación de la fotografía puede intercambiar ancho y alto, pero no modifica ninguno de los dos lados registrados. Las medidas ambiguas, por panel o sin unidad se tratan como desconocidas: se ofrece una composición sin escala y se avisa de ello.

**Límite importante:** los anchos físicos del mobiliario son referencias de diseño, no medidas verificadas de muebles reales. La IA no garantiza geometría arquitectónica exacta. La interfaz identifica los fondos como generados con IA y la escala como orientativa. Para una simulación arquitectónica certificada harían falta habitaciones fotografiadas y medidas, o un entorno 3D con unidades físicas.

## Fondos activos y calibración

Los intervalos son preferencias, no una promesa de que cualquier orientación quepa: siempre se comprueba la pared útil.

| ID / archivo WebP (sufijo -v2) | Referencia cm | Ancho observado del mueble | Rango preferente, lado mayor |
| --- | ---: | ---: | --- |
| small-oak | 100 | 65,1% | hasta 65 cm |
| small-walnut | 100 | 60,2% | hasta 65 cm |
| small-stone | 110 | 53,4% | hasta 65 cm |
| medium-linen | 220 | 74,7% | 65–160 cm |
| medium-sideboard | 200 | 58,5% | 65–160 cm |
| medium-reading | 200 | 52,4% | 65–160 cm |
| large-travertine | 300 | 66,0% | 140–320 cm |
| large-gallery | 280 | 41,3% | 140–320 cm |
| large-charcoal | 300 | 44,4% | 140–320 cm |

La zona de pared se ajustó a lo que generó realmente la IA, no a los porcentajes solicitados en los prompts: por ejemplo, el sofá de lino ocupa más alto y ancho de lo previsto. Sus medidas observadas y el límite superior del sofá se reflejan en la calibración.

## Generación

Modo: herramienta integrada `imagegen`, nueve llamadas independientes, sin API/CLI de generación. Prompts completos y nombres de origen: [room-generation-prompts.json](room-generation-prompts.json).

Los PNG originales permanecen en la carpeta de generación de Codex. Los nueve resultados finales WebP que utiliza la web están guardados en el repositorio; ningún recurso depende de una ruta privada de Codex.

## Mantenimiento y pruebas

1. Generar un fondo frontal con pared vacía y guardar una versión nueva en `src/assets/rooms/`.
2. Medir visualmente el ancho del mueble en la imagen final y delimitar una pared que no invada decoración.
3. Añadir una entrada a `roomScenes` y sus nombres traducidos. No cambiar obras ni datos remotos.
4. Ejecutar `npm run test:rooms` y `npm run build`.
5. Con Vite en ejecución, usar `ROOMS_TEST_URL=http://127.0.0.1:5173 npm run test:rooms:browser`. Esta prueba funciona con fixtures aisladas, bloquea peticiones externas y guarda capturas en un directorio temporal.
6. Revisar 30 × 30, 90 × 90, 140 × 140, vertical, panorámica, obra sin medidas y obra demasiado grande; repetir en móvil vertical y horizontal, con flechas, teclado y gesto táctil.

La navegación tiene controles táctiles de 44 px, cierre con Escape, foco inicial y retorno al control que abrió el diálogo. Los textos están disponibles en catalán, español, inglés y alemán.

## Datos editoriales que conviene revisar (no modificados)

El inventario local conserva medidas históricas sin unidad. Además, “Nit als Jardins de Kensington II” declara 180 × 90 cm, pero su fotografía tiene una proporción diferente; “El plaer del sentits” declara 20 × 20 cm y menciona cuatro tablillas. La vista no puede certificar el tamaño global de una obra cuya ficha es inconsistente. No se ha modificado ninguna ficha como parte de este cambio.
