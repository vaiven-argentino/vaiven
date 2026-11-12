"""Períodos y eventos (SPEC 2.4): lectura y validación de `metadatos/periodos.yaml` y `metadatos/eventos.yaml`.

Convenciones (fase 4b, decididas con Camilo el 11/11/2026):
- Los períodos son intervalos semiabiertos [desde, hasta): el día del traspaso pertenece al que entra. `hasta` vacío
  quiere decir «vigente», y solo lo puede tener el último período de cada tipo.
- Cada extremo con fecha lleva al menos una fuente (`para: desde`, `hasta` o `ambas`). Una fuente secundaria lleva la
  página; un corte sin hecho fechado se declara con una fuente de tipo `convencional` y su nota.
- Las etapas del curso (`catedra`) toman sus fechas de otros períodos con `igual_a` (por ejemplo,
  `p.gobierno.menem.desde`), y con ellas su fuente.
- Los gobiernos de más de un mandato (Menem, Fernández de Kirchner) llevan `mandatos`, que cubren el gobierno entero y
  permiten sombrear por persona o por mandato. Los episodios (procesos de varios meses, como la hiperinflación de
  1989–1990) pueden superponerse y llevan `fases`, con la misma estructura y las mismas reglas que los mandatos
  (correcciones de la revisión externa, 12/11/2026).
- Cada extremo con fecha propia lleva su `confianza` (alta, media o baja; SPEC 2.4). Las etapas la heredan del extremo
  que citan con `igual_a`.

Un error acá frena la publicación entera (no se puede atribuir a una fuente ni a una variante).
"""

from __future__ import annotations

import copy
import re
from datetime import date
from pathlib import Path

from pipeline.comun import ErrorPipeline, leer_yaml

TIPOS = ("gobierno", "ministro", "plan", "regimen_cambiario", "catedra", "episodio")
# Prefijo del id de cada tipo (SPEC 2.2: `p.<tipo>.<slug>`; el régimen cambiario usa `p.regimen`).
PREFIJO = {"gobierno": "gobierno", "ministro": "ministro", "plan": "plan", "regimen_cambiario": "regimen", "catedra": "catedra",
           "episodio": "episodio"}
SIN_SUPERPOSICION = ("gobierno", "ministro", "regimen_cambiario", "catedra")
CARACTERES = ("constitucional", "de_facto", "interino")
CONFIANZAS = ("alta", "media", "baja")
TIPOS_FUENTE = ("norma", "comunicacion_bcra", "oficial", "secundaria", "periodistica", "convencional")
CATEGORIAS = ("cambiario", "monetario", "financiero", "fiscal", "deuda", "crisis", "institucional")
INICIO = date(1970, 1, 1)
LARGO_NOMBRE_CORTO = 24

SLUG = r"[a-z0-9]+(?:-[a-z0-9]+)*"
RE_PERIODO = re.compile(rf"^p\.(gobierno|ministro|plan|regimen|catedra|episodio)\.({SLUG})$")
RE_EVENTO = re.compile(rf"^e\.(\d{{4}}-\d{{2}}-\d{{2}})\.({SLUG})$")
RE_PUBLICADO = re.compile(r"^\d{4}(-\d{2})?$")   # bibliografía con solo año o mes
RE_IGUAL_A = re.compile(r"^(p\.[a-z_]+\.[a-z0-9-]+)\.(desde|hasta)$")

CAMPOS_PERIODO = {"id", "tipo", "nombre", "nombre_corto", "desde", "hasta", "caracter", "cargo", "orden", "descripcion",
                  "notas", "fuentes", "mandatos", "fases", "referencia_curso", "confianza"}
CAMPOS_MANDATO = {"id", "nombre", "nombre_corto", "desde", "hasta", "descripcion", "notas", "fuentes", "confianza"}
# Subtramos de un período: los mandatos de un gobierno y las fases de un episodio (misma estructura y reglas).
SUBTRAMOS = {"gobierno": "mandatos", "episodio": "fases"}
CAMPOS_FUENTE = {"para", "tipo", "referencia", "publicado", "url", "pagina", "nota"}
CAMPOS_EVENTO = {"id", "fecha", "vigencia", "nombre", "nombre_corto", "categoria", "descripcion", "notas", "fuentes"}


