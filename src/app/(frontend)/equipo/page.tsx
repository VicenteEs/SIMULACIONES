import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Miga } from '@/components/Estados'
import { Vacio } from '@/components/ui/Vacio'
import { UsersRound } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Equipo · TraumaHub',
  robots: { index: false, follow: false },
}

/** Las dos primeras letras de nombre y apellido, para la tarjeta que aún no tiene retrato. */
function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  const letras = palabras.length >= 2 ? [palabras[0], palabras[1]] : [palabras[0] ?? '']
  return letras.map((p) => p.charAt(0).toUpperCase()).join('')
}

/**
 * La pestaña «Equipo»: quién lleva la plataforma.
 *
 * La ve toda cuenta activa y solo el administrador la escribe (`Equipo`, en
 * `src/collections`). Se consulta con el usuario efectivo y el control de
 * acceso puesto, como los listados de los módulos, y no con `overrideAccess`:
 * es lo que mantiene a esta página dentro de la plataforma cerrada (D-020).
 *
 * El orden lo da el administrador (`orden`) y, a igual orden, el nombre. Se
 * ordena aquí y no en la consulta para que el desempate use el alfabeto del
 * español: la base ordenaría «Álvaro» después de «Zoe». Son unas pocas filas.
 */
export default async function Equipo() {
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Equipo" />

  const payload = await getPayload({ config })
  const { docs } = await payload
    .find({
      collection: 'equipo',
      limit: 200,
      depth: 1,
      overrideAccess: false,
      user: usuarioEfectivo as never,
    })
    .catch(() => ({ docs: [] }))

  const personas = [...docs].sort(
    (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, 'es'),
  )

  return (
    <main>
      <Miga href="/equipo" texto="Equipo" />
      <span className="eyebrow">Quiénes somos</span>
      <h1>Equipo</h1>
      <p className="entrada">Las personas que escriben, revisan y construyen TraumaHub.</p>

      {personas.length === 0 ? (
        <Vacio icono={UsersRound} titulo="Todavía no hay nadie en el equipo" compacto />
      ) : (
        <ul className="equipo-rejilla">
          {personas.map((persona) => {
            // Poblado a profundidad 1; si la foto se borró del catálogo de
            // medios la relación queda en nulo y se cae a las iniciales.
            const foto = typeof persona.foto === 'object' ? persona.foto : null
            return (
              <li key={persona.id} className="equipo-tarjeta">
                {foto?.url ? (
                  // `img` y no `next/image`: la dirección la arma Payload, con
                  // su prefijo ya puesto (ver `ruta()` en `src/lib/rutas.ts`).
                  <img
                    className="equipo-foto"
                    src={foto.url}
                    alt={`Foto de ${persona.nombre}`}
                    width={128}
                    height={128}
                    loading="lazy"
                  />
                ) : (
                  <span className="equipo-iniciales" aria-hidden="true">
                    {iniciales(persona.nombre)}
                  </span>
                )}
                <h2>{persona.nombre}</h2>
                <p className="equipo-cargo">{persona.cargo}</p>
                {persona.descripcion ? <p className="equipo-descripcion">{persona.descripcion}</p> : null}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
