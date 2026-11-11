"""Corrida de punta a punta sin red, con metadatos y snapshots sintéticos en un directorio temporal."""

import json
import shutil

import pytest
import yaml

from pipeline.actualizar import ejecutar
from pipeline.comun import RAIZ, ErrorPipeline, Rutas, escribir_json


def _snapshot_datos_gob_ar(rutas, fid, filas):
    contenido = json.dumps({"data": filas, "count": len(filas)}).encode()
    d = rutas.snapshots / fid / "2026-01-01"
    d.mkdir(parents=True)
    (d / "pagina-001.json").write_bytes(contenido)
    import hashlib
    escribir_json(d / "meta.json", {"fuente": fid, "descargado": "2026-01-01T00:00:00Z", "sha256": "x", "licencia": "CC-BY-4.0",
                                    "redistribuible": True, "archivos": [{"nombre": "pagina-001.json", "url": "u", "bytes": 1,
                                                                         "sha256": hashlib.sha256(contenido).hexdigest()}]})


@pytest.fixture
def repo(tmp_path):
    rutas = Rutas(tmp_path)
    (rutas.metadatos / "series").mkdir(parents=True)
    shutil.copy(RAIZ / "metadatos" / "signos_monetarios.yaml", rutas.metadatos)
    fuentes = [
        {"id": "f.prueba.vieja", "organismo": "Prueba", "nombre": "Vieja", "api": "datos.gob.ar", "id_api": "1",
         "url": "https://ejemplo", "licencia": "CC-BY-4.0", "frecuencia": "mensual", "unidad": "índice"},
        {"id": "f.prueba.nueva", "organismo": "Prueba", "nombre": "Nueva", "api": "datos.gob.ar", "id_api": "2",
         "url": "https://ejemplo", "licencia": "CC-BY-4.0", "frecuencia": "mensual", "unidad": "índice"},
        {"id": "f.prueba.cerrada", "organismo": "Prueba", "nombre": "Cerrada", "api": "ninguna", "id_api": None,
         "url": "https://ejemplo", "licencia": "sin confirmar", "redistribuible": False, "frecuencia": "mensual", "unidad": "índice"},
    ]
    (rutas.metadatos / "fuentes.yaml").write_text(yaml.safe_dump(fuentes, allow_unicode=True), encoding="utf-8")
    quiebres = [{"id": "q.prueba.cambio", "desde": "2000-04", "tipo": "cambio_de_base", "descripcion": "Cambio de base."}]
    (rutas.metadatos / "quiebres.yaml").write_text(yaml.safe_dump(quiebres, allow_unicode=True), encoding="utf-8")
    serie = {
        "id": "prueba", "codigo": "PRE-99", "nombre": "Serie de prueba", "bloque": "Precios", "prioridad": "A",
        "definicion": "Prueba.", "unidad": "índice", "tipo": "precio", "agregacion": "promedio", "frecuencia": "mensual",
        "variante_por_defecto": "oficial",
        "variantes": [
            {"id": "oficial", "nombre": "Oficial", "estado": "publicada", "empalme": "encadenar_tasas", "metodo": "Tasas.",
             "tramos": [{"fuente": "f.prueba.vieja", "desde": "2000-01", "hasta": "2000-03"},
                        {"fuente": "f.prueba.nueva", "desde": "2000-04"}],
             "advertencias": ["q.prueba.cambio"]},
            {"id": "cerrada", "nombre": "Cerrada", "estado": "pendiente_licencia", "empalme": "encadenar_tasas", "metodo": "x",
             "tramos": [{"fuente": "f.prueba.cerrada", "desde": "2000-01"}]},
        ],
        "validacion": {"min": 0, "var_min": -5, "var_max": 50},
    }
    (rutas.metadatos / "series" / "prueba.yaml").write_text(yaml.safe_dump(serie, allow_unicode=True), encoding="utf-8")
    _snapshot_datos_gob_ar(rutas, "f.prueba.vieja", [["2000-01-01", 100], ["2000-02-01", 110], ["2000-03-01", 121]])
    _snapshot_datos_gob_ar(rutas, "f.prueba.nueva", [["2000-03-01", 50], ["2000-04-01", 50.5], ["2000-05-01", 51.005]])
    return rutas


