'use client'

import React, { Suspense, useImperativeHandle, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, Bounds, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Group } from 'three'
import type { OrbitControls as ControlesOrbita } from 'three-stdlib'

/**
 * Visor de modelos tridimensionales.
 *
 * Los modelos provienen de tomografías y resonancias segmentadas (D-022) y se
 * sirven como glTF binario comprimido. El encuadre inicial —escala, giros y
 * distancia de cámara— lo guarda el autor en la ficha, de modo que el residente
 * abre el modelo ya orientado hacia lo que se quiere mostrar y no tiene que
 * buscar el ángulo por su cuenta.
 *
 * Se renderiza en el navegador del estudiante, no en el servidor: por eso el
 * peso del archivo importa tanto (O-008).
 *
 * Este mismo componente es el que se usa para **elegir** el encuadre en el
 * panel, y es a propósito: si la vista previa fuera otro componente, podría
 * enseñarle al traumatólogo algo distinto de lo que verá el residente, y ese
 * es justo el error que un editor de encuadre no se puede permitir. Por eso
 * acepta un `mando`, con el que el editor lee la cámara.
 */

import { CAMPO_DE_VISION, encuadreCapturado, encuadreQueLoAbarca, type Encuadre } from '@/lib/encuadre'
import { ruta } from '@/lib/rutas'

export type { Encuadre }

/**
 * El decodificador de Draco, servido por la propia plataforma.
 *
 * Sin este segundo argumento drei usa el suyo, que es el de un tercero:
 * `useDraco` vale `true` por omisión y entonces la ruta es
 * `https://www.gstatic.com/draco/versioned/decoders/1.5.5/`. Es la decisión que
 * O-036 ya tomó para el lienzo de la consola —`LienzoQuirurgico` hace
 * `draco.setDecoderPath(ruta('/draco/'))`— y que aquí se quedó sin aplicar.
 *
 * Lo que se rompía: la guía le pide al traumatólogo exportar con «Comprimir» en
 * cuanto el archivo pasa de unos pocos MB, y ese mismo `.glb` abría en el
 * simulador y no en la ficha en cuanto la red del hospital no dejaba salir a
 * gstatic.com. Y no avisaba: en desarrollo, con internet, funciona igual.
 *
 * Pasa por `ruta()` porque es una dirección escrita a mano: bajo el prefijo
 * saldría sin él y la atendería otra página del mismo dominio.
 */
const DECODIFICADOR_DRACO = ruta('/draco/')

/**
 * Cuánto gira y cuánto acerca una pulsación.
 *
 * Equivalen a un arrastre corto de ratón. Más finos obligan a machacar la
 * tecla para dar media vuelta al hueso; más gruesos se pasan de largo del
 * trazo de fractura, que es justo lo que el residente quiere mirar de cerca.
 */
const PASO_DE_GIRO = 0.12
const PASO_DE_ZOOM = 1.12

/**
 * El contorno del foco se pinta en línea y no en `estilos.css`.
 *
 * Los atributos que se le pasan al `<Canvas>` caen en el div que fiber envuelve
 * alrededor del lienzo, no en el `<canvas>`, así que la regla de la hoja
 * tendría que apuntar a un elemento que fiber decide. Y `.visor-3d-lienzo`
 * recorta con `overflow: hidden`: un contorno sin desplazamiento negativo se
 * quedaría fuera del recorte y no se vería.
 */
const CONTORNO_DE_FOCO: React.CSSProperties = {
  outline: '2px solid var(--marca, #12509e)',
  outlineOffset: '-2px',
}

/**
 * ¿El foco llegó por el teclado?
 *
 * Pinchar con el ratón también enfoca un elemento con `tabIndex`, y marcar el
 * lienzo cada vez que alguien empieza a arrastrar el hueso sería ruido. Esta es
 * la pregunta que el navegador ya sabe contestar.
 */
function esFocoDeTeclado(elemento: HTMLElement): boolean {
  try {
    return elemento.matches(':focus-visible')
  } catch {
    // Navegador que no conoce el selector: un contorno de más es mejor que
    // dejar sin señal a quien solo tiene el teclado.
    return true
  }
}

