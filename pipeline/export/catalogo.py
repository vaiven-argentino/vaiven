"""Archivos generales del export: catálogo, quiebres, revisiones, datapackage.json y especificaciones de Vega-Lite."""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.comun import escribir_json
from pipeline.export.series import URL_SITIO

PERFIL_DATAPACKAGE = "https://datapackage.org/profiles/2.0/datapackage.json"
PERFIL_RECURSO = "https://datapackage.org/profiles/2.0/dataresource.json"
PERFIL_TABLA = "https://datapackage.org/profiles/2.0/tableschema.json"
VEGA_LITE = "https://vega.github.io/schema/vega-lite/v6.json"


def catalogo(series: list[dict], documentos: dict[str, dict], version_datos: str) -> dict:
    """Una entrada por serie. Las variantes no publicadas figuran con su estado, sin datos."""
    entradas = []
    for s in series:
        variantes = []
        for v in s["variantes"]:
            doc = documentos.get(f"{s['id']}.{v['id']}")
            variantes.append({
                "id": v["id"],
                "nombre": v["nombre"],
                "estado": v.get("estado", "publicada"),
                "frecuencia": v.get("frecuencia", s["frecuencia"]),
                "cobertura": doc["cobertura"] if doc else None,
                "archivo": f"series/{s['id']}/{v['id']}.json" if doc else None,
                **({"nota": v["nota"]} if "nota" in v else {}),
            })
        entradas.append({
            "id": s["id"], "codigo": s["codigo"], "nombre": s["nombre"], "bloque": s["bloque"],
            "prioridad": s["prioridad"], "definicion": s["definicion"], "unidad": s["unidad"],
            "frecuencia": s["frecuencia"], "variante_por_defecto": s["variante_por_defecto"],
            "quiebres": s.get("quiebres", []), "variantes": variantes,
        })
    return {"version_datos": version_datos, "series": entradas}


def quiebres_export(quiebres: dict[str, dict]) -> list[dict]:
    return [{"id": qid, **{k: (str(v) if k in ("desde", "hasta") else v) for k, v in q.items()}}
            for qid, q in sorted(quiebres.items())]


def datapackage(documentos: dict[str, dict], fuentes: dict[str, dict], version_datos: str) -> dict:
    recursos = []
    for vid, doc in sorted(documentos.items()):
        recursos.append({
            "$schema": PERFIL_RECURSO,
            "name": vid,
            "title": f"{doc['nombre']} · {doc['nombre_variante']}",
            "path": f"descargas/csv/{doc['serie']}/{doc['variante']}.csv",
            "type": "table",
            "format": "csv",
            "mediatype": "text/csv",
            "encoding": "utf-8",
            "description": doc["metodo"],
            "schema": {
                "$schema": PERFIL_TABLA,
                "fields": [
                    {"name": "fecha", "type": "string",
                     "description": f"Período ({doc['frecuencia']}): AAAA-MM-DD en diarias, AAAA en anuales, AAAA-MM en el resto."},
                    {"name": "valor", "type": "number", "description": doc["unidad"]},
                ],
                "primaryKey": ["fecha"],
            },
            "sources": [{"title": f"{f['organismo']}: {f['nombre']}", "path": f["url"]} for f in doc["fuentes"]],
            "licenses": [{"name": "CC-BY-4.0", "path": "https://creativecommons.org/licenses/by/4.0/",
                          "title": "Creative Commons Attribution 4.0"}],
        })
    return {
        "$schema": PERFIL_DATAPACKAGE,
        "name": "vaiven",
        "title": "Vaivén: series económicas argentinas, 1970–hoy",
        "description": "Base histórica curada de series económicas argentinas, con variantes de empalme y quiebres documentados.",
        "homepage": URL_SITIO,
        "version": version_datos,
        "created": version_datos,
        "licenses": [{"name": "CC-BY-4.0", "path": "https://creativecommons.org/licenses/by/4.0/",
                      "title": "Creative Commons Attribution 4.0"}],
        "contributors": [{"title": "Camilo Gómez Ortega von Zeschau", "roles": ["creator"]}],
        "resources": recursos,
    }


def especificacion_vega(serie_meta: dict, doc: dict) -> dict:
    """Gráfico de líneas por defecto de la variante por defecto. Las rutas son relativas a `export/`."""
    tipo_fecha = "temporal"
    return {
        "$schema": VEGA_LITE,
        "title": {"text": doc["nombre"], "subtitle": f"Variante: {doc['nombre_variante']} · {doc['unidad']}"},
        "data": {"url": f"descargas/csv/{doc['serie']}/{doc['variante']}.csv", "format": {"type": "csv"}},
        "mark": {"type": "line", "interpolate": "linear"},
        "encoding": {
            "x": {"field": "fecha", "type": tipo_fecha, "title": None},
            "y": {"field": "valor", "type": "quantitative", "title": doc["unidad"],
                  **({"scale": {"type": "log"}} if serie_meta.get("escala_log") else {})},
        },
        "usermeta": {"vaiven": {"serie": doc["serie"], "variante": doc["variante"], "version_datos": doc["version_datos"],
                                "cita": doc["cita"]}},
    }


def escribir_generales(dir_export: Path, series: list[dict], documentos: dict, fuentes: dict, quiebres: dict,
                       version_datos: str) -> None:
    escribir_json(dir_export / "catalogo.json", catalogo(series, documentos, version_datos))
    escribir_json(dir_export / "quiebres.json", quiebres_export(quiebres))
    escribir_json(dir_export / "datapackage.json", datapackage(documentos, fuentes, version_datos))
    for s in series:
        doc = documentos.get(f"{s['id']}.{s['variante_por_defecto']}")
        if doc:
            escribir_json(dir_export / "vega" / f"{s['id']}.json", especificacion_vega(s, doc))


def agregar_revisiones(ruta: Path, entradas: list[dict]) -> None:
    """Agrega al historial de revisiones las de esta corrida (las más nuevas, primero)."""
    historial = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else []
    if entradas:
        historial = entradas + historial
    escribir_json(ruta, historial)