def test_corrida_completa_y_segunda_corrida_sin_cambios(repo):
    res = ejecutar(repo, con_red=False)
    assert res.publicado and not res.errores, res.informe()
    doc = json.loads((repo.export / "series" / "prueba" / "oficial.json").read_text(encoding="utf-8"))
    assert doc["datos"][-1] == ["2000-05", 51.005]
    assert doc["datos"][0][1] == pytest.approx(50 / 1.21)
    assert [a["id"] for a in doc["advertencias"]] == ["q.prueba.cambio"]
    assert not (repo.export / "series" / "prueba" / "cerrada.json").exists()
    catalogo = json.loads((repo.export / "catalogo.json").read_text(encoding="utf-8"))
    estados = {v["id"]: v["estado"] for v in catalogo["series"][0]["variantes"]}
    assert estados == {"oficial": "publicada", "cerrada": "pendiente_licencia"}

    antes = (repo.export / "series" / "prueba" / "oficial.json").read_text(encoding="utf-8")
    res2 = ejecutar(repo, con_red=False)
    assert res2.publicado and res2.cambios == []
    assert (repo.export / "series" / "prueba" / "oficial.json").read_text(encoding="utf-8") == antes


def test_corrida_parcial_mantiene_el_catalogo_completo(repo):
    otra = yaml.safe_load((repo.metadatos / "series" / "prueba.yaml").read_text(encoding="utf-8"))
    otra.update({"id": "otra", "codigo": "PRE-98", "nombre": "Otra serie"})
    (repo.metadatos / "series" / "otra.yaml").write_text(yaml.safe_dump(otra, allow_unicode=True), encoding="utf-8")
    assert ejecutar(repo, con_red=False).publicado
    res = ejecutar(repo, solo=["prueba"], con_red=False)
    assert res.publicado and not res.errores, res.informe()
    catalogo = json.loads((repo.export / "catalogo.json").read_text(encoding="utf-8"))
    assert [s["id"] for s in catalogo["series"]] == ["otra", "prueba"]
    paquete = json.loads((repo.export / "datapackage.json").read_text(encoding="utf-8"))
    assert {r["name"] for r in paquete["resources"]} == {"otra.oficial", "prueba.oficial"}


def test_tramo_agregado_a_anual_solo_toma_los_anios_completos():
    import pandas as pd
    from pipeline.capa2.empalmes import agregar_anual
    fechas = pd.date_range("2006-01-01", "2008-04-01", freq="QS")   # 2008 tiene dos trimestres
    s = pd.Series(range(1, len(fechas) + 1), index=fechas, dtype=float)
    r = agregar_anual(s, "trimestral", "suma")
    assert list(r.index.year) == [2006, 2007]
    assert list(r) == [1 + 2 + 3 + 4, 5 + 6 + 7 + 8]


def test_valor_fuera_de_rango_retiene_la_variante(repo):
    shutil.rmtree(repo.snapshots / "f.prueba.nueva")
    _snapshot_datos_gob_ar(repo, "f.prueba.nueva", [["2000-03-01", 50], ["2000-04-01", 50.5], ["2000-05-01", 505.0]])
    res = ejecutar(repo, con_red=False)
    # La variante queda retenida; como no tenía versión anterior, no se publica y el catálogo la muestra sin datos.
    assert res.publicado and list(res.retenidas) == ["prueba.oficial"]
    assert any(p.regla == "rango" for p in res.errores)
    assert "## Variantes retenidas" in res.informe() and "2000-05-01" in res.informe()
    assert not (repo.export / "series" / "prueba" / "oficial.json").exists()
    catalogo = json.loads((repo.export / "catalogo.json").read_text(encoding="utf-8"))
    v = {x["id"]: x for x in catalogo["series"][0]["variantes"]}["oficial"]
    assert v["estado"] == "pendiente" and v["archivo"] is None and "validación" in v["nota"]


