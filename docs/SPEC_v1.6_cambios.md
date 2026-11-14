# Vaivén · SPEC v1.6 · Cambios sobre la v1.5 (aprobados)

*Aprobados el 13/11/2026. Se integran en `vaiven/docs/SPEC.md` para formar la v1.6: cada bloque de abajo indica si **reemplaza**, **agrega** o **corrige** texto de la v1.5. Lo que no se menciona queda igual. Las marcas **[se verifica en la 4e]** no son decisiones abiertas: son comprobaciones técnicas que se hacen en esa subfase.*

**Decisiones del 13/11/2026 que estos cambios incorporan:**
1. Las subfases 4c y 4d se hacen juntas, sobre un módulo de alineación compartido (`alinear.ts`).
2. Con dos unidades distintas, el gráfico va por defecto en **doble eje**, y los **paneles apilados** quedan como opción, a un clic. Con tres o cuatro unidades, o con una serie internacional junto con otra serie, se usan paneles. Los subagentes trabajan en Sonnet; cuántos hay depende de los tipos de tarea (sección 11).
3. En el gráfico, cada serie va en su frecuencia. En el CSV, formato largo. En `comparar_series`, las series se llevan por defecto a la frecuencia común más baja.
4. Los parámetros por serie van indexados en la URL (`s2`, `t2`…). Los parámetros sin número son los de la primera serie, así que los enlaces de la 4b siguen funcionando.
5. Una serie internacional como máximo por vista, junto con hasta tres series argentinas.
6. MCP Apps: `especificacion_grafico` muestra el gráfico interactivo dentro de Claude, en una subfase propia (4e).

---

## Encabezado · CORRIGE

Agregar al final de la línea de versiones: «· v1.6: 13/11/2026, comparación de series (4c/4d) y gráfico interactivo en el MCP (4e)».

---

## §4 · AGREGA, al final de la sección: «4.1 Comparación de series»

### 4.1 Comparación de series
Un módulo de la librería (`paquetes/transformaciones/alinear.ts`) combina hasta 4 series ya transformadas. Lo usan el explorador, las descargas de la vista, `comparar_series` y `especificacion_grafico`. Igual que `ubicacion.ts`, no tiene una segunda implementación.

- **Cada serie con su cadena.** Cada serie aplica su propia cadena de transformaciones (sección 4, en el orden fijo) antes de combinarse. La combinación no transforma nada: solo agrupa, alinea y avisa.
- **Rango común.** `desde` y `hasta` valen para todas las series. Las fechas sin dato de una serie dan `null`, y nunca se interpola.
- **Unidad resultante.** Es la unidad de cada serie después de su cadena (por ejemplo, «% de variación interanual» o «índice, base 2004 = 100»). Dos series comparten panel solo si su unidad resultante es idéntica.
- **Disposición.** La decide la cantidad de unidades resultantes:
  - **Una unidad:** un solo gráfico.
  - **Dos unidades:** doble eje por defecto.
    - El eje izquierdo es el de la unidad de la primera serie. Cada eje lleva, junto a su título, una muestra del trazo de sus series.
    - Cada eje toma un rango automático que incluye todos los datos visibles. Si los dos rangos incluyen el cero, los ceros se alinean, para que una serie no parezca negativa cuando la otra cruza el cero.
    - El gráfico lleva fijo el aviso: «Las escalas de los dos ejes son independientes: que las líneas se crucen o se acerquen no indica una relación entre las series».
    - Los paneles son la alternativa: `ejes=paneles` en la URL y `ejes: "paneles"` en el MCP.
  - **Tres o cuatro unidades, o una serie internacional junto con otra serie:** paneles, sin alternativa. Un doble eje no puede mostrar tres unidades, y 8 países en un eje con otra serie en el segundo no se leen.
  - **Paneles:**
    - uno por unidad resultante, en el orden en que aparece la primera serie de cada unidad, hasta 4;
    - comparten el eje temporal, el sombreado y los eventos;
    - con una sola unidad, `ejes=paneles` se ignora con un aviso.
