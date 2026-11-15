import React from 'react'
import type { ServidorDePruebas } from '@/lib/servidorDePruebas'

/**
 * La franja de ved, el servidor de pruebas (D-385), en lo alto de cada página.
 *
 * En el flujo de la página y no fija: el sitio y el panel ya tienen barras
 * pegadas arriba, y una tercera las habría tapado o habría obligado a mover
 * sus `top`. Al entrar se ve siempre, que es cuando se decide dónde trabajar.
 * La consola del simulador a pantalla completa la tapa, y está bien: allí se
 * entra desde una página que ya la enseñó.
 *
 * No sale al imprimir (`estilos.css`): el servidor imprime los PDF con la hoja
 * de impresión, y una ficha guardada en ved no debe llevar la franja.
 *
 * El enlace va con la dirección entera, sin `ruta()`: lleva a otro servidor, y
 * el prefijo de este no tiene nada que ver con el de aquel.
 */
export function AvisoDeServidorDePruebas({ produccion }: ServidorDePruebas) {
  return (
    <div className="aviso-de-pruebas" role="note" aria-label="Servidor de pruebas">
      <strong>Servidor de pruebas.</strong> Lo que se haga aquí se queda aquí y no llega a la plataforma.
      {produccion ? (
        <>
          {' '}
          El contenido se crea en <a href={produccion}>{new URL(produccion).host}</a>.
        </>
      ) : null}
    </div>
  )
}
