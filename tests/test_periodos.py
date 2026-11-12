"""Períodos y eventos (SPEC 2.4): validación de los YAML, export y contrato."""

import copy
import csv
import io
import json
from datetime import date

import jsonschema
import pytest
import yaml

from pipeline.comun import RAIZ, ErrorPipeline
from pipeline.export import periodos as exp
from pipeline.validacion import periodos as val

HOY = date(2026, 11, 11)
CONTRATO = RAIZ / "tests" / "contrato"


def norma(para="ambas", ref="Decreto 1/2000"):
    return {"para": para, "tipo": "norma", "referencia": ref, "publicado": date(2000, 1, 1)}


def conf(*extremos, nivel="alta"):
    return {e: nivel for e in extremos}


def base():
    """Un registro mínimo válido: dos gobiernos (uno con dos mandatos), un ministro, un plan, dos regímenes, dos etapas y
    un episodio con dos fases."""
    periodos = [
        {"id": "p.gobierno.uno", "tipo": "gobierno", "nombre": "Gobierno uno", "nombre_corto": "Uno",
         "desde": date(1966, 6, 29), "hasta": date(1983, 12, 10), "caracter": "de_facto", "fuentes": [norma()],
         "confianza": conf("desde", "hasta")},
        {"id": "p.gobierno.dos", "tipo": "gobierno", "nombre": "Gobierno dos", "nombre_corto": "Dos",
         "desde": date(1983, 12, 10), "hasta": None, "caracter": "constitucional", "fuentes": [norma("desde")],
         "confianza": conf("desde", nivel="media"),
         "mandatos": [
             {"id": "p.gobierno.dos-1983", "nombre": "Dos (1983–1989)", "nombre_corto": "Dos I",
              "desde": date(1983, 12, 10), "hasta": date(1989, 7, 8), "fuentes": [norma()], "confianza": conf("desde", "hasta")},
             {"id": "p.gobierno.dos-1989", "nombre": "Dos (1989–)", "nombre_corto": "Dos II",
              "desde": date(1989, 7, 8), "hasta": None, "fuentes": [norma("desde")], "confianza": conf("desde")},
         ]},
        {"id": "p.ministro.a", "tipo": "ministro", "nombre": "Ministra A", "nombre_corto": "A", "cargo": "Ministra de Economía",
         "desde": date(1983, 12, 10), "hasta": None, "fuentes": [norma("desde")], "confianza": conf("desde")},
        {"id": "p.plan.austral", "tipo": "plan", "nombre": "Plan Austral", "nombre_corto": "Austral",
         "desde": date(1985, 6, 14), "hasta": date(1988, 8, 3), "confianza": conf("desde", "hasta"),
         "fuentes": [norma("desde", "Decreto 1096/1985"),
                     {"para": "hasta", "tipo": "convencional", "nota": "Lo reemplaza el Plan Primavera."}]},
        {"id": "p.regimen.fijo", "tipo": "regimen_cambiario", "nombre": "Fijo", "nombre_corto": "Fijo",
         "desde": date(1970, 1, 1), "hasta": date(1991, 4, 1), "fuentes": [norma()], "confianza": conf("desde", "hasta")},
        {"id": "p.regimen.convertibilidad", "tipo": "regimen_cambiario", "nombre": "Convertibilidad", "nombre_corto": "Convertib.",
         "desde": date(1991, 4, 1), "hasta": None, "confianza": conf("desde", nivel="baja"),
         "fuentes": [{"para": "desde", "tipo": "secundaria", "referencia": "Autor (2000), Obra", "pagina": "12"}]},
        {"id": "p.catedra.herencia", "tipo": "catedra", "nombre": "Herencia", "nombre_corto": "Herencia", "orden": 1,
         "desde": date(1976, 3, 24), "hasta": {"igual_a": "p.gobierno.dos.desde"}, "confianza": conf("desde"),
         "fuentes": [norma("desde", "Acta del 24/3/1976")], "referencia_curso": "Cronograma 2026, clase 2"},
        {"id": "p.catedra.democracia", "tipo": "catedra", "nombre": "Democracia", "nombre_corto": "Democracia", "orden": 2,
         "desde": {"igual_a": "p.gobierno.dos.desde"}, "hasta": None},
        {"id": "p.episodio.hiper", "tipo": "episodio", "nombre": "Hiperinflación", "nombre_corto": "Hiper",
         "desde": date(1989, 2, 6), "hasta": date(1990, 4, 1), "confianza": conf("desde", "hasta", nivel="media"),
         "fuentes": [{"para": "desde", "tipo": "secundaria", "referencia": "Autor (1989)", "pagina": "1"},
                     {"para": "hasta", "tipo": "convencional", "nota": "Último mes por encima del 50 %."}],
         "fases": [
             {"id": "p.episodio.hiper-1", "nombre": "Primer brote", "nombre_corto": "Brote 1", "descripcion": "Con tregua.",
              "desde": date(1989, 2, 6), "hasta": date(1989, 12, 12), "fuentes": [norma()], "confianza": conf("desde", "hasta")},
             {"id": "p.episodio.hiper-2", "nombre": "Segundo brote", "nombre_corto": "Brote 2",
              "desde": date(1989, 12, 12), "hasta": date(1990, 4, 1), "fuentes": [norma()], "confianza": conf("desde", "hasta")},
         ]},
        {"id": "p.episodio.crisis", "tipo": "episodio", "nombre": "Crisis superpuesta", "nombre_corto": "Crisis",
         "desde": date(1989, 6, 1), "hasta": date(1991, 1, 1), "confianza": conf("desde", "hasta"), "fuentes": [norma()]},
    ]
    eventos = [
        {"id": "e.1991-03-27.convertibilidad", "fecha": date(1991, 3, 27), "vigencia": date(1991, 4, 1),
         "nombre": "Sanción de la Ley de Convertibilidad", "nombre_corto": "Convertibilidad", "categoria": "cambiario",
         "descripcion": "Ley 23.928.", "fuentes": [{"tipo": "norma", "referencia": "Ley 23.928"}]},
    ]
    return periodos, eventos


