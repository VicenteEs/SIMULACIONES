'use client'

import dynamic from 'next/dynamic'

/**
 * Los dos visores tridimensionales, cargados solo cuando hacen falta.
 *
 * `Bloques.tsx` los importaba de forma normal, y como pinta **todas** las
 * fichas, cada ficha —incluida la de puro texto— arrastraba three.js entero,
 * `@react-three/fiber` y `drei`: cerca de un megabyte de JavaScript que el
 * residente descargaba para leer una lista de pasos. Ahora cada visor es su
 * propio trozo y solo viaja si la ficha trae de verdad un modelo o una
 * preparación anatómica.
 *
 * Esta envoltura es un componente de cliente a propósito, y no una llamada a
 * `dynamic` dentro de `Bloques.tsx`: un componente de servidor que importa
 * dinámicamente uno de cliente **no** divide el paquete, y `ssr: false` solo
 * tiene efecto dentro de un componente de cliente. Es decir, hacerlo en
 * `Bloques.tsx` habría dado la sensación de arreglarlo sin arreglar nada.
 *
 * `ssr: false` porque no hay nada que prerrenderizar: un lienzo WebGL en el
 * servidor produce un hueco vacío y gasta memoria en dibujar la nada.
 */

const Marco = ({ texto }: { texto: string }) => (
  <div className="visor-3d-marco">
    <span className="visor-3d-nota">{texto}</span>
  </div>
)

export const Visor3D = dynamic(() => import('./Visor3D').then((m) => m.Visor3D), {
  ssr: false,
  loading: () => <Marco texto="Cargando visor…" />,
})

export const VisorInstancia = dynamic(
  () => import('./atlas/VisorInstancia').then((m) => m.VisorInstancia),
  {
    ssr: false,
    loading: () => <Marco texto="Cargando anatomía…" />,
  },
)
