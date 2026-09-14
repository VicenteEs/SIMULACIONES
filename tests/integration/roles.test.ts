import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import { COLECCIONES, SLUGS_DE_MODULOS } from '@/collections'
import { CATALOGOS_DEL_SIMULADOR } from '@/collections/catalogos'

/**
 * Qué puede hacer cada rol, comprobado contra una base de verdad.
 *
 * Las reglas de `src/access/reglas.ts` tienen sus pruebas puras, y esas pruebas
 * dicen lo que devuelve una función. No dicen lo que devuelve **la base** cuando
 * Payload combina esa función con la consulta, con los borradores, con el
 * acceso de campo y con los ganchos. Ahí es donde se escaparon los fallos que
 * este archivo existe para no repetir: los borradores que cualquiera leía por
 * `/versions` porque `readVersions` no se hereda, el residente que movía su
 * historial a la cuenta de otro porque el campo no tenía acceso propio, el
 * editor apartado del simulador que seguía borrando instrumentos. Todos
 * pasaban sus pruebas unitarias.
 *
 * La política que se demuestra la fijó el dueño con estas palabras: «que el
 * editor pueda editar todo el contenido de la página, que el admin tenga acceso
 * a todo y que el lector no pueda modificar nada». Traducida a filas:
 *
 *  - ADMIN: todo.
 *  - EDITOR: lee, crea, edita, publica y borra todo el contenido, salvo que un
 *    administrador le haya restringido módulos; entonces, solo esos. Da igual
 *    cuál de las dos listas restrinja: un módulo que no puede ver tampoco lo
 *    edita. No toca cuentas.
 *  - LECTOR: lee lo publicado de los módulos que tiene visibles. Escribe solo lo
 *    suyo —su comentario, su progreso— y nunca la fila de otro.
 *  - DESACTIVADO o SIN SESIÓN: nada.
 *
 * ## La matriz sale de las colecciones, no de una lista
 *
 * Se recorre `COLECCIONES` —lo mismo que registra `payload.config.ts`— y cada
 * colección tiene que tener aquí su clase de política y su fábrica de
 * documentos. Una colección nueva sin entrada hace fallar la prueba: es la
 * forma de que nadie la registre sin haber dicho antes quién la puede tocar.
 *
 * Lo esperado se escribe aquí a mano, en términos de actores, y **no** se
 * calcula llamando a `reglas.ts`. Si se calculara con ellas, la prueba
 * afirmaría que las reglas coinciden consigo mismas y un error en la regla
 * saldría en verde por los dos lados.
 *
 * ## Lo que se mira es el efecto, no la excepción
 *
 * Una escritura «rechazada» cuenta como rechazada si la base sigue como estaba,
 * y una «permitida» si la base cambió. Mirar solo si hubo excepción deja pasar
 * los dos casos que más cuestan: el acceso de campo que descarta el valor sin
 * lanzar —la operación «funciona» y no cambió nada— y el filtro que devuelve
 * cero filas en vez de un 403.
 *
 * ## Las sesiones son sesiones
 *
 * Los usuarios no se inventan como objetos sueltos: se crean en la base, entran
 * con `payload.login` y se resuelven con `payload.auth` a partir de la cookie,
 * que es exactamente el camino de `obtenerSesion`. Así la cuenta desactivada es
 * la de verdad —una que tenía sesión abierta cuando la dieron de baja— y no un
 * `activo: false` escrito a mano que Payload nunca vería.
 *
 * ## Dónde correrla
 *
 * Crea y borra sus propias filas, con una marca aleatoria en cada nombre, y
 * funciona sobre cualquier base migrada. Lo recomendable es una desechable
 * (ver «Antes de subir» en AGENTS.md): escribe archivos de prueba en `medios/`
 * y los retira al terminar, pero si el proceso muere a la mitad se quedan.
 */

/**
 * Las colecciones de `src/collections`, tomadas **antes** de arrancar Payload.
 *
 * No da igual el momento. `buildConfig` añade al mismo arreglo que recibe sus
 * colecciones internas —`payload-preferences`, `payload-locked-documents`,
 * `payload-migrations`, `payload-kv`—, y `COLECCIONES` es ese arreglo: leído
 * después de `getPayload`, la matriz exigía política para tablas que no son de
 * la plataforma. Esas cuatro no se prueban aquí porque no se alcanzan desde
 * fuera: no están en el panel y la API REST que las servía está cerrada (D-073,
 * y lo demuestra el último bloque de este archivo).
 */
const COLECCIONES_PROPIAS = COLECCIONES.map((c) => c)

type IntentoDeConexion = { payload: Payload; fallo: null } | { payload: null; fallo: string }

// La conexión al cargar el archivo, y la política de omisión de tres estados,
// son las de `tests/integration/acceso.test.ts`; el porqué entero está allí.
const intento: IntentoDeConexion = await (async (): Promise<IntentoDeConexion> => {
  try {
    const { getPayload } = await import('payload')
    const config = (await import('@payload-config')).default
    return { payload: await getPayload({ config }), fallo: null }
  } catch (error) {
    process.on('unhandledRejection', () => {})
    return { payload: null, fallo: error instanceof Error ? error.message : String(error) }
  }
})()

const seExigenLasPruebas =
  !['', 'false', '0'].includes(process.env.CI ?? '') || process.env.EXIGIR_INTEGRACION === '1'
const hayPermisoParaOmitir = process.env.OMITIR_INTEGRACION === '1' && !seExigenLasPruebas

