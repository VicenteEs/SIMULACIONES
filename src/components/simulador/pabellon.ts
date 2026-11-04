import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { tamanoDeLaOclusion } from '@/lib/aspectoAnatomico'
import { esDeInterfazDelModelo } from './nodosDelModelo'

/**
 * La luz de un pabellón quirúrgico para el simulador (D-226).
 *
 * Antes había un cielo y dos luces direccionales blancas, sin sombras: el modelo se veía entero y plano, como en un
 * visor de piezas. En un quirófano la luz es otra: una lámpara grande y fría sobre el campo, que da sombras suaves
 * (su cabeza mide medio metro y de ahí la penumbra), otra satélite más débil desde el otro lado para que la mano no
 * deje el campo a oscuras, y la luz frontal de quien opera, que va con la vista. Alrededor, una sala de paredes
 * verdes apagadas y paneles de luz en el techo, que es lo que refleja el metal.
 *
 * Aquí está todo lo que depende de la luz y no del paciente: la lámpara y sus sombras, la sala que reflejan el
 * instrumental y las placas, el revelado de la imagen, y la oclusión ambiental.
 */

/**
 * Cuánto ve el tejido de la sala: la luz que rebota de las paredes, que en un quirófano es poca al lado de la lámpara.
 * El metal la refleja entera (`aplicarEntorno`); con la sala clara, más que esto lavaba la piel.
 */
const INTENSIDAD_DE_LA_SALA = 0.3

export interface Pabellon {
  /** Pone la lámpara sobre el modelo, a su escala: el caso puede venir en metros o en milímetros. */
  colocar(caja: THREE.Box3): void
  /** La luz frontal va con quien mira. */
  seguirLaCamara(camara: THREE.Camera): void
  liberar(): void
}

/** El revelado: un tono neutro que no tiñe los colores de las piezas, y las sombras de la lámpara si la calidad da. */
export function prepararElRenderizador(render: THREE.WebGLRenderer, { sombras }: { sombras: boolean }) {
  // `NeutralToneMapping` (Khronos) deja los colores de base como están y solo comprime las luces altas: con el de
  // siempre (ninguno) el reflejo de la lámpara en una placa quemaba a blanco, y con ACES los rojos se iban a marrón.
  render.toneMapping = THREE.NeutralToneMapping
  render.toneMappingExposure = 1
  render.shadowMap.enabled = sombras
  // `PCFShadowMap` y no `PCFSoftShadowMap`: en la three de hoy (0.185) la segunda está obsoleta —avisa en la consola
  // y usa la primera—, y la primera ya es la suave, con un disco de muestras cuyo ancho da `shadow.radius`.
  render.shadowMap.type = THREE.PCFShadowMap
  // La sombra se rehace solo en el dibujo principal (ver el bucle del lienzo): la radiografía y la oclusión dibujan
  // la escena otra vez y no necesitan otra.
  render.shadowMap.autoUpdate = false
}

export function montarElPabellon(escena: THREE.Scene, { sombras }: { sombras: boolean }): Pabellon {
  // La luz que rebota en las paredes y el techo: fría arriba, más oscura abajo.
  const cielo = new THREE.HemisphereLight(0xe4edf7, 0x46505c, 0.55)
  // La lámpara: luz fría de quirófano (unos 5000 K), un cono ancho con el borde muy difuminado y sombra suave.
  // `decay = 0` porque la intensidad no puede depender de las unidades del caso, que son metros o milímetros.
  const lampara = new THREE.SpotLight(0xf2f6ff, 2.4, 0, 0.55, 0.85, 0)
  lampara.castShadow = sombras
  lampara.shadow.mapSize.set(2048, 2048)
  // La penumbra, en texeles del mapa de sombras: la cabeza de la lámpara mide medio metro y no da bordes nítidos.
  lampara.shadow.radius = 4
  const satelite = new THREE.SpotLight(0xf6f8ff, 0.8, 0, 0.7, 0.9, 0)
  const frontal = new THREE.DirectionalLight(0xfff8f0, 0.45)
  escena.add(cielo, lampara, lampara.target, satelite, satelite.target, frontal, frontal.target)
  const mira = new THREE.Vector3()
  return {
    colocar(caja) {
      if (caja.isEmpty()) return
      const centro = caja.getCenter(new THREE.Vector3())
      const radio = Math.max(caja.getSize(new THREE.Vector3()).length() / 2, 1e-6)
      lampara.position.copy(centro).addScaledVector(new THREE.Vector3(0.35, 1, 0.55).normalize(), radio * 2.6)
      lampara.target.position.copy(centro)
      satelite.position.copy(centro).addScaledVector(new THREE.Vector3(-0.8, 0.9, 0.3).normalize(), radio * 2.8)
      satelite.target.position.copy(centro)
      const sombra = lampara.shadow.camera as THREE.PerspectiveCamera
      sombra.near = radio * 1.2
      sombra.far = radio * 4.5
      sombra.updateProjectionMatrix()
      // A la escala del modelo: un sesgo fijo valía para un caso en metros y hacía acné en uno en milímetros.
      lampara.shadow.bias = -0.0004
      lampara.shadow.normalBias = radio * 0.002
      mira.copy(centro)
    },
    seguirLaCamara(camara) {
      frontal.position.copy(camara.position)
      frontal.target.position.copy(mira)
    },
    liberar() {
      lampara.shadow.map?.dispose()
      escena.remove(cielo, lampara, lampara.target, satelite, satelite.target, frontal, frontal.target)
      cielo.dispose()
      lampara.dispose()
      satelite.dispose()
      frontal.dispose()
    },
  }
}

