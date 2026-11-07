# Vaivén · Notas de la fase 4 (catálogo completo)

*Decisiones tomadas durante la fase 4, diferencias con la SPEC y pendientes, por subfase. Lo que acá figura como «a consultar» no se resolvió por cuenta propia (CLAUDE.md).*

## 4a · Datos del núcleo

*27/10/2026 · Las 20 series de prioridad A, INT-01 e INT-02, las auxiliares de la SPEC 2.6 y las medidas de la SPEC 4 en la librería, la ficha y el MCP. Las fuentes se consultaron entre el 24 y el 27/10/2026.*

### Qué quedó publicado

★ = variante por defecto · * = pendiente de licencia.

| Serie | Variantes publicadas (cobertura) | Pendientes |
|---|---|---|
| ACT-01 `pib` | ★`retropolada` (1970-T1–2026-T2) | `niveles` |
| ACT-03 `inversion` | ★`retropolada` (1993-T1–2026-T2), `base-1970` (1970-T1–1990-T4), `pct-pib-corrientes` (1993-T1–2026-T2) | `pct-pib-constantes` |
| CAM-01 `tc-oficial` | ★`pesos-actuales`, `moneda-de-epoca` (1970-01–2026-04) | `comercial` |
| CAM-03 `tcr-multilateral` | ★`bcra` (1991-01–2024-12), `bruegel` (1970-01–2026-09) | `ipc-alternativo`, `reconstruccion` |
| CAM-04 `tcr-bilateral` | ★`oficial`, `provincias` (1970-01–2026-04) | — |
| EXT-01 `exportaciones` | ★`oficial` (1970–2025), `mensual` (1992-01–2026-08) | `dolares-constantes` |
| EXT-02 `importaciones` | ★`oficial` (1970–2025), `mensual` (1992-01–2026-08) | — |
| EXT-03 `saldo-comercial` | ★`oficial` (1970–2025), `mensual` (1992-01–2026-08) | — |
| EXT-04 `cuenta-corriente` | ★`larga` (1970–2025), `mbp5` (1992–2016), `mbp6` (2006-T1–2026-T2) | — |
| EXT-06 `reservas` | ★`brutas` (1970-01–2026-04) | `netas` |
| EXT-07 `deuda-externa` | ★`total`, `publica`, `privada` (1970–2024), `indec-1991-2001` (1991–2001), `indec` (2006-T1–2024-T2) | — |
| EXT-08 `fuga` | ★`fae` (2003-01–2026-08), `activos-externos` (1991–2024), `variacion-activos` (1992–2024) | `residual` |
| FIS-01 `resultado-fiscal` | ★`primario`, `financiero` (1993-01–2026-08), `financiero-devengado`, `primario-devengado` (1970–1992) | — |
| FIS-04 `deuda-publica` | ★`externa-bm` (1970–2024) | `finanzas`*, `fmi`* |
| INT-01 `int-pib` | ★`banco-mundial` (1961–2025, 19 países y agregados) | — |
| INT-02 `int-pib-per-capita` | ★`banco-mundial` (1961–2025, 19 países y agregados) | — |
| MON-01 `base-monetaria` | ★`fin-de-mes` (1970-01–2026-04), `promedio-mensual` (2003-01–2026-08) | — |
| MON-02 `agregados` | ★`m1` (1970-01–2026-04), `m2-pesos`, `m2-total`, `m3-total` (1970-01–2021-05), `m2-privado` (2009-06–2026-08) | — |
| MON-03 `tasa-pasiva` | ★`plazo-fijo` (1970-01–2026-04), `badlar` (1999-01–2026-08) | `real` |
| PRE-01 `ipc` | ★`oficial`, `provincias` (1970-01–2026-08) | `cavallo-bertolotto`* |
| TRA-01 `desocupacion` | ★`total-urbano`, `gba` (1974-05–2026-04) | `empalmada` |
| TRA-03 `salario-real` | ★`ripte` (1994-07–2026-07), `indice-salarios` (2001-10–2026-07) | `iso`, `industria-historica` |

**Auxiliares** (`metadatos/auxiliares/`, fuera del catálogo, en `export/auxiliares/` y en `auxiliares.json`): AUX-01 `pib-nominal` (anual y trimestral), AUX-02 `pib-dolares` (anual y trimestral), AUX-03 `poblacion` (Banco Mundial; en 4a no la usa ninguna transformación), AUX-04 `ipc-eeuu` (OCDE) y AUX-05 `signos-monetarios`.