def test_una_variante_retenida_conserva_lo_publicado_y_las_demas_se_publican(repo):
    otra = yaml.safe_load((repo.metadatos / "series" / "prueba.yaml").read_text(encoding="utf-8"))
    otra.update({"id": "otra", "codigo": "PRE-98", "nombre": "Otra serie"})
    otra["variantes"][0]["tramos"] = [{"fuente": "f.prueba.vieja", "desde": "2000-01"}]
    otra["variantes"][0]["empalme"] = "yuxtaponer"
    (repo.metadatos / "series" / "otra.yaml").write_text(yaml.safe_dump(otra, allow_unicode=True), encoding="utf-8")
    assert ejecutar(repo, con_red=False).publicado
    ruta = repo.export / "series" / "prueba" / "oficial.json"
    antes = json.loads(ruta.read_text(encoding="utf-8"))
    # La fuente nueva trae un salto fuera de rango: «prueba» queda retenida y «otra» (que no la usa) se publica.
    shutil.rmtree(repo.snapshots / "f.prueba.nueva")
    _snapshot_datos_gob_ar(repo, "f.prueba.nueva", [["2000-03-01", 50], ["2000-04-01", 50.5], ["2000-05-01", 505.0]])
    res = ejecutar(repo, con_red=False)
    assert res.publicado and list(res.retenidas) == ["prueba.oficial"]
    despues = json.loads(ruta.read_text(encoding="utf-8"))
    assert despues["datos"] == antes["datos"]
    assert despues["desactualizada_desde"] == antes["version_datos"][:10]
    assert (repo.export / "series" / "otra" / "oficial.json").exists()
    assert "prueba.oficial: retenida; se conserva la versión del" in res.informe()


def test_una_fuente_que_pierde_su_historia_retiene_sus_variantes(repo):
    assert ejecutar(repo, con_red=False).publicado
    # La fuente vieja «pierde» 13 fechas que ya tenía en capa 1 (se simula agrandando la capa 1 previa).
    import pandas as pd
    from pipeline.comun import escribir_csv_serie
    larga = pd.Series(range(16), index=pd.date_range("1999-01-01", periods=16, freq="MS"), dtype=float)
    escribir_csv_serie(repo.capa1 / "f.prueba.vieja.csv", larga)
    res = ejecutar(repo, con_red=False)
    assert any(p.regla == "historia" and p.serie == "f.prueba.vieja" for p in res.errores)
    assert list(res.retenidas) == ["prueba.oficial"]


def test_publicar_una_fuente_no_redistribuible_es_un_error(repo):
    ruta = repo.metadatos / "series" / "prueba.yaml"
    serie = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    serie["variantes"][1]["estado"] = "publicada"
    ruta.write_text(yaml.safe_dump(serie, allow_unicode=True), encoding="utf-8")
    with pytest.raises(ErrorPipeline, match="no es redistribuible"):
        ejecutar(repo, con_red=False)


def test_revision_de_un_valor_publicado_queda_registrada(repo):
    ejecutar(repo, con_red=False)
    shutil.rmtree(repo.snapshots / "f.prueba.nueva")
    _snapshot_datos_gob_ar(repo, "f.prueba.nueva", [["2000-03-01", 50], ["2000-04-01", 50.5], ["2000-05-01", 52.0]])
    res = ejecutar(repo, con_red=False)
    assert res.publicado
    revisiones = json.loads((repo.export / "revisiones.json").read_text(encoding="utf-8"))
    assert revisiones[0]["variante"] == "prueba.oficial"
    assert revisiones[0]["cambios"][0]["fecha"] == "2000-05"


def test_catalogo_sin_bibliografia_hasta_que_responda_la_catedra(repo):
    ruta = repo.inventario
    ruta.parent.mkdir(parents=True)
    ruta.write_text("id,texto,pagina,tipo,titulo_original,periodo_cubierto\nAB2000-G1,Obra,12,cuadro,T,1990\n", encoding="utf-8")
    meta = repo.metadatos / "series" / "prueba.yaml"
    serie = yaml.safe_load(meta.read_text(encoding="utf-8"))
    serie["bibliografia"] = ["AB2000-G1"]
    meta.write_text(yaml.safe_dump(serie, allow_unicode=True), encoding="utf-8")
    assert ejecutar(repo, con_red=False).publicado
    catalogo = json.loads((repo.export / "catalogo.json").read_text(encoding="utf-8"))
    assert "bibliografia" not in catalogo["series"][0]


