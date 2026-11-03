import type * as THREE from 'three'

/** Una malla del modelo con su nombre y una copia de lo que trae en `userData`. */
export interface DatosDeNodo {
  nodo: string
  datos: Record<string, unknown>
}

/**
 * Lo que cuelga de una malla del modelo sin ser una pieza: la cinta y el borde rojo de una herida.
 *
 * Son hijos de la malla que se cortó, y `traverse` los encuentra con las mallas de verdad. Cuando `mostrar`
 * apagaba «todo lo que no está en la lista», la cinta —que es una `Mesh` con nombre propio— se apagaba con cada
 * cambio de paso o de capa: una incisión limpia deja los dos labios pegados y la cinta es lo único que se ve, así
 * que la incisión «desaparecía» y quien iba a meter los separadores no encontraba por dónde. También se colaba en
 * la lista de piezas del editor, como si fuera un trozo más del archivo.
 */
export function esDeInterfazDelModelo(objeto: THREE.Object3D): boolean {
  return objeto.name === 'cinta-de-la-herida' || objeto.name === 'borde-de-la-herida' || objeto.userData.deInterfaz === true
}

/**
 * Las mallas con nombre y su `userData`, en el orden del archivo.
 *
 * Solo mallas, igual que `nodosDelModelo`: son lo único que la consola enciende
 * y apaga, y un grupo vacío con extras propondría una fila para algo que no se
 * ve. Los datos se copian en un objeto llano para que quien los reciba no
 * pueda escribir sobre el `userData` de la escena montada.
 *
 * Sale del componente para poder probarla contra un archivo de verdad abierto
 * con `GLTFLoader`, sin WebGL: es el tramo donde el rol escrito por el
 * exportador podría perderse camino del taller sin ningún error.
 */
export function datosDeLosNodos(raiz: THREE.Object3D): DatosDeNodo[] {
  const salida: DatosDeNodo[] = []
  raiz.traverse((objeto) => {
    if (!(objeto as THREE.Mesh).isMesh || !objeto.name || esDeInterfazDelModelo(objeto)) return
    salida.push({ nodo: objeto.name, datos: { ...objeto.userData } })
  })
  return salida
}