**Librería:** `real`, `en_dolares`, `pct_pib`, `pesos_actuales` e `indice_desde_tasas`, más la dimensión pais (`serieDeEntidad`, `transformarEntidades`). Llegan a la ficha (selectores de medida, IPC, pesos actuales y país, y vista inicial) y al MCP (parámetros de `obtener_serie` y `citar`).

### Decisiones tomadas con Camilo

| Tema | Decisión |
|---|---|
| Esquema | Todo el export pasa a **1.2**. El 1.1 sigue publicado en `/esquemas/` y la web, el MCP y la librería leen las dos versiones (un ejemplo 1.1 fijo en las pruebas). |
| Alcance | Las transformaciones nuevas llegan a la librería, a la ficha y al MCP. En el MCP van como parámetros de `obtener_serie`, que la SPEC 7.2 ya define; no se suman herramientas. |
| Orden de las transformaciones | pesos actuales → frecuencia → real / en dólares / % del PIB → base 100, variación o índice desde tasas → media móvil → período. |
| PIB nominal (AUX-01) | Retropolado desde la base 2004: tasas de variación de la base 1993 para 1994–2004 y del Banco Mundial (NY.GDP.MKTP.CN) para 1971–1993 (así lo dice también el `metodo` del export). Desde la revisión del 05/11/2026 ya no es el de por defecto: ver «Correcciones de la revisión». |
| PIB en dólares (AUX-02) | PIB nominal en pesos actuales ÷ promedio del tipo de cambio oficial (CAM-01) del período, calculado en el pipeline. |
| IPC de EE.UU. (AUX-04) | De la OCDE (CC BY 4.0), que lo toma del BLS. 2025-10 es un hueco permitido: el BLS no relevó ese mes. |
| ACT-01 | Base 1960 para 1970–1980 (la base 1970 está vacía en la API), con aviso. |
| ACT-03 | Por defecto, `retropolada` (constantes, 1993–hoy). `base-1970` (1970–1990) aparte, sin puentear el hueco de 1991–1992. `pct-pib-corrientes`, cociente dentro de cada base. `pct-pib-constantes`, pendiente. |
| CAM-03 | BCRA desde 1991 (base 2001 encadenada a la base 2015). Aparte, Bruegel (51 socios) 1970–hoy, dado vuelta (100 ÷ valor) y sin empalmar, con aviso. |
| CAM-04 | Base diciembre de 2015 = 100, una variante por cada variante del IPC. |
| EXT-07 | Banco Mundial (IDS) por defecto, con las variantes pública y privada. Aparte, INDEC 1991–2001 derivado e INDEC 2006–hoy. No se une nada. |
| EXT-08 | FAE por defecto, stock de activos externos y su variación. La residual queda pendiente, con nota. |
| FIS-01 base caja | Primario y financiero del SPN, 1993–hoy. |
| FIS-01 devengado | Se publica con aviso, en dos variantes anuales del Sector Público Argentino (1970–1992): `financiero-devengado` (necesidad de financiamiento con el signo dado vuelta, para que un déficit sea negativo como en base caja) y `primario-devengado`. La unidad de cada tramo se infirió con el PIB y se declara con un `coeficiente` por tramo. No se une con base caja. |
| FIS-04 | Solo la deuda externa pública del Banco Mundial, con aviso. Finanzas y FMI quedan pendientes de licencia. |
| MON-01 | El promedio mensual desde 2003 se publica con la advertencia de junio de 2026, sin cortar. |
| MON-02 | Por defecto, `m1` (fin de mes, 1970–hoy, del CSV de la serie histórica). Del Panorama, `m2-pesos`, `m2-total` y `m3-total` hasta 2021-05, con aviso de cobertura parcial. `m2-privado`, promedio mensual 2009–hoy. El M2 de la serie 174 posterior a 2019-07 no se usa (quiebre sin documentar en 2019-08). |
| MON-03 | Solo la nominal; la real queda pendiente. |
| TRA-03 | RIPTE por defecto e Índice de salarios del INDEC. La ficha arranca en términos reales con el IPC oficial (`vista_inicial`). ISO e históricos quedan pendientes, con nota sobre el hueco 1976–1984. |
| FIS-01, vista inicial (28/10/2026) | La ficha arranca en % del PIB; las variantes mensuales, en frecuencia anual. En pesos actuales, la línea quedaba pegada a 0 hasta los años de alta inflación. |
| Base 2026 de la base monetaria promedio | Se publica con advertencia. |
| Yuxtaposiciones | Aprobadas: importaciones 1970–hoy, cuenta corriente 1970–hoy, resultado fiscal 1993–hoy y stock de activos externos 1991–hoy. |
| Textos del MCP (28/10/2026) | Se aprobaron los agregados de `mcp/src/textos.ts` (medidas, pesos actuales, índice desde tasas y países). |
| Prueba manual de la fase 3 | Sigue sin resultados (ver pendientes). |

