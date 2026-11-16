import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { leerFoto, leerHistorial, type FotoDelServidor, type Muestra } from '@/lib/estadoDelServidor'

/**
 * Lee lo que dejó `scripts/estado-del-servidor.sh` en la carpeta que el
 * contenedor monta en solo lectura (`./estado:/estado:ro`, D-408).
 *
 * Fuera de Contabo la carpeta está vacía o no existe: ni ved ni el equipo de
 * desarrollo tienen el cron. Eso no es un error, y la pestaña lo dice así.
 */

export type EstadoLeido =
  | { tipo: 'sin-guion' }
  | { tipo: 'ilegible'; detalle: string }
  | { tipo: 'listo'; foto: FotoDelServidor; historial: Muestra[] }

export const carpetaDelEstado = (entorno: Record<string, string | undefined> = process.env): string =>
  entorno.ESTADO_DIR || '/estado'

const noExiste = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'

export async function leerElEstadoDelServidor(carpeta = carpetaDelEstado()): Promise<EstadoLeido> {
  let contenido: string
  try {
    contenido = await readFile(join(carpeta, 'servidor.json'), 'utf8')
  } catch (error) {
    if (noExiste(error)) return { tipo: 'sin-guion' }
    return { tipo: 'ilegible', detalle: (error as Error).message }
  }
  const foto = leerFoto(contenido)
  if (!foto) return { tipo: 'ilegible', detalle: 'servidor.json no tiene el formato que escribe el guion.' }

  // El historial puede faltar sin que falte la foto: el primer minuto, o si se
  // borró a mano. Sin él la pestaña pinta la foto y se salta el gráfico.
  let historial: Muestra[] = []
  try {
    historial = leerHistorial(await readFile(join(carpeta, 'historial.csv'), 'utf8'))
  } catch {
    historial = []
  }
  return { tipo: 'listo', foto, historial }
}
