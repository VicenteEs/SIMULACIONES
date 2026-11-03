import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ESPACIOS,
  ESPACIOS_DE_FOTO,
  ESPACIOS_DE_TEXTO,
  FILAS_DE_LA_COMPARATIVA,
  MARCAS_DE_CIFRA,
  NOMBRE_DE_FOTO,
  TECHO_DE_FOTO_BYTES,
  espacioDeFoto,
  espacioDeTexto,
  nombreDeFoto,
  normalizarTexto,
  problemaDeLaFoto,
  problemaDelTexto,
  sinResaltado,
  sustituirCifras,
  trozosResaltados,
  type EspacioDeTexto,
} from '@/lib/espaciosDeLaPagina'

/**
 * El registro de lo que se puede cambiar en las páginas públicas (P-007 E2).
 *
 * Es la única lista: la leen la portada, la pestaña del panel, las acciones y
 * las colecciones. Si se equivoca, no falla nada: la portada pinta un texto que
 * nadie puede cambiar, o la pestaña ofrece uno que ya no se ve. Por eso se
 * prueba aquí lo que la hace confiable.
 */

const RAIZ = resolve(process.cwd())
const espacio = (id: string): EspacioDeTexto => {
  const encontrado = espacioDeTexto(id)
  if (!encontrado) throw new Error(`falta el espacio ${id}`)
  return encontrado
}

describe('el registro de espacios', () => {
  it('no repite ningún id, y cada id se puede guardar y servir tal cual', () => {
    const ids = ESPACIOS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id, id).toMatch(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)
  })

  it('cada original cabe en su espacio y pasa la misma regla que lo que escribe el administrador', () => {
    for (const e of ESPACIOS_DE_TEXTO) {
      expect(problemaDelTexto(e, normalizarTexto(e, e.original)), e.id).toBeNull()
      expect(normalizarTexto(e, e.original), `${e.id} no está normalizado`).toBe(e.original)
    }
  })

  it('cada foto parte de una captura que existe en el repositorio', () => {
    const carpeta = join(RAIZ, 'src', 'components', 'portada', 'imagenes')
    for (const e of ESPACIOS_DE_FOTO) {
      expect(existsSync(join(carpeta, `${e.original}.webp`)), `${e.id}: falta ${e.original}.webp`).toBe(true)
      expect(e.descripcion.length, `${e.id} sin descripción`).toBeGreaterThan(10)
    }
  })

  it('las imágenes de partida que hay en la carpeta las importa `imagenes.ts`, ni una de más ni de menos', () => {
    const carpeta = join(RAIZ, 'src', 'components', 'portada', 'imagenes')
    const archivos = readdirSync(carpeta).filter((n) => n.endsWith('.webp')).map((n) => n.replace(/\.webp$/, ''))
    const modulo = readFileSync(join(RAIZ, 'src', 'components', 'portada', 'imagenes.ts'), 'utf8')
    for (const nombre of archivos) expect(modulo, nombre).toContain(`./imagenes/${nombre}.webp`)
  })

  it('el número de piezas no está escrito a mano en ningún texto: va como marca', () => {
    for (const e of ESPACIOS_DE_TEXTO) expect(e.original, e.id).not.toMatch(/2\.231/)
    expect(espacio('portada.estudia.bajada').original).toContain(MARCAS_DE_CIFRA.piezas)
  })

  it('cada fila de la comparativa de planes tiene su texto', () => {
    for (const fila of FILAS_DE_LA_COMPARATIVA) expect(espacioDeTexto(`planes.comparativa.fila.${fila}`), fila).toBeDefined()
  })

  it('distingue fotos de textos', () => {
    expect(espacioDeFoto('portada.capas.piel')).toBeDefined()
    expect(espacioDeFoto('portada.hero.titular')).toBeUndefined()
    expect(espacioDeTexto('portada.capas.piel')).toBeUndefined()
    expect(espacioDeTexto('no.existe')).toBeUndefined()
    expect(espacioDeTexto(42)).toBeUndefined()
  })
})

