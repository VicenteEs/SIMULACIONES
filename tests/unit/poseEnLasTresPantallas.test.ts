import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Field } from 'payload'
import { COLECCIONES } from '@/collections'
import { BLOQUES as BLOQUES_PAYLOAD } from '@/blocks'
import { bloqueDe } from '@/admin/bloques'
import { depurarCampos } from '@/admin/depurar'
import type { Campo } from '@/admin/esquema'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'
import {
  encuadreQueLoAbarca,
  encuadreVigente,
  tieneEncuadre,
  type Encuadre,
} from '@/lib/encuadre'

/**
 * La pose del catálogo llega a las **tres** pantallas que enseñan un modelo.
 *
 * `tests/unit/encuadreDelModelo.test.ts` fijó la regla y su primer llamador. Lo
 * que faltaba era lo demás, y a medias era peor que nada: el traumatólogo
 * capturaba la pose en la ficha del modelo, guardaba, abría un caso AO o cogía
 * un instrumento en la consola y no había cambiado nada, sin un solo error que
 * lo explicara.
 *
 * Y faltaba lo de debajo, que es lo que de verdad mataba el cable: el bloque
 * «Modelo 3D» declaraba `defaultValue` en su encuadre —escala 1, giros 0,
 * distancia 3—, y como `tieneEncuadre` decide por `distanciaCamara`, **todo**
 * bloque contestaba «sí, tengo encuadre» sin que nadie lo hubiera capturado. La
 * precedencia respeta al bloque por encima del modelo, así que la pose del
 * catálogo no se aplicaba jamás en una ficha ya escrita. La regla quedaba
 * escrita, probada y muerta, que es el patrón que más ha costado en este
 * repositorio.
 *
 * Por eso aquí hay dos mitades. Una comprueba el comportamiento —qué pasa con
 * un bloque recién insertado, y que el visor sigue encuadrando solo cuando no
 * hay pose—. La otra lee la fuente de los tres llamadores, que es lo único que
 * se puede hacer sin navegador: el entorno de la suite es `node` y no hay jsdom
 * (ver `vitest.config.ts`), como ya hacen `campos.test.ts` y
 * `encuadreDelModelo.test.ts`.
 *
 * Leer la fuente del llamador comprueba el último salto y solo ese, y eso ya
 * dejó pasar una avería entera: la consola declaraba `encuadreDelModelo`, lo
 * leía y se lo daba a la regla —o sea que la expresión regular de más abajo
 * estaba en verde— mientras nadie lo escribía. `casoParaLaConsola`
 * (`src/lib/casoQuirurgico.ts`) es el único sitio donde se construye un
 * instrumento de la bandeja y solo aplanaba la `url`, así que el campo llegaba
 * siempre `undefined`, `encuadreVigente` devolvía `undefined` y el residente
 * seguía viendo lo de siempre, sin un error que lo explicara. Una prueba verde
 * sobre un cable que no conduce es peor que no tenerla. De ahí el bloque «y al
 * instrumento la pose le llega por el aplanado»: recorre el **tramo**, no el
 * salto.
 */

const fuente = (...partes: string[]): string =>
  readFileSync(join(process.cwd(), ...partes), 'utf8')

/**
 * El archivo sin sus comentarios.
 *
 * Aquí se comprueba qué **hace** el código, y los comentarios de estos tres
 * archivos hablan largo justamente de las importaciones que no se deben hacer:
 * contarlos dejaría media prueba en verde por el motivo contrario al que busca.
 */
const sinComentarios = (codigo: string): string =>
  codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((linea) => !linea.trim().startsWith('//'))
    .join('\n')

