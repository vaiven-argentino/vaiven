"""Contrato del export (SPEC, sección 10): el JSON publicado cumple el esquema y los archivos generales son coherentes."""

import json

import jsonschema
import pytest

from pipeline.comun import RAIZ

EXPORT = RAIZ / "export"
# Un esquema por versión: `contrato/serie-<versión>.schema.json`. Si el export usa una versión sin esquema, falla.
ESQUEMAS = {
    ruta.name.removeprefix("serie-").removesuffix(".schema.json"): json.loads(ruta.read_text(encoding="utf-8"))
    for ruta in (RAIZ / "tests" / "contrato").glob("serie-*.schema.json")
}
ARCHIVOS = sorted((EXPORT / "series").glob("*/*.json")) + sorted((EXPORT / "auxiliares").glob("*/*.json"))


def test_hay_series_exportadas():
    assert ARCHIVOS, "export/series está vacío: corré `uv run python -m pipeline actualizar`"


@pytest.mark.parametrize("ruta", ARCHIVOS, ids=lambda r: f"{r.parent.name}.{r.stem}")
def test_serie_cumple_el_esquema(ruta):
    doc = json.loads(ruta.read_text(encoding="utf-8"))
    assert doc.get("esquema") in ESQUEMAS, f"versión de esquema sin contrato: {doc.get('esquema')!r}"
    jsonschema.validate(doc, ESQUEMAS[doc["esquema"]])
    fechas = [f for f, _ in doc["datos"]]
    assert fechas == sorted(fechas) and len(set(fechas)) == len(fechas)
    assert doc["cobertura"] == {"desde": fechas[0], "hasta": fechas[-1]}
    carpeta = EXPORT / "descargas" / "csv" / ("auxiliares" if doc.get("auxiliar") else "")
    assert (carpeta / doc["serie"] / f"{doc['variante']}.csv").exists()
    assert doc.get("auxiliar", False) == (ruta.parent.parent.name == "auxiliares")


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


def test_esquemas_declaran_su_version():
    for version, esquema in ESQUEMAS.items():
        assert esquema["properties"]["esquema"] == {"const": version}
        assert esquema["$id"].endswith(f"/esquemas/serie-{version}.json")


def test_export_usa_la_version_vigente():
    from pipeline.export.series import VERSION_ESQUEMA
    assert VERSION_ESQUEMA in ESQUEMAS
    versiones = {json.loads(r.read_text(encoding="utf-8"))["esquema"] for r in ARCHIVOS}
    assert versiones == {VERSION_ESQUEMA}


def test_cita_apunta_a_la_ficha_de_la_variante():
    catalogo = json.loads((EXPORT / "catalogo.json").read_text(encoding="utf-8"))
    for s in catalogo["series"]:
        for v in s["variantes"]:
            if v["estado"] != "publicada":
                continue
            doc = json.loads((EXPORT / v["archivo"]).read_text(encoding="utf-8"))
            sufijo = f"/series/{s['id']}/" if v["id"] == s["variante_por_defecto"] else f"/series/{s['id']}/{v['id']}/"
            assert doc["cita"].endswith(sufijo), doc["cita"]


def test_especificaciones_vega_usan_url_absoluta():
    for ruta in sorted((EXPORT / "vega").glob("*.json")):
        url = json.loads(ruta.read_text(encoding="utf-8"))["data"]["url"]
        assert url.startswith("https://vaiven.argentino.workers.dev/datos/descargas/csv/"), url
        assert (EXPORT / url.split("/datos/", 1)[1]).exists(), url


def test_excluidos_no_figuran_en_los_datos():
    for ruta in ARCHIVOS:
        doc = json.loads(ruta.read_text(encoding="utf-8"))
        fechas = {f for f, _ in doc["datos"]}
        for e in doc["excluidos"]:
            assert e["fecha"] not in fechas, (doc["id"], e["fecha"])
    reservas = json.loads((EXPORT / "series" / "reservas" / "brutas.json").read_text(encoding="utf-8"))
    assert [e["fecha"] for e in reservas["excluidos"]] == ["1979-03"]


def test_catalogo_trae_la_bibliografia_de_los_metadatos():
    import yaml
    catalogo = json.loads((EXPORT / "catalogo.json").read_text(encoding="utf-8"))
    for s in catalogo["series"]:
        meta = yaml.safe_load((RAIZ / "metadatos" / "series" / f"{s['id']}.yaml").read_text(encoding="utf-8"))
        assert [b["id"] for b in s["bibliografia"]] == meta.get("bibliografia", [])
        for b in s["bibliografia"]:
            assert set(b) == {"id", "referencia", "pagina", "tipo", "titulo_original", "periodo_cubierto"}
            assert b["referencia"], b


def test_el_ejemplo_1_1_sigue_cumpliendo_su_esquema():
    # Contrato anterior: un JSON de la 1.1 (fase 2) tiene que seguir validando contra su esquema publicado.
    ejemplo = json.loads((RAIZ / "tests" / "contrato" / "ejemplos" / "serie-1.1.json").read_text(encoding="utf-8"))
    assert ejemplo["esquema"] == "1.1"
    jsonschema.validate(ejemplo, ESQUEMAS["1.1"])


@pytest.mark.parametrize("ruta", ARCHIVOS, ids=lambda r: f"{r.parent.name}.{r.stem}")
def test_los_insumos_apuntan_a_archivos_publicados(ruta):
    doc = json.loads(ruta.read_text(encoding="utf-8"))
    for medida, insumo in doc.get("insumos", {}).items():
        ids = [o["id"] for o in insumo["opciones"]]
        assert insumo["por_defecto"] in ids, (medida, insumo["por_defecto"])
        for o in insumo["opciones"]:
            assert (EXPORT / o["archivo"]).exists(), (medida, o["archivo"])


def test_indice_de_auxiliares_y_signos_monetarios():
    indice = json.loads((EXPORT / "auxiliares.json").read_text(encoding="utf-8"))
    catalogo = {s["id"] for s in json.loads((EXPORT / "catalogo.json").read_text(encoding="utf-8"))["series"]}
    for a in indice["auxiliares"]:
        assert a["id"] not in catalogo, f"{a['id']} es auxiliar: no va en el catálogo"
        for v in a.get("variantes", []):
            if v["estado"] == "publicada":
                assert (EXPORT / v["archivo"]).exists(), v["archivo"]
    signos = json.loads((EXPORT / "auxiliares" / "signos-monetarios.json").read_text(encoding="utf-8"))["signos"]
    por_id = {s["id"]: s["unidades_por_peso_actual"] for s in signos}
    # 1 peso = 10.000 australes = 10⁷ pesos argentinos = 10¹¹ pesos ley 18.188 = 10¹³ pesos moneda nacional (SPEC 4).
    assert por_id == {"peso": 1, "austral": 1e4, "peso-argentino": 1e7, "peso-ley-18188": 1e11, "peso-moneda-nacional": 1e13}
