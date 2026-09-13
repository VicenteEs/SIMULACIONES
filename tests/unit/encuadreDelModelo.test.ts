import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Field } from 'payload'
import { COLECCIONES } from '@/collections'
import { BLOQUES as BLOQUES_PAYLOAD } from '@/blocks'
import { bloqueDe } from '@/admin/bloques'
import { depurarCampos } from '@/admin/depurar'
import type { Campo } from '@/admin/esquema'
import {
  encuadreQueLoAbarca,
  encuadreVigente,
  tieneEncuadre,
  type Encuadre,
} from '@/lib/encuadre'

/**
 * Que la pose que el profesor captura la vea el residente.
 *
 * El campo `encuadre` de `modelos-3d` existía, se podía rellenar y no lo leía
 * nadie: `Bloques.tsx` usaba solo el del bloque. Eso es un campo tan muerto
 * como lo estuvo `notas`, con el agravante de que este sí se ve lleno en el
 * panel, así que el traumatólogo captura la pose, la guarda y cree que la ha
 * dejado puesta.
 *
 * Aquí se fija la regla —bloque, luego modelo, luego automático— y, sobre todo,
 * que **quien tenía que llamarla la llama**. Una regla probada a la que nadie
 * invoca es el patrón que más ha fallado en este repositorio: por eso la mitad
 * de abajo lee la fuente de los dos llamadores. El entorno de la suite es
 * `node` y no hay jsdom (ver `vitest.config.ts`), así que pintar no se puede;
 * leer sí.
 *
 * Y al final, lo que hace falta antes de que haya nada que leer: que la pose
 * capturada **se pueda guardar**. Eso depende de un número —el suelo de la
 * escala— que vive por duplicado, en la colección y en el bloque, y que ya se
 * separó una vez.
 */

const fuente = (...partes: string[]): string =>
  readFileSync(join(process.cwd(), ...partes), 'utf8')

const BLOQUES = fuente('src', 'components', 'Bloques.tsx')
const CAMPOS = fuente('src', 'components', 'admin', 'formulario', 'Campos.tsx')
const VISOR = fuente('src', 'components', 'Visor3D.tsx')

/**
 * Lo que deja en el bloque el panel cuando nadie ha capturado nada.
 *
 * Las cinco claves escritas y las cinco a nulo: así lo guarda `depurarCampos`,
 * y por eso hace falta el molde —el tipo `Encuadre` no admite nulos, pero la
 * base sí los devuelve—.
 */
const NADA_CAPTURADO = {
  escala: null,
  giroX: null,
  giroY: null,
  giroZ: null,
  distanciaCamara: null,
} as unknown as Encuadre

const DEL_BLOQUE: Encuadre = { escala: 1, giroX: 0, giroY: 90, giroZ: 0, distanciaCamara: 3 }
const DEL_MODELO: Encuadre = { escala: 0.004, giroX: -15, giroY: 0, giroZ: 0, distanciaCamara: 2.7 }

describe('la pregunta que distingue «tiene encuadre» de «no tiene»', () => {
  it('mira la distancia de cámara, que no tiene valor neutro', () => {
    expect(tieneEncuadre(DEL_BLOQUE)).toBe(true)
    // Los giros a cero son la pose frontal, que es una pose legítima, y la
    // escala 1 es la de casi todos: por ninguna de las dos se puede preguntar.
    expect(tieneEncuadre({ escala: 1, giroX: 0, giroY: 0, giroZ: 0 })).toBe(false)
  })

  it('un grupo entero a nulos es «no tiene», que es como lo guarda el panel', () => {
    expect(tieneEncuadre(NADA_CAPTURADO)).toBe(false)
    expect(tieneEncuadre({})).toBe(false)
    expect(tieneEncuadre(undefined)).toBe(false)
    expect(tieneEncuadre(null)).toBe(false)
  })
})

