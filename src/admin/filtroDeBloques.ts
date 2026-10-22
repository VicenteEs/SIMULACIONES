/**
 * El filtro por texto de los bloques de una pestaña, y el nombre con que se descarga un archivo.
 *
 * Una ficha que llega de un libro trae sus figuras como bloques «Imagen» al final de una pestaña, todos con el mismo
 * pie provisional (D-144), y plegados son una columna de barras idénticas: lo único que los distingue es el texto
 * alternativo y el nombre del archivo, que el resumen de la barra no enseña. Este filtro mira justo eso, y todo lo
 * demás que se escribe en un bloque, para que quien revisa encuentre «la figura 3» sin desplegarlas una a una.
 *
 * Sin React ni Payload: el editor lo importa en el navegador y la prueba lo corre a secas.
 */
import { paraComparar } from '@/lib/catalogosAmpliables'
import { textoPlano } from '@/lib/textoRico'
import type { Campo } from './esquema'
import type { EsquemaDeBloque } from './bloques'

/** Lo que se sabe de un archivo de `medios` para buscarlo: de la lista que el formulario ya tiene cargada. */
export interface MedioBuscable {
  id: string
  etiqueta: string
  url?: string
}

/**
 * El nombre del archivo que figura al final de su dirección, sin la cadena de consulta.
 *
 * Es lo que se le propone al navegador al descargar. Payload sirve los medios por `/api/medios/file/<nombre>`, y ese
 * nombre es el que se subió (con su sufijo si hubo uno repetido); descargar con él evita el `file` genérico con que
 * un navegador bautiza lo que no sabe cómo se llama.
 */
export function nombreDeArchivoDe(url: string | undefined | null): string {
  if (!url) return ''
  const sinConsulta = url.split(/[?#]/)[0]
  const ultimo = sinConsulta.slice(sinConsulta.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(ultimo)
  } catch {
    // Una dirección con un `%` suelto no se decodifica: se deja tal cual, que sigue siendo un nombre útil.
    return ultimo
  }
}

const idDe = (valor: unknown): string => {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'object') return String((valor as { id?: unknown }).id ?? '')
  return String(valor)
}

function textoDeCampos(
  campos: Campo[],
  valores: Record<string, unknown>,
  medios: readonly MedioBuscable[],
): string[] {
  const trozos: string[] = []
  for (const campo of campos) {
    const valor = valores[campo.nombre]
    switch (campo.tipo) {
      case 'texto':
      case 'area':
        if (typeof valor === 'string') trozos.push(valor)
        break
      case 'rico':
        trozos.push(textoPlano(valor))
        break
      case 'archivo': {
        // El texto alternativo y el nombre del archivo: lo único que distingue una figura de otra cuando
        // todas llevan el mismo pie. Salen del propio valor si viene poblado (lo que trae una ficha abierta y lo que
        // deja el buscador de archivos); si trae solo el número, de la lista que el formulario tenga cargada.
        if (valor && typeof valor === 'object') {
          const { alt, filename, url } = valor as { alt?: unknown; filename?: unknown; url?: unknown }
          if (typeof alt === 'string') trozos.push(alt)
          trozos.push(typeof filename === 'string' ? filename : nombreDeArchivoDe(typeof url === 'string' ? url : ''))
          break
        }
        const medio = medios.find((m) => m.id === idDe(valor))
        if (medio) trozos.push(medio.etiqueta, nombreDeArchivoDe(medio.url))
        break
      }
      case 'lista':
        if (Array.isArray(valor)) {
          for (const fila of valor) {
            if (fila && typeof fila === 'object') {
              trozos.push(...textoDeCampos(campo.campos, fila as Record<string, unknown>, medios))
            }
          }
        }
        break
      default:
        break
    }
  }
  return trozos
}

/** Todo lo que se puede buscar en un bloque, ya sin tildes ni mayúsculas. */
export function textoDelBloque(
  esquema: EsquemaDeBloque,
  bloque: Record<string, unknown>,
  medios: readonly MedioBuscable[],
): string {
  return paraComparar([esquema.nombre, esquema.resumen(bloque), ...textoDeCampos(esquema.campos, bloque, medios)].join(' '))
}

/**
 * ¿Coincide el texto de un bloque con lo escrito en el filtro?
 *
 * Por palabras, en cualquier orden y sin tildes, como el buscador de los desplegables
 * (`filtrarOpciones`): «figura 3 tobillo» encuentra «Tobillo, figura 3». Un filtro vacío deja pasar todo.
 */
export function coincideConElFiltro(textoDelBloqueYa: string, filtro: string): boolean {
  const palabras = paraComparar(filtro).split(' ').filter(Boolean)
  return palabras.every((p) => textoDelBloqueYa.includes(p))
}
