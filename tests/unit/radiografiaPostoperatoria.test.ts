import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { crc32, esUnPng, pngConTextos, textosDelPng } from '@/lib/pngConMetadatos'
import {
  ALTO_DE_LA_LAMINA,
  ANCHO_DE_LA_LAMINA,
  MAXIMO_DE_TOMAS,
  ajustarEnLaCaja,
  areaDeLasTomas,
  conTituloDeDoctor,
  disposicionDeLasTomas,
  fechaParaLaLamina,
  intervencionPropuesta,
  limpiarLosDatos,
  lineasDeLaLamina,
  nombreDelArchivo,
  partirEnLineas,
  textosDeLosMetadatos,
} from '@/lib/laminaPostoperatoria'
import { aFluoroscopia, columnasDeLaPlaca, recortarALaPlaca } from '@/lib/radiografia'

/** La radiografía postoperatoria y su lámina (P-004 E11, pedido 17). */

/** Un PNG de verdad de 2 × 2 píxeles grises, armado a mano: firma, IHDR, IDAT, IEND. */
function pngDePrueba(): Uint8Array {
  const bloque = (tipo: string, datos: Uint8Array) => {
    const b = new Uint8Array(12 + datos.length)
    const v = new DataView(b.buffer)
    v.setUint32(0, datos.length)
    for (let i = 0; i < 4; i++) b[4 + i] = tipo.charCodeAt(i)
    b.set(datos, 8)
    v.setUint32(8 + datos.length, crc32(b.subarray(4, 8 + datos.length)))
    return b
  }
  const ihdr = new Uint8Array(13)
  const vi = new DataView(ihdr.buffer)
  vi.setUint32(0, 2)
  vi.setUint32(4, 2)
  ihdr[8] = 8 // profundidad
  ihdr[9] = 0 // gris
  const filas = new Uint8Array([0, 10, 20, 0, 30, 40])
  const partes = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', new Uint8Array(deflateSync(filas))),
    bloque('IEND', new Uint8Array(0)),
  ]
  const salida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of partes) {
    salida.set(p, o)
    o += p.length
  }
  return salida
}

describe('el PNG con metadatos', () => {
  it('el CRC-32 es el de la especificación (el de «IEND» vacío es AE426082)', () => {
    expect(crc32(new Uint8Array([0x49, 0x45, 0x4e, 0x44]))).toBe(0xae426082)
  })

  it('los textos se leen de vuelta, con acentos y ñ, y el PNG sigue siendo un PNG', () => {
    const original = pngDePrueba()
    const con = pngConTextos(original, { Author: 'Dr. Iñaki Pérez', Description: 'Dg: fractura de tibia\nCx: placa', Software: 'TraumaHub' })
    expect(esUnPng(con)).toBe(true)
    expect(textosDelPng(con)).toEqual({ Author: 'Dr. Iñaki Pérez', Description: 'Dg: fractura de tibia\nCx: placa', Software: 'TraumaHub' })
    expect(con.length).toBeGreaterThan(original.length)
  })

  it('los bloques van antes del IDAT y los demás quedan intactos', () => {
    const original = pngDePrueba()
    const con = pngConTextos(original, { Title: 'x' })
    const sinTexto = (b: Uint8Array) => {
      const tipos: string[] = []
      const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
      let p = 8
      while (p < b.length) {
        tipos.push(String.fromCharCode(...b.subarray(p + 4, p + 8)))
        p += 12 + v.getUint32(p)
      }
      return tipos
    }
    expect(sinTexto(original)).toEqual(['IHDR', 'IDAT', 'IEND'])
    expect(sinTexto(con)).toEqual(['IHDR', 'tEXt', 'IDAT', 'IEND'])
  })

  it('un texto vacío no deja un bloque, y lo que no es Latin-1 sale con un signo en vez de bytes inválidos', () => {
    const con = pngConTextos(pngDePrueba(), { Author: '', Title: 'Rx → AP' })
    expect(textosDelPng(con)).toEqual({ Title: 'Rx ? AP' })
  })

  it('un CRC estropeado se nota al leer', () => {
    const con = pngConTextos(pngDePrueba(), { Title: 'hola' })
    const estropeado = con.slice()
    // El primer byte del texto del bloque tEXt: después de firma (8) + IHDR (25) + longitud y tipo (8) + «Title\0» (6)
    estropeado[8 + 25 + 8 + 6] ^= 0xff
    expect(() => textosDelPng(estropeado)).toThrow(/CRC/)
  })

  it('rechaza lo que no es un PNG en vez de devolverlo sin metadata', () => {
    expect(() => pngConTextos(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), { Title: 'x' })).toThrow(/PNG/)
  })
})

