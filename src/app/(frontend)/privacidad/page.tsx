import type { Metadata } from 'next'
import { Miga } from '@/components/Estados'
import { TextoDelAviso } from '@/components/privacidad/TextoDelAviso'
import { VERSION_DEL_AVISO_DE_PRIVACIDAD, diaDeLaVersion } from '@/lib/avisoDePrivacidad'

export const metadata: Metadata = {
  title: 'Aviso de privacidad · TraumaHub',
  // Fuera de los buscadores como el resto (D-020). Abrirla aquí no serviría de
  // nada: `public/robots.txt` cierra el dominio entero, y lo que pide la ley es
  // que el aviso esté a la vista de quien entrega sus datos, que lo tiene
  // enlazado en el registro, en el formulario de cotización y en el pie de cada
  // página.
  robots: { index: false, follow: false },
}

/**
 * El aviso de privacidad (Q-005, D-258): qué datos de la persona guarda la
 * plataforma, para qué, dónde, cuánto tiempo y cómo ejercer sus derechos.
 *
 * Pública y sin sesión, como `/creditos`: quien más la necesita es quien
 * todavía no tiene cuenta y está a punto de pedirla. La casilla del último paso
 * de `/registro` enlaza aquí, y la cuenta guarda qué versión se aceptó
 * (`VERSION_DEL_AVISO_DE_PRIVACIDAD`).
 *
 * El texto no está aquí sino en `TextoDelAviso`, porque la pantalla que pide
 * aceptarlo al entrar (D-292) pinta el mismo: lo que se acepta y lo que se
 * publica no pueden ser dos textos. Lo que dice cada apartado, y de qué
 * archivo sale, está explicado allí.
 *
 * Una cuenta con sesión que todavía no aceptó la versión vigente no llega a
 * ver esta página tal cual: la plantilla la cambia por esa pantalla, que
 * enseña el mismo aviso con el botón para aceptarlo.
 */
export default function PaginaPrivacidad() {
  return (
    <main>
      <Miga href="/privacidad" texto="Privacidad" />
      <span className="eyebrow">
        Versión del <time dateTime={VERSION_DEL_AVISO_DE_PRIVACIDAD}>{diaDeLaVersion()}</time>
      </span>
      <h1>Aviso de privacidad</h1>
      <p className="entrada">
        Qué datos tuyos guarda TraumaHub, para qué los usa, dónde están, cuánto tiempo se quedan y cómo
        pedir que los corrijamos o los borremos.
      </p>

      <TextoDelAviso />

      {/* La casilla del registro abre este aviso en otra pestaña para no
          perder lo escrito; sin esta línea, quien llega por ahí no sabe que
          su formulario sigue intacto en la de al lado. */}
      <p className="nota-al-pie">
        Si llegaste desde la solicitud de cuenta o desde el formulario de cotización, puedes cerrar esta
        pestaña: lo que escribiste sigue en la otra.
      </p>
    </main>
  )
}
