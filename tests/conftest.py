import pandas as pd
import pytest


def mensual(desde: str, valores: list[float]) -> pd.Series:
    s = pd.Series(valores, index=pd.date_range(desde, periods=len(valores), freq="MS"), dtype=float)
    s.index.name = "fecha"
    return s


@pytest.fixture
def serie_mensual():
    return mensual
