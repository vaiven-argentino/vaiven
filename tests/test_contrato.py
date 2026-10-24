"""Contrato del export (SPEC, sección 10): el JSON publicado cumple el esquema y los archivos generales son coherentes."""

import json

import jsonschema
import pytest

from pipeline.comun import RAIZ

EXPORT = RAIZ / "export"
ESQUEMA = json.loads((RAIZ / "tests" / "contrato" / "serie.schema.json").read_text(encoding="utf-8"))
ARCHIVOS = sorted((EXPORT / "series").glob("*/*.json"))


def test_hay_series_exportadas():
    assert ARCHIVOS, "export/series está vacío: corré `uv run python -m pipeline actualizar`"


@pytest.mark.parametrize("ruta", ARCHIVOS, ids=lambda r: f"{r.parent.name}.{r.stem}")
def test_serie_cumple_el_esquema(ruta):
    doc = json.loads(ruta.read_text(encoding="utf-8"))
    jsonschema.validate(doc, ESQUEMA)
    fechas = [f for f, _ in doc["datos"]]
    assert fechas == sorted(fechas) and len(set(fechas)) == len(fechas)
    assert doc["cobertura"] == {"desde": fechas[0], "hasta": fechas[-1]}
    assert (EXPORT / "descargas" / "csv" / doc["serie"] / f"{doc['variante']}.csv").exists()


def test_catalogo_y_datapackage_apuntan_a_archivos_existentes():
    catalogo = json.loads((EXPORT / "catalogo.json").read_text(encoding="utf-8"))
    for s in catalogo["series"]:
        defecto = [v for v in s["variantes"] if v["id"] == s["variante_por_defecto"]]
        assert defecto and defecto[0]["estado"] == "publicada", s["id"]
        for v in s["variantes"]:
            if v["estado"] == "publicada":
                assert (EXPORT / v["archivo"]).exists(), v["archivo"]
            else:
                assert v["archivo"] is None and not (EXPORT / "series" / s["id"] / f"{v['id']}.json").exists()
    paquete = json.loads((EXPORT / "datapackage.json").read_text(encoding="utf-8"))
    assert paquete["$schema"].endswith("/2.0/datapackage.json")
    for r in paquete["resources"]:
        assert (EXPORT / r["path"]).exists(), r["path"]


def test_variantes_no_redistribuibles_no_se_publican():
    assert not (EXPORT / "series" / "ipc" / "cavallo-bertolotto.json").exists()
    assert not (RAIZ / "snapshots" / "f.cavallo-bertolotto.ipc").exists()
