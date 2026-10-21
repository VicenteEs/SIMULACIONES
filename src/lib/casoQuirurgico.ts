import type { CasoDeConsola, InstrumentoDeBandeja, PasoDeConsola } from '@/components/simulador/ConsolaQuirurgica'
import type { PiezaDelCaso } from '@/components/simulador/LienzoQuirurgico'
// El tipo y nada más: un `import type` se borra al compilar, así que de aquí no
// entra una línea de código en ningún paquete. Se pide a
// `aritmeticaDelEncuadre` y no a `@/lib/encuadre` por costumbre defendida en
// aquel archivo —el segundo abre con `import * as THREE`—, aunque siendo solo
// tipo daría igual: escribir la dirección buena aquí evita que el día que
// alguien necesite además una función copie la dirección mala.
import type { Encuadre } from '@/lib/aritmeticaDelEncuadre'
import { ajustesValidos, type AjustesDeInstrumento } from '@/instrumental/modelo'
import type { EjeLargo } from '@/lib/reduccion'
import { companerosDeLasPlacas, quePuedeColocar } from '@/lib/fijacion'
import { objetivoDelPaso, type Objetivo } from '@/lib/simulador'

/**
 * Traduce un documento de Payload en lo que la consola necesita.
 *
 * Existe para que el componente de cliente no sepa nada de la forma en que
 * Payload devuelve las cosas: relaciones que llegan como número, como texto o
 * como el documento entero según la profundidad de la consulta, y campos que
 * pueden faltar porque el caso está a medio escribir. Aquí se aplana todo eso
 * una sola vez, en el servidor, y lo que cruza al navegador ya es plano.
 *
 * Es pura y se prueba sin base de datos.
 */

type Documento = Record<string, unknown>

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

const numero = (v: unknown, porOmision: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : porOmision

/**
 * Una escala, que además de número tiene que ser positiva.
 *
 * El cero y el negativo pasan enteros por `numero` —`Number.isFinite(0)` es
 * cierto— y no son una escala: el cero multiplica el largo del trazo hasta
 * hacerlo desaparecer, de modo que un paso de incisión mide siempre 0 mm y
 * responde «todavía no hay ninguna incisión trazada» por larga que sea, y al
 * colocar el fragmento divide. Se tratan como ausencia de dato.
 *
 * Se ataja aquí, que es por donde el documento entra a la consola, y no con un
 * `|| 1000` en cada uso: el campo se teclea a mano en el panel y un
 * `<input type="number">` sin mínimo acepta el 0 y el negativo, así que el
 * valor malo existe y lo que hay que decidir es una sola vez qué significa.
 */
const escalaPositiva = (v: unknown, porOmision: number): number => {
  const n = numero(v, porOmision)
  return n > 0 ? n : porOmision
}

/** Nombre legible de una relación, venga poblada o no. */
const nombreDeRelacion = (v: unknown, campo = 'nombre'): string | null => {
  if (!v || typeof v !== 'object') return null
  return texto((v as Documento)[campo])
}

/** Identificador de una relación, venga poblada o como clave suelta. */
const idDeRelacion = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' || typeof v === 'string') return String(v)
  if (typeof v === 'object' && 'id' in (v as Documento)) {
    return String((v as Documento).id)
  }
  return null
}

/**
 * El código que se enseña en la esquina del lienzo.
 *
 * Se compone con el número del hueso y el de la clasificación —«42» y «A2» dan
 * «42-A2»— porque guardar la combinación exigiría una fila por cada par
 * posible. Si el caso trae uno escrito a mano, ese manda: hay fracturas cuyo
 * código no sale de la suma de los dos catálogos.
 */
export function codigoDelCaso(documento: Documento): string | null {
  const propio = texto(documento.codigo)
  if (propio) return propio

  const hueso = texto(nombreDeRelacion(documento.hueso, 'codigo'))
  const clasificacion = texto(nombreDeRelacion(documento.clasificacion, 'codigo'))
  if (hueso && clasificacion) return `${hueso}-${clasificacion}`
  return hueso || clasificacion
}

/** Las piezas declaradas, descartando las que no nombran ningún objeto. */
function piezasDelCaso(documento: Documento): PiezaDelCaso[] {
  const brutas = Array.isArray(documento.piezas) ? documento.piezas : []
  return brutas.flatMap((cruda) => {
    const p = (cruda ?? {}) as Documento
    const nodo = texto(p.nodo)
    if (!nodo) return []
    const rol = typeof p.rol === 'string' ? p.rol : 'hueso'
    return [{ nodo, rol: rol as PiezaDelCaso['rol'], etiqueta: texto(p.etiqueta) }]
  })
}

