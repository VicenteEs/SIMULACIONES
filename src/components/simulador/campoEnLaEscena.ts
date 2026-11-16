import * as THREE from 'three'
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ruta } from '@/lib/rutas'
import type { Vec3 } from '@/lib/posicionDelPaciente'
import {
  COLORES_DEL_PANO,
  PANO_POR_OMISION,
  abrirLaVentana,
  abrirPorDondeCuelga,
  acotarLaZona,
  afinarElBorde,
  alturaEn,
  cenirAlBorde,
  colchonAlDarLaVuelta,
  elColchonTapa,
  huellaDeLoSubido,
  indexarLaTela,
  laTelaTapa,
  lechoConLaPiel,
  leerElManifiesto,
  leerElRelieve,
  levantarLaTela,
  posturaDeLoCosido,
  posturaDelColchon,
  radioDeLaVentana,
  rellenarElLecho,
  zonaAutomatica,
  type Decubito,
  type FormaDelRelieve,
  type IndiceDeLaTela,
  type ManifiestoDelCampo,
  type PanoDelCaso,
  type Postura,
  type QueTapa,
  type Relieve,
  type RelieveConLaPiel,
  type Tela,
  type ZonaDelPano,
} from '@/lib/campoQuirurgico'

/**
 * El campo quirúrgico en la escena (P-014): el colchón, la sábana y el paño con su ventana.
 *
 * Todo cuelga de un grupo que va **en las coordenadas del cuerpo** del atlas, que es como llegan las mallas de
 * `public/pabellon/`. Lo único que se mueve es el grupo: se corre lo mismo que el exportador y el lienzo
 * corrieron el modelo para centrarlo, y con eso el colchón queda debajo de la rodilla y no debajo del ombligo.
 *
 * El grupo cuelga de la escena y no del modelo, y no es un detalle. De la raíz del modelo cuelga lo que el
 * residente toca: el lienzo lanza contra ella los rayos del cursor, la encuadra, la recorre para encender capas
 * y la guarda en la sesión. Nada de eso debe encontrarse con un colchón.
 *
 * La aritmética —la ventana, el borde ceñido, qué tapa el paño, la vuelta— está en `lib/campoQuirurgico.ts` y
 * se prueba sin pantalla. Aquí queda lo que necesita una tarjeta gráfica.
 */

export interface OpcionesDelCampo {
  escena: THREE.Scene
  /** El del lienzo, con sus decodificadores: las telas viajan comprimidas. */
  cargador: GLTFLoader
  /** Con la calidad rebajada (tras perder el contexto gráfico) no se piden texturas ni sombras. */
  conTexturas: boolean
  sombras: boolean
  /** Lo más que la tarjeta filtra una textura vista de canto. */
  anisotropia: number
  pedirDibujo: () => void
  /** El campo no se pudo cargar. El simulador sigue sin él; esto es para que no falte en silencio. */
  alFallar: (motivo: string) => void
}

export interface DatosParaAcostar {
  /** Lo que hay que sumarle a un punto del cuerpo para llevarlo a la escena. */
  delCuerpoALaEscena: THREE.Vector3
  /** La caja de lo recortado —lo que no es piel ni fascia—, en la escena. De ella sale la zona automática. */
  caja: THREE.Box3 | null
  decubito: Decubito
  pano: PanoDelCaso
}

