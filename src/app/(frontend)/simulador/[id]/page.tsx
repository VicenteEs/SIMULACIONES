import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Miga, Vacio } from '@/components/Estados'
import { Simulador } from '@/components/Simulador'
import type { PasoQuirurgico } from '@/lib/simulador'

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
      depth: 1,
    })
    .catch(() => null)
  if (!cirugia) notFound()

  const pasos = (Array.isArray(cirugia.pasos) ? cirugia.pasos : []) as PasoQuirurgico[]
  // El instrumental sale de los propios pasos: el autor no mantiene dos listas
  // que puedan desincronizarse.
  const instrumentos = [...new Set(pasos.map((p) => p.instrumento).filter(Boolean))] as string[]

  return (
    <main>
      <Miga href="/simulador" texto="Simulador" />
      <h1>{cirugia.nombre as string}</h1>
      {cirugia.resumen ? <p className="entrada">{cirugia.resumen as string}</p> : null}

      {pasos.length === 0 ? (
        <Vacio texto="Esta cirugía todavía no tiene pasos escritos." />
      ) : (
        <Simulador pasos={pasos} instrumentos={instrumentos} />
      )}
    </main>
  )
}
