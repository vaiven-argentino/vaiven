# paquetes/cita/

Cita sugerida de las series de Vaivén (SPEC, sección 9) en texto, APA y BibTeX, con autor «Vaivén (2026)». La usan la ficha de la web y la herramienta `citar` del MCP, así que las dos devuelven exactamente lo mismo.

```ts
import { apa, bibtex, nombreTransformacion, textoCita } from "@vaiven/cita";

const tr = nombreTransformacion({ frecuencia: "anual", transformacion: "var_interanual" });
textoCita(documento, tr);   // la cita del export, más «Transformación: … (calculada por Vaivén).» si la hay
apa(documento, tr);
bibtex(documento, tr);
```

`documento` es el JSON de una variante del export (`export/series/<serie>/<variante>.json`): se usan `serie`, `variante`, `nombre`, `version_datos` y `cita`.

## Pruebas
```bash
npm test -w @vaiven/cita
npm run verificar -w @vaiven/cita
```

**Se llenó en:** fase 3 (antes estaba en `web/src/lib/cita.ts`).
