"""Insumos de las medidas (esquema 1.2): qué series publicadas necesita cada variante para pasar a real, a dólares,
a % del PIB o a pesos actuales. Las transformaciones se calculan en TypeScript (SPEC 4); acá solo se dice dónde
están los datos que les hacen falta y en qué unidad queda el resultado.
"""

from __future__ import annotations

from pathlib import Path

from pipeline.comun import ErrorPipeline, leer_yaml

# Qué serie sirve cada medida. El deflactor es el IPC (cualquiera de sus variantes publicadas, SPEC 4).
DEFLACTOR = "ipc"
TIPO_DE_CAMBIO = "tc-oficial.pesos-actuales"
PIB = {"pesos_actuales": "pib-nominal", "dolares": "pib-dolares"}
FRECUENCIAS_PIB = ("anual", "trimestral")
SIGNOS = "signos-monetarios"
ARCHIVO_SIGNOS = "auxiliares/signos-monetarios.json"


def archivo(serie: str, variante: str, auxiliar: bool) -> str:
    return f"{'auxiliares' if auxiliar else 'series'}/{serie}/{variante}.json"


class Publicadas:
    """Las variantes que van a quedar publicadas: las de esta corrida y, si se corrió solo una parte, las del export."""

    def __init__(self, documentos: dict[str, dict], dir_export: Path, dir_metadatos: Path):
        self.documentos = documentos
        self.dir_export = dir_export
        self.dir_metadatos = dir_metadatos

    def meta(self, serie: str) -> dict | None:
        for carpeta in ("series", "auxiliares"):
            ruta = self.dir_metadatos / carpeta / f"{serie}.yaml"
            if ruta.exists():
                # Las auxiliares no lo declaran en el YAML: lo dice la carpeta (como en actualizar.py).
                return {**leer_yaml(ruta), **({"auxiliar": True} if carpeta == "auxiliares" else {})}
        return None

    def opcion(self, vid: str) -> dict | None:
        serie, variante = vid.split(".", 1)
        doc = self.documentos.get(vid)
        if doc is not None:
            return {"id": vid, "archivo": archivo(serie, variante, doc["auxiliar"]), "nombre": doc["nombre_variante"],
                    "frecuencia": doc["frecuencia"]}
        meta = self.meta(serie)
        if meta is None:
            return None
        ruta = archivo(serie, variante, bool(meta.get("auxiliar")))
        if not (self.dir_export / ruta).exists():
            return None
        v = next((x for x in meta["variantes"] if x["id"] == variante), None)
        if v is None or v.get("estado", "publicada") != "publicada":
            return None
        return {"id": vid, "archivo": ruta, "nombre": v["nombre"], "frecuencia": v.get("frecuencia", meta["frecuencia"])}


def _sin_frecuencia(o: dict) -> dict:
    return {k: v for k, v in o.items() if k != "frecuencia"}


def insumos(doc: dict, unidades: dict, publicadas: Publicadas) -> dict:
    declaradas = set(doc["transformaciones"])
    moneda = doc["moneda"]
    salida = {}

    def unidad(medida: str) -> str:
        if medida not in unidades:
            raise ErrorPipeline(f"{doc['id']}: declara «{medida}» pero falta `unidades_medida.{medida}` en sus metadatos.")
        return unidades[medida]

    if "real" in declaradas and moneda == "pesos_actuales":
        meta_ipc = publicadas.meta(DEFLACTOR)
        if meta_ipc:
            opciones = [o for v in meta_ipc["variantes"] if (o := publicadas.opcion(f"{DEFLACTOR}.{v['id']}"))]
            defecto = f"{DEFLACTOR}.{meta_ipc['variante_por_defecto']}"
            if any(o["id"] == defecto for o in opciones):
                salida["real"] = {"opciones": [_sin_frecuencia(o) for o in opciones], "por_defecto": defecto,
                                  "unidad": unidad("real")}
    if "en_dolares" in declaradas and moneda == "pesos_actuales":
        if o := publicadas.opcion(TIPO_DE_CAMBIO):
            salida["en_dolares"] = {"opciones": [_sin_frecuencia(o)], "por_defecto": o["id"], "unidad": unidad("en_dolares")}
    if "pct_pib" in declaradas and moneda in PIB:
        opciones = [o for f in FRECUENCIAS_PIB if (o := publicadas.opcion(f"{PIB[moneda]}.{f}"))]
        if opciones:
            salida["pct_pib"] = {"opciones": opciones, "por_defecto": opciones[0]["id"], "unidad": "% del PIB"}
    if "pesos_actuales" in declaradas and moneda == "moneda_de_epoca":
        # Los signos monetarios se exportan siempre (export/auxiliares/signos-monetarios.json).
        salida["pesos_actuales"] = {"opciones": [{"id": SIGNOS, "archivo": ARCHIVO_SIGNOS}], "por_defecto": SIGNOS,
                                    "unidad": unidad("pesos_actuales")}
    return salida