def errores(periodos, eventos):
    return val.validar(periodos, eventos, HOY)


def test_el_registro_base_es_valido():
    assert errores(*base()) == []


def cambio(f):
    p, e = base()
    f(p, e)
    return errores(p, e)


@pytest.mark.parametrize("modificar, esperado", [
    (lambda p, e: p.append(copy.deepcopy(p[0])), "id repetido"),
    (lambda p, e: p[0].update(id="p.gobierno.Uno"), "el id tiene que tener la forma"),
    (lambda p, e: p[0].update(id="p.ministro.uno"), "p.gobierno.<slug>"),
    (lambda p, e: p[0].update(desde="1966-06-29"), "`desde` tiene que ser una fecha"),
    (lambda p, e: p[3].update(hasta=date(1985, 6, 14)), "tiene que ser anterior a `hasta`"),
    (lambda p, e: p[3].update(hasta=date(2027, 1, 1)), "posterior a hoy"),
    (lambda p, e: p[0].update(fuentes=[]), "falta la fuente"),
    (lambda p, e: p[0].update(fuentes=[norma("desde")]), "falta la fuente de «hasta»"),
    (lambda p, e: p[5]["fuentes"][0].pop("pagina"), "lleva la página"),
    (lambda p, e: p[3]["fuentes"][1].pop("nota"), "lleva la nota"),
    (lambda p, e: p[0]["fuentes"][0].update(tipo="wikipedia"), "tipo 'wikipedia'"),
    (lambda p, e: p[0].update(color="rojo"), "campos desconocidos: color"),
    (lambda p, e: p[0].update(caracter="militar"), "`caracter` tiene que ser"),
    (lambda p, e: p[2].pop("cargo"), "falta `cargo`"),
    (lambda p, e: p[4].update(hasta=date(1991, 5, 1)), "se superponen"),
    (lambda p, e: p[4].update(hasta=None), "solo el último período"),
    (lambda p, e: p[0].update(desde=date(1970, 2, 1)), "empieza después del 1970-01-01"),
    (lambda p, e: p[0].update(hasta=date(1983, 12, 1)), "hay un hueco"),
    (lambda p, e: p[1].update(hasta=date(2000, 1, 1)) or p[1]["mandatos"][1].update(hasta=date(2000, 1, 1)) or p[1]["fuentes"].append(norma("hasta")),
     "tiene que quedar abierto"),
    (lambda p, e: p[1]["mandatos"][1].update(desde=date(1989, 7, 9)), "contiguos"),
    (lambda p, e: p[1]["mandatos"].pop(), "dos o más"),
    (lambda p, e: p[6].update(hasta={"igual_a": "p.gobierno.tres.desde"}), "que no existe"),
    (lambda p, e: p[7].update(desde={"igual_a": "p.catedra.herencia.hasta"}), "no tiene fecha propia"),
    (lambda p, e: p[7].update(orden=3), "`orden` tiene que ir de 1 a 2"),
    (lambda p, e: p[6].update(hasta=date(1983, 12, 1), fuentes=[norma()]), "termina el 1983-12-01"),
    (lambda p, e: p[3].update(orden=1), "solo de las etapas"),
    (lambda p, e: p[0].pop("confianza"), "falta `confianza`"),
    (lambda p, e: p[0]["confianza"].update(hasta="dudosa"), "la confianza de «hasta»"),
    (lambda p, e: p[2]["confianza"].update(hasta="alta"), "`confianza` de hasta sobra"),
    (lambda p, e: p[7].update(confianza=conf("desde")), "`confianza` de desde sobra"),
    (lambda p, e: p[1]["mandatos"][0].pop("confianza"), "p.gobierno.dos-1983: falta `confianza`"),
    (lambda p, e: p[8]["fases"].pop(), "`fases` va solo cuando hay dos o más"),
    (lambda p, e: p[8]["fases"][1].update(desde=date(1989, 12, 13)), "las fases tienen que ser contiguas"),
    (lambda p, e: p[8]["fases"][1].update(hasta=date(1990, 3, 1)), "la última fase tiene que terminar con el episodio"),
    (lambda p, e: p[8]["fases"][0].update(id="p.gobierno.hiper-1"), "p.episodio.<slug>"),
    (lambda p, e: p[3].update(fases=p[8]["fases"]), "`fases` es solo de los episodios"),
    (lambda p, e: e[0].update(id="e.1991-04-01.convertibilidad"), "con la fecha del evento"),
    (lambda p, e: e[0].update(categoria="politico"), "`categoria`"),
    (lambda p, e: e[0].update(vigencia=date(1991, 3, 1)), "`vigencia`"),
    (lambda p, e: e[0].update(fuentes=[]), "falta la fuente"),
    (lambda p, e: e[0].update(nombre_corto="Un rótulo demasiado largo para el gráfico"), "más de 24"),
])
def test_cada_regla_detecta_su_error(modificar, esperado):
    encontrados = cambio(modificar)
    assert any(esperado in x for x in encontrados), encontrados


