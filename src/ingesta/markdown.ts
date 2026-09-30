/**
 * El texto con formato de un archivo de ingesta, leído como lo guarda el panel.
 *
 * Los modelos de lenguaje escriben Markdown sin que se les pida, y quien
 * prepara un libro a mano también lo conoce, así que es el formato natural del
 * texto largo de una ficha. Pero el editor del panel sabe representar mucho
 * menos que Markdown —párrafos, tres niveles de subtítulo, citas, listas sin
 * anidar, negrita, cursiva, tachado y enlaces: el modelo de en medio de
 * `src/lib/textoRico.ts`— y lo que no sabe representar desaparece al guardar.
 * Por eso esto no es un lector de Markdown completo sino uno de ese
 * subconjunto, que además **dice** lo que no puede traducir: una tabla que se
 * convirtiera en silencio en una fila de barras llegaría así a la ficha, y el
 * revisor la tomaría por un descuido suyo.
 *
 * Lo que devuelve son `Parrafo[]`, el modelo de la casa, que `haciaLexical`
 * convierte en lo que se guarda. Es pura y no lanza nunca: un texto raro es un
 * error que contar, no una excepción.
 */
import { enlaceSeguro, type Fragmento, type Parrafo } from '@/lib/textoRico'

export interface LecturaDeMarkdown {
  parrafos: Parrafo[]
  /** Lo que no se puede guardar tal cual: el archivo no se da por bueno. */
  errores: string[]
  /** Lo que se guarda, pero no como se escribió. */
  avisos: string[]
}