/**
 * La sala que reflejan los materiales: paredes verde claro, techo blanco con cuatro paneles de luz fría, suelo gris,
 * las dos cabezas de la lámpara sobre la mesa y una pantalla a un lado. Sustituye al `RoomEnvironment` de three, un
 * estudio gris y cálido que en el metal daba reflejos de sala de exposición y no de quirófano.
 *
 * Clara a propósito. La primera versión tenía las paredes de un verde apagado y el suelo casi negro, que es como se
 * ve un quirófano en una foto, y el acero, que no tiene color propio y es solo lo que refleja, salía negro: un
 * separador de Hohmann parecía de hierro pavonado. Lo que ve el tejido se baja aparte (`INTENSIDAD_DE_LA_SALA`).
 */
export function crearEntornoDePabellon(pmrem: THREE.PMREMGenerator): THREE.Texture {
  const sala = new THREE.Scene()
  const caja = new THREE.BoxGeometry(1, 1, 1)
  const disco = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 32)
  const materiales: THREE.Material[] = []
  const pieza = (geometria: THREE.BufferGeometry, color: THREE.ColorRepresentation, brillo: number, escala: THREE.Vector3Tuple, posicion: THREE.Vector3Tuple, lado: THREE.Side = THREE.FrontSide) => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(brillo), side: lado })
    materiales.push(material)
    const m = new THREE.Mesh(geometria, material)
    m.scale.set(...escala)
    m.position.set(...posicion)
    sala.add(m)
    return m
  }
  pieza(caja, 0x9dbbb3, 1.3, [14, 7, 14], [0, 2.5, 0], THREE.BackSide)
  pieza(caja, 0xdfe4e6, 1.2, [14, 0.05, 14], [0, 5.95, 0])
  pieza(caja, 0x737b7e, 1, [14, 0.1, 14], [0, -0.95, 0])
  for (const x of [-3.2, 3.2]) for (const z of [-3, 3]) pieza(caja, 0xeef4ff, 8, [2.8, 0.05, 1.6], [x, 5.88, z])
  pieza(disco, 0xf5f8ff, 22, [1.3, 1, 1.3], [0.9, 3.4, 0.8]).rotation.set(0.35, 0, -0.25)
  pieza(disco, 0xf5f8ff, 14, [1.1, 1, 1.1], [-1.4, 3.2, -0.5]).rotation.set(-0.2, 0, 0.35)
  pieza(caja, 0xcfe0ff, 2.2, [0.05, 1.1, 2.4], [6.9, 1.9, -1.5])
  const textura = pmrem.fromScene(sala, 0.04).texture
  caja.dispose()
  disco.dispose()
  for (const m of materiales) m.dispose()
  return textura
}

/** La sala en la escena entera, flojita: el metal la refleja con fuerza propia (`aplicarEntorno`), el tejido apenas. */
export function ponerLaSala(escena: THREE.Scene, entorno: THREE.Texture | null) {
  escena.environment = entorno
  escena.environmentIntensity = INTENSIDAD_DE_LA_SALA
}

export interface Oclusion {
  /** Calcula la oclusión de la vista actual. Va antes del dibujo principal. */
  calcular(render: THREE.WebGLRenderer): void
  /** La aplica sobre lo ya dibujado en el lienzo. Va después. */
  aplicar(render: THREE.WebGLRenderer): void
  /** El tamaño del lienzo en píxeles reales. */
  tamano(ancho: number, alto: number): void
  /** El radio de la oclusión va en unidades del caso. */
  escala(mmPorUnidad: number): void
  liberar(): void
}

