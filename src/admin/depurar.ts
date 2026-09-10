/**
 * Depuración de lo que envía el editor.
 *
 * El formulario del panel manda un objeto JSON completo. Es una acción de
 * servidor, o sea un extremo HTTP: cualquiera con sesión de editor puede
 * enviar el objeto que quiera, con los campos que quiera. Esta función
 * **reconstruye** el documento a partir del esquema en lugar de limpiar el que
 * llega: lo que no está descrito no existe, y por tanto no puede colarse un
 * `_status: "published"`, un `usuario` ajeno ni un campo interno de Payload.
 *
 * Es pura y se prueba entera. Es la pieza de la que depende que el editor
 * genérico no sea un agujero, así que conviene que siga siendo aburrida.
 */

import type { Campo, EsquemaDeColeccion } from './esquema'
import { bloqueDe, esBloqueConocido } from './bloques'
import { desdeLexical, haciaLexical } from '@/lib/textoRico'

/** Techos de tamaño. Ningún contenido real se acerca; un ataque, sí. */
const MAXIMO_FILAS = 500
const MAXIMO_BLOQUES = 200
const MAXIMO_TEXTO = 20_000

const comoTexto = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null
  const limpio = valor.slice(0, MAXIMO_TEXTO)
  return limpio.length > 0 ? limpio : null
}

const comoNumero = (valor: unknown): number | null => {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Identificador de un documento relacionado.
 *
 * Puede llegar como número (PostgreSQL), como texto (el formulario) o como el
 * documento entero ya poblado (lo que devuelve una lectura con profundidad).
 */
const comoIdentificador = (valor: unknown): string | number | null => {
  if (typeof valor === 'number' && Number.isInteger(valor)) return valor
  if (typeof valor === 'string') {
    // Un desplegable siempre entrega texto, pero las claves de PostgreSQL son
    // enteros: pasar «7» donde se espera 7 hace que Payload rechace la
    // relacion entera con un «campo invalido» que no explica nada.
    if (/^\d{1,15}$/.test(valor)) return Number(valor)
    if (/^[A-Za-z0-9_-]{1,64}$/.test(valor)) return valor
    return null
  }
  if (valor && typeof valor === 'object' && 'id' in valor) {
    return comoIdentificador((valor as { id: unknown }).id)
  }
  return null
}

function depurarCampo(campo: Campo, valor: unknown): unknown {
  switch (campo.tipo) {
    case 'texto':
      return comoTexto(typeof valor === 'string' ? valor.trim() : valor)

    case 'area':
      return comoTexto(valor)

    case 'numero': {
      const n = comoNumero(valor)
      if (n === null) return null
      if (campo.min !== undefined && n < campo.min) return campo.min
      if (campo.max !== undefined && n > campo.max) return campo.max
      return n
    }

    case 'seleccion': {
      const texto = typeof valor === 'string' ? valor : ''
      const valida = campo.opciones.some((o) => o.valor === texto)
      // Un valor fuera de la lista se cambia por el primero, no se conserva:
      // guardar un «tono» inventado deja un bloque que el renderizador público
      // no sabe pintar.
      return valida ? texto : (campo.requerido ? campo.opciones[0]?.valor ?? null : null)
    }

    case 'casilla':
      return valor === true

    case 'relacion':
    case 'archivo':
      return comoIdentificador(valor)

    case 'rico':
      // Se traduce en las dos direcciones a propósito: cualquier árbol que
      // llegue sale convertido en uno que el editor sabe representar y el
      // renderizador sabe pintar. Un nodo inventado no sobrevive al viaje.
      return haciaLexical(desdeLexical(valor))

    case 'grupo': {
      const origen = (valor ?? {}) as Record<string, unknown>
      return depurarCampos(campo.campos, origen)
    }

    case 'lista': {
      if (!Array.isArray(valor)) return []
      return valor.slice(0, MAXIMO_FILAS).map((fila) => {
        const origen = (fila ?? {}) as Record<string, unknown>
        const depurada = depurarCampos(campo.campos, origen)
        // El identificador de fila lo pone Payload; se conserva si ya existía
        // para que actualizar no borre y recree cada fila en la base.
        const id = typeof origen.id === 'string' ? origen.id : undefined
        return id ? { ...depurada, id } : depurada
      })
    }

    case 'bloques': {
      if (!Array.isArray(valor)) return []
      const depurados: Record<string, unknown>[] = []
      for (const bruto of valor.slice(0, MAXIMO_BLOQUES)) {
        const origen = (bruto ?? {}) as Record<string, unknown>
        if (!esBloqueConocido(origen.blockType)) continue
        const esquema = bloqueDe(origen.blockType as string)
        if (!esquema) continue
        const id = typeof origen.id === 'string' ? origen.id : undefined
        depurados.push({
          blockType: esquema.slug,
          ...depurarCampos(esquema.campos, origen),
          ...(id ? { id } : {}),
        })
      }
      return depurados
    }

    default:
      return null
  }
}

export function depurarCampos(
  campos: Campo[],
  origen: Record<string, unknown>,
): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of campos) {
    salida[campo.nombre] = depurarCampo(campo, origen[campo.nombre])
  }
  return salida
}

