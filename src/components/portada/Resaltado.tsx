import React from 'react'
import { trozosResaltados } from '@/lib/espaciosDeLaPagina'

/**
 * Un texto de «Medios de la página» con lo que va entre asteriscos en color.
 *
 * Se arma con elementos de React y nunca con `dangerouslySetInnerHTML`: el
 * texto lo escribe el administrador, y así lo peor que puede pasar con un
 * texto raro es que se lea raro.
 */
export function Resaltado({ texto }: { texto: string }) {
  return (
    <>
      {trozosResaltados(texto).map((trozo, i) =>
        trozo.resaltado ? (
          <em key={i} className="p-resaltado">
            {trozo.texto}
          </em>
        ) : (
          <React.Fragment key={i}>{trozo.texto}</React.Fragment>
        ),
      )}
    </>
  )
}