- **Frecuencias distintas.**
  - **En el gráfico:** cada serie en su frecuencia, ubicada con `ubicacion.ts` (sección 2.4).
  - **Alineación a frecuencia común** (tabla de la vista, XLSX en formato ancho y `comparar_series` por defecto): todas las series pasan a la frecuencia más baja del conjunto, con la `agregacion` de cada una y solo con períodos completos (como `frecuencia`). El orden es mensual < trimestral < anual. Una serie semestral (EPH puntual) lleva la frecuencia común a anual, porque la onda no es un semestre calendario. Una serie diaria cuenta como mensual.
  - **Límite:** la alineación usa la transformación `frecuencia` de cada serie, y solo después aplica la medida y la variación. Por eso una variación interanual alineada a anual es la variación del promedio anual, y no el promedio de las variaciones mensuales. Se avisa.
- **Serie internacional.** Como máximo una por vista. Si hay otras series, la vista va en paneles, y la internacional ocupa uno propio con sus países (hasta 8, sección 6.2), aunque otra serie tenga la misma unidad resultante. Para el límite de 4, cuenta como una serie.
- **Advertencias.** Cada serie trae las suyas, también las de sus insumos. La combinación agrega las propias: frecuencia común aplicada, una serie sin datos en el rango, `ejes=paneles` ignorado.
- **Límite de observaciones:** 10.000 en total, sumando las series y los países (sección 7.3).

---

## §5.4 · Estructura del repositorio · CORRIGE dos líneas

```
├── .claude/agents/     subagentes de Claude Code, en Sonnet (explorador, tester, revisor de datos, revisor visual, probador del MCP, verificador de fuentes; sección 11)
├── .mcp.json           servidor MCP local por stdio, para el probador del MCP
```

---

## §6.1 · Mapa del sitio · REEMPLAZA la fila «Explorador»

| **Explorador** | Hasta 4 series a la vez (una puede ser internacional, con hasta 8 países), cada una con su variante y sus transformaciones. Doble eje con dos unidades (los paneles, a un clic) y paneles apilados con tres o más. Período, sombreado por gobierno, mandato, ministro, plan, régimen cambiario o etapa del curso, y eventos. Tabla a la frecuencia común y descargas de la vista. |

---

## §6.2 · Explorador · REEMPLAZA el primer párrafo y el ítem «Estado en la URL»; AGREGA los ítems «Varias series» y «Paneles»

En la fase 4b, el explorador (`/explorador/`) mostraba una serie por vez. Desde la 4c/4d compara **hasta 4 series** (sección 4.1).

- **Estado en la URL:**
  - Las series, variantes, transformaciones, período, sombreado y eventos van en la URL, así una vista exacta se puede compartir.
  - **Parámetros de cada serie:** `s`, `v`, `t`, `m`, `d`, `pib`, `pa`, `f`, `mm`, `base`, `log` y `p` (países: el resaltado primero; solo en la serie internacional).
    - Sin número son los de la serie 1; con sufijo `2`, `3` y `4`, los de las demás (`s2`, `t2`, `p3`…). Una URL de la 4b, con una sola serie, sigue dando la misma vista.
  - **Parámetros comunes:** `desde`, `hasta`, `sh`, `ev` y `ejes`.
  - Lo que coincide con la vista inicial de cada serie no se escribe.
  - Un parámetro que la serie no admite se ignora con un aviso, y también un índice sin su `s` (por ejemplo, `t3` sin `s3`).
  - Si falta un índice intermedio (`s3` sin `s2`), las series se renumeran al canonizar la URL.
  - Las comas de las listas (`p`, `ev`) van sin codificar.
- **Varias series:**
  - En la sección «Serie» del panel, cada serie tiene su bloque, plegable, con serie, variante y transformación. Hay un botón «Agregar serie» (hasta 4) y, en cada bloque, «Quitar».
  - El orden de los bloques es el de los índices. Al quitar una serie, las siguientes suben.
  - No se puede agregar una segunda serie internacional: el selector la muestra deshabilitada, con la razón.
  - Cada serie lleva un color de la paleta categórica, en orden fijo según su índice. El color sigue a la serie: no cambia al quitar otra (al quitar la serie 2, la serie 3 conserva su color hasta que se recarga la URL canónica).
  - El nombre de cada serie va al final de su línea, como en las series internacionales.
  - Los países de la serie internacional usan la paleta de 8 de su panel, sin mezclarse con los colores de las otras series.
