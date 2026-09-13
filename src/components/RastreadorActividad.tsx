'use client'

import React, { useEffect, useState } from 'react'
import { registrarVisita, marcarComoLeida } from '@/app/(frontend)/acciones/actividad'

export function RastreadorActividad({
  coleccion,
  documentoId,
  completadoInicial = false,
  anotarVisita = true,
  nombreDeLaFicha,
}: {
  coleccion: string
  documentoId: string
  completadoInicial?: boolean
  /**
   * Si montar este rastreador cuenta como haber visitado la ficha.
   *
   * En los cuatro módulos con página por documento sí, y por eso vale `true`
   * por omisión y ninguno de los cuatro escribe la propiedad: montarlo es
   * exactamente el gesto de haber abierto esa ficha y solo esa.
   *
   * El examen físico no tiene página por documento: pinta todas sus maniobras
   * juntas en un listado (`examen-fisico/page.tsx`), así que ahí se montan
   * tantos rastreadores como maniobras publicadas. Con la visita automática,
   * abrir el listado una vez escribía una fila de `actividad` por maniobra
   * —treinta acciones de servidor en el mismo instante— y, peor que el coste,
   * era falso: «Continúa leyendo» de la portada ordena por `ultimaVisita` y se
   * habría llenado de maniobras que nadie miró, tapando justo las fichas que el
   * residente sí dejó a medias. Ese listado pasa `false`; la única visita que
   * de verdad ocurrió —la de la maniobra a la que apuntaba el enlace— la anota
   * `VisitaDeManiobraEnlazada`.
   *
   * Marcar «leída» no depende de esto y sigue escribiendo siempre: es un gesto
   * del residente sobre una maniobra concreta, no una suposición nuestra.
   */
  anotarVisita?: boolean
  /**
   * Qué ficha nombra esta casilla, cuando la página no la nombra ya.
   *
   * En los cuatro módulos con página por documento la casilla es una y el `<h1>`
   * dice de qué ficha se trata, así que ninguno escribe la propiedad y el texto
   * fijo del `<span>` basta como nombre accesible.
   *
   * En el examen físico son N maniobras seguidas en la misma página, y sin esto
   * el lector de pantalla recita N veces «casilla de verificación, Marcar como
   * leída» sin decir de cuál: marcar la que se acaba de leer queda en contar
   * casillas desde arriba. Es palabra por palabra el problema que
   * `FormularioComentario` ya resuelve con su `label` —dos líneas más abajo, en
   * la misma tarjeta— y se resuelve igual: lo nombra quien sabe el nombre, que
   * es el listado y no el componente.
   *
   * Va al `<input>` como `aria-label` y no al `<span>`: el texto visible dice el
   * estado en el que quedará la casilla y cabe donde cabe; el nombre accesible
   * puede ser más largo sin romper la tarjeta.
   */
  nombreDeLaFicha?: string
}) {
  const [completado, setCompletado] = useState(completadoInicial)
  const [cargando, setCargando] = useState(false)

  // Sin `await` y sin `catch` a propósito: `registrarVisita` no propaga nada
  // —lo explica su cabecera en `acciones/actividad.ts`— porque la visita es una
  // comodidad y su fallo no puede estropear la lectura de la ficha.
  useEffect(() => {
    if (!anotarVisita) return
    registrarVisita(coleccion, documentoId)
  }, [coleccion, documentoId, anotarVisita])

  async function alternarLeida() {
    setCargando(true)
    const nuevoEstado = !completado
    // La casilla se mueve antes de que conteste el servidor porque el gesto
    // tiene que responder al instante, y se devuelve a su sitio si la escritura
    // falla: dejarla marcada sobre una escritura que no ocurrió es lo único
    // peor que no marcarla, y es la razón de que `marcarComoLeida` lance en vez
    // de tragarse el fallo.
    setCompletado(nuevoEstado)
    try {
      await marcarComoLeida(coleccion, documentoId, nuevoEstado)
    } catch {
      setCompletado(!nuevoEstado)
    }
    setCargando(false)
  }

  return (
    <div className="rastreador-actividad">
      <label className="checkbox-leida">
        {/* `undefined` y no una cadena armada siempre: sin nombre de ficha el
            atributo no se pinta y el nombre accesible vuelve a salir del
            `<span>` de abajo a través del `<label>`, que es lo correcto en las
            cuatro páginas por documento. Un `aria-label=""` lo dejaría sin
            nombre, y uno con el texto repetido sería mantener dos veces la
            misma frase. */}
        <input
          type="checkbox"
          checked={completado}
          onChange={alternarLeida}
          disabled={cargando}
          aria-label={
            nombreDeLaFicha
              ? `${completado ? 'Marcada' : 'Marcar'} «${nombreDeLaFicha}» como leída`
              : undefined
          }
        />
        <span>{completado ? 'Marcada como leída' : 'Marcar como leída'}</span>
      </label>
    </div>
  )
}