### Cambios respecto del plan aprobado

- **PIB (ACT-01):** las bases se enlazan en el primer año completo de cada una (`enlace: anual`) y no en un trimestre. El enlace trimestral mezclaba la estacionalidad de bases distintas: 1981 daba −7,3 % en lugar del −5,4 % de la base 1986.
- **Validación:** `var_excepciones` permite exceptuar variaciones puntuales, cada una con su quiebre. Por ejemplo, la reforma financiera de julio de 1982 (encaje del 100 % sobre los depósitos existentes) es un salto real de +393 % en la base monetaria.
- **Regla `sin_saltos_en_signos`:** no se implementó como regla aparte. Un cambio de signo mal escalado da una variación de −99,9 % o de +99.900 %, que ya frenan `var_min` y `var_max` (−40 % y +200 % en la base monetaria y los agregados).
- **Continuidad informativa:** no se sumaron los controles del ITCRM base 2001 contra base 2015 ni del BCRA contra la MBP5. Las diferencias se midieron una vez, al armar las series (ver abajo), y quedaron en los métodos y las advertencias.
- **CAM-03, mensual del BCRA:** el promedio de la serie diaria difiere de la mensual hasta un 0,9 %. Por eso se queda la mensual, que llega a 2024-12, y se avisa.
- **CAM-03, Bruegel contra BCRA:** la correlación anual da 0,98 en 1997–2024 contra la base 2015 y 0,75 en 1992–2000 contra la base 2001 (no 0,35, como había informado el verificador). 1999 tiene el signo contrario: +2,1 % contra −11,0 %.
- **EXT-07 INDEC 1991–2001:** se deriva como pasivos externos − inversión directa − acciones (de otras entidades financieras y del sector privado no financiero). Da 39.629 millones en 1991 y 142.233 en 2000. `derivar` con `resta` pasó a ser «el primero menos la suma del resto».
- **EXT-08:** las variantes quedaron como `fae`, `activos-externos` (el stock) y `variacion-activos` (su diferencia anual, que incluye revaluaciones).
- **MCP:**
  - `obtener_serie` y `citar` suman también `pesos_actuales` (booleano), que el plan no nombraba: sin él, las variantes en moneda de cada época solo admitían el nivel.
  - `deflactor` acepta el id completo (`ipc.provincias`) o solo la variante (`provincias`).
  - `paises` admite hasta 30 códigos.
  - En las series por país, `datos` es un objeto por país, como en el export.
- **Catálogo:** `catalogo.json` suma `dimensiones`, `entidades` y `entidades_por_defecto` en las series por país, para que `buscar_series` las muestre (y busque por nombre de país) sin leer los datos.
- **Cita:** `@vaiven/cita` nombra varias entidades («entidades ARG, BRA y WLD»).

### Decisiones de diseño (revisables)

- **Medidas excluyentes:** `real`, `en_dolares` y `pct_pib` no se combinan (real seguido de % del PIB no tiene sentido). `pesos_actuales` sí se combina con ellas, porque va antes.
- **Base de la medida real:** por defecto, el último período con dato en la serie y en el IPC; con `baseReal`, un año (IPC promedio) o un mes.
- **Insumos de un período más largo que la serie:** no se usan. Un insumo con un subperíodo faltante da `null`, nunca se completa.
- **`pct_pib` en los stocks:** solo anual (valor de fin de año ÷ PIB del año).
- **`indice_desde_tasas`:** un año sin dato corta la cadena de ese lado y se avisa en `notas`.
- **Insumos a demanda:** la ficha y el MCP leen el IPC, el tipo de cambio, el PIB o los signos monetarios solo cuando se pide la medida.
- **Advertencias de las medidas:** suman los quiebres de cada insumo que cruzan el rango (por ejemplo, la intervención del INDEC al deflactar con el IPC oficial en 2007–2015).
- **Corridas parciales:** con `--series`, el catálogo, el datapackage y los insumos se arman con todos los metadatos y el export existente.
  - Se corrigió un error que dejaba sin el insumo de `pct_pib` a las variantes publicadas en corridas parciales: las auxiliares no se reconocían como tales.
  - Una prueba de contrato controla ahora que toda medida declarada traiga sus insumos.

