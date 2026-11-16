import * as THREE from 'three'
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ruta } from '@/lib/rutas'
import { MEDIDAS_DE_LA_SALA, type ColocacionDeLaMesa } from '@/lib/mesaDeArsenalera'

/**
 * Lo que hay de la sala alrededor de la camilla (pedido del dueño): la mesa de la arsenalera con su instrumental, la
 * base de la camilla bajo el colchón y el suelo.
 *
 * Antes el colchón flotaba en un fondo negro, y no se notaba porque no había nada con qué compararlo. Con una mesa al
 * lado sí: una mesa con ruedas en el aire es lo primero que se ve. Por eso vienen las tres cosas juntas, y las tres
 * cuelgan del colchón y no de la escena: son mobiliario, y cuando al paciente se le da la vuelta el colchón rueda con
 * la cámara (`darLaVuelta`), de modo que en la pantalla la sala se queda quieta y el que gira es el paciente.
 *
 * Colgar del colchón tiene otra ventaja que no se buscó: el colchón está dentro del grupo del campo, que la
 * fluoroscopia esconde entero mientras dibuja. La mesa no sale en la radiografía sin que nadie tenga que acordarse.
 *
 * Los modelos los hace `scripts/pabellon/mobiliario.py` con Blender; aquí solo se cargan, se colocan y se pinchan.
 */

export interface MesaEnLaEscena {
  /** Cuelga la sala del colchón. Se puede llamar más de una vez: lo que ya está no se vuelve a pedir. */
  montar(colchon: THREE.Object3D): void
  /** Lleva la mesa a su sitio, deslizándola en `ms` (0, de golpe). */
  colocar(colocacion: ColocacionDeLaMesa, ms?: number): void
  /** Dónde está ahora, a mitad de un deslizamiento si lo hay; `null` mientras no ha llegado. */
  colocacion(): ColocacionDeLaMesa | null
  /** La mesa ya llegó y se ve: se puede pinchar. */
  lista(): boolean
  /**
   * A qué distancia toca el rayo (en la escena) la mesa, o `null`. Se pregunta con las cajas de la base y de la bandeja
   * y no malla a malla: el cursor la pregunta en cada movimiento, y el instrumental de encima son cien mil triángulos.
   */
  distancia(rayo: THREE.Ray): number | null
  /** A qué altura, en el marco del colchón, toca el rayo la mesa, o `null`. Es la altura a la que se la arrastra. */
  alturaDelToque(rayo: THREE.Ray): number | null
  /**
   * Dónde cruza el rayo el plano horizontal a esa altura, en el marco del colchón: por donde se arrastra en «Libre».
   * A la altura de lo agarrado y no del suelo: se agarra por la bandeja, a un metro de él, y en perspectiva el suelo
   * avanza más que el cursor, así que la mesa se escapaba de la mano.
   */
  enElPlano(rayo: THREE.Ray, altura?: number): { x: number; z: number } | null
  /** La funda va del color del paño del caso: en un pabellón todo lo estéril es del mismo juego. */
  colorDeLaFunda(color: string): void
  /** La sala que refleja el metal (`crearEntornoDePabellon`). Sin ella el acero se ve negro. */
  ponerElEntorno(entorno: THREE.Texture | null): void
  liberar(): void
}

/** Lo que se desliza la mesa al cambiar de sitio. Una mesa que salta de un lado a otro de la camilla no parece una mesa. */
const DURACION_DEL_CAMBIO_MS = 650

