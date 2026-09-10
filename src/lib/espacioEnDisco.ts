import { statfs } from 'node:fs/promises'

/**
 * Espacio libre en el disco donde vive la plataforma.
 *
 * La página de Sistema prometía en su cabecera responder por «base, correo,
 * respaldos y espacio», y de las cuatro cosas el espacio no lo miraba nadie:
 * enseñaba el peso de la base y la suma de los respaldos, que es espacio
 * *ocupado*, nunca el que queda. Y es la que peor avisa por su cuenta: cuando
 * el disco se llena, `pg_dump` deja un respaldo truncado y PostgreSQL deja de
 * aceptar escrituras, las dos cosas a la vez y sin previo aviso.
 *
 * El umbral es el mismo que usa `scripts/salud.sh`: por encima del 90 por
 * ciento de uso, se avisa. Dos sitios con el mismo criterio, y con esto ya no
 * hay que elegir cuál mirar.
 */

export const UMBRAL_DE_USO = 90

export interface EspacioEnDisco {
  bytesLibres: number
  bytesTotales: number
  /** Porcentaje usado, redondeado. */
  usado: number
}

export async function espacioEnDisco(ruta = process.cwd()): Promise<EspacioEnDisco | null> {
  try {
    const datos = await statfs(ruta)
    const bytesTotales = datos.blocks * datos.bsize
    // `bavail` y no `bfree`: parte del espacio libre está reservado para el
    // administrador del sistema y la aplicación no puede usarlo.
    const bytesLibres = datos.bavail * datos.bsize
    if (!bytesTotales) return null
    return {
      bytesLibres,
      bytesTotales,
      usado: Math.round(((bytesTotales - bytesLibres) / bytesTotales) * 100),
    }
  } catch {
    // No en todos los sistemas de archivos está disponible. Sin dato es mejor
    // callar que inventar una tranquilidad.
    return null
  }
}
