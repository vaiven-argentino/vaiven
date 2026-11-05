"""Export por serie y variante (SPEC 2.5): JSON para la web y el MCP, y CSV para descargar."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from pipeline.comun import etiqueta_fecha, redondear

URL_SITIO = "https://vaiven.argentino.workers.dev"
VERSION_ESQUEMA = "1.2"


def url_ficha(serie_meta: dict, variante: dict) -> str:
    """La variante por defecto vive en /series/<slug>/; las demás, en /series/<slug>/<variante>/."""
    base = f"{URL_SITIO}/series/{serie_meta['id']}/"
    return base if variante["id"] == serie_meta["variante_por_defecto"] else f"{base}{variante['id']}/"


def cita(serie_meta: dict, variante: dict, version_datos: str) -> str:
    anio = version_datos[:4]
    dia = version_datos[:10]
    return (
        f"Vaivén ({anio}). {serie_meta['nombre']}, variante «{variante['id']}». "
        f"Versión de datos {dia}. {url_ficha(serie_meta, variante)}"
    )


def _advertencias(variante: dict, quiebres: dict[str, dict], serie: pd.Series) -> list[dict]:
    salida = []
    for qid in variante.get("advertencias", []):
        q = quiebres[qid]
        salida.append({"id": qid, "desde": _texto(q.get("desde")), "hasta": _texto(q.get("hasta")),
                       "tipo": q.get("tipo"), "descripcion": q["descripcion"]})
    return salida


def _texto(valor) -> str | None:
    return None if valor is None else str(valor)


def _fuentes(variante: dict, fuentes: dict[str, dict]) -> list[dict]:
    vistas, salida = set(), []
    for t in variante["tramos"]:
        fid = t["fuente"]
        if fid in vistas:
            continue
        vistas.add(fid)
        f = fuentes[fid]
        salida.append({"id": fid, "organismo": f["organismo"], "nombre": f["nombre"], "url": f["url"],
                       "licencia": f["licencia"], "id_api": f.get("id_api")})
    return salida


def documento(serie_meta: dict, variante: dict, serie: pd.Series, fuentes: dict, quiebres: dict,
              version_datos: str, desactualizada_desde: str | None = None) -> dict:
    frecuencia = variante.get("frecuencia", serie_meta["frecuencia"])
    return {
        "esquema": VERSION_ESQUEMA,
        "id": f"{serie_meta['id']}.{variante['id']}",
        "serie": serie_meta["id"],
        "codigo": serie_meta["codigo"],
        "nombre": serie_meta["nombre"],
        "variante": variante["id"],
        "nombre_variante": variante["nombre"],
        "es_variante_por_defecto": variante["id"] == serie_meta["variante_por_defecto"],
        "unidad": variante.get("unidad", serie_meta["unidad"]),
        "tipo": serie_meta["tipo"],
        "agregacion": variante.get("agregacion", serie_meta["agregacion"]),
        "frecuencia": frecuencia,
        "moneda": variante.get("moneda", serie_meta.get("moneda")),
        "metodo": variante["metodo"],
        "empalme": variante.get("empalme", "yuxtaponer"),
        "transformaciones": list(variante.get("transformaciones", serie_meta.get("transformaciones", []))),
        # Las series que necesitan las medidas (real, en dólares, % del PIB, pesos actuales): las completa insumos.py.
        "insumos": {},
        "auxiliar": bool(serie_meta.get("auxiliar", False)),
        **({"vista_inicial": vista} if (vista := variante.get("vista_inicial", serie_meta.get("vista_inicial"))) else {}),
        "tramos": [
            {"fuente": t["fuente"], "desde": str(t["desde"]), "hasta": str(t.get("hasta", "hoy")),
             # En una derivada, los tramos son los insumos: la frecuencia es la del resultado.
             "frecuencia": frecuencia if variante.get("empalme") == "derivar"
             else t.get("agregar", {}).get("a", fuentes[t["fuente"]]["frecuencia"]),
             **({"rol": t["rol"]} if "rol" in t else {})}
            for t in variante["tramos"]
        ],
        "cobertura": {"desde": etiqueta_fecha(serie.index[0], frecuencia), "hasta": etiqueta_fecha(serie.index[-1], frecuencia)},
        "advertencias": _advertencias(variante, quiebres, serie),
        # Observaciones de la fuente que se quitaron a propósito (no son huecos): la web y el MCP las muestran.
        "excluidos": [{"fecha": str(e["fecha"]), "motivo": " ".join(str(e["motivo"]).split())}
                      for e in variante.get("excluir", [])],
        "fuentes": _fuentes(variante, fuentes),
        "licencia": serie_meta.get("licencia_derivado", "CC-BY-4.0"),
        "cita": cita(serie_meta, variante, version_datos),
        "version_datos": version_datos,
        "desactualizada_desde": desactualizada_desde,
        "datos": [[etiqueta_fecha(f, frecuencia), redondear(v)] for f, v in serie.items()],
    }


def a_texto(doc: dict) -> str:
    """JSON con los metadatos indentados y una observación por línea: legible y con diffs chicos en Git."""
    sin_datos = {k: v for k, v in doc.items() if k != "datos"}
    cabeza = json.dumps(sin_datos, ensure_ascii=False, indent=2)[:-2]
    filas = ",\n".join("    " + json.dumps(par, ensure_ascii=False) for par in doc["datos"])
    return cabeza + ',\n  "datos": [\n' + filas + "\n  ]\n}\n"


def ruta_csv_relativa(doc: dict) -> str:
    """Ruta del CSV de descarga dentro de descargas/csv/ (las auxiliares, en auxiliares/)."""
    return f"{'auxiliares/' if doc.get('auxiliar') else ''}{doc['serie']}/{doc['variante']}.csv"


def escribir(dir_export: Path, doc: dict) -> None:
    # Las auxiliares (SPEC 2.6) van aparte: no figuran en el catálogo, pero se publican igual.
    carpeta = "auxiliares" if doc.get("auxiliar") else "series"
    ruta_json = dir_export / carpeta / doc["serie"] / f"{doc['variante']}.json"
    ruta_json.parent.mkdir(parents=True, exist_ok=True)
    ruta_json.write_text(a_texto(doc), encoding="utf-8")
    ruta_csv = dir_export / "descargas" / "csv" / ruta_csv_relativa(doc)
    ruta_csv.parent.mkdir(parents=True, exist_ok=True)
    lineas = ["fecha,valor"] + [f"{f},{v!r}" for f, v in doc["datos"]]
    ruta_csv.write_text("\n".join(lineas) + "\n", encoding="utf-8")
