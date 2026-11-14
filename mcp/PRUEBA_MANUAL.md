# Prueba manual del MCP desde Claude

*Fase 3. Versiones: 05/11/2026 (fase 4a), 07/11/2026 (segunda revisión de la 4a), 12/11/2026 (períodos y episodios de la 4b, preguntas 14 a 18), 13/11/2026 (cierre de la 4b: tres fases de la hiperinflación y advertencias obligatorias en las preguntas 16 y 17) y 14/11/2026 (comparación de series de la 4c/4d, preguntas 19 a 24, y el salario nominal en la pregunta 12) · Se repite en cada actualización del protocolo o del SDK (SPEC 10) y antes de cada despliegue de fase. Los valores esperados de las preguntas 1 a 13 salen del export del 07/11/2026; si los datos se actualizan, pueden cambiar los últimos valores y la fecha de la versión de datos, no los históricos.*

**Usá siempre la versión de `main` en GitHub, no una copia local:** <https://github.com/vaiven-argentino/vaiven/blob/main/mcp/PRUEBA_MANUAL.md>.

## 1. Agregar el conector
**Claude web (claude.ai):**
1. **Personalizar → Conectores** (en inglés, *Customize → Connectors*).
2. **+ Agregar → Agregar conector personalizado** (*Add custom connector*).
3. Nombre: `Vaivén`. URL: `https://vaiven.argentino.workers.dev/mcp`. **Continuar**.
4. Autenticación: **sin inicio de sesión** (*No sign in*). **Agregar**.

**Claude escritorio:** se usa el mismo conector de la cuenta (aparece solo). Si no aparece, se agrega igual, desde **Personalizar → Conectores**.

**En cada conversación:** botón **+** (abajo a la izquierda) → **Conectores** → activar **Vaivén**. Conviene probar en una conversación nueva y con los demás conectores apagados, para ver si Claude elige bien las herramientas.

**Variante local (opcional, solo escritorio):** desde una copia del repositorio, `npm ci` y `npm run empaquetar -w @vaiven/mcp`; después, en `claude_desktop_config.json`:
```json
{ "mcpServers": { "vaiven": { "command": "node", "args": ["/ruta/a/vaiven/mcp/dist/vaiven-mcp.mjs"] } } }
```

## 2. Preguntas y respuestas esperadas
Para cada pregunta, anotá: qué herramientas usó Claude (se ven al desplegar la llamada), si el dato coincide y si mencionó las advertencias y la cita.

