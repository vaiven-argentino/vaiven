# Prueba manual del MCP desde Claude

*Fase 3. Versiones: 05/11/2026 (fase 4a), 07/11/2026 (segunda revisión de la 4a), 12/11/2026 (períodos y episodios de la 4b, preguntas 14 a 18), 13/11/2026 (cierre de la 4b: tres fases de la hiperinflación y advertencias obligatorias en las preguntas 16 y 17), 14/11/2026 (comparación de series de la 4c/4d, preguntas 19 a 24, y el salario nominal en la pregunta 12) y 15/11/2026 (gráfico interactivo de la 4e, sección 4) · Se repite en cada actualización del protocolo o del SDK (SPEC 10) y antes de cada despliegue de fase. Los valores esperados de las preguntas 1 a 13 salen del export del 07/11/2026; si los datos se actualizan, pueden cambiar los últimos valores y la fecha de la versión de datos, no los históricos.*

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

## 4. MCP Apps (4e): el gráfico interactivo en Claude web y en Claude Desktop
*15/11/2026, actualizada con las correcciones de la sonda 3 · Interfaz definitiva de `ui://vaiven/grafico` (NOTAS_FASE4, «4e · Gráfico interactivo en Claude»). Reemplaza la prueba de la sonda. Primero en la URL de versión (`prueba-4e`) y, después del despliegue de la 4e, en producción.*

**Preparación**
- **Conector:** antes del despliegue, `Vaivén prueba` con `https://prueba-4e-vaiven.argentino.workers.dev/mcp` (sección 1, sin inicio de sesión); después, el conector `Vaivén` de siempre. `/salud` tiene que decir «4e». Si la URL de versión da `error code: 1042`, el despliegue diario apagó las URL de versión: volvé a encenderlas en Cloudflare (**Workers & Pages → vaiven → Domains → Preview**).
- **Una conversación nueva fuera de los proyectos**, sin archivos ni memoria, con un solo conector de Vaivén activado. Si Claude lee la memoria del proyecto, sabe que es una prueba y responde distinto. Abrila desde el inicio de claude.ai («Nueva conversación», no desde un proyecto) y comprobá que arriba, junto al título, no aparezca el nombre de un proyecto.
- En Desktop, **cerrá la app del todo** (Cmd+Q) antes de probar: guarda los recursos en caché.
- **Consola:** abrila **antes** de recargar la conversación. En Desktop: **Help → Troubleshooting → Enable Developer Mode** y `Cmd + Option + I`; en la web, las herramientas de desarrollo del navegador. Guardá el registro con clic derecho → **Save as…**.

**Pedidos** (en Claude web y en Claude Desktop)
1. «Haceme un gráfico de la inflación interanual y las reservas internacionales entre 2000 y 2010».
2. «Graficá la inflación interanual, la variación interanual del dólar oficial, la base monetaria y las reservas entre 2000 y septiembre de 2020, con los gobiernos sombreados y los eventos».
3. «Graficá las reservas internacionales» (toda la serie, unos 100.000 caracteres). Si Claude agrega por su cuenta el sombreado o los eventos, **anotalo**: la descripción le pide usarlos solo si se piden (H5).
4. **Modo oscuro:** con el gráfico del pedido 1 a la vista, pasá Claude a modo oscuro: el gráfico se tiene que volver a pedir y quedar oscuro (fondo, ejes y líneas).

**En cada gráfico, probá:**
- **«Cambiar el gráfico»:**
  - cambiá el período (por ejemplo, «Desde» 1995);
  - cambiá la transformación de una serie;
  - poné el sombreado de gobiernos;
  - marcá «Eventos» y, con dos unidades, «En paneles»; en un gráfico de un solo eje con varias series, «Leyenda arriba» (en el doble eje la leyenda va siempre y la casilla no aparece).

  Cada cambio redibuja el gráfico. En el pedido 2, «Desde» 1990 tiene que dar el **error del límite de 1.000 observaciones**, en naranja, y el gráfico no tiene que cambiar.
