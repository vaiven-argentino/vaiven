"""Orquestación del pipeline: snapshot → capa 1 → capa 2 → validación → export (SPEC 5.1, pasos 2 a 6)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

import pandas as pd

from pipeline.capa1 import normalizar as capa1
from pipeline.capa2 import signos_monetarios, variantes
from pipeline.comun import ErrorPipeline, Rutas, a_fecha, ahora_utc, escribir_csv_serie, leer_yaml
from pipeline.export import catalogo as export_generales
from pipeline.export import series as export_series
from pipeline.fuentes import base
from pipeline.validacion import reglas, revisiones


@dataclass
class Metadatos:
    series: list[dict]
    fuentes: dict[str, dict]
    quiebres: dict[str, dict]
    signos: list[dict]


@dataclass
class Resultado:
    problemas: list[reglas.Problema] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
    cambios: list[str] = field(default_factory=list)
    snapshots_nuevos: list[str] = field(default_factory=list)
    publicado: bool = False

    @property
    def errores(self) -> list[reglas.Problema]:
        return [p for p in self.problemas if p.severidad == "error"]

    def informe(self) -> str:
        lineas = []
        if self.errores:
            lineas.append("## La validación falló: no se publicó nada\n")
            lineas += [p.como_texto() for p in self.errores]
        otros = [p for p in self.problemas if p.severidad != "error"]
        if otros or self.avisos:
            lineas.append("\n## Avisos\n")
            lineas += [p.como_texto() for p in otros] + [f"- {a}" for a in self.avisos]
        if self.cambios:
            lineas.append("\n## Cambios publicados\n")
            lineas += [f"- {c}" for c in self.cambios]
        if self.snapshots_nuevos:
            lineas.append("\n## Snapshots nuevos\n")
            lineas += [f"- {s}" for s in self.snapshots_nuevos]
        if not lineas:
            lineas.append("Sin cambios en las fuentes.")
        return "\n".join(lineas) + "\n"


def cargar_metadatos(rutas: Rutas, solo: list[str] | None = None) -> Metadatos:
    series = []
    for ruta in sorted((rutas.metadatos / "series").glob("*.yaml")):
        s = leer_yaml(ruta)
        if solo and s["id"] not in solo:
            continue
        series.append(s)
    if solo and len(series) != len(solo):
        faltan = set(solo) - {s["id"] for s in series}
        raise ErrorPipeline(f"No hay metadatos para: {', '.join(sorted(faltan))}")
    fuentes = {f["id"]: f for f in leer_yaml(rutas.metadatos / "fuentes.yaml")}
    quiebres = {q["id"]: q for q in leer_yaml(rutas.metadatos / "quiebres.yaml")}
    signos = signos_monetarios.cargar_signos(rutas.metadatos / "signos_monetarios.yaml")
    _controlar_referencias(series, fuentes, quiebres)
    return Metadatos(series, fuentes, quiebres, signos)


def _controlar_referencias(series: list[dict], fuentes: dict, quiebres: dict) -> None:
    for s in series:
        for v in s["variantes"]:
            for t in v["tramos"]:
                if t["fuente"] not in fuentes:
                    raise ErrorPipeline(f"{s['id']}.{v['id']}: la fuente {t['fuente']} no está en fuentes.yaml")
            for q in v.get("advertencias", []):
                if q not in quiebres:
                    raise ErrorPipeline(f"{s['id']}.{v['id']}: el quiebre {q} no está en quiebres.yaml")
            if v.get("estado", "publicada") == "publicada":
                for t in v["tramos"]:
                    if not fuentes[t["fuente"]].get("redistribuible", True):
                        raise ErrorPipeline(
                            f"{s['id']}.{v['id']} está marcada como publicada pero usa {t['fuente']}, que no es redistribuible."
                        )


def publicadas(serie: dict) -> list[dict]:
    return [v for v in serie["variantes"] if v.get("estado", "publicada") == "publicada"]


def fuentes_necesarias(meta: Metadatos) -> list[str]:
    """Fuentes de las variantes publicadas, de sus controles de continuidad y las auxiliares (SPEC 2.6)."""
    ids = []
    for s in meta.series:
        for v in publicadas(s):
            for t in v["tramos"]:
                ids.append(t["fuente"])
            for c in v.get("continuidad", []):
                ids += [c["a"], c["b"]]
            for c in v.get("coherencia", []):
                ids += [c["mensual"], c["anual"]]
    series_ids = {s["id"] for s in meta.series}
    ids += [fid for fid, f in meta.fuentes.items() if f.get("auxiliar") and series_ids & set(f.get("para", []))]
    return list(dict.fromkeys(ids))


def obtener_fuente(rutas: Rutas, fuente: dict, con_red: bool, res: Resultado) -> tuple[pd.Series, str | None]:
    """Snapshot y capa 1 de una fuente. Devuelve la serie y, si quedó desactualizada, desde cuándo."""
    dir_fuente = rutas.snapshots / fuente["id"]
    desactualizada = None
    snapshot = None
    if con_red:
        try:
            archivos = capa1.modulo(fuente).bajar(fuente)
            snapshot, nuevo = base.guardar_snapshot(rutas.snapshots, fuente, archivos)
            if nuevo:
                res.snapshots_nuevos.append(snapshot.relative_to(rutas.raiz).as_posix())
        except ErrorPipeline as e:
            snapshot = base.ultimo_snapshot(dir_fuente)
            if snapshot is None:
                raise ErrorPipeline(f"{fuente['id']}: la fuente no respondió y no hay snapshots anteriores. {e}")
            desactualizada = base.leer_meta(snapshot)["descargado"][:10]
            res.avisos.append(f"{fuente['id']}: la fuente no respondió; se usan los datos del {desactualizada}. {e}")
    else:
        snapshot = base.ultimo_snapshot(dir_fuente)
        if snapshot is None:
            raise ErrorPipeline(f"{fuente['id']}: no hay snapshots y se pidió correr sin red.")
    return capa1.normalizar(rutas, fuente, snapshot), desactualizada


def _reglas_variante(serie: dict, variante: dict) -> dict:
    reglas_v = {**serie.get("validacion", {}), **variante.get("validacion", {})}
    excluidas = [{"desde": e["fecha"]} for e in variante.get("excluir", [])]
    if excluidas:
        reglas_v["huecos_permitidos"] = reglas_v.get("huecos_permitidos", []) + excluidas
    return reglas_v


def validar_variante(nombre: str, s: pd.Series, frecuencia: str, reglas_v: dict, variante: dict,
                     capa1_series: dict[str, pd.Series]) -> list[reglas.Problema]:
    problemas = reglas.esquema(nombre, s)
    if problemas:
        return problemas
    problemas += reglas.huecos(nombre, s, frecuencia, reglas_v.get("huecos_permitidos"), reglas_v.get("meses"))
    problemas += reglas.rangos(nombre, s, reglas_v)
    for c in variante.get("continuidad", []):
        problemas += reglas.continuidad(nombre, capa1_series[c["a"]], capa1_series[c["b"]], f"{c['a']} vs {c['b']}",
                                        c["tolerancia"], c.get("en", "tasas"), c.get("severidad", "error"),
                                        desde=a_fecha(c["desde"]), hasta=a_fecha(c["hasta"]),
                                        excepciones=c.get("excepciones"))
    for c in variante.get("coherencia", []):
        problemas += reglas.coherencia_anual(nombre, capa1_series[c["mensual"]], capa1_series[c["anual"]],
                                             f"{c['mensual']} vs {c['anual']}", c.get("agregacion", "suma"),
                                             c["tolerancia_pct"])
    return problemas


def _sin_version(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k not in ("version_datos", "cita")}


def ejecutar(rutas: Rutas = Rutas(), solo: list[str] | None = None, con_red: bool = True) -> Resultado:
    res = Resultado()
    meta = cargar_metadatos(rutas, solo)
    momento = ahora_utc().isoformat().replace("+00:00", "Z")

    # 1-2. Snapshot y capa 1.
    capa1_series: dict[str, pd.Series] = {}
    desactualizadas: dict[str, str] = {}
    for fid in fuentes_necesarias(meta):
        fuente = meta.fuentes[fid]
        serie, desde = obtener_fuente(rutas, fuente, con_red, res)
        capa1_series[fid] = serie
        if desde:
            desactualizadas[fid] = desde
        res.problemas += reglas.esquema(fid, serie)
        res.problemas += reglas.huecos(fid, serie, fuente["frecuencia"], fuente.get("huecos_permitidos"), fuente.get("meses"))

    # 3-4. Capa 2 y validación.
    construidas: dict[str, tuple[dict, dict, pd.Series]] = {}
    for s in meta.series:
        for v in publicadas(s):
            vid = f"{s['id']}.{v['id']}"
            try:
                serie = variantes.construir(v, capa1_series, meta.signos)
            except ErrorPipeline as e:
                res.problemas.append(reglas.Problema(vid, "construcción", str(e)))
                continue
            frecuencia = v.get("frecuencia", s["frecuencia"])
            res.problemas += validar_variante(vid, serie, frecuencia, _reglas_variante(s, v), v, capa1_series)
            construidas[vid] = (s, v, serie)
            escribir_csv_serie(rutas.capa2 / s["id"] / f"{v['id']}.csv", serie)

    if res.errores:
        return res

    # 5. Revisiones y export.
    documentos: dict[str, dict] = {}
    entradas_revision = []
    hubo_cambios = False
    for vid, (s, v, serie) in construidas.items():
        frecuencia = v.get("frecuencia", s["frecuencia"])
        ruta = rutas.export / "series" / s["id"] / f"{v['id']}.json"
        desde = min((desactualizadas[t["fuente"]] for t in v["tramos"] if t["fuente"] in desactualizadas), default=None)
        doc = export_series.documento(s, v, serie, meta.fuentes, meta.quiebres, momento, desde)
        anterior = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else None
        if anterior is not None and _sin_version(anterior) == _sin_version(json.loads(export_series.a_texto(doc))):
            documentos[vid] = anterior
            continue
        hubo_cambios = True
        umbral = _reglas_variante(s, v).get("umbral_revision_pct", 0.5)
        rev = revisiones.comparar(serie, frecuencia, revisiones.leer_publicada(ruta), umbral)
        partes = []
        if anterior is None:
            partes.append(f"{len(serie)} observaciones (primera publicación)")
        else:
            if rev["nuevas"]:
                partes.append(f"{rev['nuevas']} observaciones nuevas")
            if rev["cambios"]:
                partes.append(f"{len(rev['cambios'])} valores revisados ({len(rev['sobre_umbral'])} sobre el umbral de {umbral} %)")
            if rev["quitadas"]:
                partes.append(f"{len(rev['quitadas'])} fechas quitadas por la fuente")
                res.avisos.append(f"{vid}: la fuente quitó fechas ya publicadas: {', '.join(rev['quitadas'][:10])}")
            if not partes:
                partes.append("cambios de metadatos")
        res.cambios.append(f"{vid}: " + "; ".join(partes))
        if rev["sobre_umbral"]:
            entradas_revision.append({"version_datos": momento, "variante": vid, "umbral_pct": umbral,
                                      "cambios": rev["sobre_umbral"]})
        export_series.escribir(rutas.export, doc)
        documentos[vid] = doc

    ruta_catalogo = rutas.export / "catalogo.json"
    version_general = momento
    if not hubo_cambios and ruta_catalogo.exists():
        version_general = json.loads(ruta_catalogo.read_text(encoding="utf-8"))["version_datos"]
    export_generales.escribir_generales(rutas.export, meta.series, documentos, meta.fuentes, meta.quiebres, version_general)
    export_generales.agregar_revisiones(rutas.export / "revisiones.json", entradas_revision)
    res.publicado = True
    return res
