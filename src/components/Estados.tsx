import Link from 'next/link'

/** Pantalla para quien no tiene sesión o su cuenta no está activa. */
export function SinAcceso({ titulo }: { titulo: string }) {
  return (
    <main>
      <h1>{titulo}</h1>
      <div className="tarjeta">
        <p>Necesita una cuenta activa para ver el contenido.</p>
        <Link className="boton" href="/entrar">
          Iniciar sesión
        </Link>
      </div>
    </main>
  )
}

/**
 * Pantalla para quien tiene la cuenta activa pero no este módulo entre los
 * suyos (`modulosVisibles`).
 *
 * La barra y la portada ya esconden el módulo (`Navegacion.tsx`, `page.tsx`),
 * pero esconder un enlace no cierra una dirección: quien la escribe a mano, la
 * guarda en marcadores o la recibe de un compañero llega igual. Y lo que había
 * al llegar no decía la verdad. La regla de lectura devuelve `false` y Payload,
 * ante un `false`, no contesta con una lista vacía sino que lanza `Forbidden`
 * (`payload/dist/auth/executeAccess.js`); eso acababa en `error.tsx`, que pide
 * «vuelva a intentarlo» por una avería que no existe, y reintentar da
 * exactamente lo mismo cada vez. Si algún día alguien pone `disableErrors` o
 * un `.catch` en el listado para quitarse ese error de encima, la mentira pasa
 * a ser la contraria: «todavía no hay contenido» sobre un módulo que puede
 * estar lleno. Ninguna de las dos le dice al residente lo único que necesita
 * saber, que es que le falta un permiso y a quién pedírselo.
 *
 * Esa mentira contraria no es hipotética: es la que dan las fichas. Las cuatro
 * páginas `[id]` envuelven su `findByID` en `.catch(() => null)` —para que una
 * ficha retirada acabe en `notFound()`—, y ese `.catch` se traga también el
 * `Forbidden`. El residente sin el módulo lee entonces «Esta ficha ya no está…
 * No es un fallo de la plataforma» (`not-found.tsx`) sobre una ficha que sigue
 * publicada. Y es la puerta más transitada de las dos, porque lo que se pasa
 * un compañero es el enlace a una ficha, no al listado. Por eso la guardia va
 * también en las fichas, antes del `findByID`, y no se arregla afinando el
 * `.catch`: distinguir un `Forbidden` de un `NotFound` por la clase del error
 * ata la página a los nombres internos de Payload, y la guardia pregunta lo
 * mismo con la regla de la casa.
 *
 * Es un componente y no una frase en cada página porque son nueve —los cinco
 * listados, examen físico incluido, y las cuatro fichas— y el texto tiene que
 * ser el mismo en todas: si en una dice «no tiene acceso» y en otra «no hay
 * contenido», la diferencia se lee como dos problemas distintos.
 *
 * Se pinta y se contesta con un 200, no con el `forbidden()` de Next, que daría
 * un 403 honesto. Esa función es experimental en esta versión y exige
 * `experimental.authInterrupts` en `next.config.mjs`
 * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md`);
 * sin la bandera, llamarla lanza un `Error` corriente
 * (`next/dist/client/components/forbidden.js`) que acaba en `error.tsx`, la
 * misma pantalla de avería de la que se venía huyendo. El 200 no
 * engaña a nadie que importe aquí: no hay buscadores dentro de una plataforma
 * cerrada, y quien lee la respuesta es una persona. Si la bandera se pone algún
 * día, el cambio es este componente por un `forbidden()` más un `forbidden.tsx`
 * con este mismo texto.
 *
 * Se trata en usted, como `SinAcceso` y la portada. La salida es la portada y
 * no «atrás»: quien llega por una dirección escrita a mano no tiene un atrás
 * dentro de la plataforma, y la portada ya enseña solo los módulos que sí son
 * suyos.
 *
 * Quien la pinta tiene que comprobarlo con `puedeVerModulo` y el **usuario
 * efectivo**, el mismo que luego va a la consulta. Con el usuario real, un
 * administrador en vista previa pasaría la guardia y la consulta, que va con
 * su rol simulado, volvería a lanzar el `Forbidden`.
 */
export function SinAccesoAlModulo({ titulo }: { titulo: string }) {
  return (
    <main>
      <h1>{titulo}</h1>
      <div className="tarjeta">
        <p>
          Su cuenta no tiene acceso a este módulo. Los módulos que ve cada cuenta los asigna un
          administrador de la plataforma: si cree que este debería estar entre los suyos, pídaselo.
        </p>
        <Link className="boton" href="/">
          Volver a la portada
        </Link>
      </div>
    </main>
  )
}

/**
 * Módulo sin contenido todavía.
 *
 * Se muestra qué falta y cómo crearlo, en lugar de una pantalla en blanco: la
 * plataforma nace vacía a propósito (D-016) y conviene que eso se lea como una
 * etapa del trabajo y no como una avería.
 */
export function Vacio({ texto, enlace, accion }: { texto: string; enlace?: string; accion?: string }) {
  return (
    <div className="tarjeta">
      <p>{texto}</p>
      {enlace && accion ? (
        <Link className="boton" href={enlace}>
          {accion}
        </Link>
      ) : null}
    </div>
  )
}

/** Enlace de vuelta al listado del módulo. */
export function Miga({ href, texto }: { href: string; texto: string }) {
  return (
    <nav className="miga">
      <Link href={href}>{texto}</Link>
    </nav>
  )
}
