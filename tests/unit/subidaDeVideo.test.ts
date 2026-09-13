import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/**
 * Que quepa un vídeo de quirófano de verdad.
 *
 * El traumatólogo grababa en pabellón y la plataforma aceptaba 7 MB, que no da
 * ni para un minuto de pantalla. Subir el número no bastaba: lo que subía por
 * el panel iba por una acción de servidor, y Next descarta el cuerpo de una
 * acción **antes** de invocarla, de modo que el `try/catch` de `accion()` no
 * llega a ejecutarse y la pantalla se queda muda. Lo que se hizo fue abrir una
 * ruta que recibe el archivo en flujo.
 *
 * Aquí se vigila lo que puede volver a torcerse, y es de tres clases distintas:
 *
 *  1. **Las cifras.** Hay dos techos —vídeo grande, modelo 3D pequeño— y una
 *     cadena de topes que va desde el esquema del panel hasta el
 *     `client_max_body_size` de un nginx que vive en otra máquina. Este archivo
 *     abre `next.config.mjs` y `despliegue/paginas/LEEME.md` y los compara,
 *     porque «dos números que no se hablan» es exactamente el defecto que se
 *     vino a cerrar.
 *  2. **La ruta.** Se ejercita de verdad: se le mandan peticiones y se mira qué
 *     contesta y qué le entrega a Payload.
 *  3. **El cable.** Que la pantalla llame a lo que se escribió. Escribir una
 *     función, probarla y que no la llame nadie es el defecto que más veces se
 *     ha repetido en este repositorio.
 */