- **Disposición** (regla de 4.1):
  - **Doble eje:**
    - un botón «Ver en paneles» va junto al gráfico, a la vista, y no en el panel de controles;
    - en paneles, el mismo lugar ofrece «Ver en doble eje».
  - **Paneles:**
    - apilados, con eje temporal común; el eje de fechas va solo en el último;
    - cada panel lleva arriba su unidad y los nombres de sus series;
    - **alto:** el conjunto ocupa el 60 % del alto de la pantalla, con un mínimo de 180 px por panel; si no alcanza, la página se desplaza.
  - **Escala logarítmica:** `log` es de cada serie, pero se aplica a su eje o a su panel. Si las series de un eje o de un panel no coinciden, vale la de la primera, con un aviso.
  - El sombreado y las reglas de los eventos cruzan todos los paneles. La franja de los planes va arriba del primero, y la de los episodios, debajo del último.
  - La regla de densidad de los eventos se aplica una sola vez, para todo el gráfico.
- **Tooltip y lector de teclado (cambio):**
  - Una sola guía vertical recorre todos los paneles.
  - En cada fecha se ve el valor de cada serie: el de la observación cuyo intervalo contiene la fecha (2.4), con la fecha de esa observación si es otra («2001 (anual): 458.796»).
  - Las flechas recorren las fechas de la serie de frecuencia más alta.
- **Exportación (cambio):**
  - **PNG y SVG:** todos los paneles en una imagen, con el título, las fuentes, la variante y la transformación de cada serie, el sombreado y la versión de datos.
  - **CSV:** formato largo (`fecha, serie, variante, transformacion, unidad, valor, periodo, periodo_proporcion, otros_periodos`), con una fila por observación y la fecha de cada serie en su frecuencia. En la serie internacional se suma la columna `pais`.
  - **XLSX:**
    - una hoja en formato largo, igual al CSV;
    - una hoja en formato ancho, a la frecuencia común (4.1), con una columna por serie (y por país);
    - la hoja de metadatos, con una cita por serie y la regla de alineación.
- **Tabla de la vista:** a la frecuencia común, con una columna por serie.
- **La ficha** sigue mostrando una sola serie. El enlace «Abrir esta vista en el explorador» abre esa serie como serie 1.

*(Los ítems «Parámetro `ev`», «Panel», «Sombreado y eventos», «Ubicación de los datos», «Advertencias visibles», «Riesgo país» y «Series internacionales» siguen como en la v1.5. En «Series internacionales», la frase «cada una cuenta como una serie dentro del límite de 4» pasa a decir: «cuenta como una serie dentro del límite de 4, y hay una como máximo por vista».)*

---

## §6.5 · Accesibilidad y uso en celular · REEMPLAZA el segundo ítem; AGREGA uno

- **Diseño adaptable al celular:**
  - Los paneles se apilan a todo el ancho.
  - Por debajo de 600 px, dos unidades también van en paneles por defecto, porque los dos ejes le quitan al gráfico el ancho que el celular no tiene; el botón ofrece el doble eje.
  - Los controles van en el panel desplegable. Dentro de él se edita una serie por vez, con un selector de la serie activa.
  - Desde 1100 px, los controles pasan a un panel lateral fijo (6.2).
- **Texto alternativo:** cada panel tiene el suyo, con un resumen de sus series. La tabla de la vista es la alternativa accesible al conjunto.

---

## §7.2 · Herramientas · REEMPLAZA las filas de `comparar_series` y `especificacion_grafico`

| Herramienta | Parámetros | Devuelve |
|---|---|---|
| `comparar_series` | `series[]`: de 1 a 4 objetos, cada uno con `id` y los parámetros de transformación de `obtener_serie` (`variante`, `pesos_actuales`, `frecuencia`, `medida`, `deflactor`, `base_real`, `denominador`, `transformacion`, `base`, `paises`); comunes: `desde?`, `hasta?`, `alinear?` (`frecuencia_comun`, por defecto, o `ninguna`) | Con `frecuencia_comun`: `frecuencia`, `columnas` (una por serie y por país) y `datos` como filas `[fecha, v1, v2…]`. Con `ninguna`: los datos de cada serie en su frecuencia. Siempre: por serie, la unidad resultante, el último dato y su atraso, las advertencias y la cita; además, las advertencias de la combinación (4.1) y `version_datos`. |
| `especificacion_grafico` | los de `comparar_series` (sin `alinear`), más `sombreado?` (los valores de `sh`), `eventos?` (los valores de `ev`: `true` o una lista de categorías) y `ejes?` (`auto`, por defecto, que sigue la regla de 4.1, o `paneles`) | La especificación de Vega-Lite de la vista, con los datos incluidos y el mismo armado que el explorador; `url_explorador`, con esa vista; las advertencias y las citas. Todo va también en `structuredContent`, para que el gráfico interactivo (7.4) lo lea sin pedir nada más. |

