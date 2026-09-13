import { notFound, redirect } from 'next/navigation'
import { exigirPanelPara } from '@/app/(frontend)/admin-panel/acceso'
import { camposDe, esColeccionEditable, esquemaDe, type Campo } from '@/admin/esquema'
import { FormularioDocumento } from '@/components/admin/FormularioDocumento'
import { contenidoNuevo } from '@/lib/textoRico'

export const dynamic = 'force-dynamic'

/**
 * Documento en blanco.
 *
 * Los valores iniciales salen del esquema y no de un objeto vacío: un campo de
 * selección debe abrir con una opción marcada y una pila de bloques con un
 * arreglo, no con `undefined`, o el primer cambio del formulario tendría que
 * adivinar la forma.
 *
 * Cuál opción la dice el campo, no el orden de la lista. El orden es de
 * presentación —en `piezas[].rol` está «piel» primera porque es la capa más
 * externa, no porque una pieza sin clasificar sea piel— y tomando `opciones[0]`
 * el formulario enseñaba una cosa mientras `depurarCampo` guardaba
 * `porOmision`, que es otra. Los tres sitios que deciden esto —aquí, el botón
 * de agregar fila de `formulario/Campos.tsx` y el respaldo de
 * `src/admin/depurar.ts`— tienen que decir lo mismo; separarlos no da ningún
 * error, solo deja otra vez una pantalla que enseña una cosa y guarda otra.
 */
function documentoEnBlanco(campos: Campo[]): Record<string, unknown> {
  const valores: Record<string, unknown> = {}
  for (const campo of campos) {
    switch (campo.tipo) {
      case 'seleccion':
        valores[campo.nombre] = campo.porOmision ?? campo.opciones[0]?.valor ?? ''
        break
      case 'casilla':
        valores[campo.nombre] = false
        break
      case 'lista':
      case 'bloques':
        valores[campo.nombre] = []
        break
      case 'grupo':
        valores[campo.nombre] = documentoEnBlanco(campo.campos)
        break
      case 'rico':
        valores[campo.nombre] = contenidoNuevo()
        break
      default:
        valores[campo.nombre] = ''
    }
  }
  return valores
}

export default async function PaginaNuevoDocumento({
  params,
}: {
  params: Promise<{ coleccion: string }>
}) {
  const { coleccion } = await params
  await exigirPanelPara(coleccion)
  if (!esColeccionEditable(coleccion)) notFound()

  const esquema = esquemaDe(coleccion)
  // Las colecciones de archivo nacen de una subida, no de un formulario vacío.
  if (esquema.subida) redirect(`/admin-panel/contenido/${coleccion}`)

  return (
    <FormularioDocumento
      esquema={esquema}
      documento={documentoEnBlanco(camposDe(esquema))}
      id={null}
      rutaPublica={null}
    />
  )
}
