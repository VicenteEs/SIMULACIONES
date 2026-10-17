import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { crearPlanilla } from '@/lib/planilla'
import { crearZip, crc32 } from '@/lib/zip'
import { desescaparXml, leerPlanilla, PlanillaIlegible } from '@/lib/leerPlanilla'

/**
 * El lector mínimo de `.xlsx` (D-179, P-003 E8).
 *
 * Se prueba de tres maneras, porque cada una atrapa lo que las otras no: lo que
 * escribe nuestro propio escritor (la vuelta completa), libros armados a mano en el
 * estilo de otros programas (celdas en línea, textos con formato, fórmulas,
 * prefijos de espacio de nombres, entradas sin comprimir) y archivos rotos o
 * hechos para dañar.
 */

const aBytes = (texto: string) => new TextEncoder().encode(texto)

describe('la vuelta completa con el escritor de la plataforma', () => {
  it('lee lo que escribe crearPlanilla: textos, tildes, saltos de línea y celdas vacías', () => {
    const bytes = crearPlanilla([
      {
        nombre: 'Estructuras',
        columnas: [
          { titulo: 'Id del atlas', tipo: 'texto' },
          { titulo: 'Nombre', tipo: 'texto' },
          { titulo: 'Definición', tipo: 'texto' },
          { titulo: 'Notas', tipo: 'texto' },
        ],
        filas: [
          ['FJ1', 'Tibia derecha', 'Hueso largo medial de la pierna.\nSegunda línea con «comillas» & <signos>.', null],
          ['FJ2', 'Peroné derecho', null, 'Sólo notas'],
          ['FJ3', 'Rótula derecha', '', ''],
        ],
      },
    ])
    const [hoja] = leerPlanilla(bytes)
    expect(hoja.nombre).toBe('Estructuras')
    expect(hoja.filas[0]).toEqual(['Id del atlas', 'Nombre', 'Definición', 'Notas'])
    expect(hoja.filas[1]).toEqual([
      'FJ1',
      'Tibia derecha',
      'Hueso largo medial de la pierna.\nSegunda línea con «comillas» & <signos>.',
    ])
    expect(hoja.filas[2]).toEqual(['FJ2', 'Peroné derecho', '', 'Sólo notas'])
    // Una fila sin nada escrito después del id no inventa celdas.
    expect(hoja.filas[3]).toEqual(['FJ3', 'Rótula derecha'])
  })

  it('lee varias hojas, en el orden del libro y con sus nombres', () => {
    const columnas = [{ titulo: 'A', tipo: 'texto' as const }]
    const [primera, segunda] = leerPlanilla(
      crearPlanilla([
        { nombre: 'Estructuras', columnas, filas: [['uno']] },
        { nombre: 'Cómo llenarla', columnas, filas: [['dos']] },
      ]),
    )
    expect([primera.nombre, segunda.nombre]).toEqual(['Estructuras', 'Cómo llenarla'])
    expect(primera.filas[1]).toEqual(['uno'])
    expect(segunda.filas[1]).toEqual(['dos'])
  })

  it('los números llegan como texto y no pierden su valor', () => {
    const [hoja] = leerPlanilla(
      crearPlanilla([
        {
          nombre: 'N',
          columnas: [
            { titulo: 'Entero', tipo: 'entero' },
            { titulo: 'Decimal', tipo: 'decimal' },
          ],
          filas: [[12, 3.5]],
        },
      ]),
    )
    expect(hoja.filas[1]).toEqual(['12', '3.5'])
  })

  it('un texto largo, de miles de caracteres, vuelve entero', () => {
    const largo = 'Músculo largo. '.repeat(200).trim()
    const [hoja] = leerPlanilla(
      crearPlanilla([{ nombre: 'L', columnas: [{ titulo: 'T', tipo: 'texto' }], filas: [[largo]] }]),
    )
    expect(hoja.filas[1][0]).toBe(largo)
  })

  it('columnas más allá de la Z', () => {
    const columnas = Array.from({ length: 30 }, (_, i) => ({ titulo: `C${i}`, tipo: 'texto' as const }))
    const fila = Array.from({ length: 30 }, (_, i) => `v${i}`)
    const [hoja] = leerPlanilla(crearPlanilla([{ nombre: 'Ancha', columnas, filas: [fila] }]))
    expect(hoja.filas[1][26]).toBe('v26')
    expect(hoja.filas[1][29]).toBe('v29')
  })
})

