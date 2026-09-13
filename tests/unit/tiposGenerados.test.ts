import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CollectionConfig, Field } from 'payload'
import { COLECCIONES } from '@/collections'

/**
 * `src/payload-types.ts` va al día con las colecciones.
 *
 * Ese archivo no se escribe a mano: lo genera `npm run generate:types` leyendo
 * la configuración, y es el tipo que importa todo lo que lee o escribe un
 * documento. Que esté atrasado **no rompe nada el día que se atrasa**, y ahí
 * está la trampa: `tsc` pasa, las pruebas pasan y el archivo sigue describiendo
 * el esquema de la semana pasada. La factura la paga el siguiente, que abre
 * `Actividad` para escribir el puntaje del caso, no encuentra el campo, y tiene
 * que decidir si el tipo está mal o el campo no existe.
 *
 * Ya pasó en este lote: se añadieron `encuadre` a `modelos-3d` y `puntaje`,
 * `puntajeMaximo` y `complicaciones` a `actividad`, se retiró `zonaMapa` de
 * `segmentos`, y los tipos se quedaron como estaban. La convención del
 * repositorio es regenerarlos en el mismo cambio que el esquema —el commit
 * 2dfd3c2 los trae junto a la malla del instrumento—, y una convención que solo
 * vive en la cabeza de quien la recuerda dura hasta el siguiente lote.
 *
 * Si alguna de estas falla, la respuesta casi siempre es:
 *
 *     npm run generate:types
 *
 * No hace falta la base levantada: el generador carga la configuración, no
 * conecta.
 *
 * Qué NO se comprueba aquí, para que nadie confíe de más: el tipo de cada campo
 * —un `text` que pasa a `number` no lo ve esto—, lo que hay dentro de un grupo o
 * de un arreglo, y los bloques. Se comparan los nombres de primer nivel de cada
 * colección, que es donde se nota el olvido y lo que se puede comprobar sin
 * reimplementar el generador de Payload dentro de una prueba.
 */

const TIPOS = readFileSync(join(process.cwd(), 'src', 'payload-types.ts'), 'utf8')

/**
 * El cuerpo de la interfaz que Payload escribió para un slug.
 *
 * Se busca por el comentario `via the \`definition\` "<slug>"` y no por el
 * nombre de la interfaz: el nombre lo compone Payload a partir del slug con sus
 * propias reglas —`modelos-3d` es `Modelos3D`, `casos-ao` es `CasosAo`— y
 * reimplementarlas aquí sería inventar una segunda fuente de verdad para
 * comprobar la primera. El comentario lleva el slug tal cual.
 */
function cuerpoDeLaDefinicion(slug: string): string {
  const marca = `via the \`definition\` "${slug}".`
  const donde = TIPOS.indexOf(marca)
  if (donde === -1) {
    throw new Error(
      `src/payload-types.ts no describe la colección «${slug}». Ejecute npm run generate:types.`,
    )
  }
  const inicio = TIPOS.indexOf('{', donde)
  let profundidad = 0
  for (let i = inicio; i < TIPOS.length; i += 1) {
    if (TIPOS[i] === '{') profundidad += 1
    else if (TIPOS[i] === '}') {
      profundidad -= 1
      if (profundidad === 0) return TIPOS.slice(inicio + 1, i)
    }
  }
  throw new Error(`La interfaz de «${slug}» no cierra en src/payload-types.ts.`)
}

/**
 * Las claves del primer nivel de ese cuerpo.
 *
 * Se lleva la cuenta de las llaves porque un grupo y un arreglo escriben sus
 * subcampos dentro, y aquí solo interesan los de arriba: sin esa cuenta,
 * `escala` —que vive dentro de `encuadre`— contaría como campo de la colección
 * y la comprobación pasaría por razones equivocadas.
 */
function clavesDePrimerNivel(cuerpo: string): string[] {
  const claves: string[] = []
  let profundidad = 0
  for (const linea of cuerpo.split('\n')) {
    if (profundidad === 0) {
      const encontrada = /^([A-Za-z_][A-Za-z0-9_]*)\??:/.exec(linea.trim())
      if (encontrada) claves.push(encontrada[1])
    }
    for (const caracter of linea) {
      if (caracter === '{') profundidad += 1
      else if (caracter === '}') profundidad -= 1
    }
  }
  return claves
}

/**
 * Los campos de primer nivel de una colección, tal como salen en el tipo.
 *
 * Filas, columnas y pestañas **sin nombre** no son datos: agrupan en pantalla y
 * Payload aplana su contenido en el documento, así que hay que entrar en ellas o
 * los seis campos de una fila se darían por inexistentes. Todas las pestañas de
 * `src/collections` son de esas hoy (llevan `label`, no `name`); una con nombre
 * sí sería una clave propia, y por eso se comprueba antes de descender.
 */
function camposDePrimerNivel(campos: Field[]): string[] {
  const nombres: string[] = []
  for (const campo of campos) {
    if ('name' in campo && typeof campo.name === 'string') {
      nombres.push(campo.name)
      continue
    }
    if ('tabs' in campo && Array.isArray(campo.tabs)) {
      for (const pestana of campo.tabs) {
        if ('name' in pestana && typeof pestana.name === 'string') nombres.push(pestana.name)
        else nombres.push(...camposDePrimerNivel(pestana.fields as Field[]))
      }
      continue
    }
    if ('fields' in campo && Array.isArray(campo.fields)) {
      nombres.push(...camposDePrimerNivel(campo.fields as Field[]))
    }
  }
  return nombres
}

