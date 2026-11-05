# paquetes/transformaciones/

Librería de TypeScript con las transformaciones de la SPEC, sección 4. Se implementan una sola vez y las usan la web y, desde la fase 3, el MCP. Trabaja sobre el JSON del export (esquemas 1.1 y 1.2) de una variante ya armada por el pipeline.

```ts
import { disponibles, serieDeEntidad, transformar, transformarEntidades } from "@vaiven/transformaciones";

disponibles(serie);   // transformaciones, frecuencias, medidas y deflactores que admite la variante
transformar(serie, { frecuencia: "anual", transformacion: "var_interanual", desde: "1991", hasta: "2001" });
// → { datos, frecuencias, unidad, advertencias, excluidos, notas }

// Medidas: los insumos (IPC, tipo de cambio, PIB, signos monetarios) se leen del export y se pasan aparte.
transformar(salario, { medida: "real", deflactor: "ipc.provincias", baseReal: "2016" }, { series: { "ipc.provincias": ipc } });
transformar(tcDeEpoca, { pesosActuales: true, transformacion: "var_interanual" }, { signos });

// Series con dimensión pais (INT-01, INT-02): una entidad por vez, o varias con las mismas opciones.
transformar(serieDeEntidad(intPib, "BRA"), { transformacion: "indice_desde_tasas", base: { desde: "2000", hasta: "2000" } });
transformarEntidades(intPib, ["ARG", "BRA"], { transformacion: "indice_desde_tasas" });
```

## Qué hay
- `nivel`, `var_mensual`, `var_interanual`, `var_dic_dic`, `acumulada_anio`, `base_100` (en una fecha o con el promedio de un período), `frecuencia` (a trimestral o anual, con la `agregacion` de la serie) y `media_movil`.
- Desde la fase 4a:
  - `pesos_actuales` (`pesosActuales: true`): divide cada valor por las unidades del signo monetario vigente el último día del período. Solo en las variantes en moneda de cada época; sin ella, esas variantes solo admiten el nivel.
  - `real`: deflacta con la variante del IPC elegida (`deflactor`), a precios de `baseReal` (AAAA o AAAA-MM; por defecto, el último período con dato en la serie y en el IPC).
  - `en_dolares`: divide por el promedio del tipo de cambio oficial (pesos actuales, fin de mes) de cada período.
  - `pct_pib`: divide por el PIB nominal (en pesos o en dólares, según la moneda de la serie) del mismo período. Pide frecuencia anual o trimestral; en los stocks, solo anual (valor de fin de año ÷ PIB del año).
  - `indice_desde_tasas`: encadena tasas de variación anuales en un índice (año base = 100). Un año sin dato corta la cadena de ese lado y se avisa en `notas`.
- Orden fijo: pesos actuales → frecuencia → medida (real, en dólares o % del PIB, excluyentes) → base 100, variación o índice desde tasas → media móvil → período elegido. La SPEC 4 no ubica los pesos actuales; ver `docs/NOTAS_FASE4.md`.
- `advertencias` devuelve los quiebres de la variante y de los insumos de la medida que se cruzan con el rango del resultado.
- Los insumos de un período más largo que el de la serie no se usan (un IPC mensual sirve para una serie anual, no al revés): el insumo se promedia dentro de cada período y, si le falta un subperíodo, el resultado es `null`.

## Reglas
- Nunca se interpola: un dato faltante o excluido (por ejemplo, reservas de marzo de 1979) da `null` en todo lo que lo usa.
- `var_interanual` compara con la misma fecha del año anterior, con la misma frecuencia. Sirve para la desocupación, que es semestral hasta 2003 y trimestral después, y deja hueco donde no hay par.
- `frecuencia` solo agrega períodos completos (en `fin_de_periodo`, alcanza con el último subperíodo). Un año que mezcla frecuencias queda sin dato y se avisa en `notas`.
- Cada variante ofrece solo lo que declaran sus metadatos (`transformaciones` en el export) y, en las medidas, solo si el export trae sus `insumos`. Si faltan, `disponibles()` no las ofrece y la web y el MCP siguen funcionando.

## Pendiente
De la SPEC 4 no falta ninguna transformación. Quedan pendientes, por método y no por la librería, la tasa real de MON-03 y la inversión en % del PIB a precios constantes de ACT-03 (ver `docs/NOTAS_FASE4.md`).

## Pruebas
```bash
npm test -w @vaiven/transformaciones        # Vitest: casos sintéticos, valores publicados (Banco Mundial, BCRA) y contrato del export (ajv)
npm run verificar -w @vaiven/transformaciones
```

**Se llenó en:** fase 2; las medidas, los pesos actuales, el índice desde tasas y la dimensión pais, en la fase 4a.
