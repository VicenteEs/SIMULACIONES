/**
 * De un archivo de ingesta a un documento que el panel sabría guardar (D-144).
 *
 * Es la mitad pura del importador: no toca la base ni el disco, y por eso se
 * prueba sin PostgreSQL. La otra mitad, `scripts/importar-ingesta.ts`, lee los
 * archivos, resuelve los catálogos contra la base, sube las imágenes y escribe.
 *
 * Se recorre **el esquema del panel**, campo por campo, y no el archivo: así la
 * ingesta no tiene una lista de campos propia que se separe de la del panel
 * (ver la cabecera de `formato.ts`). Lo que el esquema no conoce no se guarda, y
 * se cuenta como aviso en vez de perderse sin decirlo.
 *
 * Lo que este módulo traduce, y por qué:
 * - los textos con formato llegan en Markdown y se guardan como Lexical, con el
 *   mismo lector acotado que dice lo que no puede representar;
 * - los bloques llegan como `{ "bloque": "texto", … }` y se guardan como
 *   `{ blockType: 'texto', … }`;
 * - las relaciones llegan por nombre («Rodilla») y se guardan por identificador.
 *
 * El resultado pasa además por `depurarDocumento`, el mismo paso por el que
 * pasa cualquier guardado del panel: lo que sobrevive a él es lo que el
 * renderizador sabe pintar.
 */
import {
  camposDe,
  esquemaDe,
  type Campo,
} from '@/admin/esquema'
import { avisoDeContenidoQueSeBorraria, depurarDocumento, faltantes } from '@/admin/depurar'
import { bloqueDe } from '@/admin/bloques'
import { haciaLexical } from '@/lib/textoRico'
import {
  BLOQUES_FUERA_DE_LA_INGESTA,
  CATALOGOS_DE_INGESTA,
  FORMATO_DE_INGESTA,
  LARGO_MAXIMO_DE_CLAVE,
  LARGO_MAXIMO_DE_NOTA,
  MAXIMO_DE_NOTAS,
  PATRON_DE_CLAVE,
  CAMPOS_DE_PROCEDENCIA,
  esBloqueDeIngesta,
  esCatalogoDeIngesta,
  esModuloDeIngesta,
  estaFueraDeLaIngesta,
  type ModuloDeIngesta,
} from './formato'
import { desdeMarkdown } from './markdown'

type Objeto = Record<string, unknown>

const esObjeto = (valor: unknown): valor is Objeto =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor)

/** Clave de una entrada de catálogo en el mapa que arma el importador. */
export const claveDeCatalogo = (catalogo: string, valor: string): string => `${catalogo}\u0000${valor}`

/** Lo que el importador lleva a la base: la ficha convertida y su procedencia. */
export interface FichaConvertida {
  modulo: ModuloDeIngesta
  clave: string
  documento: Objeto
  procedencia: {
    origen: 'ia' | 'manual'
    libro?: string
    capitulo?: string
    paginas?: string
    lote?: string
    modelo?: string
    archivoFuente?: string
  }
  notasParaElRevisor: string[]
  /** Por catálogo, los nombres que la ficha necesita y no estaban en el mapa. */
  faltanEnCatalogo: { catalogo: string; valor: string }[]
  /** Lo que impide importarla: no se escribe nada. */
  errores: string[]
  /** Lo que se importa, pero no como venía, o queda incompleto para publicar. */
  avisos: string[]
}

interface Contexto {
  modulo: ModuloDeIngesta
  ids: ReadonlyMap<string, string | number>
  errores: string[]
  avisos: string[]
  faltan: Map<string, { catalogo: string; valor: string }>
}

const enRuta = (ruta: string, nombre: string) => (ruta ? `${ruta}.${nombre}` : nombre)

/** La ruta sin índices de fila: es la que usa `FUERA_DE_LA_INGESTA`. */
const sinIndices = (ruta: string) => ruta.replace(/\[\d+\]/g, '')

function convertirRico(valor: unknown, donde: string, ctx: Contexto): unknown {
  if (typeof valor !== 'string') {
    ctx.errores.push(`«${donde}» tiene que ser un texto con formato (Markdown), y llegó ${typeof valor}.`)
    return haciaLexical([])
  }
  const lectura = desdeMarkdown(valor)
  for (const e of lectura.errores) ctx.errores.push(`«${donde}»: ${e}`)
  for (const a of lectura.avisos) ctx.avisos.push(`«${donde}»: ${a}`)
  return haciaLexical(lectura.parrafos)
}