def test_catalogo_con_bibliografia_del_inventario(repo, monkeypatch):
    from pipeline.export import catalogo as export_catalogo
    monkeypatch.setattr(export_catalogo, "PUBLICAR_BIBLIOGRAFIA", True)
    ruta = repo.inventario
    ruta.parent.mkdir(parents=True)
    ruta.write_text("﻿id,texto,pagina,tipo,titulo_original,periodo_cubierto,otra\n"
                    "AB2000-G1,\"Autor (2000), Obra\",12,gráfico de líneas,Precios 1990-1999,1990 – 1999,x\n", encoding="utf-8")
    meta = repo.metadatos / "series" / "prueba.yaml"
    serie = yaml.safe_load(meta.read_text(encoding="utf-8"))
    serie["bibliografia"] = ["AB2000-G1"]
    meta.write_text(yaml.safe_dump(serie, allow_unicode=True), encoding="utf-8")
    res = ejecutar(repo, con_red=False)
    assert res.publicado and not res.errores, res.informe()
    catalogo = json.loads((repo.export / "catalogo.json").read_text(encoding="utf-8"))
    assert catalogo["series"][0]["bibliografia"] == [{
        "id": "AB2000-G1", "referencia": "Autor (2000), Obra", "pagina": "12", "tipo": "gráfico de líneas",
        "titulo_original": "Precios 1990-1999", "periodo_cubierto": "1990 – 1999",
    }]


def test_ficha_de_bibliografia_inexistente_frena_el_export(repo):
    ruta = repo.inventario
    ruta.parent.mkdir(parents=True)
    ruta.write_text("id,texto,pagina,tipo,titulo_original,periodo_cubierto\n", encoding="utf-8")
    meta = repo.metadatos / "series" / "prueba.yaml"
    serie = yaml.safe_load(meta.read_text(encoding="utf-8"))
    serie["bibliografia"] = ["NO-EXISTE"]
    meta.write_text(yaml.safe_dump(serie, allow_unicode=True), encoding="utf-8")
    with pytest.raises(ErrorPipeline, match="NO-EXISTE"):
        ejecutar(repo, con_red=False)


def test_insumos_encuentran_las_auxiliares_fuera_de_la_corrida(tmp_path):
    # En una corrida parcial, el PIB auxiliar no está entre los documentos armados: se busca en export/auxiliares/.
    from pipeline.export.insumos import Publicadas
    (tmp_path / "metadatos" / "auxiliares").mkdir(parents=True)
    aux = {"id": "pib-dolares", "frecuencia": "anual", "variantes": [{"id": "anual", "nombre": "Anual"}]}
    (tmp_path / "metadatos" / "auxiliares" / "pib-dolares.yaml").write_text(yaml.safe_dump(aux), encoding="utf-8")
    (tmp_path / "export" / "auxiliares" / "pib-dolares").mkdir(parents=True)
    (tmp_path / "export" / "auxiliares" / "pib-dolares" / "anual.json").write_text("{}", encoding="utf-8")
    p = Publicadas({}, tmp_path / "export", tmp_path / "metadatos")
    assert p.opcion("pib-dolares.anual") == {"id": "pib-dolares.anual", "archivo": "auxiliares/pib-dolares/anual.json",
                                             "nombre": "Anual", "frecuencia": "anual"}


def test_una_variante_que_pasa_a_pendiente_se_quita_del_export(repo):
    assert ejecutar(repo, con_red=False).publicado
    json_ = repo.export / "series" / "prueba" / "oficial.json"
    csv = repo.export / "descargas" / "csv" / "prueba" / "oficial.csv"
    assert json_.exists() and csv.exists()
    # Una segunda variante publicada, para que la serie siga en el catálogo, y la original pasa a pendiente.
    meta = yaml.safe_load((repo.metadatos / "series" / "prueba.yaml").read_text(encoding="utf-8"))
    meta["variantes"].append({**meta["variantes"][0], "id": "copia", "nombre": "Copia"})
    meta["variantes"][0].update({"estado": "pendiente", "nota": "Pendiente: prueba."})
    meta["variante_por_defecto"] = "copia"
    (repo.metadatos / "series" / "prueba.yaml").write_text(yaml.safe_dump(meta, allow_unicode=True), encoding="utf-8")
    res = ejecutar(repo, con_red=False)
    assert res.publicado and not res.errores, res.informe()
    assert not json_.exists() and not csv.exists() and not (repo.capa2 / "prueba" / "oficial.csv").exists()
    assert "prueba.oficial: despublicada (se quitaron su JSON y sus CSV)" in res.cambios
    catalogo = json.loads((repo.export / "catalogo.json").read_text(encoding="utf-8"))
    assert {v["id"]: v["archivo"] for v in catalogo["series"][0]["variantes"]}["oficial"] is None