### Diferencias con la SPEC y el catálogo

- **Orden de las transformaciones:** la SPEC 4 no ubica los pesos actuales. Van primero, para no promediar ni comparar valores en signos monetarios distintos. Las medidas son excluyentes (ver arriba).
- **Esquema 1.2:** la SPEC 2.5 describe el export sin versionar estos campos: `moneda`, `insumos`, `auxiliar`, `vista_inicial` y los de la dimensión pais se agregaron en la 1.2.
- **ACT-01:** usa la base 1960 en 1970–1980, porque la base 1970 está vacía en la API.
- **PIB nominal (AUX-01):** antes de 1993 sale de las tasas del Banco Mundial, no del INDEC.
- **IPC de EE.UU. (AUX-04):** de la OCDE; el catálogo decía BLS o FRED.
- **EXT-07:** el Banco Mundial es la variante por defecto.
- **FIS-04:** solo la deuda externa pública.
- **MON-03:** sin la tasa real.
- **TRA-03:** sin serie larga (ISO e históricos pendientes).
- **`pct_pib` de los stocks:** solo anual.
- **Auxiliares:** llevan códigos AUX-01 a AUX-05, que la SPEC 2.6 no asigna.
- **Snapshot de Bruegel:** el zip original (con xls) va a `.crudos/`, fuera de Git, por tamaño; el snapshot guarda `meta.json` con el checksum y las columnas de Argentina. Es una excepción a la regla del snapshot.
- **MON-02:** M2 y M3 solo hasta 2021-05 (Panorama); M1 hasta hoy.
- **CAM-03:** la variante del BCRA termina en 2024-12.

### Licencias

- **Se usan:** datos.gob.ar, Banco Mundial y OCDE (CC BY 4.0), y Bruegel, que permite cualquier uso con atribución y sin sugerir respaldo (no es una licencia CC formal).
- **No se usan:** la API del BCRA, FRED, el FMI, ArgenData (CC BY-NC-ND), la CEPAL ni la planilla de la Secretaría de Finanzas.

### Verificación hecha en la subfase

- `uv run pytest`: 226 pasadas y 7 salteadas (los casos de la bibliografía sin valores de referencia cargados).
- `npm test`:
  - transformaciones: 108 pruebas;
  - MCP: 49;
  - web: 16;
  - cita: 6.
- `npm run verificar` (tsc, `astro check` y tipos del Worker) sin errores.
- **Valores publicados en la librería:**
  - `indice_desde_tasas` reproduce los niveles NY.GDP.MKTP.KD del Banco Mundial (tolerancia del 0,1 %);
  - `en_dolares` da el PIB en dólares del Banco Mundial en 2004–2010 (0,5 %);
  - `real` reproduce el CAM-04 del pipeline;
  - `pesos_actuales` da la serie del BCRA en pesos equivalentes mes por mes;
  - `pct_pib` da la cuenta corriente en % del PIB del Banco Mundial (BN.CAB.XOKA.GD.ZS): dentro de 0,05 p. p. en 2006–2012 y de 0,5 p. p. en 1993–2001.
- **Casos de la bibliografía, pruebas de forma:** SCH1998c2-C8, DF1990-C1 (PIB y saldo comercial), BAS2000-G1 y CENDA2010-G5 con las series exportadas.
- **Punta a punta** (`web/scripts/punta-a-punta.mjs`, contra `wrangler dev`): las 22 series, en 390 y 1280 px. En cada una se busca, se grafica, se cambia de transformación, de medida (real con los dos IPC, en dólares, % del PIB) y de país, se bajan el CSV, el PNG y el ZIP, y se copia la cita.
- **`mcp/scripts/probar-endpoint.mjs`** contra el Worker local: las dos eras del protocolo, más dos chequeos nuevos (salario real con el IPC de provincias, que lee un insumo de `/datos/`, y el PIB de Argentina y Brasil como índice).
- **Corrida con red** sobre una copia (`--raiz`): 86 s, sin cambios en las fuentes.
- **Revisión visual** (revisor-visual, 19 páginas × 2 anchos × 2 modos = 76 vistas): el script no midió problemas (axe, desbordes, contraste del SVG, rótulos).
  - Los selectores nuevos miden 44 px de alto y no desbordan en 390 px.
  - La portada y `/series/` cuentan 22 series.
  - El salario real arranca en términos reales.
  - Las series internacionales muestran 1961–2025 con el país en la unidad.
  - Mirando las capturas, el revisor marcó dos cosas de la 4a, ya corregidas: la cita de las series internacionales mostraba el código («entidad ARG») en lugar del nombre del país, y la cabecera del salario real decía «pesos corrientes» sin aclarar que el gráfico arranca a precios constantes.
  - Lo demás que marcó va a los pendientes.

