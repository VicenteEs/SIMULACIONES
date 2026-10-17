import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { datosDeLosNodos, resaltarUnNodo } from '@/components/simulador/LienzoQuirurgico'

function modelo() {
  const raiz = new THREE.Group()
  const hacer = (nombre: string, atlasId: string | null, visible = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
    m.name = nombre
    m.visible = visible
    if (atlasId) m.userData.atlasId = atlasId
    raiz.add(m)
    return m
  }
  return { raiz, tibial: hacer('Tibial_anterior', 'FJ2'), peroneo: hacer('Peroneo', 'FJ3'), oculta: hacer('Piel', 'FJ9', false) }
}

const tintes = (raiz: THREE.Object3D) => {
  const salida: THREE.Object3D[] = []
  raiz.traverse((o) => {
    if (o.name === 'tinte-de-info') salida.push(o)
  })
  return salida
}

describe('el destacado del botón «Info» (P-003 E9)', () => {
  it('pone un tinte hijo en la pieza elegida y no toca su material', () => {
    const { raiz, tibial } = modelo()
    const material = tibial.material
    resaltarUnNodo({ raiz }, 'Tibial_anterior')
    expect(tintes(raiz)).toHaveLength(1)
    expect(tintes(raiz)[0].parent).toBe(tibial)
    expect(tibial.material).toBe(material)
  })

  it('al elegir otra, el tinte se muda: nunca hay dos', () => {
    const { raiz, peroneo } = modelo()
    resaltarUnNodo({ raiz }, 'Tibial_anterior')
    resaltarUnNodo({ raiz }, 'Peroneo')
    expect(tintes(raiz)).toHaveLength(1)
    expect(tintes(raiz)[0].parent).toBe(peroneo)
  })

  it('con null quita el tinte', () => {
    const { raiz } = modelo()
    resaltarUnNodo({ raiz }, 'Peroneo')
    resaltarUnNodo({ raiz }, null)
    expect(tintes(raiz)).toHaveLength(0)
  })

  it('una pieza apagada no se destaca', () => {
    const { raiz } = modelo()
    resaltarUnNodo({ raiz }, 'Piel')
    expect(tintes(raiz)).toHaveLength(0)
  })

  it('el tinte no se puede pinchar y no cuenta como pieza del archivo', () => {
    const { raiz } = modelo()
    resaltarUnNodo({ raiz }, 'Peroneo')
    const [tinte] = tintes(raiz)
    const rayo = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1))
    const golpes = rayo.intersectObject(tinte, false)
    expect(golpes).toHaveLength(0)
    expect(datosDeLosNodos(raiz).map((d) => d.nodo)).not.toContain('tinte-de-info')
  })

  it('el atlasId llega en los datos de cada nodo', () => {
    const { raiz } = modelo()
    expect(datosDeLosNodos(raiz).find((d) => d.nodo === 'Peroneo')?.datos).toMatchObject({ atlasId: 'FJ3' })
  })
})
