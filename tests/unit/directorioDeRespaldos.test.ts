import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listarRespaldos, problemaDelDirectorio } from '@/lib/respaldosServidor'

/**
 * La carpeta de respaldos sin permisos no es una carpeta vacía (O-067).
 *
 * En `ved` la carpeta era del usuario del anfitrión con permisos 770 y la
 * aplicación corre como el 1001 de la imagen: «Respaldar ahora» fallaba con un
 * `EACCES` en inglés y, a la vez, la página de sistema afirmaba «no hay ningún
 * respaldo» con once en el disco, porque `listarRespaldos` se tragaba cualquier
 * error como si fuera «todavía no existe». Estas pruebas fijan la diferencia:
 * lo que no existe es una lista vacía; lo que no se puede leer, un error que
 * dice por qué.
 *
 * Como root los permisos no cuentan —el núcleo le deja leer una carpeta 000—,
 * así que las dos pruebas de permisos se omiten si la suite corre como root.
 */

const esRoot = typeof process.getuid === 'function' && process.getuid() === 0
let carpeta = ''
const anterior = process.env.RESPALDOS_DIR

beforeEach(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'respaldos-'))
  process.env.RESPALDOS_DIR = carpeta
})

afterEach(async () => {
  await chmod(carpeta, 0o700).catch(() => {})
  await rm(carpeta, { recursive: true, force: true })
  if (anterior === undefined) delete process.env.RESPALDOS_DIR
  else process.env.RESPALDOS_DIR = anterior
})

describe('el directorio de respaldos', () => {
  it('uno que todavía no existe es «ningún respaldo», sin problema que avisar', async () => {
    process.env.RESPALDOS_DIR = join(carpeta, 'todavia-no')
    await expect(listarRespaldos()).resolves.toEqual([])
    await expect(problemaDelDirectorio()).resolves.toBeNull()
  })

  it('uno legible lista lo suyo y no avisa de nada', async () => {
    await writeFile(join(carpeta, 'base-20260926-030001.sql.gz'), 'x'.repeat(2048))
    await writeFile(join(carpeta, 'notas.txt'), 'no es un respaldo')
    const lista = await listarRespaldos()
    expect(lista.map((r) => r.nombre)).toEqual(['base-20260926-030001.sql.gz'])
    await expect(problemaDelDirectorio()).resolves.toBeNull()
  })

  it.skipIf(esRoot)('uno sin permisos es un error con su motivo, no una lista vacía', async () => {
    await writeFile(join(carpeta, 'base-20260926-030001.sql.gz'), 'x'.repeat(2048))
    await chmod(carpeta, 0o000)
    const fallo = await listarRespaldos().then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )
    expect(fallo).toMatch(/Sin permiso sobre el directorio de respaldos/)
    // Dice quién es el proceso y de quién es la carpeta: sin eso, el mensaje
    // no ayuda a nadie a decidir qué cambiar.
    expect(fallo).toMatch(/corre como el usuario \d+ \(grupo \d+\)/)
    expect(fallo).toMatch(/permisos 0/)
    expect(fallo).toMatch(/user: "1001:\d+"/)
  })

  it.skipIf(esRoot)('problemaDelDirectorio lo avisa también cuando se lee pero no se escribe', async () => {
    await chmod(carpeta, 0o500)
    await expect(listarRespaldos()).resolves.toEqual([])
    await expect(problemaDelDirectorio()).resolves.toMatch(/Sin permiso/)
  })
})