### Límites del plan gratuito (medidos el 27/10/2026)

| Qué | Medido | Límite o estimación del plan |
|---|---|---|
| Export | 2,3 MB, 143 archivos | Se estimaban 2–3 MB y unos 200 archivos |
| `catalogo.json` | 111 KB | Se estimaban unos 50 KB (pesan la bibliografía y las definiciones) |
| Descarga completa | ZIP de 188 KB, Parquet de 180 KB | Por debajo de 2 MB |
| Sitio (`web/dist`) | 7,5 MB, 216 archivos; el más grande, 834 KB | 20.000 archivos y 25 MiB por archivo |
| Bundle del Worker | 1.283 KiB (229,5 KiB comprimido); en la fase 3, 1.259 KiB | 64 MiB |
| `actualizar` con red | 86 s en total (84 fuentes) | Se estimaban 3–5 minutos más; el timeout es de 30 |
| Snapshots | 3,3 MB | — |

**`/mcp` en Node:**
- **Con la caché caliente** (mediana): de 0,6 a 3,7 ms por llamada. Lo más caro es el IPC completo en variación interanual; `describir_serie` de agregados (5 variantes) da 3,5 ms y `obtener_serie` de los 19 países como índice, 2,8 ms.
- **En frío**, con el parseo del export:
  - el `describir_serie` más caro es el de agregados, con 3,2 ms, contra 1,6 ms del IPC;
  - parsear `catalogo.json` cuesta 0,23 ms.
- **Decisión:** el `describir_serie` más caro queda por debajo del doble del de la fase 3, así que no se propone el archivo de metadatos livianos. Se sigue vigilando, y la CPU real se mide en producción después de desplegar.

### Pendientes

**Consultas:**
- Al BCRA: el M2 de la serie 174 desde 2019-08 (quiebre sin documentar) y la caída de la base monetaria promedio de junio de 2026.
- El archivo de la ONP «Cuenta AIF 1961–2004», que puede traer la nota de unidad del devengado (FIS-01).
- Las licencias de la Secretaría de Finanzas y del FMI (FIS-04).
- El reparo de la fase 1 sobre las series de origen BCRA en datos.gob.ar, que sigue abierto.

**Datos:**
- **PIB en dólares antes de 1990:** difiere del Banco Mundial (1980: 224.289 millones contra 76.962), porque el tipo de cambio del Banco Mundial en esos años no es el de la serie del BCRA.
  - Se nota en las medidas: la cuenta corriente de 1980 da −2,1 % del PIB contra −6,2 % del Banco Mundial.
  - Queda informado; no se cambió nada.
- **EXT-07 `indec`:** la 161.1 llega a 2024-T2 en datos.gob.ar.
- **Variantes pendientes:** `pib.niveles`, `inversion.pct-pib-constantes`, `tasa-pasiva.real`, `fuga.residual`, `salario-real.iso` y `salario-real.industria-historica` (hueco 1976–1984), y `tcr-multilateral.ipc-alternativo` y `reconstruccion`.
- **Revisiones espurias:** las derivadas (saldo comercial, TCR bilateral) difieren en la décima cifra significativa entre una corrida parcial y una completa. Quedan como «valores revisados» con 0 sobre el umbral. Es inofensivo; se puede evitar redondeando los operandos.

**De la revisión visual** (a decidir; salvo el dato excluido del salario real, vienen de fases anteriores):
- **Resultado fiscal:** la leyenda «Tramo» muestra formas que la línea no lleva.
- **Gráficos con valores negativos** (por ejemplo, el resultado fiscal en % del PIB): la línea del 0 tiene el mismo trazo que el resto de la grilla, y el mínimo (2020) queda pegado al eje x, sin margen.
- **Salario real (RIPTE):** el dato excluido de 2026-08 figura en «Datos excluidos» pero no en el gráfico. Como es la última observación, la librería recorta los `null` del final.
- **Botones de atajo del período** («Toda la serie», «Desde 1983»…): miden 36 px de alto en 390 px; el criterio es 44 px para los controles principales.
- **Contraste del placeholder** de Desde/Hasta: 4,31:1 en claro y 3,99:1 en oscuro, por debajo de 4,5:1.
- **Panel de opciones en 1280 px:** con el grupo «Período», los selectores quedan alineados con la fila de atajos y no con los campos.
- **`tc-oficial.moneda-de-epoca` en escala logarítmica:** la grilla menor forma un rayado denso desde 1992.

