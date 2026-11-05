# metadatos/

Metadatos curados a mano: la descripción de cada serie y los registros compartidos (SPEC, secciones 2.3 y 2.4).

- `series/<slug>.yaml`: una ficha por serie del catálogo, con sus variantes, tramos, quiebres y cita.
- `auxiliares/<slug>.yaml`: las series auxiliares de la SPEC 2.6 (códigos AUX-01 a AUX-05: PIB nominal, PIB en dólares, población, IPC de EE.UU. y signos monetarios). Tienen el mismo formato y la misma validación, pero no van al catálogo: se exportan a `export/auxiliares/` y las usan las medidas de la librería de transformaciones.
- `fuentes.yaml`, `quiebres.yaml`, `periodos.yaml`, `eventos.yaml`, `glosario.yaml` y `signos_monetarios.yaml`.

Los campos que lee el pipeline, además de los de la SPEC, están en `pipeline/README.md`.

**Se llenó en:** fase 1 (las 5 series piloto y sus fuentes); fase 4a (las 20 series A, INT-01, INT-02 y las auxiliares); se completa en la 4b y la fase 5.