const { estado, crear } = vi.hoisted(() => ({
  estado: {
    usuario: { id: 1, rol: 'admin', activo: true } as Record<string, unknown> | null,
  },
  crear: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: Boolean(estado.usuario),
    rolReal: estado.usuario ? 'admin' : null,
    rol: 'admin',
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))

// Se conserva el resto del módulo y solo se sustituye `getPayload`, por lo
// mismo que en `guardarDocumento.test.ts`: con un objeto pelado,
// `src/collections/Usuarios.ts` se queda sin el `APIError` que importa de aquí.
vi.mock('payload', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('payload')>()),
  getPayload: async () => ({ create: crear }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { LIMITE_BYTES_MODELO_3D } from '@/uploads/validarModelo3D'
import {
  esquemaDe,
  TECHO_DE_MEDIOS_BYTES,
  TECHO_DE_MODELOS_3D_BYTES,
} from '@/admin/esquema'
import { CABECERA_CAMPOS, CABECERA_NOMBRE, rutaDeSubida, subidorQueAvisa } from '@/admin/subidas'
import { POST } from '@/app/(frontend)/api/subidas/[coleccion]/route'

const RAIZ = process.cwd()
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')

const MEGA = 1024 * 1024

beforeEach(() => {
  crear.mockReset()
  crear.mockResolvedValue({ id: 77 })
  estado.usuario = { id: 1, rol: 'admin', activo: true }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ------------------------------------------------------------------- cifras

describe('los dos techos se declaran juntos y solo sube uno', () => {
  it('el de los medios llegó a 50 MB, que es donde cabe un video de quirófano', () => {
    expect(TECHO_DE_MEDIOS_BYTES).toBe(50 * MEGA)
    expect(esquemaDe('medios').subida?.maximoBytes).toBe(TECHO_DE_MEDIOS_BYTES)
  })

  it('el de los modelos 3D sigue en 5 MB, y ese es el punto', () => {
    // Un `.glb` lo carga ENTERO el navegador del residente antes de pintar el
    // primer triángulo (O-008). Se nombra el 5 a mano y no se compara solo
    // contra sí mismo: una prueba que dijera «los dos son iguales a lo que
    // dicen» pasaría igual con los modelos en cincuenta.
    expect(TECHO_DE_MODELOS_3D_BYTES).toBe(5 * MEGA)
    expect(esquemaDe('modelos-3d').subida?.maximoBytes).toBe(TECHO_DE_MODELOS_3D_BYTES)
    // Y sigue siendo el que rechaza por firma del archivo.
    expect(TECHO_DE_MODELOS_3D_BYTES).toBe(LIMITE_BYTES_MODELO_3D)
    expect(TECHO_DE_MEDIOS_BYTES).toBeGreaterThan(TECHO_DE_MODELOS_3D_BYTES)
  })

  it('la configuración de Payload toma el mayor y no escribe ningún número', () => {
    // `upload.limits` es uno solo para todas las colecciones: si tomara el de
    // los modelos, un vídeo quedaría cortado por el límite del otro. Y si
    // escribiera su propia cifra, volvería a ser el tercer número que nadie
    // compara, que es como se prometieron 50 MB mientras el marco cortaba en 8.
    const config = fuente('src', 'payload.config.ts')
    expect(config).toContain('Math.max(TECHO_DE_MEDIOS_BYTES, TECHO_DE_MODELOS_3D_BYTES)')
    expect(config).not.toMatch(/fileSize:\s*\d/)
  })
})

describe('la cadena de topes crece hacia fuera', () => {
  /**
   * Los dos que no se pueden importar: uno está en un `.mjs` que no pasa por
   * este compilador y el otro describe un archivo de otra máquina. Se leen del
   * texto, que es la única cuerda que puede atarlos.
   */
  const cuerpoDeUnaAccion = (): number => {
    const encontrado = /bodySizeLimit:\s*'(\d+)mb'/.exec(fuente('next.config.mjs'))
    expect(encontrado, 'next.config.mjs ya no declara `serverActions.bodySizeLimit`').not.toBeNull()
    return Number(encontrado![1]) * MEGA
  }

  const cuerpoQueAdmiteElProxy = (): number => {
    // Se lee la fila de la tabla y no la línea de nginx suelta: el LEEME trae
    // además un ejemplo de `sed` con dos cifras dentro, y un `indexOf` a secas
    // se quedaría con la del ejemplo el día que alguien lo actualice.
    const leeme = fuente('despliegue', 'paginas', 'LEEME.md')
    const fila = /\|\s*`client_max_body_size`[^|]*\|\s*(\d+)\s*MB\s*\|/.exec(leeme)
    expect(fila, 'el LEEME del despliegue perdió la fila de `client_max_body_size`').not.toBeNull()
    return Number(fila![1]) * MEGA
  }

  it('el cuerpo de una acción va por encima del techo que el panel anuncia', () => {
    // La acción es la vía vieja, y `formulario/Campos.tsx` todavía la usa para
    // insertar un archivo dentro de un bloque. Si este número quedara por
    // debajo del techo anunciado, esa pantalla sería el eslabón corto: el
    // navegador dejaría pasar el vídeo porque cabe en lo prometido y Next lo
    // cortaría sin mensaje.
    expect(cuerpoDeUnaAccion()).toBeGreaterThan(TECHO_DE_MEDIOS_BYTES)
  })

  it('la guía de despliegue dice el mismo techo que la plataforma aplica', () => {
    // La misma lección que dejó el panel prometiendo 50 MB mientras el marco
    // cortaba en 8: una frase no la compara nadie si no hay quien la compare.
    // Quien opera el servidor decide por este párrafo si un fallo de subida es
    // del proxy o del techo, así que tiene que decir el número de verdad.
    const guia = fuente('docs', 'DESPLIEGUE.md')
    expect(guia).toContain(`**${TECHO_DE_MEDIOS_BYTES / MEGA} MB**`)
    expect(guia).toContain(`**${TECHO_DE_MODELOS_3D_BYTES / MEGA} MB**`)
  })

  it('el proxy del otro despliegue va por encima de todo lo demás', () => {
    // Quien corta tiene que ser siempre la plataforma, que sabe decir en
    // español qué pasó y cuánto pesaba. Un proxy que corta antes devuelve un
    // 413 sin una palabra dentro. Ese nginx vive en otra máquina y en un
    // archivo que este repositorio no versiona: subir el techo de aquí por
    // encima del suyo, sin ir a ponerlo allá, es fabricar dos cifras que no se
    // hablan.
    expect(cuerpoQueAdmiteElProxy()).toBeGreaterThanOrEqual(cuerpoDeUnaAccion())
    expect(cuerpoQueAdmiteElProxy()).toBeGreaterThan(TECHO_DE_MEDIOS_BYTES)
  })
})

// --------------------------------------------------------------------- ruta

/**
 * `duplex: 'half'` sin pelearse con los tipos.
 *
 * Node lo exige para mandar un cuerpo en flujo, y `RequestInit` del DOM no lo
 * declara —según la versión de TypeScript y de los tipos de Next, a veces sí—.
 * Un `@ts-expect-error` aquí se volvería un error el día que lo declaren, que
 * es la forma más tonta de romper la construcción.
 */
const conFlujo = (opciones: RequestInit & { duplex?: 'half' }): RequestInit =>
  opciones as RequestInit

/** Una petición como la que manda `subidorQueAvisa`, con el cuerpo en crudo. */
function peticionDeSubida(opciones: {
  cuerpo?: BodyInit
  nombre?: string
  campos?: Record<string, string>
  origen?: string | null
  largoDeclarado?: number
}): Request {
  const cabeceras: Record<string, string> = {
    host: 'traumahub.tailc2094f.ts.net',
    'content-type': 'video/mp4',
    [CABECERA_NOMBRE]: encodeURIComponent(opciones.nombre ?? 'reduccion.mp4'),
    [CABECERA_CAMPOS]: encodeURIComponent(
      JSON.stringify(opciones.campos ?? { alt: 'Reducción cerrada', nombre: 'Reducción', origen: 'tc' }),
    ),
  }
  const origen = opciones.origen === undefined ? 'https://traumahub.tailc2094f.ts.net' : opciones.origen
  if (origen) cabeceras.origin = origen
  if (opciones.largoDeclarado !== undefined) {
    cabeceras['content-length'] = String(opciones.largoDeclarado)
  }
  return new Request(
    'https://traumahub.tailc2094f.ts.net/api/subidas/medios',
    conFlujo({
      method: 'POST',
      headers: cabeceras,
      body: opciones.cuerpo ?? new Uint8Array(64),
      duplex: 'half',
    }),
  )
}

const llamar = (peticion: Request, coleccion = 'medios') =>
  POST(peticion, { params: Promise.resolve({ coleccion }) })

/** Un flujo que entrega `trozos` de un mega cada uno, sin anunciar el total. */
const flujoDeMegas = (trozos: number): ReadableStream =>
  new ReadableStream({
    start(controlador) {
      for (let i = 0; i < trozos; i++) controlador.enqueue(new Uint8Array(MEGA))
      controlador.close()
    },
  })

describe('la ruta de subida recibe el archivo y lo entrega a Payload', () => {
  it('crea el documento y le pasa el archivo por camino, no por memoria', async () => {
    const respuesta = await llamar(peticionDeSubida({}))
    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual({ exito: true, datos: { id: '77' } })

    expect(crear).toHaveBeenCalledTimes(1)
    const argumentos = crear.mock.calls[0][0] as Record<string, unknown>
    expect(argumentos.collection).toBe('medios')
    // `filePath` y no `file`: así es Payload quien lee el archivo del disco y
    // quien deduce el tipo de su contenido, en vez de creerse el
    // `Content-Type` que declaró el navegador.
    expect(typeof argumentos.filePath).toBe('string')
    expect(argumentos.file).toBeUndefined()
    expect((argumentos.data as Record<string, unknown>).alt).toBe('Reducción cerrada')
  })

  it('el temporal se borra, también el directorio que lo contenía', async () => {
    // Sin esto, cada subida dejaría un vídeo de decenas de megas en el temporal
    // del servidor, y en el Windows de casa eso no lo limpia nadie.
    await llamar(peticionDeSubida({}))
    const camino = (crear.mock.calls[0][0] as { filePath: string }).filePath
    expect(existsSync(camino)).toBe(false)
    expect(existsSync(dirname(camino))).toBe(false)
  })

  it('un nombre que intenta salirse del directorio se queda dentro', async () => {
    await llamar(peticionDeSubida({ nombre: '../../../.env.mp4' }))
    const camino = (crear.mock.calls[0][0] as { filePath: string }).filePath
    expect(basename(camino)).toBe('.env.mp4')
    expect(camino).not.toContain('..')
  })

  it('sin extensión utilizable no se toca el disco', async () => {
    const respuesta = await llamar(peticionDeSubida({ nombre: '...' }))
    expect(respuesta.status).toBe(400)
    expect((await respuesta.json()).mensaje).toContain('extensión')
    expect(crear).not.toHaveBeenCalled()
  })

  it('solo entrega los campos que el esquema describe', async () => {
    // La misma criba que hace el editor: lo que llega por la cabecera se filtra
    // contra `camposDe`, así que un campo colado desde la consola no llega a
    // `payload.create`.
    await llamar(peticionDeSubida({ campos: { alt: 'Vía de abordaje', rol: 'admin' } }))
    const datos = (crear.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(datos.alt).toBe('Vía de abordaje')
    expect(datos).not.toHaveProperty('rol')
  })
})

describe('el techo se hace cumplir, y se dice cuánto pesaba', () => {
  it('el peso anunciado se rechaza antes de recibir un solo byte', async () => {
    const respuesta = await llamar(
      peticionDeSubida({ largoDeclarado: TECHO_DE_MEDIOS_BYTES + 1 }),
    )
    expect(respuesta.status).toBe(413)
    const mensaje = String((await respuesta.json()).mensaje)
    // El peso y el máximo, los dos: «demasiado grande» a secas no dice si
    // sobran dos megas o doscientos.
    expect(mensaje).toContain('50,0 MB')
    expect(mensaje).toContain('50 MB')
    expect(crear).not.toHaveBeenCalled()
  })

  it('quien no anuncia el peso se corta en el byte que se pasa', async () => {
    // El navegador siempre manda `Content-Length`, así que este camino es para
    // el cliente que no lo hace o que miente. Se usa `modelos-3d` porque su
    // techo son 5 MB y pasárselo cuesta seis megas de ceros y no cincuenta.
    const respuesta = await llamar(
      new Request(
        'https://traumahub.tailc2094f.ts.net/api/subidas/modelos-3d',
        conFlujo({
          method: 'POST',
          headers: {
            host: 'traumahub.tailc2094f.ts.net',
            origin: 'https://traumahub.tailc2094f.ts.net',
            [CABECERA_NOMBRE]: encodeURIComponent('tibia.glb'),
            [CABECERA_CAMPOS]: encodeURIComponent(
              JSON.stringify({ nombre: 'Tibia', origen: 'tc' }),
            ),
          },
          body: flujoDeMegas(6),
          duplex: 'half',
        }),
      ),
      'modelos-3d',
    )
    expect(respuesta.status).toBe(413)
    expect(String((await respuesta.json()).mensaje)).toContain('5 MB')
    expect(crear).not.toHaveBeenCalled()
  })

  it('un archivo vacío no crea un registro que apunte a nada', async () => {
    const respuesta = await llamar(peticionDeSubida({ cuerpo: new Uint8Array(0) }))
    expect(respuesta.status).toBe(400)
    expect(crear).not.toHaveBeenCalled()
  })
})

describe('la ruta es otro extremo HTTP y se guarda como tal', () => {
  it('sin sesión de editor no sube nada', async () => {
    estado.usuario = null
    const respuesta = await llamar(peticionDeSubida({}))
    expect(respuesta.status).toBe(401)
    expect(crear).not.toHaveBeenCalled()
  })

  it('una petición desde otro sitio se rechaza', async () => {
    // Una acción de servidor trae esta comprobación puesta por Next; una ruta,
    // no. Sin ella, un guion inyectado en cualquiera de las páginas vecinas del
    // mismo proxy subiría archivos con la sesión del traumatólogo: la cookie
    // está acotada al prefijo, pero el dominio se comparte.
    const respuesta = await llamar(peticionDeSubida({ origen: 'https://otra-pagina.cl' }))
    expect(respuesta.status).toBe(403)
    expect(crear).not.toHaveBeenCalled()
  })

  it('el mismo anfitrión con otro esquema sí pasa, porque detrás de un proxy es lo normal', async () => {
    // La aplicación habla http mientras el navegador habla https: comparar el
    // origen entero rechazaría toda subida del servidor.
    const respuesta = await llamar(
      peticionDeSubida({ origen: 'http://traumahub.tailc2094f.ts.net' }),
    )
    expect(respuesta.status).toBe(200)
  })

  it('una colección que no es del panel no existe para esta ruta', async () => {
    const respuesta = await llamar(peticionDeSubida({}), 'usuarios')
    expect(respuesta.status).toBe(404)
    expect(crear).not.toHaveBeenCalled()
  })

  it('una colección del panel que no recibe archivos lo dice', async () => {
    const respuesta = await llamar(peticionDeSubida({}), 'patologias')
    expect(respuesta.status).toBe(400)
    expect(crear).not.toHaveBeenCalled()
  })
})

// ------------------------------------------------- las dos puntas, juntas

/**
 * El `XMLHttpRequest` que no hay en Node, hecho para que las dos mitades se
 * encuentren de verdad.
 *
 * Esto es lo único de este archivo que prueba el cable entero: lo que el
 * navegador compone entra tal cual en el manejador de la ruta. Sin ello, cada
 * lado se probaría contra su idea del otro, que es exactamente cómo un nombre
 * de cabecera se separa sin que nadie lo note —la ruta leería `null` donde
 * espera el nombre del archivo y contestaría «llegó sin nombre» sobre un
 * archivo que sí lo traía—.
 *
 * `respuestaCruda` sirve para el otro caso que importa: lo que contesta un
 * proxy no es una `Respuesta` de la plataforma sino una página de error.
 */
class XHRFalso {
  static respuestaCruda: { status: number; texto: string } | null = null

  private metodo = ''
  private direccion = ''
  private cabeceras: Record<string, string> = {}
  private oyentes: Record<string, Array<() => void>> = {}

  status = 0
  responseText = ''

  upload = {
    oyentes: {} as Record<string, Array<(evento: unknown) => void>>,
    addEventListener(tipo: string, fn: (evento: unknown) => void) {
      ;(this.oyentes[tipo] ??= []).push(fn)
    },
    emitir(tipo: string, evento: unknown) {
      for (const fn of this.oyentes[tipo] ?? []) fn(evento)
    },
  }

  open(metodo: string, direccion: string) {
    this.metodo = metodo
    this.direccion = direccion
  }

  setRequestHeader(clave: string, valor: string) {
    this.cabeceras[clave.toLowerCase()] = valor
  }

  addEventListener(tipo: string, fn: () => void) {
    ;(this.oyentes[tipo] ??= []).push(fn)
  }

  send(cuerpo: File) {
    void (async () => {
      const bytes = new Uint8Array(await cuerpo.arrayBuffer())
      this.upload.emitir('progress', { lengthComputable: true, loaded: bytes.length / 2, total: bytes.length })
      this.upload.emitir('progress', { lengthComputable: true, loaded: bytes.length, total: bytes.length })
      this.upload.emitir('load', {})

      if (XHRFalso.respuestaCruda) {
        this.status = XHRFalso.respuestaCruda.status
        this.responseText = XHRFalso.respuestaCruda.texto
      } else {
        const coleccion = this.direccion.split('/').pop()!
        const peticion = new Request(
          `https://traumahub.tailc2094f.ts.net${this.direccion}`,
          conFlujo({
            method: this.metodo,
            headers: {
              ...this.cabeceras,
              host: 'traumahub.tailc2094f.ts.net',
              origin: 'https://traumahub.tailc2094f.ts.net',
              'content-length': String(bytes.length),
            },
            body: bytes,
            duplex: 'half',
          }),
        )
        const respuesta = await llamar(peticion, coleccion)
        this.status = respuesta.status
        this.responseText = await respuesta.text()
      }

      for (const fn of this.oyentes.load ?? []) fn()
    })()
  }
}

describe('lo que compone el navegador es lo que la ruta espera leer', () => {
  const original = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest

  beforeEach(() => {
    XHRFalso.respuestaCruda = null
    ;(globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = XHRFalso
  })

  afterAll(() => {
    ;(globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = original
  })

  const formularioDeVideo = () => {
    const formulario = new FormData()
    formulario.set('coleccion', 'medios')
    formulario.set(
      'archivo',
      new File([new Uint8Array(2048)], 'reducción de Colles.mp4', { type: 'video/mp4' }),
    )
    formulario.set('alt', 'Reducción de Colles')
    formulario.set('nombre', 'Reducción de Colles')
    formulario.set('origen', 'tc')
    return formulario
  }

  it('el archivo llega, con su nombre y su descripción, y el avance se informa', async () => {
    const avances: number[] = []
    const respuesta = await subidorQueAvisa((f) => avances.push(f))(formularioDeVideo())

    expect(respuesta.exito).toBe(true)
    expect(crear).toHaveBeenCalledTimes(1)
    const argumentos = crear.mock.calls[0][0] as { data: Record<string, unknown>; filePath: string }
    // Con acento y con espacios: es el caso corriente y el que rompe una
    // cabecera si a alguien se le olvida el `encodeURIComponent`.
    expect(argumentos.data.alt).toBe('Reducción de Colles')
    expect(basename(argumentos.filePath)).toBe('reducci-n-de-Colles.mp4')
    // La barra se mueve **antes** de terminar, que es lo único que hace falta
    // para que un vídeo largo no parezca colgado. El cero inicial no sale de
    // aquí: lo pone la pantalla al empezar con cada archivo, para que la barra
    // aparezca con su nombre sin esperar al primer evento.
    expect(avances).toContain(0.5)
    expect(avances[avances.length - 1]).toBe(1)
  })

  it('el rechazo por peso vuelve entero desde la ruta hasta la pantalla', async () => {
    const formulario = formularioDeVideo()
    formulario.set(
      'archivo',
      new File([new Uint8Array(TECHO_DE_MEDIOS_BYTES + 1)], 'larga.mp4', { type: 'video/mp4' }),
    )
    const respuesta = await subidorQueAvisa(() => {})(formulario)
    expect(respuesta.exito).toBe(false)
    expect(String(respuesta.mensaje)).toContain('el máximo son 50 MB')
    expect(crear).not.toHaveBeenCalled()
  })

  it('el 413 de un proxy, que no habla nuestro idioma, se traduce al procedimiento', async () => {
    // Nginx contesta su propia página de error, no una `Respuesta`. Sin esta
    // traducción el panel diría «no se pudo subir» sobre el único fallo de
    // subida que tiene arreglo conocido y escrito.
    XHRFalso.respuestaCruda = { status: 413, texto: '<html><h1>413 Request Entity Too Large</h1>' }
    const respuesta = await subidorQueAvisa(() => {})(formularioDeVideo())
    expect(respuesta.exito).toBe(false)
    expect(String(respuesta.mensaje)).toContain('client_max_body_size')
  })
})

// --------------------------------------------------------------------- cable

describe('la pantalla llama a lo que se escribió', () => {
  const TABLA = fuente('src', 'components', 'admin', 'TablaDocumentos.tsx')
  const SUBIDAS = fuente('src', 'admin', 'subidas.ts')

  it('el listado sube por la ruta y ya no por la acción de servidor', () => {
    // Lo que más veces ha fallado aquí es escribir algo, probarlo y que no lo
    // llame nadie. La ruta sin esta línea sería exactamente eso.
    expect(TABLA).toContain("import { subidorQueAvisa } from '@/admin/subidas'")
    expect(TABLA).not.toMatch(/^\s*subirArchivo,$/m)
    expect(TABLA).toContain('subidorQueAvisa(avisar)')
  })

  it('la dirección de la subida pasa por `ruta()`', () => {
    // Bajo prefijo, un `/api/subidas/…` a pelo lo atiende la página vecina del
    // mismo dominio y devuelve un 404 que no explica nada.
    expect(SUBIDAS).toContain("ruta(`/api/subidas/${slug}`)")
    expect(rutaDeSubida('medios')).toBe('/api/subidas/medios')
  })

  it('el avance se mide con XMLHttpRequest, que es lo único que lo informa', () => {
    // `fetch` no entrega eventos de progreso al **enviar**, así que con fetch
    // la barra no existiría: el botón se quedaría en «Subiendo…» durante los
    // minutos que tarda un vídeo por un túnel doméstico.
    expect(SUBIDAS).toContain('new XMLHttpRequest()')
    expect(SUBIDAS).toContain("peticion.upload.addEventListener('progress'")
  })

  it('el panel pinta el avance y anuncia de qué archivo se trata', () => {
    expect(TABLA).toContain('<progress')
    // La región viva se queda montada aunque no haya subida: un `role="status"`
    // que aparece junto con su texto no lo anuncia ningún lector de pantalla.
    const region = TABLA.indexOf('<div role="status">\n        {progreso ?')
    expect(region, 'la región del avance se monta con su texto dentro').toBeGreaterThan(-1)
  })

  it('el 413 de un proxy se traduce a algo que se puede arreglar', () => {
    // Es el único fallo de subida con procedimiento conocido, y llega como una
    // página de error HTML que no es una `Respuesta` de la plataforma.
    expect(SUBIDAS).toContain('peticion.status === 413')
    expect(SUBIDAS).toContain('client_max_body_size')
  })
})
