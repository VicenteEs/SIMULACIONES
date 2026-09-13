'use client'

import { useEffect } from 'react'
import { registrarVisita } from '@/app/(frontend)/acciones/actividad'
// Constantes puras, sin Payload detrás: por eso `modulos.ts` está separado de
// `datos.ts` y un componente de cliente puede importarlo sin arrastrar el
// servidor al paquete del navegador (lo explica su cabecera).
import { rutaPublica } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Prefijo del ancla de una maniobra, sacado de quien compone los enlaces.
 *
 * El ancla es un contrato entre tres archivos que no se importan entre sí: lo
 * compone `rutaPublica` («/examen-fisico#maniobra-<id>»), lo declara el
 * `<article id={`maniobra-${m.id}`}>` del listado y lo lee esto. Escribirlo
 * aquí a mano sería la tercera copia, y la copia que se queda atrás el día que
 * el examen físico tenga por fin página por documento: `rutaPublica` dejaría de
 * componer anclas, el listado dejaría de declararlas y esta seguiría buscando
 * un `#maniobra-` que ya no manda nadie, anotando visitas de la nada.
 */
const PREFIJO_DEL_ANCLA = `#${rutaPublica('maniobras', '').split('#')[1] ?? ''}`

/**
 * Anota la visita de la maniobra a la que apuntaba el enlace, y de ninguna más.
 *
 * El examen físico pinta sus maniobras todas juntas, así que abrir el listado
 * no es visitar treinta fichas: por eso sus `RastreadorActividad` van con
 * `anotarVisita={false}` y la visita se anota aquí, una sola vez y solo cuando
 * la navegación nombró una maniobra concreta. Es lo que llega desde «Ver
 * publicado ↗» tras publicar, desde «abrir ficha →» sobre un comentario y desde
 * «Continúa leyendo» de la portada: en los tres casos el enlace dice qué
 * maniobra se venía a leer, y eso sí es una visita.
 *
 * Sin esto el módulo desaparecería entero de «Continúa leyendo» —solo se
 * escribiría fila al marcar «leída», y esa nace ya completada—, que es tanto
 * como decirle al residente que el examen físico no se estaba leyendo.
 *
 * Se comprueba contra las maniobras que el listado acaba de pintar porque el
 * ancla la escribe quien quiera en la barra de direcciones: un `#maniobra-9999`
 * a mano creaba una fila de `actividad` apuntando a una ficha inexistente, que
 * después «Continúa leyendo» no puede resolver y descarta en silencio —basura
 * invisible en la tabla del progreso—.
 */
export function VisitaDeManiobraEnlazada({ identificadores }: { identificadores: string[] }) {
  useEffect(() => {
    // Solo al montar, y no en cada `hashchange`: dentro del listado el ancla
    // solo cambia si el residente pulsa el enlace de otra maniobra, y ahí no ha
    // pasado de un documento a otro, sigue en la misma página desplazándose.
    const ancla = window.location.hash
    if (!ancla.startsWith(PREFIJO_DEL_ANCLA)) return

    // Sin decodificar: los identificadores son números y `decodeURIComponent`
    // lanza ante un `%` suelto escrito a mano en la barra de direcciones, lo que
    // convertiría una dirección mal tecleada en un error del efecto.
    const identificador = ancla.slice(PREFIJO_DEL_ANCLA.length)
    if (!identificadores.includes(identificador)) return

    // Sin `await` y sin `catch`, igual que en `RastreadorActividad`:
    // `registrarVisita` no propaga nada porque la visita es una comodidad y su
    // fallo no puede estropear la lectura del listado.
    registrarVisita('maniobras', identificador)
  }, [identificadores])

  return null
}