def test_resolver_toma_fecha_y_fuente_del_extremo_citado():
    p, _ = base()
    resueltos = {x["id"]: x for x in val.resolver(p)}
    herencia = resueltos["p.catedra.herencia"]
    assert herencia["hasta"] == date(1983, 12, 10)
    assert any(f["para"] == "hasta" and f["referencia"] == "Decreto 1/2000" for f in herencia["fuentes"])
    assert resueltos["p.catedra.democracia"]["desde"] == date(1983, 12, 10)


def test_vigentes_usa_intervalos_semiabiertos():
    p = val.resolver(base()[0])
    gobiernos = [x["id"] for x in val.vigentes(p, date(1983, 12, 10)) if x["tipo"] == "gobierno"]
    assert gobiernos == ["p.gobierno.dos"]
    assert [x["id"] for x in val.vigentes(p, date(1983, 12, 9)) if x["tipo"] == "gobierno"] == ["p.gobierno.uno"]


def test_export_cumple_el_contrato_y_oculta_la_referencia_al_curso():
    p, e = base()
    doc_p = exp.documento_periodos(val.resolver(p), "2026-11-11T00:00:00Z")
    doc_e = exp.documento_eventos(e, "2026-11-11T00:00:00Z")
    jsonschema.validate(doc_p, json.loads((CONTRATO / "periodos-1.1.schema.json").read_text(encoding="utf-8")))
    jsonschema.validate(doc_e, json.loads((CONTRATO / "eventos-1.0.schema.json").read_text(encoding="utf-8")))
    texto = json.dumps(doc_p, ensure_ascii=False)
    assert "Cronograma" not in texto and "cátedra" not in texto
    assert {t["id"]: t["nombre"] for t in doc_p["tipos"]}["catedra"] == "Etapas de la política económica (curso)"
    plan = next(x for x in doc_p["periodos"] if x["id"] == "p.plan.austral")
    assert plan["cortes"] == {"desde": "hecho", "hasta": "convencional"}
    # Con una fuente que respalda la fecha además de la nota del corte, el fin sigue siendo convencional.
    p[3]["fuentes"].append({"para": "hasta", "tipo": "norma", "referencia": "Inicio del Plan Primavera"})
    plan = next(x for x in exp.documento_periodos(val.resolver(p), "v")["periodos"] if x["id"] == "p.plan.austral")
    assert plan["cortes"]["hasta"] == "convencional"
    assert next(x for x in doc_p["periodos"] if x["id"] == "p.gobierno.dos")["hasta"] is None
    # Confianza por extremo; las etapas la heredan del extremo que citan.
    por_id = {x["id"]: x for x in doc_p["periodos"]}
    assert por_id["p.regimen.convertibilidad"]["confianza"] == {"desde": "baja"}
    assert por_id["p.catedra.herencia"]["confianza"] == {"desde": "alta", "hasta": "media"}
    assert por_id["p.catedra.democracia"]["confianza"] == {"desde": "media"}
    hiper = por_id["p.episodio.hiper"]
    assert [f["id"] for f in hiper["fases"]] == ["p.episodio.hiper-1", "p.episodio.hiper-2"]
    assert hiper["fases"][0]["descripcion"] == "Con tregua." and hiper["cortes"]["hasta"] == "convencional"
    assert {t["id"]: t["cantidad"] for t in doc_p["tipos"]}["episodio"] == 2


