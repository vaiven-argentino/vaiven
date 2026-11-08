"""Punto de entrada.

- `uv run python -m pipeline actualizar [--series ipc,reservas] [--sin-red] [--informe RUTA]`
- `uv run --group descargas python -m pipeline descargas`
- `uv run python -m pipeline bajar-manual [f.bruegel.reer-51-ar]`: baja las fuentes de descarga manual (las que no
  se pueden bajar desde GitHub Actions) y guarda un snapshot si hay una versión nueva.

`actualizar` sale con código 0 si publicó todo (con o sin cambios), 3 si publicó con variantes retenidas (las que no
pasaron la validación conservan su versión anterior), 1 si no publicó nada y 2 ante un error del pipeline.
"""

from __future__ import annotations

import argparse
import json
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
    a.add_argument("--atencion", type=Path,
                   help="Archivo JSON con las fuentes que necesitan atención y las consultadas (para el workflow).")
    a.add_argument("--raiz", type=Path, default=Rutas().raiz, help="Raíz del repositorio (para pruebas).")
    m = sub.add_parser("bajar-manual", help="Baja las fuentes de descarga manual y guarda el snapshot si hay versión nueva.")
    m.add_argument("fuentes", nargs="*", help="Ids de las fuentes (por defecto, todas las de descarga manual).")
    m.add_argument("--raiz", type=Path, default=Rutas().raiz, help="Raíz del repositorio (para pruebas).")
    d = sub.add_parser("descargas", help="Genera el Parquet y el ZIP de descarga completa en export/descargas/.")
    d.add_argument("--sin-parquet", action="store_true", help="Solo el ZIP (no necesita pyarrow).")
    d.add_argument("--raiz", type=Path, default=Rutas().raiz, help="Raíz del repositorio (para pruebas).")
    args = p.parse_args(argv)

    if args.comando == "descargas":
        from pipeline.export.descargas import generar

        for ruta in generar(Rutas(args.raiz).export, parquet=not args.sin_parquet):
            print(ruta)
        return 0
    if args.comando == "bajar-manual":
        from pipeline.manuales import bajar_manuales

        try:
            for linea in bajar_manuales(Rutas(args.raiz), args.fuentes or None):
                print(linea)
        except ErrorPipeline as e:
            print(e, file=sys.stderr)
            return 2
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
    if args.atencion:
        args.atencion.write_text(json.dumps({"atencion": res.atencion, "consultadas": res.consultadas},
                                            ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # 0: todo publicado; 3: publicado, con variantes retenidas (hay que revisar); 1: no se publicó nada.
    if not res.publicado:
        return 1
    return 3 if res.retenidas else 0


if __name__ == "__main__":
    sys.exit(main())
