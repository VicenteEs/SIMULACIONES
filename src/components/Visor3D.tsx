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

export type { Encuadre }

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
  const { scene } = useGLTF(url)
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
  const grupo = useRef<Group>(null)

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
    <div className="visor-3d-lienzo">
      <Canvas
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
        <p className="visor-3d-ayuda">
          Arrastre para rotar, rueda para acercar, botón derecho para desplazar.
        </p>
      )}
    </div>
  )
}

export default Visor3D
