# Arquitectura frontend

Actualizado: 2026-08-11.

## Stack

- Vite.
- React.
- TypeScript.
- React Router.
- CSS global en `src/styles/global.css`.
- Supabase JS como única fuente de contenido en ejecución; requiere las variables públicas de entorno.

## Estructura principal

```txt
src/
├── app/
│   ├── App.tsx
│   └── router.tsx
├── assets/
│   └── toni_crespo_logo_vector.svg
├── components/
│   ├── admin/
│   │   ├── AdminEditor.tsx
│   │   ├── AdminUi.tsx
│   │   ├── ContentEditorDialogs.tsx
│   │   └── LocalizedFields.tsx
│   ├── artworks/
│   │   ├── ArtworkCard.tsx
│   │   ├── ArtworkGrid.tsx
│   │   └── ArtworkShowcaseList.tsx
│   ├── layout/
│   ├── navigation/
│   ├── photography/
│   └── support/
├── data/
│   └── editorialTranslations.ts
├── lib/
│   └── supabaseClient.ts
├── pages/
│   ├── HomePage.tsx
│   ├── WorksPage.tsx
│   ├── SupportPage.tsx
│   ├── SupportCollectionDetailPage.tsx
│   ├── CollectionDetailPage.tsx
│   ├── PhotographyPage.tsx
│   ├── NewsPage.tsx
│   └── BiographyPage.tsx
├── services/
│   └── editableContentService.ts
├── types/
│   ├── currentSite.ts
│   ├── domain.ts
│   ├── localization.ts
│   └── support.ts
└── styles/
    └── global.css
```

## Rutas activas

- `/`
- `/obra`
- `/lienzos`
- `/lienzos/:collectionSlug`
- `/laminas`
- `/laminas/:collectionSlug`
- `/obra/:collectionSlug`
- `/fotografia`
- `/noticias` y `/noticias-2`
- `/trayectoria`
No existe ruta visible para Contacto. Los datos de contacto se muestran en el footer.

## Fuente de datos

`src/services/editableContentService.ts` consulta directamente Supabase para todas las páginas, colecciones, obras, fotografías y noticias. `src/app/editableContent.tsx` mantiene el snapshot remoto, aplica el idioma seleccionado y lo refresca después de cada operación de edición.

No hay JSON, mocks, XML, imágenes de contenido ni servicio de contenido local de respaldo. Si Supabase no está configurado o no responde, la interfaz presenta el error de carga y no inventa contenido local.

## Responsabilidades de componentes

- `Layout`: marco común con Header, contenido de ruta y Footer.
- `Header`: navegación, logo, redes y lógica de ocultación al scroll.
- `ContactDialogProvider`: popup global de correo y selector de contacto de obra; llama a la Edge Function `send-contact-email` sin exponer secretos en el cliente.
- `sitePreferences`: contexto global de preferencias para idioma de interfaz, tema claro/oscuro, persistencia en `localStorage` y atributos raíz `lang`/`data-theme`.
- `adminSession`: contexto de autenticación admin con Supabase Auth, validación contra `admin_users` mediante `is_admin()` y activación del modo edición.
- `editableContent`: contexto que carga el snapshot de Supabase y refresca la interfaz tras guardar cambios.
- `AdminEditor`: login de Supabase y estado compacto de modo edición; no contiene un panel lateral.
- `AdminUi` y `ContentEditorDialogs`: acciones contextualizadas, diálogos de alta, confirmaciones de borrado y editor visual de Trayectoria.
- `SupportLandingGrid`: entrada Lienzos/Láminas de Inicio y Obra.
- `SupportPage`: listado de colecciones por soporte y alta, edición o borrado confirmado de colecciones cuando el administrador activa edición.
- `SupportCollectionDetailPage`: breadcrumb, listado editorial, alta de obra, borrado confirmado y enlace automático con Ambientes.
- `ArtworkShowcaseList`: pantalla completa de obra con lupa, contacto y Ambientes.
- `NewsPage`: búsqueda, tarjetas de noticia y lightbox de imágenes.
- `PhotographyGallery`: galería vertical y visor de fotografía.
- `BiographyPage`: trayectoria y fotos del autor.

## Ambientes

`ArtworkShowcaseList.tsx` contiene nueve escenas activas, agrupadas en tres intervalos de tamaño, y calcula la posición de cada obra dentro de una zona de pared segura. Cada obra con medidas recibe las tres escenas de su intervalo. El cálculo usa dimensiones físicas cuando existen y el ratio del archivo de imagen como respaldo. Consulta [mockup-backgrounds.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/mockup-backgrounds.md) para el modelo y sus límites.

## Supabase

`src/lib/supabaseClient.ts` lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Las migraciones aplicables viven en `supabase/migrations/` y las copias operativas en `supabase/backups/`. La documentación de uso está en [../supabase/README.md](/home/martinmarch/Repositorios/ToniCrespoWEB/supabase/README.md).

`20260811110000_contextual_editing.sql` añade una columna JSONB `translations` a páginas, colecciones, obras, fotografía y noticias. El contexto `editableContent` mantiene dos vistas del mismo snapshot: `source` conserva el español y las traducciones almacenadas para el editor; la vista pública aplica el idioma seleccionado antes de renderizar. Los textos heredados conservan el diccionario estático como respaldo hasta que se guardan desde el editor.

`scripts/test-supabase-editing.mjs` es una prueba de integración remota. Genera un usuario Auth temporal, lo registra en `admin_users`, valida las políticas RLS con una sesión real, inserta y elimina contenido marcado como `e2e-tonicrespo-*` y comprueba los buckets de edición. La `service role` se limita al proceso Node de test y a la limpieza final.