/** ¿Alguien encuadró ya este modelo, o está tal como salió de la segmentación? */
export const tieneEncuadre = (encuadre: Encuadre | undefined): boolean =>
  encuadre?.distanciaCamara !== undefined && encuadre.distanciaCamara !== null

export interface MandoDelVisor3D {
  /**
   * El encuadre que reproduce, desde la cámara frontal del residente, lo que
   * ahora mismo se está viendo.
   */
  capturar: () => Encuadre | null
  /**
   * Escala y distancia con las que este modelo se ve entero y centrado, sea
   * cual sea la unidad en la que venga. Es el punto de partida.
   */
  ajustar: () => Encuadre | null
}

const grados = (g: number | undefined) => ((g ?? 0) * Math.PI) / 180

function Modelo({
  url,
  encuadre,
  girando,
  grupoExterno,
}: {
  url: string
  encuadre: Encuadre
  girando: boolean
  grupoExterno?: React.RefObject<Group | null>
}) {
  const { scene } = useGLTF(url, DECODIFICADOR_DRACO)
  const grupo = useRef<Group>(null)

  // El modelo se centra en su propia caja envolvente.
  //
  // Una malla segmentada rara vez tiene el origen dentro de sí misma: viene con
  // las coordenadas del estudio, a decenas o cientos de unidades del cero. Sin
  // centrarla, girar la escena la manda fuera de pantalla y la distancia de
  // cámara guardada no significa nada. Antes de esto lo tapaba `Bounds`, que
  // reencuadraba solo; ahora que el encuadre lo manda el autor, centrar es
  // condición para que sus números signifiquen algo.
  const centrada = React.useMemo(() => {
    const copia = scene.clone(true)
    const caja = new THREE.Box3().setFromObject(copia)
    const centro = caja.getCenter(new THREE.Vector3())
    copia.position.sub(centro)
    return copia
  }, [scene])

  useFrame((_, delta) => {
    if (girando && grupo.current) grupo.current.rotation.y += delta * 0.35
  })

  return (
    <group ref={grupoExterno ?? grupo}>
      <group
        ref={grupoExterno ? grupo : undefined}
        scale={encuadre.escala ?? 1}
        rotation={[grados(encuadre.giroX), grados(encuadre.giroY), grados(encuadre.giroZ)]}
      >
        <primitive object={centrada} />
      </group>
    </group>
  )
}

/**
 * Puente entre el lienzo y el mando.
 *
 * Vive dentro del `<Canvas>` porque la cámara y los controles solo existen
 * ahí, y escribe en un objeto que el componente de fuera ya tiene en la mano.
 */
function Puente({
  mando,
  grupo,
  encuadre,
}: {
  mando: React.RefObject<MandoDelVisor3D | null>
  grupo: React.RefObject<Group | null>
  encuadre: Encuadre
}) {
  const { camera, controls } = useThree()
  // En un efecto y no al pintar: escribir en un ref durante el pintado rompe
  // con el pintado concurrente, que puede empezar un render y descartarlo.
  const ultimo = useRef({ encuadre })
  React.useEffect(() => {
    ultimo.current = { encuadre }
  })

  // La aritmética vive en `@/lib/encuadre`, donde se puede probar sin lienzo.
  // Aquí solo se lee del lienzo lo que ella necesita.
  useImperativeHandle(mando, () => ({
    capturar: () => {
      const orbita = controls as unknown as ControlesOrbita | null
      return encuadreCapturado({
        posicionCamara: camera.position,
        objetivo: orbita?.target ?? new THREE.Vector3(),
        rotacionActual: grupo.current?.quaternion ?? new THREE.Quaternion(),
        escala: ultimo.current.encuadre.escala ?? 1,
      })
    },

    ajustar: () => {
      if (!grupo.current) return null
      // El radio se mide sin la escala puesta: se busca cuánto hay que escalar
      // para que el modelo mida uno, venga en milímetros o en metros.
      const escalaActual = ultimo.current.encuadre.escala ?? 1
      const caja = new THREE.Box3().setFromObject(grupo.current)
      const radio = caja.getBoundingSphere(new THREE.Sphere()).radius / (escalaActual || 1)
      const ajuste = encuadreQueLoAbarca(radio)
      return ajuste ? { ...ultimo.current.encuadre, ...ajuste } : null
    },
  }))

  return null
}