const AO = sinComentarios(fuente('src', 'app', '(frontend)', 'tecnica-ao', '[id]', 'page.tsx'))
const CONSOLA = sinComentarios(fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx'))
const BLOQUES = sinComentarios(fuente('src', 'components', 'Bloques.tsx'))
const VISOR = sinComentarios(fuente('src', 'components', 'Visor3D.tsx'))
// También sin comentarios, y aquí hace más falta que en ninguno: su cabecera
// cita `import * as THREE from 'three'` para explicar precisamente que aquí no
// se hace.
const ARITMETICA = sinComentarios(fuente('src', 'lib', 'aritmeticaDelEncuadre.ts'))
// El tramo que le falta al tercero: el traductor que hay entre Payload y la
// consola. Es el único que construye un `InstrumentoDeBandeja`.
const CASO = sinComentarios(fuente('src', 'lib', 'casoQuirurgico.ts'))

/** Los subcampos de un grupo, tal como los declara Payload. */
const grupoDePayload = (campos: Field[], nombre: string): Field[] => {
  const grupo = campos.find((c) => 'name' in c && c.name === nombre) as
    | { fields?: Field[] }
    | undefined
  return grupo?.fields ?? []
}

const bloqueModelo3D = BLOQUES_PAYLOAD.find((b) => b.slug === 'modelo-3d')!
const modelos3D = COLECCIONES.find((c) => c.slug === 'modelos-3d')!
const encuadreDelBloque = grupoDePayload(bloqueModelo3D.fields, 'encuadre')
const grupoDelPanel = bloqueDe('modelo-3d')!.campos.find(
  (c) => c.nombre === 'encuadre',
) as Extract<Campo, { tipo: 'grupo' }>

/** La pose que el traumatólogo dejó capturada en el catálogo. */
const DEL_CATALOGO: Encuadre = {
  escala: 0.004,
  giroX: -15,
  giroY: 0,
  giroZ: 0,
  distanciaCamara: 2.7,
}

/**
 * Lo que el `defaultValue` del bloque metía en toda fila.
 *
 * Se deja escrito como muestra, no como aspiración: es el tuple exacto que hay
 * que reconocer en la base para vaciar las filas que se guardaron mientras
 * aquello estuvo puesto.
 */
const LO_QUE_PONIA_EL_DEFAULT_VALUE: Encuadre = {
  escala: 1,
  giroX: 0,
  giroY: 0,
  giroZ: 0,
  distanciaCamara: 3,
}

describe('el encuadre del bloque nace vacío, igual que el del catálogo', () => {
  it('ningún subcampo del bloque declara valor por omisión', () => {
    for (const campo of encuadreDelBloque) {
      const nombre = 'name' in campo ? campo.name : '?'
      expect(
        (campo as { defaultValue?: unknown }).defaultValue,
        `modelo-3d.encuadre.${nombre} trae un valor por omisión: todo bloque volvería a «tener» encuadre sin que nadie lo capturara, y la pose del catálogo no se aplicaría nunca en una ficha ya escrita`,
      ).toBeUndefined()
    }
    // Nombrado y no solo recorrido: con el grupo vacío el bucle de arriba
    // pasaría sin comprobar nada.
    expect(encuadreDelBloque.length).toBe(5)
  })

  it('y los dos sitios donde vive la misma pose se declaran igual', () => {
    // El bloque y el catálogo guardan la misma captura del mismo botón; lo
    // único que cambia es en cuál de los dos formularios estaba el
    // traumatólogo. Que uno nazca vacío y el otro con un 3 puesto es la
    // diferencia que hizo que la herencia no actuara.
    const enElCatalogo = grupoDePayload(modelos3D.fields, 'encuadre')
    const porOmision = (campos: Field[]) =>
      campos.map((c) => (c as { defaultValue?: unknown }).defaultValue)
    expect(porOmision(encuadreDelBloque)).toEqual(porOmision(enElCatalogo))
  })
})

describe('un bloque recién insertado hereda la pose del catálogo', () => {
  it('el panel lo guarda con las cinco claves a nulo, y eso es «no dice nada»', () => {
    // El recorrido entero tal como ocurre: «+ Agregar → Modelo 3D» deja el
    // grupo sin tocar, `depurarCampos` reconstruye el documento desde el
    // esquema y escribe las cinco claves. Payload solo aplica su `defaultValue`
    // cuando el valor llega `undefined`, así que estas filas ya nacían limpias
    // —el `defaultValue` lo cogían las que entran por la API local o por un
    // guion—; lo que esto fija es que sigan naciendo así.
    const recienInsertado = depurarCampos(grupoDelPanel.campos, {}) as unknown as Encuadre
    expect(tieneEncuadre(recienInsertado)).toBe(false)
    expect(encuadreVigente(recienInsertado, DEL_CATALOGO)).toBe(DEL_CATALOGO)
  })

  it('y con el valor por omisión puesto no la heredaba: esa era la avería', () => {
    // La prueba de la avería, no de la cura. Si alguien devuelve el
    // `defaultValue` al bloque, la de arriba se cae y esta explica por qué.
    expect(encuadreVigente(LO_QUE_PONIA_EL_DEFAULT_VALUE, DEL_CATALOGO)).toBe(
      LO_QUE_PONIA_EL_DEFAULT_VALUE,
    )
  })

  it('el bloque que sí trae pose propia sigue mandando', () => {
    // Quitar el valor por omisión no puede quitarle la última palabra a quien
    // coloca esa pieza en esa ficha: la mira para esa ficha.
    const propia: Encuadre = { escala: 1, giroX: 0, giroY: 90, giroZ: 0, distanciaCamara: 3.4 }
    expect(encuadreVigente(propia, DEL_CATALOGO)).toBe(propia)
  })
})

describe('sin pose, el visor sigue encuadrando solo', () => {
  it('la regla devuelve `undefined`, que es lo que hace caer al visor en `Bounds`', () => {
    // El comportamiento de toda la vida, y el que no puede romperse: una ficha
    // antigua sin nada capturado se abre abarcando la pieza entera.
    expect(encuadreVigente(undefined, undefined)).toBeUndefined()
    expect(encuadreVigente(null, null)).toBeUndefined()
    const vacios = depurarCampos(grupoDelPanel.campos, {}) as unknown as Encuadre
    expect(encuadreVigente(vacios, vacios)).toBeUndefined()
  })

  it('y el visor mantiene su rama automática', () => {
    // `encuadre = {}` es el valor por omisión del propio componente, y
    // `tieneEncuadre({})` es falso: sin pose se pinta dentro de `Bounds`, que
    // mide la caja del modelo y lo abarca. Si esa rama desaparece, los modelos
    // en milímetros vuelven a abrirse como un punto en el centro.
    expect(tieneEncuadre({})).toBe(false)
    expect(VISOR).toMatch(/const encuadrado = tieneEncuadre\(encuadre\)/)
    expect(VISOR).toMatch(/encuadrado \? contenido : <Bounds/)
  })
})

describe('quien tenía que llamar a la regla, la llama: los tres', () => {
  it('el bloque «Modelo 3D» de una ficha', () => {
    expect(BLOQUES).toMatch(/encuadreVigente\(/)
    expect(BLOQUES).toMatch(/<Visor3D[^>]*encuadre=\{encuadre\}/)
  })

  it('el modelo que cuelga de un paso de un caso AO', () => {
    // Aquí no había encuadre ninguno: `<Visor3D url={modelo.url} nombre={…} />`
    // y nada más, así que la pose capturada en el catálogo no llegaba al
    // residente en todo el módulo 03.
    expect(AO).toMatch(/import \{[^}]*encuadreVigente/)
    expect(AO).toMatch(/const encuadre = encuadreVigente\(/)
    expect(AO).toMatch(/<Visor3D[\s\S]{0,200}encuadre=\{encuadre\}/)
  })

  it('el instrumento que el residente tiene en la mano en la consola', () => {
    expect(CONSOLA).toMatch(/import \{[^}]*encuadreVigente/)
    expect(CONSOLA).toMatch(
      /<Visor3D[\s\S]{0,300}encuadre=\{encuadreVigente\([\s\S]{0,120}encuadreDelModelo\)\}/,
    )
  })

  it('y ninguno de los tres se escribe la precedencia por su cuenta', () => {
    // Un `?? {}` o un `modelo.encuadre` a pelo dejan pasar el grupo de nulos
    // —que es un objeto, o sea verdadero— y el visor planta la cámara a la
    // distancia por omisión sobre un modelo que puede venir en milímetros.
    for (const [nombre, texto] of [
      ['Bloques.tsx', BLOQUES],
      ['tecnica-ao/[id]/page.tsx', AO],
      ['ConsolaQuirurgica.tsx', CONSOLA],
    ] as const) {
      expect(texto, `${nombre} vuelve a leer el encuadre sin pasar por la regla`).not.toMatch(
        /encuadre=\{(modelo|bloque|instrumentoElegido)[^}]*\}/,
      )
    }
  })
})

describe('y al instrumento la pose le llega por el aplanado, no por arte de magia', () => {
  /** Un caso con un paso cuyo instrumento apunta a un modelo del catálogo. */
  const casoConInstrumento = (modelo: unknown) =>
    casoParaLaConsola({
      nombre: 'Clavo endomedular de tibia',
      pasos: [{ titulo: 'Punto de entrada', instrumento: { id: 7, nombre: 'Punzón', modelo } }],
    })

  it('`casoParaLaConsola` escribe `encuadreDelModelo` en el instrumento de la bandeja', () => {
    // El tramo que faltaba. La consola no recibe el documento del modelo —lo
    // que cruza al navegador es plano—, así que si la pose no se aplana aquí
    // no existe para el residente por mucho que el visor sepa pintarla.
    const caso = casoConInstrumento({
      id: 9,
      url: '/api/modelos-3d/file/punzon.glb',
      encuadre: DEL_CATALOGO,
    })
    expect(caso.instrumental[0].encuadreDelModelo).toEqual(DEL_CATALOGO)
    // Y el salto siguiente, el que la consola hace en pantalla, sobre el dato
    // que de verdad sale de aquí y no sobre uno escrito a mano en la prueba.
    expect(encuadreVigente(undefined, caso.instrumental[0].encuadreDelModelo)).toEqual(
      DEL_CATALOGO,
    )
  })

  it('sin modelo, o con el modelo sin encuadrar, se abre como siempre', () => {
    // Las dos formas de «nadie lo encuadró». La segunda es la que llega desde
    // el panel: `depurarCampos` escribe las cinco claves aunque estén vacías,
    // así que el grupo es un objeto y solo la regla puede leerlo como silencio.
    expect(casoConInstrumento(undefined).instrumental[0].encuadreDelModelo).toBeNull()
    const sinEncuadrar = casoConInstrumento({
      id: 9,
      url: '/api/modelos-3d/file/punzon.glb',
      encuadre: depurarCampos(grupoDelPanel.campos, {}),
    })
    expect(
      encuadreVigente(undefined, sinEncuadrar.instrumental[0].encuadreDelModelo),
    ).toBeUndefined()
  })

  it('y la fuente del traductor lo escribe: sin esa línea nada se pone rojo', () => {
    // La comprobación que convierte la de la consola en prueba de la cadena.
    // Mientras esto no estuvo, aquella pasaba sobre un campo que nadie llenaba.
    expect(CASO, 'el aplanado dejó de escribir la pose y el cable se corta sin avisar').toMatch(
      /encuadreDelModelo:/,
    )
  })
})

describe('la consola no se trae `three` al navegador por la puerta del encuadre', () => {
  it('pide la regla al módulo que no sabe de three', () => {
    // `ConsolaQuirurgica.tsx` lleva `'use client'`. `@/lib/encuadre` abre con
    // `import * as THREE from 'three'` para `encuadreCapturado`, y un
    // `export … from` sigue siendo una arista del grafo: sin `sideEffects:
    // false` en el `package.json`, el empaquetador incluye el módulo entero
    // aunque esa función no se use. Importando por allí, three entraba en lo
    // que descarga el residente al abrir un caso —incluido el caso sin un solo
    // modelo— y deshacía las importaciones dinámicas con las que el motor 3D
    // viaja aparte.
    expect(CONSOLA).toContain("from '@/lib/aritmeticaDelEncuadre'")
    expect(CONSOLA).not.toContain("from '@/lib/encuadre'")
  })

  it('y ese módulo no importa three, ni ahora ni por descuido', () => {
    expect(ARITMETICA).not.toMatch(/from ['"]three['"]/)
    expect(ARITMETICA).toMatch(/export function encuadreVigente/)
    expect(ARITMETICA).toMatch(/export const tieneEncuadre/)
  })

  it('la puerta de siempre sigue sirviendo lo mismo, para no tocar a los demás', () => {
    // `Visor3D.tsx`, `Bloques.tsx`, `tecnica-ao/[id]/page.tsx` y varias pruebas
    // piden por `@/lib/encuadre`. Si la reexportación se cae, se caen todos a
    // la vez y por un motivo que no se parece al síntoma.
    expect(typeof encuadreVigente).toBe('function')
    expect(typeof tieneEncuadre).toBe('function')
    expect(typeof encuadreQueLoAbarca).toBe('function')
  })
})

describe('vaciar el encuadre de un bloque que ya lo tenía', () => {
  /**
   * Qué es «vaciar», escrito una vez y en el nivel en que se decide.
   *
   * Es lo que tiene que hacer el botón «Reiniciar» del editor
   * (`src/components/admin/formulario/EditorDeEncuadre.tsx`), que es el único
   * mando del panel que promete devolver un bloque a «sin pose». Aquí se fija
   * el contrato —qué llega a la base y cómo lo lee la regla— y no el botón:
   * este archivo no puede pulsarlo, porque la suite corre en `node` y sin
   * jsdom. Lo que sí puede es dejar dicho, en verde, que vaciar es escribir
   * nada y no escribir ceros.
   */
  const CINCO_CLAVES_VACIAS = {
    escala: undefined,
    giroX: undefined,
    giroY: undefined,
    giroZ: undefined,
    distanciaCamara: undefined,
  }

  it('vaciar es escribir las cinco claves a `undefined`, y lo que se guarda es nulo', () => {
    // El envoltorio del grupo (`src/components/admin/formulario/Campos.tsx`)
    // llama con `{...valor, ...nuevo}`: una clave a `undefined` pisa a la que
    // había —que es justo lo que un `delete` a medias no haría— y
    // `depurarCampo` (`src/admin/depurar.ts`) la guarda como `null`. Es el
    // único camino por el que un bloque ya encuadrado vuelve a heredar del
    // catálogo, que es lo que el traumatólogo pide cuando se arrepiente de la
    // pose del bloque y quiere la que capturó en la ficha del modelo.
    const vaciado = depurarCampos(grupoDelPanel.campos, {
      ...DEL_CATALOGO,
      ...CINCO_CLAVES_VACIAS,
    } as unknown as Record<string, unknown>) as unknown as Encuadre
    expect(tieneEncuadre(vaciado)).toBe(false)
    expect(encuadreVigente(vaciado, DEL_CATALOGO)).toBe(DEL_CATALOGO)
  })

  it('y poner (1, 0, 0, 0, 3) no es vaciar: es clavar una pose que nadie capturó', () => {
    // Lo contrario de lo que el mando promete, y con el `defaultValue` fuera ya
    // no es inofensivo: mientras todo bloque valía (1, 0, 0, 0, 3), escribirlo
    // no cambiaba nada; ahora es el único camino que devuelve una
    // `distanciaCamara`, o sea que el bloque vuelve a ganarle al catálogo y la
    // pose de la ficha del modelo sigue sin llegar.
    //
    // Arrastra además la migración pendiente: el `UPDATE` que vacía las filas
    // que valen exactamente este tuple se apoya en que ninguna captura real lo
    // produce —«Ajustar al modelo» da 3,01, y eso lo fija el bloque de abajo—.
    // Un mando que lo escriba de un clic convierte ese `UPDATE` en un borrado
    // de decisiones del profesor, y por eso los dos arreglos van juntos.
    const comoSiSeEscribieranCeros = depurarCampos(
      grupoDelPanel.campos,
      LO_QUE_PONIA_EL_DEFAULT_VALUE as unknown as Record<string, unknown>,
    ) as unknown as Encuadre
    expect(tieneEncuadre(comoSiSeEscribieranCeros)).toBe(true)
    expect(encuadreVigente(comoSiSeEscribieranCeros, DEL_CATALOGO)).not.toBe(DEL_CATALOGO)
  })
})

describe('las filas que el valor por omisión ya escribió se pueden reconocer', () => {
  it('el ajuste automático nunca da una distancia de 3 exacta', () => {
    // De esto depende que la migración pendiente pueda vaciar por valor: si
    // «Ajustar al modelo» pudiera devolver 3, vaciar las filas que valen
    // (1, 0, 0, 0, 3) borraría capturas de verdad.
    //
    // No puede: la distancia sale de `(1 / sen(22,5°)) · 1,15 = 3,0051`, que
    // redondeado a dos decimales es 3,01 para cualquier radio, porque el radio
    // se absorbe en la escala. El día que cambien `CAMPO_DE_VISION` o el margen
    // hay que volver a mirar este número antes de escribir ese `UPDATE`.
    for (const radio of [0.5, 1, 250, 1000]) {
      expect(encuadreQueLoAbarca(radio)!.distanciaCamara).toBe(3.01)
    }
  })

  it('y ese tuple es exactamente el que el bloque ponía', () => {
    // Escrito una vez, aquí, para que el SQL de la migración y esta prueba no
    // puedan discrepar sin que algo se ponga rojo.
    expect(LO_QUE_PONIA_EL_DEFAULT_VALUE).toEqual({
      escala: 1,
      giroX: 0,
      giroY: 0,
      giroZ: 0,
      distanciaCamara: 3,
    })
    expect(tieneEncuadre(LO_QUE_PONIA_EL_DEFAULT_VALUE)).toBe(true)
  })
})
