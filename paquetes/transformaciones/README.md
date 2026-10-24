# paquetes/transformaciones/

Librería de TypeScript con las transformaciones de la SPEC, sección 4. Se implementan una sola vez y las usan la web y, desde la fase 3, el MCP. Trabaja sobre el JSON del export (esquema 1.1) de una variante ya armada por el pipeline.

```ts
import { disponibles, transformar } from "@vaiven/transformaciones";

disponibles(serie);   // qué transformaciones y frecuencias admite la variante
transformar(serie, { frecuencia: "anual", transformacion: "var_interanual", desde: "1991", hasta: "2001" });
// → { datos, frecuencias, unidad, advertencias, excluidos, notas }
```

## Qué hay
- `nivel`, `var_mensual`, `var_interanual`, `var_dic_dic`, `acumulada_anio`, `base_100` (en una fecha o con el promedio de un período), `frecuencia` (a trimestral o anual, con la `agregacion` de la serie) y `media_movil`.
- Orden fijo (SPEC 4): frecuencia → base 100 o variación → media móvil → período elegido.
- `advertencias` devuelve los quiebres de la variante que se cruzan con el rango del resultado.

## Reglas
- Nunca se interpola: un dato faltante o excluido (por ejemplo, reservas de marzo de 1979) da `null` en todo lo que lo usa.
- `var_interanual` compara con la misma fecha del año anterior, con la misma frecuencia. Sirve para la desocupación, que es semestral hasta 2003 y trimestral después, y deja hueco donde no hay par.
- `frecuencia` solo agrega períodos completos (en `fin_de_periodo`, alcanza con el último subperíodo). Un año que mezcla frecuencias queda sin dato y se avisa en `notas`.
- Cada variante ofrece solo lo que declaran sus metadatos (`transformaciones` en el export).

## Pendiente
`real`, `en_dolares`, `pct_pib`, `pesos_actuales` e `indice_desde_tasas` (fase 4: necesitan series auxiliares o la dimensión `pais`).

## Pruebas
```bash
npm test -w @vaiven/transformaciones        # Vitest: casos sintéticos, valores publicados y contrato del export (ajv)
npm run verificar -w @vaiven/transformaciones
```

**Se llenó en:** fase 2.
