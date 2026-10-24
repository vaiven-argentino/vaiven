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


def test_valor_fuera_de_rango_frena_la_publicacion(repo):
    shutil.rmtree(repo.snapshots / "f.prueba.nueva")
    _snapshot_datos_gob_ar(repo, "f.prueba.nueva", [["2000-03-01", 50], ["2000-04-01", 50.5], ["2000-05-01", 505.0]])
    res = ejecutar(repo, con_red=False)
    assert not res.publicado
    assert any(p.regla == "rango" for p in res.errores)
    assert "2000-05-01" in res.informe()
    assert not (repo.export / "series").exists()


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


def test_catalogo_con_bibliografia_del_inventario(repo):
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
