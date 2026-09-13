import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flattenAllFields } from 'payload'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { datosDeLosNodos } from '@/components/simulador/LienzoQuirurgico'
import { COLECCIONES } from '@/collections'
import {
  coleccionesQueInsertanPreparaciones,
  mensajeDePreparacionEnUso,
  type ColeccionMontada,
} from '@/lib/usosDeLaPreparacion'

/**
 * Las dos acciones del taller del atlas que tocan algo fuera de él.
 *
 * `exportarComoModelo` se prueba con el atlas DE VERDAD que viaja en
 * `public/atlas`, no con cuadrados: la corrección de sistemas solo se nota con
 * las piezas que el atlas de origen clasifica mal, y la única manera de saber
 * que el servidor la aplica es exportar una de ellas y mirar dónde cae.
 *
 * `eliminarInstancia` se prueba con el esquema de verdad (`COLECCIONES`), para
 * que un módulo nuevo con su pila de bloques entre en la búsqueda sin que
 * nadie tenga que acordarse de añadirlo aquí.
 */

const { estado, payloadFalso } = vi.hoisted(() => ({
  estado: {
    usuario: { id: 1, rol: 'editor', activo: true } as Record<string, unknown>,
  },
  payloadFalso: {
    findByID: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    config: { collections: [] as unknown[] },
  },
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: true,
    rolReal: 'editor',
    rol: 'editor',
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))

vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: async () => payloadFalso,
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { eliminarInstancia, exportarComoModelo } from '@/app/(frontend)/acciones/atlas'

/** Las colecciones como las deja montadas Payload: con los campos aplanados. */
const coleccionesMontadas = COLECCIONES.map((c) => ({
  ...c,
  flattenedFields: flattenAllFields({ fields: c.fields }),
})) as unknown as ColeccionMontada[]

beforeEach(() => {
  payloadFalso.findByID.mockReset()
  payloadFalso.find.mockReset()
  payloadFalso.create.mockReset()
  payloadFalso.delete.mockReset()
  payloadFalso.config.collections = coleccionesMontadas
  payloadFalso.find.mockResolvedValue({ docs: [] })
  payloadFalso.create.mockResolvedValue({ id: 99 })
  payloadFalso.delete.mockResolvedValue({})
})

describe('exportar una pierna del atlas', () => {
  // Tibia, peroné y rótula derechos, y el peroneo corto derecho: el atlas de
  // origen mete el peroneo corto en el esqueleto, y es un músculo.
  const PIERNA = ['FJ3387', 'FJ3366', 'FJ3381', 'FJ1409']

  it('llega con nombres en español, el peroneo en los músculos y centrada en la pierna', async () => {
    payloadFalso.findByID.mockResolvedValue({
      id: 7,
      nombre: 'Pierna derecha',
      contenido: { piezas: PIERNA.map((id) => ({ id })) },
    })

    const r = await exportarComoModelo(7, { protagonistas: ['FJ3387'] })
    expect(r.exito, r.mensaje).toBe(true)

    // La acción devuelve `nodos` como siempre y, además, las piezas.
    expect(r.datos?.piezas).toEqual([
      { nodo: 'Tibia_derecha', etiqueta: 'Tibia derecha', rol: 'hueso' },
      { nodo: 'Esqueleto', etiqueta: 'Esqueleto', rol: 'hueso' },
      // Sin `corregirCatalogo` en el servidor, este objeto no existiría: el
      // peroneo iría fundido en «Esqueleto», con rol de hueso.
      { nodo: 'Musculos', etiqueta: 'Músculos', rol: 'musculo' },
    ])
    expect(r.datos?.nodos).toEqual(['Tibia_derecha', 'Esqueleto', 'Musculos'])

    // El archivo que se guardó dice lo mismo que la respuesta.
    const { file } = payloadFalso.create.mock.calls[0][0] as { file: { data: Buffer } }
    const datos = file.data
    const gltf = await new GLTFLoader().parseAsync(
      datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer,
      '',
    )
    const enLaEscena = datosDeLosNodos(gltf.scene)
    expect(enLaEscena.map((d) => [d.nodo, d.datos.rol, d.datos.etiqueta])).toEqual([
      ['Tibia_derecha', 'hueso', 'Tibia derecha'],
      ['Esqueleto', 'hueso', 'Esqueleto'],
      ['Musculos', 'musculo', 'Músculos'],
    ])
    expect(enLaEscena[0].datos).toMatchObject({ nombreOriginal: 'Right tibia', fma: 'FMA24477' })

    // En el cuerpo, la pierna derecha está a unos 8 cm del eje y a 25 cm del
    // suelo. En el archivo, su caja está centrada en el origen.
    const THREE = await import('three')
    const caja = new THREE.Box3().setFromObject(gltf.scene)
    expect(caja.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-4)
    expect(caja.getSize(new THREE.Vector3()).y).toBeLessThan(0.5)
  }, 60_000)
})

describe('borrar una preparación', () => {
  it('busca en todas las pilas de bloques del esquema, borradores incluidos', () => {
    const colecciones = coleccionesQueInsertanPreparaciones(coleccionesMontadas)
    const rutas = colecciones.flatMap((c) => c.rutas.map((r) => `${c.coleccion}:${r}`))
    // Las seis pestañas de patologías y el material adicional de otros cuatro.
    expect(rutas.sort()).toEqual(
      [
        'casos-ao:contenido.preparacion',
        'cirugias:contenido.preparacion',
        'estudios-ia:contenido.preparacion',
        'maniobras:contenido.preparacion',
        'patologias:clasificacion.preparacion',
        'patologias:definicion.preparacion',
        'patologias:evaluacion.preparacion',
        'patologias:manejo.preparacion',
        'patologias:mecanismo.preparacion',
        'patologias:rehabilitacion.preparacion',
      ].sort(),
    )
    for (const c of colecciones) expect(c.versionada).toBe(true)
  })

  it('se niega si una ficha la usa, y dice cuál', async () => {
    payloadFalso.find.mockImplementation(async (args: Record<string, unknown>) => {
      const where = args.where as Record<string, unknown>
      // Solo el BORRADOR de la patología la lleva: la versión publicada ya no.
      if (args.collection === 'patologias' && 'manejo.preparacion' in where && args.draft) {
        return { docs: [{ id: 14, nombre: 'Fractura de tibia distal' }] }
      }
      if (args.collection === 'cirugias' && 'contenido.preparacion' in where && !args.draft) {
        return { docs: [{ id: 3, nombre: 'Enclavado de tibia' }] }
      }
      return { docs: [] }
    })

    const r = await eliminarInstancia(5)
    expect(r.exito).toBe(false)
    expect(r.mensaje).toContain('«Fractura de tibia distal»')
    expect(r.mensaje).toContain('«Enclavado de tibia»')
    expect(r.mensaje).toContain('la usan 2 fichas')
    expect(payloadFalso.delete).not.toHaveBeenCalled()

    // Se preguntó por el identificador de la preparación, con acceso completo.
    const llamada = payloadFalso.find.mock.calls[0][0] as Record<string, unknown>
    expect(Object.values(llamada.where as object)[0]).toEqual({ equals: '5' })
    expect(llamada.overrideAccess).toBe(true)
  })

  it('una ficha que la lleva en su borrador y en lo publicado cuenta una vez', async () => {
    payloadFalso.find.mockImplementation(async (args: Record<string, unknown>) =>
      args.collection === 'maniobras'
        ? { docs: [{ id: 2, nombre: 'Lachman' }] }
        : { docs: [] },
    )
    const r = await eliminarInstancia(5)
    expect(r.mensaje).toContain('la usa una ficha')
  })

  it('si nadie la usa, la borra', async () => {
    const r = await eliminarInstancia(5)
    expect(r.exito).toBe(true)
    expect(payloadFalso.delete).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'instancias-atlas', id: '5' }),
    )
  })

  it('con muchas, nombra ocho y dice cuántas más', () => {
    const usos = Array.from({ length: 11 }, (_, i) => ({
      coleccion: 'patologias',
      id: String(i),
      titulo: `Ficha ${i}`,
      etiqueta: 'Patología',
    }))
    const mensaje = mensajeDePreparacionEnUso(usos)
    expect(mensaje).toContain('«Ficha 7»')
    expect(mensaje).not.toContain('«Ficha 8»')
    expect(mensaje).toContain('y 3 más')
  })
})

