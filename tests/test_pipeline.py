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