| # | Pregunta | Herramientas esperadas | Respuesta esperada |
|---|---|---|---|
| 1 | ¿Qué series tiene Vaivén sobre el mercado de trabajo? | `buscar_series` | La tasa de desocupación (TRA-01), con las variantes total urbano y GBA publicadas y la empalmada pendiente. Puede sumar el salario real (TRA-03). Que aclare que hay 22 de las 39 series publicadas. |
| 2 | ¿Cuál fue la inflación interanual de diciembre de 2023 según Vaivén? Citá la fuente. | `obtener_serie` (IPC, `var_interanual`) | **211,4 %**. La cita: «Vaivén (2026). Inflación minorista (IPC), variante «oficial». Versión de datos AAAA-MM-DD. https://vaiven.argentino.workers.dev/series/ipc/ Transformación: variación interanual (%) (calculada por Vaivén).» |
| 3 | ¿Cómo evolucionó la desocupación entre 2001 y 2004? | `obtener_serie` (desocupación) | Sube de 16,4 % (mayo de 2001) a **21,5 % (mayo de 2002)** y baja a 12,0 % (4.º trimestre de 2004). Tiene que avisar el **cambio de la EPH en 2003** (puntual → continua, no comparables), el cambio de frecuencia (semestral → trimestral) y que desde 2002 los planes con contraprestación cuentan como ocupación. |
| 4 | ¿Cuánto eran las reservas internacionales en marzo de 1979? | `obtener_serie` (reservas) | **No hay dato**: está excluido porque la fuente publica 675,8, entre 6.282,9 (febrero) y 7.270,3 (abril). No tiene que inventar ni interpolar un valor. Puede decir que son reservas brutas. |
| 5 | Quiero la inflación según Cavallo y Bertolotto. | `describir_serie` u `obtener_serie` | La variante está **pendiente de licencia**: no tiene datos publicados. Puede ofrecer las variantes oficial y provincias. |
| 6 | ¿Cuánta inflación hubo en 2013? ¿Es confiable el dato? | `obtener_serie` (`var_dic_dic`), quizás `describir_serie` | Oficial: **10,9 %**. Tiene que avisar la **intervención del INDEC (2007–2015)** y puede ofrecer la variante «provincias» (San Luis y CABA): **26,6 %**. |
| 7 | ¿Cuál fue la desocupación promedio de 2003? | `obtener_serie` (frecuencia anual) | **No hay promedio anual de 2003**, porque el año mezcla una onda de la EPH puntual (mayo: 15,6 %) con dos trimestres de la continua (16,1 % y 14,4 %). Puede dar esos valores sueltos con la advertencia. |
| 8 | Dame la cita en BibTeX de las reservas internacionales. | `citar` | Igual a la de la ficha (`/series/reservas/`): `@misc{vaiven_reservas_brutas_AAAAMMDD,` … `author = {{Vaivén}},` … `url = {https://vaiven.argentino.workers.dev/series/reservas/}`. |
| 9 | ¿Cuál es el último dato de reservas que tiene Vaivén? | `obtener_serie` (reservas) | **Agosto de 2026: 48.259 millones de US$** (saldo del 31/08; último dato, `ultimo_dato`). Tiene que aclarar que mayo–agosto de 2026 salen de la serie diaria del BCRA y son provisorios hasta que llegue la mensual (advertencia `q.reservas.tramo-diario`), y no presentarlo como el dato de hoy. Si menciona `atraso`, que lo explique como atraso de la copia de datos.gob.ar. |
| 10 | ¿A cuánto estaba el dólar oficial en abril de 2026? ¿Y en enero de 1975, en pesos actuales? | `buscar_series`, `obtener_serie` (tipo de cambio, variante `pesos-actuales`) | Abril de 2026: **1.381,1 pesos por dólar** (fin de mes, BCRA). Si pregunta por el último dato: agosto de 2026, 1.509,5 (de la serie diaria, provisorio). Enero de 1975: **9,98 × 10⁻¹¹ pesos actuales**. Tiene que aclarar que «pesos actuales» es la equivalencia de los signos monetarios, **no un ajuste por inflación**, y avisar los mercados desdoblados (1971–1989). En moneda de época son 9,98 pesos ley 18.188. |
| 11 | ¿Cuánto fue el déficit de cuenta corriente de 1980 en % del PIB? | `obtener_serie` (cuenta corriente, `medida: pct_pib`), quizás `describir_serie` | Con el PIB publicado en cada base (por defecto): **−2,3 %**. Con el PIB en dólares del Banco Mundial (`denominador: banco-mundial`): **−6,2 %**. Tiene que explicar que la diferencia es el tipo de cambio de la «tablita»: el Banco Mundial convierte con un factor alternativo (q.pib-dolares.banco-mundial). |
| 12 | ¿Cuánto cayó el salario real entre diciembre de 2017 y diciembre de 2024? | `obtener_serie` (salario real, RIPTE, `medida: real`) | A precios de 2017: de **23.791,6** a **17.649,5** pesos, una caída de **25,8 %** (RIPTE, deflactado con el IPC oficial). Tiene que aclarar que es el salario de los trabajadores registrados y qué IPC usó. **Sin `medida: real`, el servidor responde el salario nominal** (la unidad dice «salario nominal» y la primera nota lo explica): Claude tiene que pedir `medida: real` o aclararlo. Si informa una suba del salario (el nominal subió más de 4.000 %), la respuesta está **mal**. |
| 13 | Compará el crecimiento de la Argentina y Brasil entre 2001 y 2011. | `obtener_serie` (crecimiento del PIB, `paises`, `indice_desde_tasas`) | Con 2001 = 100, en 2011 la Argentina llega a **154,9** y Brasil a **147,2**: la Argentina cae más en 2002 (89,1) y crece más después. Datos del Banco Mundial; la cita nombra «Países: Argentina y Brasil». |
| 14 | ¿Quién era ministro de Economía y qué régimen cambiario regía cuando empezó el Plan Austral? | `periodo_en_fecha` (quizás antes `listar_periodos` con `tipo: plan`) | El plan rige desde el **15/6/1985** (anunciado el 14). Gobierno de **Alfonsín**, ministro **Juan Vital Sourrouille**, régimen **tipo fijo del Plan Austral** (hasta abril de 1986) y etapa «Período Sourrouille: Plan Austral e hiperinflación». Que dé las fuentes que trae la respuesta. |
| 15 | ¿Cuántos presidentes hubo en diciembre de 2001? | `periodo_en_fecha` (`fecha: 2001-12`) | **Cuatro**: De la Rúa (hasta el 21/12), Puerta (21 al 23/12), Rodríguez Saá (23 al 30/12) y Camaño (desde el 30/12). Duhalde asume el **2/1/2002**. Puede sumar los eventos del mes: el corralito (1/12) y el anuncio de la suspensión de pagos (23/12). |
| 16 | ¿Cómo fue la inflación mensual durante el Plan Bunge y Born? | `listar_periodos` (`tipo: plan`) y `obtener_serie` (IPC, `var_mensual`) | El plan va del **10/7/1989 al 12/12/1989**. IPC oficial: **196,6 %** en julio, 37,9 % en agosto, 9,4 % en septiembre, 5,6 % en octubre, 6,5 % en noviembre y 40,1 % en diciembre. Que no use fechas de memoria. **Advertencia obligatoria:** el fin del plan es un **corte convencional de Vaivén** (el abandono del tipo fijo), no un hecho fechado que dé la fuente; si no lo dice, la respuesta está a medias. |
| 17 | ¿Cuándo hubo hiperinflación en la Argentina y a qué gobierno se le asigna el dato de julio de 1989? | `listar_periodos` (`tipo: episodio`) y `periodo_en_fecha` (`fecha: 1989-07`) | Un episodio, **del 6/2/1989 al 1/4/1990**, en **tres fases**: primer brote (6/2 al 1/8/1989), tregua del Plan Bunge y Born (1/8 al 12/12/1989) y segundo brote (12/12/1989 al 1/4/1990). Julio de 1989 se asigna a **Menem** (77 % del mes; Alfonsín, 23 %) y cae en el **primer brote** (`asignacion.episodio`); las reservas a fin de julio, también a Menem. **Advertencias obligatorias:** el criterio de Cagan de la nota (más de 50 % mensual: mayo–julio de 1989 y enero–marzo de 1990, un solo episodio al pie de la letra) y que el inicio del episodio tiene **confianza media**; si falta alguna, la respuesta está a medias. |
| 18 | ¿Quién era ministro de Economía el 21 de diciembre de 2001? | `periodo_en_fecha` (`fecha: 2001-12-21`) | **Jorge Capitanich**, ministro de Infraestructura e interino de Economía (Decreto 11/2001), un día; antes, Nicolás Gallo (20/12). Del 22/12/2001 al 3/1/2002 no hubo ministro de Economía. |
| 19 | Compará la inflación interanual con la variación interanual del dólar oficial en 2018 y 2019. | `comparar_series` (IPC y tipo de cambio, los dos con `var_interanual`) | Las dos son mensuales: la tabla va en **frecuencia mensual**, sin avisos de la combinación. Diciembre de 2018: inflación **47,6 %** y dólar **101,4 %**; diciembre de 2019: **53,8 %** y **58,4 %**. Que no las presente como una relación causal. |
| 20 | ¿Cómo se movieron la desocupación y el crecimiento del PIB entre 1995 y 2005? | `comparar_series` (desocupación y PIB con `var_interanual`) | Tabla **anual**, porque la EPH puntual es semestral (lo avisa `c.frecuencia-comun`). La desocupación sube de 12,8 % (1998) a **19,65 % (2002)**, con el PIB en **−10,9 %** ese año. **2003 queda sin dato** en la desocupación (mezcla una onda de la EPH puntual con dos trimestres de la continua: no se interpola). Tiene que avisar el cambio de la EPH en 2003 y que la variación del PIB es la del promedio anual (`c.variacion-promedio`). |
| 21 | Haceme un gráfico de la inflación interanual y las reservas internacionales entre 2000 y 2010. | `especificacion_grafico` | **Doble eje** (variación % interanual a la izquierda, millones de US$ a la derecha), con el aviso de que las escalas son independientes y el eje de fechas abajo (hasta la 0.2.0 faltaba con varias series). Enlace: `https://vaiven.argentino.workers.dev/explorador/?desde=2000&hasta=2010&s2=reservas`. Si el cliente no dibuja el gráfico, que dé el enlace. La especificación va en `structuredContent`; el texto trae el enlace, la disposición, las advertencias y las citas. |
| 22 | Graficá el crecimiento de la Argentina, Brasil y Estados Unidos junto con la inflación argentina, de 2000 a 2015. | `especificacion_grafico` (IPC con `var_interanual` y crecimiento del PIB con `paises`) | **Paneles** (una serie internacional junto con otra va siempre en paneles): arriba la inflación, abajo los tres países. Enlace: `…/explorador/?desde=2000&hasta=2015&s2=int-pib&p2=ARG,BRA,USA`. |
| 23 | Dame en una tabla anual la inflación interanual y las exportaciones de 2005 a 2010. | `comparar_series` | Tabla **anual**: inflación **9,6 %** en 2005 y **10,5 %** en 2010; exportaciones de 40.387 a 68.174 millones de US$. **Advertencia obligatoria:** la inflación alineada a anual es la variación del promedio anual, no el promedio de las variaciones mensuales (`c.variacion-promedio`); y, en 2007–2015, la intervención del INDEC. |
| 24 | Compará el crecimiento del PIB total y el del PIB per cápita de Brasil. | `comparar_series` → error, y después `obtener_serie` dos veces (o una comparación con una sola internacional) | `comparar_series` admite **una serie internacional como máximo**: el error lo dice. Tiene que resolverlo igual (dos llamadas a `obtener_serie` con `paises: ["BRA"]`) y no inventar la comparación. |

