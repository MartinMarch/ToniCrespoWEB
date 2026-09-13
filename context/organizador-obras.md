# Organizador de obras

El organizador forma ahora parte del [gestor de contenido](gestor-contenido.md). Acceso: **Edición web → Configurar web → Administrar contenido**. El panel privado vive en `/admin/contenido`, conserva `/admin/organizar-obras` como acceso compatible y se carga por separado para no añadir la librería de arrastre a la portada pública.

## Uso

1. Elige la rama (Lienzos u Obra en papel) y las dos colecciones que quieres comparar. Solo puedes mover obras dentro de esa rama. La lista lateral también permite elegir una colección o recibir una obra arrastrada al final.
2. Arrastra una miniatura desde el asa de puntos para cambiar su posición o moverla a otra colección. En táctil, mantén brevemente pulsada el asa; el resto de la tarjeta permite desplazar la lista.
3. Como alternativa, usa **Adelantar**, **Retrasar** o **Mover**. Esta última opción permite escoger colección y posición exactas, también con teclado.
4. La búsqueda filtra las miniaturas sin eliminar ninguna obra del borrador. Se incluyen obras y colecciones ocultas, identificadas como tales, y colecciones vacías.
5. Puedes deshacer, rehacer y descartar. **Guardar cambios** muestra un resumen antes de confirmar y aplicar el orden a la web. Salir con cambios pendientes exige confirmación.

El panel no borra obras ni archivos, no altera sus textos/traducciones y conserva los estados publicado/oculto. La aparición en la web también depende de la colección de destino: una obra publicada trasladada a una colección oculta deja de mostrarse. El panel avisa de estos cambios antes de guardar.

El índice muestra todas las colecciones publicadas del soporte, incluso las vacías y las importadas de WordPress. La técnica y su traducción no filtran colecciones ni obras. Las fichas incompletas se señalan mediante avisos naranjas únicamente en el gestor, sin ocultarlas automáticamente. La reorganización no modifica técnicas ni publica colecciones automáticamente.

Si dos obras procedentes de colecciones distintas tienen el mismo identificador de URL, se ajusta únicamente el identificador interno de la obra trasladada para evitar una colisión.

## Activación de Supabase

La migración versionada `supabase/migrations/20260912144544_artwork_organization.sql` está aplicada en Supabase desde el 12 de septiembre de 2026, junto con la del catálogo descrita en [gestor de contenido](gestor-contenido.md). Añade `public.reorganize_artworks(jsonb,jsonb)` sin reorganizar ni borrar el catálogo existente. No incluye cuentas, contraseñas ni claves.

La función exige una sesión administradora, conserva RLS y realiza todos los movimientos en una única transacción. Compara las colecciones afectadas con el estado que tenía el panel al abrirse. Si otra persona ha añadido, movido, borrado u ordenado sus obras, el guardado se rechaza sin aplicar una reorganización parcial. El borrador permanece disponible para revisión; recargar el catálogo permite empezar desde el estado reciente.

Si la conexión se pierde durante el guardado, no debe suponerse que falló: conviene recargar para comprobar la organización guardada. Si Supabase confirma el guardado pero falla la recarga posterior, el panel lo indica y bloquea nuevos cambios hasta recuperar la vista.

## Verificación local

```bash
npm run lint
npm run lint:tests
npm run test:unit
npm run test:organization:sql
npx playwright test tests/e2e/artwork-organizer.spec.ts
npm run build
```

Las pruebas SQL usan PostgreSQL temporal privado; las del navegador simulan Supabase. Incluyen el acceso directo al panel antes de iniciar sesión y el cambio de identidad, para no reutilizar un catálogo o unos permisos de otra sesión. No modifican las obras de producción. La migración remota y el despliegue del frontend son pasos separados.

Referencias de implementación: [arrastre y listas ordenables de dnd-kit](https://dndkit.com/legacy/presets/sortable/overview/), [funciones de base de datos de Supabase](https://supabase.com/docs/guides/database/functions) y [protección de navegación con borradores](https://reactrouter.com/6.30.1/hooks/use-blocker).
