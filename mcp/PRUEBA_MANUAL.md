# Prueba manual del MCP desde Claude

*Fase 3, actualizada para la 4a (05/11/2026) y para la segunda revisión de la 4a (07/11/2026) · Se repite en cada actualización del protocolo o del SDK (SPEC 10) y antes de cada despliegue de fase. Los valores esperados salen del export del 07/11/2026; si los datos se actualizan, pueden cambiar los últimos valores y la fecha de la versión de datos, no los históricos.*

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
| 12 | ¿Cuánto cayó el salario real entre diciembre de 2017 y diciembre de 2024? | `obtener_serie` (salario real, RIPTE, `medida: real`) | A precios de 2017: de **23.791,6** a **17.649,5** pesos, una caída de **25,8 %** (RIPTE, deflactado con el IPC oficial). Tiene que aclarar que es el salario de los trabajadores registrados y qué IPC usó. |
| 13 | Compará el crecimiento de la Argentina y Brasil entre 2001 y 2011. | `obtener_serie` (crecimiento del PIB, `paises`, `indice_desde_tasas`) | Con 2001 = 100, en 2011 la Argentina llega a **154,9** y Brasil a **147,2**: la Argentina cae más en 2002 (89,1) y crece más después. Datos del Banco Mundial; la cita nombra «Países: Argentina y Brasil». |
| 14 | ¿Quién era ministro de Economía y qué régimen cambiario regía cuando empezó el Plan Austral? | `periodo_en_fecha` (quizás antes `listar_periodos` con `tipo: plan`) | El plan rige desde el **15/6/1985** (anunciado el 14). Gobierno de **Alfonsín**, ministro **Juan Vital Sourrouille**, régimen **tipo fijo del Plan Austral** (hasta abril de 1986) y etapa «Período Sourrouille: Plan Austral e hiperinflación». Que dé las fuentes que trae la respuesta. |
| 15 | ¿Cuántos presidentes hubo en diciembre de 2001? | `periodo_en_fecha` (`fecha: 2001-12`) | **Cuatro**: De la Rúa (hasta el 21/12), Puerta (21 al 23/12), Rodríguez Saá (23 al 30/12) y Camaño (desde el 30/12). Duhalde asume el **2/1/2002**. Puede sumar los eventos del mes: el corralito (1/12) y el anuncio de la suspensión de pagos (23/12). |
| 16 | ¿Cómo fue la inflación mensual durante el Plan Bunge y Born? | `listar_periodos` (`tipo: plan`) y `obtener_serie` (IPC, `var_mensual`) | El plan va del **10/7/1989 al 12/12/1989** (fin convencional: abandono del tipo fijo, que la respuesta tiene que avisar como corte de Vaivén). IPC oficial: **196,6 %** en julio, 37,9 % en agosto, 9,4 % en septiembre, 5,6 % en octubre, 6,5 % en noviembre y 40,1 % en diciembre. Que no use fechas de memoria. |

## 3. Qué anotar
- Cliente (web o escritorio), fecha y versión de datos que muestran las respuestas.
- Para cada pregunta: bien, mal o a medias, y por qué (herramienta equivocada, dato distinto, faltó la advertencia o la cita).
- Si Claude no encuentra el conector, si da error al conectar o si alguna respuesta tarda más de unos segundos.
