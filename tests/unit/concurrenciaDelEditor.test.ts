import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Dos personas sobre la misma ficha: la segunda en guardar no borra a la
 * primera sin que nadie se entere.
 *
 * Tres cosas se fijan aquí, y la tercera es la que más fácil se pierde:
 *
 *  1. Que el servidor rechace una marca vieja y deje pasar la vigente.
 *  2. Que el mismo editor pueda guardar dos veces seguidas. La marca que
 *     devuelve el primer guardado tiene que ser la que el segundo encuentra en
 *     la base; si no, la protección convierte cada segundo guardado en un
 *     choque consigo mismo, y lo siguiente que hace alguien es quitarla.
 *  3. Que el formulario mande la marca y adopte la nueva. La acción acepta una
 *     llamada sin marca —el listado la usa así— y en ese caso no comprueba
 *     nada: si el formulario dejara de mandarla, las pruebas del servidor
 *     seguirían verdes y el defecto habría vuelto entero.
 *
 * La base se imita con un solo documento en memoria que mueve su `updatedAt`
 * en cada escritura, que es lo único de Payload que importa aquí. Que Payload
 * devuelva al escribir la misma marca que da al leer con `draft: true` está
 * razonado contra su código en `src/admin/concurrencia.ts`.
 */

const { estado, base } = vi.hoisted(() => ({
  estado: { usuario: null as Record<string, unknown> | null },
  base: {
    documento: null as Record<string, unknown> | null,
    reloj: 0,
    lecturas: [] as Record<string, unknown>[],
    escrituras: 0,
    baseCaida: false,
  },
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: true,
    rolReal: 'admin',
    rol: 'admin',
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))

/** Una hora distinta en cada escritura, con milisegundos como los de Payload. */
const siguienteMarca = () => new Date(Date.UTC(2026, 8, 13, 10, 0, 0, ++base.reloj)).toISOString()

vi.mock('payload', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('payload')>()),
  getPayload: async () => ({
    findByID: async (argumentos: Record<string, unknown>) => {
      base.lecturas.push(argumentos)
      if (base.baseCaida) throw new Error('connect ECONNREFUSED 127.0.0.1:5432')
      if (!base.documento) throw Object.assign(new Error('Not Found'), { status: 404 })
      return { ...base.documento }
    },
    update: async ({ data }: { data: Record<string, unknown> }) => {
      base.escrituras += 1
      base.documento = { ...base.documento, ...data, updatedAt: siguienteMarca() }
      return { ...base.documento }
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      base.escrituras += 1
      base.documento = { ...data, id: 3, updatedAt: siguienteMarca() }
      return { ...base.documento }
    },
  }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { cambiarPublicacion, guardarDocumento } from '@/app/(frontend)/acciones/contenido'
import {
  cambioDesde,
  marcaDe,
  MENSAJE_DE_CONFLICTO,
  MENSAJE_DE_FICHA_ELIMINADA,
} from '@/admin/concurrencia'

const maniobra = { nombre: 'Lachman', segmento: 7, evalua: 'Ligamento cruzado anterior' }

beforeEach(() => {
  estado.usuario = { id: 1, rol: 'admin', activo: true }
  base.reloj = 0
  base.lecturas = []
  base.escrituras = 0
  base.baseCaida = false
  base.documento = { id: 3, ...maniobra, _status: 'draft', updatedAt: siguienteMarca() }
  // `accion()` registra en el servidor todo rechazo que no sea de acceso.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const marcaEnLaBase = () => base.documento!.updatedAt as string

// ------------------------------------------------------------ la marca

describe('la marca', () => {
  it('es el `updatedAt` del documento, o nada', () => {
    expect(marcaDe({ updatedAt: '2026-09-13T10:00:00.001Z' })).toBe('2026-09-13T10:00:00.001Z')
    expect(marcaDe({ updatedAt: new Date('2026-09-13T10:00:00.001Z') })).toBe(
      '2026-09-13T10:00:00.001Z',
    )
    expect(marcaDe({})).toBeNull()
    expect(marcaDe(null)).toBeNull()
  })

  it('compara el instante y no cómo está escrito', () => {
    // La misma hora en dos formas: si esto chocara, cada cambio de ruta de
    // lectura en Payload sería un choque con uno mismo.
    expect(cambioDesde('2026-09-13T10:00:00.001Z', '2026-09-13T10:00:00.001+00:00')).toBe(false)
    expect(cambioDesde('2026-09-13T10:00:00.001Z', '2026-09-13T10:00:00.002Z')).toBe(true)
  })

  it('también cuenta como cambio una marca más antigua: una ficha restaurada', () => {
    expect(cambioDesde('2026-09-13T10:00:00.002Z', '2026-09-13T10:00:00.001Z')).toBe(true)
  })

  it('una marca que no es fecha no se deja pasar a ciegas', () => {
    expect(cambioDesde('cualquier-cosa', '2026-09-13T10:00:00.001Z')).toBe(true)
  })
})

// ----------------------------------------------------------- el servidor

describe('guardar sobre una ficha que otra persona ya cambió', () => {
  it('rechaza, no escribe, y lo dice en español invitando a recargar', async () => {
    const marcaAlAbrir = marcaEnLaBase()
    // La otra persona guarda primero.
    await guardarDocumento('maniobras', 3, { ...maniobra, evalua: 'LCA' }, false, marcaAlAbrir)
    const escriturasAntes = base.escrituras

    const respuesta = await guardarDocumento('maniobras', 3, maniobra, false, marcaAlAbrir)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toBe(MENSAJE_DE_CONFLICTO)
    expect(respuesta.mensaje).toMatch(/[Rr]ecargue sin perder lo escrito/)
    expect(respuesta.conflicto).toEqual({ marcaActual: marcaEnLaBase() })
    expect(base.escrituras).toBe(escriturasAntes)
    expect(base.documento!.evalua).toBe('LCA')
  })

  it('lee la ficha como la lee el editor: con `draft` si la colección se versiona', async () => {
    // Leída sin `draft`, la marca sería la de lo publicado y cada guardado
    // sobre un borrador chocaría.
    await guardarDocumento('maniobras', 3, maniobra, false, marcaEnLaBase())
    expect(base.lecturas[0]).toMatchObject({ id: '3', draft: true, overrideAccess: true })
  })

  it('una ficha eliminada entre medias se explica, en vez de un «Not Found»', async () => {
    const marcaAlAbrir = marcaEnLaBase()
    base.documento = null
    const respuesta = await guardarDocumento('maniobras', 3, maniobra, false, marcaAlAbrir)
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toBe(MENSAJE_DE_FICHA_ELIMINADA)
    expect(respuesta.conflicto).toBeUndefined()
  })

  it('un fallo de la base no se disfraza de ficha eliminada', async () => {
    // Contarlo como «se eliminó» mandaría a copiar a mano una ficha que sigue
    // ahí, y a volver a crearla: dos fichas donde había una.
    const marcaAlAbrir = marcaEnLaBase()
    base.baseCaida = true
    const respuesta = await guardarDocumento('maniobras', 3, maniobra, false, marcaAlAbrir)
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain('ECONNREFUSED')
    expect(base.escrituras).toBe(0)
  })

  it('crear una ficha nueva no busca marca que comparar', async () => {
    base.documento = null
    const respuesta = await guardarDocumento('maniobras', null, maniobra, false, null)
    expect(respuesta.exito).toBe(true)
    expect(base.lecturas).toHaveLength(0)
    expect(respuesta.datos?.marca).toBe(marcaEnLaBase())
  })
})

describe('el mismo editor guardando dos veces seguidas', () => {
  it('no choca consigo mismo si adopta la marca que le devuelve el guardado', async () => {
    let marca = marcaEnLaBase()
    for (let vez = 1; vez <= 3; vez++) {
      const respuesta = await guardarDocumento(
        'maniobras',
        3,
        { ...maniobra, evalua: `Versión ${vez}` },
        false,
        marca,
      )
      expect(respuesta.exito, `guardado ${vez}`).toBe(true)
      expect(respuesta.datos?.marca).toBe(marcaEnLaBase())
      marca = respuesta.datos!.marca as string
    }
  })

  it('y chocaría si se quedara con la de la apertura, que es la trampa a evitar', async () => {
    const alAbrir = marcaEnLaBase()
    expect((await guardarDocumento('maniobras', 3, maniobra, false, alAbrir)).exito).toBe(true)
    const segundo = await guardarDocumento('maniobras', 3, maniobra, false, alAbrir)
    expect(segundo.conflicto).toBeDefined()
  })

  it('retirar de publicación devuelve también la marca nueva, y guardar después no choca', async () => {
    base.documento!._status = 'published'
    const retirada = await cambiarPublicacion('maniobras', 3, false, marcaEnLaBase())
    expect(retirada.exito).toBe(true)
    expect(retirada.datos?.marca).toBe(marcaEnLaBase())

    const despues = await guardarDocumento('maniobras', 3, maniobra, false, retirada.datos!.marca)
    expect(despues.exito).toBe(true)
  })

  it('retirar con una marca vieja choca igual que guardar', async () => {
    // Si retirar adoptara a ciegas su marca nueva, taparía lo que otra
    // persona guardó entre medias y el guardado siguiente lo borraría.
    const alAbrir = marcaEnLaBase()
    await guardarDocumento('maniobras', 3, { ...maniobra, evalua: 'LCA' }, false, alAbrir)
    const retirada = await cambiarPublicacion('maniobras', 3, false, alAbrir)
    expect(retirada.exito).toBe(false)
    expect(retirada.conflicto).toEqual({ marcaActual: marcaEnLaBase() })
  })

  it('el listado sigue publicando sin marca, porque no tiene ficha abierta', async () => {
    const respuesta = await cambiarPublicacion('maniobras', 3, true)
    expect(respuesta.exito).toBe(true)
    expect(base.lecturas).toHaveLength(0)
  })
})

// ---------------------------------------------------------- el cableado

/**
 * El formulario, leído del disco.
 *
 * El entorno de la suite es `node` y no hay jsdom (ver `vitest.config.ts`): el
 * componente no se monta. Se quitan los comentarios antes de buscar, porque
 * los de esta casa citan el código que explican y la prueba se cumpliría sola
 * leyendo la explicación.
 */
const EDITOR = readFileSync(
  join(process.cwd(), 'src', 'components', 'admin', 'FormularioDocumento.tsx'),
  'utf8',
)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ')

describe('el formulario usa lo de arriba', () => {
  it('nace con la marca del documento que abrió', () => {
    expect(EDITOR).toContain('useRef<Marca>(marcaDe(documento))')
  })

  it('manda la marca al guardar y al retirar', () => {
    expect(EDITOR).toMatch(
      /guardarDocumento\( esquema\.slug, id, valores, publicar, marca\.current, \)/,
    )
    expect(EDITOR).toContain('cambiarPublicacion(esquema.slug, id, false, marca.current)')
  })

  it('adopta la marca que le devuelven sus propias escrituras', () => {
    expect(EDITOR).toContain('marca.current = resultado.datos.marca')
    expect(EDITOR).toContain('marca.current = r.datos.marca')
  })

  it('reconoce el choque por `conflicto` y no comparando la frase', () => {
    expect(EDITOR).toContain('if (resultado.conflicto)')
    expect(EDITOR).toContain('if (r.conflicto)')
    expect(EDITOR).not.toMatch(/mensaje\s*===\s*MENSAJE_DE_CONFLICTO/)
  })

  it('ofrece recargar sin perder lo escrito, y ese botón llama de verdad a la recarga', () => {
    const boton = EDITOR.slice(
      EDITOR.indexOf('{conflicto && id !== null ? ('),
      EDITOR.indexOf('Recargar sin perder lo escrito'),
    )
    expect(boton).toContain('recargarConservandoLoEscrito()')
  })

  it('la recarga no repone los valores: solo adopta la marca y pide la página', () => {
    const inicio = EDITOR.indexOf('const recargarConservandoLoEscrito = () => {')
    expect(inicio).toBeGreaterThan(-1)
    const cuerpo = EDITOR.slice(inicio, EDITOR.indexOf('const cambiar = ', inicio))
    expect(cuerpo).toContain('marca.current = conflicto.marcaActual')
    expect(cuerpo).toContain('router.refresh()')
    // Reponer aquí los valores sería perder lo escrito, que es lo que se evita.
    expect(cuerpo).not.toContain('setValores(')
    expect(cuerpo).not.toContain('setSucio(false)')
  })
})
