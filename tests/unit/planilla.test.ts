import { describe, expect, it } from 'vitest'
import { inflateRawSync } from 'node:zlib'
import { crc32, crearZip } from '@/lib/zip'
import { crearPlanilla, escaparXml, fechaDeExcel, letraDeColumna } from '@/lib/planilla'
import { hojasDeLaAuditoria } from '@/lib/planillaDeAuditoria'
import { armarAuditoria } from '@/lib/auditoria'

/**
 * La planilla de Excel de la auditoría (D-143), sin Excel: se abre el ZIP a
 * mano, se comprueba cada entrada con su CRC y se leen los XML de dentro. Lo
 * que no se puede probar aquí —que Excel la abra sin «repararla»— se comprobó
 * al escribirla con openpyxl, que es igual de estricto con las tablas.
 */

/** Lee un ZIP: su directorio central y cada entrada, descomprimida y con el CRC comprobado. */
function leerZip(bytes: Uint8Array): Map<string, string> {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let fin = bytes.length - 22
  while (fin >= 0 && vista.getUint32(fin, true) !== 0x06054b50) fin -= 1
  expect(fin, 'sin registro de fin de directorio').toBeGreaterThanOrEqual(0)
  const entradas = vista.getUint16(fin + 10, true)
  let posicion = vista.getUint32(fin + 16, true)
  const salida = new Map<string, string>()
  const decodificador = new TextDecoder()
  for (let i = 0; i < entradas; i += 1) {
    expect(vista.getUint32(posicion, true)).toBe(0x02014b50)
    const crc = vista.getUint32(posicion + 16, true)
    const comprimido = vista.getUint32(posicion + 20, true)
    const largoNombre = vista.getUint16(posicion + 28, true)
    const local = vista.getUint32(posicion + 42, true)
    const nombre = decodificador.decode(bytes.subarray(posicion + 46, posicion + 46 + largoNombre))
    expect(vista.getUint32(local, true)).toBe(0x04034b50)
    const inicioDatos = local + 30 + vista.getUint16(local + 26, true) + vista.getUint16(local + 28, true)
    const datos = new Uint8Array(inflateRawSync(bytes.subarray(inicioDatos, inicioDatos + comprimido)))
    expect(crc32(datos), `CRC de ${nombre}`).toBe(crc)
    salida.set(nombre, decodificador.decode(datos))
    posicion += 46 + largoNombre + vista.getUint16(posicion + 30, true) + vista.getUint16(posicion + 32, true)
  }
  return salida
}