const ENCABEZADO = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const VINETA = /^(\s*)[-*+]\s+(.*)$/
const NUMERADA = /^(\s*)\d{1,3}[.)]\s+(.*)$/
// Con espacio detrás, o sola: «>10 mm» al principio de una línea es una cifra, no una cita.
const CITA = /^\s{0,3}>(?:\s(.*)|$)/
const FILA_DE_TABLA = /^\s*\|.*\|\s*$/
const VALLA_DE_CODIGO = /^\s*(```|~~~)/
const LINEA_DIVISORIA = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const ETIQUETA_HTML = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/

// Un miembro por tipo, y no `'parrafo' | 'cita'` en uno solo: TypeScript solo
// estrecha una unión por un discriminante de un único valor, y con los dos
// juntos la rama `else` de «¿es párrafo o cita?» no sabía que era una lista.
type Abierto =
  | { tipo: 'parrafo'; lineas: string[] }
  | { tipo: 'cita'; lineas: string[] }
  | { tipo: 'vinetas'; puntos: string[][]; sangria: number }
  | { tipo: 'numerada'; puntos: string[][]; sangria: number }

type ListaAbierta = Extract<Abierto, { tipo: 'vinetas' | 'numerada' }>

/**
 * Une las líneas de un párrafo como lo hace Markdown: un salto simple es un
 * espacio, y solo es salto de verdad si la línea acaba en dos espacios o en una
 * barra invertida. Así se lee lo que escribe un modelo, que parte las líneas
 * largas sin querer decir nada con ello.
 */
function unirLineas(lineas: string[]): string {
  let texto = ''
  lineas.forEach((linea, i) => {
    const salto = / {2,}$/.test(linea) || /\\$/.test(linea)
    const limpia = linea.replace(/\\$/, '').trim()
    texto += limpia
    if (i < lineas.length - 1) texto += salto ? '\n' : ' '
  })
  return texto
}

// ------------------------------------------------------------ en la línea

interface Formato {
  negrita?: boolean
  cursiva?: boolean
  tachado?: boolean
  enlace?: string
}

const esEspacio = (c: string | undefined) => c === undefined || /\s/.test(c)
const esAlfanumerico = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c)

/**
 * Dónde se cierra un delimitador que se abre en `desde`.
 *
 * Es la regla de Markdown reducida a lo que hace falta aquí: el que abre va
 * pegado a lo que sigue, el que cierra pegado a lo que le precede, y con el
 * guion bajo además en borde de palabra, para que `lado_a_lado` no se lea como
 * cursiva. Si no hay cierre, el delimitador es texto: «5 * 3» sigue siendo una
 * multiplicación.
 */
function cierreDe(texto: string, desde: number, delimitador: string): number {
  const largo = delimitador.length
  const siguiente = texto[desde + largo]
  if (esEspacio(siguiente)) return -1
  if (delimitador[0] === '_' && esAlfanumerico(texto[desde - 1])) return -1
  let i = desde + largo + 1
  while (i <= texto.length - largo) {
    if (texto[i] === '\\') {
      i += 2
      continue
    }
    if (texto.startsWith(delimitador, i)) {
      const antes = texto[i - 1]
      const despues = texto[i + largo]
      // Un asterisco pegado a otro no cierra: `**negrita *con* cursiva**`
      // tiene que emparejar los dobles entre sí y no el primero de ellos con
      // el simple de dentro.
      const pegadoAOtro = despues === delimitador[0] || texto[i - 1] === delimitador[0]
      const bordeDePalabra = delimitador[0] !== '_' || !esAlfanumerico(despues)
      if (!esEspacio(antes) && !pegadoAOtro && bordeDePalabra) return i
    }
    i += 1
  }
  return -1
}

const DELIMITADORES: { marca: string; formato: Formato }[] = [
  { marca: '***', formato: { negrita: true, cursiva: true } },
  { marca: '___', formato: { negrita: true, cursiva: true } },
  { marca: '**', formato: { negrita: true } },
  { marca: '__', formato: { negrita: true } },
  { marca: '~~', formato: { tachado: true } },
  { marca: '*', formato: { cursiva: true } },
  { marca: '_', formato: { cursiva: true } },
]

function fragmentosEnLinea(
  texto: string,
  formato: Formato,
  problemas: { errores: Set<string>; avisos: Set<string> },
): Fragmento[] {
  const salida: Fragmento[] = []
  let suelto = ''
  const soltar = () => {
    if (suelto.length === 0) return
    salida.push({
      texto: suelto,
      ...(formato.negrita ? { negrita: true } : {}),
      ...(formato.cursiva ? { cursiva: true } : {}),
      ...(formato.tachado ? { tachado: true } : {}),
      ...(formato.enlace ? { enlace: formato.enlace } : {}),
    })
    suelto = ''
  }

  let i = 0
  while (i < texto.length) {
    const c = texto[i]

    // Una barra invertida deja pasar el signo siguiente tal cual: es como se
    // escribe un asterisco que no es formato.
    if (c === '\\' && i + 1 < texto.length && /[\\`*_{}[\]()#+\-.!>~|]/.test(texto[i + 1])) {
      suelto += texto[i + 1]
      i += 2
      continue
    }

    if (c === '!' && texto[i + 1] === '[') {
      problemas.errores.add(
        'Una imagen dentro del texto no se puede guardar: póngala en un bloque «imagen», con su archivo al lado del JSON.',
      )
    }

    if (c === '[') {
      const cierre = texto.indexOf('](', i + 1)
      const fin = cierre === -1 ? -1 : texto.indexOf(')', cierre + 2)
      if (cierre !== -1 && fin !== -1) {
        const etiqueta = texto.slice(i + 1, cierre)
        const direccion = texto.slice(cierre + 2, fin).trim()
        const segura = enlaceSeguro(direccion)
        const esImagen = texto[i - 1] === '!'
        if (esImagen) suelto = suelto.replace(/!$/, '')
        if (!segura && !esImagen) {
          problemas.errores.add(
            `El enlace «${direccion}» no se puede guardar: solo valen direcciones http o https, correos (mailto:) y teléfonos (tel:).`,
          )
        }
        soltar()
        if (!esImagen) salida.push(...fragmentosEnLinea(etiqueta, { ...formato, enlace: segura }, problemas))
        i = fin + 1
        continue
      }
    }

    if (c === '`') {
      const fin = texto.indexOf('`', i + 1)
      if (fin !== -1) {
        problemas.avisos.add(
          'El texto entre comillas invertidas (`así`) no tiene formato propio en la plataforma: se guarda como texto normal.',
        )
        suelto += texto.slice(i + 1, fin)
        i = fin + 1
        continue
      }
    }

    if (c === '*' || c === '_' || c === '~') {
      let emparejado = false
      for (const { marca, formato: propio } of DELIMITADORES) {
        if (!texto.startsWith(marca, i)) continue
        const fin = cierreDe(texto, i, marca)
        if (fin === -1) continue
        soltar()
        salida.push(...fragmentosEnLinea(texto.slice(i + marca.length, fin), { ...formato, ...propio }, problemas))
        i = fin + marca.length
        emparejado = true
        break
      }
      if (emparejado) continue
    }

    suelto += c
    i += 1
  }
  soltar()
  return salida
}

