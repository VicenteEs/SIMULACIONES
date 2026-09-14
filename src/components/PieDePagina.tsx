import Link from 'next/link'
import { AUTORIA } from '@/lib/autoria'

/**
 * Pie de todas las páginas de la plataforma: qué es esto, quién lo hizo y a
 * quién se escribe.
 *
 * Es de servidor y no tiene estado: no depende de la sesión, así que lo ven
 * igual quien entra por primera vez a la portada y quien ya está dentro. Quien
 * más lo necesita es el primero —alguien sin cuenta, o con una que no le deja
 * entrar—, y es justo el que no tiene otra forma de saber a quién preguntar.
 *
 * El nombre y el correo salen de `AUTORIA` y no se escriben aquí. Son los
 * mismos del pie de cada correo, de la barra del panel y de la página de
 * créditos, y el día que cambie la dirección tiene que cambiar en los cuatro a
 * la vez; `tests/unit/autoria.test.ts` falla si alguno se escribe a mano, y
 * también si este pie deja de pintarse en el layout.
 *
 * Dentro del panel no se ve, y no es este componente quien lo decide: lo
 * esconde `estilos.css`, porque el layout que lo pinta no conoce la ruta. El
 * porqué está junto a esa regla.
 *
 * El `mailto:` no pasa por `ruta()`: no es una dirección de la plataforma y el
 * prefijo no le afecta. El enlace a créditos es un `<Link>`, que ya lo resuelve.
 */
export function PieDePagina() {
  return (
    <footer className="pie-de-pagina">
      <p>
        <strong>TraumaHub</strong> · Plataforma docente de traumatología ·{' '}
        <Link href="/creditos">Créditos y licencias</Link>
      </p>
      <p>
        Desarrollado por {AUTORIA.nombre}. Cualquier consulta, a{' '}
        <a className="pie-de-pagina-correo" href={`mailto:${AUTORIA.correo}`}>
          {AUTORIA.correo}
        </a>
        .
      </p>
    </footer>
  )
}
