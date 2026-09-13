import { describe, it, expect } from 'vitest'
import { Cirugias } from '@/collections/Cirugias'
import { camposDe, esquemaDe, recorrerCampos } from '@/admin/esquema'
import { depurarDocumento, faltantes } from '@/admin/depurar'

/**
 * Las reglas del objetivo de un paso viven en dos sitios, y tienen que decir lo
 * mismo.
 *
 * La que manda es `exigeElRangoDeSuObjetivo`, en `src/collections/Cirugias.ts`:
 * la colección es el único punto por el que pasan todas las escrituras. Pero su
 * mensaje no llega a la pantalla, porque Payload lo envuelve en un
 * `ValidationError` cuyo `message` es «The following field is invalid: Qué se
 * evalúa» y deja el español dentro de `error.data`, que es justo lo que
 * `accion()` no enseña. Por eso el panel repite las tres reglas en
 * `exigeAlguno` y `prohibeAlguno`, y por eso hay dos copias del mismo texto.
 *
 * Dos copias solo se sostienen si algo las compara. Eso es este archivo: si
 * alguien afina el texto de la colección, o añade allá una cuarta regla, aquí
 * se ve. Y al revés: durante un tiempo el panel copió dos de las tres, y la que
 * faltaba era la que más se dispara —el editor pinta los siete números de un
 * paso uno debajo de otro, sin esconder los que no tocan, así que cambiar el
 * objetivo a «instrumento» dejando un tope de fuerza tecleado es el gesto
 * natural—.
 */

interface CampoDeEsquema {
  name?: string
  fields?: CampoDeEsquema[]
  validate?: unknown
}