/** Un libro como lo guardarían otros programas: lo que el escritor propio nunca produce. */
function libroAjeno(opciones: { hoja: string; textos?: string; comprimir?: boolean; prefijo?: boolean }): Uint8Array {
  const p = opciones.prefijo ? 'x:' : ''
  const xmlns = opciones.prefijo ? 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' : 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
  const archivos = [
    { nombre: '[Content_Types].xml', datos: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    {
      nombre: 'xl/workbook.xml',
      datos: `<?xml version="1.0" encoding="UTF-8"?><${p}workbook ${xmlns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><${p}sheets><${p}sheet r:id="rId7" name="Mi hoja" sheetId="3"/></${p}sheets></${p}workbook>`,
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      datos: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="worksheets/hoja-rara.xml" Type="x" Id="rId7"/></Relationships>',
    },
    ...(opciones.textos ? [{ nombre: 'xl/sharedStrings.xml', datos: opciones.textos }] : []),
    { nombre: 'xl/worksheets/hoja-rara.xml', datos: `<?xml version="1.0"?><${p}worksheet ${xmlns}><${p}sheetData>${opciones.hoja}</${p}sheetData></${p}worksheet>` },
  ]
  if (opciones.comprimir !== false) return crearZip(archivos)
  return zipSinComprimir(archivos)
}

/** Un ZIP con las entradas «almacenadas» (método 0), como lo escriben algunas herramientas. */
function zipSinComprimir(archivos: { nombre: string; datos: string }[]): Uint8Array {
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let desplazamiento = 0
  for (const archivo of archivos) {
    const nombre = aBytes(archivo.nombre)
    const datos = aBytes(archivo.datos)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint32(14, crc32(datos), true)
    local.setUint32(18, datos.length, true)
    local.setUint32(22, datos.length, true)
    local.setUint16(26, nombre.length, true)
    partes.push(new Uint8Array(local.buffer), nombre, datos)
    const entrada = new DataView(new ArrayBuffer(46))
    entrada.setUint32(0, 0x02014b50, true)
    entrada.setUint16(4, 20, true)
    entrada.setUint16(6, 20, true)
    entrada.setUint32(16, crc32(datos), true)
    entrada.setUint32(20, datos.length, true)
    entrada.setUint32(24, datos.length, true)
    entrada.setUint16(28, nombre.length, true)
    entrada.setUint32(42, desplazamiento, true)
    central.push(new Uint8Array(entrada.buffer), nombre)
    desplazamiento += 30 + nombre.length + datos.length
  }
  const tamano = central.reduce((t, p) => t + p.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true)
  fin.setUint16(8, archivos.length, true)
  fin.setUint16(10, archivos.length, true)
  fin.setUint32(12, tamano, true)
  fin.setUint32(16, desplazamiento, true)
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)]
  const salida = new Uint8Array(todo.reduce((t, p) => t + p.length, 0))
  let pos = 0
  for (const parte of todo) {
    salida.set(parte, pos)
    pos += parte.length
  }
  return salida
}

