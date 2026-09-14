import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Field } from 'payload'
import { Modelos3D } from '@/collections/Modelos3D'
import { Actividad } from '@/collections/Actividad'
import { Comentarios } from '@/collections/Comentarios'
import { creacionEnModuloVisible } from '@/access/payload'
import { BLOQUES as BLOQUES_PAYLOAD } from '@/blocks'
import { camposDe, esquemaDe, recorrerCampos, type Campo } from '@/admin/esquema'
import { MAXIMO_DE_COMPLICACIONES } from '@/lib/progresoDelSimulador'
// Por la misma puerta que citan los comentarios corregidos y que usan los
// componentes de servidor. El cuerpo de las dos se mudó a
// `@/lib/aritmeticaDelEncuadre` para que la consola no se trajera three
// entero; `@/lib/encuadre` las reexporta y sigue siendo la dirección que se
// escribe. Se importan en vez de buscarlas en el texto justamente por eso: una
// mudanza como esa no debe hacer fallar a esta prueba, y un borrado sí.
import { encuadreVigente, tieneEncuadre } from '@/lib/encuadre'

/**
 * Que los comentarios que anuncian trabajo pendiente se caigan al terminarlo.
 *
 * Este repositorio se apoya en sus comentarios más que en su documentación, y
 * por eso un comentario que miente cuesta más que no tenerlo: manda al
 * siguiente a rehacer algo terminado, o —peor— le dice que el cable que acaba
 * de escribir no hacía falta. En una sola tarde, tres llegaron a decir «todavía
 * no» o «va en otro lote» sobre cosas ya hechas y otros tres se quedaron
 * describiendo un código que había cambiado debajo —uno de ellos contradiciendo
 * en voz alta al de `src/blocks/index.ts`, que sí se había puesto al día—. Nada
 * lo notó, y era esperable: un comentario no compila, no se ejecuta y no
 * aparece en ninguna pantalla.
 *
 * Y una frase corregida en su archivo puede seguir viva en otro. Dos de estas
 * seis se habían escrito el mismo día, palabra por palabra, en
 * `tests/unit/esquema.test.ts`; se arreglaron en la colección y en el esquema, y
 * la copia de la prueba se quedó como estaba. Esa copia es la peor de las dos:
 * quien quiere saber qué está garantizado abre la prueba, no la colección. Por
 * eso lo que se mira aquí no es «el comentario de este archivo» sino «la frase,
 * esté donde esté», y por eso se lee también un archivo de pruebas.
 *
 * Cada prueba de aquí tiene dos mitades, y las dos hacen falta. Primero se
 * comprueba **el hecho** que el comentario afirma hoy —que la regla existe, que
 * alguien la llama, que los tres números son el mismo—, para que el comentario
 * no vuelva a quedarse atrás si mañana se deshace el cableado. Después se
 * comprueba que **la frase vieja no está de vuelta**, que es lo único que
 * distingue un comentario corregido de uno que alguien reescribió de memoria
 * copiando la versión anterior.
 *
 * Lo que aquí se mira es la prosa. El comportamiento lo sostienen
 * `tests/unit/encuadreDelModelo.test.ts` y `tests/unit/cableadoDelProgreso.test.ts`,
 * y esas dos son las que hay que leer para entender el mecanismo; esta solo
 * evita que la explicación y el mecanismo se separen.
 */

const fuente = (...partes: string[]): string => readFileSync(join(process.cwd(), ...partes), 'utf8')

/**
 * El archivo con los comentarios puestos en una sola línea.
 *
 * Al revés que en `cableadoDelProgreso.test.ts`, que los quita: aquí lo que se
 * comprueba **es** el comentario. Se colapsan porque una frase de JSDoc viaja
 * partida en cuatro líneas con su ` * ` delante, y buscar «que declara el
 * bloque» en el texto crudo no encuentra nada aunque esté escrito.
 */
const enUnaLinea = (codigo: string): string => codigo.replace(/\s*\n\s*(\*\/|\*|\/\/)?\s*/g, ' ')

/**
 * Que la frase vieja no esté, sin volcar el archivo entero al fallar.
 *
 * `expect(texto).not.toContain(frase)` imprime como «recibido» todo el texto que
 * se le pasó, y aquí ese texto es un archivo de mil líneas colapsado en una
 * sola: noventa kilobytes de dump que entierran el mensaje. Y el mensaje es lo
 * único que sirve, porque estas comprobaciones no se arreglan tocando la prueba
 * sino yendo al archivo que sigue diciéndolo. Comparando un booleano, el fallo
 * cabe en dos líneas y lo que se lee es el arreglo.
 */
