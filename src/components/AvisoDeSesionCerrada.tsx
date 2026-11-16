import Link from 'next/link'
import { MENSAJE_DE_OTRA_ENTRADA } from '@/lib/entradas'

/**
 * La franja para quien llega con la cookie de una sesión que se cerró porque se
 * entró con su cuenta en otro equipo (D-374, D-388).
 *
 * Sin ella, ese equipo veía la plataforma como un visitante, o «Necesita una
 * cuenta», sin una palabra de por qué: lo primero que piensa quien entra a
 * diario es que la plataforma se cayó o que le quitaron la cuenta. La pinta la
 * plantilla, en el flujo de la página como la de ved, en cualquier página y
 * mientras dure la cookie: hasta que se vuelva a entrar o hasta que caduque.
 *
 * El aviso en vivo, para la pestaña que ya estaba abierta, es otro: lo saca
 * `AvisoActualizacion` cuando el flujo de `/api/cambios` lo dice.
 */
export function AvisoDeSesionCerrada() {
  return (
    <div className="aviso-de-sesion-cerrada" role="status">
      {MENSAJE_DE_OTRA_ENTRADA} <Link href="/entrar">Entrar de nuevo</Link>
    </div>
  )
}