/** Los fragmentos de un trozo de texto, con los avisos de lo que no se tradujo. */
function enLinea(texto: string, problemas: { errores: Set<string>; avisos: Set<string> }): Fragmento[] {
  if (ETIQUETA_HTML.test(texto)) {
    problemas.errores.add('Hay etiquetas HTML en el texto: la plataforma no las guarda. Use el formato de Markdown.')
  }
  const fragmentos = fragmentosEnLinea(texto, {}, problemas)
  // Lo que quede de un delimitador sin pareja se verá tal cual en la ficha.
  // No es un error —«5 * 3» es legítimo—, pero `**Fase 1:` sin cerrar casi
  // siempre es un descuido del modelo, y es mejor decirlo aquí que dejar que
  // lo encuentre el revisor.
  if (fragmentos.some((f) => /\*\*\S|\S\*\*|__\S|\S__/.test(f.texto))) {
    problemas.avisos.add('Quedaron asteriscos o guiones bajos sin cerrar: en la ficha se verán tal cual.')
  }
  return fragmentos
}

// ------------------------------------------------------------- en bloques

/**
 * Lee el texto con formato de un campo o de un bloque.
 *
 * Un texto vacío da una lista vacía, que `haciaLexical` convierte en el párrafo
 * en blanco con que el editor representa «nada»: si el campo es obligatorio, lo
 * dirá quien compruebe los obligatorios, no esto.
 */