# --- Fuentes que no responden y fuentes de descarga manual (SPEC 5.2; revisión del 07/11/2026, punto 2.3) ---
# Se corre el pipeline «con red» con la descarga reemplazada por una que devuelve lo del snapshot o falla a pedido.
from datetime import date  # noqa: E402

from pipeline import __main__ as cli  # noqa: E402
from pipeline.fuentes import base, bruegel, datos_gob_ar  # noqa: E402
from pipeline.fuentes.estado import ARCHIVO  # noqa: E402

CAIDAS: set[str] = set()


def _bajar_simulado(fuente):
    if fuente["id"] in CAIDAS:
        raise ErrorPipeline(f"No se pudo descargar https://ejemplo: HTTP 403: {base.resumen_respuesta('<!DOCTYPE html><title>Just a moment...</title>')}")
    raise AssertionError("solo se simulan fuentes caídas")


def _correr(repo, hoy, caidas=(), con_red=True):
    CAIDAS.clear()
    CAIDAS.update(caidas)
    return ejecutar(repo, con_red=con_red, hoy=date.fromisoformat(hoy))


def _doc(repo):
    return json.loads((repo.export / "series" / "prueba" / "oficial.json").read_text(encoding="utf-8"))


def _estado(repo):
    ruta = repo.snapshots / ARCHIVO
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}


def test_fuente_que_no_responde_marca_desde_cuando_y_avisa_a_la_semana(repo, monkeypatch):
    # La fuente vieja «responde» devolviendo lo mismo que su snapshot; la nueva falla.
    contenido = (repo.snapshots / "f.prueba.vieja" / "2026-01-01" / "pagina-001.json").read_bytes()
    monkeypatch.setattr(datos_gob_ar, "bajar", lambda f: _bajar_simulado(f) if f["id"] in CAIDAS
                        else [base.Archivo("pagina-001.json", "u", contenido if f["id"] == "f.prueba.vieja" else
                                           (repo.snapshots / f["id"] / "2026-01-01" / "pagina-001.json").read_bytes())])
    assert _correr(repo, "2026-01-05").publicado
    assert _doc(repo)["desactualizada_desde"] is None and _estado(repo) == {}

    # Día 1 de la caída: aviso sin HTML, marca en el estado y en la variante; todavía no pide atención.
    res = _correr(repo, "2026-01-10", caidas={"f.prueba.nueva"})
    assert res.publicado
    aviso = next(a for a in res.avisos if a.startswith("f.prueba.nueva"))
    assert "no respondió (desde el 2026-01-10)" in aviso and "Just a moment..." in aviso and "<title>" not in aviso
    assert _estado(repo) == {"f.prueba.nueva": {"fallando_desde": "2026-01-10"}}
    assert _doc(repo)["desactualizada_desde"] == "2026-01-10"
    assert res.atencion == [] and "f.prueba.nueva" in res.consultadas

    # Ocho días después sigue caída: la fecha no se mueve y pide atención (el workflow abre un issue).
    res = _correr(repo, "2026-01-18", caidas={"f.prueba.nueva"})
    assert _estado(repo)["f.prueba.nueva"]["fallando_desde"] == "2026-01-10"
    assert [a["fuente"] for a in res.atencion] == ["f.prueba.nueva"]
    assert "## Fuentes que necesitan atención" in res.informe()
    # El informe entero va al mensaje del commit: el aviso tiene que estar.
    assert "## Avisos" in res.informe() and "f.prueba.nueva: la fuente no respondió" in res.informe()

    # Una corrida sin red no «arregla» la fuente: conserva la marca y no toca el estado.
    res = _correr(repo, "2026-01-19", con_red=False)
    assert _doc(repo)["desactualizada_desde"] == "2026-01-10" and res.consultadas == []
    assert _estado(repo) == {"f.prueba.nueva": {"fallando_desde": "2026-01-10"}}

    # Vuelve a responder: se borra la marca.
    res = _correr(repo, "2026-01-20")
    assert _estado(repo) == {} and not (repo.snapshots / ARCHIVO).exists()
    assert _doc(repo)["desactualizada_desde"] is None and res.atencion == []