function Cargando() {
  return (
    <Html center>
      <span className="visor-3d-cargando">Cargando modelo…</span>
    </Html>
  )
}

export interface MandoDeCamara {
  /** Gira alrededor del objetivo y acerca o aleja, en un solo paso. */
  orbitar: (azimut: number, polar: number, factorDeDistancia: number) => void
}

/**
 * La cámara, manejable desde el teclado.
 *
 * `OrbitControls` solo escucha puntero y rueda, de modo que el residente que
 * navega con teclado llegaba al modelo y no podía hacer nada con él: ni
 * acercarse al trazo de fractura ni verlo por detrás. Este puente vive dentro
 * del `<Canvas>` porque la cámara y los controles solo existen ahí, y lo llama
 * el `onKeyDown` del contenedor, que está fuera.
 *
 * Se mueve la cámara a mano en vez de pedírselo a `OrbitControls` porque sus
 * métodos de giro son internos: usarlos ataría el visor a la versión de
 * three-stdlib que hoy está instalada.
 */
function CamaraPorTeclado({ mando }: { mando: React.RefObject<MandoDeCamara | null> }) {
  const { camera, controls } = useThree()

  useImperativeHandle(mando, (): MandoDeCamara => ({
    orbitar: (azimut, polar, factorDeDistancia) => {
      const orbita = controls as unknown as ControlesOrbita | null
      const objetivo = orbita?.target ?? new THREE.Vector3()
      const esferica = new THREE.Spherical().setFromVector3(camera.position.clone().sub(objetivo))
      esferica.theta -= azimut
      // Los polos se dejan fuera de alcance: justo encima o justo debajo del
      // modelo la cámara pierde la referencia de «arriba» y la vista da un
      // tirón del que no se vuelve sin arrastrar con el ratón.
      esferica.phi = THREE.MathUtils.clamp(esferica.phi - polar, 0.001, Math.PI - 0.001)
      // El mínimo no es el de los controles a secas: viene en cero, y acercarse
      // sin tope acaba metiendo la cámara dentro del hueso.
      esferica.radius = THREE.MathUtils.clamp(
        esferica.radius * factorDeDistancia,
        Math.max(orbita?.minDistance ?? 0, 0.05),
        orbita?.maxDistance ?? Infinity,
      )
      camera.position.copy(objetivo).add(new THREE.Vector3().setFromSpherical(esferica))
      camera.lookAt(objetivo)
      orbita?.update()
    },
  }))

  return null
}

/**
 * Marco de repuesto para cuando el modelo no se puede abrir.
 *
 * `useGLTF` suspende mientras descarga y **lanza durante el pintado** cuando la
 * descarga falla: el `<Suspense>` atrapa lo primero y no lo segundo. Sin este
 * límite la excepción subía hasta la frontera por omisión de Next y se llevaba
 * la ficha entera —texto clínico, clasificación, imágenes y comentarios— por
 * culpa del recuadro del hueso, y el residente solo veía «Application error».
 *
 * Basta con ponerlo por fuera del `<Canvas>`: fiber relanza hacia fuera lo que
 * se rompe dentro del lienzo (`Canvas`: «if (error) throw error»), así que un
 * límite dentro de la escena no haría falta y además tendría que pintar en
 * elementos de three.
 *
 * El aviso repite palabra por palabra el del bloque sin modelo de
 * `Bloques.tsx`, y es a propósito: al residente le da igual si lo que falta es
 * la dirección o el archivo.
 *
 * Lo que este límite cuesta: envuelve el visor entero, así que al saltar se
 * lleva también el `alterno`. En la ficha eso solo es el texto de ayuda, pero en
 * `EditorDeEncuadre` el `alterno` son los mandos del panel, y «Reiniciar» —que
 * pone el encuadre a cero sin leer el lienzo— funcionaría perfectamente con el
 * modelo roto. Se deja así porque los otros dos mandos sí leen la cámara y
 * dejarlos a la vista sobre un modelo que no cargó es prometer una captura que
 * devuelve null. Quien quiera salvar «Reiniciar» tiene que sacarlo del `alterno`
 * y ponerlo fuera del límite, en el propio editor; no basta con mover el límite
 * hacia dentro, porque es el `<Canvas>` lo que hay que desmontar.
 */
