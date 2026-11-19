import * as THREE from 'three'
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ruta } from '@/lib/rutas'
import { colorDeLaPintura, debeApartarse, distanciaAlSegmento, PREFIJO_DE_LO_QUE_CUELGA, recibeSombra } from '@/lib/pabellonCompleto'

/**
 * El recinto del pabellón: paredes, techo, piso y el equipo de la sala (`sala.glb`, de `scripts/pabellon/sala.py`).
 *
 * Es lo más pesado de la sala después de la arsenalera, y no todos lo quieren ni todos los equipos lo aguantan: no
 * se pide hasta que está puesto, y se pide después de los muebles, no a la vez, para que la camilla y la mesa
 * lleguen antes que el decorado. Quitado no se dibuja, y con él quitado vuelve el suelo difuminado de siempre.
 *
 * Cuelga del mismo grupo que la mesa y la camilla (el de `mesaEnLaEscena.ts`), así que rueda con el colchón y se
 * esconde con él en la fluoroscopia. Su marco es el del colchón: el piso en y = −0,95 y la camilla en el centro.
 *
 * Tres cosas que no son obvias y se rompen en silencio:
 * - Paredes, techo y piso son de una cara. Desde fuera y desde arriba se ve a través, que es lo que deja mirar la
 *   camilla en vista cenital sin que el techo la tape. Poner `DoubleSide` los volvería una caja cerrada.
 * - Nada echa sombra. La lámpara del simulador cuelga a un palmo del paciente, dentro del cabezal de la cialítica
 *   modelada, y si este la echara dejaría al paciente a oscuras. Solo el piso la recibe.
 * - Nada entra en la oclusión ambiental (`sinOclusion`): su pasada vuelve a dibujar la escena entera para las
 *   normales, y a escala de la sala solo cuesta, porque su radio es de centímetros del hueso.
 */

export interface RecintoEnLaEscena {
  /** El grupo que se cuelga de la sala: vacío mientras no ha llegado el modelo. */
  readonly grupo: THREE.Group
  /** Si ya llegó y se ve. */
  puesto(): boolean
  /** Lo pone o lo quita. La primera vez que se pone, lo pide (ver `pedir`). */
  poner(activo: boolean): void
  /** Pide el modelo si está puesto y aún no se pidió. Se llama cuando los muebles ya llegaron. */
  pedir(): void
  /** El metal de la sala refleja el entorno del pabellón. */
  ponerElEntorno(entorno: THREE.Texture | null): void
  /**
   * Aparta lo que cuelga del techo si se interpone entre la cámara y lo que se mira. En el sistema de la escena.
   * `true` si algo cambió: hay que dibujar otra vez.
   */
  despejarLaVista(desde: THREE.Vector3, hasta: THREE.Vector3): boolean
  liberar(): void
}

interface Colgante {
  nodo: THREE.Object3D
  /** En el marco del grupo, que es el del colchón: el centro de su caja y lo que mide hasta la esquina más lejana. */
  centro: THREE.Vector3
  radio: number
  apartado: boolean
}

