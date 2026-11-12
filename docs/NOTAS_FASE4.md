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
- **Cita:** `@vaiven/cita` nombra varias entidades (hoy, «Países: Argentina, Brasil y Mundo.», en la ficha y en el MCP; ver las correcciones de la segunda revisión).

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
| 2.2 TCR | Bruegel por defecto hasta que el BCRA llegue a 2025; después, el BCRA | Segundo PR: `variante_por_defecto: bruegel`. El tercer PR, con el BCRA hasta diciembre de 2025, la devuelve al BCRA. |
| 2.2 Tramos recientes | Completar lo que falta, con contraste mes a mes antes de unir | Contraste mostrado y unión aprobada el 07/11/2026: reservas y tipo de cambio hasta agosto de 2026, TCR del BCRA hasta diciembre de 2025. La mensual manda; los meses de la diaria son provisorios. |
| 2.2 Marzo de 2026 | Usar la diaria | La mensual trae los valores del 30/03; el fin de mes del BCRA es el del 31/03 (reservas 42.052, tipo de cambio 1.382,76). `reemplazar` con su quiebre (`q.reservas.marzo-2026`, `q.tc.marzo-2026`). |
| 2.2 Saldo de fin de mes | Avisarlo con un quiebre | `q.reservas.fin-de-mes`: el saldo del último día cae y se recupera al siguiente (encajes, como hipótesis). |
| 3.1 Textos del PIB | Corregir con cifras del mismo año | 2004: 447.643 (base 1993) y 485.115 (base 2004), +8,4 %. 1980 en dólares con el oficial: 206.965 con el PIB de cada base (224.289 era el retropolado). «Coincide con la bibliografía» queda solo para 1993–2003. |
| 3.2 Quiebres por país | `entidades` en el quiebre | `q.int.venezuela` es solo de VEN: la ficha, la cita y el MCP lo avisan si Venezuela se ve. La lista «Quiebres» lo muestra con «solo Venezuela». |
| 3.3 Bibliografía | Fuera del export hasta que conteste la cátedra; el inventario CSV queda | `PUBLICAR_BIBLIOGRAFIA = False` en el pipeline; los ids se siguen controlando. El historial de Git conserva las versiones viejas del catálogo. |
| 3.3 Licencia de Bruegel | Campo legible por máquinas correcto | `licencia: other-at` en la variante y en el datapackage; cita recomendada de Bruegel (DOI) en la ficha y el MCP. |
| 3.4 Base monetaria | Mantener el corte en mayo; cambiar el texto | Ya no es una hipótesis: el Informe Monetario Mensual de junio de 2026 del BCRA da 43,3 billones para junio (+4,5 %), contra 18,2 en datos.gob.ar. Es un error de la copia. |
| 3.5 Atraso | Medir contra el desfase esperado y nombrar al intermediario | `desfase_esperado` por fuente; «con el calendario habitual de la fuente ya debería estar septiembre de 2026: datos.gob.ar todavía no lo cargó». |
| 3.6 IPC | Desde 1993 | `vista_inicial.desde: '1993'`. |
| 4 Menores | Todos | Catálogo con el trimestre; MCP estricto y con nombres de países; FIS-04 sin «(SPEC, sección 3)»; «Datos de esta serie: … · Sitio actualizado: …»; README. |
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
- **Segundo PR:**
  - el atraso se calcula en la librería (`atraso()`), así la ficha y el MCP dicen lo mismo; la ficha lo mide contra la última actualización del sitio y el MCP, contra el día de la consulta. Más de un año sin datos (los agregados del Panorama, hasta 2021) sigue diciendo «N meses sin datos nuevos»;
  - el catálogo exporta `frecuencia_ultimo_dato` por variante;
  - la ficha numera todos los quiebres (también los de un solo país), así el número del gráfico coincide con la lista;
  - el MCP explica en `notas` que la licencia de Bruegel no es CC BY y pide citarla como recomienda;
  - el esquema 1.3 suma `advertencias[].entidades`, `fuentes[].desfase_esperado`, `fuentes[].cita` y `licencia: other-at`. Si el primer PR se despliega antes que este, el 1.3 cambia después de publicarse (solo agrega campos opcionales y un valor de `licencia`), como pasó con el 1.2.

### Contrastes del revisor de datos (07/11/2026)