def _hacer_manual(repo, version):
    ruta = repo.metadatos / "fuentes.yaml"
    fuentes = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    for f in fuentes:
        if f["id"] == "f.prueba.nueva":
            f["descarga"] = "manual"
    ruta.write_text(yaml.safe_dump(fuentes, allow_unicode=True), encoding="utf-8")
    meta = repo.snapshots / "f.prueba.nueva" / "2026-01-01" / "meta.json"
    datos = json.loads(meta.read_text(encoding="utf-8"))
    datos["version"] = version
    meta.write_text(json.dumps(datos), encoding="utf-8")


def test_fuente_manual_no_se_descarga_y_avisa_a_los_tres_meses(repo, monkeypatch):
    _hacer_manual(repo, "2026-01-01")
    contenido = (repo.snapshots / "f.prueba.vieja" / "2026-01-01" / "pagina-001.json").read_bytes()

    def bajar(f):
        assert f["id"] != "f.prueba.nueva", "una fuente manual no se descarga en la corrida automática"
        return [base.Archivo("pagina-001.json", "u", contenido)]
    monkeypatch.setattr(datos_gob_ar, "bajar", bajar)

    res = _correr(repo, "2026-03-01")
    assert res.publicado and res.atencion == [] and "f.prueba.nueva" not in res.consultadas
    fuente = next(f for f in _doc(repo)["fuentes"] if f["id"] == "f.prueba.nueva")
    assert fuente["descarga"] == "manual" and fuente["version"] == "2026-01-01"
    assert _doc(repo)["desactualizada_desde"] is None

    # Más de 92 días sin versión nueva: la variante queda desactualizada y pide atención (también sin red).
    for con_red in (True, False):
        res = _correr(repo, "2026-04-10", con_red=con_red)
        assert _doc(repo)["desactualizada_desde"] == "2026-04-03"
        assert [a["fuente"] for a in res.atencion] == ["f.prueba.nueva"]
        assert "bajar-manual f.prueba.nueva" in res.atencion[0]["motivo"]


def test_salida_para_el_workflow(repo, monkeypatch, tmp_path):
    _hacer_manual(repo, "2025-01-01")
    salida = tmp_path / "atencion.json"
    codigo = cli.main(["actualizar", "--sin-red", "--raiz", str(repo.raiz), "--atencion", str(salida),
                       "--informe", str(tmp_path / "informe.md")])
    assert codigo == 0
    datos = json.loads(salida.read_text(encoding="utf-8"))
    assert [a["fuente"] for a in datos["atencion"]] == ["f.prueba.nueva"] and datos["consultadas"] == []


def test_resumen_de_una_respuesta_de_error():
    pagina = '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta ...>' + "x" * 5000
    assert base.resumen_respuesta(pagina) == "página HTML «Just a moment...»"
    assert base.resumen_respuesta('{"error": "límite"}') == '{"error": "límite"}'
    assert len(base.resumen_respuesta("a" * 1000)) == 201


def test_version_de_bruegel():
    assert bruegel.version_de_archivo("REER_database_ver11Oct2026.zip") == "2026-10-11"
    assert bruegel.version_de_archivo("REER_database_ver1Feb2027.zip") == "2027-02-01"
    assert bruegel.version_de_archivo("otro.zip") is None
    # Los snapshots anteriores al comando manual no guardaron la versión: sale del nombre del zip.
    meta = {"archivos": [{"extraido_de": {"archivo": "REER_database_ver11Oct2026.zip"}}]}
    assert bruegel.version_de_meta(meta) == "2026-10-11"
    assert bruegel.version_de_meta({"version": "2026-12-01", **meta}) == "2026-12-01"