function pasosDelCaso(documento: Documento): PasoDeConsola[] {
  const brutos = Array.isArray(documento.pasos) ? documento.pasos : []
  return brutos.map((crudo, i) => {
    const p = (crudo ?? {}) as Documento
    const muestra = Array.isArray(p.muestra)
      ? (p.muestra as Documento[]).map((m) => texto(m?.nodo)).filter((n): n is string => Boolean(n))
      : []

    // Los rangos van aparte porque hay que enseñárselos al motor antes de armar
    // el paso: de ellos sale el objetivo de más abajo.
    const rangos = {
      trazoMinimo: typeof p.trazoMinimo === 'number' ? p.trazoMinimo : null,
      trazoMaximo: typeof p.trazoMaximo === 'number' ? p.trazoMaximo : null,
      toleranciaDesplazamiento:
        typeof p.toleranciaDesplazamiento === 'number' ? p.toleranciaDesplazamiento : null,
      toleranciaDiastasis:
        typeof p.toleranciaDiastasis === 'number' ? p.toleranciaDiastasis : null,
      toleranciaAngulacion:
        typeof p.toleranciaAngulacion === 'number' ? p.toleranciaAngulacion : null,
      fuerzaMinima: typeof p.fuerzaMinima === 'number' ? p.fuerzaMinima : null,
      fuerzaMaxima: typeof p.fuerzaMaxima === 'number' ? p.fuerzaMaxima : null,
      calibreBroca: typeof p.calibreBroca === 'number' ? p.calibreBroca : null,
      anguloMinimo: typeof p.anguloMinimo === 'number' ? p.anguloMinimo : null,
      anguloMaximo: typeof p.anguloMaximo === 'number' ? p.anguloMaximo : null,
      exigeBicortical: p.exigeBicortical === true,
      exigeCompresion: p.exigeCompresion === true,
      tornillosMinimos: typeof p.tornillosMinimos === 'number' ? p.tornillosMinimos : null,
      musculoDelPlano: texto(p.musculoDelPlano),
      accionDelPlano: p.accionDelPlano === 'separar' ? ('separar' as const) : p.accionDelPlano === 'cortar' ? ('cortar' as const) : null,
    }
    // El relleno va **antes** de la deducción, y no al revés: la columna tiene
    // `DEFAULT 'instrumento'`, así que una fila sin objetivo no es una fila que
    // calle, es una fila a la que no le llegó el valor por otro camino. Tratar
    // ese hueco como silencio dejaría que las tolerancias hablaran —y las lleva
    // puestas toda fila, a 5— convirtiéndola en una reducción imposible.
    const guardado = (texto(p.objetivo) ?? 'instrumento') as Objetivo

    return {
      // El identificador de fila lo pone Payload; si falta —un caso recién
      // escrito y no guardado— sirve la posición, que es estable dentro de una
      // misma lectura.
      id: texto(p.id) ?? `paso-${i}`,
      titulo: texto(p.titulo) ?? `Paso ${i + 1}`,
      // Lo que cruza al navegador es el objetivo **deducido**, no el guardado.
      //
      // El motor mide por `objetivoDelPaso`, pero la consola pinta sus mandos
      // —el botón de borrar el trazo, los giros de la angulación, el deslizador
      // de la fuerza— comparando `paso.objetivo` a pelo. Mientras la deducción
      // no cambiaba nada los dos coincidían. Cruzando el valor guardado no
      // coincidirían: un paso antiguo con su rango de fuerza escrito y el
      // objetivo en 'instrumento' —que es lo que la migración de D-059 dejó en
      // toda fila anterior— se mediría por la fuerza sin enseñar el mando con
      // que graduarla, y como `fuerzaInicial` cae dentro del rango por
      // construcción, se aprobaría solo mientras el residente lee una
      // instrucción que habla de un control que no está.
      //
      // Se resuelve aquí, que es el único paso entre la base y el navegador, y
      // no repitiendo la deducción en cada `if` de la consola: dos sitios que
      // deciden lo mismo por separado acaban decidiendo distinto, que es
      // exactamente lo que pasó.
      objetivo: objetivoDelPaso({ ...rangos, objetivo: guardado }),
      instrumento: idDeRelacion(p.instrumento),
      instrumentoNombre: nombreDeRelacion(p.instrumento),
      faseNombre: nombreDeRelacion(p.fase),
      puntos: numero(p.puntos, 10),
      ...rangos,
      exito: texto(p.exito),
      insuficiente: texto(p.insuficiente),
      excesivo: texto(p.excesivo),
      descripcion: p.descripcion,
      riesgo: p.riesgo,
      muestra,
    }
  })
}

