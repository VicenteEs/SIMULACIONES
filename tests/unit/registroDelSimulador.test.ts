import { describe, it, expect } from 'vitest'
import type { Field } from 'payload'
import { Actividad } from '@/collections/Actividad'
import { RESULTADOS, evaluarGesto } from '@/lib/simulador'

/**
 * Lo que el simulador deja escrito: el puntaje y las complicaciones.
 *
 * Hasta hoy los dos vivían en estado local de `ConsolaQuirurgica.tsx` y morían
 * al recargar, con dos consecuencias que se pagaban juntas: pasarse y quedarse
 * corto acababan valiendo lo mismo —la distinción solo existía en un registro
 * de diez líneas que se iba con la pestaña— y el «registro de complicaciones»
 * que promete la portada no estaba en ninguna parte. El traumatólogo decidió
 * que sobrevivan, así que ahora son columnas de `actividad`.
 *
 * Estas pruebas miran la declaración, no el efecto: escribir una fila de verdad
 * exige base de datos y de eso se ocupan las de integración. Lo que sí se
 * comprueba aquí, y es lo que de verdad se puede torcer, es que la columna
 * acepte exactamente los desenlaces que el motor sabe producir. Esas dos listas
 * viven en archivos distintos y nada más que esto las ata: el día que se
 * separen, el residente termina el caso y la escritura se rechaza.
 */

const buscar = (campos: Field[], nombre: string): Field | undefined =>
  campos.find((campo) => 'name' in campo && campo.name === nombre)

const complicaciones = buscar(Actividad.fields, 'complicaciones') as
  | (Field & { fields?: Field[]; maxRows?: number })
  | undefined

const enLaFila = (nombre: string) => buscar(complicaciones?.fields ?? [], nombre)

/** La validación del desenlace, tal y como la llamará Payload al guardar. */
const validarDesenlace = (valor: unknown): string | true => {
  const declarada = (enLaFila('resultado') as { validate?: unknown }).validate
  const validar = declarada as (v: unknown, opciones: unknown) => string | true
  return validar(valor, {})
}

describe('la actividad guarda lo que pasó en el simulador', () => {
  it('declara el puntaje, su máximo y la lista de complicaciones', () => {
    // Se nombran los tres: es lo que otro lote va a cablear desde la consola, y
    // una prueba que solo dijera «hay campos nuevos» no serviría de contrato.
    expect(buscar(Actividad.fields, 'puntaje')?.type).toBe('number')
    expect(buscar(Actividad.fields, 'puntajeMaximo')?.type).toBe('number')
    expect(complicaciones?.type).toBe('array')
  })

  it('una ficha que no es una cirugía puede no traer nada de esto', () => {
    // Las cuatro colecciones restantes escriben en esta misma tabla, y la fila
    // de una patología leída no tiene puntaje ninguno. Obligatorio aquí
    // significaría que marcar como leída una ficha de texto falla.
    for (const nombre of ['puntaje', 'puntajeMaximo', 'complicaciones']) {
      const campo = buscar(Actividad.fields, nombre) as { required?: boolean }
      expect(campo.required, `${nombre} no puede ser obligatorio`).not.toBe(true)
    }
  })

  it('el puntaje no arranca en cero, para poder distinguir el caso no jugado', () => {
    // Con `defaultValue: 0` toda fila de lectura nacería con un cero y el panel
    // contaría partidas que nadie jugó. El nulo es el «todavía no».
    const puntaje = buscar(Actividad.fields, 'puntaje') as { defaultValue?: unknown }
    expect(puntaje.defaultValue).toBeUndefined()
  })

  it('cada complicación dice de qué paso fue, y el identificador no es opcional', () => {
    // Sin el paso, la lista es un montón de frases sueltas: el registro existe
    // para poder volver al gesto que dañó.
    expect((enLaFila('paso') as { required?: boolean }).required).toBe(true)
    // El número y el título van al lado porque el identificador deja de
    // encontrar nada en cuanto el traumatólogo reordena o borra un paso.
    expect(enLaFila('numero')?.type).toBe('number')
    expect(enLaFila('titulo')?.type).toBe('text')
    expect(enLaFila('detalle')?.type).toBe('textarea')
  })

  it('la lista tiene tope, por si el navegador se queda en bucle', () => {
    expect(complicaciones?.maxRows).toBeGreaterThan(0)
  })
})

describe('el desenlace que se guarda es uno de los del motor', () => {
  it('acepta todos los que `RESULTADOS` declara, menos el que sale bien', () => {
    // Se recorre la lista del motor en vez de nombrar dos: así un desenlace
    // nuevo entra vigilado solo, que es justo lo que un `select` —un enum de
    // PostgreSQL— no podría hacer sin otra migración.
    for (const resultado of Object.values(RESULTADOS)) {
      if (resultado === RESULTADOS.CORRECTO) continue
      expect(validarDesenlace(resultado), resultado).toBe(true)
    }
  })

  it('rechaza «correcto» y cualquier cosa inventada', () => {
    // Una complicación es por definición un gesto que dañó. Si llega un
    // `correcto`, quien escribe se equivocó de lista y hay que verlo.
    expect(typeof validarDesenlace(RESULTADOS.CORRECTO)).toBe('string')
    expect(typeof validarDesenlace('hemorragia')).toBe('string')
    expect(typeof validarDesenlace(7)).toBe('string')
  })

  it('deja pasar el vacío: no toda fila trae desenlace', () => {
    expect(validarDesenlace(undefined)).toBe(true)
    expect(validarDesenlace(null)).toBe(true)
    expect(validarDesenlace('')).toBe(true)
  })

  it('lo que el motor marca como complicación se puede guardar tal cual', () => {
    // El eslabón que de verdad importa, y el único que recorre los dos lados:
    // se evalúa un gesto que daña y el valor que sale del motor se le da a la
    // columna sin traducir. Los dos casos son los dos que hay hoy —la incisión
    // de más y la fuerza de más—, que son los que D-059 separó del reintento.
    const trazoLargo = evaluarGesto(
      { objetivo: 'trazo', trazoMinimo: 8, trazoMaximo: 15 },
      { instrumento: 'bisturi', trazo: 40 },
    )
    const fuerzaExcesiva = evaluarGesto(
      { objetivo: 'fuerza', fuerzaMinima: 8, fuerzaMaxima: 20 },
      { instrumento: 'martillo', fuerza: 90 },
    )

    for (const evaluacion of [trazoLargo, fuerzaExcesiva]) {
      expect(evaluacion.complicacion, evaluacion.resultado).toBe(true)
      expect(validarDesenlace(evaluacion.resultado), evaluacion.resultado).toBe(true)
      // El mensaje con sus números es lo que va a `detalle`: es lo único de la
      // fila que dice *cuánto* se pasó.
      expect(evaluacion.mensaje.length).toBeGreaterThan(0)
    }
  })
})