describe('la placa: rectangular y en positivo', () => {
  const lado = 16
  /** Una toma cuadrada: la mitad izquierda sin materia (negro) y la derecha muy densa (blanco), como entrega el dibujo aditivo. */
  const toma = () => {
    const p = new Uint8Array(lado * lado * 4)
    for (let y = 0; y < lado; y++)
      for (let x = 0; x < lado; x++) {
        const o = (y * lado + x) * 4
        const v = x < lado / 2 ? 0 : 255
        p[o] = p[o + 1] = p[o + 2] = v
        p[o + 3] = 255
      }
    return p
  }

  it('mide 3 : 4: recorta las columnas centrales de la toma cuadrada', () => {
    expect(columnasDeLaPlaca(768)).toBe(576)
    const r = recortarALaPlaca(toma(), lado)
    expect(r.ancho).toBe(12)
    expect(r.pixeles.length).toBe(12 * lado * 4)
  })

  it('el círculo recorta las esquinas y la placa no: llega al borde', () => {
    const c = aFluoroscopia(toma(), lado, lado, { ruido: 0 })
    const p = aFluoroscopia(toma(), lado, lado, { ruido: 0, formato: 'placa' })
    // La esquina de arriba a la izquierda queda fuera del círculo (negra) y dentro de la placa (con imagen).
    expect(c[0]).toBe(0)
    expect(p[0]).toBeGreaterThan(0)
  })

  it('lo denso sale blanco y el vacío oscuro; en el arco, al revés', () => {
    const vacio = (x: number, y: number, s: Uint8ClampedArray) => s[(y * lado + x) * 4]
    const p = aFluoroscopia(toma(), lado, lado, { ruido: 0, formato: 'placa' })
    const c = aFluoroscopia(toma(), lado, lado, { ruido: 0 })
    // Mitad izquierda sin materia, derecha densa
    expect(vacio(3, 8, p)).toBeLessThan(vacio(12, 8, p))
    expect(vacio(3, 8, c)).toBeGreaterThan(vacio(12, 8, c))
  })

  it('el filtro «positivo» la vuelve negativo: el nombre del filtro hace lo mismo que en el arco', () => {
    const p = aFluoroscopia(toma(), lado, lado, { ruido: 0, formato: 'placa', filtro: 'positivo' })
    expect(p[(8 * lado + 3) * 4]).toBeGreaterThan(p[(8 * lado + 12) * 4])
  })
})