export interface CampoEnLaEscena {
  readonly grupo: THREE.Group
  /** Acuesta al paciente. Se cumple con `true` cuando el campo está a la vista y con `false` si no se pudo. */
  acostar(datos: DatosParaAcostar): Promise<boolean>
  /** Quita el campo de la vista —el caso apagó el paño—. Lo traído se guarda: volver a acostar no lo pide otra vez. */
  retirar(): void
  /** El paño del caso: su color y su zona. */
  ponerElPano(pano: PanoDelCaso): void
  /**
   * La piel del paciente tal como está ahora en la escena, y la caja —en el mundo— de donde se abultó sobre lo
   * que la empuja; `null` si en ninguna parte. El paño se ciñe al cuerpo del atlas, y ahí la piel ya no es la del
   * atlas: con esto se apoya en la de verdad. Se llama cada vez que el abultamiento cambia.
   */
  seguirLaPiel(pieles: readonly THREE.Mesh[], abultada: THREE.Box3 | null): void
  /** Lo quita y lo pone el residente, desde «Capas». Sin paño no hay nada que tape. */
  mostrarElPano(visible: boolean): void
  elPanoSeVe(): boolean
  /** La zona que queda descubierta ahora mismo, en el cuerpo; `null` si no hay ventana. */
  zona(): ZonaDelPano | null
  /** La que saldría sola, de la caja de lo recortado. */
  zonaAutomatica(): ZonaDelPano | null
  /**
   * Un punto del plano del cuerpo, llevado a la escena y posado sobre el lecho —la tela ceñida al borde de la
   * ventana—, un poco por encima para que lo dibujado ahí no se hunda en ella. Con él se pinta el marco del
   * editor. `null` sin campo.
   */
  sobreElLecho(x: number, y: number): THREE.Vector3 | null
  /** Hasta dónde llega el relieve del decúbito actual: fuera de él no hay paño que abrir. */
  limites(): FormaDelRelieve | null
  /**
   * Qué tapa lo que este rayo tocó a esa distancia: el paño, el colchón, o que al paciente se le está dando la
   * vuelta. `null` si está a la vista y se puede tocar.
   */
  queTapa(rayo: THREE.Ray, distancia: number): QueTapa | null
  /** Cómo está tumbado; `null` mientras no hay campo. */
  decubito(): Decubito | null
  /** Hacia dónde queda «arriba» para el paciente acostado, y hacia dónde su cabeza, en la escena. */
  arriba(): THREE.Vector3 | null
  cabeza(): THREE.Vector3 | null
  /**
   * El colchón en la escena, para colgarle lo que es de la sala —la base de la camilla, el suelo, la mesa de la
   * arsenalera (`mesaEnLaEscena.ts`)—: rueda con él cuando al paciente se le da la vuelta. `null` hasta que llega.
   */
  colchon(): THREE.Object3D | null
  /** La distancia de un punto de la escena al plano del colchón, medida hacia el paciente. */
  alturaSobreElColchon(punto: THREE.Vector3): number | null
  /** Trae el otro decúbito. Se cumple cuando se le puede dar la vuelta al paciente. */
  preparar(decubito: Decubito): Promise<boolean>
  /** Un instante de la vuelta, con `t` de 0 a 1. El paño no se ve mientras dura. */
  enLaVuelta(t: number, hasta: Decubito, pivote: THREE.Vector3, eje: THREE.Vector3, despeje: number, sentido: 1 | -1): void
  /** Deja al paciente en ese decúbito, con todo en su sitio. */
  ponerElDecubito(decubito: Decubito): void
  liberar(): void
}

interface DeUnDecubito {
  sabana: THREE.Mesh
  pano: THREE.Mesh
  /** La tela entera, como llegó del archivo: de ella se corta cada ventana. */
  tela: Tela
  relieve: Relieve
  /** El mismo relieve con el lecho relleno más allá del colchón: contra este se ciñe la tela. */
  paraCenir: Relieve
}

/** El ancho de la tira de refuerzo que rodea la ventana de un paño fenestrado. */
const ANCHO_DE_LA_TIRA = 0.032

/** Cuánto por encima del lecho va el marco del editor: lo justo para pasar del claro de la tela ceñida. */
const ALTO_DEL_MARCO = 0.004

/**
 * Lo menos que pasa entre dos paños rehechos porque la piel cambió. Mientras se arrastra un fragmento la piel se
 * abulta distinto en cada cuadro, y rehacer el paño cuesta un cuadro entero: con esto el arrastre va a su paso y
 * el paño lo sigue ocho veces por segundo, que para una tela es de sobra.
 */
const ESPERA_ENTRE_PANOS = 120
/** Lo que se agranda la caja del bulto al buscar la piel: el triángulo que cruza su borde también cuenta. */
const MARGEN_DE_LA_CAJA = 0.006

const vector = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2])
const tupla = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z]

/** Una geometría del archivo, como tela: posiciones, UV y triángulos en arreglos propios. */
function telaDe(malla: THREE.Mesh): Tela {
  const geometria = malla.geometry
  const posicion = geometria.getAttribute('position')
  const uv = geometria.getAttribute('uv')
  const posiciones = new Float32Array(posicion.count * 3)
  const coordenadas = new Float32Array(posicion.count * 2)
  // Con `getX` y no copiando el arreglo: un atributo puede venir intercalado con otros o en enteros normalizados,
  // y `array` a secas daría entonces números que no son metros.
  const punto = new THREE.Vector3()
  malla.updateWorldMatrix(true, false)
  for (let i = 0; i < posicion.count; i++) {
    punto.fromBufferAttribute(posicion, i).applyMatrix4(malla.matrixWorld)
    posiciones.set([punto.x, punto.y, punto.z], i * 3)
    if (uv) coordenadas.set([uv.getX(i), uv.getY(i)], i * 2)
  }
  const indice = geometria.getIndex()
  const indices = new Uint32Array(indice ? indice.count : posicion.count)
  for (let k = 0; k < indices.length; k++) indices[k] = indice ? indice.getX(k) : k
  return { posiciones, uv: coordenadas, indices }
}

