import Link from 'next/link'

/**
 * La ficha que ya no está: lo que se pinta cuando una página pública llama a
 * `notFound()`.
 *
 * Lo llaman las cuatro páginas de detalle en cuanto el documento se retira de
 * publicación o se elimina —`biblioteca/[id]`, `simulador/[id]`,
 * `tecnica-ao/[id]` e `imagenes/[id]`, todas con el mismo `if (!ficha)
 * notFound()`—, y hasta ahora no había ningún `not-found.tsx` en el árbol: lo
 * atendía la pantalla por omisión de Next, en inglés, sin la barra de
 * navegación y sin más salida que el botón «atrás». Para un residente que abre
 * el enlace que un compañero le pasó por mensaje, eso no dice si la ficha se
 * quitó o si la plataforma está rota.
 *
 * No lo cubría `error.tsx`, y conviene saber por qué antes de intentar juntar
 * los dos: `notFound()` no es una excepción corriente que suba hasta el límite
 * de error, es una señal que Next intercepta en el límite de «no encontrado»
 * —que es otro y va por debajo—. Un mismo archivo no puede atender las dos
 * cosas.
 *
 * Vive en `(frontend)` y no en la raíz de `src/app` porque así hereda el layout
 * del grupo y sale con la barra puesta y con los estilos de la casa. Lo que eso
 * deja fuera hay que decirlo: una dirección que no corresponde a ninguna ruta
 * —`/bibliotecaa`, un enlace mal copiado— la atiende la ruta interna
 * `/_not-found`, que Next compone en la raíz de `app`, y ahí no llega este
 * archivo. De esa otra mitad se ocupa `src/app/global-not-found.tsx`, que pinta
 * su propio documento, sin barra y con los colores en línea. No se resolvió con
 * un `src/app/not-found.tsx` corriente porque ese se pinta dentro del layout
 * raíz y aquí no hay uno solo: `(frontend)` y `(payload)` son cada uno su
 * propia raíz y no existe `src/app/layout.tsx`.
 *
 * Y hay una condición que conviene tener presente al leer aquello: aquel
 * archivo solo entra en juego con `experimental.globalNotFound` puesto en
 * `next.config.mjs`. Apagada la bandera, Next ni lo busca, y la dirección que
 * no casa vuelve a la pantalla por omisión, en inglés. El porqué entero está en
 * la cabecera de `src/app/global-not-found.tsx`.
 *
 * El reparto, para no confundirlo al tocar cualquiera de los tres: `notFound()`
 * desde una página del panel → `admin-panel/not-found.tsx`; `notFound()` desde
 * una página pública → este archivo; dirección que no casa con ninguna ruta →
 * `src/app/global-not-found.tsx`.
 *
 * Sin props a propósito: un `not-found.tsx` no recibe ninguna —lo dice el mismo
 * documento—, así que no hay ni error que registrar ni nada que reintentar. Por
 * eso aquí no hay botón «Volver a intentarlo»: la ficha no va a volver porque
 * se pida otra vez.
 */
export default function FichaNoEncontrada() {
  return (
    <main>
      <h1>Esta ficha ya no está</h1>
      <div className="tarjeta">
        <p>
          O se retiró de publicación, o se eliminó, o la dirección llegó mal copiada. No es un
          fallo de la plataforma y su sesión sigue abierta: el resto del material está donde
          estaba.
        </p>
        <div className="row-botones">
          {/*
            La biblioteca va primero porque es el módulo del que salen la mayoría
            de los enlaces que se comparten, y porque una lista donde buscar es
            mejor salida que la portada cuando lo que se buscaba era una ficha
            concreta.
          */}
          <Link className="boton" href="/biblioteca">
            Ir a la biblioteca
          </Link>
          <Link className="boton secundario" href="/">
            Ir a la portada
          </Link>
        </div>
      </div>
    </main>
  )
}
