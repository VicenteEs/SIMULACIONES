'use client'

import { useId, useState } from 'react'
import type { UsuarioDelPanel } from './TablaUsuarios'

/**
 * Las cuentas que alguien pidió en `/registro` y nadie ha revisado todavía.
 *
 * Van en tarjetas encima de la tabla y no como filas de ella porque se deciden
 * de otra manera. Una fila de la tabla es una cuenta que ya existe para la
 * plataforma: se le cambia el rol, se desactiva, se le restablece la clave. Una
 * solicitud se lee —quién es, de dónde, qué escribió— y se contesta una vez, sí
 * o no. Metida en la tabla, lo que escribió la persona quedaba recortado a una
 * línea como una nota más, y el «Activar» de siempre la dejaba entrar con el rol
 * con el que nació, que es lector porque nadie la miró, no porque alguien lo
 * decidiera.
 *
 * El componente no llama a las acciones: recibe `onActivar` y `onRechazar` y
 * es la tabla la que las ejecuta, con su `ejecutar`, su región de avisos y su
 * `filaEnCurso`. Con dos sistemas de avisos en la misma pantalla, el resultado
 * de una tarjeta aparecía en un sitio y el de una fila en otro, y el fallo de
 * transporte solo lo sabía contar uno de los dos.
 */
export function SolicitudesPendientes({
  solicitudes,
  sinMostrar,
  filaEnCurso,
  hayCorreo,
  onActivar,
  onRechazar,
}: {
  solicitudes: UsuarioDelPanel[]
  /** Solicitudes que existen y no entraron en la lectura por el tope de `page.tsx`. */
  sinMostrar: number
  filaEnCurso: string | null
  hayCorreo: boolean
  onActivar: (solicitud: UsuarioDelPanel, rol: UsuarioDelPanel['rol']) => void
  onRechazar: (solicitud: UsuarioDelPanel) => void
}) {
  const idTitulo = useId()
  if (solicitudes.length === 0) return null

  return (
    <section className="solicitudes" aria-labelledby={idTitulo}>
      <h2 className="admin-section-title" id={idTitulo}>
        Solicitudes por revisar ({solicitudes.length + sinMostrar})
      </h2>
      <p className="admin-form-hint">
        Nadie de esta lista puede entrar todavía. Antes de activar, compruebe que cada persona es
        quien dice ser: la plataforma no verifica la identidad de quien pide la cuenta.
      </p>
      {/* El título cuenta todas, como la barra, y esto explica por qué hay
          menos tarjetas: sin la frase, el número de arriba y las tarjetas de
          abajo no casaban y parecía que se habían perdido solicitudes. */}
      {sinMostrar > 0 ? (
        <p className="admin-form-hint">
          Se muestran las {solicitudes.length} más antiguas. Hay {sinMostrar} más, que aparecerán
          aquí a medida que resuelva estas.
        </p>
      ) : null}
      <ul className="solicitudes-lista">
        {solicitudes.map((solicitud) => (
          <TarjetaDeSolicitud
            key={solicitud.id}
            solicitud={solicitud}
            ocupada={filaEnCurso === solicitud.id}
            hayCorreo={hayCorreo}
            onActivar={onActivar}
            onRechazar={onRechazar}
          />
        ))}
      </ul>
    </section>
  )
}

const fecha = (valor: string) =>
  new Date(valor).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })

function TarjetaDeSolicitud({
  solicitud,
  ocupada,
  hayCorreo,
  onActivar,
  onRechazar,
}: {
  solicitud: UsuarioDelPanel
  ocupada: boolean
  hayCorreo: boolean
  onActivar: (solicitud: UsuarioDelPanel, rol: UsuarioDelPanel['rol']) => void
  onRechazar: (solicitud: UsuarioDelPanel) => void
}) {
  // Lector por omisión, que es el rol con el que ya nació la cuenta. Elegir
  // otro tiene que ser un gesto, no algo que se hereda de la tarjeta de al lado.
  const [rol, setRol] = useState<UsuarioDelPanel['rol']>('lector')
  const idRol = useId()
  const quien = solicitud.nombre || solicitud.email
  // `solicitadaEn` lo escribe `/registro`. Una cuenta marcada pendiente sin esa
  // fecha —puesta a mano en la base— cae en la de alta, que para una cuenta
  // pedida es la misma fecha con otro nombre.
  const pedidaEl = solicitud.solicitadaEn ?? solicitud.creado

  return (
    // Mientras su acción viaja, la tarjeta se anuncia ocupada y sus controles
    // llevan `aria-disabled`, no `disabled`, por lo mismo que las filas de la
    // tabla: un botón que se desactiva teniendo el foco lo suelta en `<body>`, y
    // quien revisa diez solicitudes con el teclado volvía a tabular desde el
    // principio de la página tras cada una. El `if (ocupada) return` de cada
    // manejador es lo que de verdad impide la segunda pulsación.
    <li className="solicitud" aria-busy={ocupada} style={ocupada ? { opacity: 0.5 } : undefined}>
      <div className="solicitud-cabecera">
        <div>
          <div className="admin-table-user-name">{solicitud.nombre || '—'}</div>
          <div className="admin-table-user-email">{solicitud.email}</div>
          {solicitud.institucion ? (
            <div className="admin-table-user-email">{solicitud.institucion}</div>
          ) : null}
        </div>
        {pedidaEl ? <span className="solicitud-fecha">Pedida el {fecha(pedidaEl)}</span> : null}
      </div>

      {solicitud.motivoDeSolicitud.trim() ? (
        <blockquote className="solicitud-motivo" aria-label={`Lo que escribió ${quien}`}>
          {solicitud.motivoDeSolicitud.trim()}
        </blockquote>
      ) : (
        <p className="solicitud-sin-motivo">No escribió nada al pedirla.</p>
      )}

      <div className="solicitud-acciones">
        <label htmlFor={idRol}>
          Rol
          <select
            id={idRol}
            className="admin-select"
            value={rol}
            aria-disabled={ocupada}
            onChange={(e) => {
              if (ocupada) return
              setRol(e.target.value as UsuarioDelPanel['rol'])
            }}
          >
            <option value="lector">Lector</option>
            <option value="editor">Editor</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <button
          className="admin-btn admin-btn-sm admin-btn-success"
          aria-disabled={ocupada}
          aria-label={`Activar la cuenta de ${solicitud.email}`}
          onClick={() => {
            if (ocupada) return
            // Solo el administrador pide confirmación. Lector y editor se
            // corrigen desde la tabla sin que nadie haya perdido nada; un
            // administrador puede, desde el primer clic, crear, desactivar y
            // borrar cuentas, la de quien lo activó incluida.
            if (
              rol === 'admin' &&
              !confirm(
                `¿Activar a ${solicitud.email} como administrador?\n\nPodrá crear, desactivar y eliminar cuentas, además de editar todo el contenido.`,
              )
            ) {
              return
            }
            onActivar(solicitud, rol)
          }}
        >
          Activar
        </button>
        <button
          className="admin-btn admin-btn-sm admin-btn-danger"
          aria-disabled={ocupada}
          aria-label={`Rechazar la solicitud de ${solicitud.email}`}
          onClick={() => {
            if (ocupada) return
            if (
              confirm(
                `¿Rechazar la solicitud de ${solicitud.email}?\n\nSe borrará la solicitud con los datos que envió${
                  hayCorreo ? ' y se le avisará por correo' : ''
                }. No se puede deshacer: si más adelante debe entrar, tendrá que pedir la cuenta otra vez o crearla usted.`,
              )
            ) {
              onRechazar(solicitud)
            }
          }}
        >
          Rechazar
        </button>
      </div>
    </li>
  )
}
