'use client'

import { useState } from 'react'
import { FileDown, LoaderCircle } from 'lucide-react'
import { useAvisos } from '@/components/ui/Avisos'
import type { PaginaConPdf } from '@/lib/pdf'
import { ruta } from '@/lib/rutas'

/**
 * «Guardar PDF» de la ficha: descarga el PDF que imprime el servidor (D-244).
 *
 * Antes llamaba a `window.print()`, y el PDF dependía del diálogo de cada
 * navegador: en algunos la A4 salía encogida dentro de otra hoja, y los fondos
 * del membrete dependían de una casilla. Ahora el archivo llega hecho
 * (`api/pdf/[pagina]/[id]`), con el mismo diseño para todos.
 *
 * Con `fetch` y no con un enlace con `download`: el servidor tarda unos
 * segundos en imprimir, y con el enlace la persona no veía nada hasta que
 * empezaba la descarga y volvía a pulsar. Así el botón dice que está
 * preparando, no se puede pulsar dos veces, y si falla lo dice con un aviso.
 *
 * Sin `aria-label`: el que había («Imprimir o guardar como PDF») sustituía al
 * texto visible y el nombre accesible dejaba de contener la cadena que el
 * usuario lee en pantalla. Quien maneja el equipo por voz dice «pulsar Guardar
 * PDF», el sistema compara lo dicho con el nombre accesible y no encontraba
 * nada: el botón estaba a la vista y no obedecía al único nombre legible
 * (WCAG 2.5.3, Etiqueta en el nombre). Si alguna vez hace falta aclarar el
 * destino, el nombre tiene que empezar por «Guardar PDF».
 */
export function BotonImprimir({ pagina, documentoId }: { pagina: PaginaConPdf; documentoId: string }) {
  const [preparando, setPreparando] = useState(false)
  const avisar = useAvisos()

  async function guardar() {
    setPreparando(true)
    try {
      const respuesta = await fetch(ruta(`/api/pdf/${pagina}/${documentoId}`), { cache: 'no-store' })
      if (!respuesta.ok) {
        // El servidor contesta en castellano y en texto plano; si no llegó a
        // contestar, `fetch` lanza en inglés y eso no se le enseña a nadie.
        avisar('error', (await respuesta.text().catch(() => '')) || 'No se pudo preparar el PDF.')
        return
      }
      const nombre =
        /filename="([^"]+)"/.exec(respuesta.headers.get('Content-Disposition') ?? '')?.[1] ?? 'traumahub.pdf'
      const direccion = URL.createObjectURL(await respuesta.blob())
      const enlace = document.createElement('a')
      enlace.href = direccion
      enlace.download = nombre
      document.body.append(enlace)
      enlace.click()
      enlace.remove()
      // Un minuto antes de soltarlo: Safari empieza la descarga después del
      // clic, no durante, y con el archivo soltado al instante descarga nada.
      window.setTimeout(() => URL.revokeObjectURL(direccion), 60_000)
    } catch {
      avisar('error', 'No se pudo preparar el PDF. Revisa la conexión y vuelve a intentarlo.')
    } finally {
      setPreparando(false)
    }
  }

  // Fantasma y pequeño, en la barra de acciones de la ficha junto a «Marcar
  // como leída» y «Comentar». Antes era un botón secundario grande metido en la
  // miga con `marginLeft: auto` en línea, y competía con el título.
  return (
    <button
      type="button"
      className="boton boton-fantasma boton-sm boton-imprimir"
      onClick={guardar}
      disabled={preparando}
      aria-busy={preparando}
    >
      {preparando ? (
        <LoaderCircle size={16} aria-hidden="true" className="boton-imprimir-girando" />
      ) : (
        <FileDown size={16} aria-hidden="true" />
      )}
      {preparando ? 'Guardar PDF · preparando…' : 'Guardar PDF'}
    </button>
  )
}
