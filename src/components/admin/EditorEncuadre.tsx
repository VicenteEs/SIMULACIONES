'use client'

import React from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, Bounds, Html } from '@react-three/drei'
import { useField, useAllFormFields, Button } from '@payloadcms/ui'
import type { Group, PerspectiveCamera } from 'three'

/**
 * Editor visual del encuadre de un modelo 3D.
 *
 * Sustituye a escribir números a mano en cinco campos. El autor gira el modelo
 * con el ratón hasta dejarlo como quiere y pulsa «Capturar encuadre»: la
 * posición de la cámara y la rotación se escriben en los campos del formulario,
 * que se guardan con el resto de la ficha.
 *
 * Es un componente del panel, no del sitio público: vive dentro de Payload y
 * escribe en su formulario mediante `useField`.
 */

const aGrados = (radianes: number) => Math.round((radianes * 180) / Math.PI)

function Escena({
  url,
  alCambiar,
}: {
  url: string
  alCambiar: (datos: { giroY: number; distancia: number }) => void
}) {
  const { scene } = useGLTF(url)
  const grupo = React.useRef<Group>(null)
  const { camera } = useThree()

  useFrame(() => {
    if (!grupo.current) return
    const camaraPerspectiva = camera as PerspectiveCamera
    alCambiar({
      giroY: aGrados(grupo.current.rotation.y),
      distancia: Number(camaraPerspectiva.position.length().toFixed(2)),
    })
  })

  return (
    <Bounds fit clip observe margin={1.2}>
      <group ref={grupo}>
        <primitive object={scene} />
      </group>
    </Bounds>
  )
}

export const EditorEncuadre: React.FC<{ path: string }> = ({ path }) => {
  const [campos] = useAllFormFields()

  // El modelo se toma del campo hermano del mismo bloque: si el autor no lo ha
  // elegido todavía, no hay nada que encuadrar.
  const rutaBloque = path.replace(/\.encuadre$/, '')
  const modelo = campos[`${rutaBloque}.modelo`]?.value as
    | { url?: string; nombre?: string }
    | string
    | undefined
  const url = typeof modelo === 'object' && modelo !== null ? modelo.url : undefined

  const escala = useField<number>({ path: `${path}.escala` })
  const giroY = useField<number>({ path: `${path}.giroY` })
  const distancia = useField<number>({ path: `${path}.distanciaCamara` })

  const actual = React.useRef({ giroY: 0, distancia: 3 })

  if (!url) {
    return (
      <div className="editor-encuadre-aviso">
        Elija primero un modelo 3D y guarde la ficha; después podrá encuadrarlo aquí.
      </div>
    )
  }

  function capturar() {
    giroY.setValue(actual.current.giroY)
    distancia.setValue(actual.current.distancia)
    if (!escala.value) escala.setValue(1)
  }

  function restablecer() {
    escala.setValue(1)
    giroY.setValue(0)
    distancia.setValue(3)
  }

  return (
    <div className="editor-encuadre">
      <div className="editor-encuadre-lienzo">
        <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
          <color attach="background" args={['#f2f5f6']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[4, 6, 5]} intensity={1.1} />
          <React.Suspense fallback={<Html center>Cargando…</Html>}>
            <Escena
              url={url}
              alCambiar={(datos) => {
                actual.current = datos
              }}
            />
          </React.Suspense>
          <OrbitControls makeDefault />
        </Canvas>
      </div>

      <div className="editor-encuadre-pie">
        <p>
          Gire y acerque el modelo hasta dejarlo como quiere que lo vea el residente, y capture el
          encuadre. Se guardará al guardar la ficha.
        </p>
        <div className="editor-encuadre-botones">
          <Button size="small" onClick={capturar}>
            Capturar encuadre
          </Button>
          <Button size="small" buttonStyle="secondary" onClick={restablecer}>
            Restablecer
          </Button>
        </div>
      </div>
    </div>
  )
}

export default EditorEncuadre
