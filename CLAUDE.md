# Reglas de trabajo para Claude Code en Vaivén

## Fuente de verdad
- `docs/SPEC_v1.md` manda. Ante cualquier duda de alcance, modelo de datos, nombres o fases, se sigue la SPEC.
- El detalle del catálogo está en `docs/planificacion/catalogo_mvp_propuesta.csv`.
- Si algo de la SPEC resulta impracticable o desactualizado, **no se resuelve por cuenta propia**: se anota y se consulta.

## Costo cero
- Todo tiene que funcionar con planes gratuitos (GitHub público, Cloudflare Workers gratis). No se agregan servicios pagos ni dependencias que requieran tarjeta.

## Idioma
- Textos de la interfaz, documentación, comentarios orientados a usuarios y mensajes de commit: **en español rioplatense** (voseo: «elegí», «descargá»).
- Los identificadores siguen la convención de la SPEC (sección 2.2).

## Forma de trabajar
- **Antes de cada fase, mostrar un plan y esperar aprobación.**
- **Preguntar antes de cualquier acción irreversible o pública**: crear o borrar repositorios, push, despliegues, cambios de configuración de GitHub o Cloudflare, releases, publicaciones en Zenodo.
- Commits chicos, con mensajes en español que digan qué cambió y por qué.

## Derechos de autor
- El repositorio es público. **No se sube material con derechos de autor**: capturas o páginas de libros, PDFs de la bibliografía, series que no permiten redistribución (por ejemplo, el riesgo país).
- `capturas/` y `_versiones/` están en `.gitignore` y no se copian al repositorio.
- Ante la duda sobre la licencia de una fuente, no se redistribuye y se consulta.

## Estructura
- La estructura de carpetas es la de la SPEC, sección 5.4; cada carpeta tiene un README que dice qué va ahí y en qué fase se llena.
- El Worker (`worker/`) se configura con Wrangler y static assets de Workers (no Pages).
