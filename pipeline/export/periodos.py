"""Export de los períodos y eventos (SPEC 2.5): `export/periodos.json`, `export/eventos.json` y sus CSV de descarga.

Las etapas del curso salen con su nombre público, «Etapas de la política económica (curso)», hasta que la cátedra diga
si quiere figurar (SPEC 12); la referencia al cronograma de la materia (`referencia_curso`) no se exporta.
"""

from __future__ import annotations

import csv
import io
from datetime import date
from pathlib import Path

ESQUEMA_PERIODOS = "periodos-1.0"
ESQUEMA_EVENTOS = "eventos-1.0"

NOMBRE_TIPO = {
    "gobierno": "Gobiernos",
    "ministro": "Ministros de Economía",
    "plan": "Planes de estabilización",
    "regimen_cambiario": "Regímenes cambiarios",
    "catedra": "Etapas de la política económica (curso)",
}
NOMBRE_TIPO_CATEDRA_PUBLICA = "Periodización de la cátedra"
NOMBRE_CATEGORIA = {
    "cambiario": "Cambiario", "monetario": "Monetario", "financiero": "Financiero", "fiscal": "Fiscal",
    "deuda": "Deuda", "crisis": "Crisis", "institucional": "Institucional",
}


def _f(v: date | None) -> str | None:
    return v.isoformat() if v else None


def _fuente(f: dict) -> dict:
    return {k: (_f(v) if k == "publicado" else v) for k, v in f.items() if v not in (None, "")}


def _cortes(p: dict) -> dict:
    """Cómo se fijó cada extremo: `hecho` (una norma o un hecho fechado) o `convencional` (corte de Vaivén)."""
    salida = {}
    for extremo in ("desde", "hasta"):
        if extremo == "hasta" and p.get("hasta") is None:
            continue
        fuentes = [f for f in p.get("fuentes", []) if f["para"] in (extremo, "ambas")]
        salida[extremo] = "convencional" if fuentes and all(f["tipo"] == "convencional" for f in fuentes) else "hecho"
    return salida


def periodo_export(p: dict, nombrar_catedra: bool = False) -> dict:
    salida = {
        "id": p["id"], "tipo": p["tipo"], "nombre": p["nombre"], "nombre_corto": p["nombre_corto"],
        "desde": _f(p["desde"]), "hasta": _f(p.get("hasta")),
    }
    for campo in ("caracter", "cargo", "orden", "descripcion", "notas"):
        if p.get(campo) not in (None, ""):
            salida[campo] = p[campo]
    if nombrar_catedra and p.get("referencia_curso"):
        salida["referencia_curso"] = p["referencia_curso"]
    salida["cortes"] = _cortes(p)
    salida["fuentes"] = [_fuente(f) for f in p.get("fuentes", [])]
    if p.get("mandatos"):
        salida["mandatos"] = [{
            "id": m["id"], "nombre": m["nombre"], "nombre_corto": m["nombre_corto"],
            "desde": _f(m["desde"]), "hasta": _f(m.get("hasta")),
            **({"notas": m["notas"]} if m.get("notas") else {}),
            "fuentes": [_fuente(f) for f in m.get("fuentes", [])],
        } for m in p["mandatos"]]
    return salida


def documento_periodos(periodos: list[dict], version_datos: str, nombrar_catedra: bool = False) -> dict:
    nombres = {**NOMBRE_TIPO, **({"catedra": NOMBRE_TIPO_CATEDRA_PUBLICA} if nombrar_catedra else {})}
    return {
        "esquema": ESQUEMA_PERIODOS,
        "version_datos": version_datos,
        "descripcion": ("Gobiernos, ministros de Economía, planes de estabilización, regímenes cambiarios y etapas de la "
                        "política económica, 1970–hoy. Intervalos semiabiertos [desde, hasta): el día del traspaso es del "
                        "período que empieza; `hasta` null quiere decir vigente."),
        "fuente": "metadatos/periodos.yaml",
        "licencia": "CC-BY-4.0",
        "tipos": [{"id": t, "nombre": nombres[t], "cantidad": sum(p["tipo"] == t for p in periodos)} for t in NOMBRE_TIPO],
        "periodos": [periodo_export(p, nombrar_catedra) for p in periodos],
    }


def documento_eventos(eventos: list[dict], version_datos: str) -> dict:
    return {
        "esquema": ESQUEMA_EVENTOS,
        "version_datos": version_datos,
        "descripcion": ("Hitos económicos e institucionales con efecto económico, 1970–hoy. `fecha` es la del hecho que "
                        "nombra (anuncio, sanción, firma); `vigencia`, si es otra, la de su entrada en vigor."),
        "fuente": "metadatos/eventos.yaml",
        "licencia": "CC-BY-4.0",
        "categorias": [{"id": c, "nombre": n} for c, n in NOMBRE_CATEGORIA.items()],
        "eventos": [{
            "id": e["id"], "fecha": _f(e["fecha"]), **({"vigencia": _f(e["vigencia"])} if e.get("vigencia") else {}),
            "nombre": e["nombre"], "nombre_corto": e["nombre_corto"], "categoria": e["categoria"],
            "descripcion": e["descripcion"], **({"notas": e["notas"]} if e.get("notas") else {}),
            "fuentes": [_fuente(f) for f in e["fuentes"]],
        } for e in eventos],
    }


