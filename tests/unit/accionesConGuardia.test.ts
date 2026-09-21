import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Toda acción de servidor pasa por su guardia antes de tocar los datos.
 *
 * Una acción exportada de un archivo `'use server'` es un extremo HTTP: se
 * invoca con los argumentos que se quiera, sin la página que la ofrece. La
 * guardia de la página no la protege, y la del panel tampoco. Lo único que
 * separa a un residente de `eliminarDocumento` es la primera línea de la propia
 * acción.
 *
 * ## Qué se prueba, y por qué así
 *
 * No se busca `exigirAdmin(` en el texto. Una prueba que lee el código se deja
 * engañar por una guardia puesta después de la consulta, por una guardia en una
 * rama que no corre, o por un comentario que la nombra. Aquí se **llama** a cada
 * acción con cada clase de sesión y se registra si llegó a tocar algo: un
 * método de Payload, un respaldo en disco o el catálogo del atlas. Una sesión
 * que no debe pasar tiene que salir sin haber tocado nada; una que sí, tiene
 * que llegar.
 *
 * ## Las acciones se descubren, no se listan
 *
 * Se leen todos los archivos de `src/app/(frontend)/acciones` y se importan
 * todas sus exportaciones. Cada una tiene que estar clasificada en `GUARDIAS`
 * con la guardia que le corresponde; una acción nueva sin clasificar hace
 * fallar la prueba, y clasificarla obliga a decir quién puede llamarla y a que
 * la conducta lo confirme.
 *
 * Las clases son las que usa el proyecto:
 *
 *  - `admin`: `exigirAdmin`. Cuentas, respaldos, borrar comentarios.
 *  - `editor`: `exigirEditor`. Taller del atlas y bandeja de comentarios.
 *  - `edicionDeModulo`: `exigirEdicionDe(coleccion)`. El editor de contenido:
 *    además del rol, el módulo.
 *  - `sesion`: cuenta activa, y el módulo visible si la fila cuelga de uno. Lo
 *    que el residente escribe sobre sí mismo: su lectura, su comentario.
 *  - `publica`: antes de haber sesión —entrar, recuperar la clave, instalar—.
 *    No tienen guardia de rol; lo que se les exige es que no toquen más que el
 *    método de Payload que su puerta necesita.
 */

// ------------------------------------------------------------------ dobles

const { estado, llamadas } = vi.hoisted(() => ({
  estado: {
    sesion: null as unknown,
    /** Lo que contesta `count`: 1 = instalación ya hecha. */
    cuentas: 1,
  },
  llamadas: [] as string[],
}))

vi.mock('@/lib/sesion', () => ({ obtenerSesion: async () => estado.sesion }))

/**
 * Una instancia de Payload que apunta cada método que se le pide.
 *
 * `then` se deja sin definir para que `await getPayload()` no la confunda con
 * una promesa; `logger` y `config` no cuentan como tocar datos.
 */
vi.mock('payload', async (original) => {
  const respuestas: Record<string, (...a: unknown[]) => unknown> = {
    find: () => ({ docs: [], totalDocs: 0, page: 1, totalPages: 1 }),
    findVersions: () => ({ docs: [], totalDocs: 0 }),
    count: () => ({ totalDocs: estado.cuentas }),
    findByID: () => ({ id: 5, email: 'cuenta@prueba.invalid', nombre: 'x', contenido: { piezas: [] } }),
    forgotPassword: () => 'testigo',
    resetPassword: () => null,
    login: () => ({}),
  }
  const instancia = new Proxy(
    {},
    {
      get: (_objetivo, propiedad) => {
        if (propiedad === 'then') return undefined
        if (propiedad === 'logger') return { error() {}, warn() {}, info() {} }
        if (propiedad === 'config') return { collections: [] }
        return async (...argumentos: unknown[]) => {
          llamadas.push(String(propiedad))
          return (respuestas[String(propiedad)] ?? (() => ({ id: 5, docs: [], errors: [] })))(...argumentos)
        }
      },
    },
  )
  return {
    ...((await original()) as object),
    getPayload: async () => instancia,
  }
})

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ set() {}, delete() {}, get: () => undefined }),
  headers: async () => new Headers(),
}))

