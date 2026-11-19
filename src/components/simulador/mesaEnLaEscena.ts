import * as THREE from 'three'
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ruta } from '@/lib/rutas'
import {
  caminoAlrededorDelColchon,
  colocarALaArsenalera,
  largoDelCamino,
  MEDIDAS_DE_LA_SALA,
  type ColocacionDeLaMesa,
  type ColocacionDeLaPersona,
  type LadoDeLaPersona,
} from '@/lib/mesaDeArsenalera'
import { crearElRecinto } from './recintoEnLaEscena'

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
 * También la arsenalera de pie (`arsenalera-persona.glb`): se para junto a la mesa, por fuera, de frente a la bandeja y
 * con la camilla al otro lado, y sigue a la mesa cuando se la mueve (`colocarALaArsenalera`). Cuelga de la sala por la
 * misma razón que la mesa.
 *
 * Los muebles los hace `scripts/pabellon/mobiliario.py` con Blender. La arsenalera es la que modeló el dueño a mano, y
 * `scripts/pabellon/arsenalera_a_la_web.py` la lleva a la web (D-418). Aquí solo se cargan, se colocan y se pinchan.
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
  /**
   * Pone o quita a la arsenalera de pie. Quitada no se pide su modelo, de 0,7 MB, y no se pincha.
   * Puesta de nuevo, aparece ya en su sitio, sin caminar hasta él.
   */
  ponerLaPersona(activa: boolean): void
  /**
   * Pone o quita el pabellón entero: paredes, techo, piso y equipo (`recintoEnLaEscena.ts`). Quitado no se pide su
   * modelo, y vuelve el suelo difuminado de siempre.
   */
  ponerElPabellon(activo: boolean): void
  /** Aparta lo que cuelga del techo si se interpone entre la cámara y lo que se mira; `true` si algo cambió. */
  despejarLaVista(desde: THREE.Vector3, hasta: THREE.Vector3): boolean
  /** La funda va del color del paño del caso: en un pabellón todo lo estéril es del mismo juego. */
  colorDeLaFunda(color: string): void
  /** La sala que refleja el metal (`crearEntornoDePabellon`). Sin ella el acero se ve negro. */
  ponerElEntorno(entorno: THREE.Texture | null): void
  liberar(): void
}

/** Lo que se desliza la mesa al cambiar de sitio. Una mesa que salta de un lado a otro de la camilla no parece una mesa. */
const DURACION_DEL_CAMBIO_MS = 650
/**
 * Cuánto tarda ella en llegar a su sitio nuevo. Va a paso de persona y no al de la mesa: de un lado de la camilla al otro
 * son tres metros rodeando los pies, y en 650 ms sería un deslizamiento, no un paseo. Con un tope, por si se la manda lejos.
 */
