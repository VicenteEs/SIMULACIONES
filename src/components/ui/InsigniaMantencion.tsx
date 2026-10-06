import { Wrench } from 'lucide-react'

/**
 * La marca «En mantención» (D-156).
 *
 * La ve quien conserva el acceso a un módulo que los residentes ya no ven: el
 * editor y el administrador. Es la misma pieza en la barra, la portada y el
 * panel, para que se reconozca de un vistazo como una sola cosa. Reutiliza el
 * tono de aviso de la insignia semántica (`ui.css`) y no inventa un color: una
 * mantención es un estado a medias, que es lo que el ámbar ya significa en el
 * resto de la plataforma (borradores, por revisar).
 */
export function InsigniaMantencion() {
  return (
    <span
      className="insignia insignia-atencion insignia-mantencion"
      title="Los residentes no ven este módulo"
    >
      <Wrench size={12} aria-hidden="true" />
      En mantención
    </span>
  )
}