def test_un_export_1_0_sigue_cumpliendo_su_contrato():
    """El contrato 1.0 sigue publicado: un documento sin episodios ni confianza lo cumple."""
    p, _ = base()
    doc = exp.documento_periodos(val.resolver([x for x in p if x["tipo"] != "episodio"]), "v")
    doc["esquema"] = "periodos-1.0"
    doc["tipos"] = [t for t in doc["tipos"] if t["id"] != "episodio"]
    for x in doc["periodos"]:
        x.pop("confianza", None)
        for m in x.get("mandatos", []):
            m.pop("confianza", None)
    jsonschema.validate(doc, json.loads((CONTRATO / "periodos-1.0.schema.json").read_text(encoding="utf-8")))


def test_csv_de_periodos_con_mandatos_y_de_eventos():
    p, e = base()
    filas = list(csv.DictReader(io.StringIO(exp.csv_periodos(exp.documento_periodos(val.resolver(p), "v")))))
    mandatos = [f for f in filas if f["padre"] == "p.gobierno.dos"]
    assert [f["id"] for f in mandatos] == ["p.gobierno.dos-1983", "p.gobierno.dos-1989"]
    assert next(f for f in filas if f["id"] == "p.plan.austral")["corte_hasta"] == "convencional"
    fases = [f for f in filas if f["padre"] == "p.episodio.hiper"]
    assert [(f["tipo"], f["confianza_desde"]) for f in fases] == [("episodio", "alta"), ("episodio", "alta")]
    assert next(f for f in filas if f["id"] == "p.regimen.convertibilidad")["confianza_desde"] == "baja"
    ev = list(csv.DictReader(io.StringIO(exp.csv_eventos(exp.documento_eventos(e, "v")))))
    assert ev[0]["fecha"] == "1991-03-27" and ev[0]["vigencia"] == "1991-04-01" and "Ley 23.928" in ev[0]["fuentes"]


def test_cargar_frena_con_errores(tmp_path):
    p, e = base()
    p[0]["fuentes"] = []
    (tmp_path / "periodos.yaml").write_text(yaml.safe_dump(p, allow_unicode=True), encoding="utf-8")
    (tmp_path / "eventos.yaml").write_text(yaml.safe_dump(e, allow_unicode=True), encoding="utf-8")
    with pytest.raises(ErrorPipeline, match="p.gobierno.uno: falta la fuente"):
        val.cargar(tmp_path, HOY)


def test_sin_archivos_no_hay_periodos(tmp_path):
    assert val.cargar(tmp_path, HOY) == ([], [])


@pytest.mark.skipif(not (RAIZ / "metadatos" / "periodos.yaml").exists(), reason="todavía no se cargaron los períodos")
def test_los_periodos_publicados_son_validos():
    periodos, eventos = val.cargar(RAIZ / "metadatos", date.today())
    tipos = {p["tipo"] for p in periodos}
    assert tipos == set(val.TIPOS)
    assert eventos


@pytest.mark.skipif(not (RAIZ / "export" / "periodos.json").exists(), reason="todavía no se exportaron los períodos")
@pytest.mark.parametrize("nombre", ["periodos", "eventos"])
def test_export_publicado_cumple_el_contrato(nombre):
    doc = json.loads((RAIZ / "export" / f"{nombre}.json").read_text(encoding="utf-8"))
    version = {"periodos": "1.1", "eventos": "1.0"}[nombre]
    jsonschema.validate(doc, json.loads((CONTRATO / f"{nombre}-{version}.schema.json").read_text(encoding="utf-8")))
