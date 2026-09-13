import type { CasoDeConsola, InstrumentoDeBandeja, PasoDeConsola } from '@/components/simulador/ConsolaQuirurgica'
import type { PiezaDelCaso } from '@/components/simulador/LienzoQuirurgico'
// El tipo y nada más: un `import type` se borra al compilar, así que de aquí no
// entra una línea de código en ningún paquete. Se pide a
// `aritmeticaDelEncuadre` y no a `@/lib/encuadre` por costumbre defendida en
// aquel archivo —el segundo abre con `import * as THREE`—, aunque siendo solo
// tipo daría igual: escribir la dirección buena aquí evita que el día que
// alguien necesite además una función copie la dirección mala.
import type { Encuadre } from '@/lib/aritmeticaDelEncuadre'
import type { EjeLargo } from '@/lib/reduccion'
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
    instrumental: bandejaDelCaso(
      Array.isArray(documento.pasos) ? (documento.pasos as Documento[]) : [],
      documento.instrumental,
    ),
  }
}
