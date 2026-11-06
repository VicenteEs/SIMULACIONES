'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Play, X } from 'lucide-react'

/**
 * La demostración del paso en el panel, y en grande si se pide (P-013, pedido 11).
 *
 * En el panel mide como mucho 220 px de alto (P-009), y para un gesto de 3 a
 * 5 s bastaba. Desde que el editor graba demostraciones con cuadros
 * explicativos (`GrabadoraDelPaso.tsx`), la letra de los cuadros queda ahí en
 * unos 12 px: se lee, pero cuesta. «Ver en grande» la abre al ancho que deja la
 * pantalla y con controles para pararla y volver atrás; en el panel no hacen
 * falta, porque se repite sola.
 *
 * Lo grande se monta dentro de la consola y no en `body`, porque los colores de
 * la consola son variables de `.consola`. Se monta en su raíz y no aquí
 * mismo porque el panel del paso puede ir dentro de un cajón desplazado con
 * `transform`, y dentro de uno así `position: fixed` deja de ser la pantalla.
 */
export function DemostracionDelPaso({ url, tipo, titulo }: { url: string; tipo: string | null; titulo: string }) {
  const [raiz, setRaiz] = useState<HTMLElement | null>(null)
  const esVideo = tipo?.startsWith('video/') ?? false
  return (
    <>
      <figure className="consola-demostracion">
        {esVideo ? (
          <video src={url} autoPlay loop muted playsInline aria-label={`Demostración: ${titulo}`} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- una animación de la biblioteca, que ya trae su prefijo
          <img src={url} alt={`Demostración: ${titulo}`} />
        )}
        {/* Debajo del vídeo y no encima, como antes: encima tapaba el cuadro explicativo que se graba abajo. */}
        <figcaption>
          <span>
            <Play size={12} aria-hidden /> Así se hace
          </span>
          <button
            type="button"
            className="consola-demostracion-ampliar"
            onClick={(e) => setRaiz((e.currentTarget.closest('.consola') as HTMLElement | null) ?? document.body)}
          >
            <Maximize2 size={13} aria-hidden /> Ver en grande
          </button>
        </figcaption>
      </figure>
      {raiz
        ? createPortal(
            <DemostracionEnGrande url={url} esVideo={esVideo} titulo={titulo} alCerrar={() => setRaiz(null)} />,
            raiz,
          )
        : null}
    </>
  )
}

function DemostracionEnGrande({
  url,
  esVideo,
  titulo,
  alCerrar,
}: {
  url: string
  esVideo: boolean
  titulo: string
  alCerrar: () => void
}) {
  const base = useId()
  const cerrar = useRef<HTMLButtonElement>(null)
  // `alCerrar` llega nuevo en cada pintado de la consola, que repinta a menudo. Con él en las dependencias del efecto de
  // abajo, el foco volvería al botón de cerrar en cada repintado, también con el teclado en los controles del vídeo.
  const alCerrarVigente = useRef(alCerrar)
  useEffect(() => {
    alCerrarVigente.current = alCerrar
  })
  useEffect(() => {
    // Al foco de la caja: Escape la cierra desde el teclado, y el lector anuncia el diálogo al abrirse.
    const antes = document.activeElement as HTMLElement | null
    cerrar.current?.focus()
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrarVigente.current()
    }
    window.addEventListener('keydown', alTeclear)
    return () => {
      window.removeEventListener('keydown', alTeclear)
      antes?.focus?.()
    }
  }, [])
  return (
    <div
      className="consola-demostracion-velo"
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar()
      }}
    >
      <div className="consola-demostracion-grande" role="dialog" aria-modal="true" aria-labelledby={`${base}-titulo`}>
        <div className="consola-demostracion-grande-cabecera">
          <strong id={`${base}-titulo`}>Así se hace: {titulo}</strong>
          <button ref={cerrar} type="button" className="consola-plegar" aria-label="Cerrar" onClick={alCerrar}>
            <X size={16} aria-hidden />
          </button>
        </div>
        {esVideo ? (
          <video src={url} autoPlay loop muted playsInline controls aria-label={`Demostración: ${titulo}`} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- la misma animación que la del panel
          <img src={url} alt={`Demostración: ${titulo}`} />
        )}
      </div>
    </div>
  )
}