describe('la matriz de roles no se omite sola', () => {
  it('la base respondió, o alguien pidió omitirla por escrito', () => {
    if (intento.fallo === null || hayPermisoParaOmitir) return
    expect(
      hayPermisoParaOmitir,
      [
        'La matriz de roles no llegó a ejecutarse.',
        `Causa: ${intento.fallo}`,
        'Levantar la base con «npm run db:up» y revisar DATABASE_URI y PAYLOAD_SECRET en .env.',
      ].join('\n'),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------- los actores

const ACTORES = [
  'admin',
  'editor',
  'editorRestringido',
  // Editor con la **lectura** restringida y la edición sin tocar. El modal de
  // permisos de `TablaUsuarios.tsx` deja guardar esa combinación, y durante un
  // tiempo quería decir «no ve cirugías, pero las reescribe»: `puedeEditarModulo`
  // miraba solo `modulosEditables`, y una lista vacía ahí es «todos». El `find`
  // le daba 403 y `findVersions`, `update` y el panel le dejaban pasar.
  'editorSinVer',
  'lector',
  'lectorRestringido',
  'desactivado',
  'anonimo',
] as const
type Actor = (typeof ACTORES)[number]

/**
 * El módulo al que se restringe a los tres actores restringidos.
 *
 * Es el mismo para los tres a propósito, y es el primero de la lista: así cada
 * operación sobre cualquier otro módulo prueba la restricción, y la de este
 * prueba que restringir no es lo mismo que prohibir.
 */
const MODULO_PROPIO = 'patologias'

const esActivo = (a: Actor) => a !== 'desactivado' && a !== 'anonimo'
const esAdmin = (a: Actor) => a === 'admin'
const tieneRolDeEditor = (a: Actor) => a === 'editor' || a === 'editorRestringido' || a === 'editorSinVer'
const escribeContenido = (a: Actor) => esAdmin(a) || tieneRolDeEditor(a)
const veModulo = (a: Actor, modulo: string) =>
  esActivo(a) && ((a !== 'lectorRestringido' && a !== 'editorSinVer') || modulo === MODULO_PROPIO)
/**
 * Editar un módulo exige verlo. Se escribe como dos condiciones y no como una
 * lista de actores para que la de `editorSinVer` salga de su lectura y no de
 * su edición, que es exactamente lo que la regla vieja olvidaba.
 */
const escribeModulo = (a: Actor, modulo: string) =>
  veModulo(a, modulo) &&
  (esAdmin(a) || a === 'editor' || a === 'editorSinVer' || (a === 'editorRestringido' && modulo === MODULO_PROPIO))

// ------------------------------------------------------------- las políticas

/**
 * Las cinco clases de colección que distingue la plataforma.
 *
 *  - `modulo`: los cinco módulos. Borradores, lectura por módulo visible y
 *    escritura por módulo editable.
 *  - `vocabulario`: los catálogos del simulador. Los lee cualquier cuenta
 *    activa —el residente tiene que ver el nombre del instrumento— y los
 *    escribe quien puede editar el módulo 04 (D-073).
 *  - `apoyo`: segmentos, medios, modelos 3D y preparaciones del atlas. Los usan
 *    los cinco módulos a la vez, así que no admiten restricción por módulo: un
 *    editor restringido los sigue escribiendo (ver `puedeEditar`).
 *  - `cuentas`: solo el administrador.
 *  - `administracion`: lo que no es una cuenta pero se gobierna igual, solo el
 *    administrador —las difusiones (D-120)—. Va aparte de `cuentas` porque esa
 *    clase se ata a la colección de auth, y juntarlas quitaría esa atadura.
 *  - `propias`: filas que pertenecen a una cuenta —comentarios y actividad—.
 */
type Clase = 'modulo' | 'vocabulario' | 'apoyo' | 'cuentas' | 'administracion' | 'propias'

const CLASE_DE: Record<string, Clase> = {
  usuarios: 'cuentas',
  segmentos: 'apoyo',
  medios: 'apoyo',
  'modelos-3d': 'apoyo',
  'instancias-atlas': 'apoyo',
  'huesos-ao': 'vocabulario',
  'clasificaciones-ao': 'vocabulario',
  'tecnicas-quirurgicas': 'vocabulario',
  'fases-quirurgicas': 'vocabulario',
  instrumental: 'vocabulario',
  patologias: 'modulo',
  maniobras: 'modulo',
  'casos-ao': 'modulo',
  cirugias: 'modulo',
  'estudios-ia': 'modulo',
  comentarios: 'propias',
  actividad: 'propias',
  difusiones: 'administracion',
}

type Esperado = (a: Actor) => boolean

/** Lo que dice la política para cada operación de cada clase. */
function politica(slug: string, clase: Clase): Record<string, Esperado> {
  switch (clase) {
    case 'modulo':
      return {
        'leer lo publicado': (a) => veModulo(a, slug),
        'leer un borrador nuevo': (a) => escribeModulo(a, slug),
        'leer el borrador de una publicada (draft: true)': (a) => escribeModulo(a, slug),
        'leer el borrador de una publicada (findByID)': (a) => escribeModulo(a, slug),
        'leer las versiones': (a) => escribeModulo(a, slug),
        crear: (a) => escribeModulo(a, slug),
        editar: (a) => escribeModulo(a, slug),
        publicar: (a) => escribeModulo(a, slug),
        borrar: (a) => escribeModulo(a, slug),
      }
    case 'vocabulario':
      return {
        leer: esActivo,
        crear: (a) => escribeModulo(a, 'cirugias'),
        editar: (a) => escribeModulo(a, 'cirugias'),
        borrar: (a) => escribeModulo(a, 'cirugias'),
      }
    case 'apoyo':
      return { leer: esActivo, crear: escribeContenido, editar: escribeContenido, borrar: escribeContenido }
    case 'cuentas':
    case 'administracion':
      return { leer: esAdmin, crear: esAdmin, editar: esAdmin, borrar: esAdmin }
    case 'propias': {
      const comun: Record<string, Esperado> = {
        'leer las propias': esActivo,
        // Crear en un módulo que no es el visible del lector restringido: la
        // fila de lectura o el comentario de un módulo que no puede abrir no
        // es «lo suyo», es contarle al panel algo que no pasó.
        'crear en un módulo': (a) => veModulo(a, 'cirugias'),
        'editar las propias': esActivo,
        'reasignar la propia a otra cuenta': () => false,
        'borrar las ajenas': esAdmin,
      }
      if (slug === 'comentarios') {
        return {
          ...comun,
          // Quien cuida el contenido atiende los comentarios: la bandeja del
          // panel es de editor (D-051).
          'leer las ajenas': escribeContenido,
          'resolver las ajenas': escribeContenido,
          // Nadie reescribe lo que otro firmó, ni el administrador: el panel
          // lo seguiría enseñando con el nombre y el correo del autor.
          'reescribir el texto ajeno': () => false,
        }
      }
      return {
        ...comun,
        // El seguimiento de la actividad es del administrador: sus dos
        // pantallas exigen `exigirPanel('admin')`. El editor lleva el
        // contenido, no el progreso de los residentes.
        'leer las ajenas': esAdmin,
        'editar las ajenas': esAdmin,
      }
    }
  }
}

// ------------------------------------------------------- fábricas de datos

const MARCA = `roles-${randomBytes(4).toString('hex')}`
let contador = 0
const unico = (que: string) => `${MARCA}-${que}-${++contador}`

/** Un texto rico de Lexical con un párrafo: lo mínimo que acepta un `required`. */
const rico = (texto: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: null,
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: null,
        textFormat: 0,
        children: [{ type: 'text', text: texto, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }],
      },
    ],
  },
})

/** PNG de un píxel. Basta para que sharp y la detección de tipo lo acepten. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Cabecera de un glTF binario versión 2, que es lo que mira `validarModelo3D`. */
function glb(): Buffer {
  const json = Buffer.from('{"asset":{"version":"2.0"}}  ', 'utf8')
  const total = 12 + 8 + json.length
  const b = Buffer.alloc(total)
  b.write('glTF', 0, 'ascii')
  b.writeUInt32LE(2, 4)
  b.writeUInt32LE(total, 8)
  b.writeUInt32LE(json.length, 12)
  b.write('JSON', 16, 'ascii')
  json.copy(b, 20)
  return b
}

interface Fixture {
  data: Record<string, unknown>
  file?: { data: Buffer; mimetype: string; name: string; size: number }
}

let segmentoId: number | string

/**
 * Un documento válido de cada colección, con su campo de título.
 *
 * Una colección que no esté aquí no se puede probar, y la prueba lo dice. No
 * se genera a partir del esquema a propósito: lo obligatorio de cada colección
 * lo decide el traumatólogo con sus validaciones, y un generador que adivinara
 * los valores fallaría por motivos que no tienen que ver con los permisos.
 */
const FABRICAS: Record<string, { titulo: string; fabricar: (nombre: string) => Fixture }> = {
  usuarios: {
    titulo: 'nombre',
    fabricar: (nombre) => ({
      data: {
        nombre,
        email: `${nombre}@prueba.invalid`,
        password: randomBytes(18).toString('base64url'),
        rol: 'lector',
        activo: true,
      },
    }),
  },
  segmentos: { titulo: 'nombre', fabricar: (nombre) => ({ data: { nombre, orden: 999 } }) },
  medios: {
    titulo: 'alt',
    fabricar: (nombre) => ({
      data: { alt: nombre },
      file: { data: PNG, mimetype: 'image/png', name: `${nombre}.png`, size: PNG.length },
    }),
  },
  'modelos-3d': {
    titulo: 'nombre',
    fabricar: (nombre) => {
      const datos = glb()
      return {
        data: { nombre, origen: 'sintetico' },
        file: { data: datos, mimetype: 'model/gltf-binary', name: `${nombre}.glb`, size: datos.length },
      }
    },
  },
  'instancias-atlas': {
    titulo: 'nombre',
    fabricar: (nombre) => ({ data: { nombre, contenido: { piezas: [{ id: 'pieza-de-prueba' }] } } }),
  },
  'huesos-ao': { titulo: 'nombre', fabricar: (nombre) => ({ data: { nombre } }) },
  'clasificaciones-ao': { titulo: 'nombre', fabricar: (nombre) => ({ data: { nombre, codigo: 'A1' } }) },
  'tecnicas-quirurgicas': { titulo: 'nombre', fabricar: (nombre) => ({ data: { nombre } }) },
  'fases-quirurgicas': { titulo: 'nombre', fabricar: (nombre) => ({ data: { nombre } }) },
  instrumental: { titulo: 'nombre', fabricar: (nombre) => ({ data: { nombre } }) },
  patologias: { titulo: 'nombre', fabricar: (nombre) => ({ data: { nombre, segmento: segmentoId } }) },
  maniobras: {
    titulo: 'nombre',
    fabricar: (nombre) => ({
      data: { nombre, segmento: segmentoId, evalua: 'Prueba', tecnica: rico('t'), positivo: rico('p') },
    }),
  },
  'casos-ao': { titulo: 'titulo', fabricar: (titulo) => ({ data: { titulo } }) },
  cirugias: { titulo: 'nombre', fabricar: (nombre) => ({ data: { nombre } }) },
  'estudios-ia': { titulo: 'nombre', fabricar: (nombre) => ({ data: { nombre } }) },
  comentarios: {
    titulo: 'texto',
    fabricar: (texto) => ({ data: { texto, coleccion: 'patologias', documentoId: unico('ficha') } }),
  },
  actividad: {
    titulo: 'documentoId',
    fabricar: (documentoId) => ({ data: { coleccion: 'patologias', documentoId } }),
  },
  // Terminada y sin cola: la matriz mira quién la lee y la escribe, y una
  // difusión «enviando» sin trabajador no mandaría nada de todos modos.
  difusiones: {
    titulo: 'asunto',
    fabricar: (asunto) => ({
      data: { asunto, mensaje: 'Aviso de prueba.', audiencia: 'todas', estado: 'enviada', total: 0, enviados: 0, fallidos: 0 },
    }),
  },
}

// ------------------------------------------------------------ la matriz

/**
 * El inventario, pedido por separado para que su fallo tenga nombre propio.
 *
 * Corre también sin base: que una colección nueva no tenga política es un
 * error de código, no de entorno, y no debe esconderse detrás de una omisión.
 */
describe('toda colección registrada tiene política declarada en la matriz', () => {
  const slugs = COLECCIONES_PROPIAS.map((c) => c.slug)

  it('ninguna colección se queda sin clase ni fábrica', () => {
    const sinClase = slugs.filter((s) => !CLASE_DE[s])
    const sinFabrica = slugs.filter((s) => !FABRICAS[s])
    expect(sinClase, 'colecciones sin clase de política en tests/integration/roles.test.ts').toEqual([])
    expect(sinFabrica, 'colecciones sin fábrica de documentos en tests/integration/roles.test.ts').toEqual([])
  })

  it('la matriz no conserva colecciones que ya no existen', () => {
    expect(Object.keys(CLASE_DE).filter((s) => !slugs.includes(s))).toEqual([])
    expect(Object.keys(FABRICAS).filter((s) => !slugs.includes(s))).toEqual([])
  })

  it('cada clase coincide con lo que la colección declara de sí misma', () => {
    // La clase no es una etiqueta libre: si alguien marca un módulo como
    // «apoyo», la matriz dejaría de exigirle la restricción por módulo y
    // pasaría en verde. Se ata a lo que el código dice de la colección.
    const catalogos = CATALOGOS_DEL_SIMULADOR.map((c) => c.slug)
    for (const coleccion of COLECCIONES_PROPIAS) {
      const clase = CLASE_DE[coleccion.slug]
      const borradores = Boolean((coleccion.versions as { drafts?: unknown } | undefined)?.drafts)
      const esModulo = (SLUGS_DE_MODULOS as readonly string[]).includes(coleccion.slug)
      expect(clase === 'modulo', `${coleccion.slug}: clase «modulo» solo para los cinco módulos`).toBe(esModulo)
      expect(borradores, `${coleccion.slug}: solo los módulos guardan borradores`).toBe(esModulo)
      expect(clase === 'vocabulario', `${coleccion.slug}: «vocabulario» solo para los catálogos`).toBe(
        catalogos.includes(coleccion.slug),
      )
      expect(clase === 'cuentas', `${coleccion.slug}: «cuentas» solo para la colección de auth`).toBe(
        Boolean(coleccion.auth),
      )
    }
  })
})

describe.skipIf(intento.payload === null)('cada rol contra la base', () => {
  const payload = intento.payload as Payload

  /** El usuario de cada actor, tal como lo resuelve `payload.auth`. */
  const sesion = {} as Record<Actor, Record<string, unknown> | null>
  const testigo = {} as Partial<Record<Actor, string>>
  const claveDe = {} as Partial<Record<Actor, string>>
  const cuentaDe = {} as Partial<Record<Actor, number | string>>
  let ajeno: Record<string, unknown>
  let habiaAdministradorAntes = false

  /** Lo que la prueba creó, para dejar la base como la encontró. */
  const creados: { collection: string; id: number | string }[] = []

  const crearComo = async (
    collection: string,
    fixture: Fixture,
    opciones: { draft?: boolean; user?: Record<string, unknown> | null } = {},
  ) => {
    const doc = (await payload.create({
      collection: collection as never,
      data: fixture.data as never,
      file: fixture.file as never,
      draft: opciones.draft,
      user: (opciones.user ?? undefined) as never,
      overrideAccess: true,
    })) as unknown as Record<string, unknown> & { id: number | string }
    creados.push({ collection, id: doc.id })
    return doc
  }

  const leerSinReglas = async (collection: string, id: number | string, draft = false) =>
    (await payload.findByID({
      collection: collection as never,
      id,
      draft,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })) as unknown as Record<string, unknown> | null

  /** Entra de verdad y devuelve el usuario que resolvería `obtenerSesion`. */
  async function entrar(email: string, password: string) {
    const { token } = await payload.login({ collection: 'usuarios', data: { email, password } })
    const cabeceras = new Headers({
      cookie: `${payload.config.cookiePrefix}-token=${token}`,
      // Lo que manda un navegador en una navegación del propio sitio. Sin
      // `Origin` y con CSRF configurado, Payload decide por esta cabecera.
      'sec-fetch-site': 'same-origin',
    })
    const { user } = await payload.auth({ headers: cabeceras })
    return { token: token as string, user: user as unknown as Record<string, unknown> }
  }

  beforeAll(async () => {
    const { totalDocs } = await payload.count({
      collection: 'usuarios',
      where: { and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }] },
      overrideAccess: true,
    })
    habiaAdministradorAntes = totalDocs > 0

    // El administrador primero: sobre una base vacía, la primera cuenta nace
    // administradora pase lo que pase (`ajustarPrimerUsuario`), y si fuera la
    // del lector la matriz entera estaría probando otra cosa.
    const definiciones: [Actor, Record<string, unknown>][] = [
      ['admin', { rol: 'admin' }],
      ['editor', { rol: 'editor', modulosEditables: [] }],
      ['editorRestringido', { rol: 'editor', modulosEditables: [MODULO_PROPIO] }],
      ['editorSinVer', { rol: 'editor', modulosVisibles: [MODULO_PROPIO], modulosEditables: [] }],
      ['lector', { rol: 'lector' }],
      ['lectorRestringido', { rol: 'lector', modulosVisibles: [MODULO_PROPIO] }],
      // Administrador, a propósito: lo que se demuestra es que una cuenta dada
      // de baja no conserva nada, tampoco el rol más alto.
      ['desactivado', { rol: 'admin' }],
    ]
    for (const [actor, extra] of definiciones) {
      const fixture = FABRICAS.usuarios.fabricar(unico(actor))
      const password = fixture.data.password as string
      const cuenta = await payload.create({
        collection: 'usuarios',
        data: { ...fixture.data, ...extra, activo: true } as never,
        overrideAccess: true,
      })
      cuentaDe[actor] = cuenta.id
      const entrada = await entrar(fixture.data.email as string, password)
      testigo[actor] = entrada.token
      sesion[actor] = entrada.user
      claveDe[actor] = password
    }
    sesion.anonimo = null

    // La baja llega con la sesión abierta, que es el caso real: el testigo
    // sigue firmado ocho horas y lo único que cambia es la fila.
    await payload.update({
      collection: 'usuarios',
      id: cuentaDe.desactivado!,
      data: { activo: false },
      overrideAccess: true,
    })
    sesion.desactivado = (
      await payload.auth({
        headers: new Headers({
          cookie: `${payload.config.cookiePrefix}-token=${testigo.desactivado}`,
          'sec-fetch-site': 'same-origin',
        }),
      })
    ).user as unknown as Record<string, unknown>

    // El dueño de las filas ajenas: una cuenta que no es ningún actor.
    ajeno = (await payload.create({
      collection: 'usuarios',
      data: FABRICAS.usuarios.fabricar(unico('ajeno')).data as never,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    const segmento = await crearComo('segmentos', FABRICAS.segmentos.fabricar(unico('segmento')))
    segmentoId = segmento.id
  }, 120_000)

  afterAll(async () => {
    // Al revés de como se crearon: las filas que apuntan a otras, primero.
    for (const { collection, id } of [...creados].reverse()) {
      await payload.delete({ collection: collection as never, id, overrideAccess: true }).catch(() => {})
    }
    const cuentas = [...Object.entries(cuentaDe)]
      .filter(([actor, id]) => actor !== 'admin' && id !== undefined)
      .map(([, id]) => id!)
    if (ajeno) cuentas.push(ajeno.id as number)
    for (const id of cuentas) {
      await payload.delete({ collection: 'usuarios', id, overrideAccess: true }).catch(() => {})
    }
    if (cuentaDe.admin !== undefined) await retirarAlAdministradorDePrueba(cuentaDe.admin)
  }, 120_000)

  /**
   * Borra la cuenta de administrador de la prueba, también cuando es la última.
   *
   * Sobre una base que ya tiene su administrador —la de desarrollo—, esto es un
   * `payload.delete` corriente. Sobre una recién migrada no hay ninguno más, y
   * entonces la cuenta de la prueba es la última: la frenan a la vez el gancho
   * `impedirBorradoDelUltimoAdmin` y el disparador de D-071, que es justo lo
   * que tienen que hacer con una cuenta real. Dejarla viva no es inocuo: una
   * base con un administrador activo deja de ofrecer `/instalar`, y quien
   * corrió la suite antes de su primer `npm run dev` se queda sin forma de
   * crear su cuenta, con un administrador cuya clave nadie conoce.
   *
   * Así que, **solo si antes de la prueba no había ningún administrador
   * activo** —es decir, la base vuelve al estado exacto en que estaba—, se
   * borra la fila con el disparador apagado dentro de una única transacción.
   * `ALTER TABLE … DISABLE TRIGGER` es transaccional en PostgreSQL: ninguna
   * otra sesión llega a ver el disparador apagado, porque se vuelve a encender
   * antes del `COMMIT`. Con un administrador previo nunca se toma este camino.
   */
  async function retirarAlAdministradorDePrueba(id: number | string) {
    const borrado = await payload
      .delete({ collection: 'usuarios', id, overrideAccess: true })
      .then(() => true)
      .catch(() => false)
    if (borrado || habiaAdministradorAntes) return

    const { sql } = await import('@payloadcms/db-postgres')
    const drizzle = (payload.db as unknown as { drizzle: { transaction: (f: (tx: never) => Promise<void>) => Promise<void> } }).drizzle
    await drizzle.transaction(async (tx: never) => {
      const ejecutar = (consulta: unknown) =>
        (tx as { execute: (c: unknown) => Promise<{ rows: Record<string, unknown>[] }> }).execute(consulta)
      const { rows } = await ejecutar(sql`
        SELECT tgname FROM pg_trigger
         WHERE tgrelid = '"usuarios"'::regclass
           AND tgfoid = to_regproc('impedir_quedarse_sin_administrador')`)
      const disparadores = rows.map((r) => String(r.tgname))
      for (const nombre of disparadores) {
        await ejecutar(sql`ALTER TABLE "usuarios" DISABLE TRIGGER ${sql.identifier(nombre)}`)
      }
      await ejecutar(sql`DELETE FROM "actividad" WHERE "usuario_id" = ${id}`)
      await ejecutar(sql`DELETE FROM "usuarios" WHERE "id" = ${id}`)
      for (const nombre of disparadores) {
        await ejecutar(sql`ALTER TABLE "usuarios" ENABLE TRIGGER ${sql.identifier(nombre)}`)
      }
    })
  }

  type Operacion = (actor: Actor, user: Record<string, unknown> | null) => Promise<boolean>

  /** Por qué contestó la base lo que contestó, para el mensaje de la discrepancia. */
  let motivo = ''

  /**
   * La operación que se juzga. Su rechazo es una respuesta y no un fallo de la
   * prueba, así que se traga aquí y se anota; lo que decide si «pasó» es el
   * efecto que se mira después.
   *
   * Todo lo demás —preparar la ficha, releerla sin reglas— **no** va por aquí:
   * si eso falla, la prueba tiene que romperse con su error. Tragárselo haría
   * pasar por «la política dice NO y la base dijo NO» una fábrica rota, y en las
   * operaciones que nadie debe poder hacer —reescribir el texto ajeno— eso sería
   * un verde sin haber probado nada.
   */
  const juzgada = async <T,>(operacion: Promise<T>): Promise<T | null> => {
    try {
      const resultado = await operacion
      motivo = 'sin error'
      return resultado
    } catch (error) {
      const estado = (error as { status?: number }).status
      motivo = `rechazada con ${estado ?? (error as Error).message}`
      return null
    }
  }

  /**
   * Recorre todos los actores sobre una operación y falla con la tabla entera.
   *
   * Una aserción por actor cortaría en el primero y escondería el resto; con la
   * tabla se ve de un vistazo si el fallo es de un rol o de una regla.
   */
  async function recorrer(slug: string, nombre: string, esperado: Esperado, operacion: Operacion) {
    const discrepancias: string[] = []
    for (const actor of ACTORES) {
      motivo = ''
      const paso = await operacion(actor, sesion[actor])
      if (paso !== esperado(actor)) {
        discrepancias.push(
          `${slug} · ${nombre} · ${actor}: la política dice ${esperado(actor) ? 'SÍ' : 'NO'} y la base dijo ${paso ? 'SÍ' : 'NO'} (${motivo})`,
        )
      }
    }
    expect(discrepancias, discrepancias.join('\n')).toEqual([])
  }

  const contiene = (resultado: { docs: unknown[] } | null, id: unknown) =>
    Boolean(resultado?.docs.some((d) => (d as { id: unknown }).id === id))

  /** Crea como `user` y dice si la fila quedó escrita, buscándola sin reglas. */
  async function crearYComprobar(
    collection: string,
    fixture: Fixture,
    user: Record<string, unknown> | null,
    donde: Record<string, unknown>,
    draft = false,
  ) {
    const creado = await juzgada(
      payload.create({
        collection: collection as never,
        data: fixture.data as never,
        file: fixture.file as never,
        overrideAccess: false,
        user: user as never,
      }),
    )
    if (creado) creados.push({ collection, id: (creado as { id: number }).id })
    const { docs } = await payload.find({
      collection: collection as never,
      where: donde as never,
      overrideAccess: true,
      draft,
      depth: 0,
    })
    for (const d of docs) creados.push({ collection, id: (d as { id: number }).id })
    return docs.length > 0
  }

  // Las operaciones, una vez cada una; qué se espera lo dice `politica`.

  const operacionesDeContenido = (slug: string): Record<string, Operacion> => {
    const { titulo, fabricar } = FABRICAS[slug]
    const versionada = CLASE_DE[slug] === 'modulo'
    const donde = (id: number | string) => ({ id: { equals: id } }) as never
    const publicada = (nombre: string) => {
      const fixture = fabricar(nombre)
      return versionada ? { ...fixture, data: { ...fixture.data, _status: 'published' } } : fixture
    }

    const leer: Operacion = async (_a, user) => {
      const doc = await crearComo(slug, publicada(unico('publicada')))
      return contiene(
        await juzgada(payload.find({ collection: slug as never, where: donde(doc.id), overrideAccess: false, user: user as never })),
        doc.id,
      )
    }
    const crear: Operacion = async (_a, user) => {
      const nombre = unico('crear')
      return crearYComprobar(slug, publicada(nombre), user, { [titulo]: { equals: nombre } }, versionada)
    }
    const editar: Operacion = async (_a, user) => {
      const doc = await crearComo(slug, publicada(unico('editar')))
      const nuevo = unico('editado')
      await juzgada(
        payload.update({
          collection: slug as never,
          id: doc.id,
          data: { [titulo]: nuevo } as never,
          overrideAccess: false,
          user: user as never,
        }),
      )
      return (await leerSinReglas(slug, doc.id))?.[titulo] === nuevo
    }
    const borrar: Operacion = async (_a, user) => {
      const doc = await crearComo(slug, publicada(unico('borrar')))
      await juzgada(payload.delete({ collection: slug as never, id: doc.id, overrideAccess: false, user: user as never }))
      return (await leerSinReglas(slug, doc.id)) === null
    }

    if (!versionada) return { leer, crear, editar, borrar }

    return {
      'leer lo publicado': leer,
      'leer un borrador nuevo': async (_a, user) => {
        // Nunca publicada: su texto vive en la tabla del documento, no solo en
        // la de versiones, así que basta un `find` sin `draft` para alcanzarla.
        const doc = await crearComo(slug, fabricar(unico('borrador')), { draft: true })
        return contiene(
          await juzgada(payload.find({ collection: slug as never, where: donde(doc.id), overrideAccess: false, user: user as never })),
          doc.id,
        )
      },
      'leer el borrador de una publicada (draft: true)': async (_a, user) => {
        const { doc, secreto } = await publicadaConBorradorEncima(slug)
        const resultado = await juzgada(
          payload.find({ collection: slug as never, where: donde(doc.id), draft: true, overrideAccess: false, user: user as never }),
        )
        return Boolean(resultado?.docs.some((d) => (d as Record<string, unknown>)[titulo] === secreto))
      },
      'leer el borrador de una publicada (findByID)': async (_a, user) => {
        const { doc, secreto } = await publicadaConBorradorEncima(slug)
        const leido = (await juzgada(
          payload.findByID({ collection: slug as never, id: doc.id, draft: true, overrideAccess: false, user: user as never }),
        )) as Record<string, unknown> | null
        return leido?.[titulo] === secreto
      },
      'leer las versiones': async (_a, user) => {
        const { doc, secreto } = await publicadaConBorradorEncima(slug)
        const resultado = await juzgada(
          payload.findVersions({
            collection: slug as never,
            where: { parent: { equals: doc.id } } as never,
            overrideAccess: false,
            user: user as never,
          }),
        )
        return Boolean(
          resultado?.docs.some((v) => (v as { version?: Record<string, unknown> }).version?.[titulo] === secreto),
        )
      },
      crear,
      editar,
      publicar: async (_a, user) => {
        const doc = await crearComo(slug, fabricar(unico('por-publicar')), { draft: true })
        await juzgada(
          payload.update({
            collection: slug as never,
            id: doc.id,
            data: { _status: 'published' } as never,
            draft: false,
            overrideAccess: false,
            user: user as never,
          }),
        )
        return (await leerSinReglas(slug, doc.id))?._status === 'published'
      },
      borrar,
    }
  }

  /** Una ficha publicada con un borrador sin publicar encima, y el texto de ese borrador. */
  async function publicadaConBorradorEncima(slug: string) {
    const { titulo, fabricar } = FABRICAS[slug]
    const base = fabricar(unico('publicada'))
    const doc = await crearComo(slug, { ...base, data: { ...base.data, _status: 'published' } })
    const secreto = unico('SECRETO-sin-publicar')
    await payload.update({
      collection: slug as never,
      id: doc.id,
      data: { [titulo]: secreto } as never,
      draft: true,
      overrideAccess: true,
    })
    return { doc, secreto }
  }

  const operacionesDeCuentas = (): Record<string, Operacion> => {
    const { fabricar } = FABRICAS.usuarios
    const cuentaNueva = () => crearComo('usuarios', fabricar(unico('cuenta')))
    return {
      leer: async (_a, user) => {
        const cuenta = await cuentaNueva()
        return contiene(
          await juzgada(
            payload.find({ collection: 'usuarios', where: { id: { equals: cuenta.id } }, overrideAccess: false, user: user as never }),
          ),
          cuenta.id,
        )
      },
      crear: async (_a, user) => {
        const nombre = unico('cuenta-creada')
        return crearYComprobar('usuarios', fabricar(nombre), user, { nombre: { equals: nombre } })
      },
      editar: async (_a, user) => {
        const cuenta = await cuentaNueva()
        const nuevo = unico('renombrada')
        await juzgada(
          payload.update({ collection: 'usuarios', id: cuenta.id, data: { nombre: nuevo }, overrideAccess: false, user: user as never }),
        )
        return (await leerSinReglas('usuarios', cuenta.id))?.nombre === nuevo
      },
      borrar: async (_a, user) => {
        const cuenta = await cuentaNueva()
        await juzgada(payload.delete({ collection: 'usuarios', id: cuenta.id, overrideAccess: false, user: user as never }))
        return (await leerSinReglas('usuarios', cuenta.id)) === null
      },
    }
  }

  const operacionesDePropias = (slug: 'comentarios' | 'actividad'): Record<string, Operacion> => {
    const { fabricar } = FABRICAS[slug]
    // La fila se crea como su dueño, porque el gancho de las dos colecciones
    // pone el autor a partir de `req.user` y no de los datos.
    const filaDe = (dueno: Record<string, unknown>) => crearComo(slug, fabricar(unico('fila')), { user: dueno })
    // «Lo propio» de quien no tiene sesión no existe: se le da la fila de otro,
    // que es lo que tendría a mano quien probara la API sin entrar.
    const filaPropiaDe = (actor: Actor) => filaDe(sesion[actor] ?? ajeno)
    const autorDe = (fila: Record<string, unknown> | null) => {
      const u = fila?.usuario
      return u && typeof u === 'object' ? (u as { id: unknown }).id : u
    }
    const leerFila = async (fila: { id: number | string }, user: Record<string, unknown> | null) =>
      contiene(
        await juzgada(payload.find({ collection: slug, where: { id: { equals: fila.id } }, overrideAccess: false, user: user as never })),
        fila.id,
      )
    const actualizarFila = (
      fila: { id: number | string },
      data: Record<string, unknown>,
      user: Record<string, unknown> | null,
    ) => juzgada(payload.update({ collection: slug, id: fila.id, data: data as never, overrideAccess: false, user: user as never }))

    const ops: Record<string, Operacion> = {
      'leer las propias': async (actor, user) => leerFila(await filaPropiaDe(actor), user),
      'leer las ajenas': async (_a, user) => leerFila(await filaDe(ajeno), user),
      'crear en un módulo': async (_a, user) => {
        const documentoId = unico('en-cirugias')
        const data =
          slug === 'comentarios'
            ? { texto: 'Comentario de prueba', coleccion: 'cirugias', documentoId }
            : { coleccion: 'cirugias', documentoId }
        return crearYComprobar(slug, { data }, user, { documentoId: { equals: documentoId } })
      },
      'editar las propias': async (actor, user) => {
        const fila = await filaPropiaDe(actor)
        if (slug === 'comentarios') {
          const nuevo = unico('corregido')
          await actualizarFila(fila, { texto: nuevo }, user)
          return (await leerSinReglas(slug, fila.id))?.texto === nuevo
        }
        await actualizarFila(fila, { completado: true }, user)
        return (await leerSinReglas(slug, fila.id))?.completado === true
      },
      'reasignar la propia a otra cuenta': async (actor, user) => {
        const fila = await filaPropiaDe(actor)
        // La fila de «anónimo» ya es de `ajeno`: se intenta moverla a otra.
        const otra = actor === 'anonimo' ? sesion.lector! : ajeno
        await actualizarFila(fila, { usuario: otra.id }, user)
        return String(autorDe(await leerSinReglas(slug, fila.id))) === String(otra.id)
      },
      'borrar las ajenas': async (_a, user) => {
        const fila = await filaDe(ajeno)
        await juzgada(payload.delete({ collection: slug, id: fila.id, overrideAccess: false, user: user as never }))
        return (await leerSinReglas(slug, fila.id)) === null
      },
    }

    if (slug === 'comentarios') {
      ops['resolver las ajenas'] = async (_a, user) => {
        const fila = await filaDe(ajeno)
        await actualizarFila(fila, { estado: 'resuelto' }, user)
        return (await leerSinReglas(slug, fila.id))?.estado === 'resuelto'
      }
      ops['reescribir el texto ajeno'] = async (_a, user) => {
        const fila = await filaDe(ajeno)
        const nuevo = unico('palabras-que-no-escribio')
        await actualizarFila(fila, { texto: nuevo }, user)
        return (await leerSinReglas(slug, fila.id))?.texto === nuevo
      }
    } else {
      ops['editar las ajenas'] = async (_a, user) => {
        const fila = await filaDe(ajeno)
        await actualizarFila(fila, { completado: true }, user)
        return (await leerSinReglas(slug, fila.id))?.completado === true
      }
    }
    return ops
  }

  describe.each(COLECCIONES_PROPIAS.map((c) => c.slug))('%s', (slug) => {
    const clase = CLASE_DE[slug]
    const esperado = clase ? politica(slug, clase) : {}

    it('tiene política en la matriz', () => {
      expect(clase, `«${slug}» no tiene clase en CLASE_DE`).toBeDefined()
      expect(FABRICAS[slug], `«${slug}» no tiene fábrica en FABRICAS`).toBeDefined()
    })

    if (!clase || !FABRICAS[slug]) return

    const operaciones = () =>
      clase === 'cuentas'
        ? operacionesDeCuentas()
        : clase === 'propias'
          ? operacionesDePropias(slug as 'comentarios' | 'actividad')
          : operacionesDeContenido(slug)

    for (const nombre of Object.keys(esperado)) {
      it(nombre, async () => {
        const operacion = operaciones()[nombre]
        expect(operacion, `la operación «${nombre}» no está implementada para ${slug}`).toBeTypeOf('function')
        await recorrer(slug, nombre, esperado[nombre], operacion)
      }, 120_000)
    }
  })

  describe('la sesión de una cuenta dada de baja', () => {
    it('no vuelve a entrar: el login contesta 403 aunque la contraseña sea buena', async () => {
      const cuenta = await leerSinReglas('usuarios', cuentaDe.desactivado!)
      const clave = claveDe.desactivado!
      const error = await payload
        .login({ collection: 'usuarios', data: { email: String(cuenta?.email), password: clave } })
        .then(() => null, (e: unknown) => e)
      expect(error, 'una cuenta desactivada obtuvo un testigo').not.toBeNull()
      expect((error as { status?: number }).status).toBe(403)
    })

    it('el testigo que ya tenía resuelve una cuenta sin activar', () => {
      // Es lo que hace que la matriz de arriba pruebe algo: si `payload.auth`
      // devolviera `null`, «desactivado» sería otro «anónimo».
      expect(sesion.desactivado).not.toBeNull()
      expect(sesion.desactivado?.activo).toBe(false)
    })
  })

  /**
   * D-073: de la API REST de Payload solo queda servir archivos.
   *
   * `tests/unit/apiDePayload.test.ts` prueba el comodín con un doble de Payload.
   * Aquí va el manejador real, con la base real y con cookies de sesión reales:
   * que un administrador —el que más podría hacer por ahí— reciba 403 en todo
   * lo que no es un archivo, que la base no cambie, y que el archivo de verdad
   * siga saliendo para quien tiene sesión y no para quien no.
   */
  describe('la API REST de Payload está cerrada salvo los archivos', () => {
    const api = async () => import('@/app/(payload)/api/[...slug]/route')
    const peticion = (metodo: string, camino: string, actor: Actor | null, cuerpo?: unknown) =>
      new Request(`http://localhost:3000/api/${camino}`, {
        method: metodo,
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
          ...(actor && testigo[actor] ? { cookie: `${payload.config.cookiePrefix}-token=${testigo[actor]}` } : {}),
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      })
    const contexto = (camino: string) => ({ params: Promise.resolve({ slug: camino.split('/') }) })

    it('ni el administrador lista, lee versiones, escribe ni entra por ahí', async () => {
      const { GET, POST, PATCH, DELETE } = await api()
      const ficha = await crearComo('patologias', {
        data: { ...FABRICAS.patologias.fabricar(unico('rest')).data, _status: 'published' },
      })
      const intentos: [string, (r: Request, c: never) => Promise<Response>, string, unknown?][] = [
        ['GET', GET as never, 'patologias'],
        ['GET', GET as never, `patologias/${ficha.id}`],
        ['GET', GET as never, 'patologias/versions'],
        ['GET', GET as never, 'usuarios/me'],
        ['GET', GET as never, 'medios'],
        ['POST', POST as never, 'patologias', { nombre: 'por REST', segmento: segmentoId }],
        ['PATCH', PATCH as never, `patologias/${ficha.id}`, { nombre: 'reescrita por REST' }],
        ['DELETE', DELETE as never, `patologias/${ficha.id}`],
        ['POST', POST as never, 'usuarios/login', { email: 'x@prueba.invalid', password: 'x' }],
      ]
      for (const [metodo, manejador, camino, cuerpo] of intentos) {
        const respuesta = await manejador(peticion(metodo, camino, 'admin', cuerpo), contexto(camino) as never)
        expect(respuesta.status, `${metodo} /api/${camino}`).toBe(403)
      }
      const despues = await leerSinReglas('patologias', ficha.id)
      expect(despues?.nombre, 'la ficha cambió o desapareció por la API cerrada').toBe(ficha.nombre)
    })

    it('un camino con la forma de archivo sobre una colección sin archivos no entrega el documento', async () => {
      const { GET } = await api()
      const ficha = await crearComo('patologias', {
        data: { ...FABRICAS.patologias.fabricar(unico('rest-archivo')).data, _status: 'published' },
      })
      const camino = `patologias/file/${ficha.id}`
      const respuesta = await GET(peticion('GET', camino, 'admin'), contexto(camino) as never)
      const texto = await respuesta.text()
      expect(texto).not.toContain(String(ficha.nombre))
    })

    it('el archivo subido sale con sesión activa y no sin ella', async () => {
      const { GET } = await api()
      const medio = await crearComo('medios', FABRICAS.medios.fabricar(unico('archivo')))
      const camino = `medios/file/${medio.filename}`
      const pedir = async (actor: Actor | null) =>
        (await GET(peticion('GET', camino, actor), contexto(camino) as never)).status
      expect(await pedir('lector'), 'el lector activo no recibe la imagen de una ficha').toBe(200)
      expect(await pedir(null), 'el archivo sale sin sesión').toBe(403)
      expect(await pedir('desactivado'), 'el archivo sale a una cuenta dada de baja').toBe(403)
    })
  })
})
