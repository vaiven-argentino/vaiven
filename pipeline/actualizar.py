"""Orquestación del pipeline: snapshot → capa 1 → capa 2 → validación → export (SPEC 5.1, pasos 2 a 6)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date

import pandas as pd

from pipeline.capa1 import normalizar as capa1
from pipeline.capa2 import derivadas, signos_monetarios, variantes
from pipeline.comun import (ErrorPipeline, Rutas, a_fecha, ahora_utc, escribir_csv_entidades, escribir_csv_serie,
                            leer_csv_serie, leer_yaml)
from pipeline.export import catalogo as export_generales
from pipeline.export import insumos as export_insumos
from pipeline.export import periodos as export_periodos
from pipeline.export import series as export_series
from pipeline.fuentes import base
from pipeline.fuentes import estado as estado_fuentes
from pipeline.validacion import periodos as validacion_periodos
from pipeline.validacion import reglas, revisiones


@dataclass
class Metadatos:
    series: list[dict]
    fuentes: dict[str, dict]
    quiebres: dict[str, dict]
    signos: list[dict]
    periodos: list[dict] = field(default_factory=list)
    eventos: list[dict] = field(default_factory=list)


@dataclass
class Resultado:
    problemas: list[reglas.Problema] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
    cambios: list[str] = field(default_factory=list)
    snapshots_nuevos: list[str] = field(default_factory=list)
    publicado: bool = False
    # Variantes que no pasaron la validación (o dependen de una fuente que no la pasó): se conserva lo publicado
    # antes y se publican las demás.
    retenidas: dict[str, list[str]] = field(default_factory=dict)
    # Fuentes que necesitan que alguien las mire: no responden hace más de una semana, o son de descarga manual y no
    # tienen versión nueva hace más de 3 meses. El workflow abre un issue por cada una (SPEC 5.2).
    atencion: list[dict] = field(default_factory=list)
    # Fuentes que se intentaron descargar en esta corrida (para cerrar los issues de las que volvieron a responder).
    consultadas: list[str] = field(default_factory=list)

    @property
    def errores(self) -> list[reglas.Problema]:
        return [p for p in self.problemas if p.severidad == "error"]

    def informe(self) -> str:
        lineas = []
        if self.errores and not self.publicado:
            lineas.append("## La validación falló: no se publicó nada\n")
            lineas += [p.como_texto() for p in self.errores]
        elif self.retenidas:
            lineas.append("## Variantes retenidas: se conserva lo publicado antes\n")
            for vid, motivos in self.retenidas.items():
                lineas.append(f"- {vid}: {motivos[0]}" + (f" (y {len(motivos) - 1} problemas más)" if len(motivos) > 1 else ""))
            lineas.append("")
            lineas += [p.como_texto() for p in self.errores]
        if self.atencion:
            lineas.append("\n## Fuentes que necesitan atención\n")
            lineas += [f"- {a['fuente']}: {a['motivo']}" for a in self.atencion]
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


def cargar_metadatos(rutas: Rutas, solo: list[str] | None = None, hoy: date | None = None) -> Metadatos:
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
    periodos, eventos = validacion_periodos.cargar(rutas.metadatos, hoy or ahora_utc().date())
    return Metadatos(series, fuentes, quiebres, signos, periodos, eventos)


def _controlar_referencias(series: list[dict], fuentes: dict, quiebres: dict) -> None:
    for s in series:
        for v in s["variantes"]:
            for t in v["tramos"]:
                if t["fuente"] not in fuentes:
                    raise ErrorPipeline(f"{s['id']}.{v['id']}: la fuente {t['fuente']} no está en fuentes.yaml")
            for q in v.get("advertencias", []):
                if q not in quiebres:
                    raise ErrorPipeline(f"{s['id']}.{v['id']}: el quiebre {q} no está en quiebres.yaml")
                # Un quiebre de un solo país solo tiene sentido en una serie con esa entidad.
                ajenas = set(quiebres[q].get("entidades") or []) - {e["id"] for e in s.get("entidades", [])}
                if ajenas:
                    raise ErrorPipeline(f"{s['id']}.{v['id']}: el quiebre {q} nombra entidades que la serie no tiene: "
                                        f"{', '.join(sorted(ajenas))}")
            if v.get("estado", "publicada") == "publicada":
                for t in v["tramos"]:
                    if not fuentes[t["fuente"]].get("redistribuible", True):
                        raise ErrorPipeline(
                            f"{s['id']}.{v['id']} está marcada como publicada pero usa {t['fuente']}, que no es redistribuible."
                        )


def publicadas(serie: dict) -> list[dict]:
    return [v for v in serie["variantes"] if v.get("estado", "publicada") == "publicada"]


def capa1_previa(rutas: Rutas, fuente: dict) -> pd.Series | None:
    """La capa 1 publicada antes de esta corrida (para ver si la fuente perdió fechas)."""
    if fuente.get("paises"):
        return None
    ruta = capa1.dir_capa1(rutas, fuente) / f"{fuente['id']}.csv"
    return leer_csv_serie(ruta) if ruta.exists() else None


# Más fechas perdidas que esto frena las variantes de la fuente: una fuente que recorta su historia.
MAX_FECHAS_PERDIDAS = 12


def historia_recortada(fid: str, previa: pd.Series, nueva: pd.Series) -> list[reglas.Problema]:
    perdidas = sorted(set(previa.index) - set(nueva.index))
    if len(perdidas) <= MAX_FECHAS_PERDIDAS:
        return []
    return [reglas.Problema(fid, "historia", f"La fuente perdió {len(perdidas)} fechas que ya tenía "
                            f"(de {perdidas[0].date().isoformat()[:7]} a {perdidas[-1].date().isoformat()[:7]}).")]


def cobertura_recortada(vid: str, serie: pd.Series, variante: dict) -> list[reglas.Problema]:
    """La variante empieza más de un año después de lo que declaran sus tramos: la fuente recortó su historia."""
    if not len(serie):
        return []
    declarado = min(a_fecha(t["desde"]) for t in variante["tramos"] if not t.get("completa"))
    if serie.index.min() <= declarado + pd.DateOffset(months=12):
        return []
    return [reglas.Problema(vid, "historia", f"Empieza en {serie.index.min().date().isoformat()[:7]} y los tramos "
                            f"declaran {declarado.date().isoformat()[:7]}: la fuente recortó su historia.")]


def variantes_retenidas(todas: list[tuple[dict, dict]], errores: list[reglas.Problema],
                        fuentes: set[str]) -> tuple[dict[str, list[str]], list[reglas.Problema]]:
    """A qué variantes se atribuye cada error (por su fuente o por la variante) y cuáles no se pueden atribuir."""
    vids = {f"{s['id']}.{v['id']}" for s, v in todas}
    por_fuente: dict[str, list[str]] = {}
    por_variante: dict[str, list[str]] = {}
    sin_atribuir = []
    for p in errores:
        clave = p.serie.split("[")[0].split("#")[0]
        if clave in vids:
            por_variante.setdefault(clave, []).append(f"{p.regla}: {p.detalle}")
        elif clave in fuentes:
            por_fuente.setdefault(clave, []).append(f"{clave} · {p.regla}: {p.detalle}")
        else:
            sin_atribuir.append(p)
    retenidas = dict(por_variante)
    cambio = True
    while cambio:
        cambio = False
        for s, v in todas:
            vid = f"{s['id']}.{v['id']}"
            if vid in retenidas:
                continue
            usadas = [t["fuente"] for t in v["tramos"]] + [c[k] for c in v.get("continuidad", []) for k in ("a", "b")]
            usadas += [c[k] for c in v.get("coherencia", []) for k in ("mensual", "anual")] + derivadas.operandos_de(v)
            motivos = [m for u in usadas for m in por_fuente.get(u, [])]
            motivos += [f"depende de {u}, retenida" for u in usadas if u in retenidas]
            if motivos:
                retenidas[vid] = motivos
                cambio = True
    return retenidas, sin_atribuir


def desactualizada_publicada(rutas: Rutas, nombre: str) -> str | None:
    """`desactualizada_desde` del JSON publicado de una variante (operando de una derivada en una corrida parcial)."""
    if nombre.startswith("f.") or "." not in nombre:
        return None
    serie, variante = nombre.split(".", 1)
    for carpeta in ("series", "auxiliares"):
        ruta = rutas.export / carpeta / serie / f"{variante}.json"
        if ruta.exists():
            return json.loads(ruta.read_text(encoding="utf-8")).get("desactualizada_desde")
    return None


def quitar_despublicadas(rutas: Rutas, series: list[dict]) -> list[str]:
    """Borra el JSON y los CSV (descarga y capa 2) de las variantes exportadas que ya no están publicadas."""
    vigentes = {f"{s['id']}.{v['id']}" for s in series for v in publicadas(s)}
    quitadas = []
    for carpeta in ("series", "auxiliares"):
        for ruta in sorted((rutas.export / carpeta).glob("*/*.json")):
            vid = f"{ruta.parent.name}.{ruta.stem}"
            if vid in vigentes:
                continue
            csv = rutas.export / "descargas" / "csv" / ("auxiliares" if carpeta == "auxiliares" else "") / ruta.parent.name / f"{ruta.stem}.csv"
            for archivo in (ruta, csv, rutas.capa2 / ruta.parent.name / f"{ruta.stem}.csv"):
                archivo.unlink(missing_ok=True)
            quitadas.append(vid)
    return quitadas


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


def obtener_fuente(rutas: Rutas, fuente: dict, con_red: bool, res: Resultado,
                   estado: estado_fuentes.EstadoFuentes | None = None, hoy: date | None = None) -> tuple[pd.Series, str | None]:
    """Snapshot y capa 1 de una fuente. Devuelve la serie y, si quedó desactualizada, desde cuándo.

    - Si la fuente no responde, se usa el último snapshot y la variante queda desactualizada desde el primer día en que
      no respondió (`snapshots/estado-fuentes.json`). Una corrida sin red conserva esa marca: no la «arregla».
    - Las fuentes de descarga manual (`descarga: manual`, por ejemplo Bruegel, que bloquea a los servidores de GitHub)
      no se descargan acá: se usa el último snapshot, que se baja con `python -m pipeline bajar-manual`. Quedan
      desactualizadas recién si su versión tiene más de 3 meses.
    """
    estado = estado or estado_fuentes.EstadoFuentes(rutas.snapshots)
    hoy = hoy or ahora_utc().date()
    fid = fuente["id"]
    dir_fuente = rutas.snapshots / fid
    manual = fuente.get("descarga") == "manual"
    desactualizada = None
    snapshot = None
    if con_red and not manual:
        res.consultadas.append(fid)
        try:
            mod = capa1.modulo(fuente)
            archivos = mod.bajar(fuente)
            snapshot, nuevo = base.guardar_snapshot(rutas.snapshots, fuente, archivos,
                                                    canonizar=getattr(mod, "canonizar", None))
            if nuevo:
                res.snapshots_nuevos.append(snapshot.relative_to(rutas.raiz).as_posix())
            estado.respondio(fid)
        except ErrorPipeline as e:
            snapshot = base.ultimo_snapshot(dir_fuente)
            if snapshot is None:
                raise ErrorPipeline(f"{fid}: la fuente no respondió y no hay snapshots anteriores. {e}")
            desactualizada = estado.fallo(fid, hoy)
            descargado = base.leer_meta(snapshot)["descargado"][:10]
            res.avisos.append(f"{fid}: la fuente no respondió (desde el {desactualizada}); se usan los datos descargados "
                              f"el {descargado}. {e}")
            dias = estado_fuentes.dias_desde(desactualizada, hoy)
            if dias > estado_fuentes.DIAS_SIN_RESPONDER:
                res.atencion.append({"fuente": fid, "desde": desactualizada,
                                     "motivo": f"no responde desde el {desactualizada} ({dias} días). Último error: {e}"})
    else:
        snapshot = base.ultimo_snapshot(dir_fuente)
        if snapshot is None:
            if manual:
                raise ErrorPipeline(f"{fid}: es de descarga manual y no tiene snapshots: corré "
                                    f"`uv run python -m pipeline bajar-manual {fid}`.")
            raise ErrorPipeline(f"{fid}: no hay snapshots y se pidió correr sin red.")
        if not manual:
            desactualizada = estado.fallando_desde(fid)
    if manual:
        meta = base.leer_meta(snapshot)
        mod = capa1.modulo(fuente)
        version = mod.version_de_meta(meta) if hasattr(mod, "version_de_meta") else None
        version = version or meta.get("version") or meta["descargado"][:10]
        fuente["version"] = version
        dias = estado_fuentes.dias_desde(version, hoy)
        if dias > estado_fuentes.DIAS_VERSION_MANUAL:
            desactualizada = estado_fuentes.vencimiento_manual(version)
            res.avisos.append(f"{fid}: la versión que tiene Vaivén es del {version} ({dias} días); "
                              f"fijate si hay una nueva con `uv run python -m pipeline bajar-manual {fid}`.")
            res.atencion.append({"fuente": fid, "desde": desactualizada,
                                 "motivo": f"es de descarga manual y su versión es del {version} ({dias} días): "
                                           f"corré `uv run python -m pipeline bajar-manual {fid}`."})
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


def ejecutar(rutas: Rutas = Rutas(), solo: list[str] | None = None, con_red: bool = True,
             hoy: date | None = None) -> Resultado:
    res = Resultado()
    hoy = hoy or ahora_utc().date()
    meta = cargar_metadatos(rutas, solo, hoy)
    momento = ahora_utc().isoformat().replace("+00:00", "Z")
    estado = estado_fuentes.EstadoFuentes(rutas.snapshots)

    # 1-2. Snapshot y capa 1.
    capa1_series: dict[str, pd.Series] = {}
    desactualizadas: dict[str, str] = {}
    for fid in fuentes_necesarias(meta):
        fuente = meta.fuentes[fid]
        previa = capa1_previa(rutas, fuente)
        serie, desde = obtener_fuente(rutas, fuente, con_red, res, estado, hoy)
        if previa is not None and not isinstance(serie, dict):
            res.problemas += historia_recortada(fid, previa, serie)
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

    if con_red:
        estado.guardar()

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
                continue
            try:
                serie = variantes.construir(v, capa1_series, meta.signos, meta.fuentes, disponibles, frecuencia)
            except ErrorPipeline as e:
                res.problemas.append(reglas.Problema(vid, "construcción", str(e)))
                continue
            res.problemas += validar_variante(vid, serie, frecuencia, _reglas_variante(s, v), v, capa1_series)
            if v.get("empalme") != "derivar":
                res.problemas += cobertura_recortada(vid, serie, v)
            construidas[vid] = (s, v, serie)
        if not avance:
            for s, v in pendientes:
                faltan = [n for n in derivadas.operandos_de(v) if operando(n) is None]
                res.problemas.append(reglas.Problema(f"{s['id']}.{v['id']}", "construcción",
                                                     f"Faltan los operandos {', '.join(faltan)} (o hay una dependencia circular)."))
            break

    # Aislamiento: un error de una fuente o de una variante retiene esa variante (y las derivadas que dependen de
    # ella); las demás se publican. Un error que no se puede atribuir frena todo, como antes.
    todas = [(s, v) for s in meta.series for v in publicadas(s)]
    retenidas, sin_atribuir = variantes_retenidas(todas, res.errores, set(meta.fuentes))
    if sin_atribuir:
        return res
    res.retenidas = retenidas
    for vid in retenidas:
        construidas.pop(vid, None)
    for vid, (s, v, serie) in construidas.items():
        if isinstance(serie, dict):
            escribir_csv_entidades(rutas.capa2 / s["id"] / f"{v['id']}.csv", serie)
        else:
            escribir_csv_serie(rutas.capa2 / s["id"] / f"{v['id']}.csv", serie)

    # 5. Revisiones y export.
    documentos: dict[str, dict] = {}
    entradas_revision = []
    hubo_cambios = False
    nuevos: dict[str, dict] = {}
    desact_variante: dict[str, str | None] = {}
    for vid, (s, v, serie) in construidas.items():
        # Las derivadas heredan la fecha de sus operandos (variantes o fuentes) que quedaron desactualizados.
        fechas = [desactualizadas[t["fuente"]] for t in v["tramos"] if t["fuente"] in desactualizadas]
        for o in derivadas.operandos_de(v):
            fechas += [f for f in (desactualizadas.get(o), desact_variante.get(o), desactualizada_publicada(rutas, o)) if f]
        desde = min(fechas, default=None)
        desact_variante[vid] = desde
        # El tramo que completa (series diarias del BCRA) se exporta con su `desde` real, o no se exporta si no aporta.
        v_export = variantes.resolver_completa(v, capa1_series) if not isinstance(serie, dict) else v
        nuevos[vid] = export_series.documento(s, v_export, serie, meta.fuentes, meta.quiebres, momento, desde)
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

    # Las retenidas conservan su JSON anterior, marcado como desactualizado desde su última versión.
    for vid in retenidas:
        s = next(x for x, v in todas if f"{x['id']}.{v['id']}" == vid)
        ruta = rutas.export / export_insumos.archivo(vid.split(".")[0], vid.split(".", 1)[1], bool(s.get("auxiliar")))
        if not ruta.exists():
            res.cambios.append(f"{vid}: retenida y sin versión anterior: no se publica")
            continue
        anterior = json.loads(ruta.read_text(encoding="utf-8"))
        if not anterior.get("desactualizada_desde"):
            anterior["desactualizada_desde"] = anterior["version_datos"][:10]
            export_series.escribir(rutas.export, anterior)
            hubo_cambios = True
        documentos[vid] = anterior
        res.cambios.append(f"{vid}: retenida; se conserva la versión del {anterior['version_datos'][:10]}")

    # Variantes que dejaron de estar publicadas (pasaron a pendiente o se borraron de los metadatos): se quitan del
    # export y de la capa 2, para que despublicar sea solo cambiar el `estado` en el YAML.
    quitadas = quitar_despublicadas(rutas, cargar_metadatos(rutas, hoy=hoy).series if solo else meta.series)
    if quitadas:
        hubo_cambios = True
        res.cambios += [f"{vid}: despublicada (se quitaron su JSON y sus CSV)" for vid in quitadas]

    # Períodos y eventos: si cambió su contenido, cuenta como cambio y lleva la versión nueva.
    hay_periodos = bool(meta.periodos or meta.eventos)
    if hay_periodos:
        for nombre, doc in (("periodos.json", export_periodos.documento_periodos(meta.periodos, "", export_generales.PUBLICAR_BIBLIOGRAFIA)),
                            ("eventos.json", export_periodos.documento_eventos(meta.eventos, ""))):
            ruta = rutas.export / nombre
            anterior = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else None
            if anterior is None or {**anterior, "version_datos": ""} != doc:
                hubo_cambios = True
                cantidad = len(doc.get("periodos", doc.get("eventos", [])))
                res.cambios.append(f"{nombre}: {cantidad} {'períodos' if 'periodos' in doc else 'eventos'}"
                                   f"{' (primera publicación)' if anterior is None else ' (cambiaron)'}")

    ruta_catalogo = rutas.export / "catalogo.json"
    version_general = momento
    if not hubo_cambios and ruta_catalogo.exists():
        version_general = json.loads(ruta_catalogo.read_text(encoding="utf-8"))["version_datos"]
    series_generales = meta.series
    if solo:
        # Corrida parcial: el catálogo y el datapackage siguen describiendo todas las series, con lo ya publicado.
        series_generales = cargar_metadatos(rutas, hoy=hoy).series
        for s in series_generales:
            for v in publicadas(s):
                vid = f"{s['id']}.{v['id']}"
                ruta = rutas.export / export_insumos.archivo(s["id"], v["id"], bool(s.get("auxiliar")))
                if vid not in documentos and ruta.exists():
                    documentos[vid] = json.loads(ruta.read_text(encoding="utf-8"))
    export_generales.escribir_generales(rutas.export, series_generales, documentos, meta.fuentes, meta.quiebres,
                                        version_general, rutas.inventario, meta.signos,
                                        (meta.periodos, meta.eventos) if hay_periodos else None)
    export_generales.agregar_revisiones(rutas.export / "revisiones.json", entradas_revision)
    res.publicado = True
    return res
