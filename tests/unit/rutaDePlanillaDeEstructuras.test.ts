import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogoDelAtlas } from '@/atlas/formato'

/**
 * La ruta de la planilla de estructuras (D-179, P-003 E8.5): quién la usa y qué hace
 * con lo que le llega.
 *
 * Una ruta es otro extremo HTTP y se alcanza sin pasar por la pantalla que la ofrece:
 * la guardia, la comprobación de origen y los topes se prueban aquí, con una base en
 * memoria. Lo que ocurre contra PostgreSQL de verdad —aplicar, la huella, todo o
 * nada— está en `tests/integration/estructuras.test.ts`.
 */

const { estado, base } = vi.hoisted(() => ({
  estado: { usuario: null as Record<string, unknown> | null },
  base: { filas: [] as Record<string, unknown>[] },
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: Boolean(estado.usuario?.activo),
    rolReal: (estado.usuario?.rol as string) ?? null,
    rol: (estado.usuario?.rol as string) ?? null,
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))
vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: async () => ({
    find: async () => ({ docs: base.filas.map((f) => ({ ...f })), totalDocs: base.filas.length }),
  }),
}))
vi.mock('@payload-config', () => ({ default: {} }))

import { GET, POST } from '@/app/(frontend)/api/estructuras/planilla/route'
import { leerPlanilla } from '@/lib/leerPlanilla'
import { planillaDeEstructuras } from '@/lib/planillaDeEstructuras'
import { crearPlanilla } from '@/lib/planilla'

const catalogo = JSON.parse(readFileSync(resolve(process.cwd(), 'public/atlas/catalogo.json'), 'utf8')) as CatalogoDelAtlas
const tibia = catalogo.piezas.find((p) => p.nombre === 'Right tibia')!
const femur = catalogo.piezas.find((p) => p.nombre === 'Right femur')!

const como = (rol: string | null) => {
  estado.usuario = rol ? { id: 7, rol, activo: true, email: 'a@prueba.invalid', nombre: 'Prueba' } : null
}

const pedirGet = (consulta: string) => GET(new Request(`http://localhost/api/estructuras/planilla?${consulta}`))

const planillaConTibia = () =>
  planillaDeEstructuras(
    [
      {
        atlasId: tibia.id,
        nombre: 'Tibia derecha',
        original: tibia.nombre,
        lado: 'derecho',
        sistema: tibia.sistema,
        faltan: [],
        ficha: { definicion: 'Hueso largo medial de la pierna.' },
      },
    ],
    () => 'Esqueleto',
    'Prueba',
  )

function pedirPost(campos: Record<string, string | File>, cabeceras: Record<string, string> = {}) {
  const formulario = new FormData()
  for (const [clave, valor] of Object.entries(campos)) formulario.set(clave, valor)
  return POST(new Request('http://localhost/api/estructuras/planilla', { method: 'POST', body: formulario, headers: cabeceras }))
}
const archivoXlsx = (bytes: Uint8Array, nombre = 'planilla.xlsx') => new File([bytes as BlobPart], nombre)

beforeEach(() => {
  base.filas = []
  como('editor')
})

describe('quién puede', () => {
  it.each([
    ['sin sesión', null],
    ['un lector', 'lector'],
  ])('%s no descarga ni sube', async (_nombre, rol) => {
    como(rol)
    const descarga = await pedirGet('region=torax')
    expect(descarga.status).toBe(403)
    expect(descarga.headers.get('content-type')).toContain('application/json')
    const subida = await pedirPost({ archivo: archivoXlsx(planillaConTibia()), accion: 'vista' })
    expect(subida.status).toBe(403)
    expect(((await subida.json()) as { exito: boolean }).exito).toBe(false)
  })

  it('una cuenta desactivada tampoco, aunque sea administradora', async () => {
    estado.usuario = { id: 2, rol: 'admin', activo: false }
    expect((await pedirGet('region=torax')).status).toBe(403)
  })
})