/**
 * Los triángulos de la piel que tocan una caja del mundo, en las coordenadas del cuerpo: nueve números cada uno.
 *
 * La piel puede ser el cuerpo entero y el bulto ocupa un palmo. La caja se lleva a las coordenadas de la malla
 * para descartar los vértices con seis comparaciones, sin pasarlos por su matriz; solo los triángulos que
 * quedan se llevan al cuerpo.
 */
function triangulosEnLaCaja(mallas: readonly THREE.Mesh[], caja: THREE.Box3, delCuerpoALaEscena: THREE.Vector3): number[] {
  const salida: number[] = []
  const local = new THREE.Box3()
  const inversa = new THREE.Matrix4()
  const punto = new THREE.Vector3()
  for (const malla of mallas) {
    const posicion = malla.geometry.getAttribute('position')
    if (!posicion) continue
    malla.updateWorldMatrix(true, false)
    local.copy(caja).expandByScalar(MARGEN_DE_LA_CAJA).applyMatrix4(inversa.copy(malla.matrixWorld).invert())
    const dentro = new Uint8Array(posicion.count)
    let alguno = false
    for (let i = 0; i < posicion.count; i++) {
      const x = posicion.getX(i)
      if (x < local.min.x || x > local.max.x) continue
      const y = posicion.getY(i)
      if (y < local.min.y || y > local.max.y) continue
      const z = posicion.getZ(i)
      if (z < local.min.z || z > local.max.z) continue
      dentro[i] = 1
      alguno = true
    }
    if (!alguno) continue
    const indice = malla.geometry.getIndex()
    const cuantos = indice ? indice.count : posicion.count
    for (let k = 0; k + 2 < cuantos; k += 3) {
      const a = indice ? indice.getX(k) : k
      const b = indice ? indice.getX(k + 1) : k + 1
      const c = indice ? indice.getX(k + 2) : k + 2
      if (!dentro[a] && !dentro[b] && !dentro[c]) continue
      for (const v of [a, b, c]) {
        punto.fromBufferAttribute(posicion, v).applyMatrix4(malla.matrixWorld).sub(delCuerpoALaEscena)
        salida.push(punto.x, punto.y, punto.z)
      }
    }
  }
  return salida
}

function geometriaDe(tela: Tela): THREE.BufferGeometry {
  const geometria = new THREE.BufferGeometry()
  geometria.setAttribute('position', new THREE.BufferAttribute(tela.posiciones, 3))
  geometria.setAttribute('uv', new THREE.BufferAttribute(tela.uv, 2))
  geometria.setIndex(new THREE.BufferAttribute(tela.indices, 1))
  geometria.computeVertexNormals()
  geometria.computeBoundingSphere()
  return geometria
}

/**
 * Añade a un material su segunda normal: la del tejido, que se repite, encima de la de los pliegues, que es
 * única. Se mezclan sumando las pendientes y multiplicando las alturas, que es lo que hace también la vista
 * previa de Blender (`scripts/pabellon/vistas.py`): la foto y el navegador parten de la misma cuenta.
 *
 * El trozo del sombreador se saca del propio three y se le cambia una línea. Si una versión futura la escribe de
 * otra forma, el cambio no entra, la tela sale sin el grano del tejido y nada se rompe: por eso se comprueba y no
 * se da por hecho.
 */
function conDetalle(material: THREE.MeshStandardMaterial, detalle: THREE.Texture, repeticiones: number, extra?: (sombreador: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }) => void) {
  const ancla = 'mapN.xy *= normalScale;'
  const original = THREE.ShaderChunk.normal_fragment_maps
  const cambiado = original.replace(
    ancla,
    `vec3 detalleN = texture2D( uDetalle, vNormalMapUv * uRepeticionesDelDetalle ).xyz * 2.0 - 1.0;\n\tmapN = normalize( vec3( mapN.xy + detalleN.xy, mapN.z * detalleN.z ) );\n\t${ancla}`,
  )
  material.onBeforeCompile = (sombreador) => {
    if (cambiado !== original) {
      sombreador.uniforms.uDetalle = { value: detalle }
      sombreador.uniforms.uRepeticionesDelDetalle = { value: repeticiones }
      sombreador.fragmentShader = sombreador.fragmentShader
        .replace('#include <normalmap_pars_fragment>', '#include <normalmap_pars_fragment>\nuniform sampler2D uDetalle;\nuniform float uRepeticionesDelDetalle;')
        .replace('#include <normal_fragment_maps>', cambiado)
    }
    extra?.(sombreador)
  }
  // Sin esto three reutilizaría para este material el programa de otro igual pero sin el cambio.
  material.customProgramCacheKey = () => `campo-${repeticiones}-${extra ? 'tira' : 'liso'}`
}