def _texto_fuentes(fuentes: list[dict]) -> str:
    partes = []
    for f in fuentes:
        texto = f.get("referencia") or f.get("nota", "")
        extras = [f"para {f['para']}" if f.get("para") else "", f"p. {f['pagina']}" if f.get("pagina") else "",
                  f"publicado {f['publicado']}" if f.get("publicado") else "", f.get("url", "")]
        partes.append(f"{f['tipo']}: {texto}" + "".join(f"; {x}" for x in extras if x))
    return " | ".join(partes)


COLUMNAS_PERIODOS = ["id", "tipo", "nombre", "nombre_corto", "desde", "hasta", "caracter", "cargo", "orden", "padre",
                     "corte_desde", "corte_hasta", "descripcion", "fuentes"]
COLUMNAS_EVENTOS = ["id", "fecha", "vigencia", "nombre", "nombre_corto", "categoria", "descripcion", "fuentes"]


def csv_periodos(doc: dict) -> str:
    """Una fila por período; los mandatos van como filas propias con `padre` (el gobierno) y tipo `gobierno`."""
    filas = []
    for p in doc["periodos"]:
        base = {k: p.get(k) for k in COLUMNAS_PERIODOS}
        base.update(corte_desde=p["cortes"].get("desde"), corte_hasta=p["cortes"].get("hasta"),
                    fuentes=_texto_fuentes(p["fuentes"]), padre=None)
        filas.append(base)
        for m in p.get("mandatos", []):
            filas.append({"id": m["id"], "tipo": "gobierno", "nombre": m["nombre"], "nombre_corto": m["nombre_corto"],
                          "desde": m["desde"], "hasta": m["hasta"], "caracter": p.get("caracter"), "padre": p["id"],
                          "fuentes": _texto_fuentes(m["fuentes"])})
    return _a_csv(COLUMNAS_PERIODOS, filas)


def csv_eventos(doc: dict) -> str:
    return _a_csv(COLUMNAS_EVENTOS, [{**{k: e.get(k) for k in COLUMNAS_EVENTOS}, "fuentes": _texto_fuentes(e["fuentes"])}
                                      for e in doc["eventos"]])


def _a_csv(columnas: list[str], filas: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=columnas, lineterminator="\n", extrasaction="ignore")
    w.writeheader()
    for f in filas:
        w.writerow({k: ("" if f.get(k) is None else f[k]) for k in columnas})
    return buf.getvalue()


def recursos_datapackage(perfil_recurso: str, perfil_tabla: str, cc_by: dict) -> list[dict]:
    texto = lambda nombre, desc: {"name": nombre, "type": "string", "description": desc}  # noqa: E731
    return [
        {
            "$schema": perfil_recurso, "name": "periodos", "title": "Períodos de la política económica argentina, 1970–hoy",
            "path": "descargas/csv/periodos.csv", "type": "table", "format": "csv", "mediatype": "text/csv",
            "encoding": "utf-8",
            "description": "Gobiernos (con sus mandatos), ministros de Economía, planes, regímenes cambiarios y etapas. "
                           "También en JSON: periodos.json.",
            "schema": {"$schema": perfil_tabla, "primaryKey": ["id"], "fields": [
                texto("id", "Identificador estable (p.<tipo>.<slug>)."),
                texto("tipo", "gobierno, ministro, plan, regimen_cambiario o catedra."),
                texto("nombre", "Nombre."), texto("nombre_corto", "Rótulo corto."),
                {"name": "desde", "type": "date", "description": "Primer día (incluido)."},
                {"name": "hasta", "type": "date", "description": "Día en que termina (excluido); vacío si sigue vigente."},
                texto("caracter", "Gobiernos: constitucional, de_facto o interino."),
                texto("cargo", "Ministros: nombre de la cartera en esa época."),
                {"name": "orden", "type": "integer", "description": "Etapas: orden."},
                texto("padre", "Mandatos: el gobierno al que pertenecen."),
                texto("corte_desde", "hecho o convencional."), texto("corte_hasta", "hecho o convencional."),
                texto("descripcion", "Descripción breve."),
                texto("fuentes", "Fuentes de las fechas, separadas por « | »."),
            ]},
            "licenses": [cc_by],
        },
        {
            "$schema": perfil_recurso, "name": "eventos", "title": "Eventos económicos argentinos, 1970–hoy",
            "path": "descargas/csv/eventos.csv", "type": "table", "format": "csv", "mediatype": "text/csv",
            "encoding": "utf-8", "description": "Hitos puntuales. También en JSON: eventos.json.",
            "schema": {"$schema": perfil_tabla, "primaryKey": ["id"], "fields": [
                texto("id", "Identificador estable (e.<fecha>.<slug>)."),
                {"name": "fecha", "type": "date", "description": "Fecha del hecho (anuncio, sanción, firma)."},
                {"name": "vigencia", "type": "date", "description": "Entrada en vigor, si es otro día."},
                texto("nombre", "Nombre."), texto("nombre_corto", "Rótulo corto."),
                texto("categoria", "cambiario, monetario, financiero, fiscal, deuda, crisis o institucional."),
                texto("descripcion", "Descripción breve."),
                texto("fuentes", "Fuentes, separadas por « | »."),
            ]},
            "licenses": [cc_by],
        },
    ]


def escribir_csv(dir_export: Path, doc_periodos: dict, doc_eventos: dict) -> None:
    carpeta = dir_export / "descargas" / "csv"
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / "periodos.csv").write_text(csv_periodos(doc_periodos), encoding="utf-8")
    (carpeta / "eventos.csv").write_text(csv_eventos(doc_eventos), encoding="utf-8")
