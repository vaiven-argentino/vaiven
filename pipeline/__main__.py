"""Punto de entrada.

- `uv run python -m pipeline actualizar [--series ipc,reservas] [--sin-red] [--informe RUTA]`
- `uv run --group descargas python -m pipeline descargas`

Sale con código 0 si publicó (con o sin cambios), 1 si la validación falló y 2 ante un error del pipeline.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pipeline.actualizar import ejecutar
from pipeline.comun import ErrorPipeline, Rutas


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m pipeline", description="Pipeline de Vaivén.")
    sub = p.add_subparsers(dest="comando", required=True)
    a = sub.add_parser("actualizar", help="Snapshot, capa 1, capa 2, validación y export.")
    a.add_argument("--series", help="Ids de series separados por comas (por defecto, todas).")
    a.add_argument("--sin-red", action="store_true", help="Usa los últimos snapshots, sin descargar.")
    a.add_argument("--informe", type=Path, help="Archivo donde escribir el informe en Markdown.")
    a.add_argument("--raiz", type=Path, default=Rutas().raiz, help="Raíz del repositorio (para pruebas).")
    d = sub.add_parser("descargas", help="Genera el Parquet y el ZIP de descarga completa en export/descargas/.")
    d.add_argument("--sin-parquet", action="store_true", help="Solo el ZIP (no necesita pyarrow).")
    d.add_argument("--raiz", type=Path, default=Rutas().raiz, help="Raíz del repositorio (para pruebas).")
    args = p.parse_args(argv)

    if args.comando == "descargas":
        from pipeline.export.descargas import generar

        for ruta in generar(Rutas(args.raiz).export, parquet=not args.sin_parquet):
            print(ruta)
        return 0

    solo = [s.strip() for s in args.series.split(",")] if args.series else None
    try:
        res = ejecutar(Rutas(args.raiz), solo=solo, con_red=not args.sin_red)
    except ErrorPipeline as e:
        texto = f"## El pipeline se detuvo\n\n{e}\n"
        if args.informe:
            args.informe.write_text(texto, encoding="utf-8")
        print(texto, file=sys.stderr)
        return 2
    informe = res.informe()
    if args.informe:
        args.informe.write_text(informe, encoding="utf-8")
    print(informe)
    return 0 if res.publicado else 1


if __name__ == "__main__":
    sys.exit(main())
