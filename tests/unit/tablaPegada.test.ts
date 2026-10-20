import { describe, expect, it } from 'vitest'
import { leerTablaPegada, trozosDeLaCelda } from '@/lib/tablaPegada'

/**
 * La tabla con la que se pidió el bloque, tal como la entrega Vera Health. Es
 * el caso real: cuatro columnas de texto largo, con paréntesis, signos «+1» y
 * tildes, y ninguna fila escapada.
 */
const DE_VERA = `| Grupo | Patología | Datos clínicos o radiológicos orientativos | Clinical Evidence |
| --- | --- | --- | --- |
| Maligno | Sarcoma sinovial | Masa profunda, crecimiento progresivo, dolor variable; frecuente en pie y tobillo, especialmente en adultos jóvenes. | Es uno de los sarcomas de partes blandas más frecuentes en esta localización. (EFORT Open Reviews 2017) |
| Maligno | Condrosarcoma | Lesión ósea dolorosa, destrucción cortical o matriz condroide; considerar especialmente en adultos mayores de 40 años. | Es el tumor óseo maligno más habitual del pie en adultos. (EFORT Open Reviews 2017) |
| Benigno | Quiste ganglionar o quiste intraóseo | Masa blanda, generalmente periarticular; puede causar dolor por compresión. | Son lesiones frecuentes y pueden caracterizarse con ecografía o resonancia magnética. (European radiology 2024 +1) |
| No tumoral | Bursitis, tenosinovitis o rotura tendinosa | Dolor mecánico, tumefacción relacionada con la actividad y líquido alrededor de tendones o bursas. | Son causas inflamatorias o mecánicas que pueden producir una masa aparente. |`

describe('leerTablaPegada', () => {
  it('lee la tabla de Vera Health: encabezado, filas y columnas', () => {
    const leida = leerTablaPegada(DE_VERA)
    expect(leida.ok).toBe(true)
    if (!leida.ok) return
    expect(leida.tabla.encabezados).toEqual([
      'Grupo',
      'Patología',
      'Datos clínicos o radiológicos orientativos',
      'Clinical Evidence',
    ])
    expect(leida.tabla.filas).toHaveLength(4)
    expect(leida.tabla.filas[0][0]).toBe('Maligno')
    expect(leida.tabla.filas[3][3]).toBe('Son causas inflamatorias o mecánicas que pueden producir una masa aparente.')
    // La fila sin paréntesis de fuente no desalinea: sigue teniendo cuatro celdas.
    expect(leida.tabla.filas.every((f) => f.length === 4)).toBe(true)
  })

  it('acepta saltos de línea de Windows y líneas en blanco de más', () => {
    const leida = leerTablaPegada(`\r\n${DE_VERA.replace(/\n/g, '\r\n')}\r\n\r\n`)
    expect(leida.ok && leida.tabla.filas.length).toBe(4)
  })

  it('ignora la frase de introducción y la nota del final', () => {
    const leida = leerTablaPegada(`Aquí está la tabla:\n\n${DE_VERA}\n\nFuente: Vera Health.`)
    expect(leida.ok && leida.tabla.filas.length).toBe(4)
  })

  it('una barra escapada es texto de la celda y no una columna nueva', () => {
    const leida = leerTablaPegada('| a | b |\n| --- | --- |\n| uno \\| dos | tres |')
    expect(leida.ok && leida.tabla.filas[0]).toEqual(['uno | dos', 'tres'])
  })

  it('una fila corta se completa y una larga devuelve lo que sobra a la última celda', () => {
    const leida = leerTablaPegada('| a | b | c |\n| - | - | - |\n| 1 | 2 |\n| 1 | 2 | 3 | 4 |')
    expect(leida.ok && leida.tabla.filas).toEqual([
      ['1', '2', ''],
      ['1', '2', '3 | 4'],
    ])
  })

  it('lee la alineación de los dos puntos', () => {
    const leida = leerTablaPegada('| a | b | c | d |\n| :--- | :---: | ---: | --- |\n| 1 | 2 | 3 | 4 |')
    expect(leida.ok && leida.tabla.alineaciones).toEqual(['izquierda', 'centro', 'derecha', null])
  })

  it('<br> es un salto de línea dentro de la celda', () => {
    const leida = leerTablaPegada('| a | b |\n| --- | --- |\n| uno<br>dos<br/>tres | x |')
    expect(leida.ok && leida.tabla.filas[0][0]).toBe('uno\ndos\ntres')
  })

  it('también lee una tabla copiada de una página, separada por tabuladores', () => {
    const leida = leerTablaPegada('Grupo\tPatología\nMaligno\tSarcoma sinovial\nBenigno\tLipoma')
    expect(leida.ok).toBe(true)
    if (!leida.ok) return
    expect(leida.tabla.encabezados).toEqual(['Grupo', 'Patología'])
    expect(leida.tabla.filas).toEqual([
      ['Maligno', 'Sarcoma sinovial'],
      ['Benigno', 'Lipoma'],
    ])
  })

  describe('lo que no es una tabla se rechaza diciendo por qué', () => {
    it.each([
      ['vacío', ''],
      ['solo espacios', '   \n  '],
      ['texto suelto', 'Esto no es una tabla'],
      ['sin línea de guiones', '| a | b |\n| 1 | 2 |'],
      ['sin filas', '| a | b |\n| --- | --- |'],
      ['una sola columna', '| a |\n| --- |\n| 1 |'],
    ])('%s', (_, texto) => {
      const leida = leerTablaPegada(texto)
      expect(leida.ok).toBe(false)
      if (!leida.ok) expect(leida.motivo).not.toBe('')
    })

    it('no es texto', () => {
      expect(leerTablaPegada(null).ok).toBe(false)
      expect(leerTablaPegada(42).ok).toBe(false)
    })

    it('demasiadas columnas', () => {
      const nueve = Array.from({ length: 9 }, (_, i) => `c${i}`)
      const texto = `| ${nueve.join(' | ')} |\n| ${nueve.map(() => '---').join(' | ')} |\n| ${nueve.join(' | ')} |`
      const leida = leerTablaPegada(texto)
      expect(leida.ok).toBe(false)
      if (!leida.ok) expect(leida.motivo).toContain('9 columnas')
    })
  })
})

describe('trozosDeLaCelda', () => {
  it('separa la negrita del resto', () => {
    expect(trozosDeLaCelda('Es **muy** frecuente')).toEqual([
      { texto: 'Es ', negrita: false },
      { texto: 'muy', negrita: true },
      { texto: ' frecuente', negrita: false },
    ])
  })

  it('un asterisco suelto se queda como texto', () => {
    expect(trozosDeLaCelda('p < 0,05 *')).toEqual([{ texto: 'p < 0,05 *', negrita: false }])
  })

  it('no interpreta HTML: las etiquetas salen como texto', () => {
    expect(trozosDeLaCelda('<script>x</script>')).toEqual([{ texto: '<script>x</script>', negrita: false }])
  })
})