describe('descargar', () => {
  it('«Miembro inferior derecho» trae sus 124 piezas con los nombres del taller, y el archivo se vuelve a leer', async () => {
    const respuesta = await pedirGet('region=miembro-inferior-derecho&contenido=vacia&solo=todas')
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(respuesta.headers.get('content-disposition')).toMatch(/^attachment; filename="estructuras-miembro-inferior-derecho-vacia-\d{8}-\d{6}\.xlsx"$/)
    const [hoja] = leerPlanilla(new Uint8Array(await respuesta.arrayBuffer()))
    expect(hoja.filas).toHaveLength(125)
    expect(hoja.filas.find((f) => f[2] === 'Right tibia')?.[1]).toBe('Tibia derecha')
  })

  it('«solo las pendientes» deja fuera lo completo; «todas» lo trae; y «con lo escrito» trae el texto', async () => {
    base.filas = [
      { id: 1, atlasId: tibia.id, nombreOriginal: tibia.nombre, definicion: 'Hueso largo medial.', irrigacion: 'Arteria nutricia.' },
      { id: 2, atlasId: femur.id, nombreOriginal: femur.nombre, definicion: 'Hueso del muslo.' },
    ]
    const filasDe = async (consulta: string) => leerPlanilla(new Uint8Array(await (await pedirGet(consulta)).arrayBuffer()))[0].filas
    const pendientes = await filasDe('region=miembro-inferior-derecho&contenido=escrita&solo=pendientes')
    expect(pendientes.some((f) => f[2] === 'Right tibia')).toBe(false)
    // El fémur está a medias: sigue pendiente y trae lo escrito.
    expect(pendientes.find((f) => f[2] === 'Right femur')?.[7]).toBe('Hueso del muslo.')
    expect(pendientes).toHaveLength(124)
    const todas = await filasDe('region=miembro-inferior-derecho&contenido=escrita&solo=todas')
    expect(todas.find((f) => f[2] === 'Right tibia')?.[7]).toBe('Hueso largo medial.')
    const vacia = await filasDe('region=miembro-inferior-derecho&contenido=vacia&solo=todas')
    expect(vacia.find((f) => f[2] === 'Right tibia')?.[7]).toBeUndefined()
  })

  it('una pieza oculta sale marcada y fuera de las pendientes', async () => {
    base.filas = [{ id: 1, atlasId: tibia.id, nombreOriginal: tibia.nombre, oculta: true }]
    const filas = leerPlanilla(new Uint8Array(await (await pedirGet('region=miembro-inferior-derecho&contenido=escrita&solo=todas')).arrayBuffer()))[0].filas
    expect(filas.find((f) => f[2] === 'Right tibia')?.[16]).toBe('sí')
    const pendientes = leerPlanilla(new Uint8Array(await (await pedirGet('region=miembro-inferior-derecho&solo=pendientes')).arrayBuffer()))[0].filas
    expect(pendientes.some((f) => f[2] === 'Right tibia')).toBe(false)
  })

  it('«todas las regiones» trae todo el atlas', async () => {
    const [hoja] = leerPlanilla(new Uint8Array(await (await pedirGet('region=todas&solo=todas')).arrayBuffer()))
    expect(hoja.filas).toHaveLength(catalogo.piezas.length + 1)
  })

  it('una región que no existe se rechaza, y lo que se mande en ella no llega al nombre del archivo', async () => {
    for (const mala of ['', 'no-existe', '../../etc/passwd', 'torax"; x=']) {
      const respuesta = await pedirGet(`region=${encodeURIComponent(mala)}`)
      expect(respuesta.status, mala).toBe(400)
      expect(respuesta.headers.get('content-disposition')).toBeNull()
    }
  })
})

describe('subir', () => {
  it('una petición de otro origen no pasa, aunque la cuenta sea de editor', async () => {
    const respuesta = await pedirPost({ archivo: archivoXlsx(planillaConTibia()), accion: 'vista' }, { origin: 'https://sitio-ajeno.example', host: 'localhost' })
    expect(respuesta.status).toBe(403)
    expect(((await respuesta.json()) as { mensaje: string }).mensaje).toMatch(/no viene de esta plataforma/)
  })

  it('sin archivo, o sin decir qué hacer, no se hace nada', async () => {
    expect((await pedirPost({ accion: 'vista' })).status).toBe(400)
    expect((await pedirPost({ archivo: archivoXlsx(planillaConTibia()) })).status).toBe(400)
    expect((await pedirPost({ archivo: archivoXlsx(planillaConTibia()), accion: 'borrar-todo' })).status).toBe(400)
    expect((await pedirPost({ archivo: archivoXlsx(new Uint8Array(0)), accion: 'vista' })).status).toBe(400)
  })

  it('un archivo que no es una planilla se rechaza con su motivo en español', async () => {
    const respuesta = await pedirPost({ archivo: archivoXlsx(new TextEncoder().encode('Id,Definición\nFJ1,Hueso'), 'datos.csv'), accion: 'vista' })
    expect(respuesta.status).toBe(400)
    const cuerpo = (await respuesta.json()) as { mensaje: string }
    expect(cuerpo.mensaje).toMatch(/no es una planilla de Excel/)
  })

  it('una planilla sin la columna del id dice cuál falta', async () => {
    const bytes = crearPlanilla([{ nombre: 'X', columnas: [{ titulo: 'Nombre', tipo: 'texto' }, { titulo: 'Definición', tipo: 'texto' }], filas: [['Tibia', 'Hueso']] }])
    const respuesta = await pedirPost({ archivo: archivoXlsx(bytes), accion: 'vista' })
    expect(respuesta.status).toBe(400)
    expect(((await respuesta.json()) as { mensaje: string }).mensaje).toMatch(/Id del atlas/)
  })

  it('un cuerpo que se anuncia enorme se corta antes de leerlo', async () => {
    const respuesta = await pedirPost({ archivo: archivoXlsx(planillaConTibia()), accion: 'vista' }, { 'content-length': String(500 * 1024 * 1024) })
    expect(respuesta.status).toBe(413)
  })

  it('la vista previa cuenta qué haría y no escribe nada', async () => {
    const respuesta = await pedirPost({ archivo: archivoXlsx(planillaConTibia()), accion: 'vista', ladoOpuesto: '1' })
    expect(respuesta.status).toBe(200)
    const { exito, datos } = (await respuesta.json()) as { exito: boolean; datos: { vista: { conteo: Record<string, number>; huella: string; sinPareja: string[] } } }
    expect(exito).toBe(true)
    // La tibia derecha y, por el lado opuesto, la izquierda.
    expect(datos.vista.conteo).toMatchObject({ llenas: 2, fichasAEscribir: 2, delLadoOpuesto: 1 })
    expect(datos.vista.huella).toMatch(/^[0-9a-f]{64}$/)
    expect(datos.vista.sinPareja).toEqual([])
  })

  it('aplicar sin la huella de la vista previa se rechaza: no se escribe lo que no se vio', async () => {
    for (const huella of [undefined, 'abc', 'x'.repeat(64)]) {
      const campos: Record<string, string | File> = { archivo: archivoXlsx(planillaConTibia()), accion: 'aplicar' }
      if (huella) campos.huella = huella
      const respuesta = await pedirPost(campos)
      expect(respuesta.status, String(huella)).toBe(400)
      expect(((await respuesta.json()) as { mensaje: string }).mensaje).toMatch(/huella/)
    }
  })
})