describe('los datos de la lámina', () => {
  it('limpia espacios y saltos de línea, y el «Dr.» que alguien escriba de más', () => {
    const d = limpiarLosDatos({ caso: '  Fractura \n de   tibia ', cirujano: 'Dr. Juan Pérez', diagnostico: 'x', intervencion: 'y', fecha: '21-10-2026' })
    expect(d.caso).toBe('Fractura de tibia')
    expect(d.cirujano).toBe('Juan Pérez')
    expect(conTituloDeDoctor(d.cirujano)).toBe('Dr. Juan Pérez')
  })

  it('el «Dr.» se pide aunque no haya nombre, para que se complete', () => {
    expect(conTituloDeDoctor('')).toBe('Dr. ____')
  })

  it('cada campo tiene su tope', () => {
    expect(limpiarLosDatos({ caso: 'a'.repeat(500) }).caso.length).toBe(160)
  })

  it('la lámina lleva el caso, el diagnóstico, la intervención, el cirujano y la fecha, y no los insumos ni el puntaje', () => {
    const lineas = lineasDeLaLamina(
      limpiarLosDatos({ caso: 'Tibia distal', diagnostico: 'AO 43-A1', intervencion: 'Placa LCP', cirujano: 'Ana Soto', fecha: '21-10-2026' }),
    )
    expect(lineas.map((l) => l.etiqueta)).toEqual(['Caso', 'Dg', 'Cx', 'Cirujano', 'Fecha'])
    const todo = JSON.stringify(lineas).toLowerCase()
    expect(todo).not.toMatch(/insumo|puntaje|puntos/)
  })

  it('un dato vacío no deja una línea con solo su etiqueta', () => {
    const lineas = lineasDeLaLamina(limpiarLosDatos({ caso: 'X', fecha: '21-10-2026' }))
    expect(lineas.map((l) => l.etiqueta)).toEqual(['Caso', 'Fecha'])
  })

  it('el texto se parte en líneas que caben, y una palabra larguísima queda sola', () => {
    const medir = (t: string) => t.length * 10
    expect(partirEnLineas('uno dos tres cuatro', 100, medir)).toEqual(['uno dos', 'tres', 'cuatro'])
    expect(partirEnLineas('supercalifragilistico y ya', 50, medir)).toEqual(['supercalifragilistico', 'y ya'])
    expect(partirEnLineas('', 100, medir)).toEqual([])
  })

  it('la fecha va como día-mes-año con ceros', () => {
    expect(fechaParaLaLamina(new Date(2026, 0, 5))).toBe('05-01-2026')
  })

  it('el nombre del archivo no lleva tildes ni signos', () => {
    expect(nombreDelArchivo(limpiarLosDatos({ caso: 'Fractura de tibia: ¡diáfisis!' }))).toBe('radiografia-postoperatoria-Fractura-de-tibia-diafisis.png')
    expect(nombreDelArchivo(limpiarLosDatos({}))).toBe('radiografia-postoperatoria-caso.png')
  })

  it('los metadatos del PNG llevan al cirujano, el diagnóstico y la intervención, y nada del puntaje', () => {
    const d = limpiarLosDatos({ caso: 'Tibia', diagnostico: 'AO 42-A', intervencion: 'Placa', cirujano: 'Ana Soto', fecha: '21-10-2026' })
    const t = textosDeLosMetadatos(d, new Date('2026-10-21T12:00:00Z'))
    expect(t.Author).toBe('Dr. Ana Soto')
    expect(t.Description).toBe('Dg: AO 42-A\nCx: Placa')
    expect(t.Software).toBe('TraumaHub')
    expect(t['Creation Time']).toBe('2026-10-21T12:00:00.000Z')
    expect(JSON.stringify(t).toLowerCase()).not.toMatch(/puntaje|insumo/)
  })
})

describe('la intervención propuesta a partir de lo usado', () => {
  const ins = (nombre: string, cantidad = 1) => ({ nombre, categoria: null, cantidad })

  it('una placa y seis tornillos', () => {
    expect(intervencionPropuesta([ins('Placa DCP 4,5 mm'), ins('Tornillo cortical 4,5 mm × 36 mm', 4), ins('Tornillo cortical 4,5 mm × 40 mm', 2)])).toBe(
      'Reducción abierta y osteosíntesis con placa DCP 4,5 mm y 6 tornillos',
    )
  })

  it('un clavo con tornillos de bloqueo', () => {
    expect(intervencionPropuesta([ins('Clavo endomedular tibial'), ins('Tornillo de bloqueo 5,0 mm × 40 mm', 2)])).toBe(
      'Reducción y osteosíntesis con clavo endomedular tibial y 2 tornillos de bloqueo',
    )
  })

  it('solo tornillos, en singular si es uno', () => {
    expect(intervencionPropuesta([ins('Tornillo canulado × 60 mm')])).toBe('Reducción y osteosíntesis con 1 tornillo')
  })

  it('dos placas se nombran juntas', () => {
    expect(intervencionPropuesta([ins('Placa A'), ins('Placa B')])).toBe('Reducción abierta y osteosíntesis con placas A y B')
  })

  it('sin implantes no propone nada: el cirujano escribe', () => {
    expect(intervencionPropuesta([ins('Bisturí n.º 22'), ins('Separador de Farabeuf')])).toBe('')
    expect(intervencionPropuesta([])).toBe('')
  })
})