def cargar(dir_metadatos: Path, hoy: date) -> tuple[list[dict], list[dict]]:
    """Lee, resuelve `igual_a` y valida. Sin los archivos (por ejemplo, en los repositorios de prueba) devuelve listas vacías."""
    ruta_p, ruta_e = dir_metadatos / "periodos.yaml", dir_metadatos / "eventos.yaml"
    periodos = (leer_yaml(ruta_p) or []) if ruta_p.exists() else []
    eventos = (leer_yaml(ruta_e) or []) if ruta_e.exists() else []
    errores = validar(periodos, eventos, hoy)
    if errores:
        raise ErrorPipeline("Períodos y eventos con errores:\n" + "\n".join(f"- {e}" for e in errores))
    return resolver(periodos), sorted(eventos, key=lambda e: (e["fecha"], e["id"]))


def resolver(periodos: list[dict]) -> list[dict]:
    """Copia de los períodos con las fechas de `igual_a` reemplazadas por la fecha y las fuentes del extremo citado."""
    salida = copy.deepcopy(periodos)
    por_id = {p["id"]: p for p in periodos}
    for p in salida:
        heredadas = []
        for extremo in ("desde", "hasta"):
            valor = p.get(extremo)
            if isinstance(valor, dict):
                ref, ext_ref = RE_IGUAL_A.match(valor["igual_a"]).groups()
                origen = por_id[ref]
                p[extremo] = origen[ext_ref]
                heredadas += [{**f, "para": extremo, "nota": f"Fecha de {ref} ({ext_ref})."}
                              for f in origen["fuentes"] if f["para"] in (ext_ref, "ambas")]
                if ext_ref in origen.get("confianza", {}):
                    p.setdefault("confianza", {})[extremo] = origen["confianza"][ext_ref]
        p["fuentes"] = heredadas + p.get("fuentes", [])
        if "confianza" in p:
            p["confianza"] = {e: p["confianza"][e] for e in ("desde", "hasta") if e in p["confianza"]}
    return sorted(salida, key=lambda p: (TIPOS.index(p["tipo"]), p["desde"], p["id"]))


def _es_fecha(v) -> bool:
    return isinstance(v, date)


def _fuentes(errores: list[str], quien: str, fuentes, extremos: list[str], con_para: bool = True) -> None:
    if not isinstance(fuentes, list) or not fuentes:
        if extremos:
            errores.append(f"{quien}: falta la fuente")
        return
    for k, f in enumerate(fuentes):
        q = f"{quien}, fuente {k + 1}"
        if not isinstance(f, dict):
            errores.append(f"{q}: tiene que ser un objeto")
            continue
        sobra = set(f) - CAMPOS_FUENTE
        if sobra:
            errores.append(f"{q}: campos desconocidos: {', '.join(sorted(sobra))}")
        if f.get("tipo") not in TIPOS_FUENTE:
            errores.append(f"{q}: tipo {f.get('tipo')!r} no es uno de {', '.join(TIPOS_FUENTE)}")
        if f.get("tipo") == "convencional":
            if not f.get("nota"):
                errores.append(f"{q}: un corte convencional lleva la nota que lo justifica")
        elif not str(f.get("referencia") or "").strip():
            errores.append(f"{q}: falta la referencia")
        if f.get("tipo") == "secundaria" and not str(f.get("pagina") or "").strip():
            errores.append(f"{q}: una fuente secundaria lleva la página")
        if "publicado" in f and not (_es_fecha(f["publicado"]) or RE_PUBLICADO.match(str(f["publicado"]))):
            errores.append(f"{q}: `publicado` tiene que ser AAAA-MM-DD, AAAA-MM o AAAA")
        if f.get("url") and not str(f["url"]).startswith(("https://", "http://")):
            errores.append(f"{q}: la URL tiene que empezar con https://")
        if con_para and f.get("para") not in ("desde", "hasta", "ambas"):
            errores.append(f"{q}: `para` tiene que ser desde, hasta o ambas")
    if con_para:
        for extremo in extremos:
            if not any(isinstance(f, dict) and f.get("para") in (extremo, "ambas") for f in fuentes):
                errores.append(f"{quien}: falta la fuente de «{extremo}»")


