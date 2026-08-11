# Snapshots locales

Los directorios generados aquí son copias lógicas de las tablas de contenido y de todos los buckets de Storage del proyecto Supabase activo. Se mantienen en el disco local, pero se ignoran en Git para no versionar imágenes, contenido editorial ni emails de administradores.

Crear una copia:

```bash
npm run backup:supabase
```

Comprobar o restaurar la copia más reciente:

```bash
npm run verify:supabase-backup -- --latest
npm run restore:supabase -- --latest
npm run restore:supabase -- --latest --write
```