**Antes del despliegue:**
- La prueba manual de la fase 3 con Claude, sumando los parámetros nuevos (medida, deflactor, países).
- `/salud` sigue diciendo `"fase": 3`. Se actualiza cuando se despliegue la 4a.
- Medir la CPU de `/mcp` en producción con el catálogo grande.

## 4a · Correcciones de la revisión

*05/11/2026 · Respuesta a `REVISION_FASE4a.md` (revisión del 28/10/2026 hecha en Claude Chat). Las cifras de la sección 1 de la revisión se verificaron en el export y en datos.gob.ar antes de decidir.*

### Decisiones tomadas con Camilo (05/11/2026)

| Punto | Decisión | Qué se hizo |
|---|---|---|
| 1.1 Deuda INDEC 1991–2001 | Pendiente | La derivación da pasivos de la PII a **valor de mercado** (2001: 104.798 millones, contra unos 140.000 nominales). Pasa a `pendiente`; `q.deuda-externa.criterios` deja de atribuir la diferencia a «criterios distintos». En datos.gob.ar no hay deuda externa nominal de 1991–2005. |
| 1.2 Resultado fiscal devengado | Pendiente | Las dos variantes pasan a `pendiente` hasta tener la nota de unidad de la ONP; FIS-01 queda en 1993–hoy. No hay una versión en % del PIB en datos.gob.ar. |
| 1.3 y 1.4 PIB del % del PIB | El publicado en cada base, por defecto | AUX-01 y AUX-02 suman «cada base» (Banco Mundial hasta 1992, base 1993 en 1993–2003, base 2004 desde 2004) y AUX-02, el del Banco Mundial. El % del PIB deja elegir el denominador en la librería, la ficha y el MCP. El Banco Mundial ya publica el PIB nominal «de cada base» (236.505 en 1993, 268.697 en 2001). |
| 1.5 FIS-04 | Renombrar | «Deuda pública externa (Banco Mundial)», hasta tener la total. |
| 1.6 Cita | — | El país va aparte («País: Argentina.»), no como transformación. |
| 1.7 Series internacionales | Selección inicial en la ficha | Las 5 entidades de la selección inicial, la elegida resaltada, más la tabla de crecimiento promedio por década. |
| 2.1 Atraso de datos | Usar la API del BCRA, si la licencia lo permite | **No lo permite con claridad** (ver abajo): no se almacena. Se suma «Último dato» visible en la ficha, el catálogo y el MCP (`ultimo_dato`). Camilo decidió después (05/11/2026) que el tramo reciente se **consulte en vivo**, sin almacenarlo, como el riesgo país: va en una tanda aparte, con su plan. |
| 2.3 Pesos actuales | El signo del último día del período | El pipeline lo usa por defecto, como la librería; solo en series mensuales. |
| 2.4 Base monetaria promedio | Cortar en 2026-05 | Hasta que el BCRA aclare la caída de junio de 2026. |
| 2.4 Fuga, variación de activos | Pendiente | Hasta contrastarla con la bibliografía. |
| 2.5 IPC | Desde 1991 | `vista_inicial.desde`. |
| 2.7 Uso en la bibliografía | Oculto hasta consultar a la cátedra | Interruptor `MOSTRAR_BIBLIOGRAFIA` en la web y en el MCP; el inventario sigue en el repositorio. |
| 3 SPEC | v1.1 | Incorpora lo decidido en las fases 1 a 4a. |
| 3 PR | PR encadenados | Te pregunto antes de abrir cada uno. |
| 5 Agentes | Verificador en Sonnet, revisor de datos nuevo, regla en CLAUDE.md | `.claude/settings.json` no se crea (el modelo de la sesión se elige al abrirla). |

### Lo que se hizo además

- **Despublicar ahora borra:** una variante que pasa a `pendiente` se quita del export y de la capa 2 (antes conservaba su JSON viejo).
- **Pipeline más robusto (2.2):**
  - una falla de validación retiene solo la variante (y sus derivadas) y conserva su versión anterior marcada `desactualizada_desde`; el resto se publica (código de salida 3 y issue);
  - frenan una fuente que pierde más de 12 fechas y una variante que empieza más de un año después de lo declarado;
  - `excluir` con una fecha inexistente es un error;
  - las derivadas heredan `desactualizada_desde`;
  - `actualizar.yml` hace `pull --rebase` si el push falla, y las acciones de los tres workflows quedan fijadas por SHA.