def test_bajar_manual_guarda_la_version(repo, monkeypatch):
    from pipeline.manuales import bajar_manuales
    _hacer_manual(repo, "2026-01-01")
    contenido = (repo.snapshots / "f.prueba.nueva" / "2026-01-01" / "pagina-001.json").read_bytes()
    monkeypatch.setattr(datos_gob_ar, "bajar", lambda f: [base.Archivo("pagina-001.json", "u", contenido)])
    salida = bajar_manuales(repo)
    assert len(salida) == 1 and "f.prueba.nueva" in salida[0]
    try:
        bajar_manuales(repo, ["f.prueba.vieja"])
        raise AssertionError("debería fallar")
    except ErrorPipeline as e:
        assert "No son fuentes de descarga manual" in str(e)


# --- Tramo que completa (segunda revisión de la 4a, 2.2): la serie diaria del BCRA pasada a mensual completa los
# meses que la mensual todavía no tiene, sin reescalar la historia. ---

def _con_tramo_que_completa(repo, filas_diaria):
    ruta = repo.metadatos / "fuentes.yaml"
    fuentes = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    fuentes.append({"id": "f.prueba.diaria", "organismo": "Prueba", "nombre": "Diaria", "api": "datos.gob.ar", "id_api": "3",
                    "url": "https://ejemplo", "licencia": "CC-BY-4.0", "frecuencia": "mensual", "unidad": "índice",
                    "colapsar": {"a": "month", "con": "end_of_period"}})
    ruta.write_text(yaml.safe_dump(fuentes, allow_unicode=True), encoding="utf-8")
    ruta = repo.metadatos / "quiebres.yaml"
    quiebres = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    quiebres.append({"id": "q.prueba.diaria", "desde": "tramo-completa", "tipo": "cobertura", "descripcion": "Tramo diario."})
    ruta.write_text(yaml.safe_dump(quiebres, allow_unicode=True), encoding="utf-8")
    meta = repo.metadatos / "series" / "prueba.yaml"
    serie = yaml.safe_load(meta.read_text(encoding="utf-8"))
    serie["variantes"][0]["tramos"].append({"fuente": "f.prueba.diaria", "completa": True})
    serie["variantes"][0]["advertencias"].append("q.prueba.diaria")
    meta.write_text(yaml.safe_dump(serie, allow_unicode=True), encoding="utf-8")
    _snapshot_datos_gob_ar(repo, "f.prueba.diaria", filas_diaria)


def test_tramo_que_completa_agrega_solo_los_meses_que_faltan(repo):
    # La diaria difiere de la nueva en 2000-04 y 2000-05 (como marzo de 2026 en las reservas): manda la mensual.
    _con_tramo_que_completa(repo, [["2000-04-01", 99], ["2000-05-01", 99], ["2000-06-01", 52.0], ["2000-07-01", 53.0]])
    res = ejecutar(repo, con_red=False)
    assert res.publicado and not res.errores, res.informe()
    doc = json.loads((repo.export / "series" / "prueba" / "oficial.json").read_text(encoding="utf-8"))
    datos = dict(doc["datos"])
    assert datos["2000-05"] == 51.005 and datos["2000-06"] == 52.0 and datos["2000-07"] == 53.0
    # encadenar_tasas sigue anclado en la mensual: el tramo reciente no reescala la historia.
    assert datos["2000-01"] == pytest.approx(50 / 1.21)
    assert doc["tramos"][-1] == {"fuente": "f.prueba.diaria", "desde": "2000-06", "hasta": "hoy", "frecuencia": "mensual"}
    q = next(a for a in doc["advertencias"] if a["id"] == "q.prueba.diaria")
    assert q["desde"] == "2000-06"


def test_tramo_que_completa_desaparece_si_la_mensual_se_pone_al_dia(repo):
    _con_tramo_que_completa(repo, [["2000-04-01", 99], ["2000-05-01", 99]])
    res = ejecutar(repo, con_red=False)
    assert res.publicado and not res.errores, res.informe()
    doc = json.loads((repo.export / "series" / "prueba" / "oficial.json").read_text(encoding="utf-8"))
    assert doc["datos"][-1] == ["2000-05", 51.005]
    assert [t["fuente"] for t in doc["tramos"]] == ["f.prueba.vieja", "f.prueba.nueva"]
    assert "q.prueba.diaria" not in [a["id"] for a in doc["advertencias"]]


