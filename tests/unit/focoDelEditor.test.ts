import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Dónde queda el foco al guardar una ficha.
 *
 * El botón que se pulsa **es** el que tiene el foco. Al arrancar la transición,
 * un `disabled={enCurso}` hace que el navegador lo desenfoque y suelte el foco
 * en el `<body>`: el siguiente tabulador arranca desde el principio de la
 * página, y hay que recorrer barra lateral, migas y pestañas para volver a la
 * barra de acciones, una vez por cada guardado. Y el guardado que sale bien es
 * el camino que se recorre todo el día: el efecto que recoge el foco en el
 * editor solo entra cuando el guardado es **rechazado**, y estos tres botones
 * siguen montados después, así que nadie lo recoge.
 *
 * El listado ya cerró lo mismo en sus acciones de fila, en la paginación y en
 * el subidor (`tablaDocumentos.test.ts`); esta es la barra del editor, que se
 * quedó fuera de aquella ola.
 *
 * No se pierde nada visual: `.admin-btn` no define estilo de `:disabled`, así
 * que el botón desactivado ya se veía igual que uno vivo. Quien corta la doble
 * pulsación es la guarda del `onClick`, y quien avisa de que está ocupado es el
 * rótulo.
 *
 * El entorno de la suite es `node` y no hay jsdom (ver `vitest.config.ts`):
 * aquí no se pinta, se lee el archivo.
 */

const RAIZ = process.cwd()
const EDITOR = readFileSync(
  join(RAIZ, 'src', 'components', 'admin', 'FormularioDocumento.tsx'),
  'utf8',
)

/**
 * Los botones que llaman a `guardar()`, cada uno con su JSX entero.
 *
 * Se recortan por el marcado y no por su posición porque son tres y cambian de
 * sitio según la colección: dos si se versiona —«Guardar borrador» y «Guardar y
 * publicar»— y uno si no.
 */
const botonesDeGuardado = [...EDITOR.matchAll(/<button\b[\s\S]*?<\/button>/g)]
  .map(([trozo]) => trozo)
  .filter((trozo) => /guardar\((?:true|false)\)/.test(trozo))

describe('guardar no le quita el foco a quien está guardando', () => {
  it('los tres botones de guardado siguen ahí', () => {
    // Si esta cuenta baja, las comprobaciones de abajo pasarían sin mirar nada.
    expect(botonesDeGuardado).toHaveLength(3)
  })

  it('ninguno se desactiva de verdad mientras la transición corre', () => {
    botonesDeGuardado.forEach((boton, indice) => {
      const cual = `botón de guardado ${indice + 1}`
      expect(boton, cual).toContain('aria-disabled={enCurso}')
      // El guion del `aria-` se descarta a mano: buscar `disabled={enCurso}`
      // suelto encuentra también el atributo bueno y la prueba pasaría siempre.
      expect(boton, cual).not.toMatch(/(?<![-\w])disabled=\{enCurso\}/)
    })
  })

  it('cada uno corta la doble pulsación en su `onClick`', () => {
    // La guarda es lo único que queda entre dos pulsaciones seguidas y dos
    // guardados del mismo documento en vuelo.
    for (const boton of botonesDeGuardado) {
      expect(boton).toMatch(/onClick=\{\(\) => \{\s*if \(enCurso\) return/)
    }
  })

  it('cada uno avisa por el rótulo de que está ocupado', () => {
    // Es el único aviso que queda al soltar `disabled`. El de publicar no lo
    // tenía: la acción principal de la pantalla era la única que no daba señal
    // ninguna de estar guardando.
    for (const boton of botonesDeGuardado) {
      expect(boton).toContain("enCurso ? 'Guardando…'")
    }
  })

  it('las acciones que se van de la pantalla sí pueden desactivarse', () => {
    // «Duplicar» y «Eliminar» salen con `router.push` y no dejan foco que
    // recoger; «Retirar de publicación» se desmonta sola al volver la acción,
    // así que soltarle el `disabled` no se lo devolvería a nadie. Las tres
    // conservan `disabled` a propósito y esto lo deja dicho, para que la
    // próxima pasada no las arrastre con las de arriba.
    expect(EDITOR.match(/(?<![-\w])disabled=\{enCurso\}/g) ?? []).toHaveLength(3)
  })
})