function buscarCampo(
  campos: CampoDeEsquema[] | undefined,
  nombre: string,
): CampoDeEsquema | undefined {
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

const campoDeLaColeccion = buscarCampo(
  Cirugias.fields as unknown as CampoDeEsquema[],
  'objetivo',
)

/** Lo que hará Payload al publicar: llamar a `validate` con la fila del paso. */
const validarEnLaColeccion = (valor: string, paso: Record<string, unknown>): string => {
  const salida = (campoDeLaColeccion!.validate as Validacion)(valor, { siblingData: paso })
  expect(typeof salida, `la colección aceptó un paso que tenía que rechazar: ${valor}`).toBe(
    'string',
  )
  return String(salida)
}

const cirugias = esquemaDe('cirugias')

const campoDelPanel = [...recorrerCampos(camposDe(cirugias))].find(
  (campo) => campo.nombre === 'objetivo',
)!

/** Los mensajes del panel para una opción, vengan de la regla que vengan. */
const mensajesDelPanel = (opcion: string): string[] => {
  if (campoDelPanel.tipo !== 'seleccion') throw new Error('«objetivo» dejó de ser una selección.')
  return [...(campoDelPanel.exigeAlguno ?? []), ...(campoDelPanel.prohibeAlguno ?? [])]
    .filter((regla) => regla.opcion === opcion)
    .map((regla) => regla.mensaje)
}

/** El aviso que da el panel al publicar un caso con ese único paso dentro. */
const avisosDelPanel = (paso: Record<string, unknown>): string => {
  const documento = depurarDocumento(cirugias, {
    nombre: 'Clavo endomedular de tibia',
    pasos: [{ titulo: 'Paso de prueba', ...paso }],
  })
  return faltantes(cirugias, documento).join(' ')
}

describe('el panel repite, palabra por palabra, las reglas de la colección', () => {
  it('la colección sigue trayendo su validación', () => {
    expect(campoDeLaColeccion, 'el guion ya no declara un objetivo por paso').toBeDefined()
    expect(typeof campoDeLaColeccion!.validate).toBe('function')
  })

  it('el trazo sin longitudes dice lo mismo en los dos sitios', () => {
    expect(mensajesDelPanel('trazo')).toContain(validarEnLaColeccion('trazo', {}))
  })

  it('la fuerza sin topes dice lo mismo en los dos sitios', () => {
    expect(mensajesDelPanel('fuerza')).toContain(validarEnLaColeccion('fuerza', {}))
  })

  it('el instrumento con un rango de más dice lo mismo en los dos sitios', () => {
    // La tercera regla, la que prohíbe en vez de exigir. Es la que el panel se
    // dejó, y la que más veces se dispara.
    expect(mensajesDelPanel('instrumento')).toContain(
      validarEnLaColeccion('instrumento', { fuerzaMinima: 8 }),
    )
  })
})

describe('publicar un paso con el objetivo mal acompañado', () => {
  it('avisa del trazo sin ninguna de las dos longitudes', () => {
    expect(avisosDelPanel({ objetivo: 'trazo' })).toContain('cualquier incisión se da por buena')
  })

  it('avisa de la fuerza sin ninguno de los dos topes', () => {
    expect(avisosDelPanel({ objetivo: 'fuerza' })).toContain('cualquier fuerza se da por buena')
  })

  it('avisa del instrumento que además lleva un rango de fuerza', () => {
    // El caso que se colaba: la colección lo rechaza, pero su motivo no llega a
    // la pantalla. Aquí tiene que salir en español y nombrando la fila.
    const aviso = avisosDelPanel({ objetivo: 'instrumento', fuerzaMinima: 8, fuerzaMaxima: 20 })
    expect(aviso).toContain('no puede llevar además un rango de fuerza o de incisión')
    expect(aviso).toContain('En paso 1:')
  })

  it('avisa también del instrumento con un rango de incisión', () => {
    expect(avisosDelPanel({ objetivo: 'instrumento', trazoMaximo: 80 })).toContain(
      'borre esos números',
    )
  })

  it('un cero es un número tecleado, no un campo vacío', () => {
    // `comoNumero` conserva el 0 y `typeof 0 === 'number'`: si alguna vez se
    // comprobara con una prueba de verdad, el 0 se colaría en las dos
    // direcciones y las dos copias dejarían de coincidir.
    expect(avisosDelPanel({ objetivo: 'instrumento', fuerzaMinima: 0 })).toContain(
      'borre esos números',
    )
    expect(avisosDelPanel({ objetivo: 'trazo', trazoMinimo: 0 })).toBe('')
  })

  it('las tres tolerancias no le estorban al instrumento: las lleva toda fila', () => {
    // `defaultValue: 5` en la colección y `DEFAULT 5` en la migración, así que
    // no prueban intención de nadie. Contarlas dejaría sin poder publicar
    // cualquier paso de instrumento, que es la regresión más fácil de meter.
    expect(
      avisosDelPanel({
        objetivo: 'instrumento',
        toleranciaDesplazamiento: 5,
        toleranciaDiastasis: 5,
        toleranciaAngulacion: 5,
      }),
    ).toBe('')
  })

  it('un paso bien acompañado no genera ningún aviso', () => {
    expect(avisosDelPanel({ objetivo: 'instrumento' })).toBe('')
    expect(avisosDelPanel({ objetivo: 'fuerza', fuerzaMinima: 20 })).toBe('')
    expect(avisosDelPanel({ objetivo: 'reduccion' })).toBe('')
  })

  it('guardar un borrador no lo impide', () => {
    // D-011: la revisión profunda es de publicar. Payload salta sus
    // validaciones con `draft: true`, y avisar antes que él dejaría el borrador
    // sin poder guardarse.
    const documento = depurarDocumento(cirugias, {
      nombre: 'Clavo endomedular de tibia',
      pasos: [{ titulo: 'Fresar el canal', objetivo: 'instrumento', fuerzaMinima: 8 }],
    })
    expect(faltantes(cirugias, documento, { profundo: false })).toEqual([])
    expect(faltantes(cirugias, documento).join(' ')).toContain('borre esos números')
  })
})
