# Prueba manual del MCP desde Claude

*Fase 3 · Se repite en cada actualización del protocolo o del SDK (SPEC 10). Los valores esperados salen del export del 24/10/2026; si los datos se actualizan, pueden cambiar los últimos valores, no los históricos.*

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
| 1 | ¿Qué series tiene Vaivén sobre el mercado de trabajo? | `buscar_series` | La tasa de desocupación (TRA-01), con las variantes total urbano y GBA publicadas y la empalmada pendiente. Que aclare que hay 5 de las 39 series publicadas. |
| 2 | ¿Cuál fue la inflación interanual de diciembre de 2023 según Vaivén? Citá la fuente. | `obtener_serie` (IPC, `var_interanual`) | **211,4 %**. La cita: «Vaivén (2026). Inflación minorista (IPC), variante «oficial». Versión de datos 2026-10-24. https://vaiven.argentino.workers.dev/series/ipc/ Transformación: variación interanual (%) (calculada por Vaivén).» |
| 3 | ¿Cómo evolucionó la desocupación entre 2001 y 2004? | `obtener_serie` (desocupación) | Sube de 16,4 % (mayo de 2001) a **21,5 % (mayo de 2002)** y baja a 12,0 % (4.º trimestre de 2004). Tiene que avisar el **cambio de la EPH en 2003** (puntual → continua, no comparables), el cambio de frecuencia (semestral → trimestral) y que desde 2002 los planes con contraprestación cuentan como ocupación. |
| 4 | ¿Cuánto eran las reservas internacionales en marzo de 1979? | `obtener_serie` (reservas) | **No hay dato**: está excluido porque la fuente publica 675,8, entre 6.282,9 (febrero) y 7.270,3 (abril). No tiene que inventar ni interpolar un valor. Puede decir que son reservas brutas. |
| 5 | Quiero la inflación según Cavallo y Bertolotto. | `describir_serie` u `obtener_serie` | La variante está **pendiente de licencia**: no tiene datos publicados. Puede ofrecer las variantes oficial y provincias. |
| 6 | ¿Cuánta inflación hubo en 2013? ¿Es confiable el dato? | `obtener_serie` (`var_dic_dic`), quizás `describir_serie` | Oficial: **10,9 %**. Tiene que avisar la **intervención del INDEC (2007–2015)** y puede ofrecer la variante «provincias» (San Luis y CABA): **26,6 %**. |
| 7 | ¿Cuál fue la desocupación promedio de 2003? | `obtener_serie` (frecuencia anual) | **No hay promedio anual de 2003**, porque el año mezcla una onda de la EPH puntual (mayo: 15,6 %) con dos trimestres de la continua (16,1 % y 14,4 %). Puede dar esos valores sueltos con la advertencia. |
| 8 | Dame la cita en BibTeX de las reservas internacionales. | `citar` | Igual a la de la ficha (`/series/reservas/`): `@misc{vaiven_reservas_brutas_20261024,` … `author = {{Vaivén}},` … `url = {https://vaiven.argentino.workers.dev/series/reservas/}`. |
| 9 | ¿Qué bibliografía usa la serie de desocupación? | `describir_serie` | **OS2006-G3**: Ortiz y Schorr (2006), «La economía política del gobierno de Alfonsín…», gráfico de la p. 26 (desocupación y subocupación, 1980–1989). |
| 10 | ¿A cuánto estaba el dólar oficial en abril de 2026? ¿Y en enero de 1975, en pesos actuales? | `buscar_series`, `obtener_serie` (tipo de cambio, variante `pesos-actuales`) | Abril de 2026: **1.381,1 pesos por dólar** (fin de mes, BCRA). Enero de 1975: **9,98 × 10⁻¹¹ pesos actuales**. Tiene que aclarar que «pesos actuales» es la equivalencia de los signos monetarios, **no un ajuste por inflación**, y avisar los mercados desdoblados (1971–1989). En moneda de época son 9,98 pesos ley 18.188. |

## 3. Qué anotar
- Cliente (web o escritorio), fecha y versión de datos que muestran las respuestas.
- Para cada pregunta: bien, mal o a medias, y por qué (herramienta equivocada, dato distinto, faltó la advertencia o la cita).
- Si Claude no encuentra el conector, si da error al conectar o si alguna respuesta tarda más de unos segundos.