describe('libros guardados por otros programas', () => {
  const compartidos =
    '<sst><si><t>Id</t></si><si><r><rPr><b/></rPr><t xml:space="preserve">Tibia </t></r><r><t>derecha</t></r><rPh sb="0" eb="1"><t>ティビア</t></rPh></si><si><t/></si><si><t>A &amp; B &lt;c&gt; &#233; &#xE9;</t></si></sst>'

  it('textos compartidos con formato (varios tramos) y lectura fonética: solo cuenta el texto', () => {
    const [hoja] = leerPlanilla(
      libroAjeno({
        textos: compartidos,
        hoja: '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>',
      }),
    )
    expect(hoja.nombre).toBe('Mi hoja')
    expect(hoja.filas[0]).toEqual(['Id', 'Tibia derecha'])
    // Una cadena compartida vacía es una celda vacía; las entidades se deshacen.
    expect(hoja.filas[1]).toEqual(['', 'A & B <c> é é'])
  })

  it('texto en línea, fórmulas con su último valor, booleanos, errores y celdas sin valor', () => {
    const [hoja] = leerPlanilla(
      libroAjeno({
        hoja:
          '<row r="1">' +
          '<c r="A1" t="inlineStr"><is><t>En línea</t></is></c>' +
          '<c r="B1" t="str"><f>CONCATENATE("a","b")</f><v>ab</v></c>' +
          '<c r="C1" t="b"><v>1</v></c>' +
          '<c r="D1" t="e"><v>#REF!</v></c>' +
          '<c r="E1" s="4"/>' +
          '<c r="F1"><f>1+1</f><v>2</v></c>' +
          '</row>',
      }),
    )
    expect(hoja.filas[0]).toEqual(['En línea', 'ab', '1', '', '', '2'])
  })

  it('etiquetas con prefijo de espacio de nombres, atributos en otro orden y relación de ruta distinta', () => {
    const [hoja] = leerPlanilla(
      libroAjeno({
        prefijo: true,
        textos: '<x:sst xmlns:x="a"><x:si><x:t>Con prefijo</x:t></x:si></x:sst>',
        hoja: '<x:row r="1"><x:c t="s" r="A1"><x:v>0</x:v></x:c></x:row>',
      }),
    )
    expect(hoja.filas[0]).toEqual(['Con prefijo'])
  })

  it('entradas almacenadas sin comprimir', () => {
    const [hoja] = leerPlanilla(
      libroAjeno({
        comprimir: false,
        textos: compartidos,
        hoja: '<row r="2"><c r="B2" t="s"><v>1</v></c></row>',
      }),
    )
    // Las filas vacías del principio se conservan: la fila 2 sigue siendo la fila 2.
    expect(hoja.filas[0]).toEqual([])
    expect(hoja.filas[1]).toEqual(['', 'Tibia derecha'])
  })

  it('las celdas desordenadas dentro de la hoja caen en su sitio', () => {
    const [hoja] = leerPlanilla(
      libroAjeno({ hoja: '<row r="3"><c r="C3" t="inlineStr"><is><t>c</t></is></c></row><row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row>' }),
    )
    expect(hoja.filas[0][0]).toBe('a')
    expect(hoja.filas[2][2]).toBe('c')
  })

  it('un libro sin la tabla de rutas cae en la hoja numerada de siempre', () => {
    const bytes = crearZip([
      { nombre: 'xl/workbook.xml', datos: '<workbook><sheets><sheet name="Sola" sheetId="1"/></sheets></workbook>' },
      { nombre: 'xl/worksheets/sheet1.xml', datos: '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>' },
    ])
    expect(leerPlanilla(bytes)[0]).toEqual({ nombre: 'Sola', filas: [['x']] })
  })
})

describe('desescaparXml', () => {
  it('deshace las entidades con nombre y las numéricas, y deja lo que no conoce', () => {
    expect(desescaparXml('a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;')).toBe('a & b < c > "d" \'e\'')
    expect(desescaparXml('&#65;&#x42;&#233;')).toBe('ABé')
    expect(desescaparXml('&inventada; &#0; &#xFFFFFFF;')).toBe('&inventada;  ')
  })
})