describe('la precedencia del encuadre', () => {
  it('manda el del bloque: quien coloca la pieza en esa ficha la mira para esa ficha', () => {
    expect(encuadreVigente(DEL_BLOQUE, DEL_MODELO)).toBe(DEL_BLOQUE)
  })

  it('si el bloque no dice nada, manda el del modelo', () => {
    expect(encuadreVigente(undefined, DEL_MODELO)).toBe(DEL_MODELO)
    expect(encuadreVigente({}, DEL_MODELO)).toBe(DEL_MODELO)
  })

  it('y el bloque «no dice nada» aunque traiga las cinco claves puestas a nulo', () => {
    // Este es el caso por el que la regla no se puede escribir `??`:
    // `depurarCampos` reconstruye el documento recorriendo el esquema y escribe
    // siempre las cinco claves del grupo, así que `bloque.encuadre` es un
    // objeto —verdadero para `??`— aunque nadie haya capturado nada. Con un
    // `??`, el respaldo al modelo no actuaría jamás y quedaría escrito, probado
    // y muerto.
    const comoLoHariaUnDobleInterrogante = (
      delBloque: Encuadre | null | undefined,
      delModelo: Encuadre,
    ) => delBloque ?? delModelo
    expect(
      comoLoHariaUnDobleInterrogante(NADA_CAPTURADO, DEL_MODELO),
      'el `??` se queda con el del bloque y el respaldo no actúa nunca',
    ).toBe(NADA_CAPTURADO)

    expect(encuadreVigente(NADA_CAPTURADO, DEL_MODELO)).toBe(DEL_MODELO)
  })

  it('si ninguno dice nada, no se devuelve nada y el visor encuadra solo', () => {
    // `undefined` es lo que hace que `Visor3D` caiga en su rama de `Bounds`,
    // que es lo que la plataforma ha hecho siempre con las fichas antiguas.
    expect(encuadreVigente(NADA_CAPTURADO, NADA_CAPTURADO)).toBeUndefined()
    expect(encuadreVigente(undefined, undefined)).toBeUndefined()
    expect(encuadreVigente(null, null)).toBeUndefined()
  })

  it('no mezcla mitades: un bloque a medias cae entero al del modelo', () => {
    // Juntar los giros de uno con la distancia del otro compone una pose que
    // nadie vio nunca, ni en el editor del bloque ni en la ficha del modelo, y
    // el traumatólogo no tendría dónde ir a corregirla.
    const aMedias: Encuadre = { giroY: 45 }
    expect(encuadreVigente(aMedias, DEL_MODELO)).toBe(DEL_MODELO)
    expect(encuadreVigente(aMedias, DEL_MODELO)?.giroY).toBe(DEL_MODELO.giroY)
  })
})