const yaNoDice = (texto: string, frase: string, arreglo: string): void => {
  expect(texto.includes(frase), `Sigue escrito «${frase}». ${arreglo}`).toBe(false)
}

const MODELOS_3D = fuente('src', 'collections', 'Modelos3D.ts')
const ACTIVIDAD = fuente('src', 'collections', 'Actividad.ts')
const ESQUEMA = fuente('src', 'admin', 'esquema.ts')
const BLOQUES_TSX = fuente('src', 'components', 'Bloques.tsx')
const CAMPOS = fuente('src', 'components', 'admin', 'formulario', 'Campos.tsx')
const VISOR = fuente('src', 'components', 'Visor3D.tsx')
const ACCION_DE_ACTIVIDAD = fuente('src', 'app', '(frontend)', 'acciones', 'actividad.ts')
const CONSOLA = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')

/**
 * Y dos archivos de pruebas, que aquí se leen como prosa y no como pruebas.
 *
 * `esquema.test.ts` describe el mismo encuadre que `Modelos3D.ts` y que
 * `esquema.ts`, y el día que se escribió se llevó copiadas dos de las frases que
 * luego se corrigieron en ellos. Se lee entero, sin recortar por líneas: un
 * número de línea envejece en cuanto alguien mete un `it` más arriba, y lo que
 * hay que perseguir es la frase.
 *
 * `encuadreDelModelo.test.ts` se lee por lo contrario: es la prueba a la que el
 * comentario corregido manda en vez de prometer pantalla él mismo, y si
 * desapareciera, el comentario volvería a ser el único sitio donde eso consta.
 *
 * Los dos son de otro lote y aquí solo se leen. Cuando una de estas
 * comprobaciones falle, lo que hay que cambiar es ese archivo —cada `expect`
 * lleva escrito con qué—, nunca la comprobación.
 */
const ESQUEMA_TEST = fuente('tests', 'unit', 'esquema.test.ts')
const ENCUADRE_DEL_MODELO_TEST = fuente('tests', 'unit', 'encuadreDelModelo.test.ts')

/** Un subcampo de un grupo, tal como lo declara Payload. */
const subcampoDePayload = (
  campos: Field[],
  grupo: string,
  nombre: string,
): { min?: number; max?: number } => {
  const padre = campos.find((c) => 'name' in c && c.name === grupo) as
    | { fields?: Field[] }
    | undefined
  const hijo = (padre?.fields ?? []).find((c) => 'name' in c && c.name === nombre) as
    | { min?: number; max?: number }
    | undefined
  return { min: hijo?.min, max: hijo?.max }
}

describe('el suelo de la escala ya no se presenta como distinto del bloque', () => {
  const enLaColeccion = subcampoDePayload(Modelos3D.fields, 'encuadre', 'escala')
  const enElBloque = subcampoDePayload(
    BLOQUES_PAYLOAD.find((b) => b.slug === 'modelo-3d')!.fields,
    'encuadre',
    'escala',
  )
  const enElPanel = [...recorrerCampos(camposDe(esquemaDe('modelos-3d')))].find(
    (c): c is Extract<Campo, { tipo: 'numero' }> => c.tipo === 'numero' && c.nombre === 'escala',
  )

  it('los tres sitios que lo declaran dicen el mismo número', () => {
    // La colección y el bloque los compara `encuadreDelModelo.test.ts`; la
    // colección y el panel, `esquema.test.ts`. Aquí se juntan los tres porque
    // el comentario del campo `escala` los nombra a los tres, y el par que
    // faltaba —bloque contra panel— era justamente por donde se separaron.
    expect(enLaColeccion.min).toBe(0.0001)
    expect(enElBloque.min, 'el suelo del bloque se separó del del catálogo').toBe(enLaColeccion.min)
    expect(enElPanel?.min, 'el suelo del panel se separó del del catálogo').toBe(enLaColeccion.min)
  })

  it('y el comentario no vuelve a decir que el bloque declare 0,01', () => {
    // Lo decía cuando era cierto, y siguió diciéndolo después de que el bloque
    // bajara: quien lo leyera se iba a `src/blocks/index.ts` a arreglar algo
    // que ya estaba arreglado.
    const texto = enUnaLinea(MODELOS_3D)
    yaNoDice(
      texto,
      '0,01 que declara el bloque',
      'El bloque declara hoy el mismo suelo que el catálogo, y la línea de arriba lo comprueba. ' +
        'Arreglar el comentario de `src/collections/Modelos3D.ts`.',
    )
    // Pero sigue nombrándolo: los tres números tienen que moverse juntos, y el
    // que solo hable de sí mismo deja el bloque atrás otra vez.
    expect(texto).toContain('src/blocks/index.ts')
    expect(texto).toContain('src/admin/esquema.ts')
  })
})