function convertirRelacion(campo: Extract<Campo, { tipo: 'relacion' }>, valor: unknown, donde: string, ctx: Contexto) {
  if (!esCatalogoDeIngesta(campo.coleccion)) {
    ctx.errores.push(`«${donde}» apunta a «${campo.coleccion}», que no se carga por ingesta.`)
    return null
  }
  const uno = (nombre: unknown): string | number | null => {
    if (typeof nombre !== 'string' || nombre.trim() === '') {
      ctx.errores.push(`«${donde}» tiene que nombrar una entrada de ${CATALOGOS_DE_INGESTA[campo.coleccion as keyof typeof CATALOGOS_DE_INGESTA].nombre}.`)
      return null
    }
    const limpio = nombre.trim()
    const id = ctx.ids.get(claveDeCatalogo(campo.coleccion, limpio))
    if (id === undefined) {
      ctx.faltan.set(claveDeCatalogo(campo.coleccion, limpio), { catalogo: campo.coleccion, valor: limpio })
      return null
    }
    return id
  }
  if (campo.multiple) {
    if (!Array.isArray(valor)) {
      ctx.errores.push(`«${donde}» tiene que ser una lista de nombres.`)
      return []
    }
    return valor.map(uno).filter((v) => v !== null)
  }
  return uno(valor)
}

function convertirCampos(campos: Campo[], origen: Objeto, ruta: string, ctx: Contexto): Objeto {
  const salida: Objeto = {}
  const conocidos = new Set(campos.map((c) => c.nombre))
  for (const nombre of Object.keys(origen)) {
    if (!conocidos.has(nombre) && nombre !== 'bloque') {
      ctx.avisos.push(`«${enRuta(ruta, nombre)}» no es un campo del panel: no se guarda.`)
    }
  }
  for (const campo of campos) {
    const valor = origen[campo.nombre]
    const donde = enRuta(ruta, campo.nombre)
    if (valor === undefined || valor === null) continue
    if (estaFueraDeLaIngesta(ctx.modulo, sinIndices(donde))) {
      ctx.avisos.push(`«${donde}» se completa en la plataforma: no se guarda.`)
      continue
    }
    switch (campo.tipo) {
      case 'texto':
      case 'area':
        if (typeof valor !== 'string') ctx.errores.push(`«${donde}» tiene que ser un texto.`)
        else salida[campo.nombre] = valor
        break
      case 'numero':
        if (typeof valor !== 'number' || !Number.isFinite(valor)) ctx.errores.push(`«${donde}» tiene que ser un número.`)
        else salida[campo.nombre] = valor
        break
      case 'casilla':
        if (typeof valor !== 'boolean') ctx.errores.push(`«${donde}» tiene que ser true o false.`)
        else salida[campo.nombre] = valor
        break
      case 'seleccion':
        if (typeof valor !== 'string' || !campo.opciones.some((o) => o.valor === valor)) {
          ctx.errores.push(`«${donde}» vale «${String(valor)}» y las opciones son ${campo.opciones.map((o) => o.valor).join(', ')}.`)
        } else salida[campo.nombre] = valor
        break
      case 'relacion':
        salida[campo.nombre] = convertirRelacion(campo, valor, donde, ctx)
        break
      case 'archivo':
        ctx.avisos.push(`«${donde}» es un archivo: se sube en la plataforma, no se guarda.`)
        break
      case 'rico':
        salida[campo.nombre] = convertirRico(valor, donde, ctx)
        break
      case 'grupo':
        if (!esObjeto(valor)) ctx.errores.push(`«${donde}» tiene que ser un objeto.`)
        else salida[campo.nombre] = convertirCampos(campo.campos, valor, donde, ctx)
        break
      case 'lista':
        if (!Array.isArray(valor)) {
          ctx.errores.push(`«${donde}» tiene que ser una lista.`)
          break
        }
        salida[campo.nombre] = valor.map((fila, i) => {
          if (!esObjeto(fila)) {
            ctx.errores.push(`«${donde}[${i}]» tiene que ser un objeto.`)
            return {}
          }
          return convertirCampos(campo.campos, fila, `${donde}[${i}]`, ctx)
        })
        break
      case 'bloques':
        salida[campo.nombre] = convertirBloques(valor, donde, ctx)
        break
    }
  }
  return salida
}

function convertirBloques(valor: unknown, donde: string, ctx: Contexto): Objeto[] {
  if (!Array.isArray(valor)) {
    ctx.errores.push(`«${donde}» tiene que ser una lista de bloques.`)
    return []
  }
  const salida: Objeto[] = []
  valor.forEach((bloque, i) => {
    const aqui = `${donde}[${i}]`
    if (!esObjeto(bloque) || typeof bloque.bloque !== 'string') {
      ctx.errores.push(`«${aqui}» tiene que ser un objeto con la clave «bloque».`)
      return
    }
    const slug = bloque.bloque
    if (!esBloqueDeIngesta(slug)) {
      ctx.errores.push(`«${aqui}»: ${BLOQUES_FUERA_DE_LA_INGESTA[slug] ?? `el bloque «${slug}» no existe.`}`)
      return
    }
    const esquema = bloqueDe(slug)
    if (!esquema) {
      ctx.errores.push(`«${aqui}»: el panel no conoce el bloque «${slug}».`)
      return
    }
    salida.push({ blockType: slug, ...convertirCampos(esquema.campos, bloque, aqui, ctx) })
  })
  return salida
}

const texto = (valor: unknown): string | undefined =>
  typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined

/**
 * Convierte un archivo de ingesta ya leído (el JSON, sin más).
 *
 * `ids` es la foto de los catálogos que arma el importador con
 * `claveDeCatalogo(catálogo, nombre) → identificador`. `nombreDeArchivo` es el
 * del archivo sin `.json`, contra el que se comprueba la clave.
 *
 * No lanza: todo lo que falla queda en `errores`.
 */
export function convertirSobre(
  sobre: unknown,
  ids: ReadonlyMap<string, string | number>,
  nombreDeArchivo?: string,
): FichaConvertida {
  const resultado: FichaConvertida = {
    modulo: 'patologias',
    clave: '',
    documento: {},
    procedencia: { origen: 'ia' },
    notasParaElRevisor: [],
    faltanEnCatalogo: [],
    errores: [],
    avisos: [],
  }
  const fallo = (mensaje: string) => {
    resultado.errores.push(mensaje)
    return resultado
  }

  if (!esObjeto(sobre)) return fallo('El archivo no es un objeto JSON.')
  if (sobre.formato !== FORMATO_DE_INGESTA) {
    return fallo(`El formato es «${String(sobre.formato)}» y se esperaba «${FORMATO_DE_INGESTA}».`)
  }
  if (!esModuloDeIngesta(sobre.modulo)) return fallo(`El módulo «${String(sobre.modulo)}» no existe.`)
  resultado.modulo = sobre.modulo

  const clave = sobre.clave
  if (typeof clave !== 'string' || !PATRON_DE_CLAVE.test(clave) || clave.length > LARGO_MAXIMO_DE_CLAVE) {
    return fallo(`La clave «${String(clave)}» no es válida (minúsculas, números y guiones, hasta ${LARGO_MAXIMO_DE_CLAVE}).`)
  }
  resultado.clave = clave
  if (nombreDeArchivo !== undefined && nombreDeArchivo !== clave) {
    resultado.errores.push(`La clave «${clave}» no coincide con el nombre del archivo «${nombreDeArchivo}».`)
  }

  // Procedencia: se copia lo que sea texto y se comprueba lo obligatorio.
  const procedencia = esObjeto(sobre.procedencia) ? sobre.procedencia : {}
  if (!esObjeto(sobre.procedencia)) resultado.errores.push('Falta «procedencia».')
  for (const campo of CAMPOS_DE_PROCEDENCIA) {
    const valor = texto(procedencia[campo.nombre])
    if (valor === undefined) {
      if (campo.requerido) resultado.errores.push(`Falta «procedencia.${campo.nombre}».`)
      continue
    }
    if (valor.length > campo.maximo) {
      resultado.errores.push(`«procedencia.${campo.nombre}» pasa de ${campo.maximo} caracteres.`)
      continue
    }
    if (campo.opciones && !campo.opciones.includes(valor)) {
      resultado.errores.push(`«procedencia.${campo.nombre}» vale «${valor}» y las opciones son ${campo.opciones.join(', ')}.`)
      continue
    }
    ;(resultado.procedencia as Record<string, string>)[campo.nombre] = valor
  }

  const notas = sobre.notasParaElRevisor
  if (notas !== undefined) {
    if (!Array.isArray(notas) || notas.some((n) => typeof n !== 'string')) {
      resultado.errores.push('«notasParaElRevisor» tiene que ser una lista de frases.')
    } else {
      if (notas.length > MAXIMO_DE_NOTAS) resultado.avisos.push(`Trae ${notas.length} notas y el formato admite ${MAXIMO_DE_NOTAS}: se guardan todas.`)
      if (notas.some((n) => n.length > LARGO_MAXIMO_DE_NOTA)) {
        resultado.avisos.push(`Alguna nota pasa de ${LARGO_MAXIMO_DE_NOTA} caracteres: se guarda entera.`)
      }
      resultado.notasParaElRevisor = notas as string[]
    }
  }

  if (!esObjeto(sobre.ficha)) return fallo('Falta «ficha».')
  if (resultado.modulo === 'cirugias') {
    return fallo('Las cirugías no se importan: sus fichas dependen del modelo 3D (ver FUERA_DE_LA_INGESTA).')
  }

  const ctx: Contexto = {
    modulo: resultado.modulo,
    ids,
    errores: resultado.errores,
    avisos: resultado.avisos,
    faltan: new Map(),
  }
  const esquema = esquemaDe(resultado.modulo)
  const convertido = convertirCampos(camposDe(esquema), sobre.ficha, '', ctx)
  resultado.faltanEnCatalogo = [...ctx.faltan.values()]
  for (const f of resultado.faltanEnCatalogo) {
    resultado.errores.push(`«${f.valor}» no está en el catálogo «${f.catalogo}».`)
  }

  // Si algo de lo convertido se perdería al depurar, se dice aquí y no después.
  const perdida = avisoDeContenidoQueSeBorraria(esquema, convertido)
  if (perdida) resultado.errores.push(perdida)

  resultado.documento = depurarDocumento(esquema, convertido)

  // Lo que falta para publicar no impide importar: entra como borrador.
  for (const f of faltantes(esquema, resultado.documento, { profundo: true })) {
    resultado.avisos.push(`Para publicar: ${f}`)
  }
  return resultado
}