// Los respaldos escriben en disco y no pasan por Payload: para esta prueba
// crear o borrar uno es tocar datos igual que un `delete`.
vi.mock('@/lib/respaldosServidor', () => ({
  crearRespaldo: async () => {
    llamadas.push('crearRespaldo')
    return { nombre: 'base-20260101-000000.sql.gz', bytes: 0, fecha: '' }
  },
  eliminarRespaldo: async () => {
    llamadas.push('eliminarRespaldo')
  },
  listarRespaldos: async () => {
    llamadas.push('listarRespaldos')
    return []
  },
}))

// El taller del atlas lee su catálogo del disco antes de consultar la base en
// varias acciones. Leerlo es la primera cosa que hacen al pasar la guardia.
vi.mock('node:fs/promises', async (original) => ({
  ...((await original()) as object),
  readFile: async () => {
    llamadas.push('readFile')
    throw new Error('Sin atlas en esta prueba.')
  },
}))

// ----------------------------------------------------------------- sesiones

const MODULO_AJENO = 'patologias'

const cuenta = (id: number, rol: string, activo: boolean, extra: Record<string, unknown> = {}) => ({
  id,
  rol,
  activo,
  email: `${rol}${id}@prueba.invalid`,
  ...extra,
})

/** Lo que devuelve `obtenerSesion` para una cuenta, con o sin vista previa. */
const sesionDe = (usuario: Record<string, unknown> | null, rolEfectivo?: string) => ({
  usuario,
  activo: usuario?.activo === true,
  rolReal: (usuario?.rol as string) ?? null,
  rol: rolEfectivo ?? (usuario?.rol as string) ?? null,
  simulando: Boolean(rolEfectivo && rolEfectivo !== usuario?.rol),
  usuarioEfectivo: usuario ? { ...usuario, rol: rolEfectivo ?? usuario.rol } : null,
})

const SESIONES = {
  anonimo: sesionDe(null),
  // Administrador y desactivado: el rol más alto no salva a una cuenta de baja.
  desactivado: sesionDe(cuenta(2, 'admin', false)),
  lector: sesionDe(cuenta(3, 'lector', true)),
  editor: sesionDe(cuenta(4, 'editor', true)),
  admin: sesionDe(cuenta(1, 'admin', true)),
  // Un administrador mirando «como residente» sigue administrando: las
  // guardias miran el rol real (`src/lib/guardias.ts`).
  adminComoResidente: sesionDe(cuenta(1, 'admin', true), 'lector'),
  // Un lector no sube de rol pidiendo una vista previa que no le corresponde.
  lectorComoAdmin: { ...sesionDe(cuenta(3, 'lector', true)), rol: 'admin' },
} as const

type NombreDeSesion = keyof typeof SESIONES

/** Lo que dice la política de cada guardia sobre cada sesión sin restricciones. */
const PASA: Record<Guardia, Record<NombreDeSesion, boolean>> = {
  admin: {
    anonimo: false,
    desactivado: false,
    lector: false,
    editor: false,
    admin: true,
    adminComoResidente: true,
    lectorComoAdmin: false,
  },
  editor: {
    anonimo: false,
    desactivado: false,
    lector: false,
    editor: true,
    admin: true,
    adminComoResidente: true,
    lectorComoAdmin: false,
  },
  edicionDeModulo: {
    anonimo: false,
    desactivado: false,
    lector: false,
    editor: true,
    admin: true,
    adminComoResidente: true,
    lectorComoAdmin: false,
  },
  sesion: {
    anonimo: false,
    desactivado: false,
    lector: true,
    editor: true,
    admin: true,
    adminComoResidente: true,
    lectorComoAdmin: true,
  },
  // Las públicas no se juzgan por sesión, sino por lo que tocan.
  publica: {
    anonimo: true,
    desactivado: true,
    lector: true,
    editor: true,
    admin: true,
    adminComoResidente: true,
    lectorComoAdmin: true,
  },
}