/** Un instrumento poblado, tal como lo devuelve Payload, a lo que ve la bandeja. */
function instrumentoDeBandeja(bruto: unknown): InstrumentoDeBandeja | null {
  if (!bruto || typeof bruto !== 'object') return null
  const doc = bruto as Documento
  const id = idDeRelacion(doc)
  const nombre = texto(doc.nombre)
  if (!id || !nombre) return null
  const modelo = doc.modelo
  return {
    id,
    nombre,
    icono: texto(doc.icono) ?? 'generico',
    // El «para qué sirve» del catálogo. Se escribía desde el primer día y no
    // llegaba a ninguna pantalla: el residente elegía instrumento sin poder
    // leer para qué era ninguno.
    descripcion: texto(doc.descripcion),
    // La categoría del catálogo («Corte y disección», «Suturas y cierre»…): la
    // bandeja se recorre por ella, como el instrumentador ordena la mesa, y no
    // como una lista plana de cuarenta cuadros (D-167).
    categoria: texto(doc.categoria),
    // El identificador con que se reconoce qué hace en la escena (corta,
    // separa, perfora): ver `comportamientoDelInstrumento`.
    slug: texto(doc.slug),
    // Lo que el editor escribió en el instrumento y el modelo no dice (P-004 E6): los orificios de una placa y el largo de un tornillo.
    orificios: typeof doc.orificios === 'number' ? doc.orificios : null,
    largoMm: typeof doc.largoMm === 'number' ? doc.largoMm : null,
    // El tipo de tornillo que escribió el editor (P-004 E9): parte la bandeja en subgrupos; sin él se deduce del nombre.
    tipoDeTornillo: typeof doc.tipoDeTornillo === 'string' ? doc.tipoDeTornillo : null,
    // Lo que el caso no declaró pero la placa necesita (P-003 E6): se enseña marcado «para esta placa».
    paraLaPlaca: doc.__paraLaPlaca === true ? true : undefined,
    // Lo que está en la bandeja porque la mesa es completa y no porque el caso lo pida (P-004 E3).
    porOmision: doc.__porOmision === true ? true : undefined,
    // El modelo del instrumento viaja como dirección, no como documento: la
    // consola solo necesita saber de dónde bajarlo, y solo baja el del que el
    // residente tiene en la mano.
    modeloUrl:
      modelo && typeof modelo === 'object' ? texto((modelo as Documento).url) : null,
    // Y con la dirección, la pose que el traumatólogo capturó en la ficha de
    // ese modelo. Aplanada por el mismo motivo: al navegador no cruza el
    // documento del modelo, solo lo que la consola necesita de él.
    //
    // **Esta es la línea que cierra el cable.** `encuadreDelModelo` está
    // declarado y leído en `ConsolaQuirurgica.tsx`, y esta función es el único
    // sitio del repositorio donde se construye un `InstrumentoDeBandeja`: sin
    // escribirlo aquí el campo llegaba siempre `undefined`, `encuadreVigente`
    // devolvía `undefined` y el visor caía en `Bounds`, o sea que la pose no
    // llegaba y no había ningún error que lo dijera. La consola quedaba
    // «lista» y muerta, que es el patrón que más ha costado en este
    // repositorio: tres apariciones de `encuadreDelModelo` y las tres en el
    // lector.
    //
    // Aquí se pasa el grupo tal cual y **no** se decide nada: quien decide es
    // `encuadreVigente`, en la consola. Un grupo entero a nulos —lo que
    // `depurarCampos` deja al guardar desde el panel sin encuadrar— tiene que
    // salir de aquí como objeto y que la regla lo traduzca a «no dice nada»;
    // adivinarlo aquí sería la segunda copia de esa decisión.
    //
    // Llega poblado porque el caso se lee con `depth: 2`
    // (`src/app/(frontend)/simulador/[id]/page.tsx`), la misma lectura que ya
    // trae la `url` de arriba. Con `depth: 1` el modelo sería un número, esto
    // saldría nulo y el instrumento se abriría como siempre: menos de lo que
    // se quiere, pero no un fallo.
    encuadreDelModelo:
      modelo && typeof modelo === 'object'
        ? (((modelo as Documento).encuadre as Encuadre | null | undefined) ?? null)
        : null,
    // Lo que el administrador retocó en el taller (D-165): partes ocultas,
    // colores, piezas corridas y con qué abre cada articulación. Pasa por
    // `ajustesValidos` aunque salga de nuestra propia base: es un json libre
    // y la consola lo entrega a un visor que se fía de su forma.
    ajustes: doc.ajustes ? ajustesValidos(doc.ajustes) : null,
  }
}