class LimiteDelModelo extends React.Component<
  { nombre?: string; alReintentar: () => void; children: React.ReactNode },
  { fallo: boolean }
> {
  state = { fallo: false }

  static getDerivedStateFromError() {
    return { fallo: true }
  }

  componentDidCatch(error: unknown) {
    // Ahora que la página ya no se cae, el fallo se queda mudo para quien
    // mantiene la plataforma si no se escribe aquí.
    console.error('[visor3d] no se pudo abrir el modelo:', error)
  }

  render() {
    if (!this.state.fallo) return this.props.children
    return (
      <div className="visor-3d-marco">
        <span className="visor-3d-nombre">{this.props.nombre ?? 'Modelo no disponible'}</span>
        <span className="visor-3d-nota">El archivo del modelo no se pudo cargar.</span>
        <button type="button" className="visor-3d-boton" onClick={this.props.alReintentar}>
          Reintentar
        </button>
      </div>
    )
  }
}

export function Visor3D({
  url,
  encuadre = {},
  nombre,
  mando,
  alterno,
}: {
  url: string
  encuadre?: Encuadre
  nombre?: string
  /** Para el editor del panel: da acceso a la cámara. */
  mando?: React.RefObject<MandoDelVisor3D | null>
  /** Contenido extra bajo el lienzo, que pone el editor. */
  alterno?: React.ReactNode
}) {
  const [girando, setGirando] = React.useState(false)
  const [intento, setIntento] = React.useState(0)
  const [conFoco, setConFoco] = React.useState(false)
  const grupo = useRef<Group>(null)
  const camara = useRef<MandoDeCamara | null>(null)
  const idAyuda = React.useId()

  // Volver a montar el lienzo no basta para reintentar: `useGLTF` guarda en
  // caché también la promesa rechazada, así que el segundo intento fallaba con
  // el mismo error sin llegar a pedir el archivo. Vaciar esa entrada es lo que
  // hace que reintentar signifique algo cuando el fallo fue pasajero —la sesión
  // caducó y la ruta de subidas contestó 403, y el residente ya ha vuelto a
  // entrar en otra pestaña—.
  const reintentar = React.useCallback(() => {
    useGLTF.clear(url)
    setIntento((n) => n + 1)
  }, [url])

  const alTeclear = (evento: React.KeyboardEvent<HTMLDivElement>) => {
    const camaraActual = camara.current
    if (!camaraActual) return
    // Cada flecha mueve el modelo como lo movería un arrastre en esa misma
    // dirección, que es lo que dice el texto de ayuda para el ratón.
    switch (evento.key) {
      case 'ArrowLeft':
        camaraActual.orbitar(-PASO_DE_GIRO, 0, 1)
        break
      case 'ArrowRight':
        camaraActual.orbitar(PASO_DE_GIRO, 0, 1)
        break
      case 'ArrowUp':
        camaraActual.orbitar(0, -PASO_DE_GIRO, 1)
        break
      case 'ArrowDown':
        camaraActual.orbitar(0, PASO_DE_GIRO, 1)
        break
      case '+':
      case '=':
        camaraActual.orbitar(0, 0, 1 / PASO_DE_ZOOM)
        break
      case '-':
      case '_':
        camaraActual.orbitar(0, 0, PASO_DE_ZOOM)
        break
      default:
        return
    }
    // Sin esto la ficha se desplaza por debajo mientras el residente cree que
    // está girando el hueso.
    evento.preventDefault()
  }

  // Con encuadre guardado manda el encuadre; sin él, manda el ajuste
  // automático.
  //
  // `Bounds` estuvo siempre puesto, y ahí estaba el fallo: su `reset()` calcula
  // la distancia desde la caja del modelo y solo conserva la *dirección* de la
  // cámara, de modo que descartaba `distanciaCamara` sin decirlo. Y como la
  // caja crece con el modelo, `escala` se cancelaba contra la distancia
  // recalculada. Dos de los cinco números que el traumatólogo podía escribir no
  // hacían absolutamente nada. Se conserva para las fichas antiguas, que no
  // tienen encuadre guardado y dependen de que algo las encuadre por ellas.
  const encuadrado = tieneEncuadre(encuadre)
  const distancia = encuadre.distanciaCamara ?? 3

  const contenido = (
    <Modelo url={url} encuadre={encuadre} girando={girando} grupoExterno={grupo} />
  )

  return (
    // La clave cambia al reintentar: es lo que devuelve el límite a su estado
    // sano y vuelve a montar el lienzo con el archivo ya fuera de la caché.
    <LimiteDelModelo key={`${url}#${intento}`} nombre={nombre} alReintentar={reintentar}>
      <div className="visor-3d-lienzo">
        <Canvas
          // El lienzo es un destino de foco y tiene nombre. Sin `tabIndex` el
          // residente que navega con teclado pasa de largo del bloque —fiber no
          // lo pone por su cuenta— y sin `aria-label` el lector de pantalla no
          // anuncia ni que hay un modelo ni de qué hueso es, aunque el nombre
          // esté escrito justo debajo. Los atributos caen en el div que fiber
          // envuelve alrededor del `<canvas>`, y ahí es donde se quieren: es lo
          // que recibe las teclas.
          //
          // `role="img"` junto a `tabIndex` es un compromiso, no una victoria
          // limpia: con el modelo anunciado como imagen, el lector de pantalla
          // en modo exploración se queda las flechas para mover su propio
          // cursor y nunca llegan a `onKeyDown`. O sea, esto le da teclado al
          // residente que ve y navega con tabulador, y no al que usa lector, que
          // tiene que entrar en modo formulario para girar el hueso. La
          // alternativa —`role="application"`— le daría las teclas, pero apaga
          // la exploración en todo lo que hay dentro y deja el bloque sin
          // anunciar como lo que es. Si algún día hay mandos de giro visibles y
          // pulsables, este apaño sobra y se quita.
          tabIndex={0}
          role="img"
          aria-label={nombre ? `Modelo tridimensional: ${nombre}` : 'Modelo tridimensional'}
          aria-describedby={alterno ? undefined : idAyuda}
          onKeyDown={alTeclear}
          onFocus={(evento) => setConFoco(esFocoDeTeclado(evento.currentTarget))}
          onBlur={() => setConFoco(false)}
          style={conFoco ? CONTORNO_DE_FOCO : undefined}
          camera={{ position: [0, 0, distancia], fov: CAMPO_DE_VISION }}
          // La preservación del búfer permite capturar el lienzo si más adelante
          // se quiere exportar una imagen del encuadre.
          gl={{ preserveDrawingBuffer: true, antialias: true }}
        >
          <color attach="background" args={['#f3f6fb']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[4, 6, 5]} intensity={1.1} />
          <directionalLight position={[-4, -2, -5]} intensity={0.4} />
          <Suspense fallback={<Cargando />}>
            {encuadrado ? contenido : <Bounds fit clip observe margin={1.2}>{contenido}</Bounds>}
          </Suspense>
          <OrbitControls makeDefault enablePan enableZoom enableRotate dampingFactor={0.1} />
          <CamaraPorTeclado mando={camara} />
          {mando ? <Puente mando={mando} grupo={grupo} encuadre={encuadre} /> : null}
        </Canvas>

        <div className="visor-3d-controles">
          {nombre ? <span className="visor-3d-titulo">{nombre}</span> : <span />}
          <button
            type="button"
            className="visor-3d-boton"
            onClick={() => setGirando((v) => !v)}
            aria-pressed={girando}
          >
            {girando ? 'Detener giro' : 'Girar'}
          </button>
        </div>
        {alterno ?? (
          <p className="visor-3d-ayuda" id={idAyuda}>
            Arrastre para rotar, rueda para acercar, botón derecho para desplazar. Con el modelo
            enfocado, las flechas lo giran y las teclas + y − acercan y alejan.
          </p>
        )}
      </div>
    </LimiteDelModelo>
  )
}

export default Visor3D
