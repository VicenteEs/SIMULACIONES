import { BotonSalir } from '@/components/BotonSalir'
import { CORREO_DE_PRIVACIDAD, VERSION_DEL_AVISO_DE_PRIVACIDAD, diaDeLaVersion } from '@/lib/avisoDePrivacidad'
import { BotonAceptarElAviso } from './BotonAceptarElAviso'
import { TextoDelAviso } from './TextoDelAviso'

/**
 * Lo que ve una cuenta que no ha aceptado la versión vigente del aviso, en
 * lugar de la página que pidió (D-292).
 *
 * La pone la plantilla de la plataforma (`(frontend)/layout.tsx`) y no cada
 * página, por la misma razón que la guardia del panel vive en un solo sitio:
 * una página que se olvide de mirarlo es una puerta abierta, y aquí entran
 * todas, el panel incluido. Sin barra de navegación y sin latido de actividad:
 * no hay adónde ir hasta aceptar, y el tiempo activo es uno de los datos que
 * el aviso pide consentir.
 *
 * El texto es el mismo componente que publica `/privacidad`, entero y no un
 * resumen con un enlace: lo que se acepta tiene que estar delante, y un enlace
 * a `/privacidad` desde aquí volvería a esta misma pantalla.
 *
 * Quien no quiera aceptarlo puede salir. La cuenta no se toca: sigue como
 * estaba, sin poder usarse, hasta que acepte o pida que se elimine.
 */
export function PantallaDelAviso({ nombre }: { nombre?: string }) {
  const primerNombre = (nombre ?? '').trim().split(/\s+/)[0]
  return (
    <main className="aviso-por-aceptar">
      <span className="eyebrow">
        Antes de seguir · versión del{' '}
        <time dateTime={VERSION_DEL_AVISO_DE_PRIVACIDAD}>{diaDeLaVersion()}</time>
      </span>
      <h1>Aviso de privacidad</h1>
      <p className="entrada">
        {primerNombre ? `${primerNombre}, para` : 'Para'} seguir usando TraumaHub necesitamos que leas y aceptes
        este aviso. Dice qué datos tuyos guarda la plataforma, para qué, dónde, cuánto tiempo y cómo pedir que
        los corrijamos o los borremos.
      </p>

      <TextoDelAviso />

      <div className="aviso-por-aceptar-barra">
        <p>
          Si no lo aceptas, puedes salir: tu cuenta queda como está y no se borra nada. Para que la eliminemos,
          {CORREO_DE_PRIVACIDAD ? ` escríbenos a ${CORREO_DE_PRIVACIDAD}.` : ' escríbenos al correo que da el aviso.'}
        </p>
        <div className="aviso-por-aceptar-botones">
          <BotonSalir clase="boton boton-secundario" />
          <BotonAceptarElAviso version={VERSION_DEL_AVISO_DE_PRIVACIDAD} />
        </div>
      </div>
    </main>
  )
}
