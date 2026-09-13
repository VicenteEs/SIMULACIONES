'use client'

import { useCallback, useState } from 'react'
import { RastreadorActividad } from '@/components/RastreadorActividad'
import { ConsolaQuirurgica, type CasoDeConsola } from './ConsolaQuirurgica'
import type { RecorridoGuardado } from '@/lib/progresoDelSimulador'

/**
 * La casilla de «leída» y la consola de un caso, puestas de acuerdo.
 *
 * Existe por una sola razón: desde que terminar el caso lo marca como leído
 * (`marcarCasoComoLeido` en `ConsolaQuirurgica.tsx`), hay dos sitios de la
 * misma página que escriben `completado` y solo uno que lo enseña. La casilla
 * es de `RastreadorActividad`, que guarda su estado dentro y lo toma una vez de
 * `completadoInicial`; cuando la consola marca, esa casilla no se entera y
 * sigue diciendo «Marcar como leída» sobre un caso que la base ya da por leído,
 * con el panel de «Caso terminado» afirmando lo contrario seiscientos píxeles
 * más abajo.
 *
 * Las dos piezas eran hermanas en un componente de servidor, y un componente de
 * servidor no puede pasarle a una la noticia de la otra. Por eso este envoltorio
 * de cliente, y no un `router.refresh()`: refrescar volvería a pintar la
 * consola con un `caso` recién deserializado, y eso recarga el modelo 3D y
 * enseña el recorrido que se acaba de hacer como «Su recorrido anterior»
 * justo encima del marcador que lo está contando.
 *
 * La casilla se vuelve a montar (`key`) cada vez que la consola marca, y nace
 * marcada. No basta con cambiarle `completadoInicial`: `RastreadorActividad` lo
 * lee con `useState` y no vuelve a mirarlo. Y se cuenta cada marca en lugar de
 * guardar un booleano, porque el caso de ida y vuelta es real: quien entra con
 * el caso ya leído, lo desmarca a mano y lo termina otra vez tiene la casilla
 * en blanco y el `true` de siempre; con un booleano la `key` no cambiaría y la
 * casilla se quedaría mintiendo.
 *
 * El precio de volver a montarla es una visita más (`registrarVisita` al
 * montar), que solo adelanta la `ultimaVisita` de una ficha que el residente
 * tiene abierta delante. Es verdad, y no cuesta nada.
 */
export function CasoConSuLectura({
  caso,
  documentoId,
  recorridoGuardado,
  completadoInicial,
}: {
  caso: CasoDeConsola
  documentoId: string
  recorridoGuardado: RecorridoGuardado | null
  completadoInicial: boolean
}) {
  const [marcasDeLaConsola, setMarcasDeLaConsola] = useState(0)
  const alMarcarComoLeido = useCallback(() => setMarcasDeLaConsola((n) => n + 1), [])

  return (
    <>
      {/*
        Arriba y no al final: quien termina la consola se queda dentro de ella
        —no hay nada que empuje a seguir bajando—. En la biblioteca la casilla
        vive en la cabecera por lo mismo. Terminar el caso la marca sola; la
        casilla sigue aquí para quien quiera marcarlo sin recorrerlo, o
        desmarcarlo para volver a encontrarlo en «Continúa leyendo».
      */}
      <RastreadorActividad
        key={marcasDeLaConsola}
        coleccion="cirugias"
        documentoId={documentoId}
        completadoInicial={marcasDeLaConsola > 0 || completadoInicial}
      />

      <ConsolaQuirurgica
        caso={caso}
        documentoId={documentoId}
        recorridoGuardado={recorridoGuardado}
        alMarcarComoLeido={alMarcarComoLeido}
      />
    </>
  )
}