Para las preguntas 19 a 24, anotá además si eligió bien entre `obtener_serie`, `comparar_series` y `especificacion_grafico`, y si mencionó los avisos de la combinación (`advertencias_combinacion`).

## 3. Qué anotar
- Cliente (web o escritorio), fecha y versión de datos que muestran las respuestas.
- Si la conversación se hizo **sin pegar este manual** (la prueba ciega): Claude no tiene que ver las respuestas esperadas.
- Para cada pregunta: bien, mal o a medias, y por qué (herramienta equivocada, dato distinto, faltó la advertencia o la cita).
- Si Claude no encuentra el conector, si da error al conectar o si alguna respuesta tarda más de unos segundos.

## 4. MCP Apps (4e): la sonda en Claude web y en Claude Desktop
*14/11/2026 · Paso 0 de la 4e (NOTAS_FASE4, «4e · Gráfico interactivo en Claude»). La sonda no es el gráfico definitivo: muestra qué permite cada cliente. Versión 2, tras la primera prueba en Claude Desktop.*

**Orden de la prueba:** primero **Claude web**, que todavía no se probó. Después **Claude Desktop**, solo para verificar que Claude ya no rearma el gráfico (fila i).

**Preparación**
- **Conector de prueba:** en Claude web, **Personalizar → Conectores → + Agregar → Agregar conector personalizado**. Nombre: `Vaivén prueba`. URL: `https://prueba-4e-vaiven.argentino.workers.dev/mcp`. Sin inicio de sesión. En Claude Desktop aparece solo.
- Comprobá que `https://prueba-4e-vaiven.argentino.workers.dev/salud` diga «4e (sonda 2)». Si da `error code: 1042`, el despliegue diario apagó las URL de versión: volvé a encenderlas en Cloudflare (**Workers & Pages → vaiven → Domains → Preview**).
- **Apagá el conector `Vaivén`** (producción) y dejá activado solo `Vaivén prueba`.
- Trabajá en una **conversación nueva fuera de los proyectos**, sin archivos ni memoria del proyecto, para ver cómo usa la herramienta un Claude sin contexto.
- En Desktop, **cerrá la app del todo** (Cmd+Q) antes de probar, porque guarda los recursos en caché.

