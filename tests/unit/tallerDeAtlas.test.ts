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
 *
 * Y lo segundo que se vigila, por el mismo motivo, es el reparto del motor 3D
 * en dos mitades: el `dynamic()` del visor y el `import()` del cargador
 * sostienen la misma promesa y ninguno sirve sin el otro. La línea que deshaga
 * cualquiera de las dos devuelve los 725 KB de three al trozo de entrada de la
 * página sin que nada falle, sin que nadie lo note en desarrollo y sin que se
 * pierda un solo píxel de la pantalla. Ya ocurrió una vez —durante una versión
 * entera el comentario del taller tuvo que confesarlo— y hasta ahora la única
 * defensa de esa mitad era ese comentario.
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

    const exportar = entre('const exportar = () => {', 'const conAviso')
    // Con cambios sin guardar se guarda primero y se exporta con el id que devuelve el guardado.
    expect(exportar).toContain('if (!instancia || sucio)')
    expect(exportar).toContain('guardar({ alTerminar: exportarGuardada })')
    expect(exportar).not.toContain('camaraMovida')
    expect(exportar).not.toContain('hayQueAvisar')
  })

  it('enciende el cartel y la insignia también cuando solo se movió la cámara', () => {
    // El encuadre **se guarda** —`guardar()` escribe la cámara— y es
    // exactamente lo que el residente ve al abrir la ficha.
    expect(expresionDe('hayQueAvisar')).toContain('camaraMovida')
    // La insignia de la cabecera y el recuadro cuelgan de `hayQueAvisar`. Con el
    // guardado automático la insignia dice «guardando…» cuando se guarda sola y
    // el recuadro solo sale cuando hay que pedir algo (un nombre, una pieza):
    // por eso ya no son una sola línea, pero siguen colgando de lo mismo.
    expect(fuente).toMatch(/\{hayQueAvisar \? \(\s*<span className="editor-sucio">/)
    expect(fuente).toMatch(/\{hayQueAvisar && \(/)
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

  it('al eliminar no promete un visor vacío: dice que se negará y enseña por qué', () => {
    // `eliminarInstancia` se niega si una ficha usa la preparación y nombra
    // cuáles. La confirmación de antes seguía avisando de que «su visor se
    // quedará vacío», que ya no puede pasar, y callaba la negativa.
    const eliminar = entre('className="lista-quitar"', 'Eliminar\n')
    expect(eliminar).not.toContain('se quedará vacío')
    expect(eliminar).toContain('Si alguna ficha la usa, no se eliminará')
    // Y pregunta con el diálogo de la casa, no con el `confirm()` del navegador.
    expect(eliminar).toContain('await confirmar({')
    expect(eliminar).not.toMatch(/(?<![\w.])confirm\(/)
    // Y la negativa llega a la pantalla: pasa por `conAviso`, que pinta el
    // `mensaje` de la acción —los títulos de las fichas— y no uno genérico.
    expect(eliminar).toContain('() => eliminarInstancia(g.id)')
    expect(entre('const conAviso = (', 'const resumen')).toContain(
      "setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo completar.' })",
    )
  })

  it('anota el tipo del ref que avisa al cerrar la pestaña', () => {
    // Sin la anotación, TypeScript infiere `() => false` —el literal, que en
    // posición de retorno no ensancha— del valor inicial, y asignarle después
    // un `() => boolean` no compila. No lo ve ESLint: tumba `npm run build`.
    expect(fuente).toContain('useRef<() => boolean>(() => false)')
  })
})

/**
 * Un import estático de un módulo: con cláusula —`import … from '…'`, en una
 * línea o repartido en varias, con llaves o con `*`— o de solo efecto
 * —`import '…'`—. Son todas las formas que meten el módulo en el trozo de
 * entrada de la página.
 *
 * Dos cosas quedan fuera a propósito, y las dos son deliberadas:
 *
 *  - `import type`, porque TypeScript lo borra al compilar y no arrastra un
 *    byte al paquete, que es lo único que estas pruebas defienden. El taller
 *    importa así `MandoDelVisor` del visor, y eso es correcto.
 *  - `import('…')`, el dinámico, porque allí el paréntesis va pegado a
 *    `import` y este patrón exige un espacio. Es justo la forma que se quiere.
 *
 * Se construye con `RegExp` y no se escribe literal porque son dos módulos con
 * el mismo patrón, y `/` dentro del constructor no necesita escaparse.
 */
function importaDeFormaEstatica(modulo: string): boolean {
  return new RegExp(`(?:^|\\n)import\\s+(?!type\\s)(?:[\\w*{},\\s]*from\\s+)?'${modulo}'`).test(
    fuente,
  )
}

describe('el taller del atlas y los 725 KB de three', () => {
  it('no vuelve a importar `@/atlas/cargador` de forma estática', () => {
    // `cargador.ts` tiene arriba un `import * as THREE from 'three'`, así que
    // cualquier import normal de este archivo mete el motor entero en el trozo
    // de entrada y el `dynamic()` de abajo deja de adelgazar nada: la pantalla
    // vuelve a tardar segundos en poder pintar «Leyendo el catálogo del
    // atlas…», que es lo primero que el taller tiene que enseñar. De aquí solo
    // se quiere `cargarCatalogo`, que es un `fetch` a un JSON de cuarenta
    // líneas.
    expect(importaDeFormaEstatica('@/atlas/cargador')).toBe(false)
  })

  it('sigue pidiendo el cargador con `import()` desde el efecto del catálogo', () => {
    // La otra cara de la prueba anterior: quitar el import estático y dejar de
    // pedir el módulo también la haría pasar, y el catálogo no se leería.
    expect(fuente).toContain("import('@/atlas/cargador')")
  })

  it('sigue trayendo el visor con `dynamic()` y no de forma estática', () => {
    // La otra mitad del mismo reparto. Con el visor importado arriba, el
    // `import()` del cargador no sirve de nada: three llega igual por esta
    // puerta, porque `VisorAtlas.tsx` sí lo importa de forma normal —y debe,
    // es quien lo usa—.
    expect(importaDeFormaEstatica('@/components/atlas/VisorAtlas')).toBe(false)
    expect(fuente).toContain("import('@/components/atlas/VisorAtlas')")
    // Y con `ssr: false`, porque un lienzo WebGL en el servidor es un hueco
    // vacío.
    expect(entre('const VisorAtlas = dynamic(', 'const HOLGURA_ENCUADRE')).toContain('ssr: false')
  })
})

describe('la lista del taller se queda con lo que quedó tras recortar', () => {
  // Pedido del dueño: tras recortar y quedarse con la mano, apagar un músculo de
  // la mano no debe sacarlo de la lista, para poder volver a encenderlo; y la
  // casilla del grupo «Músculos» no debe encender los del resto del cuerpo. Son
  // las dos mitades de un mismo conjunto de trabajo (`src/atlas/loQueQuedo.ts`),
  // y se rompen en silencio: nada falla, la lista simplemente miente.

  it('quedarse con algo estrecha el conjunto, y apagar no lo toca', () => {
    // «Solo esto» (Mayús + H) tras un recorte, y «solo» de un trozo.
    expect(entre('const dejarSoloLaSeleccion = () => {', '/** Lo que se puede seleccionar')).toContain(
      'cambiarVisibles(piezas, trozosFuera, true)',
    )
    // Apagar la selección (Supr, X, H) NO estrecha: lo apagado sigue listado.
    expect(entre('const apagarSeleccion = () => {', 'const dejarSoloLaSeleccion')).not.toMatch(
      /cambiarVisibles\([^)]*true\)/,
    )
    // Y el único sitio que lo estrecha es `cambiarVisibles`, con su parámetro.
    expect(entre('const cambiarVisibles = (', 'const deshacer')).toContain('if (quedarseCon) setUniverso(')
  })

  it('encender algo de fuera lo suma, para que no desaparezca al apagarlo', () => {
    expect(entre('const cambiarVisibles = (', 'const deshacer')).toContain(
      'ampliarConjunto(actual, orden.piezas)',
    )
  })

  it('«Encender todo» y «Cuerpo» devuelven el atlas entero', () => {
    expect(entre('const encenderTodo = () => {', 'const encuadrarLoElegido')).toContain('setUniverso(null)')
    expect(entre('const empezarDeCero = async', 'const abrirModelo')).toContain('setUniverso(null)')
  })

  it('abrir una preparación o un modelo deja la lista en sus piezas', () => {
    // Con el atlas entero, la casilla de «Músculos» de una preparación de la mano
    // encendería los músculos de todo el cuerpo.
    expect(entre('const abrirModelo = async', 'const abrir = async')).toContain(
      'setUniverso(new Set(piezas))',
    )
    expect(entre('const abrir = async', 'const guardar = (')).toContain(
      'setUniverso(new Set(piezasAbiertas))',
    )
  })

  it('el conjunto viaja en el historial: Ctrl + Z, tras un «solo», devuelve la lista de antes', () => {
    expect(entre('interface PasoDelTaller {', '/** Los aspectos en una cadena')).toContain('universo:')
    expect(entre('const deshacer = () => {', 'const rehacerPaso')).toContain('setUniverso(anterior.universo)')
    expect(entre('const rehacerPaso = () => {', '/** Cambia el color o la opacidad')).toContain(
      'setUniverso(siguiente.universo)',
    )
  })

  it('el conjunto no cuenta para «cambios sin guardar»: es una ayuda, no parte de la preparación', () => {
    expect(expresionDe('sucio')).not.toContain('universo')
    expect(expresionDe('contenidoCambiado')).not.toContain('universo')
  })
})

describe('un hueso recortado no vuelve entero al apagarlo y encenderlo', () => {
  // Fallo contado por quien usa el taller: «cuando activo el hueso de nuevo se
  // renueva completo y no solo lo que había recortado». La causa estaba en
  // dejar caer los trozos apagados de toda pieza que se apaga, y no da ningún
  // error: la malla simplemente vuelve entera. La regla se prueba aparte, en
  // `trozosApagados.test.ts`; aquí, que el taller la use y le dé lo anterior.

  it('todo cambio de lo encendido pasa por la versión con memoria, con los apagados de ahora', () => {
    const cambiar = entre('const cambiarVisibles = (', 'const deshacer')
    expect(cambiar).toContain('ordenarConMemoria(nuevas, nuevosApagados, cortes, apagados)')
    // La versión sin memoria no vuelve a llamarse desde el taller: sería
    // deshacer el arreglo sin que nada falle.
    expect(fuente).not.toMatch(/\bordenarLoEncendido\(/)
  })

  it('lo que se guarda sigue sin llevar trozos de piezas apagadas', () => {
    // La memoria vive solo en pantalla: la copia de la base no arrastra
    // identificadores de piezas que no están.
    expect(entre('const guardar = (', 'const autoguardado')).toContain(
      'apagados: [...apagados].filter((id) => visibles.has(piezaDe(id)))',
    )
  })
})