// ------------------------------------------------------------ clasificación

type Guardia = 'admin' | 'editor' | 'edicionDeModulo' | 'sesion' | 'publica'

interface Clasificacion {
  guardia: Guardia
  /**
   * Argumentos con los que la acción llega a tocar datos si la guardia la deja
   * pasar. Recibe el módulo sobre el que se prueba la restricción.
   */
  argumentos: (modulo: string) => unknown[]
  /**
   * De qué módulo cuelga la acción: `'argumento'` si lo recibe, un slug si lo
   * tiene fijo. Solo lo llevan las que restringen por módulo.
   */
  modulo?: 'argumento' | string
  /** Para las públicas: los únicos métodos de Payload que pueden tocar. */
  permitidos?: string[]
}

const USUARIO_NUEVO = ['nueva@prueba.invalid', 'Cuenta nueva', 'una-clave-larga-de-prueba', 'lector']
const RESULTADO = { puntaje: 1, puntajeMaximo: 2, complicaciones: [] }
const DIFUSION = { asunto: 'Aviso', mensaje: 'Un aviso para todas las cuentas.', audiencia: 'todas' }

const GUARDIAS: Record<string, Clasificacion> = {
  'admin.ts:crearUsuario': { guardia: 'admin', argumentos: () => USUARIO_NUEVO },
  'admin.ts:actualizarUsuario': { guardia: 'admin', argumentos: () => ['5', { nombre: 'Otro nombre' }] },
  'admin.ts:cambiarActivoUsuario': { guardia: 'admin', argumentos: () => ['5', true] },
  'admin.ts:eliminarUsuario': { guardia: 'admin', argumentos: () => ['5'] },
  'admin.ts:generarEnlaceDeClave': { guardia: 'admin', argumentos: () => ['5'] },
  'admin.ts:resolverSolicitud': { guardia: 'admin', argumentos: () => ['5', 'activar', 'lector'] },
  'admin.ts:eliminarComentario': { guardia: 'admin', argumentos: () => ['5'] },
  // El editor resuelve comentarios —es quien arregla lo señalado— pero no los borra.
  'admin.ts:actualizarComentario': { guardia: 'editor', argumentos: () => ['5', 'resuelto'] },
  'admin.ts:resolverTodosLosComentarios': { guardia: 'editor', argumentos: () => [] },

  'contenido.ts:listarDocumentos': { guardia: 'edicionDeModulo', modulo: 'argumento', argumentos: (m) => [m, {}] },
  'contenido.ts:opcionesDeRelacion': { guardia: 'edicionDeModulo', modulo: 'argumento', argumentos: (m) => [m] },
  'contenido.ts:guardarDocumento': {
    guardia: 'edicionDeModulo',
    modulo: 'argumento',
    argumentos: (m) => [m, '5', { nombre: 'Ficha de prueba', segmento: 1 }, false],
  },
  'contenido.ts:cambiarPublicacion': { guardia: 'edicionDeModulo', modulo: 'argumento', argumentos: (m) => [m, '5', true] },
  'contenido.ts:eliminarDocumento': { guardia: 'edicionDeModulo', modulo: 'argumento', argumentos: (m) => [m, '5'] },
  'contenido.ts:duplicarDocumento': { guardia: 'edicionDeModulo', modulo: 'argumento', argumentos: (m) => [m, '5'] },

  'atlas.ts:versionDelAtlas': { guardia: 'editor', argumentos: () => [] },
  'atlas.ts:listarInstancias': { guardia: 'editor', argumentos: () => [] },
  'atlas.ts:listarModelosDelAtlas': { guardia: 'editor', argumentos: () => [] },
  'atlas.ts:obtenerInstancia': { guardia: 'editor', argumentos: () => ['5'] },
  'atlas.ts:guardarInstancia': { guardia: 'editor', argumentos: () => [null, { nombre: 'Preparación' }] },
  'atlas.ts:duplicarInstancia': { guardia: 'editor', argumentos: () => ['5'] },
  'atlas.ts:eliminarInstancia': { guardia: 'editor', argumentos: () => ['5'] },
  'atlas.ts:exportarComoModelo': { guardia: 'editor', argumentos: () => ['5'] },

  // Un correo a todas las cuentas es de administrador, y la prueba de ese correo
  // también: gasta la misma cuota del hosting.
  'difusion.ts:enviarPruebaDeDifusion': { guardia: 'admin', argumentos: () => [DIFUSION] },
  'difusion.ts:iniciarDifusion': { guardia: 'admin', argumentos: () => [DIFUSION] },
  'difusion.ts:reanudarDifusion': { guardia: 'admin', argumentos: () => ['5'] },
  'difusion.ts:detenerDifusion': { guardia: 'admin', argumentos: () => ['5'] },
  'correo.ts:enviarCorreoDePrueba': { guardia: 'admin', argumentos: () => [] },

  'respaldos.ts:respaldarAhora': { guardia: 'admin', argumentos: () => [] },
  'respaldos.ts:borrarRespaldo': { guardia: 'admin', argumentos: () => ['base-20260101-000000.sql.gz'] },

  'actividad.ts:registrarVisita': { guardia: 'sesion', modulo: 'argumento', argumentos: (m) => [m, '12'] },
  'actividad.ts:marcarComoLeida': { guardia: 'sesion', modulo: 'argumento', argumentos: (m) => [m, '12', true] },
  'actividad.ts:registrarResultadoDeCirugia': {
    guardia: 'sesion',
    modulo: 'cirugias',
    argumentos: () => ['12', RESULTADO],
  },
  'comentarios.ts:crearComentario': {
    guardia: 'sesion',
    modulo: 'argumento',
    argumentos: (m) => [m, '12', 'Un comentario sobre la ficha.'],
  },

  'sesion.ts:entrar': { guardia: 'publica', permitidos: ['login'], argumentos: () => ['a@prueba.invalid', 'clave'] },
  // Salir ya no es solo borrar la cookie (O-059): da de baja su propia sesión en
  // la fila de la cuenta, y para eso lee quién llama y reescribe esa fila. Ni
  // una llamada más: es una acción pública y actúa con `overrideAccess`.
  'sesion.ts:salir': { guardia: 'publica', permitidos: ['auth', 'findByID', 'update'], argumentos: () => [] },
  // El correo sale por `enviarSinEsperar`, que sin SMTP no llama a nada; con él,
  // `sendEmail` es lo único más que puede tocar.
  'sesion.ts:pedirEnlaceDeClave': {
    guardia: 'publica',
    permitidos: ['forgotPassword', 'sendEmail'],
    argumentos: () => ['a@prueba.invalid'],
  },
  // La primera acción pública que escribe: cuenta las cuentas (para no fabricar
  // la primera, que nacería administradora), busca el correo, crea la cuenta
  // desactivada y busca a quién avisar. Nada de `update`, `delete` ni `login`.
  'sesion.ts:solicitarCuenta': {
    guardia: 'publica',
    permitidos: ['count', 'find', 'create', 'sendEmail'],
    argumentos: () => [
      {
        nombre: 'Persona Nueva',
        correo: 'nueva@prueba.invalid',
        institucion: 'Hospital de prueba',
        motivo: 'Residente de segundo año.',
        contrasena: 'una-clave-larga-de-prueba',
        sitioWeb: '',
      },
    ],
  },
  'sesion.ts:fijarClaveNueva': {
    guardia: 'publica',
    permitidos: ['resetPassword'],
    argumentos: () => ['un-testigo-de-prueba', 'una-clave-larga-de-prueba'],
  },
  // Con la plataforma ya instalada (`count` = 1) no puede crear nada: su única
  // barrera es esa cuenta, y es lo que la separa de un extremo público para
  // fabricar administradores.
  'sesion.ts:crearPrimeraCuenta': {
    guardia: 'publica',
    permitidos: ['count'],
    argumentos: () => ['Intruso', 'intruso@prueba.invalid', 'una-clave-larga-de-prueba'],
  },
  'sesion.ts:faltaLaPrimeraCuenta': { guardia: 'publica', permitidos: ['count'], argumentos: () => [] },
}