const VELOCIDAD_AL_CAMINAR = 1.3
const DURACION_MAXIMA_AL_CAMINAR_MS = 2800
/** Lo que se mueve de un cuadro a otro arrastrando la mesa en «Libre»: menos que esto se sigue de golpe, sin caminar. */
const SALTO_QUE_YA_ES_UN_PASEO = 0.6

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
  // La arsenalera de pie. Cuelga de su propio grupo, con el origen entre sus pies, para colocarla como a la mesa.
  let conPersona = true
  let persona: THREE.Group | null = null
  let personaPedida = false
  /** Si ya está en algún sitio. La primera vez, y al volver a ponerla, aparece ahí y no camina desde donde la dejó. */
  let personaColocada = false
  /** Las cajas con que se la pincha, en su marco: la bata (con los brazos), los guantes y la cabeza. */
  const cajasDeLaPersona: THREE.Box3[] = []
  let ultimaMesa: ColocacionDeLaMesa | null = null
  let objetivoDeLaPersona: ColocacionDeLaPersona | null = null
  let ladoDeLaPersona: LadoDeLaPersona | undefined
  let animacionDeLaPersona = 0
  const materiales = new Set<THREE.Material>()
  const geometrias = new Set<THREE.BufferGeometry>()
  const texturas = new Set<THREE.Texture>()

  const suelo = crearElSuelo(sombras)
  sala.add(suelo)
  geometrias.add(suelo.geometry)
  materiales.add(suelo.material as THREE.Material)
  const alfaDelSuelo = (suelo.material as THREE.MeshStandardMaterial).alphaMap
  if (alfaDelSuelo) texturas.add(alfaDelSuelo)

  // El recinto trae su propio piso: con él puesto, el suelo difuminado se esconde (dos suelos a la misma altura se
  // pelearían, y el de siete metros se vería flotar sobre el de la sala).
  const recinto = crearElRecinto({
    cargador,
    sombras,
    pedirDibujo,
    alCambiar: () => {
      suelo.visible = !recinto.puesto()
    },
    alFallar,
  })
  sala.add(recinto.grupo)

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

  const ponerLaPersonaEn = (c: { x: number; z: number; giro: number }) => {
    if (!persona) return
    persona.position.set(c.x, MEDIDAS_DE_LA_SALA.suelo, c.z)
    persona.rotation.set(0, c.giro, 0)
  }

  /**
   * Lleva a la arsenalera a donde le toca con la mesa donde va a quedar. Se calcula con el sitio al que va la mesa y no
   * con el que lleva a mitad de camino: ella camina a su ritmo, y por el camino de la mesa cambiaría de lado cada vez
   * que esta cruza la camilla.
   */
  const colocarALaPersona = (mesaFinal: ColocacionDeLaMesa, ms: number) => {
    ultimaMesa = mesaFinal
    if (!conPersona) return
    const sitio = colocarALaArsenalera(mesaFinal, ladoDeLaPersona)
    ladoDeLaPersona = sitio.lado
    objetivoDeLaPersona = sitio
    if (!persona) return
    cancelAnimationFrame(animacionDeLaPersona)
    const desde = { x: persona.position.x, z: persona.position.z, giro: persona.rotation.y }
    const lejos = Math.hypot(sitio.x - desde.x, sitio.z - desde.z)
    // Arrastrando la mesa por el suelo llega un cuadro tras otro: seguirla de golpe. Un salto grande (la mesa pasó al
    // otro lado de la camilla) es un paseo, y se camina rodeando los pies del paciente, no por encima de él.
    if (!personaColocada || (ms <= 0 && lejos < SALTO_QUE_YA_ES_UN_PASEO)) {
      ponerLaPersonaEn(sitio)
      personaColocada = true
      pedirDibujo()
      return
    }
    const camino = caminoAlrededorDelColchon(desde, sitio)
    const largo = largoDelCamino(camino)
    const duracion = Math.min(DURACION_MAXIMA_AL_CAMINAR_MS, Math.max(ms, DURACION_DEL_CAMBIO_MS, (largo / VELOCIDAD_AL_CAMINAR) * 1000))
    let giro = sitio.giro - desde.giro
    giro = Math.atan2(Math.sin(giro), Math.cos(giro))
    const inicio = performance.now()
    const cuadro = (ahora: number) => {
      if (!vivo || objetivoDeLaPersona !== sitio) return
      const k = Math.min(1, (ahora - inicio) / duracion)
      const suave = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      // A `suave · largo` metros del principio del camino.
      let recorrido = suave * largo
      let x = sitio.x
      let z = sitio.z
      for (let i = 1; i < camino.length; i++) {
        const tramo = Math.hypot(camino[i].x - camino[i - 1].x, camino[i].z - camino[i - 1].z)
        if (recorrido <= tramo || i === camino.length - 1) {
          const f = tramo > 0 ? Math.min(1, recorrido / tramo) : 1
          x = camino[i - 1].x + (camino[i].x - camino[i - 1].x) * f
          z = camino[i - 1].z + (camino[i].z - camino[i - 1].z) * f
          break
        }
        recorrido -= tramo
      }
      ponerLaPersonaEn({ x, z, giro: desde.giro + giro * suave })
      pedirDibujo()
      if (k < 1) animacionDeLaPersona = requestAnimationFrame(cuadro)
    }
    animacionDeLaPersona = requestAnimationFrame(cuadro)
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
    const camilla = cargador
      .loadAsync(ruta('/pabellon/mesa-quirurgica.glb'))
      .then((gltf) => {
        if (!vivo) return
        prepararElModelo(gltf.scene)
        gltf.scene.name = 'mesa-quirurgica'
        sala.add(gltf.scene)
        pedirDibujo()
      })
      .catch(alFallar)
    const arsenalera = cargador
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
    // El decorado, después de la camilla y la mesa: es lo más grande y lo que menos urge. Con los dos pedidos ya
    // resueltos (bien o mal, que el recinto no depende de ellos), el navegador no reparte el ancho de banda entre
    // todos a la vez, y lo que se opera llega antes que lo que lo rodea.
    void Promise.allSettled([camilla, arsenalera]).then(() => {
      if (vivo) recinto.pedir()
    })
  }

  /** El modelo de la arsenalera, la primera vez que hace falta: pesa 0,7 MB y no todos la quieren. */
  const pedirALaPersona = () => {
    if (personaPedida || !conPersona) return
    personaPedida = true
    void cargador
      .loadAsync(ruta('/pabellon/arsenalera-persona.glb'))
      .then((gltf) => {
        if (!vivo) return
        prepararElModelo(gltf.scene)
        // Las cajas, con el modelo todavía en su marco y sin colocar. La bata lleva los brazos: con ella basta, más los
        // guantes y el gorro para lo que sobresale de ella.
        gltf.scene.updateMatrixWorld(true)
        for (const nombre of ['bata', 'guantes', 'gorro']) {
          const nodo = gltf.scene.getObjectByName(nombre)
          if (nodo) cajasDeLaPersona.push(new THREE.Box3().setFromObject(nodo))
        }
        if (cajasDeLaPersona.length === 0) cajasDeLaPersona.push(new THREE.Box3().setFromObject(gltf.scene))
        persona = new THREE.Group()
        persona.name = 'arsenalera-de-pie'
        persona.add(gltf.scene)
        persona.visible = conPersona
        sala.add(persona)
        // Se la coloca con donde está la mesa ahora, no con lo que se calculó antes de que llegara: pudo moverse, o ella
        // haberse quitado y puesto, mientras el modelo bajaba.
        personaColocada = false
        if (ultimaMesa) colocarALaPersona(ultimaMesa, 0)
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
      pedirALaPersona()
    },

    colocar(c, ms = DURACION_DEL_CAMBIO_MS) {
      const desde = mesa && objetivo ? { x: mesa.position.x, z: mesa.position.z, giro: mesa.rotation.y, subida: elevable?.position.y ?? 0 } : null
      objetivo = c
      colocarALaPersona(c, ms)
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
      const conMesa = !!mesa && esVisible(sala)
      const conAlguien = !!persona && conPersona && esVisible(persona)
      if (!conMesa && !conAlguien) return null
      let mejor: number | null = null
      /** Prueba cajas en el marco de un objeto: el rayo se lleva a ese marco, y la distancia local es la de la escena. */
      const probar = (objeto: THREE.Object3D, cajas: THREE.Box3[]) => {
        objeto.updateWorldMatrix(true, false)
        inversa.copy(objeto.matrixWorld).invert()
        local.copy(rayo).applyMatrix4(inversa)
        for (const caja of cajas) {
          if (caja.isEmpty()) continue
          const cruce = local.intersectBox(caja, punto)
          if (!cruce) continue
          // Sin escala en la cadena (la sala, el colchón y lo que cuelga solo se mueven y giran): la distancia local es la de la escena.
          const d = cruce.distanceTo(local.origin)
          if (mejor === null || d < mejor) mejor = d
        }
      }
      if (conMesa && mesa) {
        subida.copy(cajaDeLoElevable).translate(new THREE.Vector3(0, elevable?.position.y ?? 0, 0))
        probar(mesa, [cajaDeLaBase, subida])
      }
      // Pincharla a ella es pedirle un instrumento, igual que a su mesa: de quién es el instrumental, si no.
      if (conAlguien && persona) probar(persona, cajasDeLaPersona)
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

    ponerLaPersona(activa) {
      if (conPersona === activa) return
      conPersona = activa
      if (persona) persona.visible = activa
      if (activa) {
        // Vuelve ya en su sitio: la mesa no se movió mientras no estaba, y caminar desde donde se quitó no tiene sentido.
        personaColocada = false
        if (persona && ultimaMesa) colocarALaPersona(ultimaMesa, 0)
        else pedirALaPersona()
      } else {
        cancelAnimationFrame(animacionDeLaPersona)
      }
      pedirDibujo()
    },

    ponerElPabellon(activo) {
      recinto.poner(activo)
    },

    despejarLaVista: (desde, hasta) => recinto.despejarLaVista(desde, hasta),

    colorDeLaFunda(color) {
      colorPendiente = color
      pintarLaFunda()
    },

    ponerElEntorno(nuevo) {
      entorno = nuevo
      recinto.ponerElEntorno(nuevo)
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
      cancelAnimationFrame(animacionDeLaPersona)
      recinto.liberar()
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