- **«PNG» y «SVG»:** piden confirmación y bajan la imagen de 900 px con título y pie (fuentes, licencia, versión de datos y enlace). El nombre del archivo lleva las series y el período (por ejemplo, `vaiven_ipc_y_reservas_2000_2010.png`).
- **«Abrir en el explorador»:** pide confirmación y abre la misma vista.
- **«Pantalla completa»**, si aparece.
- Los desplegables **«Advertencias»** (los quiebres ①②③ numerados desde 1, las advertencias generales sin número, el aviso del doble eje, los datos excluidos «×» y los episodios), **«Eventos»** (letra, fecha y nombre) y **«Fuentes y cita»**.
- **Pasá el cursor** por un número en círculo, por una barra de quiebre, por una letra de evento y por la cinta de los gobiernos: cada uno muestra su texto.

**Qué anotar**

| # | Qué mirar | Bien si… |
|---|---|---|
| a | El gráfico aparece | Sin errores; los números con punto de miles («50.000»). |
| b | La respuesta de Claude | **No dibuja su propio gráfico ni vuelve a pedir los datos** para graficar: comenta la disposición, las advertencias y las citas. Si lo hace, está **mal** (A1). |
| c | Cómo se identifican las series | Por su nombre corto, nunca por número («IPC oficial», «IPC provincias», «Reservas»): en un eje o en paneles, al final de cada línea; en el doble eje, en una leyenda arriba, una serie por renglón con su eje. La variante «provincias», con trazo discontinuo. |
| d | Los títulos | La cabecera: las variables en el título, más grande; el período y la disposición debajo; y una serie por renglón con su trazo, su variante, su unidad y su eje o panel. Cada eje dice su serie y su unidad («Reservas · millones de US$»); «millones de pesos actuales (sin ajuste por inflación)»; la escala logarítmica, en la lista de la cabecera. |
| e | El modo oscuro (pedido 4) | El gráfico entero pasa a oscuro, no solo el fondo de la interfaz. |
| f | Los controles y el error | Cada cambio redibuja; el error se lee y no cambia el gráfico. |
| g | Las descargas | El archivo tiene título, pie y el nombre de la vista. |
| h | El alto | Sin barra de desplazamiento interna con los desplegables cerrados (M9). |
| j | En el celular (o con la ventana de Claude angosta) | El gráfico se vuelve a armar para ese ancho: el doble eje pasa a paneles (la casilla dice «Doble eje» para pedirlo) y el texto se lee. Al girar el celular, se rearma. |
| i | La consola | Sin «Refused to load» ni «Refused to execute». |
| k | La lectura del gráfico | Los gobiernos, en una cinta entre el gráfico y los años, con su nombre adentro (o las iniciales); los eventos, con una letra en un círculo arriba (los muy juntos, agrupados: «I–J»); cada quiebre largo en su renglón, con su número y en el color de su serie; debajo del gráfico, una línea que dice a qué remiten los números y las letras. Nada se pisa. |

**Avisos de la consola que se pueden ignorar** (no son de Vaivén):
- `Unrecognized Content-Security-Policy directive 'webrtc'`;
- los de `Permissions-Policy` y `focus-without-user-activation`;
- `MaxListenersExceededWarning`;
- `[MCP Apps] … handler replaced`;
- `[BrowserSSETransport] Dropping …`;
- `[MCP] fsr taken held` y `[MCP] fsr dropped closed`;
- `Blocked script execution in 'about:srcdoc' … 'allow-scripts' permission is not set` (marcos propios de claude.ai);
- `net::ERR_BLOCKED_BY_CONTENT_BLOCKER` (un bloqueador de contenido del navegador);
- el 404 del ícono de `argentino.workers.dev` que Claude pide a `gstatic.com`.

Mandá **las capturas como imágenes adjuntas en el mismo mensaje que los resultados** (no enlaces a una app de notas ni en mensajes aparte), al menos una en modo oscuro y una en el celular o con la ventana angosta, y el registro de la consola si aparece algo de Vaivén.