/**
 * Los archivos cuyo trabajo es escribir contenido de la plataforma.
 *
 * Sus acciones no pueden clasificarse como `sesion` ni `publica`: eso diría que
 * basta con tener cuenta para escribir una ficha o una preparación. Sin esta
 * regla, la forma más corta de poner verde una acción nueva sin guardia sería
 * clasificarla como «de sesión».
 */
const ARCHIVOS_DE_CONTENIDO = ['contenido.ts', 'atlas.ts']

// ------------------------------------------------------------ descubrimiento

const CARPETA = resolve(process.cwd(), 'src/app/(frontend)/acciones')
const ARCHIVOS = readdirSync(CARPETA).filter((a) => a.endsWith('.ts'))

const ACCIONES: { clave: string; archivo: string; accion: (...a: unknown[]) => Promise<unknown> }[] = []
for (const archivo of ARCHIVOS) {
  const modulo = (await import(resolve(CARPETA, archivo))) as Record<string, unknown>
  for (const [nombre, valor] of Object.entries(modulo)) {
    if (typeof valor === 'function') {
      ACCIONES.push({ clave: `${archivo}:${nombre}`, archivo, accion: valor as never })
    }
  }
}

/** Corre la acción con una sesión y devuelve lo que tocó. */
async function tocadoPor(
  accion: (...a: unknown[]) => Promise<unknown>,
  sesion: unknown,
  argumentos: unknown[],
): Promise<string[]> {
  estado.sesion = sesion
  llamadas.length = 0
  await accion(...argumentos).catch(() => {})
  return [...llamadas]
}

