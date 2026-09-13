import { describe, it, expect } from 'vitest'
import { Cirugias } from '@/collections/Cirugias'

/**
 * Un paso que declara qué evalúa y no trae con qué medirlo.
 *
 * `evaluarGesto` solo compara contra los topes que existen, así que un paso con
 * objetivo «trazo» y las dos longitudes vacías aprueba una incisión de 1 mm, y
 * uno con objetivo «fuerza» y los dos topes vacíos aprueba 0 N. Se ve evaluado
 * y no evalúa nada. La regla vive en la colección porque es el único punto por
 * el que pasan todas las escrituras, y se prueba aquí porque quitarla no rompe
 * nada visible: los casos se seguirían guardando igual.
 */

interface CampoDeEsquema {
  name?: string
  fields?: CampoDeEsquema[]
  validate?: unknown
}

function buscarCampo(campos: CampoDeEsquema[] | undefined, nombre: string): CampoDeEsquema | undefined {
  for (const campo of campos ?? []) {
    if (campo.name === nombre) return campo
    const dentro = buscarCampo(campo.fields, nombre)
    if (dentro) return dentro
  }
  return undefined
}

type Validacion = (
  valor: string | null | undefined,
  opciones: { siblingData?: unknown },
) => string | true

const campoObjetivo = buscarCampo(Cirugias.fields as unknown as CampoDeEsquema[], 'objetivo')

/** Lo que hará Payload al publicar: llamar a `validate` con la fila del paso. */
const validar = (valor: string | null, paso: Record<string, unknown> = {}) =>
  (campoObjetivo!.validate as Validacion)(valor, { siblingData: paso })

describe('un paso quirúrgico no puede decir que mide algo sin decir cuánto', () => {
  it('el campo «objetivo» trae su validación', () => {
    expect(campoObjetivo, 'el guion ya no declara un objetivo por paso').toBeDefined()
    expect(typeof campoObjetivo!.validate).toBe('function')
  })

  // Declarar `validate` en un `select` no añade una comprobación: sustituye la
  // que Payload instalaría (`fields/config/sanitize.js` solo la pone `if
  // (typeof field.validate === 'undefined')`). Estos dos casos vigilan que la
  // función siga haciendo el trabajo que quitó: sin ellos, el `required` y la
  // lista de opciones del campo se pueden perder sin que falle nada, y un
  // objetivo inventado acaba en el enum de PostgreSQL y vuelve como un 500.
  it('un paso sin objetivo no pasa: el `required` del campo lo hace esta función', () => {
    expect(typeof validar(null, {})).toBe('string')
    expect(typeof validar(undefined as unknown as null, {})).toBe('string')
    expect(typeof validar('', {})).toBe('string')
  })

  it('un objetivo que no está en la lista no pasa', () => {
    expect(typeof validar('inventado', {})).toBe('string')
  })

  it('rechaza el trazo sin ninguna de las dos longitudes', () => {
    const problema = validar('trazo', { titulo: 'Trazar la incisión de abordaje' })
    expect(typeof problema, 'un trazo sin rango se aprueba solo').toBe('string')
    expect(String(problema)).toMatch(/incisión/i)
  })

  it('basta con una de las dos longitudes: media ventana ya es una regla', () => {
    expect(validar('trazo', { trazoMinimo: 25 })).toBe(true)
    expect(validar('trazo', { trazoMaximo: 80 })).toBe(true)
  })

  it('rechaza la fuerza sin ninguno de los dos topes', () => {
    const problema = validar('fuerza', { titulo: 'Impactar el clavo' })
    expect(typeof problema, 'una fuerza sin rango se aprueba sola').toBe('string')
    expect(String(problema)).toMatch(/fuerza/i)
  })

  it('basta con uno de los dos topes de fuerza', () => {
    expect(validar('fuerza', { fuerzaMinima: 20 })).toBe(true)
    expect(validar('fuerza', { fuerzaMaxima: 60 })).toBe(true)
  })

  it('un cero es un rango: no se confunde con el campo vacío', () => {
    expect(validar('trazo', { trazoMinimo: 0 })).toBe(true)
    expect(validar('fuerza', { fuerzaMinima: 0 })).toBe(true)
  })

  it('la reducción no necesita declararlas: sus tres tolerancias tienen valor por omisión', () => {
    expect(validar('reduccion', {})).toBe(true)
  })

  it('elegir el instrumento se evalúa solo, sin rango ninguno', () => {
    expect(validar('instrumento', {})).toBe(true)
  })

  it('elegir el instrumento no admite además el rango de otro objetivo', () => {
    // Es la única regla que prohíbe, y la pide el motor: `objetivoDelPaso` no
    // se fía del valor «instrumento» —es lo que el DEFAULT de la migración
    // escribió en toda fila anterior— y ante él deduce del rango que el paso
    // traiga. Sin esto, un número de fuerza olvidado convertía en silencio
    // «elija el punzón» en «aplique entre 8 y 20 N».
    expect(typeof validar('instrumento', { fuerzaMinima: 8, fuerzaMaxima: 20 })).toBe('string')
    expect(typeof validar('instrumento', { trazoMaximo: 80 })).toBe('string')
  })

  it('las tres tolerancias no le estorban al instrumento: las lleva toda fila', () => {
    // `defaultValue: 5` en la colección y `DEFAULT 5` en la migración. Si
    // contaran como rango declarado, ningún paso de instrumento se podría
    // guardar, que es la regresión más fácil de introducir en la regla de
    // arriba.
    expect(
      validar('instrumento', {
        toleranciaDesplazamiento: 5,
        toleranciaDiastasis: 5,
        toleranciaAngulacion: 5,
      }),
    ).toBe(true)
  })

  it('un rango del objetivo contrario no cuenta como rango propio', () => {
    // Escribir la fuerza y elegir «trazo» es justo el descuido que el campo
    // `condition` de Payload escondía: el editor del panel pinta los siete
    // números siempre, uno debajo de otro.
    expect(typeof validar('trazo', { fuerzaMinima: 20, fuerzaMaxima: 60 })).toBe('string')
    expect(typeof validar('fuerza', { trazoMinimo: 25, trazoMaximo: 80 })).toBe('string')
  })
})