export function crearElCampo(opciones: OpcionesDelCampo): CampoEnLaEscena {
  const { escena, cargador, conTexturas, sombras, anisotropia, pedirDibujo, alFallar } = opciones
  const grupo = new THREE.Group()
  grupo.name = 'campo-quirurgico'
  grupo.visible = false
  escena.add(grupo)

  let vivo = true
  let manifiesto: ManifiestoDelCampo | null = null
  let colchon: THREE.Group | null = null
  const cargados: Partial<Record<Decubito, DeUnDecubito>> = {}
  const enCamino: Partial<Record<Decubito, Promise<DeUnDecubito | null>>> = {}
  let actual: Decubito | null = null
  let pano: PanoDelCaso = PANO_POR_OMISION
  let panoALaVista = true
  let enVuelta = false
  /** La caja de lo recortado, ya en el cuerpo. */
  let caja: { min: Vec3; max: Vec3 } | null = null
  let zonaActual: ZonaDelPano | null = null
  let indice: IndiceDeLaTela | null = null
  /** La piel de la escena y dónde se abultó: lo último que dijo el lienzo. */
  let piel: { mallas: readonly THREE.Mesh[]; abultada: THREE.Box3 | null } | null = null
  /** El relieve del decúbito actual con esa piel encima; `null` si no pasa del atlas en ninguna parte. */
  let conLaPiel: RelieveConLaPiel | null = null
  /** Hay que volver a mirar la piel: cambió ella, o cambió el decúbito y lo alto es ahora el otro lado. */
  let pielPorMirar = false
  /** La huella de lo subido con que se cortó el paño que hay puesto, y la ventana que se le cortó. */
  let huellaDelPano = ''
  let zonaCortada: ZonaDelPano | null = null
  let ultimoPano = 0
  let panoPendiente: ReturnType<typeof setTimeout> | null = null

  // ------------------------------------------------------------------------------------------ materiales

  const texturas: THREE.Texture[] = []
  const cargadorDeTexturas = new THREE.TextureLoader()
  /**
   * Un mapa de normales de `public/pabellon/`. Van en el convenio de glTF —el verde hacia arriba de la imagen y
   * la imagen sin voltear—, que es el de las UV que traen las mallas: por eso `flipY` apagado aquí y la `y` de
   * `normalScale` negativa en los materiales, las dos cosas que `GLTFLoader` hace con los suyos.
   */
  const normales = (archivo: string, repetir = 1): THREE.Texture | null => {
    if (!conTexturas) return null
    const textura = cargadorDeTexturas.load(ruta(`/pabellon/${archivo}`), () => {
      if (vivo) pedirDibujo()
    })
    textura.flipY = false
    textura.colorSpace = THREE.NoColorSpace
    textura.wrapS = textura.wrapT = THREE.RepeatWrapping
    textura.repeat.set(repetir, repetir)
    textura.anisotropy = Math.max(1, Math.min(8, anisotropia))
    texturas.push(textura)
    return textura
  }
  const pliegues = normales('tela-pliegues.webp')
  const tejido = normales('tela-relieve.webp')
  const tira = normales('colchon-pared.webp')
  const grano = normales('colchon-grano.webp')
  const granoDeLasTapas = normales('colchon-grano.webp', 3)

  // La ventana, para el sombreador del paño: centro y medio tamaño, radio de las esquinas y si la hay.
  const ventana = { uVentana: { value: new THREE.Vector4() }, uRadioDeLaVentana: { value: 0 }, uHayVentana: { value: 0 } }

  /**
   * La tela de un no tejido de pabellón: mate, con el brillo sedoso de las fibras a contraluz y sin nada de
   * metal. Por las dos caras, porque quien asoma la cámara bajo el paño tiene que ver tela y no el vacío.
   */
  const tela = (masOscuro: number, conTira: boolean) => {
    const material = new THREE.MeshPhysicalMaterial({ roughness: 0.82, metalness: 0, sheen: 0.35, sheenRoughness: 0.55, side: THREE.DoubleSide })
    material.userData.masOscuro = masOscuro
    if (pliegues && tejido) {
      material.normalMap = pliegues
      material.normalScale.set(1, -1)
      conDetalle(
        material,
        tejido,
        manifiestoDeTextura().repeticionesDelRelieve,
        conTira
          ? (sombreador) => {
              // La tira de refuerzo que rodea la ventana: la misma tela, un punto más clara y más lisa, como la
              // franja adhesiva de un paño fenestrado. Se dibuja con la distancia al borde de la ventana, la
              // misma cuenta que `distanciaALaVentana`, sobre la posición del vértice —que está en el cuerpo—.
              Object.assign(sombreador.uniforms, ventana)
              sombreador.vertexShader = sombreador.vertexShader
                .replace('#include <common>', '#include <common>\nvarying vec2 vEnElCuerpo;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEnElCuerpo = position.xy;')
              sombreador.fragmentShader = sombreador.fragmentShader
                .replace(
                  '#include <common>',
                  '#include <common>\nvarying vec2 vEnElCuerpo;\nuniform vec4 uVentana;\nuniform float uRadioDeLaVentana;\nuniform float uHayVentana;\nfloat tiraDeLaVentana() {\n\tvec2 q = abs( vEnElCuerpo - uVentana.xy ) - ( uVentana.zw - uRadioDeLaVentana );\n\tfloat d = length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - uRadioDeLaVentana;\n\treturn ( 1.0 - smoothstep( ' +
                    `${(ANCHO_DE_LA_TIRA - 0.0015).toFixed(4)}, ${ANCHO_DE_LA_TIRA.toFixed(4)}` +
                    ', d ) ) * uHayVentana;\n}',
                )
                .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.14 + 0.03, tiraDeLaVentana() );')
                .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.6, tiraDeLaVentana() );')
            }
          : undefined,
      )
    }
    return material
  }
  // El manifiesto llega después de crear los materiales; hasta entonces valen los números con que se generó.
  const manifiestoDeTextura = () => manifiesto?.textura ?? { lado: 2.4, repeticionesDelRelieve: 50, repeticionesDelGrano: 3 }
  const materialDelPano = tela(1, true)
  // La sábana es del mismo juego que el paño, un tono más apagada: lavada cien veces.
  const materialDeLaSabana = tela(0.82, false)
  const colorear = () => {
    const color = COLORES_DEL_PANO.find((c) => c.valor === pano.color) ?? COLORES_DEL_PANO[0]
    for (const material of [materialDelPano, materialDeLaSabana]) {
      material.color.set(color.tela).multiplyScalar(material.userData.masOscuro as number)
      material.sheenColor.set(color.tela).lerp(new THREE.Color(0xffffff), 0.6)
    }
  }
  colorear()

  // El forro del colchón: poliuretano negro, satinado, con su grano. La pared lleva además la tira del ribete,
  // las costuras y la solapa de la cremallera.
  const forro = () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.105, 0.11, 0.125).convertSRGBToLinear(), roughness: 0.46, metalness: 0 })
  const materialDeLaPared = forro()
  const materialDeLasTapas = forro()
  if (tira && grano) {
    materialDeLaPared.normalMap = tira
    materialDeLaPared.normalScale.set(1, -1)
    conDetalle(materialDeLaPared, grano, manifiestoDeTextura().repeticionesDelGrano)
  }
  if (granoDeLasTapas) {
    materialDeLasTapas.normalMap = granoDeLasTapas
    materialDeLasTapas.normalScale.set(1, -1)
  }

  const conSombra = (malla: THREE.Mesh) => {
    malla.castShadow = sombras
    malla.receiveShadow = sombras
    return malla
  }

  // ------------------------------------------------------------------------------------------- la carga

  const traer = async (direccion: string): Promise<Response> => {
    const respuesta = await fetch(ruta(direccion))
    if (!respuesta.ok) throw new Error(`${direccion} respondió ${respuesta.status}`)
    return respuesta
  }

  let base: Promise<boolean> | null = null
  /** El manifiesto y el colchón: lo que es igual en los dos decúbitos. Se pide una vez. */
  const cargarLaBase = (): Promise<boolean> => {
    base ??= (async () => {
      const leido = leerElManifiesto(await (await traer('/pabellon/manifiesto.json')).json())
      if (!leido) throw new Error('el manifiesto del campo no se entiende')
      const gltf = await cargador.loadAsync(ruta(`/pabellon/${leido.colchon.modelo}`))
      if (!vivo) return false
      manifiesto = leido
      colchon = new THREE.Group()
      colchon.name = 'colchon'
      const piezas: THREE.Mesh[] = []
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) piezas.push(o as THREE.Mesh)
      })
      for (const pieza of piezas) {
        ;(pieza.material as THREE.Material).dispose()
        pieza.material = pieza.name.includes('pared') ? materialDeLaPared : materialDeLasTapas
        colchon.add(conSombra(pieza))
      }
      grupo.add(colchon)
      return true
    })()
    return base
  }

  const cargarDecubito = (decubito: Decubito): Promise<DeUnDecubito | null> => {
    enCamino[decubito] ??= (async () => {
      if (!(await cargarLaBase()) || !manifiesto) return null
      const dato = manifiesto.decubitos[decubito]
      const [gltf, bytes] = await Promise.all([
        cargador.loadAsync(ruta(`/pabellon/${dato.modelo}`)),
        traer(`/pabellon/${dato.relieve}`).then((r) => r.arrayBuffer()),
      ])
      if (!vivo) return null
      const relieve = leerElRelieve(bytes, manifiesto.relieve, dato.signo)
      if (!relieve) throw new Error(`el relieve de ${decubito} no mide lo que dice el manifiesto`)
      gltf.scene.updateMatrixWorld(true)
      const delArchivo = (nombre: string): THREE.Mesh => {
        const malla = gltf.scene.getObjectByName(nombre) as THREE.Mesh | undefined
        if (!malla?.isMesh) throw new Error(`a ${dato.modelo} le falta «${nombre}»`)
        return malla
      }
      // Las dos se rehacen con su geometría en limpio: la del archivo puede venir con una matriz en el nodo, y
      // aquí todo tiene que estar en el cuerpo sin más cuentas.
      const telaDeLaSabana = telaDe(delArchivo('sabana'))
      const telaDelPano = telaDe(delArchivo('pano'))
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      })
      const sabana = conSombra(new THREE.Mesh(geometriaDe(telaDeLaSabana), materialDeLaSabana))
      sabana.name = `sabana-${decubito}`
      const mallaDelPano = conSombra(new THREE.Mesh(new THREE.BufferGeometry(), materialDelPano))
      mallaDelPano.name = `pano-${decubito}`
      sabana.visible = mallaDelPano.visible = false
      grupo.add(sabana, mallaDelPano)
      const listo: DeUnDecubito = { sabana, pano: mallaDelPano, tela: telaDelPano, relieve, paraCenir: rellenarElLecho(relieve) }
      cargados[decubito] = listo
      return listo
    })()
    return enCamino[decubito]!
  }

  // ----------------------------------------------------------------------------------------- la ventana

  const zonaQueSaldriaSola = (): ZonaDelPano | null => {
    const d = actual ? cargados[actual] : null
    if (!d || !caja) return null
    return acotarLaZona(zonaAutomatica(caja, d.relieve), d.relieve)
  }

  /** Pone al día `conLaPiel` con la piel que dijo el lienzo, para el decúbito actual. */
  const mirarLaPiel = () => {
    pielPorMirar = false
    conLaPiel = null
    const d = actual ? cargados[actual] : null
    if (!d || !piel?.abultada || piel.abultada.isEmpty()) return
    conLaPiel = lechoConLaPiel(d.paraCenir, triangulosEnLaCaja(piel.mallas, piel.abultada, grupo.position))
  }

  /** Corta la ventana en el paño del decúbito actual y lo ciñe a su borde. */
  const rehacerElPano = () => {
    const d = actual ? cargados[actual] : null
    if (!d) return
    if (panoPendiente) clearTimeout(panoPendiente)
    panoPendiente = null
    if (pielPorMirar) mirarLaPiel()
    const relieve = conLaPiel ?? d.paraCenir
    // La tela del archivo cayó sobre el cuerpo del atlas: donde la piel de la escena quedó más alta se levanta
    // antes de nada, y lo que sigue trabaja ya sobre el cuerpo que hay.
    const entera = conLaPiel ? levantarLaTela(d.tela, conLaPiel) : d.tela
    const pedida = pano.zona ? acotarLaZona(pano.zona, d.relieve) : zonaQueSaldriaSola()
    // Lo que se corta no es siempre lo pedido: por donde la ventana se sale del colchón, el paño se abre hasta
    // el borde. Al editor se le sigue contando la pedida, que es el marco que el médico movió.
    const zona = pedida && manifiesto && actual ? abrirPorDondeCuelga(pedida, manifiesto.decubitos[actual], manifiesto.colchon) : pedida
    let cortada = entera
    if (zona) {
      const radio = radioDeLaVentana(zona)
      cortada = abrirLaVentana(entera, zona, radio)
      // Si la ventana no toca la tela vuelve la misma, y esa no se retoca: es de la que se cortan todas.
      if (cortada !== entera) {
        // Afinar antes de ceñir: con los triángulos como llegan, la tela ceñida corta por dentro de la piel
        // donde el miembro tiene la cara empinada.
        cortada = afinarElBorde(cortada, zona, relieve, radio)
        cenirAlBorde(cortada, zona, relieve, radio)
      }
      ventana.uVentana.value.set((zona.xMin + zona.xMax) / 2, (zona.yMin + zona.yMax) / 2, (zona.xMax - zona.xMin) / 2, (zona.yMax - zona.yMin) / 2)
      ventana.uRadioDeLaVentana.value = radio
    }
    const hayVentana = !!zona && cortada !== entera
    ventana.uHayVentana.value = hayVentana ? 1 : 0
    zonaActual = pedida
    zonaCortada = hayVentana ? zona : null
    huellaDelPano = huellaDeLoSubido(conLaPiel, zonaCortada)
    ultimoPano = performance.now()
    d.pano.geometry.dispose()
    // Una copia de las posiciones cuando es la del archivo: la geometría es de la tarjeta y la tela original no se suelta con ella.
    d.pano.geometry = geometriaDe(cortada === d.tela ? { ...cortada, posiciones: cortada.posiciones.slice() } : cortada)
    indice = indexarLaTela(cortada)
  }

  /** Rehace el paño porque la piel cambió debajo de él: ya, o cuando haya pasado la espera desde el último. */
  const rehacerPorLaPiel = () => {
    if (panoPendiente) return
    const falta = ESPERA_ENTRE_PANOS - (performance.now() - ultimoPano)
    if (falta <= 0) {
      rehacerElPano()
      pedirDibujo()
      return
    }
    panoPendiente = setTimeout(() => {
      panoPendiente = null
      if (!vivo || !actual || enVuelta) return
      rehacerElPano()
      pedirDibujo()
    }, falta)
  }

  const colocarElColchon = (postura: Postura) => {
    if (!colchon) return
    colchon.position.set(...postura.posicion)
    colchon.quaternion.set(...postura.giro)
  }
  const colocarLoCosido = (malla: THREE.Mesh, postura: Postura | null) => {
    if (postura) {
      malla.position.set(...postura.posicion)
      malla.quaternion.set(...postura.giro)
    } else {
      malla.position.set(0, 0, 0)
      malla.quaternion.identity()
    }
  }

  /** Enseña lo de un decúbito y esconde lo del otro, con cada cosa en su sitio. */
  const mostrar = () => {
    if (!manifiesto || !actual) return
    for (const decubito of ['supino', 'prono'] as const) {
      const d = cargados[decubito]
      if (!d) continue
      d.sabana.visible = decubito === actual
      d.pano.visible = decubito === actual && panoALaVista && !enVuelta
      colocarLoCosido(d.sabana, null)
    }
    colocarElColchon(posturaDelColchon(manifiesto.decubitos[actual]))
    grupo.visible = true
    pedirDibujo()
  }

  const fallar = (error: unknown) => {
    if (!vivo) return
    grupo.visible = false
    alFallar(error instanceof Error ? error.message : String(error))
  }

  return {
    grupo,

    async acostar(datos) {
      grupo.position.copy(datos.delCuerpoALaEscena)
      const alCuerpo = (p: THREE.Vector3): Vec3 => tupla(p.clone().sub(datos.delCuerpoALaEscena))
      caja = datos.caja && !datos.caja.isEmpty() ? { min: alCuerpo(datos.caja.min), max: alCuerpo(datos.caja.max) } : null
      pano = datos.pano
      colorear()
      try {
        const d = await cargarDecubito(datos.decubito)
        if (!vivo || !d) return false
        actual = datos.decubito
        // El grupo pudo moverse y el decúbito cambiar: la piel se mira otra vez desde donde queda ahora.
        pielPorMirar = true
        rehacerElPano()
        mostrar()
        return true
      } catch (error) {
        fallar(error)
        return false
      }
    },

    retirar() {
      enVuelta = false
      grupo.visible = false
      pedirDibujo()
    },

    ponerElPano(nuevo) {
      const cambiaLaZona = JSON.stringify(nuevo.zona) !== JSON.stringify(pano.zona)
      pano = nuevo
      colorear()
      if (cambiaLaZona && actual && !enVuelta) rehacerElPano()
      pedirDibujo()
    },

    seguirLaPiel(pieles, abultada) {
      piel = { mallas: pieles, abultada: abultada ? abultada.clone() : null }
      pielPorMirar = true
      // Sin campo todavía, o a media vuelta, queda anotado: el paño se corta al acostar y al acabar de girar.
      if (!actual || !cargados[actual] || enVuelta) return
      mirarLaPiel()
      // Lo que cambia dentro de la ventana no toca a la tela: reducir una fractura a la vista no rehace nada.
      if (huellaDeLoSubido(conLaPiel, zonaCortada) !== huellaDelPano) rehacerPorLaPiel()
    },

    mostrarElPano(visible) {
      panoALaVista = visible
      const d = actual ? cargados[actual] : null
      if (d) d.pano.visible = visible && !enVuelta
      pedirDibujo()
    },

    elPanoSeVe: () => grupo.visible && panoALaVista && !enVuelta && !!actual && !!cargados[actual],

    zona: () => (ventana.uHayVentana.value ? zonaActual : null),
    zonaAutomatica: zonaQueSaldriaSola,

    sobreElLecho(x, y) {
      const d = actual ? cargados[actual] : null
      if (!d || !grupo.visible) return null
      // Fuera del relieve no hay altura que leer: vale la del colchón, que es donde descansa la tela ahí.
      // Sobre el lecho de ahora, con la piel de la escena: el marco va por encima del bulto, como la tela.
      const relieve = conLaPiel ?? d.paraCenir
      const altura = alturaEn(relieve, relieve.lecho, x, y)
      const z = d.relieve.signo * ((Number.isFinite(altura) ? altura : 0) + ALTO_DEL_MARCO)
      return new THREE.Vector3(x, y, z).add(grupo.position)
    },
    limites: () => (actual ? (cargados[actual]?.relieve ?? null) : null),

    queTapa(rayo, distancia) {
      if (!manifiesto || !actual || !grupo.visible) return null
      // Mientras rueda no se opera: el colchón y el paño no están donde van a quedar.
      if (enVuelta) return 'vuelta'
      const o = grupo.position
      const origen: Vec3 = [rayo.origin.x - o.x, rayo.origin.y - o.y, rayo.origin.z - o.z]
      const direccion = tupla(rayo.direction)
      if (elColchonTapa(manifiesto.decubitos[actual], manifiesto.colchon, origen, direccion, distancia)) return 'colchon'
      if (indice && panoALaVista && laTelaTapa(indice, origen, direccion, distancia)) return 'pano'
      return null
    },

    decubito: () => (grupo.visible ? actual : null),

    arriba() {
      if (!colchon || !grupo.visible) return null
      // El colchón viene con su normal en Y: girada como él, es el «arriba» del paciente también a media vuelta.
      return new THREE.Vector3(0, 1, 0).applyQuaternion(colchon.quaternion)
    },
    cabeza() {
      if (!colchon || !grupo.visible) return null
      return new THREE.Vector3(0, 0, -1).applyQuaternion(colchon.quaternion)
    },
    colchon: () => colchon,

    alturaSobreElColchon(punto) {
      if (!manifiesto || !actual || !grupo.visible) return null
      const marco = manifiesto.decubitos[actual]
      return punto.clone().sub(grupo.position).sub(vector(marco.origen)).dot(vector(marco.normal))
    },

    async preparar(decubito) {
      try {
        return !!(await cargarDecubito(decubito))
      } catch (error) {
        fallar(error)
        return false
      }
    },

    enLaVuelta(t, hasta, pivote, eje, despeje, sentido) {
      const desde = actual
      if (!manifiesto || !desde || desde === hasta) return
      enVuelta = true
      const marcos = manifiesto.decubitos
      const postura = colchonAlDarLaVuelta(t, marcos[desde], marcos[hasta], tupla(pivote.clone().sub(grupo.position)), tupla(eje), despeje, sentido)
      colocarElColchon(postura)
      // La sábana va cosida al colchón, y a media vuelta se cambia por la del otro decúbito, que tiene la huella
      // del otro lado del cuerpo. Es el instante en que el paciente pasa de canto por delante de ella y en que
      // todo va más deprisa: el cambio no se llega a ver.
      const laQueSeVe = t < 0.5 || !cargados[hasta] ? desde : hasta
      for (const decubito of ['supino', 'prono'] as const) {
        const d = cargados[decubito]
        if (!d) continue
        d.pano.visible = false
        d.sabana.visible = decubito === laQueSeVe
        if (d.sabana.visible) colocarLoCosido(d.sabana, posturaDeLoCosido(postura, marcos[decubito]))
      }
      pedirDibujo()
    },

    ponerElDecubito(decubito) {
      enVuelta = false
      if (!cargados[decubito]) return
      const cambia = actual !== decubito
      actual = decubito
      // Boca abajo lo alto es la otra cara: la piel se mira de nuevo. Y si cambió durante la vuelta, también.
      if (cambia) pielPorMirar = true
      if (cambia || pielPorMirar) rehacerElPano()
      mostrar()
    },

    liberar() {
      vivo = false
      if (panoPendiente) clearTimeout(panoPendiente)
      panoPendiente = null
      piel = null
      escena.remove(grupo)
      grupo.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry.dispose()
      })
      for (const material of [materialDelPano, materialDeLaSabana, materialDeLaPared, materialDeLasTapas]) material.dispose()
      for (const textura of texturas) textura.dispose()
      indice = null
    },
  }
}
