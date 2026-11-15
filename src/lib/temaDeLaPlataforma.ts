/**
 * La paleta elegida, para las páginas (P-014 E7).
 *
 * Con `cache` de React, una vez por petición, como `modulosEnMantencion`: la plantilla del sitio —que la pone
 * en `<body>` para la consola— y la página del taller —que se la pasa a su selector— preguntan lo mismo en el
 * mismo pintado.
 *
 * No lanza. Una paleta es un adorno, y que la tabla de ajustes no conteste —o que la columna aún no exista, en
 * un servidor que arrancó antes de aplicar su migración— no puede dejar a un residente sin su caso: se pinta
 * con la de fábrica y se deja dicho en el registro.
 */
import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { leerElTema, TEMA_POR_OMISION, type Tema } from '@/lib/temas'

export const temaDeLaPlataforma = cache(async function temaDeLaPlataforma(): Promise<Tema> {
  try {
    return await leerElTema(await getPayload({ config }))
  } catch (error) {
    console.error('[tema] no se pudo leer la paleta; se usa la de fábrica:', error)
    return TEMA_POR_OMISION
  }
})