def _intervalo(errores: list[str], quien: str, desde, hasta, hoy: date) -> bool:
    if not _es_fecha(desde):
        errores.append(f"{quien}: `desde` tiene que ser una fecha AAAA-MM-DD")
        return False
    if hasta is not None and not _es_fecha(hasta):
        errores.append(f"{quien}: `hasta` tiene que ser una fecha AAAA-MM-DD o quedar vacío")
        return False
    if desde > hoy:
        errores.append(f"{quien}: `desde` ({desde}) es posterior a hoy")
    if hasta is not None and hasta > hoy:
        errores.append(f"{quien}: `hasta` ({hasta}) es posterior a hoy")
    if hasta is not None and not desde < hasta:
        errores.append(f"{quien}: `desde` ({desde}) tiene que ser anterior a `hasta` ({hasta})")
        return False
    return True


def validar(periodos, eventos, hoy: date) -> list[str]:
    errores: list[str] = []
    if not isinstance(periodos, list) or not isinstance(eventos, list):
        return ["periodos.yaml y eventos.yaml tienen que ser listas"]
    ids: set[str] = set()
    por_id: dict[str, dict] = {}
    for p in periodos:
        if not isinstance(p, dict) or not isinstance(p.get("id"), str):
            errores.append(f"período sin id: {p!r}")
            continue
        if p["id"] in ids:
            errores.append(f"{p['id']}: id repetido")
        ids.add(p["id"])
        por_id[p["id"]] = p

    # Fechas resueltas (con `igual_a`) para controlar el orden.
    fechas: dict[str, tuple] = {}
    for p in por_id.values():
        resueltas = []
        for extremo in ("desde", "hasta"):
            v = p.get(extremo)
            if isinstance(v, dict):
                m = RE_IGUAL_A.match(str(v.get("igual_a", ""))) if set(v) == {"igual_a"} else None
                if not m:
                    errores.append(f"{p['id']}: `{extremo}` tiene que ser una fecha o {{igual_a: <id>.desde|hasta}}")
                    v = None
                elif m.group(1) not in por_id or isinstance(por_id[m.group(1)].get(m.group(2)), dict):
                    errores.append(f"{p['id']}: `{extremo}` cita {v['igual_a']}, que no existe o no tiene fecha propia")
                    v = None
                else:
                    v = por_id[m.group(1)].get(m.group(2))
                    if v is None:
                        errores.append(f"{p['id']}: `{extremo}` cita {m.group(0)}, que está vacío")
            resueltas.append(v)
        fechas[p["id"]] = tuple(resueltas)

    for p in por_id.values():
        pid = p["id"]
        sobra = set(p) - CAMPOS_PERIODO
        if sobra:
            errores.append(f"{pid}: campos desconocidos: {', '.join(sorted(sobra))}")
        tipo = p.get("tipo")
        if tipo not in TIPOS:
            errores.append(f"{pid}: tipo {tipo!r} no es uno de {', '.join(TIPOS)}")
            continue
        m = RE_PERIODO.match(pid)
        if not m or m.group(1) != PREFIJO[tipo]:
            errores.append(f"{pid}: el id tiene que tener la forma p.{PREFIJO[tipo]}.<slug> (minúsculas, sin tildes, con guiones)")
        for campo in ("nombre", "nombre_corto"):
            if not str(p.get(campo) or "").strip():
                errores.append(f"{pid}: falta `{campo}`")
        if len(str(p.get("nombre_corto") or "")) > LARGO_NOMBRE_CORTO:
            errores.append(f"{pid}: `nombre_corto` tiene más de {LARGO_NOMBRE_CORTO} caracteres")
        if tipo == "gobierno" and p.get("caracter") not in CARACTERES:
            errores.append(f"{pid}: `caracter` tiene que ser uno de {', '.join(CARACTERES)}")
        if tipo != "gobierno" and ("caracter" in p or "mandatos" in p):
            errores.append(f"{pid}: `caracter` y `mandatos` son solo de los gobiernos")
        if tipo != "episodio" and "fases" in p:
            errores.append(f"{pid}: `fases` es solo de los episodios")
        if tipo == "ministro" and not str(p.get("cargo") or "").strip():
            errores.append(f"{pid}: falta `cargo` (el nombre de la cartera en esa época)")
        if tipo != "ministro" and "cargo" in p:
            errores.append(f"{pid}: `cargo` es solo de los ministros")
        if tipo == "catedra":
            if not isinstance(p.get("orden"), int):
                errores.append(f"{pid}: falta `orden` (entero)")
        elif "orden" in p or "referencia_curso" in p:
            errores.append(f"{pid}: `orden` y `referencia_curso` son solo de las etapas del curso")
        desde, hasta = fechas[pid]
        if desde is None and not isinstance(p.get("desde"), dict):
            errores.append(f"{pid}: falta `desde`")
            continue
        if desde is None:
            continue
        if not _intervalo(errores, pid, desde, hasta, hoy):
            continue
        propios = [e for e in ("desde", "hasta") if (p.get(e) is not None and not isinstance(p.get(e), dict))]
        if propios or p.get("fuentes"):
            _fuentes(errores, pid, p.get("fuentes"), propios)
        _confianza(errores, pid, p.get("confianza"), propios)
        campo = SUBTRAMOS.get(tipo)
        if campo and campo in p:
            _subtramos(errores, p, campo, ids, hoy, desde, hasta)

    # Por tipo: un solo abierto (el último), sin superposiciones, sin huecos en los gobiernos y etapas contiguas.
    for tipo in TIPOS:
        lista = sorted(((fechas[p["id"]], p) for p in por_id.values()
                        if p.get("tipo") == tipo and _es_fecha(fechas[p["id"]][0])
                        and (fechas[p["id"]][1] is None or _es_fecha(fechas[p["id"]][1]))),
                       key=lambda x: (x[0][0], x[1]["id"]))
        for k, ((d, h), p) in enumerate(lista):
            if h is None and k != len(lista) - 1:
                errores.append(f"{p['id']}: solo el último período de «{tipo}» puede quedar abierto")
        if tipo in SIN_SUPERPOSICION:
            for ((d1, h1), p1), ((d2, _), p2) in zip(lista, lista[1:]):
                if h1 is None or h1 > d2:
                    errores.append(f"{p1['id']} y {p2['id']} se superponen")
        if tipo == "gobierno" and lista:
            if lista[0][0][0] > INICIO:
                errores.append(f"gobiernos: el primero ({lista[0][1]['id']}) empieza después del {INICIO}")
            for ((_, h1), p1), ((d2, _), p2) in zip(lista, lista[1:]):
                if h1 is not None and h1 < d2:
                    errores.append(f"gobiernos: hay un hueco entre {p1['id']} ({h1}) y {p2['id']} ({d2})")
            if lista[-1][0][1] is not None:
                errores.append(f"gobiernos: el último ({lista[-1][1]['id']}) tiene que quedar abierto")
        if tipo == "catedra" and lista:
            for ((_, h1), p1), ((d2, _), p2) in zip(lista, lista[1:]):
                if h1 is not None and h1 != d2:
                    errores.append(f"etapas del curso: {p1['id']} termina el {h1} y {p2['id']} empieza el {d2}")
            ordenes = [p.get("orden") for _, p in lista]
            if ordenes != list(range(1, len(lista) + 1)):
                errores.append(f"etapas del curso: `orden` tiene que ir de 1 a {len(lista)} siguiendo las fechas ({ordenes})")

    _eventos(errores, eventos, hoy)
    return errores


