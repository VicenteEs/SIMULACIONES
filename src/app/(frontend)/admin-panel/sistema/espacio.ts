import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Cuánto pesa una carpeta, para la tarjeta «Espacio en disco» de Sistema
 * (P-007 E5, D-238).
 *
 * Penpot reparte el disco entre «Sistema», «Atlas 3D» y «Respaldos». De eso la
 * aplicación solo puede medir lo suyo, cada cosa por su lado: la base se lo
 * pregunta a PostgreSQL y las carpetas se recorren aquí. Lo demás del disco
 * —el sistema operativo, las imágenes de Docker, otras páginas del mismo
 * servidor— no es de nadie que la aplicación conozca, y no se le pone nombre.
 */

export interface PesoDeCarpeta {
  bytes: number
  archivos: number
  /** `false` si se llegó al tope de archivos: entonces `bytes` es «al menos». */
  completo: boolean
}

/**
 * Hasta dónde se cuenta. La página de Sistema es la que se abre cuando algo va
 * mal, y no puede quedarse medio minuto haciendo `stat` sobre una carpeta de
 * medios que creció sin control: con el tope, tarda lo que tarde ese número de
 * archivos y dice que la cifra se quedó corta.
 */
export const TOPE_DE_ARCHIVOS = 50_000

/**
 * El peso de `carpeta` con todo lo que tiene dentro.
 *
 * Una carpeta que no existe pesa cero —no hay nada guardado ahí, que es
 * verdad— y no es un fallo: en una instalación nueva `medios/` todavía no
 * existe. Cualquier otro error (permisos, un disco desmontado) devuelve `null`,
 * y la tarjeta dice que no se pudo medir en vez de enseñar un cero.
 *
 * Los enlaces simbólicos no se siguen: uno que apuntara a la carpeta padre
 * haría el recorrido infinito, y lo enlazado ya se cuenta donde vive.
 */
export async function pesoDeCarpeta(carpeta: string, tope = TOPE_DE_ARCHIVOS): Promise<PesoDeCarpeta | null> {
  const total: PesoDeCarpeta = { bytes: 0, archivos: 0, completo: true }

  const recorrer = async (ruta: string): Promise<void> => {
    if (!total.completo) return
    const entradas = await readdir(ruta, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      // Una subcarpeta que desaparece a mitad del recorrido no se cuenta; la
      // de arriba que no existe sí llega al `catch` de fuera, que la da por
      // vacía. Si la regla fuera la misma para las dos, una subcarpeta borrada
      // a destiempo dejaría en cero la carpeta entera.
      if (error.code === 'ENOENT' && ruta !== carpeta) return []
      throw error
    })
    const archivos = entradas.filter((e) => e.isFile())
    const cabe = Math.max(0, tope - total.archivos)
    if (archivos.length > cabe) total.completo = false
    const tamanos = await Promise.all(
      // Un archivo que se borra entre el `readdir` y el `stat` —un respaldo que
      // el guion acaba de rotar— no vale el fallo de la carpeta entera.
      archivos.slice(0, cabe).map((e) => stat(join(ruta, e.name)).then((s) => s.size, () => 0)),
    )
    total.archivos += tamanos.length
    total.bytes += tamanos.reduce((t, b) => t + b, 0)
    for (const e of entradas) if (e.isDirectory()) await recorrer(join(ruta, e.name))
  }

  try {
    await recorrer(carpeta)
    return total
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { bytes: 0, archivos: 0, completo: true }
    console.error(`[sistema] no se pudo medir ${carpeta}:`, error)
    return null
  }
}