describe('el aviso de una preparación en uso no nombra lo que el editor no ve', () => {
  // La búsqueda de usos va con overrideAccess: true, a propósito. Sin filtrar el
  // MENSAJE, un editor leía en el aviso el título de fichas de módulos que no
  // tiene, borradores incluidos: lo que el listado le oculta se lo contaba el
  // error. Estas fichas siguen negando el borrado; solo se dicen como número.
  const usos = [
    { coleccion: 'patologias', id: '1', titulo: 'Fractura de tibia', etiqueta: 'Patología' },
    { coleccion: 'cirugias', id: '2', titulo: 'Borrador secreto de cirugía', etiqueta: 'Cirugía' },
    { coleccion: 'cirugias', id: '3', titulo: 'Otro caso ajeno', etiqueta: 'Cirugía' },
  ]
  const soloPatologias = (uso: { coleccion: string }) => uso.coleccion === 'patologias'

  it('nombra las suyas y cuenta las ajenas sin título', () => {
    const mensaje = mensajeDePreparacionEnUso(usos, soloPatologias)
    expect(mensaje).toContain('la usan 3 fichas')
    expect(mensaje).toContain('«Fractura de tibia»')
    expect(mensaje).toContain('2 de módulos que usted no edita')
    expect(mensaje).not.toContain('Borrador secreto')
    expect(mensaje).not.toContain('Otro caso ajeno')
  })

  it('si no puede nombrar ninguna, no sale ni un título y dice a quién pedírselo', () => {
    const mensaje = mensajeDePreparacionEnUso(usos, () => false)
    for (const uso of usos) expect(mensaje).not.toContain(uso.titulo)
    expect(mensaje).toContain('quien edita esas fichas')
  })

  it('la acción de borrar filtra por lo que el editor puede editar', () => {
    // El cable, no solo la función: sin esto el filtro existiría y nadie lo
    // pasaría, que es el fallo que más veces ha salido en este repositorio.
    const fuente = readFileSync(join(process.cwd(), 'src/app/(frontend)/acciones/atlas.ts'), 'utf8')
    expect(fuente).toMatch(/mensajeDePreparacionEnUso\(usos,\s*\(uso\)\s*=>\s*\n?\s*puedeEditarModulo\(/)
  })
})
