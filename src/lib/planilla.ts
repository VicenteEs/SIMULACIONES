/**
 * Una planilla de Excel con cada hoja como tabla filtrable (D-143).
 *
 * La pidió el dueño así: «descargar una planilla con los datos en Excel, tipo
 * tabla para poder filtrar». Por eso no es un CSV —que Excel abre sin filtros,
 * con las tildes rotas según la configuración regional y las fechas como
 * texto—, sino un `.xlsx` de verdad en el que cada hoja es una **tabla** de
 * Excel: con los botones de filtro en la cabecera, filas alternas, la primera
 * fila fija al desplazarse, las fechas como fechas y los números como números,
 * de modo que filtrar «más de 30 minutos» o sumar una columna funciona sin
 * tocar nada.
 *
 * El formato es Office Open XML (ECMA-376): un ZIP (`src/lib/zip.ts`) con un
 * puñado de XML. Los textos van a la tabla de cadenas compartidas y no en
 * línea: es lo que escribe el propio Excel, y la forma que aceptan sin
 * «reparar» las versiones que se quejan de una cabecera de tabla en línea.
 */
import { crearZip } from './zip'

export type TipoDeColumna = 'texto' | 'entero' | 'decimal' | 'fecha'

export interface ColumnaDePlanilla {
  titulo: string
  tipo: TipoDeColumna
  /** En caracteres, como la mide Excel. */
  ancho?: number
}

export interface HojaDePlanilla {
  /** Hasta 31 caracteres y sin `[]:*?/\`: lo que Excel admite. */
  nombre: string
  columnas: ColumnaDePlanilla[]
  /** Una fila por registro; `null` o `undefined` es una celda vacía. Las fechas, como `Date` o texto ISO. */
  filas: (string | number | Date | null | undefined)[][]
}

/** Lo que Excel deja poner en una celda: más, y abre la planilla «reparándola». */
const LARGO_MAXIMO_DE_CELDA = 32_767

/** Quita lo que XML no admite (los controles, salvo tabulador y saltos) y escapa lo demás. */
export function escaparXml(valor: string): string {
  return valor
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** La letra de una columna a partir de su número (0 → A, 25 → Z, 26 → AA). */
export function letraDeColumna(indice: number): string {
  let n = indice + 1
  let letras = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    letras = String.fromCharCode(65 + resto) + letras
    n = Math.floor((n - 1) / 26)
  }
  return letras
}

/**
 * Una fecha como número de serie de Excel, en hora local.
 *
 * Excel no guarda zona horaria: su «45932,5» es un reloj de pared. Se toma la
 * hora local del proceso —la de Santiago en el servidor (`TZ`)—, que es la que
 * lee quien abre la planilla; en UTC, una validación de las 21:00 aparecería al
 * día siguiente a la medianoche.
 */
export function fechaDeExcel(fecha: Date): number {
  const local = fecha.getTime() - fecha.getTimezoneOffset() * 60_000
  return local / 86_400_000 + 25_569
}

const aFecha = (valor: unknown): Date | null => {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor
  if (typeof valor === 'string' && valor !== '') {
    const t = Date.parse(valor)
    return Number.isNaN(t) ? null : new Date(t)
  }
  return null
}

/**
 * Nombre de tabla válido para Excel: letras, cifras y guion bajo, empezando por
 * letra, y único en el libro —por eso lleva el número de la hoja—. Nunca queda
 * con forma de celda («T1», «R2C3»), que Excel rechaza: «Tabla» son cinco letras
 * y ninguna columna de Excel pasa de tres.
 */
function nombreDeTabla(nombre: string, indice: number): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_]/g, '')
  return `Tabla${limpio}${indice + 1}`
}

