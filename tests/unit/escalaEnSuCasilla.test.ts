import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { esquemaDe } from '@/admin/esquema'
import { depurarDocumento } from '@/admin/depurar'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'

/**
 * «Milímetros por unidad», cerrada por abajo en su propia casilla.
 *
 * El guardián (`escalaDelCaso`) y el aviso vivían en el taller de piezas, donde
 * el número se gasta, y los vigila `campos.test.ts`. La casilla donde se teclea
 * seguía sin mínimo: la flecha hacia abajo pasaba de 1 a 0 y de 0 a -1 —el
 * número que espeja los seis valores del desplazamiento— y la casilla no se
 * daba por enterada.
 *
 * Qué se comprueba y por qué así:
 *
 *  - Que la casilla se identifique con el **mismo nombre** que lee el taller.
 *    Si se separan, la casilla deja de cerrarse y nada falla.
 *  - Que el suelo de las flechas sea 1 y no un número diminuto. El
 *    comportamiento está medido en Chromium y escrito junto a
 *    `SUELO_DE_LAS_FLECHAS`: con la casilla vacía, una flecha escribe el mínimo,
 *    y un 0,001 escrito así encoge el hueso mil veces.
 *  - Que el suelo **no** se haya subido al esquema, y esta es la que se ejercita
 *    de verdad: `depurarCampo` recorta contra el `min` del esquema sin decir
 *    nada, así que un 0 se guardaría como 1 en vez de caer al respaldo de 1000.
 */

const RAIZ = process.cwd()
const CAMPOS = readFileSync(join(RAIZ, 'src', 'components', 'admin', 'formulario', 'Campos.tsx'), 'utf8')

/** La rama del campo numérico en `ControlDeCampo`, hasta la siguiente. */
const RAMA_NUMERICA = CAMPOS.slice(CAMPOS.indexOf("case 'numero': {"), CAMPOS.indexOf("case 'seleccion':"))

describe('la casilla de la escala sabe que lo es', () => {
  it('se reconoce por el mismo nombre que lee el taller', () => {
    const declarado = /const CAMPO_DE_ESCALA = '([^']+)'/.exec(CAMPOS)
    expect(declarado, 'Campos.tsx ya no declara CAMPO_DE_ESCALA').not.toBeNull()
    expect(CAMPOS).toContain(`escalaSustituida(hermanos?.${declarado![1]})`)
    expect(CAMPOS).toContain(`milimetrosPorUnidad={escalaDelCaso(hermanos?.${declarado![1]})}`)
  })

  it('y ese nombre existe en el esquema de las cirugías, como número', () => {
    const declarado = /const CAMPO_DE_ESCALA = '([^']+)'/.exec(CAMPOS)![1]
    const campo = esquemaDe('cirugias')
      .secciones.flatMap((s) => s.campos)
      .find((c) => c.nombre === declarado)
    expect(campo?.tipo).toBe('numero')
  })
})

describe('la casilla se cierra por abajo', () => {
  it('las flechas no bajan de 1', () => {
    expect(CAMPOS).toContain('const SUELO_DE_LAS_FLECHAS = 1')
    expect(RAMA_NUMERICA).toContain('min={campo.min ?? (esLaEscala ? SUELO_DE_LAS_FLECHAS : undefined)}')
  })

  it('se declara inválida por la política de la plataforma, no por la del navegador', () => {
    // Un 0,5 tecleado queda por debajo del `min` para el navegador y la consola
    // lo usa igual; el `aria-invalid` explícito evita que el lector lo anuncie
    // como erróneo. Y pregunta a `escalaSustituida`, que pregunta a
    // `escalaDelCaso`: la casilla no puede separarse del número que se usa.
    expect(RAMA_NUMERICA).toContain('const escalaMal = esLaEscala && escalaSustituida(valor)')
    expect(RAMA_NUMERICA).toContain('aria-invalid={esLaEscala ? escalaMal : undefined}')
  })

  it('el motivo se pinta junto a la casilla y se oye al volver a ella', () => {
    expect(RAMA_NUMERICA).toMatch(/escalaMal \? idAviso : null/)
    expect(RAMA_NUMERICA).toMatch(/<p className="campo-error" id=\{idAviso\}>/)
    // No es una alerta: la del taller ya se anuncia al aparecer, y dos con el
    // mismo motivo se pisan en el lector.
    expect(RAMA_NUMERICA).not.toMatch(/role=["']alert["']/)
  })
})

describe('el suelo es de la casilla y no del esquema', () => {
  it('el esquema no le pone mínimo a la escala', () => {
    const campo = esquemaDe('cirugias')
      .secciones.flatMap((s) => s.campos)
      .find((c) => c.nombre === 'milimetrosPorUnidad')
    expect(campo && campo.tipo === 'numero' ? campo.min : 'no es número').toBeUndefined()
  })

  it('por eso un 0 se guarda como 0 y la consola cae al respaldo, no a 1', () => {
    // Con un `min: 1` en el esquema, `depurarCampo` guardaría 1 —milímetros— y
    // un modelo exportado en metros quedaría mil veces más pequeño sin aviso.
    const guardado = depurarDocumento(esquemaDe('cirugias'), { milimetrosPorUnidad: 0 }) as Record<
      string,
      unknown
    >
    expect(guardado.milimetrosPorUnidad).toBe(0)
    expect(casoParaLaConsola({ milimetrosPorUnidad: guardado.milimetrosPorUnidad }).milimetrosPorUnidad).toBe(
      1000,
    )
  })

  it('y un 0,5 tecleado vale para la consola, que es por lo que el suelo no es la política', () => {
    // Si la casilla lo rechazara, el taller mediría con 1000 y el residente con
    // 0,5: la misma pieza con dos escalas.
    expect(casoParaLaConsola({ milimetrosPorUnidad: 0.5 }).milimetrosPorUnidad).toBe(0.5)
    expect(CAMPOS).toMatch(/const escalaDelCaso[\s\S]*Number\.isFinite\(bruto\) && bruto > 0/)
  })
})