/**
 * Documento listo para entregarle a Payload.
 *
 * Solo campos del esquema. El estado de publicación no sale de aquí: lo decide
 * la acción de servidor según lo que el usuario tenga permitido, no según lo
 * que venga en el formulario.
 */
export function depurarDocumento(
  esquema: EsquemaDeColeccion,
  origen: Record<string, unknown>,
): Record<string, unknown> {
  const campos = esquema.secciones.flatMap((s) => s.campos)
  return depurarCampos(campos, origen)
}

/**
 * El mismo documento, pero sin los identificadores de sus filas y bloques.
 *
 * Es lo que hace falta para **copiar** y no para guardar. Cada bloque y cada
 * fila de un documento lleva un `id` propio que en PostgreSQL es la clave
 * primaria de su tabla: al guardar, ese identificador es lo que dice «esta es
 * la misma fila de antes» y hay que conservarlo. Al duplicar, en cambio, viaja
 * dentro de la copia y Payload rechaza el documento entero con «El siguiente
 * campo es inválido: id», de modo que duplicar cualquier ficha con contenido
 * fallaba siempre. Una ficha de demostración con dos bloques y una lista
 * arrastraba catorce.
 *
 * No toca el identificador del documento: aquí solo llegan campos del esquema.
 */
export function sinIdentificadoresDeFila(documento: Record<string, unknown>): Record<string, unknown> {
  const limpiar = (valor: unknown): unknown => {
    if (Array.isArray(valor)) return valor.map(limpiar)
    if (valor === null || typeof valor !== 'object') return valor
    const salida: Record<string, unknown> = {}
    for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
      if (clave === 'id') continue
      salida[clave] = limpiar(contenido)
    }
    return salida
  }

  const salida: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(documento)) salida[clave] = limpiar(valor)
  return salida
}

/**
 * Comprueba lo obligatorio y devuelve los problemas en español.
 *
 * Payload también valida, pero su mensaje llega en forma de excepción con el
 * nombre técnico del campo. Esto permite señalar «Falta el nombre de la
 * patología» antes de intentar guardar.
 */
export function faltantes(
  esquema: EsquemaDeColeccion,
  documento: Record<string, unknown>,
): string[] {
  const problemas: string[] = []
  for (const campo of esquema.secciones.flatMap((s) => s.campos)) {
    if (!campo.requerido) continue
    const valor = documento[campo.nombre]
    const vacio =
      valor === null ||
      valor === undefined ||
      valor === '' ||
      (Array.isArray(valor) && valor.length === 0)
    if (vacio) problemas.push(`Falta «${campo.etiqueta.toLowerCase()}».`)
  }
  return problemas
}

export const LIMITES = { MAXIMO_FILAS, MAXIMO_BLOQUES, MAXIMO_TEXTO }