def test_serie_diaria_pasada_a_mensual_descarta_el_mes_incompleto():
    colapsada = json.dumps({"data": [["2025-11-01", 96.0], ["2025-12-01", 94.7], ["2026-01-01", 94.1]], "count": 3}).encode()
    ultimo = json.dumps({"data": [["2026-01-28", 94.47]]}).encode()
    df = datos_gob_ar.normalizar([("pagina-001.json", colapsada), (datos_gob_ar.ULTIMO_DIARIO, ultimo)])
    assert [d.strftime("%Y-%m") for d in df["fecha"]] == ["2025-11", "2025-12"]
    completo = json.dumps({"data": [["2026-01-31", 94.47]]}).encode()
    df = datos_gob_ar.normalizar([("pagina-001.json", colapsada), (datos_gob_ar.ULTIMO_DIARIO, completo)])
    assert len(df) == 3


def test_reemplazar_un_dato_con_otra_fuente_es_estricto(repo):
    # Como marzo de 2026 en las reservas: la mensual trae un dato equivocado y la diaria, el correcto.
    _con_tramo_que_completa(repo, [["2000-04-01", 99], ["2000-05-01", 51.5], ["2000-06-01", 52.0]])
    meta = repo.metadatos / "series" / "prueba.yaml"
    serie = yaml.safe_load(meta.read_text(encoding="utf-8"))
    serie["variantes"][0]["empalme"] = "yuxtaponer"
    serie["variantes"][0]["tramos"] = [{"fuente": "f.prueba.nueva", "desde": "2000-03"}, {"fuente": "f.prueba.diaria", "completa": True}]
    serie["variantes"][0]["reemplazar"] = [{"fecha": "2000-05", "fuente": "f.prueba.diaria", "motivo": "Prueba."}]
    meta.write_text(yaml.safe_dump(serie, allow_unicode=True), encoding="utf-8")
    res = ejecutar(repo, con_red=False)
    assert res.publicado and not res.errores, res.informe()
    datos = dict(json.loads((repo.export / "series" / "prueba" / "oficial.json").read_text(encoding="utf-8"))["datos"])
    assert datos["2000-05"] == 51.5 and datos["2000-04"] == 50.5 and datos["2000-06"] == 52.0
    # Si la fuente se corrige (da lo mismo que la otra), el reemplazo sobra: la variante queda retenida.
    serie["variantes"][0]["reemplazar"] = [{"fecha": "2000-03", "fuente": "f.prueba.diaria", "motivo": "Prueba."}]
    meta.write_text(yaml.safe_dump(serie, allow_unicode=True), encoding="utf-8")
    res = ejecutar(repo, con_red=False)
    assert "prueba.oficial" in res.retenidas and "reemplazar" in res.informe()


def test_snapshot_compara_por_contenido_si_la_fuente_lo_pide(tmp_path):
    # La OCDE devuelve las mismas filas en otro orden según el día (tercera revisión de la 4a): no es una versión nueva.
    from pipeline.fuentes import ocde
    fuente = {"id": "f.prueba.ocde", "licencia": "CC-BY-4.0"}
    csv = lambda filas: ("TIME_PERIOD,OBS_VALUE\n" + "\n".join(filas) + "\n").encode()  # noqa: E731
    filas = ["2000-01,1.0", "2000-02,2.0", "2000-03,3.0"]
    primero, nuevo = base.guardar_snapshot(tmp_path, fuente, [base.Archivo("datos.csv", "u", csv(filas))], canonizar=ocde.canonizar)
    assert nuevo
    mezclado, nuevo = base.guardar_snapshot(tmp_path, fuente, [base.Archivo("datos.csv", "u", csv(filas[::-1]))],
                                            canonizar=ocde.canonizar)
    assert not nuevo and mezclado == primero
    # Sin canonizar, el mismo cambio de orden sí contaba como versión nueva.
    otro = {**fuente, "id": "f.prueba.bytes"}
    base.guardar_snapshot(tmp_path, otro, [base.Archivo("datos.csv", "u", csv(filas))])
    assert base.guardar_snapshot(tmp_path, otro, [base.Archivo("datos.csv", "u", csv(filas[::-1]))])[1]
    # Un valor distinto sí es una versión nueva.
    cambiado = ["2000-01,1.0", "2000-02,2.5", "2000-03,3.0"]
    assert base.guardar_snapshot(tmp_path, fuente, [base.Archivo("datos.csv", "u", csv(cambiado))], canonizar=ocde.canonizar)[1]