- **Tramos recientes (tercer PR):** los 8 valores nuevos de reservas y tipo de cambio coinciden exactamente con la serie diaria del BCRA (la misma fuente que copia datos.gob.ar: es un control de transcripción). El TCR de 2025 coincide con la planilla ITCRMSerie.xlsx del BCRA dentro del 0,02 %, salvo abril (82,49 contra 82,34, +0,18 %, probablemente por la versión de la planilla). Marzo de 2026: el BCRA da 42.052 al 31/03, como la diaria.
- **Superposición mensual contra diaria:** reservas, 279 meses y 14 diferencias (las grandes, junio de 2024 y marzo de 2026); tipo de cambio, 3; TCR, hasta 0,9 % en 2020–2022 y 0,03 % o menos desde 2023. El detalle mes a mes se mostró antes de unir.
- **Una regla para detectar meses «rellenados»** en la diaria (como junio de 2024) se probó y no se implementó: con 3 días hábiles iguales marca también la Semana Santa de 2018 y 2024; con 5, septiembre de 2022, que es correcto. Con «completa lo que falta», los meses de la diaria son provisorios y la mensual los corrige.

- **PIB 2004:** 447.643,43 (base 1993) y 485.115,19 (base 2004) en datos.gob.ar; +8,37 %. Coincide.
- **PIB 1980 en dólares:** el del Banco Mundial (`NY.GDP.MKTP.CD`) es 76.961,92 = `NY.GDP.MKTP.CN` ÷ `PA.NUS.ATLS` (4,99 × 10⁻⁸). Con el oficial de Vaivén (promedio de fin de mes de 1980: 1,8556 × 10⁻⁸) da 206.964,56; con `PA.NUS.FCRF` (1,837 × 10⁻⁸) daría 209.040. El texto ahora dice cuál es cuál. El retropolado (224.289) es coherente: su PIB en pesos de 1980 es 8,4 % mayor.
- **Base monetaria promedio:** datos.gob.ar coincide con el Informe Monetario Mensual del BCRA hasta mayo de 2026; en junio da 18.186 contra 43.272 miles de millones (circulación, 11.365 contra 26.728; cuenta corriente, 6.821 contra 16.544). Julio y agosto no se pudieron comprobar.

### Licencias consultadas (07/11/2026)