export function crearLaMesaEnLaEscena({
  cargador,
  sombras,
  pedirDibujo,
  alFallar,
}: {
  cargador: GLTFLoader
  sombras: boolean
  pedirDibujo: () => void
  alFallar: (motivo: unknown) => void
}): MesaEnLaEscena {
  let vivo = true
  let colchon: THREE.Object3D | null = null
  let mesa: THREE.Object3D | null = null
  let elevable: THREE.Object3D | null = null
  let funda: THREE.Mesh | null = null
  let colorPendiente: string | null = null
  let entorno: THREE.Texture | null = null
  const sala = new THREE.Group()
  sala.name = 'sala-del-pabellon'
  /** Las cajas con que se pincha, en el marco de la mesa: la base y lo que sube (sin la subida: esa se suma al preguntar). */
  const cajaDeLaBase = new THREE.Box3()
  const cajaDeLoElevable = new THREE.Box3()
  let objetivo: ColocacionDeLaMesa | null = null
  let animacion = 0
  const materiales = new Set<THREE.Material>()
  const geometrias = new Set<THREE.BufferGeometry>()
  const texturas = new Set<THREE.Texture>()

  const suelo = crearElSuelo(sombras)
  sala.add(suelo)
  geometrias.add(suelo.geometry)
  materiales.add(suelo.material as THREE.Material)
  const alfaDelSuelo = (suelo.material as THREE.MeshStandardMaterial).alphaMap
  if (alfaDelSuelo) texturas.add(alfaDelSuelo)

  /** Lo de un modelo recién llegado: sombras, el reflejo del metal y la cuenta de lo que hay que soltar al final. */
  const prepararElModelo = (raiz: THREE.Object3D) => {
    raiz.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      geometrias.add(m.geometry)
      // La sombra de contacto ya viene horneada en el suelo del modelo (`sombra`): ni la echa ni la recibe.
      const esSombra = m.name.startsWith('sombra') || m.parent?.name.startsWith('sombra')
      m.castShadow = sombras && !esSombra
      m.receiveShadow = sombras && !esSombra
      for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
        materiales.add(material)
        for (const valor of Object.values(material) as unknown[]) {
          const t = valor as THREE.Texture | null
          if (t?.isTexture) texturas.add(t)
        }
        const conReflejo = material as THREE.MeshStandardMaterial
        if (conReflejo.isMeshStandardMaterial && conReflejo.metalness > 0.5) {
          conReflejo.envMap = entorno
          conReflejo.envMapIntensity = 1
          conReflejo.needsUpdate = true
        }
      }
    })
  }

  const ponerLaColocacion = (c: ColocacionDeLaMesa) => {
    if (!mesa) return
    mesa.position.set(c.x, MEDIDAS_DE_LA_SALA.suelo, c.z)
    mesa.rotation.set(0, c.giro, 0)
    if (elevable) elevable.position.y = c.subida
  }

  const pintarLaFunda = () => {
    if (!funda || !colorPendiente) return
    for (const material of Array.isArray(funda.material) ? funda.material : [funda.material]) {
      ;(material as THREE.MeshStandardMaterial).color?.set(colorPendiente)
    }
    pedirDibujo()
  }

  let pedida = false
  const pedirLosModelos = () => {
    if (pedida) return
    pedida = true
    void cargador
      .loadAsync(ruta('/pabellon/mesa-quirurgica.glb'))
      .then((gltf) => {
        if (!vivo) return
        prepararElModelo(gltf.scene)
        gltf.scene.name = 'mesa-quirurgica'
        sala.add(gltf.scene)
        pedirDibujo()
      })
      .catch(alFallar)
    void cargador
      .loadAsync(ruta('/pabellon/mesa-arsenalera.glb'))
      .then((gltf) => {
        if (!vivo) return
        const raiz = gltf.scene.getObjectByName('mesa-arsenalera') ?? gltf.scene
        prepararElModelo(gltf.scene)
        mesa = new THREE.Group()
        mesa.name = 'mesa-de-la-arsenalera'
        mesa.add(gltf.scene)
        elevable = raiz.getObjectByName('elevable') ?? null
        const base = raiz.getObjectByName('base') ?? null
        funda = (raiz.getObjectByName('funda') as THREE.Mesh | undefined) ?? null
        // Si la funda llegó como grupo (el exportador separa una malla con dos materiales), se pinta su primera malla.
        if (funda && !funda.isMesh) funda = (funda.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined) ?? null
        // Las cajas en el marco de la mesa, con la mesa todavía sin colocar y lo elevable abajo: así son las de fábrica.
        gltf.scene.updateMatrixWorld(true)
        cajaDeLaBase.makeEmpty()
        cajaDeLoElevable.makeEmpty()
        if (base) cajaDeLaBase.setFromObject(base)
        if (elevable) cajaDeLoElevable.setFromObject(elevable)
        if (!base && !elevable) cajaDeLoElevable.setFromObject(gltf.scene)
        sala.add(mesa)
        if (objetivo) ponerLaColocacion(objetivo)
        pintarLaFunda()
        pedirDibujo()
      })
      .catch(alFallar)
  }

  const punto = new THREE.Vector3()
  const inversa = new THREE.Matrix4()
  const local = new THREE.Ray()
  const subida = new THREE.Box3()

  return {
    montar(nuevo) {
      if (colchon !== nuevo) {
        sala.removeFromParent()
        colchon = nuevo
        colchon.add(sala)
      }
      pedirLosModelos()
    },

    colocar(c, ms = DURACION_DEL_CAMBIO_MS) {
      const desde = mesa && objetivo ? { x: mesa.position.x, z: mesa.position.z, giro: mesa.rotation.y, subida: elevable?.position.y ?? 0 } : null
      objetivo = c
      cancelAnimationFrame(animacion)
      if (!mesa || !desde || ms <= 0) {
        ponerLaColocacion(c)
        pedirDibujo()
        return
      }
      // El giro por el camino corto: de −90° a 180° hay noventa grados, no doscientos setenta.
      let giro = c.giro - desde.giro
      giro = Math.atan2(Math.sin(giro), Math.cos(giro))
      const inicio = performance.now()
      const cuadro = (ahora: number) => {
        if (!vivo || objetivo !== c) return
        const k = Math.min(1, (ahora - inicio) / ms)
        const suave = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        ponerLaColocacion({
          x: desde.x + (c.x - desde.x) * suave,
          z: desde.z + (c.z - desde.z) * suave,
          giro: desde.giro + giro * suave,
          subida: desde.subida + (c.subida - desde.subida) * suave,
        })
        pedirDibujo()
        if (k < 1) animacion = requestAnimationFrame(cuadro)
      }
      animacion = requestAnimationFrame(cuadro)
    },

    colocacion: () => (mesa ? { x: mesa.position.x, z: mesa.position.z, giro: mesa.rotation.y, subida: elevable?.position.y ?? 0 } : null),

    lista: () => !!mesa && !!colchon && sala.parent !== null && esVisible(sala),

    distancia(rayo) {
      if (!mesa || !esVisible(sala)) return null
      mesa.updateWorldMatrix(true, false)
      inversa.copy(mesa.matrixWorld).invert()
      local.copy(rayo).applyMatrix4(inversa)
      let mejor: number | null = null
      const probar = (caja: THREE.Box3) => {
        if (caja.isEmpty()) return
        const cruce = local.intersectBox(caja, punto)
        if (!cruce) return
        // Sin escala en la cadena (la mesa y el colchón solo se mueven y giran): la distancia local es la de la escena.
        const d = cruce.distanceTo(local.origin)
        if (mejor === null || d < mejor) mejor = d
      }
      probar(cajaDeLaBase)
      subida.copy(cajaDeLoElevable).translate(new THREE.Vector3(0, elevable?.position.y ?? 0, 0))
      probar(subida)
      return mejor
    },

    alturaDelToque(rayo) {
      const d = this.distancia(rayo)
      if (d === null || !colchon) return null
      colchon.updateWorldMatrix(true, false)
      return colchon.worldToLocal(rayo.at(d, punto)).y
    },

    enElPlano(rayo, altura = MEDIDAS_DE_LA_SALA.suelo) {
      if (!colchon) return null
      colchon.updateWorldMatrix(true, false)
      inversa.copy(colchon.matrixWorld).invert()
      local.copy(rayo).applyMatrix4(inversa)
      const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -altura)
      const cruce = local.intersectPlane(plano, punto)
      return cruce ? { x: cruce.x, z: cruce.z } : null
    },

    colorDeLaFunda(color) {
      colorPendiente = color
      pintarLaFunda()
    },

    ponerElEntorno(nuevo) {
      entorno = nuevo
      for (const material of materiales) {
        const conReflejo = material as THREE.MeshStandardMaterial
        if (conReflejo.isMeshStandardMaterial && conReflejo.metalness > 0.5) {
          conReflejo.envMap = nuevo
          conReflejo.needsUpdate = true
        }
      }
    },

    liberar() {
      vivo = false
      cancelAnimationFrame(animacion)
      sala.removeFromParent()
      for (const g of geometrias) g.dispose()
      for (const t of texturas) t.dispose()
      for (const m of materiales) m.dispose()
    },
  }
}

