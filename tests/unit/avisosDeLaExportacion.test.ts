import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Los dos avisos de la exportación, con el atlas DE VERDAD y por la acción.
 *
 * Las funciones que los calculan se prueban con cuadrados en
 * `exportarAlSimulador.test.ts`. Aquí se prueba lo que de verdad falló: que la
 * pierna de siempre, exportada con su piel, llegara centrada en el cuerpo y con
 * un nodo en inglés sin que nada lo dijera. Solo con la piel de verdad —una
 * pieza de 1,72 m— se ve el primer defecto, y solo pasando por la acción se
 * sabe que el aviso llega a las notas del modelo y a la respuesta.
 *
 * La tabla de nombres se fija a la semilla: la están llenando mientras tanto, y
 * el peroneo corto que aquí hace de pieza sin traducir dejará de serlo. La
 * prueba tiene que seguir diciendo lo mismo el día que la tabla esté completa.
 */

vi.mock('@/atlas/nombres-es.json', () => ({
  default: {
    Skin: 'Piel',
    'Right femur': 'Fémur derecho',
    'Left femur': 'Fémur izquierdo',
    'Right tibia': 'Tibia derecha',
    'Left tibia': 'Tibia izquierda',
    'Right fibula': 'Peroné derecho',
    'Left fibula': 'Peroné izquierdo',
    'Right patella': 'Rótula derecha',
    'Left patella': 'Rótula izquierda',
  },
}))

const { payloadFalso } = vi.hoisted(() => ({
  payloadFalso: {
    findByID: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    config: { collections: [] as unknown[] },
  },
}))

vi.mock('@/lib/sesion', () => {
  const usuario = { id: 1, rol: 'editor', activo: true }
  return {
    obtenerSesion: async () => ({
      usuario,
      activo: true,
      rolReal: 'editor',
      rol: 'editor',
      simulando: false,
      usuarioEfectivo: usuario,
    }),
  }
})

vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: async () => payloadFalso,
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { exportarComoModelo } from '@/app/(frontend)/acciones/atlas'
import { MARGEN_DE_LA_PIEL } from '@/lib/exportarAtlas'

beforeEach(() => {
  payloadFalso.findByID.mockReset()
  payloadFalso.create.mockReset()
  payloadFalso.create.mockResolvedValue({ id: 99 })
})

/** Abre el archivo que la acción mandó guardar, con el cargador del navegador. */
async function abrirLoGuardado() {
  const { file, data } = payloadFalso.create.mock.calls[0][0] as {
    file: { data: Buffer }
    data: { notas: string }
  }
  const bytes = file.data
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    '',
  )
  return { escena: gltf.scene, notas: data.notas }
}

describe('una pierna exportada con su piel y un músculo protagonista', () => {
  // Tibia y peroné derechos, el peroneo corto derecho —protagonista y sin
  // traducción en la semilla— y la piel del atlas, que es de cuerpo entero.
  const PIERNA = ['FJ3387', 'FJ3366', 'FJ1409', 'FJ2810']

  beforeEach(() => {
    payloadFalso.findByID.mockResolvedValue({
      id: 7,
      nombre: 'Pierna derecha con piel',
      contenido: { piezas: PIERNA.map((id) => ({ id })) },
    })
  })

  it('se centra en la pierna aunque la piel llegue a la cabeza', async () => {
    const r = await exportarComoModelo(7, { protagonistas: ['FJ3387', 'FJ1409'] })
    expect(r.exito, r.mensaje).toBe(true)
    expect(r.datos?.sinLaPiel).toBe(true)

    const { escena } = await abrirLoGuardado()
    const sinPiel = new THREE.Box3()
    const conPiel = new THREE.Box3()
    escena.traverse((objeto) => {
      if (!(objeto as THREE.Mesh).isMesh) return
      conPiel.expandByObject(objeto)
      if (objeto.userData.rol !== 'piel') sinPiel.expandByObject(objeto)
    })
    // Lo que no es piel, en el origen: la pierna gira sobre la pierna.
    expect(sinPiel.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-4)
    expect(sinPiel.getSize(new THREE.Vector3()).y).toBeLessThan(0.5)
    // Y la piel ya no es la del cuerpo entero. Hasta hoy esta línea afirmaba lo
    // contrario —que la piel completa seguía en el archivo, con su centro unos
    // 60 cm por encima—, porque entonces solo se había arreglado el centro. Una
    // pierna exportada con la piel del cuerpo entero llevaba al simulador una
    // carcasa hueca con forma de persona alrededor de la tibia, y la capa que el
    // residente tiene que incidir no era la de la pierna. Ahora la piel se
    // recorta a la zona de lo que no es piel, ampliada `MARGEN_DE_LA_PIEL` por
    // cada lado: con piel y todo, el modelo no puede sobresalir más que eso.
    const holgura = 2 * MARGEN_DE_LA_PIEL + 1e-3
    const tamanoSin = sinPiel.getSize(new THREE.Vector3())
    const tamanoCon = conPiel.getSize(new THREE.Vector3())
    expect(tamanoCon.x).toBeLessThanOrEqual(tamanoSin.x + holgura)
    expect(tamanoCon.y).toBeLessThanOrEqual(tamanoSin.y + holgura)
    expect(tamanoCon.z).toBeLessThanOrEqual(tamanoSin.z + holgura)
    expect(conPiel.getCenter(new THREE.Vector3()).length()).toBeLessThan(MARGEN_DE_LA_PIEL + 1e-3)
  }, 60_000)

  it('dice qué sale en inglés y por qué la piel no cuenta, en la respuesta y en las notas', async () => {
    const r = await exportarComoModelo(7, { protagonistas: ['FJ3387', 'FJ1409'] })
    expect(r.exito, r.mensaje).toBe(true)

    // La tibia tiene traducción y no se nombra; el peroneo corto no la tiene.
    expect(r.datos?.sinTraducir).toEqual(['Right fibularis brevis'])
    expect(r.datos?.nodos).toContain('Right_fibularis_brevis')

    const { notas } = await abrirLoGuardado()
    expect(notas).toContain(
      'Sin traducción, se quedan con su nombre original: Right fibularis brevis.',
    )
    expect(notas).toContain('La piel del atlas es de cuerpo entero')
  }, 60_000)

  it('sin piel ni nombres en inglés, las notas no avisan de nada', async () => {
    payloadFalso.findByID.mockResolvedValue({
      id: 8,
      nombre: 'Tibia y peroné',
      contenido: { piezas: [{ id: 'FJ3387' }, { id: 'FJ3366' }] },
    })
    const r = await exportarComoModelo(8, { protagonistas: ['FJ3387', 'FJ3366'] })
    expect(r.exito, r.mensaje).toBe(true)
    expect(r.datos?.sinTraducir).toEqual([])
    expect(r.datos?.sinLaPiel).toBe(false)

    const { notas } = await abrirLoGuardado()
    expect(notas).not.toContain('Sin traducción')
    expect(notas).not.toContain('piel')
  }, 60_000)
})
