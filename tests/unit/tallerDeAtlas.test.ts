import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia del taller del atlas, `src/components/admin/atlas/TallerDeAtlas.tsx`.
 *
 * Se lee el archivo como texto, igual que en `visorAtlas.test.ts`, y por la
 * misma razón: el entorno de estas pruebas es `node` y el proyecto no tiene
 * jsdom ni biblioteca de componentes (ver el comentario de `vitest.config.ts`),
 * así que aquí no hay manera de montar el taller ni de girar una cámara de
 * three.js.
 *
 * Lo que sí se puede vigilar es el reparto del aviso de «cambios sin guardar»
 * en dos mitades, que es donde esto ya se rompió por los dos lados:
 *
 *  - Con la cámara **fuera** del aviso, media hora buscando el ángulo que
 *    enseña la fractura no encendía nada: la cabecera seguía diciendo que no
 *    había nada pendiente y, al pulsar «Cuerpo completo», saltaba de golpe un
 *    `confirm` que afirmaba lo contrario.
 *  - Con la cámara **dentro de `sucio`**, que es la tentación obvia al
 *    arreglarlo, se rompe la otra punta: `sucio` es además la guardia de
 *    `exportar()`, y girar el modelo para comprobar la preparación antes de
 *    exportarla dejaba de permitir exportarla, con un mensaje que mandaba
 *    guardar lo que ya estaba guardado.
 *
 * Ninguna de las dos averías da error en ninguna parte.
 */

const TALLER = join(
  process.cwd(),
  'src',
  'components',
  'admin',
  'atlas',
  'TallerDeAtlas.tsx',
)
// Los finales de línea se normalizan al leer: en Windows el árbol se saca con
// CRLF y los `\n\n` de los patrones de abajo no casaban con un solo archivo,
// así que la prueba pasaba en la integración continua y fallaba en el portátil
// de quien la escribió —o al revés, que es peor.
const fuente = readFileSync(TALLER, 'utf8').replace(/\r\n/g, '\n')

/** La expresión de un `const <nombre> = …` hasta la línea en blanco siguiente. */
function expresionDe(nombre: string): string {
  const casa = fuente.match(new RegExp(`\\n  const ${nombre} =([\\s\\S]*?)\\n\\n`))
  expect(casa, `no se encontró \`${nombre}\``).not.toBeNull()
  return casa![1]
}

/** El trozo de fuente que va de una marca a la siguiente. */
function entre(inicio: string, fin: string): string {
  const desde = fuente.indexOf(inicio)
  expect(desde, `no se encontró «${inicio}»`).toBeGreaterThan(-1)
  const hasta = fuente.indexOf(fin, desde + 1)
  expect(hasta, `no se encontró «${fin}» después de «${inicio}»`).toBeGreaterThan(desde)
  return fuente.slice(desde, hasta)
}

describe('el taller del atlas y el trabajo sin guardar', () => {
  it('deja la cámara fuera de `sucio`, que es la guardia de exportar', () => {
    // Lo que se exporta es geometría, y la geometría no cambia por mirarla
    // desde otro lado.
    expect(expresionDe('sucio')).not.toContain('camaraMovida')

    const exportar = entre('const exportar = () => {', 'const candidatas')
    expect(exportar).toContain('if (sucio)')
    expect(exportar).not.toContain('camaraMovida')
    expect(exportar).not.toContain('hayQueAvisar')
  })

  it('enciende el cartel y la insignia también cuando solo se movió la cámara', () => {
    // El encuadre **se guarda** —`guardar()` escribe la cámara— y es
    // exactamente lo que el residente ve al abrir la ficha.
    expect(expresionDe('hayQueAvisar')).toContain('camaraMovida')
    expect(fuente).toContain('{hayQueAvisar ? <span className="editor-sucio">')
    expect(fuente).toContain('{hayQueAvisar ? (')
    // Y ninguno de los dos vuelve a colgar solo de `sucio`.
    expect(fuente).not.toContain('{sucio ?')
  })

  it('apaga la marca de la cámara al fijar una referencia nueva', () => {
    // El encuadre entra en la referencia al guardar o al abrir. Sin esto el
    // cartel se quedaba encendido después de guardar, hasta que alguien
    // volviera a tocar la cámara.
    expect(entre('const fijarReferencia', 'const encuadreMovido')).toContain(
      'setCamaraMovida(false)',
    )
  })

  it('escucha el final del gesto sobre el contenedor del visor', () => {
    // Es lo único que enciende `camaraMovida`: la cámara vive dentro de three.js
    // y no pasa nunca por el estado de React.
    const centro = entre('className="atlas-centro"', '<VisorAtlas')
    expect(centro).toContain('onPointerUp={revisarEncuadre}')
    expect(centro).toContain('onWheel={revisarEncuadre}')
  })

  it('pregunta por la cámara de verdad antes de tirar el trabajo', () => {
    // `camaraMovida` es una copia para poder pintar, y se queda atrás: se
    // apaga al guardar aunque el traumatólogo siguiera girando mientras se
    // guardaba. La confirmación mira el mando, que es la respuesta buena.
    const confirmar = entre('const confirmarDescarte', '// Y el mismo aviso')
    expect(confirmar).toContain('encuadreMovido()')
    expect(confirmar).not.toContain('camaraMovida')
  })

  it('anota el tipo del ref que avisa al cerrar la pestaña', () => {
    // Sin la anotación, TypeScript infiere `() => false` —el literal, que en
    // posición de retorno no ensancha— del valor inicial, y asignarle después
    // un `() => boolean` no compila. No lo ve ESLint: tumba `npm run build`.
    expect(fuente).toContain('useRef<() => boolean>(() => false)')
  })
})