- **Bruegel:** la página del conjunto de datos (<https://www.bruegel.org/publications/datasets/real-effective-exchange-rates-for-178-countries-a-new-database>) dice «Users can freely use our data in its unchanged form or after any transformation for any purpose and can freely distribute it, provided that proper attribution is made to the source, but not in any way that suggests that Bruegel endorses the user or their use of the data», y da la cita recomendada con DOI (`10.64153/SZCG6180`). Permite redistribuir.

### Diferencias con la SPEC

La SPEC v1.2 incorpora lo de este PR (2.1, 2.5, 5.1, 5.2 e historial). Quedan como diferencias:
- La SPEC 5.4 nombra `release.yml`, que todavía no existe (fase 5).
- El snapshot de Bruegel sigue guardando solo la columna de la Argentina extraída del zip, no el zip (excepción ya anotada en la 4a).
- La «tanda aparte» de consulta en vivo a la API del BCRA queda solo para lo que datos.gob.ar no tiene (base monetaria de fin de mes, tasas); reservas, tipo de cambio y TCR se completan con las diarias de datos.gob.ar.
- Las derivadas que usan el tipo de cambio suman los meses que habilita el tramo nuevo (TCR bilateral hasta agosto de 2026 y PIB trimestral en dólares hasta el 2.º trimestre de 2026), con el mismo método ya contrastado.

### Pendientes

**Tuyos:**
- Una corrida manual de «Actualizar datos» en `main` después del merge, para ver el informe nuevo en el commit y el runner fijado.
- Prueba manual del MCP con el guion actualizado.
- **Consultas:** a datos.gob.ar, la base monetaria promedio desde junio de 2026 (no coincide con el Informe Monetario Mensual del BCRA) y las reservas y el tipo de cambio de marzo de 2026 en la serie mensual (traen el dato del 30/03); al BCRA, como antes (licencia de la API y M2 desde 2019-08); a la cátedra, la bibliografía (ahora también fuera del catálogo público) y el CSV del inventario.
- **Datos:** cifras de un cuadro de los ochenta (por ejemplo, Damill y Frenkel 1990) para contrastar el PIB «de cada base» antes de 1993, y los valores de referencia de los casos de la bibliografía.
- **Proyecto de Claude:** sumar la SPEC v1.2 como documento del proyecto (sin tocar los originales).

## 4a · Correcciones de la tercera revisión

*11/11/2026 · Respuesta a `REVISION_FASE4a_v3.md` (tercera revisión, hecha con Claude Cowork sobre `main` en `2e11c4c`). La revisión dio por resueltos todos los puntos de la segunda y dejó un problema nuevo (2.1) y menores. Con este PR, la 4a queda cerrada.*

### Decisiones tomadas con Camilo (11/11/2026)

| Punto | Decisión | Qué se hizo |
|---|---|---|
| 2.1 OCDE, una copia por día | Comparar por contenido | La API devuelve las mismas 800 filas en distinto orden: 4 snapshots con los mismos datos (24/10, 09/11 dos veces y 10/11). `guardar_snapshot` acepta `canonizar` (la OCDE ordena las filas) y compara el contenido con el snapshot anterior; los bytes se siguen guardando tal como llegan. Se borraron las tres copias repetidas y queda la del 24/10. Es la única fuente con snapshots repetidos. |
| 2.2 Bruegel | Documentar cómo se actualiza | «Cómo se actualiza Bruegel» en `pipeline/README.md`, enlazado desde el README: mirarla una vez por mes, `bajar-manual` desde la Mac y subir el snapshot por un PR. |
| 3 Cobertura trimestral | Mismo formato que el último dato | «1970, 1.er trimestre – 2026, 2.º trimestre», con la frecuencia de cada punta, en la ficha, el catálogo y el inicio. El catálogo exporta `frecuencia_primer_dato`. |
| 3 «Sitio actualizado» | Cambiar el texto | «Últimos datos nuevos en el sitio: …», con la aclaración de que las fuentes se revisan todos los días y el sitio cambia solo cuando hay datos nuevos (ficha, inicio y pie). |
| 3 Escala de Bruegel | Diciembre de 2015 = 100 | Campo de variante `rebase`. Sept. 2026: 99,0. El BCRA promedia 85,1 en diciembre de 2015 (su base es el 17/12/2015), y `q.tcr.bruegel` lo aclara. El cambio de unidad no se anotó en `revisiones.json`: no es una revisión de la fuente. |
| 3 TCR por defecto | No cambia | Queda el BCRA (ver «Pendientes»). |
| 3 Signo menos | Unificar | `numero()` usa «−» (U+2212), como los ejes. |
| 3 Reservas a fin de mes | Aclarar desde cuándo | En la diaria del BCRA, la caída del último día hábil (más de 300 millones) aparece en 6 meses de 2024, 8 de 2025 y 5 de 2026, y en ningún mes de 2018–2023. `q.reservas.fin-de-mes` pasa a empezar en 2024. |

### Contrastes del revisor de datos (11/11/2026)

- **Bruegel rebasado:** bajó la base de Bruegel (versión del 11/10/2026) y comprobó que los 681 meses publicados cumplen 100 × REER(2015M12) ÷ REER(t) (diferencias menores a 1e-7 %), y que una suba es depreciación real, como en el BCRA. La comparación con otra fuente es la de la 4a (correlación anual de 0,98 con el BCRA en 1997–2024).

### Diferencias con la SPEC

- **Snapshots borrados.** La SPEC (2.1) dice que un snapshot nunca se modifica. Se borraron tres copias de la OCDE con los mismos datos que la del 24/10: no se perdió información.
- **Prueba con red de la OCDE.** La primera corrida dio «sin cambios» contra el snapshot del 24/10. En la segunda, la OCDE ya había publicado el IPC de octubre de 2026 (dato nuevo de verdad). No se sumó a esta rama: lo baja la corrida diaria.

### Pendientes

**Tuyos** (siguen de la segunda revisión):
- Prueba manual del MCP con el guion actualizado.
- Consultas a datos.gob.ar, el BCRA y la cátedra, como antes.
- El cuadro de los ochenta para el PIB «de cada base» antes de 1993 y los valores de referencia de los casos de la bibliografía.
- Bruegel: mirar una vez por mes si hay versión nueva.

**Datos:**
- TCR multilateral: si datos.gob.ar no carga 2026 del TCR diario del BCRA antes de fin de año, revisar la variante por defecto. Volver a Bruegel ya no es buena opción (ver la revisión final, 2007–2015).

## 4a · Correcciones de la revisión final

*11/11/2026 · Respuesta a `REVISION_FASE4a_v4.md` (revisión final, sobre la rama del PR #18 y `main` en `0de0cf4`). Con esto, la 4a queda cerrada.*

### Decisiones tomadas con Camilo (11/11/2026)

| Punto | Decisión | Qué se hizo |
|---|---|---|
| 1 Conflicto con la corrida diaria | Traer `main` y regenerar | Merge de `main` (IPC de EE.UU. de octubre de 2026) y `actualizar --sin-red`. El IPC de EE.UU. llega a 2026-10; en `snapshots/f.ocde.ipc-eeuu/` quedan solo `2026-10-24` y `2026-11-11` (dato nuevo de verdad). Una segunda corrida sin red no cambia nada. |
| 2 TCR de Bruegel en 2007–2015 | Textos y quiebre propio; la serie queda completa | Entre los promedios de 2006 y 2015, Bruegel da +26 % (depreciación real) y el BCRA −50 % (apreciación). `q.tcr.ipc-2007-2015` lo dice con las cifras. `q.tcr.bruegel` ya no concluye que «siguen de cerca»: la correlación de 0,98 baja a 0,71 sin 2002, 2014, 2018 y 2023. Quiebre nuevo `q.tcr.bruegel-2007-2015` (banda, solo Bruegel): «no sirve para estudiar el atraso cambiario de 2007–2015». La banda de 2007–2015 ya se sombreaba en las dos variantes. |
| 3 Regla para los PR con datos | `CLAUDE.md` | «Antes de pedir el merge de un PR que toque `export/` o `datos/`, traer `main` y regenerar con `--sin-red`; mergear el mismo día, antes de las 18:24». |
| 4 Snapshots borrados | Excepción en la SPEC | 2.1: «salvo para borrar copias con contenido idéntico». |
| 3 Aclaración repetida | Solo en el pie | La ficha y el inicio dicen «Últimos datos nuevos en el sitio: …»; la explicación queda en el pie. |

### Verificado

- **IPC del BCRA en 2007–2015:** la metodología del ITCRM (BCRA, abril de 2016, sección 3) empalma el IPC GBA del INDEC hasta diciembre de 2006, el IPC de San Luis hasta julio de 2012, el promedio de las variaciones del IPC de la Ciudad de Buenos Aires y el de San Luis hasta abril de 2016 y el nuevo IPC GBA desde entonces. La página del conjunto de datos de Bruegel no dice qué IPC argentino usa: el texto dice que el resultado es compatible con el oficial del INDEC, sin afirmarlo. El revisor de datos confirmó las cifras de los textos y pidió precisar las fechas del IPC del BCRA, ya corregidas.
- **Cifras:** en diciembre de 2001, Bruegel da 31 y el BCRA 69 (no 81, como decía la revisión). En 2007–2015 las tasas anuales se mueven juntas (correlación de 0,91), pero Bruegel queda entre 3 y 15 puntos por encima todos los años.

### Pendientes

- **Ramas viejas:** desde las sesiones de Claude Code no se pueden borrar (GitHub responde 403). Hay que borrarlas desde GitHub o desde la Mac.
- **IPC argentino de Bruegel:** leer la sección de fuentes de Darvas (2012), Bruegel Working Paper 2012/06, para confirmar qué IPC usa para la Argentina. El revisor de datos no pudo bajarlo (el proxy cortó la conexión); hasta entonces, el quiebre dice que el resultado es «compatible» con el IPC oficial, sin afirmarlo.
- **Otro IPC para 2007–2015:** la variante pendiente `ipc-alternativo` del TCR multilateral (recalculado con otro IPC en esos años) daría una alternativa que no depende del IPC oficial del INDEC.


## 4b · Períodos y eventos (PR 1)

*12/11/2026 · Primera entrega de la 4b: los registros de períodos y eventos, su validación y export, y las herramientas `listar_periodos` y `periodo_en_fecha` del MCP. El explorador (PR 2) y el sombreado en la ficha y la página `/periodos/` (PR 3) vienen después.*

### Qué quedó publicado

- `metadatos/periodos.yaml`: **128 períodos**.
  - 28 gobiernos, de Onganía a Milei, con los mandatos de Menem y de Fernández de Kirchner;
  - 46 ministros de Economía;
  - 11 planes de estabilización;
  - 32 regímenes cambiarios;
  - 11 etapas de la política económica del curso.
- `metadatos/eventos.yaml`: **31 eventos**, de 1975 a 2025.
- **Validación** (`pipeline/validacion/periodos.py`): si encuentra un error, frena la publicación. Controla:
  - ids, fechas y campos permitidos;
  - una fuente por extremo, con página en las secundarias y nota en los cortes convencionales;
  - que no haya superposiciones (gobiernos, ministros, regímenes y etapas) ni huecos en los gobiernos desde el 1/1/1970;
  - que los mandatos cubran su gobierno, que las etapas sean contiguas y que los `igual_a` sean válidos;
  - que solo el último período de cada tipo quede abierto.
- **Export:** `periodos.json` y `eventos.json`, con esquemas `periodos-1.0` y `eventos-1.0` publicados en `/esquemas/`. También van como CSV en la descarga completa, como tablas en el `datapackage.json` y como registros en el catálogo. Un cambio en los períodos cuenta como cambio y lleva versión nueva.
- **Librería** (`@vaiven/transformaciones`): tipos y funciones de períodos (vigencia en una fecha, vista por mandato, período de cada observación), para la web y el MCP. **`@vaiven/cita`**: cita de los registros.
- **MCP:** `listar_periodos(tipo?, por_mandato?)` y `periodo_en_fecha(fecha)`, con parámetros estrictos. Sin `tipo`, `listar_periodos` devuelve una lista compacta: con las fuentes pesa 117 KB y no conviene mandársela entera a un modelo. Hay 3 preguntas nuevas (14 a 16) en `mcp/PRUEBA_MANUAL.md`.

### Cómo se armó la tabla de fechas

- **Búsqueda:** cuatro búsquedas en paralelo (gobiernos, ministros, planes y regímenes, eventos), con fuente primaria cuando existe y, si no, secundaria académica con página. Wikipedia sirvió solo para orientarse.
- **Revisión:** cuatro revisores independientes (`revisor-datos`) recibieron solo los nombres y las fechas, sin las fuentes. Después, un quinto revisó la subdivisión cambiaria de 1971–1976.
- **El detalle de cada fila** (fuentes de trabajo, confianza y resultado del revisor) está en `docs/planificacion/periodos_tabla.md` y `.csv`.
- **El Boletín Oficial corta la conexión desde el entorno.** Se usaron:
  - InfoLEG, en argentina.gob.ar/normativa;
  - las comunicaciones del BCRA;
  - las Memorias del BCRA (escaneos, leídos con OCR);
  - las actas de las Juntas publicadas por el Ministerio de Defensa;
  - los dossiers de la Biblioteca del Congreso.

### Decisiones tomadas con Camilo (11 y 12/11/2026)

| Tema | Decisión |
|---|---|
| Intervalos | Semiabiertos [desde, hasta): el día del traspaso es del que entra. |
| Gobiernos | Con juntas e interinatos; una entrada por persona con `mandatos`. Las licencias (Luder 1975, Liendo 1981) y el interinato de horas de Pinedo (2015) van como nota. Lacoste y Saint-Jean quedan como `de_facto`, con las actas de la Junta y nota de que los listados oficiales los omiten. Rodríguez Saá–Camaño: 30/12/2001. Duhalde: 2/1/2002. |
| Ministros | Titular de Hacienda o Economía: Hacienda y Finanzas en 1971–1973 y Hacienda en 2017–2019 (Finanzas, como nota). Se suman Wehbe (1972–1973) y Bauzá (interino, 14/7/1989). Los encargados sin designación van como nota. |
| Regímenes | Un tramo cambia cuando se crea o se elimina un mercado o cambia la forma de fijar el tipo. 1971–1976 se divide en cinco tramos (agosto y noviembre de 1975, enero y marzo de 1976); el Rodrigazo es una devaluación dentro del esquema. Convertibilidad hasta el 7/1/2002 (publicación de la Ley 25.561); desdoblamiento desde el 11/1/2002 (A 3425); del 7 al 10/1 no hay régimen. Se mantienen los tramos cortos de 1981–1982 y 1989. |
| Planes | Los 11 aprobados, con fin convencional y justificado cuando no hay un hecho fechado. Sin Krieger Vasena. |
| Etapas del curso | Nombre público «Etapas de la política económica (curso)», detrás de `MOSTRAR_BIBLIOGRAFIA` (en Python, `PUBLICAR_BIBLIOGRAFIA`). Corte de 2008: vigencia de la Resolución 125, el 13/3/2008. |
| Eventos | Fecha del hecho que nombran; vigencia aparte. Solo económicos o institucionales con efecto económico. Sin la Ley 27.802 (2026). Pago al FMI: vigencia 4/1/2006, según el FMI. Rodrigazo: vigencia 9/6/1975. |
| Sin segunda fuente | Se publican con su fuente y confianza media: 25 extremos de ministros de 1969–1982 y 20 de regímenes y planes. |

### Diferencias con la SPEC

La SPEC pasa a la v1.3. Los ejemplos de 2.2 y 2.4 decían:
- Plan Austral desde el 14/6/1985 (anuncio); el decreto rige desde el 15;
- Convertibilidad hasta el 6/1/2002 (sanción); la ley se publicó el 7;
- `e.1991-04-01.convertibilidad` (vigencia); el evento es la sanción, el 27/3/1991.

También se documentaron las reglas de 2.4, el export de 2.5, el nombre público de 6.4 y los parámetros de 7.2.

### Pendientes

- **Verificar con el Boletín Oficial**, desde otra red, las fechas de 1969–1983 que no tienen segunda fuente. En especial: Lacoste, Saint-Jean, el inicio del Plan Gelbard (30/5, 6/6 u 8/6/1973) y las salidas de Moyano Llerena y de Bonanni.
- `export/periodos.json` pesa 185 KB, por lo largas que son las referencias. La web lo va a leer solo cuando se pida el sombreado; si hace falta, se puede publicar una versión sin fuentes.
- Prueba manual del MCP con las preguntas 14 a 16.

## 4b · Explorador de una serie (PR 2)

*12/11/2026 · El PR 1 (vaiven-argentino/vaiven#19) se mergeó y desplegó el 12/11; en producción responden `/datos/periodos.json`, `/datos/eventos.json`, los esquemas y `periodo_en_fecha`. Este PR suma `/explorador/`.*

### Qué se hizo

- **`/explorador/`**: una serie por vez (o una internacional con hasta 8 países). Los controles se arman según lo que admite la variante (`disponibles()` de la librería), y hay atajos de período y un selector de etapas del curso.
  - **Sombreado:** etapas del curso, gobiernos, gobiernos por mandato, ministros, planes o regímenes cambiarios.
  - **Eventos:** marcas con una letra sobre el eje, más una lista debajo del gráfico.
- **Accesibilidad:** el panel de opciones arranca cerrado en 700 px o menos. Hay resumen textual (que menciona el sombreado y los eventos), leyendas en texto y la tabla con la columna del período.
- **Estado en la URL** (`web/src/lib/estado.ts`, funciones puras): se usan los parámetros de la ficha más `s`, `v`, `p`, `sh` y `ev`, y no se escribe lo que coincide con la vista inicial. Lo que la serie no admite se ignora y deja un aviso visible.
- **Gráfico** (`espec.ts`):
  - bandas que alternan dos grises (`--periodo-a`, `--periodo-b`), con los gobiernos de facto en `--periodo-facto`;
  - franja de planes arriba, con filas si se superponen;
  - eventos con letras escalonadas cuando están cerca;
  - países con color (`--graf-1` a `--graf-8`) y nombre al final de la línea, separados para no pisarse;
  - con sombreado, los quiebres pierden el relleno.
- **Descargas:**
  - CSV con la columna del período (el vigente el último día de cada fila);
  - XLSX con las hojas Datos, Metadatos, Cita y Períodos (`write-excel-file` 4.1.1, MIT; 70 KB minificado, cargado solo con el clic);
  - PNG y SVG con fuentes, países, transformación, sombreado, eventos y versión impresos;
  - cita en `.txt`.
- **Enlace a la ficha** con la vista equivalente (el período, en años).
- **`web/src/graficos/comun.ts`:** reúne lo que comparten la ficha y el explorador (formato, tema, insumos, descargas e imagen). La ficha lo usa sin cambiar su comportamiento.
- **Navegación:** «Explorador» en el menú.
- **Dependencias:** en `package-lock.json` se sumaron solo `write-excel-file` y `fflate`. El npm local reescribía campos `libc` de otros paquetes y esos cambios se descartaron.

### Decisiones de diseño (revisables)

- **Colores 6 a 8 de la paleta:**

  | Modo | 6 | 7 | 8 |
  |---|---|---|---|
  | Claro | `#22201B` (negro) | `#3B7EA1` (celeste oscurecido) | `#5B3A8E` (violeta) |
  | Oscuro | `#EFE9DE` | `#D55E00` (bermellón) | `#B9A3E3` (lavanda) |

  Todos tienen contraste de 4,1:1 o más contra el fondo. Los nombres al final de la línea evitan depender solo del color.
- **Grises del sombreado:** contraste contra el fondo de 1,12, 1,25 y 1,47:1 en modo claro. Se distinguen por luminosidad, no por tono.
- **Período por fila en las descargas:** el vigente el último día de cada observación, la misma regla que el signo monetario de los pesos actuales.
- **Al cambiar de serie** se conservan el sombreado y los eventos; lo demás vuelve a la vista inicial de la serie.
- **Estilos:** la ficha conserva por ahora sus estilos propios; el explorador repite los del panel y la tabla. Se pueden unificar en el PR 3, que vuelve a tocar la ficha.
- **Los pendientes de la 4a** (atajos de 44 px y contraste del placeholder) ya estaban resueltos en la ficha; el explorador usa los mismos criterios.

### Verificación

- **Vitest:** 53 pruebas de la web. Incluyen la ida y vuelta de la URL en 9 vistas canónicas, el descarte de parámetros con aviso, el sombreado (grises, gobiernos de facto, mandatos, franja de planes), los eventos, los colores por país, el CSV y las hojas del XLSX.
- **Punta a punta** (`web/scripts/punta-a-punta.mjs --solo explorador`), en 390 y 1280 px: seis vistas reproducidas desde la URL, con ejes, sombreado, eventos y leyenda de países. La URL queda igual después de recargar. Un cambio de controles se guarda en la URL y la reproduce. CSV, XLSX (ZIP válido con sus 4 hojas), PNG y SVG (con el sombreado impreso) salen no vacíos.

### Revisión visual (12/11/2026)

- **Alcance:** el `revisor-visual` miró 6 casos (negativos, internacional con 6 países, trimestral por mandato, fuga, IPC con gobiernos y eventos, Plan Austral) en 1280 y 390 px, en modo claro y oscuro, en total 24 vistas. No encontró problemas graves.
- **Lo que está bien:**
  - sin scroll horizontal;
  - foco visible con teclado;
  - controles de 44 px;
  - panel cerrado en el celular;
  - contraste de rótulos, letras y nombres de países de 4,5:1 o más en los dos modos.
- **Se corrigió:**
  - Las letras de los eventos se pisaban en 2001–2002 y caían sobre la línea del 0. Ahora van sobre un cuadrado con el color del fondo, en hasta 6 alturas, y se corren si quedan pegadas al eje.
  - El formato de Desde/Hasta («AAAA o AAAA-MM») se cortaba en 390 px: los campos pasan a 11rem.
  - El explorador no decía el último dato ni el atraso de la serie (el revisor lo notó con la fuga). Ahora lo muestra debajo del título del gráfico, como la ficha.
- **Queda como está:**
  - los números de quiebre ② y ③ de 2015–2016 se tocan apenas, como en la ficha;
  - los selectores de serie cortan los nombres largos en 390 px (el nombre completo se ve al abrirlos).


## 4b · Ficha con períodos, página `/periodos/` y enlaces (PR 3)

*12/11/2026 · El PR 2 (vaiven-argentino/vaiven#20) se mergeó y desplegó el 12/11.*

### Qué se hizo

- **Ficha:**
  - **Opciones nuevas:** «Sombreado» (las mismas opciones que el explorador) y «Marcar eventos», apagados por defecto, en el panel de opciones. Se guardan en la URL con `sh` y `ev`.
  - **Lo que cambia con ellas:** leyendas de períodos y eventos debajo del gráfico, resumen textual, columna del período en la tabla y en el CSV de la vista, y una línea de sombreado en el pie del PNG y el SVG.
  - **Carga:** `periodos.json` y `eventos.json` se piden recién cuando se activan.
  - **Enlace al explorador:** «Abrir esta vista en el explorador» lleva la serie, la variante y los parámetros de la ficha.
- **`/periodos/`** (entra en el menú), una página estática que se lee sin JavaScript:
  - **Línea de tiempo** 1970–hoy en un SVG armado en el build. Tiene carriles para etapas del curso, gobiernos, ministros, planes (dos filas cuando se superponen), regímenes y eventos. Cada tramo enlaza a su tarjeta, con título y fechas. En el celular se desplaza de costado.
  - **Tarjetas:** una por período y una por evento (159 en total). Cada una lleva fechas, carácter o cargo, aviso de corte convencional, descripción, notas, mandatos, fuentes con enlace y accesos al explorador.
  - **Al final:** la cita del registro y las descargas (JSON y CSV).
- **Accesos al explorador** (`web/src/lib/periodos.ts`, `accesosDe`): van de un año antes del inicio a un año después del fin (los vigentes, hasta el último dato) y llevan el sombreado de ese tipo.

  | Desde | Series |
  |---|---|
  | Gobiernos, mandatos y etapas | inflación interanual, PIB real, desocupación, tipo de cambio real, reservas y resultado fiscal |
  | Ministros, planes y regímenes | inflación mensual, tipo de cambio oficial, tipo de cambio real y reservas |
  | Eventos | inflación mensual, con los eventos marcados |

  Cada acceso es una URL canónica del explorador: está probado que abrirla no la cambia.
- **Código compartido:** `web/src/lib/periodos.ts` reúne lo que comparten la ficha, el explorador y `/periodos/` (períodos y eventos que se ven, bandas, nombres, accesos y línea de tiempo).

### Corrección del PR 1

`cortes.hasta` marcaba como «hecho» el fin de 8 de los 9 planes con corte convencional. El motivo: además de la nota del corte, esos planes tienen una fuente que respalda la fecha elegida (por ejemplo, el inicio del Plan Primavera). Ahora un extremo es convencional si lleva una fuente de tipo `convencional`, con prueba. Esto afectaba los avisos de `listar_periodos` y `periodo_en_fecha` en producción. Se regeneró el export sin red (`periodos.json`, su CSV y los archivos generales).

### Verificación

- **pytest:** 291 pruebas, entre ellas el caso nuevo del corte convencional con una fuente que respalda la fecha.
- **Vitest de la web:** 64 pruebas. Las nuevas cubren los períodos y eventos que se ven, los mandatos, el nombre público de las etapas, los accesos (ventana, tipos, series sin publicar, URL canónica), la línea de tiempo y los gobiernos de facto.
- **Punta a punta**, en 390 y 1280 px:
  - la ficha con `?sh=gobierno&ev=1` muestra bandas, leyendas y la columna del período, y su enlace abre el explorador con la misma vista;
  - sin parámetros, la ficha arranca sin sombreado;
  - `/periodos/` tiene 159 tarjetas y la línea de tiempo enlaza los tramos;
  - un acceso del Plan Austral abre el explorador sin cambiar la URL y con el sombreado.
- **Revisión de enlaces:** 1593 enlaces internos, ninguno roto.
- **Prueba de punta a punta completa** contra el Worker local (`wrangler dev`, que aplica las redirecciones de la descarga completa; `astro preview` no las aplica): las 22 fichas, el explorador, la ficha con sombreado y `/periodos/` funcionan en 390 y 1280 px.

### Revisión visual (12/11/2026)

- **Alcance:** el `revisor-visual` miró `/periodos/` y la ficha con sombreado (IPC, PIB por mandato, resultado fiscal, crecimiento internacional y PIB sin parámetros) en 1280 y 390 px, en modo claro y oscuro: 40 vistas.
- **Se corrigió:**
  - La línea de tiempo tenía `role="img"` con 159 enlaces adentro, y un lector de pantalla no los exponía (axe: *nested-interactive*). Pasa a `role="group"`, con título y descripción.
  - Los accesos «Ver en el explorador» medían 17 px de alto. Ahora son botones de 44 px.
  - «Fuentes» no parecía un desplegable: ahora lleva una flecha y el color de los enlaces.
  - Las letras de los eventos tapaban la serie donde había varios eventos juntos (2001–2002, el mínimo de la Argentina en 2002). Ahora van debajo del eje X, entre la línea del eje y los años, escalonadas hacia abajo.
  - Las reglas de los eventos tachaban los rótulos de las bandas: ahora empiezan debajo de los rótulos.
- **Verificación:** axe no da violaciones en `/periodos/` (390 y 1280 px), en la ficha con sombreado ni en el explorador con planes y eventos.

