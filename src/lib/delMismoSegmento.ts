import type { Payload } from 'payload'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { leerCodigoAO, segmentoAO } from '@/lib/clasificacionAO'
import { codigoDelCaso } from '@/lib/casoQuirurgico'

/**
 * La técnica AO y el caso del simulador del mismo segmento AO que un código:
 * una fractura de diáfisis tibial («42») lleva al clavo de tibia («42-A2»).
 *
 * Se unen por el código y no por una relación en la base, que no existe: la
 * ficha, la técnica y el caso los escriben personas distintas en módulos
 * distintos, y el código AO es lo único que los tres comparten ya.
 *
 * Lo usan la ficha de patología («Continúe con») y la técnica AO («Ver en el
 * simulador»). Estaba escrito dentro de la ficha (D-237); al necesitarlo la
 * técnica se movió aquí en vez de copiarse, porque las dos tienen que encontrar
 * lo mismo con el mismo código.
 *
 * Solo de los módulos que la cuenta ve, con el acceso puesto —un borrador no
 * sale para el residente— y sin que un fallo tumbe la página: lo que sigue es
 * una ayuda, y una consulta caída devuelve la lista vacía.
 */

export interface DelMismoSegmento {
  coleccion: 'casos-ao' | 'cirugias'
  id: string
  /** Ruta sin prefijo: la resuelve `<Link>`. */
  href: string
  titulo: string
}

/**
 * Primero los de código idéntico, después los del mismo segmento. Para una
 * técnica de «42-A2», el caso «42-A2» es «el» caso de esa técnica; uno de
 * «42-C1» es otro tipo de fractura del mismo hueso, útil pero segundo.
 */
function antesElMismoCodigo(codigo: unknown) {
  const propio = leerCodigoAO(codigo)
  const igual = (otro: unknown) => {
    const leido = leerCodigoAO(otro)
    return !!propio && !!leido && leido.hueso === propio.hueso && leido.segmento === propio.segmento &&
      leido.tipo === propio.tipo && leido.grupo === propio.grupo && !!propio.tipo
  }
  return <T>(a: { codigo: unknown; item: T }, b: { codigo: unknown; item: T }) =>
    Number(igual(b.codigo)) - Number(igual(a.codigo))
}

export async function delMismoSegmento(
  payload: Payload,
  usuarioEfectivo: unknown,
  enMantencion: string[],
  codigo: unknown,
  {
    tope = 2,
    modulos = ['casos-ao', 'cirugias'],
    excluir,
  }: {
    tope?: number
    modulos?: DelMismoSegmento['coleccion'][]
    /** El documento que pregunta, para que una técnica no se ofrezca a sí misma. */
    excluir?: { coleccion: DelMismoSegmento['coleccion']; id: string }
  } = {},
): Promise<{ tecnicas: DelMismoSegmento[]; casos: DelMismoSegmento[] }> {
  const segmento = segmentoAO(codigo)
  if (!segmento) return { tecnicas: [], casos: [] }
  const usuario = usuarioEfectivo as UsuarioSesion | null
  const user = usuarioEfectivo as never
  const pide = (coleccion: DelMismoSegmento['coleccion']) =>
    modulos.includes(coleccion) && puedeVerModulo(usuario, coleccion, enMantencion)
  const fuera = (coleccion: DelMismoSegmento['coleccion'], id: unknown) =>
    excluir?.coleccion === coleccion && excluir.id === String(id)
  const orden = antesElMismoCodigo(codigo)

  const [tecnicas, casos] = await Promise.all([
    pide('casos-ao')
      ? payload
          .find({
            collection: 'casos-ao',
            where: { codigo: { contains: segmento } },
            overrideAccess: false,
            user,
            depth: 0,
            limit: 20,
            select: { titulo: true, codigo: true },
          })
          .then((r) => r.docs)
          .catch(() => [])
      : Promise.resolve([]),
    // El código del caso puede no estar escrito: la consola lo compone con el
    // hueso y la clasificación de sus catálogos (`codigoDelCaso`), así que se
    // piden poblados y se compone igual que allí. Por eso no se filtra en la
    // consulta: el código que importa no está en ninguna columna.
    pide('cirugias')
      ? payload
          .find({
            collection: 'cirugias',
            overrideAccess: false,
            user,
            depth: 1,
            limit: 100,
            select: { nombre: true, codigo: true, hueso: true, clasificacion: true },
          })
          .then((r) => r.docs)
          .catch(() => [])
      : Promise.resolve([]),
  ])

  return {
    tecnicas: tecnicas
      .filter((t) => segmentoAO(t.codigo) === segmento && !fuera('casos-ao', t.id))
      .map((t) => ({ codigo: t.codigo, item: t }))
      .sort(orden)
      .slice(0, tope)
      .map(({ item: t }) => ({
        coleccion: 'casos-ao' as const,
        id: String(t.id),
        href: `/tecnica-ao/${t.id}`,
        titulo: String(t.titulo ?? ''),
      })),
    casos: casos
      .map((c) => ({ codigo: codigoDelCaso(c as never), item: c }))
      .filter(({ codigo: propio, item: c }) => segmentoAO(propio) === segmento && !fuera('cirugias', c.id))
      .sort(orden)
      .slice(0, tope)
      .map(({ item: c }) => ({
        coleccion: 'cirugias' as const,
        id: String(c.id),
        href: `/simulador/${c.id}`,
        titulo: String(c.nombre ?? ''),
      })),
  }
}
