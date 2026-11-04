import type * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { placaRectaDeLaDireccion } from '@/lib/placasRectas'
import { crearPlacaRecta } from './placaRectaProcedural'

/**
 * Abre el modelo de un instrumento: el archivo `.glb` de su dirección o, si la dirección es la de una placa recta a
 * medida (P-008 E3), la placa generada en el acto.
 *
 * Todos los que abren instrumentos pasan por aquí —la mano del lienzo, el recuadro de la bandeja, la sesión que se
 * restaura—: si uno abriera las placas a medida y otro no, la placa estaría en la mano y no en el recuadro, o se
 * colocaría y al volver a la sesión no aparecería.
 *
 * Devuelve la raíz igual que `gltf.scene`. La placa generada llega en el acto, sin esperar: quien llama tiene que
 * aguantar que `alCargar` corra antes de que esta función vuelva.
 */
export function cargarModeloDelInstrumento(url: string, alCargar: (raiz: THREE.Object3D) => void, alFallar: () => void): void {
  if (url.startsWith('procedural:')) {
    const placa = placaRectaDeLaDireccion(url)
    if (placa) alCargar(crearPlacaRecta(placa))
    else alFallar()
    return
  }
  new GLTFLoader().load(url, (gltf) => alCargar(gltf.scene), undefined, alFallar)
}
