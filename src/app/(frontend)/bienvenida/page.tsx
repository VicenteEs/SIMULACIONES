import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { obtenerSesion } from '@/lib/sesion'
import { usuarioDeSesion } from '@/access/payload'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { recorridosDisponibles } from '@/lib/bienvenida'
import { Bienvenida } from './Bienvenida'
import './bienvenida.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Bienvenida · Plataforma docente de traumatología',
  robots: { index: false, follow: false },
}

/**
 * La bienvenida del primer ingreso, con el tablero de Penpot (P-007 E4, D-237).
 *
 * A ella manda `entrar()` al lector que todavía no la ha cerrado, pero la
 * página no exige eso: abierta a mano después, se ve igual y no cambia la
 * fecha (`cerrarLaBienvenida`). Lo único que pide es una cuenta activa, porque
 * los recorridos llevan a módulos que sin ella no se abren.
 */
export default async function PaginaDeBienvenida() {
  const { usuario, usuarioEfectivo, activo } = await obtenerSesion()
  if (!usuario) redirect('/entrar')
  if (!activo) redirect('/')

  // Con el usuario efectivo, como la barra: un administrador que mira la
  // plataforma como residente ve los recorridos que vería ese residente.
  const recorridos = recorridosDisponibles(usuarioDeSesion(usuarioEfectivo), await modulosEnMantencion())
  const nombre = String((usuario as { nombre?: unknown }).nombre ?? '').split(' ')[0]

  return (
    <main className="bv-pantalla">
      <Bienvenida nombre={nombre} recorridos={recorridos} />
    </main>
  )
}