describe('dónde va cada radiografía en la lámina', () => {
  it('cada placa es 3 : 4, cabe en su área y no se pisan', () => {
    for (let n = 1; n <= MAXIMO_DE_TOMAS; n++) {
      const rs = disposicionDeLasTomas(n)
      expect(rs).toHaveLength(n)
      for (const r of rs) {
        expect(Math.abs(r.ancho / r.alto - 3 / 4)).toBeLessThan(0.01)
        expect(r.x).toBeGreaterThanOrEqual(areaDeLasTomas.x)
        expect(r.x + r.ancho).toBeLessThanOrEqual(areaDeLasTomas.x + areaDeLasTomas.ancho)
        expect(r.y).toBeGreaterThanOrEqual(areaDeLasTomas.y)
        expect(r.y + r.alto).toBeLessThanOrEqual(ALTO_DE_LA_LAMINA)
        expect(r.x + r.ancho).toBeLessThanOrEqual(ANCHO_DE_LA_LAMINA)
      }
      for (let i = 1; i < rs.length; i++) expect(rs[i].x).toBeGreaterThanOrEqual(rs[i - 1].x + rs[i - 1].ancho)
    }
  })

  it('con más tomas, cada una se achica; sin tomas, no hay nada; y no pasa de tres', () => {
    expect(disposicionDeLasTomas(1)[0].ancho).toBeGreaterThan(disposicionDeLasTomas(3)[0].ancho)
    expect(disposicionDeLasTomas(0)).toEqual([])
    expect(disposicionDeLasTomas(9)).toHaveLength(MAXIMO_DE_TOMAS)
  })

  it('el logotipo cabe sin deformarse y centrado', () => {
    const r = ajustarEnLaCaja(400, 100, { x: 0, y: 0, ancho: 200, alto: 200 })
    expect(r).toEqual({ x: 0, y: 75, ancho: 200, alto: 50 })
    expect(ajustarEnLaCaja(0, 0, { x: 0, y: 0, ancho: 10, alto: 10 }).ancho).toBe(0)
  })

  it('la lámina es de 1920 × 1080', () => {
    expect([ANCHO_DE_LA_LAMINA, ALTO_DE_LA_LAMINA]).toEqual([1920, 1080])
  })
})

describe('el cableado de la radiografía postoperatoria', () => {
  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')
  const CONSOLA = leer('src/components/simulador/ConsolaQuirurgica.tsx')
  const ACCION = leer('src/app/(frontend)/acciones/actividad.ts')

  it('la consola invita al terminar y deja omitir, y el editor no la ve', () => {
    expect(CONSOLA).toContain('Ir a radiografía postoperatoria')
    expect(CONSOLA).toContain("setRadiografiaPost('omitida')")
    expect(CONSOLA).toContain("radiografiaPost === 'invitacion' && !editor")
  })

  it('al descargar, los datos viajan con el recorrido; al reiniciar, se olvidan', () => {
    expect(CONSOLA).toContain('radiografia: radiografiaDelRecorrido.current')
    const reiniciar = CONSOLA.slice(CONSOLA.indexOf('async function reiniciar()'), CONSOLA.indexOf('async function reiniciar()') + 4000)
    expect(reiniciar).toContain('radiografiaDelRecorrido.current = null')
  })

  it('el servidor no borra la radiografía de un guardado que no la trae, y rechaza lo que no es texto', () => {
    expect(ACCION).toContain('...(datos.radiografia !== undefined ? { radiografia: datos.radiografia } : {})')
    expect(ACCION).toContain('tiene que ser texto')
  })

  it('los datos de la lámina no tienen dónde llevar insumos ni puntaje', () => {
    const lamina = leer('src/lib/laminaPostoperatoria.ts')
    const interfaz = lamina.slice(lamina.indexOf('export interface DatosDeLaLamina'), lamina.indexOf('export interface Rectangulo'))
    expect(interfaz).not.toMatch(/insumos|puntaje/i)
  })
})
