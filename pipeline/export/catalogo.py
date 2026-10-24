"""Archivos generales del export: catálogo, quiebres, revisiones, datapackage.json y especificaciones de Vega-Lite."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from pipeline.comun import ErrorPipeline, escribir_json
from pipeline.export.series import URL_SITIO, ruta_csv_relativa

PERFIL_DATAPACKAGE = "https://datapackage.org/profiles/2.0/datapackage.json"
PERFIL_RECURSO = "https://datapackage.org/profiles/2.0/dataresource.json"
PERFIL_TABLA = "https://datapackage.org/profiles/2.0/tableschema.json"
VEGA_LITE = "https://vega.github.io/schema/vega-lite/v6.json"


CAMPOS_BIBLIOGRAFIA = {"referencia": "texto", "pagina": "pagina", "tipo": "tipo", "titulo_original": "titulo_original",
                       "periodo_cubierto": "periodo_cubierto"}


def leer_inventario(ruta: Path) -> dict[str, dict]:
    """Fichas del inventario de la bibliografía, por id. Son referencias (autor, obra, página, título del cuadro)."""
    with ruta.open(encoding="utf-8-sig", newline="") as f:
        return {fila["id"]: fila for fila in csv.DictReader(f)}


def bibliografia(ids: list[str], inventario: dict[str, dict], serie: str) -> list[dict]:
    """Las fichas que usan la serie, con los datos de referencia del inventario."""
    salida = []
    for fid in ids:
        if fid not in inventario:
            raise ErrorPipeline(f"{serie}: la ficha de bibliografía «{fid}» no está en el inventario.")
        fila = inventario[fid]
        salida.append({"id": fid, **{campo: fila[columna].strip() for campo, columna in CAMPOS_BIBLIOGRAFIA.items()}})
    return salida


def catalogo(series: list[dict], documentos: dict[str, dict], version_datos: str,
             inventario: dict[str, dict] | None = None) -> dict:
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
            "tipo": s["tipo"], "agregacion": s["agregacion"], "transformaciones": list(s.get("transformaciones", [])),
            "frecuencia": s["frecuencia"], "variante_por_defecto": s["variante_por_defecto"],
            "quiebres": s.get("quiebres", []), "variantes": variantes,
            "bibliografia": bibliografia(s.get("bibliografia", []), inventario or {}, s["id"]),
        })
    return {"version_datos": version_datos, "series": entradas}


def quiebres_export(quiebres: dict[str, dict]) -> list[dict]:
    salida = []
    for qid, q in sorted(quiebres.items()):
        entrada = {k: (str(v) if k in ("desde", "hasta") else v) for k, v in q.items()}
        entrada.setdefault("hasta", None)
        salida.append(entrada)
    return salida


def datapackage(documentos: dict[str, dict], fuentes: dict[str, dict], version_datos: str) -> dict:
    recursos = []
    for vid, doc in sorted(documentos.items()):
        recursos.append({
            "$schema": PERFIL_RECURSO,
            "name": vid,
            "title": f"{doc['nombre']} · {doc['nombre_variante']}",
            "path": f"descargas/csv/{ruta_csv_relativa(doc)}",
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
    """Gráfico de líneas por defecto de la variante por defecto.

    La URL de los datos es absoluta para que la especificación funcione fuera del sitio (el export se sirve en /datos/).
    """
    tipo_fecha = "temporal"
    return {
        "$schema": VEGA_LITE,
        "title": {"text": doc["nombre"], "subtitle": f"Variante: {doc['nombre_variante']} · {doc['unidad']}"},
        "data": {"url": f"{URL_SITIO}/datos/descargas/csv/{ruta_csv_relativa(doc)}", "format": {"type": "csv"}},
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
                       version_datos: str, ruta_inventario: Path | None = None) -> None:
    usa_bibliografia = any(s.get("bibliografia") for s in series)
    inventario = leer_inventario(ruta_inventario) if usa_bibliografia and ruta_inventario else {}
    escribir_json(dir_export / "catalogo.json", catalogo(series, documentos, version_datos, inventario))
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