describe('lo que se puede guardar en un texto', () => {
  const titular = espacio('portada.hero.titular')
  const pregunta = espacio('portada.preguntas.pregunta-6')
  const bajada = espacio('portada.hero.bajada')
  const correo = espacio('general.correo')

  it('un texto obligatorio no queda vacío; uno opcional sí, y entonces no se pinta', () => {
    expect(problemaDelTexto(titular, '')).toMatch(/no puede quedar vacío/)
    expect(problemaDelTexto(pregunta, '')).toBeNull()
  })

  it('cuenta los caracteres como se leen, no los bytes', () => {
    const justo = 'á'.repeat(titular.maximo)
    expect(problemaDelTexto(titular, justo)).toBeNull()
    expect(problemaDelTexto(titular, `${justo}a`)).toMatch(new RegExp(`tiene ${titular.maximo + 1} caracteres`))
  })

  it('no admite etiquetas HTML ni direcciones web: se verían tal cual', () => {
    expect(problemaDelTexto(bajada, 'Hola <script>alert(1)</script>')).toMatch(/HTML/)
    expect(problemaDelTexto(bajada, 'Vea <b>esto</b>')).toMatch(/HTML/)
    expect(problemaDelTexto(bajada, 'Más en https://ejemplo.cl')).toMatch(/direcciones web/)
    expect(problemaDelTexto(bajada, 'Más en www.ejemplo.cl')).toMatch(/direcciones web/)
    // Un signo de menor suelto es texto normal.
    expect(problemaDelTexto(bajada, 'En menos de < 2 semanas')).toBeNull()
  })

  it('no admite caracteres invisibles pegados desde otro programa', () => {
    expect(problemaDelTexto(titular, `Ensaya${String.fromCharCode(0x200b)} la cirugía`)).toMatch(/invisibles/)
    expect(problemaDelTexto(titular, `Ensaya${String.fromCharCode(0xfeff)}`)).toMatch(/invisibles/)
    expect(problemaDelTexto(titular, 'Con\ttabulador')).toMatch(/invisibles/)
  })

  it('el correo de contacto tiene que ser un correo', () => {
    expect(problemaDelTexto(correo, 'contacto@chesscore.cl')).toBeNull()
    expect(problemaDelTexto(correo, 'contacto')).toMatch(/correo/)
  })

  it('una línea se queda en una línea; un párrafo conserva sus saltos, sin huecos de más', () => {
    expect(normalizarTexto(titular, '  Ensaya\n la   cirugía  ')).toBe('Ensaya la cirugía')
    expect(normalizarTexto(bajada, 'Uno  dos\r\n\r\n\r\n\r\ntres ')).toBe('Uno dos\n\ntres')
    expect(problemaDelTexto(bajada, normalizarTexto(bajada, 'Uno\n\ndos'))).toBeNull()
  })
})

describe('lo resaltado entre asteriscos', () => {
  const titular = espacioDeTexto('portada.hero.titular') as EspacioDeTexto

  it('parte el texto en trozos, y los de entre asteriscos van resaltados', () => {
    expect(trozosResaltados('Ensaya antes de entrar *al pabellón.*')).toEqual([
      { texto: 'Ensaya antes de entrar ', resaltado: false },
      { texto: 'al pabellón.', resaltado: true },
    ])
    expect(trozosResaltados('*Todo* resaltado y *a medias*')).toEqual([
      { texto: 'Todo', resaltado: true },
      { texto: ' resaltado y ', resaltado: false },
      { texto: 'a medias', resaltado: true },
    ])
    expect(trozosResaltados('Sin nada')).toEqual([{ texto: 'Sin nada', resaltado: false }])
  })

  it('con un asterisco sin pareja no resalta nada y lo deja a la vista', () => {
    // No llega a la página —el servidor no lo guarda—, pero si llegara sería
    // mejor un asterisco suelto que media página en color.
    expect(trozosResaltados('5 * 3')).toEqual([{ texto: '5 * 3', resaltado: false }])
  })

  it('el servidor no guarda un asterisco sin pareja', () => {
    expect(problemaDelTexto(titular, 'Ensaya antes de *entrar')).toMatch(/asterisco sin pareja/)
    expect(problemaDelTexto(titular, 'Ensaya antes de *entrar*')).toBeNull()
  })

  it('sin los asteriscos queda el texto que se lee', () => {
    expect(sinResaltado('Ensaya antes de entrar *al pabellón.*')).toBe('Ensaya antes de entrar al pabellón.')
  })

  it('todo original con asteriscos los trae en pareja', () => {
    for (const e of ESPACIOS_DE_TEXTO) {
      expect((e.original.match(/\*/g)?.length ?? 0) % 2, e.id).toBe(0)
    }
  })
})