Nota de cambio respecto de la v1.5: `comparar_series` pasa de `ids[]` con parámetros sueltos a `series[]` con un objeto por serie, porque cada serie tiene su propia cadena de transformaciones.

---

## §7.3 · Reglas de respuesta · AGREGA

- **CPU de `especificacion_grafico`:** armar la especificación con los datos incluidos tiene que caber en los 10 ms de CPU del plan gratuito. En la 4c/4d se mide con el peor caso (4 series mensuales, de 1970 a hoy). Si no entra, la herramienta baja su límite de observaciones (no el de las demás) y lo dice en el error. El límite que resulte de la medición se anota en `NOTAS_FASE4.md` y en esta sección.

---

## §7 · AGREGA «7.4 Gráfico interactivo en Claude (MCP Apps, fase 4e)»

### 7.4 Gráfico interactivo en Claude (MCP Apps)
MCP Apps es la extensión oficial del protocolo para que un servidor muestre una interfaz dentro de la conversación. En Vaivén se usa para un solo recurso:

- **Recurso:** `ui://vaiven/grafico`, declarado en `_meta.ui.resourceUri` de `especificacion_grafico`. Es la única herramienta que lo lleva: `obtener_serie` y `comparar_series` siguen devolviendo solo datos, para no abrir un gráfico cada vez que el modelo consulta una cifra.
- **Qué hace:**
  - recibe el resultado de la herramienta (`structuredContent`), dibuja el gráfico con vega-embed y muestra los avisos y las citas;
  - deja cambiar la transformación, el período, el sombreado y los eventos sin escribir otro mensaje, llamando otra vez a `especificacion_grafico` desde la interfaz;
  - ofrece «Abrir en el explorador» (`url_explorador`) y la descarga en PNG y SVG.
- **Mismo armado:** el recurso usa la misma librería que arma la especificación del explorador (`paquetes/`), compilada en un solo HTML. No hay un segundo armado de gráficos.
- **Peso y CSP:** el HTML del recurso es mínimo y carga el script desde el propio dominio de Vaivén (assets estáticos del Worker, que no consumen CPU), declarado en `_meta.ui.csp`. No usa CDN de terceros **[se verifica en la 4e: que el host acepte el dominio propio en la CSP; si no, va todo en línea y se mide la CPU de `resources/read`]**.
- **Vega y CSP:** si la CSP del host no permite `unsafe-eval`, Vega necesita su intérprete compatible con CSP (`vega-interpreter`) **[se verifica en la 4e]**.
- **Sin soporte de MCP Apps:** un cliente que no soporta la extensión recibe el resultado de siempre (la especificación, el enlace al explorador, los avisos y las citas). Nada de la 4c/4d depende de la 4e.
- **Variante local:** el mismo recurso, por stdio.
- **Modo claro y oscuro:** sigue el del host si lo informa y, si no, el del sistema.

---

## §10 · Calidad y pruebas · AGREGA

- **`alinear.ts`:** pruebas unitarias con casos conocidos:
  - la disposición según la cantidad de unidades, con y sin serie internacional;
  - ceros alineados en el doble eje;
  - mensual con trimestral y con anual;
  - semestral de la EPH con trimestral (la frecuencia común da anual);
  - una serie sin datos en el rango;
  - variación interanual alineada a anual;
  - límite de observaciones con una serie internacional.
- **Contrato de `comparar_series` y `especificacion_grafico`:** esquemas de respuesta en `tests/contrato/`, con la misma regla de versión de 2.5.
- **Una sola implementación:** una prueba compara, para las mismas vistas, la especificación de `especificacion_grafico` con la del explorador; tienen que ser iguales salvo el tamaño.
- **URL:** las URL de una sola serie de la 4b dan la misma vista que antes (pruebas de regresión con las URL guardadas en la 4b).
- **MCP Apps (4e):** prueba manual en Claude web y en Claude Desktop (`mcp/PRUEBA_MANUAL.md`), y prueba de que un cliente sin la extensión recibe el resultado completo en texto.

---