**Pedidos**
1. «Haceme un gráfico de la inflación interanual y las reservas internacionales entre 2000 y 2010».
2. «Graficá la inflación interanual, la variación interanual del dólar oficial, la base monetaria y las reservas entre 2000 y septiembre de 2020, con los gobiernos sombreados y los eventos». Es el caso de 996 observaciones y unos 124.000 caracteres, el más grande que admite la herramienta.
3. **Modo oscuro:** con la sonda del pedido 1 a la vista, pasá Claude a modo oscuro y mirá si cambia la fila «Tema del host». No repitas el pedido: Claude puede no volver a llamar a la herramienta.
4. **Una serie larga, por encima del umbral de Claude:** «Graficá las reservas internacionales», sin período. Con toda la historia, el resultado tiene unos 185.000 caracteres, más que los ~150.000 a partir de los cuales Claude puede guardar el resultado en un archivo en lugar de pasárselo a la app. Anotá si la app recibe la especificación (fila g, en verde, con unos 185.000 caracteres) o si dice que no llegó, y si Claude menciona que guardó el resultado en un archivo. Con esto se decide el tope por tamaño (NOTAS_FASE4, M11).

**Qué anotar:** la sonda lo muestra en una tabla, en verde o en naranja. Al terminar cada pedido, tocá **«Copiar resultados»** y pegá el JSON en tus notas. Si el cliente no da permiso de portapapeles, el JSON aparece abajo, seleccionado: copialo con Cmd+C.

