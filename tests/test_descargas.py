"""Descarga completa: el ZIP tiene un CSV por variante publicada y los archivos generales."""

import shutil
import zipfile

from pipeline.comun import RAIZ
from pipeline.export.descargas import generar


def test_zip_de_descarga(tmp_path):
    shutil.copytree(RAIZ / "export", tmp_path / "export", ignore=shutil.ignore_patterns("*.zip", "*.parquet"))
    shutil.copy(RAIZ / "LICENSE-DATOS", tmp_path / "LICENSE-DATOS")
    (ruta,) = generar(tmp_path / "export", parquet=False)
    nombres = set(zipfile.ZipFile(ruta).namelist())
    csvs = {f"{p.parent.name}/{p.name}" for p in (RAIZ / "export" / "descargas" / "csv").glob("*/*.csv")}
    assert csvs and csvs <= nombres
    assert {"catalogo.json", "datapackage.json", "quiebres.json", "LICENSE-DATOS"} <= nombres