- **Ficha:**
  - línea del 0 marcada y margen bajo el mínimo con valores negativos;
  - el dato excluido del final del período se marca;
  - botones de atajo de 44 px y placeholder con contraste suficiente;
  - «Datos de esta serie» en la cabecera y «Última actualización del sitio» en el pie.
- **Cita y licencias (2.6):** la cita en BibTeX y la imagen exportada dicen cuándo una fuente no es CC BY (Bruegel).
- **Advertencias nuevas:** Venezuela desde 2015 (INT-01 e INT-02), base de diciembre de 2015 del TCR bilateral y factor de conversión alternativo del Banco Mundial (1971–1981 y 2012–2015).
- **`/salud`** lee la fase de `worker/package.json` (`4a`).
- **README, `mcp/PRUEBA_MANUAL.md`** (guion para la 4a) y los README del pipeline y los workflows, al día.

### Contrastes del revisor de datos (05/11/2026)

- **Deuda externa total (Banco Mundial):** reproduce `DT.DOD.DECT.CD` sin diferencias. Contra el INDEC, 2005: 130.788 contra 117.209 millones (+11,6 %, cobertura y valuación distintas). 1991–2001: sin cifras nacionales comprobadas.
- **Deuda pública y privada (Banco Mundial):** son solo de largo plazo y no suman el total (lo explica `q.deuda-externa.componentes-bm`). La privada no garantizada da mucho menos que el relevamiento del BCRA (2005: 26.361 contra 47.541 millones): es otra definición.
- **FAE:** coincide con los informes del BCRA (2007: 8.872 contra 8.880; 2010 y 2011, iguales; 2015, 2017–2019, dentro del 3 %).

### Licencias consultadas (05/11/2026)