describe('archivos que no se leen', () => {
  const valido = () =>
    crearPlanilla([{ nombre: 'H', columnas: [{ titulo: 'A', tipo: 'texto' }], filas: [['dato']] }])

  it('algo que no es un ZIP: lo dice con el camino a seguir', () => {
    for (const basura of [new Uint8Array(0), aBytes('Id,Nombre\nFJ1,Tibia'), new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, ...new Array(40).fill(0)])]) {
      expect(() => leerPlanilla(basura)).toThrow(PlanillaIlegible)
      expect(() => leerPlanilla(basura)).toThrow(/\.xlsx/)
    }
  })

  it('un ZIP que no es una planilla', () => {
    const zip = crearZip([{ nombre: 'otra-cosa.txt', datos: 'hola' }])
    expect(() => leerPlanilla(zip)).toThrow(/no una planilla de Excel/)
  })

  it('un archivo cortado a la mitad se rechaza y no se lee a medias', () => {
    const bytes = valido()
    expect(() => leerPlanilla(bytes.slice(0, Math.floor(bytes.length / 2)))).toThrow(PlanillaIlegible)
  })

  it('un byte alterado dentro de una parte lo delata la suma de control', () => {
    const bytes = valido()
    const roto = bytes.slice()
    // Dentro de los datos de la hoja, que son lo que se lee: justo después de su nombre en la cabecera local.
    const nombre = aBytes('xl/worksheets/sheet1.xml')
    let inicio = -1
    for (let i = 0; i < roto.length - nombre.length; i += 1) {
      if (nombre.every((b, k) => roto[i + k] === b)) {
        inicio = i
        break
      }
    }
    expect(inicio).toBeGreaterThan(0)
    roto[inicio + nombre.length + 10] ^= 0xff
    expect(() => leerPlanilla(roto)).toThrow(PlanillaIlegible)
  })

  it('una entrada que miente sobre su tamaño y se expande más de lo declarado (ZIP bomba) se corta', () => {
    const real = aBytes('x'.repeat(2_000_000))
    const comprimido = new Uint8Array(deflateRawSync(real))
    const nombre = aBytes('xl/workbook.xml')
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(8, 8, true)
    local.setUint32(14, crc32(real), true)
    local.setUint32(18, comprimido.length, true)
    local.setUint32(22, 100, true)
    local.setUint16(26, nombre.length, true)
    const entrada = new DataView(new ArrayBuffer(46))
    entrada.setUint32(0, 0x02014b50, true)
    entrada.setUint16(10, 8, true)
    entrada.setUint32(16, crc32(real), true)
    entrada.setUint32(20, comprimido.length, true)
    entrada.setUint32(24, 100, true) // dice 100 bytes
    entrada.setUint16(28, nombre.length, true)
    const fin = new DataView(new ArrayBuffer(22))
    fin.setUint32(0, 0x06054b50, true)
    fin.setUint16(8, 1, true)
    fin.setUint16(10, 1, true)
    fin.setUint32(12, 46 + nombre.length, true)
    fin.setUint32(16, 30 + nombre.length + comprimido.length, true)
    const partes = [new Uint8Array(local.buffer), nombre, comprimido, new Uint8Array(entrada.buffer), nombre, new Uint8Array(fin.buffer)]
    const zip = new Uint8Array(partes.reduce((t, p) => t + p.length, 0))
    let pos = 0
    for (const parte of partes) {
      zip.set(parte, pos)
      pos += parte.length
    }
    expect(() => leerPlanilla(zip)).toThrow(PlanillaIlegible)
  })

  it('una entrada que declara un tamaño descomunal se rechaza sin descomprimir nada', () => {
    const bytes = valido().slice()
    // Sube el tamaño descomprimido declarado de la primera entrada del directorio central.
    const vista = new DataView(bytes.buffer)
    let fin = bytes.length - 22
    while (vista.getUint32(fin, true) !== 0x06054b50) fin -= 1
    const central = vista.getUint32(fin + 16, true)
    vista.setUint32(central + 24, 0x7fffffff, true)
    expect(() => leerPlanilla(bytes)).toThrow(/enormemente grande/)
  })

  it('una hoja con una celda en una fila absurda se rechaza', () => {
    expect(() => leerPlanilla(libroAjeno({ hoja: '<row r="99999"><c r="A99999" t="inlineStr"><is><t>x</t></is></c></row>' }))).toThrow(/demasiado grande/)
  })

  it('un libro con contraseña (entradas cifradas) se dice', () => {
    const bytes = valido().slice()
    const vista = new DataView(bytes.buffer)
    let fin = bytes.length - 22
    while (vista.getUint32(fin, true) !== 0x06054b50) fin -= 1
    const central = vista.getUint32(fin + 16, true)
    vista.setUint16(central + 8, 1, true)
    expect(() => leerPlanilla(bytes)).toThrow(/contraseña/)
  })
})
