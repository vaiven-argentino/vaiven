"""Orquestación del pipeline: snapshot → capa 1 → capa 2 → validación → export (SPEC 5.1, pasos 2 a 6)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

import pandas as pd

from pipeline.capa1 import normalizar as capa1
from pipeline.capa2 import derivadas, signos_monetarios, variantes
from pipeline.comun import (ErrorPipeline, Rutas, a_fecha, ahora_utc, escribir_csv_entidades, escribir_csv_serie,
                            leer_csv_serie, leer_yaml)
from pipeline.export import catalogo as export_generales
from pipeline.export import insumos as export_insumos
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
    # Las auxiliares (SPEC 2.6) tienen los mismos metadatos y la misma validación, pero no van al catálogo.
    rutas_meta = [(r, False) for r in sorted((rutas.metadatos / "series").glob("*.yaml"))]
    rutas_meta += [(r, True) for r in sorted((rutas.metadatos / "auxiliares").glob("*.yaml"))]
    for ruta, auxiliar in rutas_meta:
        s = leer_yaml(ruta)
        if auxiliar:
            s["auxiliar"] = True
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
            ids += [o for o in derivadas.operandos_de(v) if o.startswith("f.")]
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
    if fuente.get("paises"):
        return capa1.normalizar_paises(rutas, fuente, snapshot), desactualizada
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
        if isinstance(serie, dict):
            # Fuente con dimensión pais: cada entidad es una serie de capa 1 «<fuente>#<ISO3>».
            for entidad, s_ent in serie.items():
                capa1_series[f"{fid}#{entidad}"] = s_ent
                res.problemas += reglas.esquema(f"{fid}#{entidad}", s_ent)
                res.problemas += reglas.huecos(f"{fid}#{entidad}", s_ent, fuente["frecuencia"],
                                               fuente.get("huecos_permitidos"), fuente.get("meses"))
            if desde:
                desactualizadas[fid] = desde
            continue
        capa1_series[fid] = serie
        if desde:
            desactualizadas[fid] = desde
        res.problemas += reglas.esquema(fid, serie)
        res.problemas += reglas.huecos(fid, serie, fuente["frecuencia"], fuente.get("huecos_permitidos"), fuente.get("meses"))

    # 3-4. Capa 2 y validación. Las derivadas (empalme: derivar) se arman cuando están sus operandos.
    construidas: dict[str, tuple[dict, dict, pd.Series]] = {}
    pendientes = [(s, v) for s in meta.series for v in publicadas(s)]

    def operando(nombre: str) -> pd.Series | None:
        if nombre in capa1_series:
            return capa1_series[nombre]
        if nombre in construidas:
            return construidas[nombre][2]
        serie_id, _, var_id = nombre.partition(".")
        ruta = rutas.capa2 / serie_id / f"{var_id}.csv"     # corrida parcial: lo ya armado
        return leer_csv_serie(ruta) if ruta.exists() and not any(f"{s['id']}.{v['id']}" == nombre for s, v in pendientes) else None

    while pendientes:
        avance = False
        for s, v in list(pendientes):
            vid = f"{s['id']}.{v['id']}"
            frecuencia = v.get("frecuencia", s["frecuencia"])
            disponibles = None
            if v.get("empalme") == "derivar":
                ops = {n: operando(n) for n in derivadas.operandos_de(v)}
                if any(x is None for x in ops.values()):
                    continue
                disponibles = ops
            pendientes.remove((s, v))
            avance = True
            if "pais" in s.get("dimensiones", []):
                # Una serie por entidad, con las fuentes de esa entidad; se validan por separado.
                por_entidad = {}
                for ent in [e["id"] for e in s["entidades"]]:
                    v_ent = {**v, "tramos": [{**t, "fuente": f"{t['fuente']}#{ent}"} for t in v["tramos"]]}
                    try:
                        por_entidad[ent] = variantes.construir(v_ent, capa1_series, meta.signos, meta.fuentes, None, frecuencia)
                    except ErrorPipeline as e:
                        res.problemas.append(reglas.Problema(f"{vid}[{ent}]", "construcción", str(e)))
                        continue
                    res.problemas += validar_variante(f"{vid}[{ent}]", por_entidad[ent], frecuencia,
                                                      _reglas_variante(s, v), v, capa1_series)
                construidas[vid] = (s, v, por_entidad)
                escribir_csv_entidades(rutas.capa2 / s["id"] / f"{v['id']}.csv", por_entidad)
                continue
            try:
                serie = variantes.construir(v, capa1_series, meta.signos, meta.fuentes, disponibles, frecuencia)
            except ErrorPipeline as e:
                res.problemas.append(reglas.Problema(vid, "construcción", str(e)))
                continue
            res.problemas += validar_variante(vid, serie, frecuencia, _reglas_variante(s, v), v, capa1_series)
            construidas[vid] = (s, v, serie)
            escribir_csv_serie(rutas.capa2 / s["id"] / f"{v['id']}.csv", serie)
        if not avance:
            for s, v in pendientes:
                faltan = [n for n in derivadas.operandos_de(v) if operando(n) is None]
                res.problemas.append(reglas.Problema(f"{s['id']}.{v['id']}", "construcción",
                                                     f"Faltan los operandos {', '.join(faltan)} (o hay una dependencia circular)."))
            break

    if res.errores:
        return res

    # 5. Revisiones y export.
    documentos: dict[str, dict] = {}
    entradas_revision = []
    hubo_cambios = False
    nuevos: dict[str, dict] = {}
    for vid, (s, v, serie) in construidas.items():
        desde = min((desactualizadas[t["fuente"]] for t in v["tramos"] if t["fuente"] in desactualizadas), default=None)
        nuevos[vid] = export_series.documento(s, v, serie, meta.fuentes, meta.quiebres, momento, desde)
    # Los insumos dependen de qué otras variantes quedan publicadas: se completan con todos los documentos armados.
    publicadas_export = export_insumos.Publicadas(nuevos, rutas.export, rutas.metadatos)
    for vid, (s, v, serie) in construidas.items():
        unidades = {**s.get("unidades_medida", {}), **v.get("unidades_medida", {})}
        nuevos[vid]["insumos"] = export_insumos.insumos(nuevos[vid], unidades, publicadas_export)

    for vid, (s, v, serie) in construidas.items():
        frecuencia = v.get("frecuencia", s["frecuencia"])
        ruta = rutas.export / export_insumos.archivo(s["id"], v["id"], bool(s.get("auxiliar")))
        doc = nuevos[vid]
        anterior = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else None
        if anterior is not None and _sin_version(anterior) == _sin_version(json.loads(export_series.a_texto(doc))):
            documentos[vid] = anterior
            continue
        hubo_cambios = True
        umbral = _reglas_variante(s, v).get("umbral_revision_pct", 0.5)
        if isinstance(serie, dict):
            rev = revisiones.comparar_entidades(serie, frecuencia, revisiones.leer_publicada(ruta), umbral)
            serie = pd.concat(serie.values())   # solo para contar observaciones en el informe
        else:
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
    series_generales = meta.series
    if solo:
        # Corrida parcial: el catálogo y el datapackage siguen describiendo todas las series, con lo ya publicado.
        series_generales = cargar_metadatos(rutas).series
        for s in series_generales:
            for v in publicadas(s):
                vid = f"{s['id']}.{v['id']}"
                ruta = rutas.export / export_insumos.archivo(s["id"], v["id"], bool(s.get("auxiliar")))
                if vid not in documentos and ruta.exists():
                    documentos[vid] = json.loads(ruta.read_text(encoding="utf-8"))
    export_generales.escribir_generales(rutas.export, series_generales, documentos, meta.fuentes, meta.quiebres,
                                        version_general, rutas.inventario, meta.signos)
    export_generales.agregar_revisiones(rutas.export / "revisiones.json", entradas_revision)
    res.publicado = True
    return res
