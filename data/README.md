# Content data

Archivos JSON con todo el contenido editable de los dos sitios.

- `cs.json` — Caesarstone Argentina (consumido por `index.html` + `js/main.js`)
- `mf.json` — Minera Fame (consumido por `minera-fame.html` + `js/minera-fame.js`)

## Carga

`js/hydrator.js` hace `fetch('data/{site}.json?v=<commitSha>')` al cargar la página
y reemplaza los textContent / src / href de los elementos con `data-edit="path"`.

Si el fetch falla, el sitio sigue funcionando con el contenido hardcoded en HTML.

## Edición

Vía `admin-{cs|mf}-<slug>.html` que postea al Cloudflare Worker `caesarstone-cms-worker`,
que commitea estos JSONs al repo. GH Pages redeploya automaticamente.

## Schema

Ver tipado TS-style en comentarios dentro de `cs.json` y `mf.json`. Bumpear `_schemaVersion`
si se cambia shape.

## Limitaciones

- JSON-LD `ItemList` (`index.html:94-114`) tiene los 11 nombres de productos hardcoded.
  Si se agregan/borran productos vía CMS, este JSON-LD queda stale. Re-gen manual.
- Cache GH Pages CDN: cambios visibles 1-10 min después del commit.
