import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Miga } from '@/components/Estados'
import { ConsolaQuirurgica } from '@/components/simulador/ConsolaQuirurgica'
import { FormularioComentario } from '@/components/FormularioComentario'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'
import { Rico } from '@/components/Rico'

export const dynamic = 'force-dynamic'

export default async function CirugiaSimulada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Simulador quirúrgico" />

  const payload = await getPayload({ config })
  const cirugia = await payload
    .findByID({
      collection: 'cirugias',
      id,
      overrideAccess: false,
      user: usuarioEfectivo as never,
      // Profundidad 2: el paso trae su instrumento y su fase ya poblados, y el
      // caso trae su modelo con la dirección del archivo. Con profundidad 1 el
      // instrumento llegaría como número y la bandeja saldría vacía.
      depth: 2,
    })
    .catch(() => null)
  if (!cirugia) notFound()

  const caso = casoParaLaConsola(cirugia as unknown as Record<string, unknown>)

  return (
    <main>
      <Miga href="/simulador" texto="Simulador" />
      <h1>{caso.nombre}</h1>
      <Rico valor={cirugia.resumen} className="entrada" />

      <ConsolaQuirurgica caso={caso} />

      <FormularioComentario
        coleccion="cirugias"
        documentoId={id}
        label="¿Sugerencia o corrección sobre este caso? Comentar"
      />
    </main>
  )
}