export function desdeMarkdown(texto: string): LecturaDeMarkdown {
  const errores = new Set<string>()
  const avisos = new Set<string>()
  const problemas = { errores, avisos }
  const parrafos: Parrafo[] = []
  let abierto: Abierto | null = null
  let enCodigo = false

  const cerrar = () => {
    if (!abierto) return
    if (abierto.tipo === 'parrafo' || abierto.tipo === 'cita') {
      const fragmentos = enLinea(unirLineas(abierto.lineas), problemas)
      if (fragmentos.length > 0) parrafos.push({ tipo: abierto.tipo, fragmentos })
    } else {
      const puntos = abierto.puntos
        .map((lineas) => enLinea(unirLineas(lineas), problemas))
        .filter((fragmentos) => fragmentos.length > 0)
      if (puntos.length > 0) parrafos.push({ tipo: abierto.tipo, puntos })
    }
    abierto = null
  }

  // Se pregunta con una función y no mirando `abierto` en el bucle: allí
  // TypeScript lo estrecha por las asignaciones que ve antes en la misma
  // vuelta —párrafo o cita— y da por imposible que sea una lista, aunque la
  // vuelta anterior la dejara abierta.
  const listaAbierta = (): ListaAbierta | null =>
    abierto && (abierto.tipo === 'vinetas' || abierto.tipo === 'numerada') ? abierto : null

  const lineas = texto.replace(/\r\n?/g, '\n').split('\n')
  for (const linea of lineas) {
    if (VALLA_DE_CODIGO.test(linea)) {
      errores.add('Hay un bloque de código (```): la plataforma no lo tiene. Escríbalo como texto normal.')
      cerrar()
      enCodigo = !enCodigo
      continue
    }
    if (enCodigo) {
      // Lo de dentro se conserva como párrafo para que el error diga dónde está
      // el problema sin tragarse el texto.
      if (linea.trim() === '') cerrar()
      else if (abierto?.tipo === 'parrafo') abierto.lineas.push(linea)
      else {
        cerrar()
        abierto = { tipo: 'parrafo', lineas: [linea] }
      }
      continue
    }

    if (linea.trim() === '') {
      cerrar()
      continue
    }

    if (FILA_DE_TABLA.test(linea)) {
      errores.add(
        'Hay una tabla en el texto: la plataforma no tiene tablas dentro del texto. Una clasificación va en un bloque «tabla-clasificacion»; lo demás, en una lista.',
      )
      cerrar()
      continue
    }

    if (LINEA_DIVISORIA.test(linea)) {
      errores.add('Hay una línea divisoria (---): la plataforma no la tiene. Separe con un subtítulo o con otro bloque.')
      cerrar()
      continue
    }

    const encabezado = ENCABEZADO.exec(linea)
    if (encabezado) {
      cerrar()
      const nivel = encabezado[1].length
      if (nivel === 1) {
        errores.add('Un subtítulo con «# » no existe: el nivel 1 es el nombre de la ficha. Use «## », «### » o «#### ».')
      } else if (nivel > 4) {
        errores.add('Solo hay tres niveles de subtítulo: «## », «### » y «#### ».')
      }
      const fragmentos = enLinea(encabezado[2], problemas)
      const tipo = nivel <= 2 ? 'h2' : nivel === 3 ? 'h3' : 'h4'
      if (fragmentos.length > 0) parrafos.push({ tipo, fragmentos })
      continue
    }

    const cita = CITA.exec(linea)
    if (cita) {
      if (abierto?.tipo !== 'cita') {
        cerrar()
        abierto = { tipo: 'cita', lineas: [] }
      }
      abierto.lineas.push(cita[1] ?? '')
      continue
    }

    const vineta = VINETA.exec(linea)
    const numerada = vineta ? null : NUMERADA.exec(linea)
    const punto = vineta ?? numerada
    if (punto) {
      const tipo = vineta ? 'vinetas' : 'numerada'
      const sangria = punto[1].replace(/\t/g, '    ').length
      // Un punto más adentro que el primero de su lista es una sublista. La
      // plataforma no anida (ver `puntosDeListaLexical`), así que sus puntos
      // se quedan en la lista de fuera, en su sitio, aunque sean de otro tipo.
      const lista = listaAbierta()
      if (lista && sangria >= lista.sangria + 2) {
        avisos.add('Hay una lista dentro de otra: la plataforma no las anida, así que sus puntos quedan al mismo nivel.')
        lista.puntos.push([punto[2]])
        continue
      }
      if (lista && lista.tipo === tipo) {
        lista.puntos.push([punto[2]])
        continue
      }
      cerrar()
      abierto = { tipo, puntos: [[punto[2]]], sangria }
      continue
    }

    // Una línea suelta pegada a lo anterior lo continúa, como en Markdown: el
    // punto de una lista o la cita que se partió en dos renglones.
    if (abierto) {
      if (abierto.tipo === 'vinetas' || abierto.tipo === 'numerada') {
        abierto.puntos[abierto.puntos.length - 1].push(linea)
      } else {
        abierto.lineas.push(linea)
      }
      continue
    }
    abierto = { tipo: 'parrafo', lineas: [linea] }
  }
  if (enCodigo) cerrar()
  cerrar()

  return { parrafos, errores: [...errores], avisos: [...avisos] }
}

/**
 * Si un texto que debería ser simple trae formato de Markdown.
 *
 * Los campos de texto simple se pintan tal cual dentro de un párrafo: la
 * negrita sale con sus asteriscos y la viñeta con su guion. Solo se buscan las
 * marcas que un modelo pone sin querer; un asterisco suelto o un número con
 * punto son texto corriente.
 */
export function formatoEnTextoSimple(texto: string): string | null {
  if (/\*\*\S[^]*?\S?\*\*|__\S[^]*?__/.test(texto)) return 'negrita con asteriscos'
  if (/^\s*#{1,6}\s/m.test(texto)) return 'un subtítulo con «#»'
  if (/\[[^\]]+\]\([^)]+\)/.test(texto)) return 'un enlace de Markdown'
  if (/^\s*[-*+]\s+\S/m.test(texto) && texto.includes('\n')) return 'viñetas'
  return null
}
