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

import { camposDe, type Campo, type EsquemaDeColeccion } from './esquema'
import { bloqueDe, esBloqueConocido } from './bloques'
import { desdeLexical, estaVacio, haciaLexical } from '@/lib/textoRico'

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
      // El respaldo lo dice el campo, no el orden de la lista: `opciones[0]`
      // es la primera opción de un desplegable, que se ordena para leerlo y no
      // para decidir. Aquí ese respaldo es lo único que actúa, porque
      // `depurarCampos` escribe siempre la clave y Payload solo aplica su
      // `defaultValue` cuando el valor llega `undefined`.
      const respaldo = campo.porOmision ?? campo.opciones[0]?.valor ?? null
      // Un valor fuera de la lista se cambia por el respaldo, no se conserva:
      // guardar un «tono» inventado deja un bloque que el renderizador público
      // no sabe pintar.
      return valida ? texto : (campo.requerido ? respaldo : null)
    }

    case 'casilla':
      return valor === true

    case 'relacion':
      // Una relación múltiple es una lista de identificadores, no uno.
      // `comoIdentificador` de un arreglo devuelve null, así que sin esta rama
      // la bandeja declarada de un caso se guardaba **siempre vacía**: el panel
      // respondía «Borrador guardado» y lo que el traumatólogo había marcado
      // desaparecía sin un solo aviso.
      if (campo.multiple) {
        const lista = Array.isArray(valor) ? valor : []
        return lista.map(comoIdentificador).filter((v) => v !== null)
      }
      return comoIdentificador(valor)

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
  const campos = camposDe(esquema)
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
 * ¿Este campo está sin llenar?
 *
 * Un texto rico vacío no es `null` ni `''`: `haciaLexical` siempre devuelve un
 * árbol con un párrafo en blanco dentro, de modo que la prueba de forma no
 * podía ser cierta **nunca** para un campo `rico`. «Técnica» sin escribir
 * pasaba de largo y moría después en el validador de Payload, que contesta con
 * el nombre interno del campo. Por eso a un texto rico se le pregunta por su
 * texto y no por su forma.
 */
const sinLlenar = (campo: Campo, valor: unknown): boolean => {
  if (campo.tipo === 'rico') return estaVacio(valor)
  return (
    valor === null ||
    valor === undefined ||
    valor === '' ||
    (Array.isArray(valor) && valor.length === 0)
  )
}

/**
 * Comprueba lo obligatorio y devuelve los problemas en español.
 *
 * Payload también valida, pero su mensaje llega en forma de excepción con el
 * nombre técnico del campo. Esto permite señalar «Falta el nombre de la
 * patología» antes de intentar guardar.
 *
 * Desciende a listas, grupos y bloques: los obligatorios de dentro de una fila
 * —`pasos[].titulo`, `piezas[].nodo`, `fases[].cuando`— o de dentro de un
 * bloque —el `texto` de una advertencia— son los que más cuesta encontrar en
 * pantalla, y eran justo los que esta función no miraba, porque recorría solo
 * el primer nivel. La fila se nombra por su posición, que es como se ve en el
 * editor: «Falta «objetivo» en paso 3», y no `pasos.2.objetivo`.
 *
 * `profundo` es lo que separa publicar de guardar (D-011). Payload se salta lo
 * obligatorio cuando escribe con `draft: true`, y eso está puesto a propósito:
 * el traumatólogo escribe la ficha a lo largo de varios días y «Guardar
 * borrador» tiene que aceptar una maniobra con la técnica todavía en blanco o
 * una cirugía con una fila de pasos a medias. Si la revisión profunda corriera
 * también ahí, el botón devolvería «Falta «técnica».» y no guardaría nada: lo
 * escrito esa tarde se perdería al cerrar la pestaña. Con `profundo: false`
 * solo se avisa de lo que se ve de un vistazo en el primer nivel; el descenso a
 * filas, a bloques y al interior de un texto rico queda para el momento de
 * publicar, que es cuando Payload sí va a exigirlos.
 */
export function faltantes(
  esquema: EsquemaDeColeccion,
  documento: Record<string, unknown>,
  opciones: { profundo?: boolean } = {},
): string[] {
  const { profundo = true } = opciones
  const problemas: string[] = []

  const revisar = (campos: Campo[], origen: Record<string, unknown>, donde = '') => {
    for (const campo of campos) {
      const valor = origen[campo.nombre]
      // A un texto rico se le pregunta por su texto, y eso es mirar dentro del
      // árbol: cuenta como descenso y por tanto solo se juzga al publicar. Un
      // borrador tiene cuerpos sin escribir por definición.
      const juzgable = profundo || campo.tipo !== 'rico'
      if (campo.requerido && juzgable && sinLlenar(campo, valor)) {
        problemas.push(`Falta «${campo.etiqueta.toLowerCase()}»${donde}.`)
      }
      if (!profundo) continue
      if (campo.tipo === 'grupo') {
        revisar(campo.campos, (valor ?? {}) as Record<string, unknown>, donde)
      }
      if (campo.tipo === 'lista' && Array.isArray(valor)) {
        valor.forEach((fila, indice) =>
          revisar(
            campo.campos,
            (fila ?? {}) as Record<string, unknown>,
            // `donde` se arrastra porque una lista puede venir dentro de un
            // bloque: sin él, «Falta «desarrollo» en punto 1» no dice en cuál
            // de las cuatro listas clínicas de la ficha hay que mirar. En el
            // primer nivel `donde` es vacío y el mensaje no cambia.
            ` en ${campo.singular.toLowerCase()} ${indice + 1}${donde}`,
          ),
        )
      }
      // Los bloques son donde vive la mayor parte de la ficha (D-011: pila de
      // bloques ilimitada y reordenable), así que sin esta rama quedaba abierto
      // el mismo agujero que las otras dos cerraron: una advertencia sin texto
      // pasaba de largo y moría en el validador de Payload con «El siguiente
      // campo es inválido: definicion.0.texto», el nombre interno y el índice
      // crudo, que es justo el mensaje que esta función existe para evitar.
      if (campo.tipo === 'bloques' && Array.isArray(valor)) {
        valor.forEach((bruto, indice) => {
          const fila = (bruto ?? {}) as Record<string, unknown>
          const tipo = fila.blockType
          if (!esBloqueConocido(tipo)) return
          const bloque = bloqueDe(tipo)
          if (!bloque) return
          revisar(bloque.campos, fila, ` en ${bloque.nombre.toLowerCase()} ${indice + 1}${donde}`)
        })
      }
    }
  }

  revisar(camposDe(esquema), documento)
  return problemas
}

export const LIMITES = { MAXIMO_FILAS, MAXIMO_BLOQUES, MAXIMO_TEXTO }
