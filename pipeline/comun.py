"""Utilidades compartidas: rutas del repositorio, lectura de metadatos y manejo de fechas por frecuencia."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import yaml

RAIZ = Path(__file__).resolve().parent.parent

FRECUENCIAS = ("diaria", "mensual", "trimestral", "semestral", "anual")


@dataclass(frozen=True)
class Rutas:
    """Carpetas que usa el pipeline. En los tests se apunta a un directorio temporal."""

    raiz: Path = RAIZ

    @property
    def metadatos(self) -> Path:
        return self.raiz / "metadatos"

    @property
    def snapshots(self) -> Path:
        return self.raiz / "snapshots"

    @property
    def capa1(self) -> Path:
        return self.raiz / "datos" / "capa1"

    @property
    def capa2(self) -> Path:
        return self.raiz / "datos" / "capa2"

    @property
    def export(self) -> Path:
        return self.raiz / "export"


class ErrorPipeline(Exception):
    """Error que corta el pipeline con un mensaje para la persona que lo mantiene."""


def leer_yaml(ruta: Path):
    with ruta.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def escribir_json(ruta: Path, contenido, compacto: bool = False) -> None:
    """Escribe JSON en UTF-8 con orden estable, para que los diffs de Git sean legibles."""
    ruta.parent.mkdir(parents=True, exist_ok=True)
    if compacto:
        texto = json.dumps(contenido, ensure_ascii=False, separators=(",", ":"))
    else:
        texto = json.dumps(contenido, ensure_ascii=False, indent=2)
    ruta.write_text(texto + "\n", encoding="utf-8")


def ahora_utc() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def a_fecha(valor) -> pd.Timestamp:
    """Convierte '1970', '1970-01', '1970-01-15', date o Timestamp al inicio del período."""
    if isinstance(valor, pd.Timestamp):
        return valor
    if isinstance(valor, (date, datetime)):
        return pd.Timestamp(valor)
    texto = str(valor)
    if len(texto) == 4:
        texto += "-01-01"
    elif len(texto) == 7:
        texto += "-01"
    return pd.Timestamp(texto)


def etiqueta_fecha(fecha: pd.Timestamp, frecuencia: str) -> str:
    """Formato de fecha del export (SPEC 2.5): AAAA-MM-DD en diarias, AAAA en anuales y AAAA-MM en el resto.

    En las trimestrales, el mes es el primero del trimestre; en las semestrales de la EPH puntual, el mes de la onda.
    """
    if frecuencia == "diaria":
        return fecha.strftime("%Y-%m-%d")
    if frecuencia == "anual":
        return fecha.strftime("%Y")
    return fecha.strftime("%Y-%m")


def calendario(frecuencia: str, desde: pd.Timestamp, hasta: pd.Timestamp, meses: list[int] | None = None) -> pd.DatetimeIndex:
    """Fechas esperadas entre `desde` y `hasta` para una frecuencia regular.

    Las diarias no tienen calendario fijo (feriados y fines de semana), así que no se controlan por esta vía.
    En las semestrales, `meses` indica los meses de relevamiento (por ejemplo, [5, 10] en la EPH puntual).
    """
    if frecuencia == "mensual":
        return pd.date_range(desde, hasta, freq="MS")
    if frecuencia == "trimestral":
        return pd.date_range(desde, hasta, freq="QS")
    if frecuencia == "anual":
        return pd.date_range(desde, hasta, freq="YS")
    if frecuencia == "semestral":
        meses = meses or [1, 7]
        todas = pd.date_range(desde, hasta, freq="MS")
        return todas[todas.month.isin(meses)]
    raise ValueError(f"Frecuencia sin calendario regular: {frecuencia}")


def serie_desde_df(df: pd.DataFrame) -> pd.Series:
    """Pasa un DataFrame (fecha, valor) a una Series indexada por fecha."""
    s = pd.Series(df["valor"].to_numpy(dtype=float), index=pd.DatetimeIndex(df["fecha"]), name="valor")
    s.index.name = "fecha"
    return s.sort_index()


def df_desde_serie(s: pd.Series) -> pd.DataFrame:
    return pd.DataFrame({"fecha": s.index, "valor": s.to_numpy(dtype=float)})


def leer_csv_serie(ruta: Path) -> pd.Series:
    df = pd.read_csv(ruta, parse_dates=["fecha"])
    return serie_desde_df(df)


def escribir_csv_serie(ruta: Path, s: pd.Series) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame({"fecha": [f.strftime("%Y-%m-%d") for f in s.index], "valor": s.to_numpy(dtype=float)})
    df.to_csv(ruta, index=False, float_format="%.10g", lineterminator="\n")