/** Nombre de hoja válido para Excel. */
function nombreDeHoja(nombre: string, usados: Set<string>): string {
  let limpio =
    nombre
      .replace(/[[\]:*?/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^'+|'+$/g, '')
      .slice(0, 31) || 'Hoja'
  let n = 2
  while (usados.has(limpio.toLowerCase())) {
    const sufijo = ` (${n})`
    limpio = `${limpio.slice(0, 31 - sufijo.length)}${sufijo}`
    n += 1
  }
  usados.add(limpio.toLowerCase())
  return limpio
}

// Estilos: 0 normal, 1 cabecera en negrita, 2 fecha y hora, 3 un decimal, 4 entero.
const ESTILO: Record<TipoDeColumna | 'cabecera', number> = { texto: 0, cabecera: 1, fecha: 2, decimal: 3, entero: 4 }

const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd-mm-yyyy hh:mm"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

/** Arma el `.xlsx` con las hojas dadas. */
export function crearPlanilla(
  hojas: readonly HojaDePlanilla[],
  propiedades: { titulo?: string; autor?: string; fecha?: Date } = {},
): Uint8Array {
  if (hojas.length === 0) throw new Error('Una planilla necesita al menos una hoja.')
  const cadenas = new Map<string, number>()
  let usosDeCadenas = 0
  const indiceDe = (valor: string): number => {
    usosDeCadenas += 1
    const existente = cadenas.get(valor)
    if (existente !== undefined) return existente
    const nuevo = cadenas.size
    cadenas.set(valor, nuevo)
    return nuevo
  }

  const usados = new Set<string>()
  const archivosDeHojas: { nombre: string; hoja: string; tabla: string; relaciones: string }[] = []

  hojas.forEach((hoja, h) => {
    const nombre = nombreDeHoja(hoja.nombre, usados)
    const columnas = hoja.columnas
    if (columnas.length === 0) throw new Error(`La hoja «${nombre}» no tiene columnas.`)
    // Títulos únicos: Excel no admite dos columnas de tabla con el mismo nombre.
    const titulos: string[] = []
    for (const columna of columnas) {
      let titulo = columna.titulo.replace(/\s+/g, ' ').trim() || 'Columna'
      let n = 2
      while (titulos.some((t) => t.toLowerCase() === titulo.toLowerCase())) titulo = `${columna.titulo} ${n++}`
      titulos.push(titulo)
    }
    const ultima = letraDeColumna(columnas.length - 1)
    // Una tabla de Excel tiene al menos una fila de datos, aunque vaya vacía.
    const filasDeDatos = Math.max(1, hoja.filas.length)
    const referencia = `A1:${ultima}${filasDeDatos + 1}`

    const filasXml: string[] = []
    filasXml.push(
      `<row r="1">${titulos
        .map((t, c) => `<c r="${letraDeColumna(c)}1" t="s" s="${ESTILO.cabecera}"><v>${indiceDe(t)}</v></c>`)
        .join('')}</row>`,
    )
    hoja.filas.forEach((fila, f) => {
      const r = f + 2
      const celdas: string[] = []
      columnas.forEach((columna, c) => {
        const valor = fila[c]
        if (valor === null || valor === undefined || valor === '') return
        const ref = `${letraDeColumna(c)}${r}`
        if (columna.tipo === 'fecha') {
          const fecha = aFecha(valor)
          if (fecha) celdas.push(`<c r="${ref}" s="${ESTILO.fecha}"><v>${fechaDeExcel(fecha)}</v></c>`)
          return
        }
        if (columna.tipo === 'entero' || columna.tipo === 'decimal') {
          const n = typeof valor === 'number' ? valor : Number(valor)
          if (Number.isFinite(n)) {
            celdas.push(`<c r="${ref}" s="${ESTILO[columna.tipo]}"><v>${n}</v></c>`)
            return
          }
        }
        const textoDeCelda = String(valor instanceof Date ? valor.toISOString() : valor).slice(0, LARGO_MAXIMO_DE_CELDA)
        celdas.push(`<c r="${ref}" t="s"><v>${indiceDe(textoDeCelda)}</v></c>`)
      })
      filasXml.push(`<row r="${r}">${celdas.join('')}</row>`)
    })

    const anchos = columnas
      .map(
        (columna, c) =>
          `<col min="${c + 1}" max="${c + 1}" width="${columna.ancho ?? (columna.tipo === 'texto' ? 24 : columna.tipo === 'fecha' ? 17 : 12)}" customWidth="1"/>`,
      )
      .join('')

    const hojaXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="${referencia}"/>
<sheetViews><sheetView workbookViewId="0"${h === 0 ? ' tabSelected="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${anchos}</cols>
<sheetData>${filasXml.join('')}</sheetData>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
<tableParts count="1"><tablePart r:id="rId1"/></tableParts>
</worksheet>`

    const tablaXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${h + 1}" name="${nombreDeTabla(nombre, h)}" displayName="${nombreDeTabla(nombre, h)}" ref="${referencia}" totalsRowShown="0">
<autoFilter ref="${referencia}"/>
<tableColumns count="${columnas.length}">${titulos
      .map((t, c) => `<tableColumn id="${c + 1}" name="${escaparXml(t)}"/>`)
      .join('')}</tableColumns>
<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>
</table>`

    const relacionesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${h + 1}.xml"/></Relationships>`

    archivosDeHojas.push({ nombre, hoja: hojaXml, tabla: tablaXml, relaciones: relacionesXml })
  })

  const cadenasXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${usosDeCadenas}" uniqueCount="${cadenas.size}">${[
    ...cadenas.keys(),
  ]
    .map((valor) => `<si><t xml:space="preserve">${escaparXml(valor)}</t></si>`)
    .join('')}</sst>`

  const n = archivosDeHojas.length
  const libroXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>${archivosDeHojas
    .map((a, i) => `<sheet name="${escaparXml(a.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets>
</workbook>`

  const relacionesDelLibro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${archivosDeHojas
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`

  const tipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
${archivosDeHojas
  .map(
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/tables/table${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`,
  )
  .join('')}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`

  const fecha = (propiedades.fecha ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const nucleo = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${escaparXml(propiedades.titulo ?? 'Planilla')}</dc:title>
<dc:creator>${escaparXml(propiedades.autor ?? 'TraumaHub')}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${fecha}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${fecha}</dcterms:modified>
</cp:coreProperties>`
  const aplicacion = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>TraumaHub</Application></Properties>`

  const raiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`

  return crearZip(
    [
      { nombre: '[Content_Types].xml', datos: tipos },
      { nombre: '_rels/.rels', datos: raiz },
      { nombre: 'docProps/core.xml', datos: nucleo },
      { nombre: 'docProps/app.xml', datos: aplicacion },
      { nombre: 'xl/workbook.xml', datos: libroXml },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: relacionesDelLibro },
      { nombre: 'xl/styles.xml', datos: ESTILOS_XML },
      { nombre: 'xl/sharedStrings.xml', datos: cadenasXml },
      ...archivosDeHojas.flatMap((a, i) => [
        { nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: a.hoja },
        { nombre: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, datos: a.relaciones },
        { nombre: `xl/tables/table${i + 1}.xml`, datos: a.tabla },
      ]),
    ],
    propiedades.fecha,
  )
}