/**
 * La bandeja del caso.
 *
 * **Nunca es el catálogo entero:** una bandeja con los cuarenta instrumentos del
 * hospital no enseña a elegir. Y nunca deja fuera lo que un paso necesita, por
 * mucho que el autor se descuide al declararla: un caso con un paso cuyo
 * instrumento no está en la bandeja no se puede terminar, y no habría forma de
 * saber por qué.
 *
 * Entre esas dos cosas, manda lo que el caso declare. Declararla sirve sobre
 * todo para **añadir señuelos**: instrumentos que no usa ningún paso pero que en
 * pabellón estarían ahí. Sin ellos, la bandeja solo contiene respuestas
 * correctas y acertar es elegir entre lo que ya se sabe que sirve.
 *
 * Se ordena por nombre y no por el orden de los pasos, para que la posición de
 * cada uno no delate cuál toca ahora.
 */
function bandejaDelCaso(pasos: Documento[], declarado: unknown): InstrumentoDeBandeja[] {
  const porId = new Map<string, InstrumentoDeBandeja>()

  const agregar = (bruto: unknown) => {
    const instrumento = instrumentoDeBandeja(bruto)
    if (instrumento && !porId.has(instrumento.id)) porId.set(instrumento.id, instrumento)
  }

  for (const bruto of Array.isArray(declarado) ? declarado : []) agregar(bruto)
  for (const crudo of pasos) agregar((crudo as Documento)?.instrumento)

  return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Lo que hay en la bandeja de un caso, declarado o pedido por un paso: los documentos de instrumento que llegaron poblados. */
function instrumentosDelCaso(documento: Documento): unknown[] {
  return [
    ...(Array.isArray(documento.instrumental) ? documento.instrumental : []),
    ...(Array.isArray(documento.pasos) ? (documento.pasos as Documento[]).map((p) => p?.instrumento) : []),
  ]
}

/**
 * Los `slug` de las placas que hay en la bandeja de un caso, para saber qué compañeros hay que traer (P-003 E6). Las
 * relaciones vienen pobladas (`depth: 2`); una que llegue como número se ignora: sin documento no hay `slug`.
 */
export function slugsDePlacasDelCaso(documento: Documento): string[] {
  const salida = new Set<string>()
  for (const b of instrumentosDelCaso(documento)) {
    const slug = b && typeof b === 'object' ? texto((b as Documento).slug) : null
    if (slug && quePuedeColocar({ slug })?.tipo === 'placa') salida.add(slug)
  }
  return [...salida]
}

/**
 * Los `slug` que faltan en la bandeja: los compañeros de sus placas (tornillos, brocas, medidor, destornillador) que el
 * caso no trae. «No encuentro los tornillos»: la bandeja solo enseñaba lo declarado, y un caso con placa y sin tornillos
 * no los mostraba. Devuelve los que hay que pedir al catálogo.
 */
export function companerosQueFaltan(documento: Documento): string[] {
  const yaEstan = new Set(
    instrumentosDelCaso(documento)
      .map((b) => (b && typeof b === 'object' ? texto((b as Documento).slug) : null))
      .filter((x): x is string => Boolean(x)),
  )
  return companerosDeLasPlacas(slugsDePlacasDelCaso(documento)).filter((c) => !yaEstan.has(c))
}

/** El documento del caso con los compañeros de su placa añadidos a la bandeja, marcados como tales. */
export function conCompanerosDeLaPlaca(documento: Documento, companeros: readonly Documento[]): Documento {
  if (companeros.length === 0) return documento
  const declarados = Array.isArray(documento.instrumental) ? documento.instrumental : []
  return { ...documento, instrumental: [...declarados, ...companeros.map((c) => ({ ...c, __paraLaPlaca: true }))] }
}

/**
 * Qué ve el residente en la bandeja (P-004 E3): `completa` —todo el catálogo, que es lo que pidió Cristóbal— o
 * `acotada` —lo que el editor eligió y lo que piden los pasos—. Un valor que no se entiende cuenta como completa:
 * es el de un caso nuevo, y el que una bandeja sin elegir daría de todas formas.
 */
export const bandejaDelDocumento = (documento: Documento): 'completa' | 'acotada' =>
  documento.bandeja === 'acotada' ? 'acotada' : 'completa'

/**
 * El documento del caso con toda la mesa en la bandeja, si la bandeja es completa (P-004 E3).
 *
 * `catalogo` son los documentos de instrumental que el servidor trajo (`traerTodaLaMesa`). Lo que el caso ya traía
 * —declarado, pedido por un paso o compañero de la placa— se queda como estaba, sin marca; lo demás entra marcado
 * `__porOmision`. Con la bandeja acotada, o sin catálogo, el documento vuelve igual.
 */
export function conTodaLaMesa(documento: Documento, catalogo: readonly Documento[]): Documento {
  if (bandejaDelDocumento(documento) === 'acotada' || catalogo.length === 0) return documento
  const yaEstan = new Set(
    instrumentosDelCaso(documento)
      .map((b) => (b && typeof b === 'object' ? String((b as Documento).id ?? '') : ''))
      .filter(Boolean),
  )
  const declarados = Array.isArray(documento.instrumental) ? documento.instrumental : []
  const nuevos = catalogo.filter((c) => !yaEstan.has(String(c.id ?? ''))).map((c) => ({ ...c, __porOmision: true }))
  return { ...documento, instrumental: [...declarados, ...nuevos] }
}

export function casoParaLaConsola(documento: Documento): CasoDeConsola {
  const modelo = documento.modelo
  const desplazamiento = (documento.desplazamientoInicial ?? {}) as Documento

  return {
    nombre: texto(documento.nombre) ?? 'Caso sin nombre',
    codigo: codigoDelCaso(documento),
    hueso: nombreDeRelacion(documento.hueso),
    clasificacion: nombreDeRelacion(documento.clasificacion),
    tecnica: nombreDeRelacion(documento.tecnica),
    modeloUrl: modelo && typeof modelo === 'object' ? texto((modelo as Documento).url) : null,
    milimetrosPorUnidad: escalaPositiva(documento.milimetrosPorUnidad, 1000),
    ejeLargo: (texto(documento.ejeLargo) ?? 'y') as EjeLargo,
    piezas: piezasDelCaso(documento),
    desplazamientoInicial: {
      x: numero(desplazamiento.x, 0),
      y: numero(desplazamiento.y, 0),
      z: numero(desplazamiento.z, 0),
      giroX: numero(desplazamiento.giroX, 0),
      giroY: numero(desplazamiento.giroY, 0),
      giroZ: numero(desplazamiento.giroZ, 0),
    },
    pasos: pasosDelCaso(documento),
    bandeja: bandejaDelDocumento(documento),
    instrumental: bandejaDelCaso(
      Array.isArray(documento.pasos) ? (documento.pasos as Documento[]) : [],
      documento.instrumental,
    ),
  }
}

// ------------------------------------------------------- desde el formulario

/**
 * Un instrumento del catálogo tal como lo necesita el editor: con su modelo y
 * sus retoques ya a mano. Sale de `listarInstrumental` (`acciones/instrumental`).
 */
export interface InstrumentoParaElEditor {
  id: string
  nombre: string
  slug?: string
  icono: string
  descripcion: string
  categoria: string
  modeloUrl: string | null
  ajustes: AjustesDeInstrumento | null
}

/** Una opción de relación del formulario: lo único que de ella se necesita. */
export interface OpcionDeCatalogo {
  id: string
  etiqueta: string
  url?: string
}

/**
 * El caso tal como lo vería el residente, **a partir de lo que hay escrito en
 * el formulario ahora mismo** (D-166).
 *
 * Es lo que permite que el editor del caso sea la consola y no una imitación:
 * el formulario guarda las relaciones como identificadores sueltos —o como
 * documentos enteros cuando llegan de la base—, y la consola quiere los
 * documentos poblados. Aquí se vuelven a poblar con lo que el formulario ya
 * descargó y se le entrega todo a `casoParaLaConsola`, la misma función que usa
 * la página del residente: así no hay dos traducciones de un caso que puedan
 * separarse.
 *
 * La bandeja es la misma que ve el residente: los instrumentos de los pasos
 * más los que el autor eligió. El catálogo entero no se pinta —se pintaba, y el
 * editor armaba algo que no se parecía a lo que vería quien recorre el caso—;
 * va aparte en `catalogoDelEditor` para el botón «Añadir a la bandeja».
 */
export function casoDesdeElFormulario(
  valores: Documento,
  contexto: {
    opciones: Record<string, OpcionDeCatalogo[] | undefined>
    instrumentos: InstrumentoParaElEditor[]
  },
): CasoDeConsola {
  const buscar = (coleccion: string, bruto: unknown): OpcionDeCatalogo | undefined => {
    const id = idDeRelacion(bruto)
    return id ? contexto.opciones[coleccion]?.find((o) => o.id === id) : undefined
  }
  const poblarNombre = (coleccion: string, bruto: unknown) => {
    const opcion = buscar(coleccion, bruto)
    if (opcion) return { id: opcion.id, nombre: opcion.etiqueta }
    // Un documento que ya venía poblado de la base se respeta tal cual.
    return typeof bruto === 'object' && bruto !== null ? bruto : null
  }
  const instrumentoPoblado = (bruto: unknown) => {
    const id = idDeRelacion(bruto)
    const dato = id ? contexto.instrumentos.find((i) => i.id === id) : undefined
    return dato ? { id: dato.id, nombre: dato.nombre } : null
  }

  const modelo = buscar('modelos-3d', valores.modelo)
  const completa = bandejaDelDocumento(valores) === 'completa'
  const enLaBandeja = new Set<string>()
  for (const bruto of Array.isArray(valores.instrumental) ? valores.instrumental : []) {
    const id = idDeRelacion(bruto)
    if (id) enLaBandeja.add(id)
  }

  const pasos = (Array.isArray(valores.pasos) ? (valores.pasos as Documento[]) : []).map((paso) => {
    const instrumento = instrumentoPoblado(paso.instrumento)
    if (instrumento) enLaBandeja.add(instrumento.id)
    return {
      ...paso,
      // Un paso recién añadido todavía no tiene el identificador de Payload:
      // sirve su clave de fila, que no cambia al reordenarlo, a diferencia de la
      // posición con que `pasosDelCaso` se las arregla.
      id: paso.id ?? paso._clave,
      instrumento,
      fase: poblarNombre('fases-quirurgicas', paso.fase),
    }
  })

  const base = casoParaLaConsola({
    ...valores,
    modelo: modelo ? { id: modelo.id, url: modelo.url ?? null } : null,
    hueso: poblarNombre('huesos-ao', valores.hueso),
    clasificacion: poblarNombre('clasificaciones-ao', valores.clasificacion),
    tecnica: poblarNombre('tecnicas-quirurgicas', valores.tecnica),
    pasos,
    // El catálogo entero se pone abajo; aquí no se arma la bandeja del caso.
    instrumental: [],
    bandeja: valores.bandeja,
  })

  const comoInstrumento = (i: InstrumentoParaElEditor) => ({
    id: i.id,
    nombre: i.nombre,
    icono: i.icono,
    descripcion: i.descripcion || null,
    modeloUrl: i.modeloUrl,
    encuadreDelModelo: null,
    ajustes: i.ajustes,
    categoria: i.categoria,
    slug: i.slug ?? null,
    // Con la mesa completa todo está en la bandeja del residente (P-004 E3).
    enLaBandejaDelCaso: completa || enLaBandeja.has(i.id),
  })
  return {
    ...base,
    // La bandeja que se pinta es solo la del caso —los instrumentos que el autor eligió y los que piden los
    // pasos—, ordenada por nombre como la ve el residente. El editor veía antes el catálogo entero ahí, y lo
    // que armaba no se parecía a lo que vería quien recorre el caso: «solo las herramientas que selecciono
    // tienen que aparecer en la interfaz del simulador».
    instrumental: contexto.instrumentos
      .filter((i) => completa || enLaBandeja.has(i.id))
      .map(comoInstrumento)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    // El catálogo entero queda aparte, solo para el botón «Añadir a la bandeja».
    catalogoDelEditor: contexto.instrumentos.map(comoInstrumento),
  }
}