beforeEach(() => {
  estado.cuentas = 1
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('el inventario de acciones', () => {
  it('encuentra acciones en todos los archivos: si no, lo que falla es la importación', () => {
    for (const archivo of ARCHIVOS) {
      expect(
        ACCIONES.some((a) => a.archivo === archivo),
        `${archivo} no exporta ninguna acción, o no se pudo importar`,
      ).toBe(true)
    }
  })

  it('toda acción exportada tiene su guardia clasificada', () => {
    const sinClasificar = ACCIONES.map((a) => a.clave).filter((c) => !GUARDIAS[c])
    expect(
      sinClasificar,
      'acciones nuevas sin guardia declarada en tests/unit/accionesConGuardia.test.ts',
    ).toEqual([])
  })

  it('la clasificación no conserva acciones que ya no existen', () => {
    const existentes = new Set(ACCIONES.map((a) => a.clave))
    expect(Object.keys(GUARDIAS).filter((c) => !existentes.has(c))).toEqual([])
  })

  it('las acciones que escriben contenido exigen editor, no solo sesión', () => {
    const flojas = Object.entries(GUARDIAS)
      .filter(([clave]) => ARCHIVOS_DE_CONTENIDO.includes(clave.split(':')[0]))
      .filter(([, c]) => c.guardia === 'sesion' || c.guardia === 'publica')
      .map(([clave]) => clave)
    expect(flojas).toEqual([])
  })
})

describe.each(ACCIONES.filter((a) => GUARDIAS[a.clave]?.guardia !== 'publica'))('$clave', ({ clave, accion }) => {
  const { guardia, argumentos, modulo } = GUARDIAS[clave] ?? { guardia: 'admin', argumentos: () => [] }
  // Sobre qué módulo se llama: el fijo, o uno distinto del que se le deja al
  // restringido, para que la restricción tenga algo que negar.
  const objetivo = modulo && modulo !== 'argumento' ? modulo : 'cirugias'

  it.each(Object.keys(SESIONES) as NombreDeSesion[])('con la sesión «%s»', async (nombre) => {
    const tocado = await tocadoPor(accion, SESIONES[nombre], argumentos(objetivo))
    if (PASA[guardia][nombre]) {
      expect(tocado, `${clave} no llegó a tocar nada con «${nombre}», que sí debía pasar`).not.toEqual([])
    } else {
      expect(tocado, `${clave} tocó datos con «${nombre}» antes de rechazarla`).toEqual([])
    }
  })

  if (guardia === 'edicionDeModulo') {
    it('un editor restringido a otro módulo no pasa; restringido a este, sí', async () => {
      const ajeno = sesionDe(cuenta(6, 'editor', true, { modulosEditables: [MODULO_AJENO] }))
      const propio = sesionDe(cuenta(6, 'editor', true, { modulosEditables: [objetivo] }))
      expect(await tocadoPor(accion, ajeno, argumentos(objetivo)), 'editó un módulo que no tiene').toEqual([])
      expect(await tocadoPor(accion, propio, argumentos(objetivo)), 'no pudo con su propio módulo').not.toEqual([])
    })

    it('un editor que no ve este módulo tampoco lo edita, aunque sus editables estén vacíos', async () => {
      // Editables vacíos es «todos», así que la restricción solo puede salir de
      // la lectura. Es la combinación que el modal de permisos deja guardar y
      // con la que el panel listaba, reescribía y borraba lo que la plataforma
      // no le dejaba abrir.
      const sinVer = sesionDe(cuenta(8, 'editor', true, { modulosVisibles: [MODULO_AJENO], modulosEditables: [] }))
      const conVer = sesionDe(cuenta(8, 'editor', true, { modulosVisibles: [objetivo], modulosEditables: [] }))
      expect(await tocadoPor(accion, sinVer, argumentos(objetivo)), 'editó un módulo que no puede ver').toEqual([])
      expect(await tocadoPor(accion, conVer, argumentos(objetivo)), 'no pudo con el módulo que sí ve').not.toEqual([])
    })
  }

  if (guardia === 'sesion' && modulo) {
    it('un lector sin ese módulo visible no escribe; con él, sí', async () => {
      const ajeno = sesionDe(cuenta(7, 'lector', true, { modulosVisibles: [MODULO_AJENO] }))
      const propio = sesionDe(cuenta(7, 'lector', true, { modulosVisibles: [objetivo] }))
      expect(await tocadoPor(accion, ajeno, argumentos(objetivo)), 'escribió en un módulo vetado').toEqual([])
      expect(await tocadoPor(accion, propio, argumentos(objetivo)), 'no pudo con su módulo visible').not.toEqual([])
    })
  }
})

describe.each(ACCIONES.filter((a) => GUARDIAS[a.clave]?.guardia === 'publica'))('$clave', ({ clave, accion }) => {
  const { argumentos, permitidos = [] } = GUARDIAS[clave]

  it.each(Object.keys(SESIONES) as NombreDeSesion[])(
    'con la sesión «%s» no toca más que lo que su puerta necesita',
    async (nombre) => {
      const tocado = await tocadoPor(accion, SESIONES[nombre], argumentos(''))
      const demas = tocado.filter((m) => !permitidos.includes(m))
      expect(demas, `${clave} tocó ${demas.join(', ')}`).toEqual([])
    },
  )
})