def _confianza(errores: list[str], quien: str, confianza, extremos: list[str]) -> None:
    """Cada extremo con fecha propia lleva su confianza; los que vienen de `igual_a` la heredan y no la repiten."""
    if not extremos and confianza is None:
        return
    if not isinstance(confianza, dict):
        errores.append(f"{quien}: falta `confianza` ({{desde: alta|media|baja, hasta: …}})")
        return
    sobra = set(confianza) - set(extremos)
    if sobra:
        errores.append(f"{quien}: `confianza` de {', '.join(sorted(sobra))} sobra (el extremo no tiene fecha propia)")
    for extremo in extremos:
        if confianza.get(extremo) not in CONFIANZAS:
            errores.append(f"{quien}: la confianza de «{extremo}» tiene que ser {', '.join(CONFIANZAS)}")


def _subtramos(errores: list[str], p: dict, campo: str, ids: set[str], hoy: date, desde: date, hasta) -> None:
    """Mandatos de un gobierno o fases de un episodio: dos o más, contiguos y cubriendo el período entero."""
    pid = p["id"]
    prefijo = PREFIJO[p["tipo"]]
    singular, primero, ultimo, contiguos, todo = {
        "mandatos": ("mandato", "el primer mandato", "el último mandato", "contiguos", "el gobierno"),
        "fases": ("fase", "la primera fase", "la última fase", "contiguas", "el episodio"),
    }[campo]
    tramos = p[campo]
    nombre_tramos = {"mandatos": "los mandatos", "fases": "las fases"}[campo]
    if not isinstance(tramos, list) or len(tramos) < 2:
        errores.append(f"{pid}: `{campo}` va solo cuando hay dos o más")
        return
    anterior = None
    for k, mt in enumerate(tramos):
        mid = mt.get("id") if isinstance(mt, dict) else None
        quien = f"{pid}, {singular} {k + 1}"
        if not isinstance(mid, str) or not RE_PERIODO.match(mid) or not mid.startswith(f"p.{prefijo}."):
            errores.append(f"{quien}: el id tiene que tener la forma p.{prefijo}.<slug>")
            continue
        if mid in ids:
            errores.append(f"{mid}: id repetido")
        ids.add(mid)
        sobra = set(mt) - CAMPOS_MANDATO
        if sobra:
            errores.append(f"{mid}: campos desconocidos: {', '.join(sorted(sobra))}")
        for campo in ("nombre", "nombre_corto"):
            if not str(mt.get(campo) or "").strip():
                errores.append(f"{mid}: falta `{campo}`")
        if not _intervalo(errores, mid, mt.get("desde"), mt.get("hasta"), hoy):
            continue
        extremos = ["desde"] + (["hasta"] if mt.get("hasta") is not None else [])
        _fuentes(errores, mid, mt.get("fuentes"), extremos)
        _confianza(errores, mid, mt.get("confianza"), extremos)
        if k == 0 and mt["desde"] != desde:
            errores.append(f"{mid}: {primero} tiene que empezar con {todo} ({desde})")
        if anterior is not None and anterior != mt["desde"]:
            errores.append(f"{mid}: {nombre_tramos} tienen que ser {contiguos} (el tramo anterior termina el {anterior})")
        anterior = mt.get("hasta")
    if anterior != hasta:
        errores.append(f"{pid}: {ultimo} tiene que terminar con {todo} ({hasta})")