## §11 · Hoja de ruta · REEMPLAZA «Subfases de la fase 4» y CORRIGE «Sugerencia de trabajo»

**Subfases de la fase 4:**
- **4a:** datos del núcleo (las 20 series A, las 2 internacionales, las auxiliares y las medidas en la librería, la ficha y el MCP).
- **4b:** explorador de una serie y períodos.
- **4c/4d:** comparación de series en la web y en el MCP: `alinear.ts`, explorador con hasta 4 series y paneles, `comparar_series` y `especificacion_grafico`.
- **4e:** gráfico interactivo en Claude (MCP Apps, sección 7.4).

La 4e no forma parte de la condición de «Listo cuando» de la fase 4: si se demora, la fase se cierra igual.

**Sugerencia de trabajo en Claude Code:**
- **Sesión principal en Opus:** esfuerzo high para el plan, la capa 2, `alinear.ts` y el MCP; medio para los componentes de la web.
- **Una sesión por subfase,** empezando cada una con esta SPEC y el catálogo en el contexto.
- **Para la 4e:** el plugin oficial de MCP Apps para Claude Code (`modelcontextprotocol/ext-apps`) trae instrucciones para agregar una interfaz a un servidor existente.

**Subagentes** (`.claude/agents/`, todos en Sonnet). Hay uno por cada tipo de tarea que necesita contexto limpio, o un informe con cifras y errores literales. Una tarea que solo cambia de objeto no lleva un subagente nuevo. Devuelven resúmenes, pero citan literal los errores y las diferencias numéricas.

| Subagente | Tarea | Cuándo |
|---|---|---|
| `explorador` | Ubica código y convenciones del repo, y resume sin pegar archivos. | Todas las fases |
| `tester` | Corre las pruebas y devuelve los fallos literales. | Todas las fases |
| `revisor-datos` | Recalcula los casos con un script propio, sin leer la implementación (en la 4c/4d: alineación, frecuencia común, medidas), y compara las cifras. | Siempre que Vaivén calcule algo nuevo (sección 10) |
| `revisor-visual` | Captura y revisa las vistas: doble eje, paneles, sombreado, modo oscuro, celular, exportaciones y, en la 4e, el gráfico dentro de Claude. | Cuando cambia la web o la 4e |
| `probador-mcp` | **Nuevo.** Usa el MCP local solo a través de sus herramientas (`tools:` limitado al servidor local de `.mcp.json`), sin ver el código. Contesta un juego de preguntas e informa si eligió bien la herramienta y los parámetros, y dónde lo confundieron las descripciones. No reemplaza la prueba ciega manual antes del despliegue. | 4d, 4e y cada cambio del MCP |
| `verificador-fuentes` | Contrasta cifras con las fuentes originales. | Fase 5 (series B). En la 4c–4e no hay fuentes nuevas, así que queda sin uso. |

Para el `probador-mcp`, el repo suma un `.mcp.json` con el servidor local por stdio, que lee el export del repo. Así funciona también en las sesiones en la nube.

---

## §12 · Riesgos · AGREGA dos filas

| Riesgo | Mitigación |
|---|---|
| El soporte de MCP Apps varía entre clientes y la extensión puede cambiar | Es opcional: sin ella, el resultado en texto está completo. Se prueba en cada actualización del SDK, como el resto del MCP. |
| El doble eje (por defecto con dos unidades) sugiere relaciones que no existen | Aviso fijo, ceros alineados cuando corresponde, botón «Ver en paneles» junto al gráfico y paneles obligatorios con tres o más unidades. |

---

## Historial de versiones · AGREGA

- **v1.6 (13/11/2026):** comparación de series y gráfico interactivo en el MCP:
  - módulo de alineación compartido; doble eje por defecto con dos unidades y paneles con más (o a pedido); frecuencia común (4.1);
  - explorador con hasta 4 series: URL indexada compatible con la 4b, colores por serie, tooltip común y exportación en formato largo y ancho (6.1 y 6.2);
  - celular y texto alternativo por panel (6.5);
  - `comparar_series` con `series[]` y `alinear`, y `especificacion_grafico` con `structuredContent` (7.2);
  - CPU de `especificacion_grafico` (7.3) y gráfico interactivo con MCP Apps (7.4);
  - pruebas (10); subfases 4c/4d y 4e, subagentes en Sonnet y nuevo `probador-mcp` (11 y 5.4); riesgos (12).