/** Si se ve: lo esconde cualquiera de los padres, y el campo se esconde entero cuando no hay camilla. */
function esVisible(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}

/**
 * El suelo del pabellón: vinilo gris verdoso que se funde con el fondo hacia los bordes, para que no se vea dónde se
 * acaba. Es un plano de siete metros, y no la sala entera: las paredes, a la distancia a que se mira el tobillo, serían
 * un fondo nítido que compite con él, y el fondo de la consola ya es el verde de las paredes (`consola.css`).
 *
 * El degradado va en un `DataTexture` y no en un lienzo 2D: así se monta también sin navegador, en las pruebas.
 */
function crearElSuelo(sombras: boolean): THREE.Mesh {
  const lado = 64
  const datos = new Uint8Array(lado * lado * 4)
  for (let j = 0; j < lado; j++) {
    for (let i = 0; i < lado; i++) {
      const r = Math.hypot(i / (lado - 1) - 0.5, j / (lado - 1) - 0.5) * 2
      // Entero hasta un tercio del radio y nada desde el borde: la luz de la lámpara se va apagando sobre el suelo.
      const t = Math.min(1, Math.max(0, (r - 0.3) / 0.65))
      const alfa = Math.round(255 * (1 - t * t * (3 - 2 * t)))
      const k = (j * lado + i) * 4
      // `alphaMap` lee el verde.
      datos[k] = datos[k + 1] = datos[k + 2] = alfa
      datos[k + 3] = 255
    }
  }
  const alfa = new THREE.DataTexture(datos, lado, lado)
  alfa.needsUpdate = true
  alfa.magFilter = THREE.LinearFilter
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7f8d89'),
    roughness: 0.62,
    metalness: 0,
    alphaMap: alfa,
    transparent: true,
    // Transparente, la oclusión ambiental lo salta (`crearOclusion`): un suelo con los rincones oscurecidos se veía sucio.
    depthWrite: false,
  })
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), material)
  suelo.name = 'suelo-del-pabellon'
  suelo.rotation.x = -Math.PI / 2
  // Un milímetro sobre el suelo de los modelos, para que sus sombras de contacto queden encima sin pelearse con él.
  suelo.position.set(0, MEDIDAS_DE_LA_SALA.suelo - 0.001, 0.2)
  suelo.renderOrder = -1
  suelo.receiveShadow = sombras
  return suelo
}
