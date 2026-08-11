# Índice de contexto

Este directorio reúne el contexto funcional, técnico, editorial e histórico de la reconstrucción de la web de Toni Crespo.

> Leer primero [estado-actual.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/estado-actual.md), [frontend-architecture.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/frontend-architecture.md) y [../supabase/README.md](/home/martinmarch/Repositorios/ToniCrespoWEB/supabase/README.md). Son la referencia operativa para implementar cambios.

Desde el 11 de agosto de 2026, Supabase es la única fuente de contenido e imágenes en ejecución. Se eliminaron intencionadamente `media-images/`, el XML de WordPress, los datasets y mocks locales, los scripts de sincronización/importación y `supabase/drafts/`. Las copias recuperables se descargan a `supabase/backups/` y están fuera de Git.

Los documentos que hablan de WordPress, XML, mocks, `media-images/`, `currentSiteData.json`, `contentService.ts` o `supabase/drafts/` son archivo histórico. Conservan decisiones e inventarios útiles, pero sus rutas ya no existen y no deben usarse para diseñar ni implementar código actual.

## Estado y diseño actual

- [estado-actual.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/estado-actual.md): estado operativo, rutas, contenido disponible, limitaciones y próximos pasos.
- [diseno-interfaz.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/diseno-interfaz.md): dirección visual, header, footer, responsive y componentes de interfaz.
- [frontend-architecture.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/frontend-architecture.md): estructura React, servicios, rutas y flujo de Supabase.
- [tareas-pendientes.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/tareas-pendientes.md): backlog real pendiente.
- [mockups-cliente.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/mockups-cliente.md): dossier visual con capturas reales de escritorio y móvil, preparado para su conversión a PDF.

## Obra, soportes y ambientes

- [obras.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/obras.md): tabla completa de obras e información disponible.
- [lienzos-laminas.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/lienzos-laminas.md): criterios y listado de lienzos y láminas/papel.
- [mockup-backgrounds.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/mockup-backgrounds.md): sistema activo de Ambientes, recursos, mantenimiento y límite de escala física.
- [colecciones.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/colecciones.md): inventario histórico de colecciones.

## Archivo histórico

- [sincronizacion-web-actual.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/sincronizacion-web-actual.md): extracción histórica de la web pública. No tiene script ejecutable asociado.
- [inventario-contenido.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/inventario-contenido.md): contenido del XML WordPress heredado.
- [inventario-imagenes.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/inventario-imagenes.md): inventario de imágenes históricas.
- [web-antigua.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/web-antigua.md): estructura de la web anterior.

## Supabase y antecedentes

- [modelo-datos.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/modelo-datos.md): modelo editorial de referencia.
- [supabase-schema.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/supabase-schema.md): propuesta histórica; el esquema aplicable está en `supabase/migrations/`.
- [supabase-mock-schema.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/supabase-mock-schema.md): prueba histórica, no ejecutable.
- [mockups-datos.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/mockups-datos.md): referencia histórica de los mocks iniciales.

## Ejecución rápida

```bash
npm install
npm run dev
```

```bash
npm run lint
npm run build
```