describe('el cable de la pose del catálogo', () => {
  it('la regla existe y se pide por la dirección que el campo nombra', () => {
    expect(typeof encuadreVigente).toBe('function')
  })

  it('y quien enseña un modelo del catálogo se la pide', () => {
    // Si esto se cae, el campo `encuadre` de `modelos-3d` vuelve a verse lleno
    // en el panel y vacío en la pantalla del residente, que es el estado que el
    // comentario ya no describe.
    expect(BLOQUES_TSX).toMatch(/import \{[^}]*encuadreVigente/)
    expect(BLOQUES_TSX).toMatch(/encuadreVigente\(/)
  })

  it('el campo no dice que el cable esté sin tender ni que vaya en otro lote', () => {
    const texto = enUnaLinea(MODELOS_3D)
    const arreglo =
      'El cable está tendido y las dos líneas de arriba lo comprueban: `Bloques.tsx` importa y ' +
      'llama a `encuadreVigente`. Arreglar el comentario de `src/collections/Modelos3D.ts`.'
    yaNoDice(texto, 'todavía no está tendido', arreglo)
    yaNoDice(texto, 'otro lote', arreglo)
    yaNoDice(texto, 'no la ve aún el residente', arreglo)
  })

  it('no manda a buscar `tieneEncuadre` donde ya no está declarada', () => {
    // Se fue de `Visor3D.tsx` para que el servidor pudiera llamarla. El visor
    // la reexporta, así que citarla por el nombre viejo no es falso, pero manda
    // a abrir un archivo donde no está el cuerpo.
    expect(typeof tieneEncuadre).toBe('function')
    expect(VISOR).toContain('export { tieneEncuadre }')
    expect(VISOR, 'una segunda copia contestaría distinto el día que una se mueva').not.toMatch(
      /const tieneEncuadre\s*=/,
    )
    const porElNombreViejo = '`tieneEncuadre` (`src/components/Visor3D.tsx`)'
    const texto = enUnaLinea(MODELOS_3D)
    yaNoDice(
      texto,
      porElNombreViejo,
      'Citarla por `src/lib/encuadre.ts`, que es la puerta que se escribe.',
    )
    expect(texto).toContain('`tieneEncuadre` (`src/lib/encuadre.ts`')
    // La misma cita por el nombre viejo se escribió ese día en la prueba del
    // esquema y allí no se corrigió. Manda a abrir un archivo donde solo está
    // la reexportación, que es justo lo que las líneas de arriba acaban de
    // comprobar que es lo único que queda ahí.
    yaNoDice(
      enUnaLinea(ESQUEMA_TEST),
      porElNombreViejo,
      'Lo dice tests/unit/esquema.test.ts, y `Visor3D.tsx` hoy solo la reexporta: el cuerpo está ' +
        'en `src/lib/aritmeticaDelEncuadre.ts`. Arreglo: «`tieneEncuadre` ' +
        '(`src/lib/aritmeticaDelEncuadre.ts`, que `@/lib/encuadre` y `Visor3D.tsx` reexportan)». ' +
        'Ese archivo es de otro lote: avisar antes de tocarlo.',
    )
  })
})

describe('los dos encuadres significan lo mismo, y los dos comentarios lo dicen', () => {
  /** Los subcampos del grupo `encuadre` que nacen con un valor puesto. */
  const conValorPorOmision = (campos: Field[]): string[] => {
    const grupo = campos.find((c) => 'name' in c && c.name === 'encuadre') as
      | { fields?: Field[] }
      | undefined
    return (grupo?.fields ?? [])
      .map((c) => c as { name?: string; defaultValue?: unknown })
      .filter((c) => c.defaultValue !== undefined)
      .map((c) => c.name ?? '?')
  }

  it('ninguno de los dos nace con `defaultValue`', () => {
    // En el bloque, que manda sobre el modelo, un valor por omisión hace que
    // todo bloque conteste «sí, tengo encuadre» sin que nadie haya capturado
    // nada: la pose del catálogo no llega nunca al residente y la regla de
    // precedencia queda escrita, probada y muerta. En el catálogo el daño es
    // otro —se pierde el encuadre automático— pero la conclusión es la misma.
    expect(conValorPorOmision(Modelos3D.fields)).toEqual([])
    expect(
      conValorPorOmision(BLOQUES_PAYLOAD.find((b) => b.slug === 'modelo-3d')!.fields),
    ).toEqual([])
  })

  it('y ya no queda nadie diciendo que esté al revés que el bloque', () => {
    // Lo estuvo, y el bloque se puso al día primero: durante ese rato los dos
    // comentarios se contradecían, que es peor que uno solo equivocado.
    const laContradiccion = 'al revés que el bloque'
    yaNoDice(
      enUnaLinea(MODELOS_3D),
      laContradiccion,
      'Arreglar el comentario de `src/collections/Modelos3D.ts`: «igual que el bloque».',
    )
    // «Nadie» y no «el campo»: la frase se copió ese mismo día a la prueba del
    // esquema, que declara el mismo grupo. Corregir el original y dejar la
    // copia deja la contradicción intacta, solo que ahora entre una colección y
    // una prueba, que es donde se mira para saber qué está garantizado.
    yaNoDice(
      enUnaLinea(ESQUEMA_TEST),
      laContradiccion,
      'Lo dice tests/unit/esquema.test.ts. Hoy el bloque tampoco trae `defaultValue` ' +
        '(`src/blocks/index.ts`), y la comprobación de arriba en esta misma prueba lo verifica ' +
        'sobre los dos. Arreglo: «igual que el bloque». Ese archivo es de otro lote: avisar antes ' +
        'de tocarlo.',
    )
  })
})

describe('las tres columnas del simulador en `actividad`', () => {
  it('tienen quien las escriba y quien se las mande', () => {
    expect(ACCION_DE_ACTIVIDAD).toMatch(/export async function registrarResultadoDeCirugia/)
    expect(ACCION_DE_ACTIVIDAD).toContain('puntajeMaximo:')
    expect(ACCION_DE_ACTIVIDAD).toContain('complicaciones:')
    expect(CONSOLA).toContain('registrarResultadoDeCirugia')
  })

  it('y la cabecera ya no dice que falte quien las llene', () => {
    const texto = enUnaLinea(ACTIVIDAD)
    const arreglo =
      'Las tres columnas ya tienen quien las llene, y la prueba de arriba lo comprueba: ' +
      '`registrarResultadoDeCirugia` las escribe y `ConsolaQuirurgica.tsx` la llama. Arreglar la ' +
      'cabecera de `src/collections/Actividad.ts`.'
    yaNoDice(texto, 'quien las llena, todavía no', arreglo)
    yaNoDice(texto, 'van en otro lote', arreglo)
    yaNoDice(texto, 'se quedan nulos en todas las filas', arreglo)
    // Y nombra a los dos extremos, para que el que descablee uno encuentre aquí
    // el otro en vez de tener que buscarlo.
    expect(texto).toContain('registrarResultadoDeCirugia')
    expect(texto).toContain('ConsolaQuirurgica.tsx')
  })

  it('la regla de creación vive una sola vez y la usan las dos colecciones', () => {
    // Vivió en Actividad.ts como CREACION_DEL_MODULO_PROPIO, con un aviso de
    // que se mudaría; se mudó a src/access/payload.ts cuando comentarios
    // necesitó la misma. Se comprueba por identidad y no buscando el nombre en
    // el texto: si alguien la vuelve a copiar en una colección, deja de ser la
    // misma función aunque se llame igual, y un comentario que la cite no hace
    // pasar nada.
    expect(Actividad.access?.create).toBe(creacionEnModuloVisible)
    expect(Comentarios.access?.create).toBe(creacionEnModuloVisible)
  })

  it('el tope de complicaciones es el mismo número en la columna y en el recorte', () => {
    // La columna lo declara y la consola recorta contra él antes de mandar. Si
    // se separan, Payload rechaza la lista entera —y con ella el puntaje— y el
    // residente termina el caso sin que se le guarde nada.
    const complicaciones = Actividad.fields.find(
      (c) => 'name' in c && c.name === 'complicaciones',
    ) as { maxRows?: number } | undefined
    expect(complicaciones?.maxRows).toBe(MAXIMO_DE_COMPLICACIONES)
  })
})

describe('el editor de encuadre del panel', () => {
  it('resuelve los dos formularios en los que se declara', () => {
    expect(CAMPOS).toContain('function modeloParaEncuadrar')
    expect(CAMPOS).toContain("opcionDeRelacion(relaciones, 'modelos-3d', hermanos?.modelo)")
    expect(CAMPOS).toMatch(/hermanos\?\.url/)
    expect(CAMPOS).toContain(
      "campo.editor === 'encuadre3d' ? modeloParaEncuadrar(relaciones, hermanos)",
    )
  })

  it('y ya no queda nadie diciendo que solo resuelva el primero', () => {
    const texto = enUnaLinea(ESQUEMA)
    const enElEsquema =
      'El respaldo está escrito y la prueba de arriba lo comprueba. Arreglar el comentario de ' +
      '`src/admin/esquema.ts`.'
    yaNoDice(texto, 'solo resuelve el primero', enElEsquema)
    yaNoDice(texto, 'Falta el respaldo', enElEsquema)
    yaNoDice(texto, 'otro lote', enElEsquema)

    // La promesa retirada sobrevivió en la prueba del esquema, y ahí hace el
    // daño completo: manda a escribir el respaldo que la comprobación de
    // arriba, en esta misma prueba, acaba de encontrar escrito. Se persiguen
    // las dos mitades de la frase porque reescribir una sola deja la otra
    // diciendo lo mismo.
    const enLaPrueba = enUnaLinea(ESQUEMA_TEST)
    const arreglo =
      'Lo dice tests/unit/esquema.test.ts, y es falso desde que existe `modeloParaEncuadrar` ' +
      '(`src/components/admin/formulario/Campos.tsx`). Arreglo: decir que quién encuentra el ' +
      'archivo —el hermano `modelo` en una ficha, la `url` del propio documento en un modelo— lo ' +
      'resuelve `modeloParaEncuadrar` y lo ata tests/unit/encuadreDelModelo.test.ts. Ese archivo ' +
      'es de otro lote: avisar antes de tocarlo.'
    yaNoDice(enLaPrueba, 'Lo que falta es el respaldo', arreglo)
    yaNoDice(enLaPrueba, 'en pantalla no hay lienzo', arreglo)
  })

  it('y la prueba a la que ese comentario manda sigue estando donde se la cita', () => {
    // La corrección no promete pantalla: manda a `encuadreDelModelo.test.ts`,
    // que es quien recorre las dos ramas de verdad. Si esa prueba se borrara o
    // se le cayera el caso del modelo, el comentario volvería a ser el único
    // sitio donde consta y estas prohibiciones de arriba no guardarían nada.
    expect(ENCUADRE_DEL_MODELO_TEST).toContain(
      'el editor de encuadre encuentra el archivo en los dos formularios',
    )
    expect(ENCUADRE_DEL_MODELO_TEST).toContain('modeloParaEncuadrar')
  })
})

describe('la ayuda del encuadre en pantalla estrecha', () => {
  it('viaja dentro de lo que se esconde, y el aviso queda en su sitio', () => {
    // Cuando se escribió aquel comentario, la ayuda se quedaba en pantalla y
    // por eso tenía que nombrar los números a mano. Hoy se va con el visor.
    expect(CAMPOS).toMatch(/<div className="solo-ancho">\s*\{ayuda\}/)
    expect(CAMPOS).toContain('solo-estrecho')
  })

  it('y el comentario no sigue diciendo que sea esa frase la que salva la tableta', () => {
    yaNoDice(
      enUnaLinea(ESQUEMA),
      'buscando en la tableta un botón que ahí no está',
      'La ayuda viaja hoy dentro de lo que se esconde, y la prueba de arriba lo comprueba. ' +
        'Arreglar el comentario de `src/admin/esquema.ts`.',
    )
  })
})