/**
 * Las claves que pone Payload y que ninguna colección declara.
 *
 * Existe para que la comprobación pueda mirar también en la otra dirección —qué
 * sobra en el tipo—, que es la única que caza un campo **retirado** sin
 * regenerar. `zonaMapa` se quitó de `segmentos` en este mismo lote y seguía
 * escrito en `Segmento`: por el lado de «lo declarado está» eso pasa en verde
 * para siempre.
 *
 * La lista es de Payload, no nuestra, así que puede crecer en una actualización
 * suya. Si eso pasa, la prueba falla nombrando la clave nueva y lo que hay que
 * hacer es añadirla aquí, no aflojar la comprobación.
 */
const LO_QUE_AÑADE_PAYLOAD = {
  siempre: ['id', 'updatedAt', 'createdAt'],
  versionada: ['_status'],
  subida: [
    'url',
    'thumbnailURL',
    'filename',
    'mimeType',
    'filesize',
    'width',
    'height',
    'focalX',
    'focalY',
    'sizes',
  ],
  autenticacion: [
    // `collection: 'usuarios'` lo escribe Payload en el tipo del usuario de la
    // sesión para distinguir de qué colección salió cuando hay varias con
    // autenticación. Aquí solo hay una, y aun así el generador lo pone.
    'collection',
    'email',
    'password',
    'resetPasswordToken',
    'resetPasswordExpiration',
    'salt',
    'hash',
    'loginAttempts',
    'lockUntil',
    'sessions',
  ],
}

function claveDeLaCasa(coleccion: CollectionConfig): Set<string> {
  const claves = [...LO_QUE_AÑADE_PAYLOAD.siempre]
  if (coleccion.versions) claves.push(...LO_QUE_AÑADE_PAYLOAD.versionada)
  if (coleccion.upload) claves.push(...LO_QUE_AÑADE_PAYLOAD.subida)
  if (coleccion.auth) claves.push(...LO_QUE_AÑADE_PAYLOAD.autenticacion)
  return new Set(claves)
}

describe('los tipos generados describen las colecciones de hoy', () => {
  for (const coleccion of COLECCIONES) {
    it(`«${coleccion.slug}» está entera en src/payload-types.ts`, () => {
      const enElTipo = clavesDePrimerNivel(cuerpoDeLaDefinicion(coleccion.slug))
      const declarados = camposDePrimerNivel(coleccion.fields)

      for (const nombre of declarados) {
        expect(
          enElTipo,
          `«${coleccion.slug}» declara «${nombre}» y el tipo no lo tiene: falta npm run generate:types`,
        ).toContain(nombre)
      }

      const dePayload = claveDeLaCasa(coleccion)
      const sobran = enElTipo.filter((c) => !declarados.includes(c) && !dePayload.has(c))
      expect(
        sobran,
        `el tipo de «${coleccion.slug}» trae campos que la colección ya no declara: falta npm run generate:types`,
      ).toEqual([])
    })
  }
})

/**
 * Y los tres cambios de este lote, nombrados uno a uno.
 *
 * Lo de arriba compara listas y por eso vale para lo que venga; esto nombra lo
 * que el traumatólogo pidió hoy, que es lo que va a leer el lote siguiente: la
 * consola que escriba el puntaje y el visor que lea la pose. Si alguien
 * regenera los tipos desde una copia atrasada de las colecciones, la
 * comparación de arriba lo caza igual, pero este es el mensaje que dice qué se
 * perdió.
 */
describe('lo que este lote añadió al esquema llegó a los tipos', () => {
  it('un modelo 3D trae su encuadre', () => {
    const cuerpo = cuerpoDeLaDefinicion('modelos-3d')
    expect(clavesDePrimerNivel(cuerpo)).toContain('encuadre')
    // Los cinco números, que son la forma que `Visor3D` sabe consumir: un
    // `encuadre` con otras claves no serviría para cablear la pose.
    for (const clave of ['escala', 'giroX', 'giroY', 'giroZ', 'distanciaCamara']) {
      expect(cuerpo, `modelos-3d.encuadre.${clave}`).toContain(`${clave}?:`)
    }
  })

  it('una fila de actividad trae el puntaje y las complicaciones', () => {
    const claves = clavesDePrimerNivel(cuerpoDeLaDefinicion('actividad'))
    expect(claves).toContain('puntaje')
    expect(claves).toContain('puntajeMaximo')
    expect(claves).toContain('complicaciones')
  })

  it('un segmento ya no arrastra el mapa corporal', () => {
    // La migración suelta las cuatro columnas. Un tipo que siga prometiendo
    // `zonaMapa` invita a leer lo que la base ya no guarda.
    expect(clavesDePrimerNivel(cuerpoDeLaDefinicion('segmentos'))).not.toContain('zonaMapa')
    expect(TIPOS).not.toContain('zonaMapa')
  })
})
