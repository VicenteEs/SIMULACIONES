import type { CasoDeConsola, InstrumentoDeBandeja, PasoDeConsola } from '@/components/simulador/ConsolaQuirurgica'
import type { PiezaDelCaso } from '@/components/simulador/LienzoQuirurgico'
import type { EjeLargo } from '@/lib/reduccion'

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

    return {
      // El identificador de fila lo pone Payload; si falta —un caso recién
      // escrito y no guardado— sirve la posición, que es estable dentro de una
      // misma lectura.
      id: texto(p.id) ?? `paso-${i}`,
      titulo: texto(p.titulo) ?? `Paso ${i + 1}`,
      objetivo: (texto(p.objetivo) ?? 'instrumento') as PasoDeConsola['objetivo'],
      instrumento: idDeRelacion(p.instrumento),
      instrumentoNombre: nombreDeRelacion(p.instrumento),
      faseNombre: nombreDeRelacion(p.fase),
      puntos: numero(p.puntos, 10),
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
      exito: texto(p.exito),
      insuficiente: texto(p.insuficiente),
      excesivo: texto(p.excesivo),
      descripcion: p.descripcion,
      riesgo: p.riesgo,
      muestra,
    }
  })
}

/**
 * La bandeja del caso.
 *
 * La forman los instrumentos que sus pasos declaran, no el catálogo entero: una
 * bandeja con los cuarenta instrumentos del hospital no enseña a elegir. Se
 * ordena como el catálogo y no como los pasos, para que la posición de cada uno
 * no delate cuál toca ahora.
 */
function bandejaDelCaso(pasos: Documento[]): InstrumentoDeBandeja[] {
  const porId = new Map<string, InstrumentoDeBandeja>()
  for (const crudo of pasos) {
    const instrumento = (crudo as Documento)?.instrumento
    if (!instrumento || typeof instrumento !== 'object') continue
    const doc = instrumento as Documento
    const id = idDeRelacion(doc)
    const nombre = texto(doc.nombre)
    if (!id || !nombre || porId.has(id)) continue
    porId.set(id, { id, nombre, icono: texto(doc.icono) ?? 'generico' })
  }
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
    milimetrosPorUnidad: numero(documento.milimetrosPorUnidad, 1000),
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
    instrumental: bandejaDelCaso(Array.isArray(documento.pasos) ? (documento.pasos as Documento[]) : []),
  }
}
