# Vaivén

**Series económicas argentinas, 1970–hoy.**

Vaivén es una base histórica *curada* de series económicas argentinas desde 1970, pensada para estudiar las políticas económicas del período democrático. Cada serie viene con su contexto: de dónde sale, qué quiebres tiene, qué alternativas existen para empalmarla y cómo citarla.

No compite con los agregadores generales (datos.gob.ar, ArgenData, Almanac, El Tablero): los usa como fuentes y les suma curaduría histórica y metodológica. Los datos se van a poder consultar desde una web en español y desde un servidor MCP para agentes de IA.

## Estado

🚧 **En construcción: fase 1 (pipeline piloto).** Ya se actualizan y validan 5 series piloto (IPC, tipo de cambio oficial, reservas, exportaciones y desocupación), en [`export/`](export/). La web llega en la fase 2. El sitio provisorio está en <https://vaiven.argentino.workers.dev>.

| Fase | Contenido |
|---|---|
| 0 | Repositorio, licencias y Worker vacío |
| 1 | Pipeline piloto con 5 series |
| 2 | Web mínima: catálogo y ficha de serie |
| 3 | MCP remoto |
| 4 | Núcleo completo: series de prioridad A, explorador y períodos |
| 5 | Catálogo completo y primera release con DOI |

## Documentación

En [`docs/`](docs/):

- [`SPEC_v1.md`](docs/SPEC_v1.md): especificación del proyecto (fuente de verdad).
- [`ARQUITECTURA_v0.md`](docs/ARQUITECTURA_v0.md): arquitectura y decisiones técnicas.
- [`DECISIONES_v0.md`](docs/DECISIONES_v0.md): decisiones de alcance y hallazgos de la planificación.
- [`NOTAS_FASE1.md`](docs/NOTAS_FASE1.md): decisiones, diferencias con la SPEC y pendientes de la fase 1.
- [`planificacion/`](docs/planificacion/): catálogo del MVP, inventario de gráficos de la bibliografía y resumen de variables.

## Licencias

- **Código:** [MIT](LICENSE).
- **Datos derivados** (capa 2 y export): [CC BY 4.0](LICENSE-DATOS).
- **Series de terceros:** conservan la licencia de su fuente, que se indica en cada serie. Las que no permiten redistribución no se descargan.

## Cómo citar

Ver [`CITATION.cff`](CITATION.cff). Cuando haya releases, cada una va a tener su DOI en Zenodo.

## Autor

Camilo Gómez Ortega von Zeschau · [ORCID 0009-0008-7874-5164](https://orcid.org/0009-0008-7874-5164)