describe('el ZIP', () => {
  it('el CRC-32 es el de siempre', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('lo que entra, sale, con nombres en UTF-8', () => {
    const zip = crearZip([
      { nombre: 'a.txt', datos: 'hola' },
      { nombre: 'carpeta/ñandú.xml', datos: '<x>áé</x>'.repeat(100) },
    ])
    const leido = leerZip(zip)
    expect([...leido.keys()]).toEqual(['a.txt', 'carpeta/ñandú.xml'])
    expect(leido.get('carpeta/ñandú.xml')).toBe('<x>áé</x>'.repeat(100))
  })
})

describe('las piezas de la planilla', () => {
  it('las letras de las columnas', () => {
    expect([0, 25, 26, 51, 701, 702].map(letraDeColumna)).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA'])
  })

  it('escapa lo que XML no admite y quita los caracteres de control', () => {
    expect(escaparXml('a & b <c> "d"\u0001\u0008')).toBe('a &amp; b &lt;c&gt; &quot;d&quot;')
    expect(escaparXml('línea\nsiguiente\ttab')).toBe('línea\nsiguiente\ttab')
  })

  it('una fecha es el número de serie de Excel en hora local', () => {
    // La medianoche local es un número entero: Excel no guarda zona horaria.
    const medianoche = new Date(2026, 8, 26, 0, 0, 0)
    const serie = fechaDeExcel(medianoche)
    expect(serie).toBe(Math.round(serie))
    expect(serie).toBe(46291)
    expect(fechaDeExcel(new Date(2026, 8, 26, 18, 0, 0))).toBe(46291.75)
  })
})

describe('crearPlanilla', () => {
  const planilla = crearPlanilla(
    [
      {
        nombre: 'Contenidos: [todo]',
        columnas: [
          { titulo: 'Ficha', tipo: 'texto' },
          { titulo: 'Minutos', tipo: 'decimal' },
          { titulo: 'Veces', tipo: 'entero' },
          { titulo: 'Validada el', tipo: 'fecha' },
          { titulo: 'Ficha', tipo: 'texto' },
        ],
        filas: [
          ['Fractura & luxación', 12.5, 3, '2026-09-26T21:00:00.000Z', 'otra'],
          ['Sin fecha', null, 'no es número', 'no es fecha', undefined],
        ],
      },
      { nombre: 'Vacía', columnas: [{ titulo: 'Algo', tipo: 'texto' }], filas: [] },
    ],
    { titulo: 'Prueba', fecha: new Date(2026, 8, 26) },
  )
  const partes = leerZip(planilla)

  it('trae todas las partes que Excel espera', () => {
    for (const parte of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/sharedStrings.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/_rels/sheet1.xml.rels',
      'xl/tables/table1.xml',
      'xl/tables/table2.xml',
    ]) {
      expect(partes.has(parte), parte).toBe(true)
    }
    expect(partes.get('[Content_Types].xml')).toContain('/xl/tables/table2.xml')
  })

  it('el nombre de la hoja queda sin los caracteres que Excel prohíbe', () => {
    expect(partes.get('xl/workbook.xml')).toContain('<sheet name="Contenidos todo" sheetId="1" r:id="rId1"/>')
  })

  it('cada hoja es una tabla con filtros, y la primera fila queda fija', () => {
    const hoja = partes.get('xl/worksheets/sheet1.xml')!
    expect(hoja).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>')
    expect(hoja).toContain('<tablePart r:id="rId1"/>')
    const tabla = partes.get('xl/tables/table1.xml')!
    expect(tabla).toContain('ref="A1:E3"')
    expect(tabla).toContain('<autoFilter ref="A1:E3"/>')
    expect(tabla).toMatch(/name="TablaContenidostodo1"/)
    // Dos columnas no pueden llamarse igual en una tabla de Excel.
    expect(tabla).toContain('<tableColumn id="1" name="Ficha"/>')
    expect(tabla).toContain('<tableColumn id="5" name="Ficha 2"/>')
  })

  it('una hoja sin filas sigue teniendo una fila de datos, vacía', () => {
    expect(partes.get('xl/tables/table2.xml')).toContain('ref="A1:A2"')
  })

  it('los números van como números, las fechas como fechas y el resto como texto compartido', () => {
    const hoja = partes.get('xl/worksheets/sheet1.xml')!
    expect(hoja).toContain('<c r="B2" s="3"><v>12.5</v></c>')
    expect(hoja).toContain('<c r="C2" s="4"><v>3</v></c>')
    expect(hoja).toMatch(/<c r="D2" s="2"><v>46291\.7\d*<\/v><\/c>|<c r="D2" s="2"><v>4629\d\.\d+<\/v><\/c>/)
    // Lo que no es número en una columna de números se escribe como texto; una
    // fecha ilegible, no se escribe.
    expect(hoja).toMatch(/<c r="C3" t="s"><v>\d+<\/v><\/c>/)
    expect(hoja).not.toContain('r="D3"')
    expect(hoja).not.toContain('r="B3"')
    const cadenas = partes.get('xl/sharedStrings.xml')!
    expect(cadenas).toContain('<t xml:space="preserve">Fractura &amp; luxación</t>')
  })
})

describe('la planilla de la auditoría', () => {
  it('tiene sus cinco hojas y una fila por ficha', () => {
    const auditoria = armarAuditoria({
      revisiones: [
        { coleccion: 'patologias', documentoId: '7', titulo: 'Tibia', estado: 'lista', porcentajeEditado: 4, listaEn: '2026-09-20T10:00:00.000Z', historial: [] },
      ],
      sesiones: [],
      cuentas: [],
    })
    const hojas = hojasDeLaAuditoria(auditoria)
    expect(hojas.map((h) => h.nombre)).toEqual(['Contenidos', 'Revisores', 'Sesiones', 'Secciones', 'Historial'])
    expect(hojas[0].filas).toHaveLength(1)
    expect(hojas[0].filas[0].slice(0, 4)).toEqual(['Biblioteca de patologías', 'Tibia', 7, 'Lista para publicar'])
    for (const hoja of hojas) {
      for (const fila of hoja.filas) expect(fila).toHaveLength(hoja.columnas.length)
    }
    // Y se escribe sin quejarse.
    expect(crearPlanilla(hojas).length).toBeGreaterThan(1000)
  })
})
