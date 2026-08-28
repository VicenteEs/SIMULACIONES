'use client'

import React, { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF, Bounds, Html } from '@react-three/drei'
import type { Group } from 'three'

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
 */

export interface Encuadre {
  escala?: number
  giroX?: number
  giroY?: number
  giroZ?: number
  distanciaCamara?: number
}

const grados = (g: number | undefined) => ((g ?? 0) * Math.PI) / 180

function Modelo({ url, encuadre, girando }: { url: string; encuadre: Encuadre; girando: boolean }) {
  const { scene } = useGLTF(url)
  const grupo = useRef<Group>(null)

  useFrame((_, delta) => {
    if (girando && grupo.current) grupo.current.rotation.y += delta * 0.35
  })

  return (
    <group ref={grupo}>
      <primitive
        object={scene}
        scale={encuadre.escala ?? 1}
        rotation={[grados(encuadre.giroX), grados(encuadre.giroY), grados(encuadre.giroZ)]}
      />
    </group>
  )
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
}: {
  url: string
  encuadre?: Encuadre
  nombre?: string
}) {
  const [girando, setGirando] = React.useState(false)
  const distancia = encuadre.distanciaCamara ?? 3

  return (
    <div className="visor-3d-lienzo">
      <Canvas
        camera={{ position: [0, 0, distancia], fov: 45 }}
        // La preservación del búfer permite capturar el lienzo si más adelante
        // se quiere exportar una imagen del encuadre.
        gl={{ preserveDrawingBuffer: true, antialias: true }}
      >
        <color attach="background" args={['#f2f5f6']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 5]} intensity={1.1} />
        <directionalLight position={[-4, -2, -5]} intensity={0.4} />
        <Suspense fallback={<Cargando />}>
          {/* Bounds encuadra el modelo sea cual sea su tamaño original: una
              malla salida de una segmentación viene en milímetros y otra en
              metros, y el residente no debe notar la diferencia. */}
          <Bounds fit clip observe margin={1.2}>
            <Modelo url={url} encuadre={encuadre} girando={girando} />
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault enablePan enableZoom enableRotate dampingFactor={0.1} />
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
      <p className="visor-3d-ayuda">
        Arrastre para rotar, rueda para acercar, botón derecho para desplazar.
      </p>
    </div>
  )
}

export default Visor3D