/**
 * La oclusión ambiental (GTAO de three): los rincones, los surcos y lo que queda bajo un separador reciben menos luz
 * del entorno. Es lo que hace que una placa parezca apoyada en el hueso y no flotando delante.
 *
 * No va por `EffectComposer`, que dibuja la escena en texturas del tamaño del lienzo en coma flotante, y con
 * suavizado una más, cuatro veces mayor: con un lienzo de 16 millones de píxeles eran cientos de megabytes en la
 * tarjeta, que es justo lo que hace perder el contexto (P-004 E2). Aquí la escena se dibuja en el lienzo como
 * siempre, con su suavizado nativo, y la oclusión se calcula aparte a media resolución (`tamanoDeLaOclusion`) y se
 * multiplica encima. Multiplicarla sobre la imagen ya revelada no es lo correcto —oscurece también la luz directa—,
 * pero con la intensidad de aquí no se distingue, y cuesta una fracción.
 *
 * Lo que es interfaz (asas, cintas, el vello) y lo transparente no cuentan: no tapan nada. La cinta de una herida se
 * reconoce por su nombre, como en el resto del lienzo (`esDeInterfazDelModelo`): aquí se miraba solo la marca
 * `deInterfaz`, que ella no lleva, y entraba en el cálculo. No tiene normales, la oclusión la daba por enterrada y el
 * velo multiplicaba su rojo por casi cero: era la «línea negra que se queda» de los cortes (P-008 E1).
 */
export function crearOclusion(escena: THREE.Scene, camara: THREE.PerspectiveCamera): Oclusion {
  const gtao = new GTAOPass(escena, camara, 1, 1)
  gtao.output = GTAOPass.OUTPUT.Off
  gtao.blendIntensity = 1
  // `_overrideVisibility` esconde lo que no es malla mientras dibuja las normales; se esconde también lo de aquí.
  const interno = gtao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] }
  const esconderLasLineas = interno._overrideVisibility.bind(gtao)
  interno._overrideVisibility = () => {
    esconderLasLineas()
    escena.traverse((o) => {
      if (!o.visible) return
      const m = o as THREE.Mesh
      const material = m.isMesh ? m.material : null
      const transparente = Array.isArray(material) ? material.some((x) => x.transparent) : !!material?.transparent
      if (esDeInterfazDelModelo(o) || transparente) {
        o.visible = false
        interno._visibilityCache.push(o)
      }
    })
  }
  const velo = new THREE.ShaderMaterial({
    uniforms: { tOclusion: { value: gtao.pdRenderTarget.texture }, uIntensidad: { value: 0.85 } },
    vertexShader: 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n}',
    fragmentShader:
      'uniform sampler2D tOclusion;\nuniform float uIntensidad;\nvarying vec2 vUv;\nvoid main() {\n  float ao = texture2D( tOclusion, vUv ).r;\n  gl_FragColor = vec4( vec3( mix( 1.0, ao, uIntensidad ) ), 1.0 );\n}',
    // Multiplica el color de lo dibujado y deja su alfa: el fondo del lienzo es transparente y debe seguir siéndolo.
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.ZeroFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  })
  const quad = new FullScreenQuad(velo)
  return {
    calcular(render) {
      // Con la salida apagada (`OUTPUT.Off`) no lee ni escribe los búferes de un compositor: se le pasan vacíos.
      gtao.render(render, null as unknown as THREE.WebGLRenderTarget, null as unknown as THREE.WebGLRenderTarget, 0, false)
      render.setRenderTarget(null)
    },
    aplicar(render) {
      const antes = render.autoClear
      render.autoClear = false
      quad.render(render)
      render.autoClear = antes
    },
    tamano(ancho, alto) {
      const t = tamanoDeLaOclusion(ancho, alto)
      gtao.setSize(t.ancho, t.alto)
    },
    escala(mmPorUnidad) {
      const unidad = 1 / (mmPorUnidad || 1000)
      // Un centímetro y medio: lo que hay entre dos músculos, o entre el hueso y una placa.
      gtao.updateGtaoMaterial({ radius: 15 * unidad, thickness: 6 * unidad, distanceExponent: 1.5, scale: 1, samples: 16 })
      gtao.updatePdMaterial({ radius: 6, rings: 2, samples: 16 })
    },
    liberar() {
      gtao.dispose()
      velo.dispose()
      quad.dispose()
    },
  }
}
