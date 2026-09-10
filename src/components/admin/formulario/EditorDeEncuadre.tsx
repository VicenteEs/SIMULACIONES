'use client'

import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { Encuadre, MandoDelVisor3D } from '@/components/Visor3D'

/**
 * Editor del encuadre de un modelo 3D.
 *
 * El traumatólogo gira el modelo con el ratón hasta dejarlo como quiere que lo
 * abra el residente y pulsa «Capturar encuadre». Los cinco números se rellenan
 * solos, y siguen ahí debajo por si quiere afinarlos a mano.
 *
 * Antes esto no existía. Hubo un editor, `src/components/admin/EditorEncuadre`,
 * pero era un componente de la interfaz de administración de Payload, que se
 * retiró entera en D-038: dejó de renderizarse y nadie lo notó, porque el texto
 * de ayuda del campo siguió diciendo «gire el modelo y pulse capturar» durante
 * meses mientras en pantalla solo había cinco casillas numéricas y ningún botón
 * que pulsar. Este es propio del panel y no depende de nada de Payload.
 *
 * El visor es **el mismo** que ve el residente, no una imitación. Un editor de
 * encuadre cuya vista previa no coincide con el resultado es peor que no tener
 * editor: engaña.
 */

// El motor 3D no debe viajar con el formulario. Una ficha de texto se edita sin
// tocar three.js, y este editor solo aparece si el traumatólogo inserta un
// bloque de modelo 3D.
const Visor3D = dynamic(() => import('@/components/Visor3D').then((m) => m.Visor3D), {
  ssr: false,
  loading: () => (
    <div className="visor-3d-marco">
      <span className="visor-3d-nota">Cargando visor…</span>
    </div>
  ),
})

export function EditorDeEncuadre({
  url,
  nombre,
  valor,
  alCambiar,
}: {
  /** Dirección del modelo elegido, o null si todavía no hay ninguno. */
  url: string | null
  nombre?: string
  valor: Encuadre
  alCambiar: (nuevo: Encuadre) => void
}) {
  const mando = useRef<MandoDelVisor3D | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  if (!url) {
    return (
      <p className="campo-ayuda">
        Elija primero un modelo arriba y aquí aparecerá para encuadrarlo.
      </p>
    )
  }

  const aplicar = (nuevo: Encuadre | null, texto: string) => {
    if (!nuevo) {
      setAviso('No se pudo leer el modelo. Espere a que termine de cargar.')
      return
    }
    alCambiar({ ...valor, ...nuevo })
    setAviso(texto)
  }

  return (
    <div className="encuadre-editor">
      <Visor3D
        // Al cambiar el modelo hay que rehacer el lienzo entero: la cámara se
        // monta con la distancia del encuadre y no se vuelve a leer.
        key={url}
        url={url}
        nombre={nombre}
        encuadre={valor}
        mando={mando}
        alterno={
          <div className="encuadre-mandos">
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              onClick={() => aplicar(mando.current?.capturar() ?? null, 'Encuadre capturado.')}
            >
              Capturar encuadre
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() =>
                aplicar(mando.current?.ajustar() ?? null, 'Ajustado al tamaño del modelo.')
              }
            >
              Ajustar al modelo
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => {
                alCambiar({ escala: 1, giroX: 0, giroY: 0, giroZ: 0, distanciaCamara: 3 })
                setAviso('Encuadre a cero.')
              }}
            >
              Reiniciar
            </button>
          </div>
        }
      />

      <p className="campo-ayuda">
        Arrastre para girar y use la rueda para acercar. Cuando lo vea como quiere que lo abra el
        residente, pulse <strong>Capturar encuadre</strong>. Si el modelo aparece diminuto o
        gigante —viene en las unidades del estudio del que salió—, pulse{' '}
        <strong>Ajustar al modelo</strong> primero.
        {aviso ? <span className="encuadre-aviso"> {aviso}</span> : null}
      </p>
    </div>
  )
}