def _eventos(errores: list[str], eventos: list, hoy: date) -> None:
    vistos: set[str] = set()
    for ev in eventos:
        if not isinstance(ev, dict) or not isinstance(ev.get("id"), str):
            errores.append(f"evento sin id: {ev!r}")
            continue
        eid = ev["id"]
        if eid in vistos:
            errores.append(f"{eid}: id repetido")
        vistos.add(eid)
        sobra = set(ev) - CAMPOS_EVENTO
        if sobra:
            errores.append(f"{eid}: campos desconocidos: {', '.join(sorted(sobra))}")
        m = RE_EVENTO.match(eid)
        fecha = ev.get("fecha")
        if not _es_fecha(fecha):
            errores.append(f"{eid}: `fecha` tiene que ser una fecha AAAA-MM-DD")
        elif not m or m.group(1) != fecha.isoformat():
            errores.append(f"{eid}: el id tiene que tener la forma e.<fecha>.<slug>, con la fecha del evento ({fecha})")
        elif not INICIO <= fecha <= hoy:
            errores.append(f"{eid}: la fecha tiene que estar entre {INICIO} y hoy")
        if "vigencia" in ev and (not _es_fecha(ev["vigencia"]) or (_es_fecha(fecha) and ev["vigencia"] < fecha)):
            errores.append(f"{eid}: `vigencia` tiene que ser una fecha igual o posterior a la del evento")
        for campo in ("nombre", "nombre_corto", "descripcion"):
            if not str(ev.get(campo) or "").strip():
                errores.append(f"{eid}: falta `{campo}`")
        if len(str(ev.get("nombre_corto") or "")) > LARGO_NOMBRE_CORTO:
            errores.append(f"{eid}: `nombre_corto` tiene más de {LARGO_NOMBRE_CORTO} caracteres")
        if ev.get("categoria") not in CATEGORIAS:
            errores.append(f"{eid}: `categoria` tiene que ser una de {', '.join(CATEGORIAS)}")
        _fuentes(errores, eid, ev.get("fuentes"), ["fecha"], con_para=False)


def vigentes(periodos: list[dict], fecha: date) -> list[dict]:
    """Los períodos vigentes en una fecha (intervalo semiabierto)."""
    return [p for p in periodos if p["desde"] <= fecha and (p["hasta"] is None or fecha < p["hasta"])]