- **API del BCRA:** no tiene términos propios; el aviso legal del sitio (<https://www.bcra.gob.ar/aviso-legal/>) permite reutilizar «con fines informativos, educativos o académicos» citando la fuente, pero **prohíbe el uso comercial sin autorización previa**, y la redistribución con CC BY 4.0 permite el uso comercial de terceros. **No está claro: no se usa** y se suma a la consulta al BCRA.
- **INDEC:** su Política de difusión (2018, sección XI) dice que el material del sitio tiene licencia Creative Commons y permite «copiar, reutilizar o redistribuir el material en cualquier medio o formato» con atribución. No especifica la versión de CC. Bajar sus archivos directo es viable; no se implementó en esta tanda.

### Diferencias con la SPEC

La SPEC v1.1 las incorpora. Quedan como diferencias de esta tanda:
- El esquema 1.2 cambió antes de publicarse: `denominador` en las opciones de `pct_pib` y `frecuencia` y `desde` en `vista_inicial`.
- La ficha de las series internacionales compara países, algo que la SPEC dejaba para el explorador.

### Pendientes

**Consultas (tuyas):**
- **BCRA:** licencia de la API para un repositorio CC BY (o autorización expresa), M2 desde 2019-08 y base monetaria promedio de junio de 2026.
- **La cátedra:** si quiere figurar en los créditos y si se puede mostrar «Uso en la bibliografía».
- Cavallo y Bertolotto, Secretaría de Finanzas y FMI, como antes.

**Datos:**
- La deuda externa nominal de 1991–2005 (DNCI), para volver a publicar una variante del INDEC.
- Los valores de referencia de BAS2000-G1 y del resto de los casos de la bibliografía.
- El contraste de la variación de activos externos con Basualdo, Kulfas y CENDA.
- Bajar series del INDEC directo, ahora que su licencia lo permite.

**Tanda aparte:** consulta en vivo del tramo reciente de las series del BCRA (reservas, tipo de cambio, base monetaria, tasas), sin almacenarlo, en la ficha y en el MCP.

**Proceso:**
- Prueba manual del MCP con el guion actualizado.
- PR encadenados hacia `main`.
- Despliegue de la 4a.

## 4a · Correcciones de la segunda revisión

*07/11/2026 · Respuesta a `REVISION_FASE4a_v2.md` (segunda revisión, hecha en Claude Chat sobre `main` en `8bb0f39`). Antes de empezar se verificó que `main` no había cambiado y que el entorno llega a apis.datos.gob.ar, api.worldbank.org y www.bruegel.org (las tres responden 200). Va en tres PR encadenados: este (eje Y, avisos de fuentes, Bruegel manual y Ubuntu 26), uno con los textos, la bibliografía y los menores, y uno con los tramos recientes de datos.gob.ar.*

### Decisiones tomadas con Camilo (07/11/2026)

| Punto | Decisión | Qué se hizo |
|---|---|---|
| 2.1 Eje Y | Corregir y que las pruebas lo vean | La capa de la línea del 0 repite la definición de `y` (con `axis: null` apagaba el eje **y** la grilla de todo el gráfico). Prueba unitaria que compila con Vega-Lite; la de punta a punta exige etiquetas en los dos ejes; el `revisor-visual` revisa siempre una lista fija de fichas. |
| 2.3 Avisos de fuentes | Commit con avisos, issue a los 7 días, `--sin-red` conserva la marca | Ver «Lo que se hizo además». |
| 2.3 Bruegel | Descarga manual, con comando que corra en la Mac | `descarga: manual` y `python -m pipeline bajar-manual`. La ficha y el MCP dicen «versión de Bruegel del 11/10/2026»; aviso e issue si pasan más de 3 meses. |
| 2.2 TCR | Bruegel por defecto hasta que el BCRA llegue a 2025; después, el BCRA | En el segundo y el tercer PR. |
| 2.2 Tramos recientes | Completar lo que falta, con contraste mes a mes antes de unir | En el tercer PR. |
| 3.3 Bibliografía | Fuera del export hasta que conteste la cátedra; el inventario CSV queda | En el segundo PR. |
| 3.6 IPC | Desde 1993 | En el segundo PR. |
| 4 Ubuntu 26 | Fijar `ubuntu-26.04` | Los cuatro jobs. La corrida del 06/11 ya había usado esa imagen (`ubuntu-latest` migró) y pasó. |
| PR | Encadenados, en ramas con sufijo `-2` y `-3` | Te pregunto antes de abrir cada uno. |

### Lo que se hizo además

- **Log de la corrida del 06/11** (esta sesión lee GitHub Actions; la revisión no podía): Bruegel respondió `HTTP 403` con «Just a moment...», el desafío de Cloudflare. El aviso estaba en el informe, pero antes de «## Cambios publicados», y el commit copiaba desde ahí.
- **Fuentes que no responden:**
  - el commit del bot lleva el informe entero;
  - los errores no copian la página HTML: queda el código y el `<title>`;
  - `snapshots/estado-fuentes.json` guarda desde qué día no responde cada fuente (solo cambia cuando una fuente empieza a fallar o vuelve); **`desactualizada_desde` pasa a ser ese día**, no el del último snapshot que cambió (Bruegel figuraba desde el 24/10 y falló el 06/11);
  - `--sin-red` conserva la marca y no toca el estado;
  - más de 7 días: sección «Fuentes que necesitan atención» del informe y un issue `fuente-caida` por fuente (`--atencion RUTA` deja el JSON que lee el workflow); se cierra solo cuando una corrida completa la ve normalizada. No cambia el código de salida.
- **Bruegel manual:** la corrida automática no la descarga ni la marca como caída. La versión sale del nombre del zip (`REER_database_ver11Oct2026.zip`); los snapshots nuevos la guardan en `meta.json`. `bajar-manual` se probó desde esta sesión: «sin cambios (versión 2026-10-11)».
- **Esquema 1.3:** `fuentes[].descarga` y `fuentes[].version`. Todos los JSON se regeneraron con la 1.3.
- **Aviso de desactualizada:** la ficha y el MCP ya no dicen siempre «la fuente no responde»: también puede ser una variante retenida por la validación o una versión manual vieja.
- **Fechas en el aviso:** «desactualizada desde el 06/11/2026» (antes, solo mes y año).

### Diferencias con la SPEC

La SPEC v1.2 incorpora lo de este PR (2.1, 2.5, 5.1, 5.2 e historial). Quedan como diferencias:
- La SPEC 5.4 nombra `release.yml`, que todavía no existe (fase 5).
- El snapshot de Bruegel sigue guardando solo la columna de la Argentina extraída del zip, no el zip (excepción ya anotada en la 4a).

### Pendientes

**Tuyos:**
- Una corrida manual de «Actualizar datos» en `main` después del merge, para ver el informe nuevo en el commit y el runner fijado.
- Prueba manual del MCP con el guion actualizado.
