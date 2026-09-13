import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia de los modales del panel: la caja y los campos de dentro.
 *
 * Una hoja de estilos no tiene compilador que la contradiga, y estos tres
 * valores son de los que solo fallan en la máquina de otro:
 *
 *   - Sin alto máximo, un modal más alto que la ventana deja sus botones fuera
 *     de la pantalla. El velo es `position: fixed`, así que desplazar la página
 *     no lo mueve: la única salida era cerrar y perder lo escrito. El de
 *     permisos de `usuarios` mide unos 675 px y no cabe en un portátil 1080p
 *     con el escalado de Windows al 125 %, que es la máquina del hospital.
 *   - El arreglo vivió un tiempo escrito en línea dentro de `EnvolturaModal`,
 *     donde cubría tres modales y dejaba fuera los del resto del panel. Al
 *     bajarlo a la hoja hay que quitarlo de allí, o quedan dos copias de la
 *     misma regla esperando a divergir.
 *   - `.admin-form-input` declaraba fondo y no color: con el sistema en modo
 *     oscuro, el navegador pinta el texto de un control en claro y caía sobre
 *     un fondo claro. Sus vecinas —`.admin-select, .admin-input`— sí lo
 *     declaran; esta se había quedado fuera, y es la de los tres formularios de
 *     cuentas.
 */

const RAIZ = process.cwd()
const HOJA = join(RAIZ, 'src', 'app', '(frontend)', 'admin-panel', 'admin.css')
const TABLA_USUARIOS = join(
  RAIZ,
  'src',
  'app',
  '(frontend)',
  'admin-panel',
  'usuarios',
  'TablaUsuarios.tsx',
)

/** Los comentarios se quitan: los de esta casa citan el valor que explican. */
const sinComentarios = (fuente: string) => fuente.replace(/\/\*[\s\S]*?\*\//g, ' ')

const hoja = sinComentarios(readFileSync(HOJA, 'utf8'))
const tablaUsuarios = readFileSync(TABLA_USUARIOS, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** El cuerpo de la primera regla cuyo selector es exactamente `selector`. */
function cuerpoDe(selector: string): string {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const encontrado = hoja.match(new RegExp(`(?:^|\\})\\s*${escapado}\\s*\\{([^}]*)\\}`))
  return encontrado?.[1] ?? ''
}

describe('la caja de un modal cabe en la pantalla', () => {
  it('`.admin-modal` acota su alto y se desplaza por dentro', () => {
    const cuerpo = cuerpoDe('.admin-modal')
    expect(cuerpo).toMatch(/max-height\s*:/)
    expect(cuerpo).toMatch(/overflow-y\s*:\s*auto/)
  })

  it('`.admin-modal-backdrop` deja aire y se desplaza si aun así no cabe', () => {
    const cuerpo = cuerpoDe('.admin-modal-backdrop')
    expect(cuerpo).toMatch(/overflow-y\s*:\s*auto/)
    expect(cuerpo).toMatch(/padding\s*:/)
  })

  it('la regla no se repite en línea dentro de `EnvolturaModal`', () => {
    expect(tablaUsuarios).not.toContain('maxHeight')
    expect(tablaUsuarios).not.toContain('overflowY')
  })
})

describe('los campos de los formularios del panel', () => {
  it('`.admin-form-input` declara el color de su texto además del fondo', () => {
    const cuerpo = cuerpoDe('.admin-form-input')
    expect(cuerpo).toMatch(/background-color\s*:/)
    expect(cuerpo).toMatch(/(^|;)\s*color\s*:/)
  })
})
