'use client'

import { useSyncExternalStore } from 'react'

/**
 * Lo que quien mira dejó plegado en la consola (P-012 E5): las dos columnas, el panel del instrumento y su visor 3D.
 *
 * En una pantalla de portátil (1366 × 768, unos 1366 × 657 de ventana) el lienzo ocupaba el 29 % de la pantalla: dos
 * columnas de 264 y 316 px, el panel del instrumento con su visor encima y, arriba y abajo, las barras de los pasos, de los
 * modos y de las medidas. Plegar lo que ya se sabe —la mesa, cuando se trabaja con las teclas; el paso, cuando ya se leyó—
 * es lo que deja el lienzo grande sin quitarle nada a quien todavía lo necesita.
 *
 * Se recuerda en el navegador y no en la cuenta: es una comodidad de esa pantalla, y en el teléfono no hay nada que plegar.
 * Es el almacén mínimo de `CajonDelPanel`: `useSyncExternalStore` y no un efecto que apunte en un estado, para que el
 * servidor pinte todo desplegado y el navegador lo corrija al hidratar sin un parpadeo de `setState`. `enMemoria` cubre un
 * navegador sin `localStorage` (ventana privada): ahí lo plegado vale hasta recargar.
 */

const enMemoria = new Map<string, boolean>()
const oyentes = new Set<() => void>()

const suscribirse = (oyente: () => void) => {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

function leer(clave: string, porOmision: boolean): boolean {
  const recordado = enMemoria.get(clave)
  if (recordado !== undefined) return recordado
  try {
    const valor = window.localStorage.getItem(clave)
    return valor === null ? porOmision : valor === 'si'
  } catch {
    return porOmision
  }
}

function poner(clave: string, valor: boolean) {
  enMemoria.set(clave, valor)
  try {
    window.localStorage.setItem(clave, valor ? 'si' : 'no')
  } catch {
    // Se queda en memoria hasta recargar.
  }
  oyentes.forEach((o) => o())
}

/** Si `clave` está plegado y cómo cambiarlo. `porOmision` es lo que se pinta en el servidor y la primera vez. */
export function usePlegado(clave: string, porOmision = false): [boolean, (valor: boolean) => void] {
  const valor = useSyncExternalStore(
    suscribirse,
    () => leer(clave, porOmision),
    () => porOmision,
  )
  return [valor, (nuevo: boolean) => poner(clave, nuevo)]
}
