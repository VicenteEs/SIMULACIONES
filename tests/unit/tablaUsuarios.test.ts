import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia del teclado en la tabla de usuarios y en sus tres modales.
 *
 * El entorno de estas pruebas es `node` y el proyecto no tiene jsdom, así que
 * el componente no se puede montar y lo que se mira es el archivo en el disco,
 * igual que en `navegacion.test.ts`. Se miran solo las dos propiedades que
 * comparten la costumbre de volver sin que nadie se entere: compilan, se ven
 * bien en pantalla y solo fallan para quien administra con el teclado.
 *
 *   - Un control que se desactiva de verdad mientras su acción viaja suelta el
 *     foco en `<body>`, y la siguiente tabulación arranca desde el principio
 *     del documento. Con treinta y siete filas, eso es volver a bajar entera la
 *     tabla para seguir donde se estaba. Por eso lo que depende del momento se
 *     anuncia con `aria-disabled` y se frena dentro del manejador, y el
 *     `disabled` de verdad se guarda para lo que no depende del momento.
 *   - Un diálogo que se anuncia `aria-modal="true"` promete que detrás no queda
 *     nada alcanzable. Sin ciclar el foco con Tab la promesa es falsa y se
 *     acaba leyendo en voz alta la tabla de cuentas que el velo tapa.
 */

const ARCHIVO = join(
  process.cwd(),
  'src',
  'app',
  '(frontend)',
  'admin-panel',
  'usuarios',
  'TablaUsuarios.tsx',
)

/**
 * El archivo sin comentarios y en una sola línea.
 *
 * Sin quitar los comentarios, media prueba se cumpliría sola: los comentarios
 * de esta casa citan el código que explican, así que buscar `aria-disabled`
 * encontraría el párrafo que dice por qué está puesto y no el atributo.
 */
const CODIGO = readFileSync(ARCHIVO, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ')

const cuantas = (aguja: RegExp): number => CODIGO.match(aguja)?.length ?? 0

describe('los controles de una fila ocupada', () => {
  it('no se desactivan de verdad mientras la acción viaja', () => {
    // El desplegable de rol fue el último en caer: llevaba
    // `disabled={ocupada || esUnoMismo}` y es el control que con más seguridad
    // tiene el foco cuando su acción arranca, porque el `onChange` lo dispara
    // él mismo. La negativa se escribe con lookbehind para que no la cumpla
    // sola la aparición de `aria-disabled={ocupada}`.
    expect(CODIGO).not.toMatch(/(?<!aria-)disabled=\{[^}]*ocupada/)
  })

  it('avisan de que están ocupados por donde se puede oír', () => {
    expect(CODIGO).toContain('aria-disabled={ocupada}')
    expect(CODIGO).toContain('aria-busy={ocupada}')
  })

  it('cada uno que solo lo aparenta se niega a actuar dentro del manejador', () => {
    // `aria-disabled` no impide nada por sí solo: sin el `return` de arriba del
    // manejador, pulsar dos veces «Eliminar» o reelegir el rol lanzaba la
    // segunda escritura sobre la misma cuenta. Las dos cuentas van juntas a
    // propósito: el día que se añada un sexto control, la que falle dirá cuál
    // de las dos mitades se olvidó.
    const guardias = cuantas(/if \(ocupada\) return/g)
    expect(guardias).toBe(cuantas(/aria-disabled=\{ocupada\}/g))
    expect(guardias).toBeGreaterThanOrEqual(6)
  })

  it('el desplegable de rol frena antes de leer el valor elegido', () => {
    expect(CODIGO).toMatch(/onChange=\{\(e\) => \{ if \(ocupada\) return const rol/)
  })

  it('sigue impidiendo de verdad lo que no depende del momento', () => {
    // Uno no puede cambiarse el rol, desactivarse ni eliminarse a sí mismo, y
    // eso no es un estado pasajero: ahí el `disabled` es el correcto.
    expect(CODIGO).toContain('disabled={esUnoMismo}')
    expect(CODIGO).toContain('disabled={esUnoMismo && u.activo}')
  })
})

describe('la envoltura de los modales', () => {
  it('cierra con Escape y no sigue mirando la tecla', () => {
    expect(CODIGO).toMatch(/if \(evento\.key === 'Escape'\) \{ cerrar\.current\(\) return \}/)
  })

  it('no deja que Tab se escape del diálogo que se anuncia como modal', () => {
    expect(CODIGO).toContain("evento.key !== 'Tab'")
    expect(CODIGO).toContain('const contenedor = caja.current')
    // Ida y vuelta: del último al primero, y del primero —o del propio diálogo,
    // que es donde entra el foco al abrir— al último.
    expect(CODIGO).toMatch(
      /evento\.shiftKey && \(activo === primero \|\| activo === contenedor\)/,
    )
    expect(CODIGO).toMatch(/!evento\.shiftKey && activo === ultimo/)
    expect(cuantas(/evento\.preventDefault\(\)/g)).toBe(3)
  })

  it('recoge el foco que el botón de guardar soltó en body', () => {
    // Los tres modales desactivan su botón de envío mientras la acción viaja
    // (`disabled={enCurso}`), y eso suelta el foco en `<body>`. Desde ahí no se
    // es ni `primero` ni `ultimo`, así que sin esta rama la tabulación se
    // escapaba a la tabla de detrás por el único camino que el ciclo no mira.
    expect(CODIGO).toContain('if (!contenedor.contains(activo))')
  })

  it('no cuenta como enfocable lo que está dentro de un fieldset apagado', () => {
    // `:disabled` y no `[disabled]`: el modal de permisos apaga `fieldset`
    // enteros, y sus casillas no llevan el atributo pero tampoco reciben el
    // foco. Con el selector por atributo, la cuenta de un administrador —los
    // dos grupos apagados— frenaba la tabulación para llevar el foco a una
    // casilla inerte, y se quedaba clavado donde estaba.
    expect(CODIGO).toContain('button:not(:disabled)')
    expect(CODIGO).toContain('input:not(:disabled)')
    expect(CODIGO).not.toContain('input:not([disabled])')
  })

  it('mete el foco al abrir y lo devuelve al cerrar', () => {
    expect(CODIGO).toContain('caja.current?.focus()')
    expect(CODIGO).toContain('devolverA?.focus()')
  })
})