describe('quien tenía que llamarla, la llama', () => {
  it('el bloque «Modelo 3D» de una ficha pasa los dos encuadres, no solo el suyo', () => {
    expect(BLOQUES).toContain('encuadreVigente(')
    expect(BLOQUES).toMatch(/encuadreVigente\([\s\S]{0,120}bloque\.encuadre[\s\S]{0,120}modelo\?\.encuadre/)
    // Y el resultado llega al visor, que es el único sitio donde sirve.
    expect(BLOQUES).toMatch(/<Visor3D[^>]*encuadre=\{encuadre\}/)
  })

  it('no lee el encuadre del bloque por su cuenta', () => {
    // `const encuadre = (bloque.encuadre ?? {})` era la línea que ignoraba al
    // modelo. Si vuelve, vuelve el campo muerto.
    expect(BLOQUES).not.toMatch(/bloque\.encuadre \?\?/)
  })

  it('la regla vive donde un componente de servidor puede llamarla', () => {
    // `Bloques.tsx` se pinta en el servidor y `Visor3D.tsx` lleva `'use
    // client'`: importar de ahí una función suelta y llamarla desde el servidor
    // no queda feo, lanza en tiempo de ejecución y se lleva la ficha entera.
    // Por eso `tieneEncuadre` se mudó a `@/lib/encuadre`, que no tiene
    // directiva, y el visor solo la reexporta.
    expect(BLOQUES).toContain("from '@/lib/encuadre'")
    expect(BLOQUES).not.toContain("from '@/components/Visor3D'")
    expect(BLOQUES).not.toContain("from './Visor3D'")
    expect(VISOR).toContain('export { tieneEncuadre }')
    // Una segunda copia contestaría distinto el día que una se mueva.
    expect(VISOR).not.toMatch(/const tieneEncuadre\s*=/)
  })
})

describe('el editor de encuadre encuentra el archivo en los dos formularios', () => {
  it('en una ficha, el del campo hermano «modelo»', () => {
    expect(CAMPOS).toContain("opcionDeRelacion(relaciones, 'modelos-3d', hermanos?.modelo)")
  })

  it('en la ficha de un modelo, el documento mismo, que es el archivo', () => {
    // Sin este respaldo la sección «Encuadre inicial» se pinta sin visor y el
    // traumatólogo no tiene nada que capturar: el editor sale por su rama
    // temprana —«Elija primero un modelo arriba»— debajo de una ayuda que le
    // manda a pulsar «Capturar encuadre». Es la forma de la regresión de D-038.
    expect(CAMPOS).toMatch(/const propia = hermanos\?\.url/)
    expect(CAMPOS).toMatch(/typeof propia === 'string'[\s\S]{0,500}return \{ url: propia/)
  })

  it('primero el hermano y después el documento, y el grupo lo usa', () => {
    // Al revés, un formulario de subida que algún día llevara un bloque con
    // modelo enseñaría su propio archivo en vez del elegido.
    const cuerpo = CAMPOS.slice(CAMPOS.indexOf('function modeloParaEncuadrar'))
    expect(cuerpo.indexOf('opcionDeRelacion')).toBeLessThan(cuerpo.indexOf('hermanos?.url'))
    expect(CAMPOS).toContain("campo.editor === 'encuadre3d' ? modeloParaEncuadrar(relaciones, hermanos)")
  })

  it('la dirección del archivo subido no vuelve a pasar por `ruta()`', () => {
    // Payload ya le antepone el basePath; ponérselo otra vez reproduce el
    // apagón O-019 (`tests/unit/archivosSubidos.test.ts`).
    const cuerpo = CAMPOS.slice(
      CAMPOS.indexOf('function modeloParaEncuadrar'),
      CAMPOS.indexOf('// ------------------------------------------------- identidad de filas'),
    )
    // Sin las líneas de comentario, que es donde se explica justamente que no
    // se pone: contarlas dejaría la prueba en verde por el motivo contrario.
    const codigo = cuerpo
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('//'))
      .join('\n')
    expect(codigo).toContain('url: propia')
    expect(codigo).not.toMatch(/ruta\(/)
  })
})

/**
 * El suelo de la escala, que es el número que decide si la captura se puede
 * guardar.
 *
 * La misma pose vive en dos declaraciones —la del catálogo
 * (`src/collections/Modelos3D.ts`) y la del bloque que inserta ese modelo en
 * una ficha (`src/blocks/index.ts`)— y ya se separaron: el catálogo se bajó a
 * 0,0001 y el bloque se quedó en 0,01. Nada las comparaba, y por eso la mitad
 * del arreglo pudo darse por hecha estando viva.
 *
 * En el bloque, además, el `min` de Payload es el **único** tope que actúa:
 * `src/admin/bloques.ts` declara esa escala sin `min` ni `max`, así que
 * `depurarCampo` la deja pasar tal cual y quien contesta es Payload, en inglés
 * y sin que `accion()` desenvuelva el mensaje.
 */
describe('el suelo de la escala deja guardar lo que captura «Ajustar al modelo»', () => {
  /** Los subcampos de un grupo, tal como los declara Payload. */
  const grupoDePayload = (campos: Field[], nombre: string): Field[] => {
    const grupo = campos.find((c) => 'name' in c && c.name === nombre) as
      | { fields?: Field[] }
      | undefined
    return grupo?.fields ?? []
  }

  const topeDe = (campos: Field[], nombre: string): { min?: number; max?: number } => {
    const campo = campos.find((c) => 'name' in c && c.name === nombre) as
      | { min?: number; max?: number }
      | undefined
    return { min: campo?.min, max: campo?.max }
  }

  const bloqueModelo3D = BLOQUES_PAYLOAD.find((b) => b.slug === 'modelo-3d')!
  const modelos3D = COLECCIONES.find((c) => c.slug === 'modelos-3d')!
  const encuadreDelBloque = grupoDePayload(bloqueModelo3D.fields, 'encuadre')
  const grupoDelPanel = bloqueDe('modelo-3d')!.campos.find(
    (c) => c.nombre === 'encuadre',
  ) as Extract<Campo, { tipo: 'grupo' }>

  it('el bloque admite la misma escala que el catálogo, porque es la misma captura', () => {
    // El mismo botón, el mismo modelo y el mismo número: lo único que cambia es
    // en cuál de los dos formularios estaba el traumatólogo. Que un sitio lo
    // acepte y el otro no es una diferencia que no se puede explicar a quien la
    // sufre, y es la que hubo.
    const enElBloque = topeDe(encuadreDelBloque, 'escala')
    const enElCatalogo = topeDe(grupoDePayload(modelos3D.fields, 'encuadre'), 'escala')
    expect(enElBloque.min, 'el suelo del bloque se separó del de modelos-3d').toBe(
      enElCatalogo.min,
    )
    expect(enElBloque.max).toBe(enElCatalogo.max)
    // Nombrado y no solo comparado: con los dos `undefined` esto pasaría igual.
    expect(enElBloque.min).toBe(0.0001)
  })

  it('la escala de un fémur en milímetros sobrevive al panel y la admite Payload', () => {
    // El recorrido completo, que es donde estaba el fallo: se captura como
    // captura el botón y se guarda como guarda el panel. Con `min: 0.01` en el
    // bloque, la última comprobación fallaba —Payload rechazaba el documento
    // entero— y el traumatólogo se quedaba sin poder guardar justo lo que el
    // botón «Ajustar al modelo» acababa de poner en pantalla.
    const RADIO_DE_UN_FEMUR_EN_MILIMETROS = 250
    const capturado = encuadreQueLoAbarca(RADIO_DE_UN_FEMUR_EN_MILIMETROS)
    expect(capturado).not.toBeNull()
    // Si esto dejara de ser cierto, el caso se habría movido y la prueba estaría
    // comprobando otra cosa: se afirma para que el fallo lo diga.
    expect(capturado!.escala!).toBeLessThan(0.01)

    const guardado = depurarCampos(grupoDelPanel.campos, {
      escala: capturado!.escala,
      distanciaCamara: capturado!.distanciaCamara,
    })
    expect(guardado.escala, 'el panel recortó la escala capturada sin decirlo').toBe(
      capturado!.escala,
    )

    const { min, max } = topeDe(encuadreDelBloque, 'escala')
    expect(min).toBeDefined()
    expect(
      guardado.escala as number,
      'Payload rechaza el bloque con un mensaje en inglés que el panel no desenvuelve',
    ).toBeGreaterThanOrEqual(min!)
    expect(guardado.escala as number).toBeLessThanOrEqual(max!)
  })

  it('los topes del panel para el bloque, o dicen lo mismo que Payload o no dicen nada', () => {
    // Las dos formas de separarse hacen daño, y distinto. Un tope del panel más
    // estrecho recorta en silencio y guarda un número que nadie escribió; uno
    // más ancho deja pasar lo que Payload rechaza después, y el error llega en
    // inglés al final del formulario. Hoy el panel no declara ninguno —recorta
    // Payload—, y ese estado es legítimo: lo que no lo es es declarar uno
    // distinto.
    const enElPanel = new Map(grupoDelPanel.campos.map((c) => [c.nombre, c]))
    for (const campo of encuadreDelBloque) {
      if (!('name' in campo) || typeof campo.name !== 'string') continue
      const suyo = enElPanel.get(campo.name)
      expect(suyo?.tipo, `modelo-3d.encuadre.${campo.name} falta en el panel`).toBe('numero')
      const numero = suyo as Extract<Campo, { tipo: 'numero' }>
      const declarado = campo as { min?: number; max?: number }
      expect(numero.min ?? declarado.min, `min de encuadre.${campo.name}`).toBe(declarado.min)
      expect(numero.max ?? declarado.max, `max de encuadre.${campo.name}`).toBe(declarado.max)
    }
  })
})
