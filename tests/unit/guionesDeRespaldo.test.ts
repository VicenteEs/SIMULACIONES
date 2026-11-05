import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Los guiones de respaldo del anfitrión, con la llave de cifrado puesta y sin
 * ella (D-295): `tests/guiones/respaldosCifrados.sh`, que los corre con un
 * docker y un age de mentira y dice por qué está en bash.
 *
 * Es la otra mitad de `respaldoCifrado.test.ts`, que prueba el botón del panel.
 * Lo que guardan las dos es lo mismo: en un servidor configurado para cifrar,
 * ningún volcado en claro queda en el disco. Un guion que lo rompa no falla en
 * ninguna parte que se vea: el respaldo de cada noche sale, salud.sh lo cuenta,
 * y la copia legible se queda treinta días donde el aviso de privacidad dice
 * que no la hay.
 *
 * En Windows hace falta el bash de Git, y se busca donde lo instala Git para
 * Windows. El `bash` que se encuentra en el PATH puede ser el de WSL
 * (`C:\Windows\System32\bash.exe`), que corre en otra máquina con otras rutas y
 * no ve el repositorio por el camino que se le da. Sin un bash que sirva, la
 * prueba se omite y lo dice; en el servidor y en Linux, bash está siempre.
 */

const RAIZ = process.cwd()
const BANCO = path.join(RAIZ, 'tests', 'guiones', 'respaldosCifrados.sh')

function buscarBash(): string | null {
  if (process.platform !== 'win32') {
    return spawnSync('bash', ['-c', 'exit 0']).status === 0 ? 'bash' : null
  }
  const candidatos = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]
    .filter((carpeta): carpeta is string => Boolean(carpeta))
    .map((carpeta) => path.join(carpeta, 'Git', 'bin', 'bash.exe'))
  return candidatos.find((ruta) => existsSync(ruta)) ?? null
}

const BASH = buscarBash()

// Las rutas de Windows, con barras normales: el bash de Git las entiende así, y
// con barras invertidas las tomaría por caracteres escapados.
const paraBash = (ruta: string) => ruta.replace(/\\/g, '/')

describe('los guiones de respaldo con la llave de cifrado', () => {
  it.skipIf(!BASH)(
    'cifran, no dejan nada en claro y restauran con la llave que corresponde',
    () => {
      const resultado = spawnSync(BASH!, [paraBash(BANCO), paraBash(RAIZ)], {
        encoding: 'utf8',
        // Doce segundos en un portátil con Windows, más con la suite entera
        // corriendo al lado. El techo está para que un guion colgado en una
        // pregunta no deje la suite esperando para siempre.
        timeout: 170_000,
      })
      const salida = `${resultado.stdout ?? ''}${resultado.stderr ?? ''}`
      expect(resultado.error, salida).toBeUndefined()
      expect(salida).not.toMatch(/FALLA /)
      expect(resultado.status, salida).toBe(0)
      expect(salida).toContain('TODO BIEN')
    },
    180_000,
  )
})
