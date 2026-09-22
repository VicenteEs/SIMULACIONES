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

describe('una pierna exportada con un músculo protagonista', () => {
  // Tibia y peroné derechos y el peroneo corto derecho —protagonista y sin
  // traducción en la semilla—. Hasta D-138 la lista traía también la piel del
  // atlas (`FJ2810`), de cuerpo entero, y estas pruebas comprobaban que se
  // recortaba a la pierna. La piel ya no está en el atlas; el recorte sigue en
  // el código y lo prueban `exportarAlSimulador.test.ts` y
  // `exportarConCorte.test.ts` con pieles sintéticas. Aquí se comprueba lo
  // contrario: que una preparación guardada CON la piel de antes la pierde al
  // exportar sin dar ningún aviso de piel, que sería un aviso de algo que no
  // existe.
  const PIERNA = ['FJ3387', 'FJ3366', 'FJ1409', 'FJ2810']

  beforeEach(() => {
    payloadFalso.findByID.mockResolvedValue({
      id: 7,
      nombre: 'Pierna derecha con piel',
      contenido: { piezas: PIERNA.map((id) => ({ id })) },
    })
  })

  it('se centra en la pierna, y la piel que la preparación aún nombra ya no existe', async () => {
    const r = await exportarComoModelo(7, { protagonistas: ['FJ3387', 'FJ1409'] })
    expect(r.exito, r.mensaje).toBe(true)
    expect(r.datos?.sinLaPiel).toBe(false)

    const { escena } = await abrirLoGuardado()
    const sinPiel = new THREE.Box3()
    const conPiel = new THREE.Box3()
    escena.traverse((objeto) => {
      if (!(objeto as THREE.Mesh).isMesh) return
      conPiel.expandByObject(objeto)
      if (objeto.userData.rol !== 'piel') sinPiel.expandByObject(objeto)
    })
    // La pierna, en el origen: gira sobre la pierna.
    expect(sinPiel.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-4)
    expect(sinPiel.getSize(new THREE.Vector3()).y).toBeLessThan(0.5)
    // Y no hay piel: el archivo es lo que no es piel, sin más.
    expect(conPiel.min.distanceTo(sinPiel.min)).toBeLessThan(1e-9)
    expect(conPiel.max.distanceTo(sinPiel.max)).toBeLessThan(1e-9)
    void MARGEN_DE_LA_PIEL
  }, 60_000)

  it('dice qué sale en inglés, y de la piel no dice nada', async () => {
    const r = await exportarComoModelo(7, { protagonistas: ['FJ3387', 'FJ1409'] })
    expect(r.exito, r.mensaje).toBe(true)

    // La tibia tiene traducción y no se nombra; el peroneo corto no la tiene.
    expect(r.datos?.sinTraducir).toEqual(['Right fibularis brevis'])
    expect(r.datos?.nodos).toContain('Right_fibularis_brevis')

    const { notas } = await abrirLoGuardado()
    expect(notas).toContain(
      'Sin traducción, se quedan con su nombre original: Right fibularis brevis.',
    )
    expect(notas).not.toContain('La piel del atlas')
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
