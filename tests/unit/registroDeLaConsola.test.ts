import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { conLaAnotacion, SE_CAYO_LO_MAS_VIEJO, TOPE_DEL_REGISTRO, type Anotacion } from '@/lib/registroDeLaConsola'

/**
 * El registro entero de «Lo que va pasando» (D-311).
 *
 * Se recortaba a diez líneas y D-266 prometía el registro entero al terminar el caso: en uno de siete pasos, diez
 * líneas no cubrían ni el último. Ahora lo para el tamaño, y lo que se cae se dice.
 */

const linea = (texto: string, clase: Anotacion['clase'] = 'bien'): Anotacion => ({ texto, clase })

describe('el registro de la consola', () => {
  it('lo nuevo va delante', () => {
    const a = linea('primera')
    const b = linea('segunda')
    expect(conLaAnotacion([], a)).toEqual([a])
    expect(conLaAnotacion([a], b)).toEqual([b, a])
  })

  it('no se recorta por número de líneas: las de un caso largo caben todas', () => {
    let registro: Anotacion[] = []
    for (let i = 0; i < 300; i++) registro = conLaAnotacion(registro, linea(`${i}. Paso superado: 10 de 10 puntos.`))
    expect(registro).toHaveLength(300)
    expect(registro[0].texto).toBe('299. Paso superado: 10 de 10 puntos.')
    expect(registro.at(-1)?.texto).toBe('0. Paso superado: 10 de 10 puntos.')
    expect(TOPE_DEL_REGISTRO).toBeGreaterThanOrEqual(100_000)
  })

  it('pasado el tope se cae lo más viejo, y una línea al final lo dice', () => {
    const tope = 25
    let registro = conLaAnotacion([], linea('aaaaaaaaaa'), tope)
    registro = conLaAnotacion(registro, linea('bbbbbbbbbb'), tope)
    expect(registro.map((a) => a.texto)).toEqual(['bbbbbbbbbb', 'aaaaaaaaaa'])
    registro = conLaAnotacion(registro, linea('cccccccccc'), tope)
    expect(registro).toEqual([linea('cccccccccc'), linea('bbbbbbbbbb'), SE_CAYO_LO_MAS_VIEJO])
  })

  it('la línea del aviso no se repite ni cuenta como anotación', () => {
    const tope = 25
    let registro: Anotacion[] = []
    for (const texto of ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd']) registro = conLaAnotacion(registro, linea(texto), tope)
    expect(registro.filter((a) => a === SE_CAYO_LO_MAS_VIEJO)).toHaveLength(1)
    expect(registro.at(-1)).toBe(SE_CAYO_LO_MAS_VIEJO)
    expect(registro.map((a) => a.texto).slice(0, -1)).toEqual(['dddddddddd', 'cccccccccc'])
  })

  it('lo que se acaba de decir se queda siempre, por largo que sea', () => {
    const larga = linea('x'.repeat(100), 'grave')
    expect(conLaAnotacion([linea('corta')], larga, 25)).toEqual([larga, SE_CAYO_LO_MAS_VIEJO])
  })

  it('la consola anota con él, y terminado el caso enseña el registro entero', () => {
    const consola = readFileSync(join(process.cwd(), 'src', 'components', 'simulador', 'ConsolaQuirurgica.tsx'), 'utf8')
    expect(consola).toContain('setRegistro((previo) => conLaAnotacion(previo, { texto, clase }))')
    expect(consola).not.toMatch(/setRegistro\([^)]*\.slice\(0, 10\)/)
    // Durante el caso, las últimas; al terminar, hasta el final (D-266).
    expect(consola).toContain('registro.slice(resultado ? 1 : 0, terminado ? undefined : 6)')
  })
})