describe('las páginas no escriben a mano lo que se cambia en el panel', () => {
  // Un texto copiado en el componente se sigue viendo igual después de que el
  // administrador lo cambie, y desde el panel parece que guardar no hace
  // nada. Se miran los largos: «Cotizar» o «Planes» salen también como
  // rótulos de la barra, y eso no es un texto de «Medios de la página».
  const carpeta = resolve(process.cwd(), 'src', 'components', 'portada')
  const fuentes = readdirSync(carpeta)
    .filter((a) => a.endsWith('.tsx'))
    .map((a) => [a, readFileSync(join(carpeta, a), 'utf8')] as const)

  it.each(ESPACIOS_DE_TEXTO.filter((e) => sinResaltado(e.original).length >= 24).map((e) => [e.id, e] as const))(
    '%s',
    (_id, espacio) => {
      const texto = sinResaltado(espacio.original)
      expect(fuentes.filter(([, codigo]) => codigo.includes(texto) || codigo.includes(espacio.original)).map(([a]) => a)).toEqual([])
    },
  )
})

describe('las cifras dentro de un texto', () => {
  const formatear = (n: number) => n.toLocaleString('es-CL')

  it('la marca se cambia por la cifra de verdad', () => {
    expect(sustituirCifras(`Cada una de las ${MARCAS_DE_CIFRA.piezas} piezas`, { piezas: 2231 }, () => '2.231')).toBe(
      'Cada una de las 2.231 piezas',
    )
  })

  it('sin cifra se quita la marca, sin inventar un número ni dejarla a la vista', () => {
    expect(sustituirCifras(`Cada una de las ${MARCAS_DE_CIFRA.piezas} piezas`, { piezas: null }, formatear)).toBe(
      'Cada una de las piezas',
    )
  })
})

describe('las fotos', () => {
  const piel = espacioDeFoto('portada.capas.piel')!

  it('se nombran por el espacio y la huella del contenido, y el nombre pasa el filtro de la ruta pública', () => {
    const nombre = nombreDeFoto(piel, 'a'.repeat(64), 'image/webp')
    expect(nombre).toBe(`portada-capas-piel-${'a'.repeat(12)}.webp`)
    expect(NOMBRE_DE_FOTO.test(nombre!)).toBe(true)
  })

  it('un tipo que no es foto de la página no recibe nombre', () => {
    expect(nombreDeFoto(piel, 'a'.repeat(64), 'image/svg+xml')).toBeNull()
    expect(nombreDeFoto(piel, 'no-es-huella', 'image/png')).toBeNull()
  })

  it('el filtro de la ruta pública no deja pasar caminos ni otros tipos', () => {
    for (const malo of ['../.env', 'a/b.png', 'foto.svg', 'FOTO.PNG', 'foto.png.html', '.png', 'foto']) {
      expect(NOMBRE_DE_FOTO.test(malo), malo).toBe(false)
    }
  })

  it('la pestaña avisa antes de subir un SVG, un formato ajeno o una foto pasada de peso', () => {
    expect(problemaDeLaFoto({ tipo: 'image/svg+xml', bytes: 10 })).toMatch(/SVG/)
    expect(problemaDeLaFoto({ tipo: 'image/gif', bytes: 10 })).toMatch(/PNG, JPG o WEBP/)
    expect(problemaDeLaFoto({ tipo: 'image/png', bytes: TECHO_DE_FOTO_BYTES + 1 })).toMatch(/máximo son 8 MB/)
    expect(problemaDeLaFoto({ tipo: 'image/png', bytes: 0 })).toMatch(/vacío/)
    expect(problemaDeLaFoto({ tipo: 'image/jpeg', bytes: 1024 })).toBeNull()
  })
})