export function crearElRecinto({
  cargador,
  sombras,
  pedirDibujo,
  alCambiar,
  alFallar,
}: {
  cargador: GLTFLoader
  sombras: boolean
  pedirDibujo: () => void
  /** Cuando llega, se quita o se pone: el suelo difuminado de la mesa se esconde o vuelve según esto. */
  alCambiar: () => void
  alFallar: (motivo: unknown) => void
}): RecintoEnLaEscena {
  const grupo = new THREE.Group()
  grupo.name = 'recinto-del-pabellon'
  grupo.visible = false
  let vivo = true
  let activo = true
  let pedido = false
  let llego = false
  let entorno: THREE.Texture | null = null
  const colgantes: Colgante[] = []
  const materiales = new Set<THREE.Material>()
  const geometrias = new Set<THREE.BufferGeometry>()
  const texturas = new Set<THREE.Texture>()

  const prepararElModelo = (raiz: THREE.Object3D) => {
    raiz.traverse((o) => {
      const malla = o as THREE.Mesh
      if (!malla.isMesh) return
      geometrias.add(malla.geometry)
      const delMaterial = Array.isArray(malla.material) ? malla.material : [malla.material]
      malla.castShadow = false
      malla.receiveShadow = sombras && delMaterial.some((m) => recibeSombra(m.name))
      malla.userData.sinOclusion = true
      for (const material of delMaterial) {
        materiales.add(material)
        for (const valor of Object.values(material) as unknown[]) {
          const textura = valor as THREE.Texture | null
          if (textura?.isTexture) texturas.add(textura)
        }
        const estandar = material as THREE.MeshStandardMaterial
        const pintura = colorDeLaPintura(material.name)
        if (pintura && estandar.color) estandar.color.set(pintura)
        if (estandar.isMeshStandardMaterial && estandar.metalness > 0.5) {
          estandar.envMap = entorno
          estandar.envMapIntensity = 1
          estandar.needsUpdate = true
        }
      }
    })
  }

  /** Lo que cuelga del techo, el nodo de más arriba de cada uno: si el padre se aparta, se van con él los hijos. */
  const buscarLosColgantes = (raiz: THREE.Object3D) => {
    const visitar = (nodo: THREE.Object3D) => {
      if (nodo.name.startsWith(PREFIJO_DE_LO_QUE_CUELGA)) {
        const caja = new THREE.Box3().setFromObject(nodo)
        if (caja.isEmpty()) return
        const centro = caja.getCenter(new THREE.Vector3())
        colgantes.push({ nodo, centro, radio: caja.getSize(new THREE.Vector3()).length() / 2, apartado: false })
        return
      }
      for (const hijo of nodo.children) visitar(hijo)
    }
    visitar(raiz)
  }

  const ver = () => {
    grupo.visible = activo && llego
    alCambiar()
    pedirDibujo()
  }

  const centro = new THREE.Vector3()

  return {
    grupo,

    puesto: () => activo && llego,

    poner(nuevo) {
      if (activo === nuevo) return
      activo = nuevo
      if (activo) this.pedir()
      ver()
    },

    pedir() {
      if (pedido || !activo || !vivo) return
      pedido = true
      void cargador
        .loadAsync(ruta('/pabellon/sala.glb'))
        .then((gltf) => {
          if (!vivo) return
          prepararElModelo(gltf.scene)
          // Las cajas, con el modelo en su marco y sin padre: así son las del marco del colchón.
          gltf.scene.updateMatrixWorld(true)
          buscarLosColgantes(gltf.scene)
          gltf.scene.name = 'sala'
          grupo.add(gltf.scene)
          llego = true
          ver()
        })
        .catch(alFallar)
    },

    ponerElEntorno(nuevo) {
      entorno = nuevo
      for (const material of materiales) {
        const estandar = material as THREE.MeshStandardMaterial
        if (estandar.isMeshStandardMaterial && estandar.metalness > 0.5) {
          estandar.envMap = nuevo
          estandar.needsUpdate = true
        }
      }
    },

    despejarLaVista(desde, mira) {
      if (colgantes.length === 0 || !grupo.visible) return false
      grupo.updateWorldMatrix(true, false)
      let cambio = false
      for (const c of colgantes) {
        // El centro, del marco de la sala al de la escena; el radio no cambia, que no hay escala en la cadena.
        centro.copy(c.centro).applyMatrix4(grupo.matrixWorld)
        const d = distanciaAlSegmento([centro.x, centro.y, centro.z], [desde.x, desde.y, desde.z], [mira.x, mira.y, mira.z])
        const ahora = debeApartarse(d, c.radio, c.apartado)
        if (ahora !== c.apartado) {
          c.apartado = ahora
          c.nodo.visible = !ahora
          cambio = true
        }
      }
      if (cambio) pedirDibujo()
      return cambio
    },

    liberar() {
      vivo = false
      grupo.removeFromParent()
      for (const g of geometrias) g.dispose()
      for (const t of texturas) t.dispose()
      for (const m of materiales) m.dispose()
    },
  }
}