| # | Fila de la sonda o qué mirar | Qué se quiere saber |
|---|---|---|
| a | (que aparezca) «Hola: la sonda de Vaivén se cargó (sonda 2)» | Si Claude muestra la app. Si no aparece nada, anotá si la llamada a `especificacion_grafico` dio error. |
| b | Script externo (`…/mcp-app/sonda.js`) | **Cargó** o **no cargó**: si Claude acepta el dominio de Vaivén en la CSP. Es lo más importante de Claude web. |
| c | `unsafe-eval` | **Permitido** o **bloqueado**. |
| d | Vega con intérprete / sin intérprete / «SVG con y sin intérprete (sin los id internos)» | Cuál de los dos gráficos se dibujó y si dan el mismo SVG (en el host de prueba local, «iguales»). |
| e | Tema del host | `light` o `dark`, y si cambia en el pedido 3. |
| f | Capacidades del host, `downloadFile`, `openLinks`, `serverTools` y `updateModelContext` | Qué ofrece el cliente. |
| g | Resultado recibido y `structuredContent` (pedidos 2 y 4) | Si la app recibe la especificación entera: unos 124.000 caracteres en el pedido 2 y unos 185.000 en el 4. |
| h | Botones | **«Ver desde …»** corre el inicio diez años para atrás y lo dice en el botón. En el pedido 1 se tiene que dibujar el período nuevo («Otro período: resultado», en verde). En el pedido 2 se espera **un error por el límite de 1.000 observaciones**: la app lo muestra en «Otro período: structuredContent» y el gráfico no cambia. **«Descargar SVG»**, **«Descargar PNG»** y **«Abrir en el explorador»** piden confirmación. |
| i | «Aviso al modelo (updateModelContext)» y **la respuesta de Claude** | Si el aviso dice «enviado» y si Claude, además de la app, **dibujó su propio gráfico o volvió a pedir los datos** con `comparar_series` u `obtener_serie`. Si lo hizo, la respuesta está **mal** (hallazgo A1). |
| j | Lista «Eventos» debajo del gráfico (pedido 2) | Si se ve la lista con letra, fecha y nombre (17 eventos). |

**Consola de desarrollo:** abrila **antes** de recargar la conversación, así registra la carga de la app:
- **Claude Desktop:** **Help → Troubleshooting → Enable Developer Mode**, y después `Cmd + Option + I`;
- **Claude web:** las herramientas de desarrollo del navegador (`Cmd + Option + I` en Chrome).

Recargá la conversación con la consola abierta y guardá el registro con clic derecho en la consola → **Save as…**. Lo que importa son los «Refused to load» o «Refused to execute» (CSP) y cualquier error de la app.

Se pueden ignorar:
- **Avisos del host:**
  - `Unrecognized Content-Security-Policy directive 'webrtc'`;
  - los de `Permissions-Policy`;
  - `MaxListenersExceededWarning`;
  - `[MCP Apps] … handler replaced`;
  - `[BrowserSSETransport] Dropping …`;
  - el 404 del ícono de `argentino.workers.dev` que Claude pide a `gstatic.com`.
- **Avisos de Vega ya conocidos:** `Conflicting scale property "domain"` y `Infinite extent for field "data"`. Salen del armado que comparten el explorador y el MCP, no impiden el dibujo y están anotados como pendientes generales.

**Si la app no aparece:** comprobá que `/salud` responde bien. Un error 1102 en el recurso sería la CPU del plan gratuito, no la CSP.
