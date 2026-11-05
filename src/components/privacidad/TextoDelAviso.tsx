import type { ReactNode } from 'react'
import {
  Ban,
  Database,
  Eye,
  Globe2,
  History,
  Hourglass,
  Mail,
  Scale,
  ShieldCheck,
  Target,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { CORREO_DE_PRIVACIDAD, RESPONSABLE_DE_LOS_DATOS, diaDeLaVersion } from '@/lib/avisoDePrivacidad'
import { MESES_DE_LAS_COTIZACIONES, MESES_DEL_REGISTRO_DE_ACCIONES, plazoEnPalabras } from '@/lib/conservacion'

/**
 * El cuerpo del aviso de privacidad (Q-005, D-258, D-294): sus diez apartados.
 *
 * Aparte de la página porque lo pintan dos sitios que tienen que decir
 * exactamente lo mismo: `/privacidad`, que es pública, y la pantalla que la
 * plantilla pone en lugar de cualquier página mientras la cuenta no haya
 * aceptado la versión vigente (`PantallaDelAviso`, D-292). Con dos copias, la
 * que se acepta y la que se publica acabarían siendo dos textos.
 *
 * **Cada afirmación sale del código, no de lo que se quisiera.** Lo que guarda
 * la cuenta está en `Usuarios.ts`; el avance, en `Actividad.ts`; el tiempo
 * activo, en `TiempoActivo.ts`; el registro de acciones, en
 * `RegistroDeAcciones.ts` y en `hooks/registrarAccion.ts`; qué se borra con la
 * cuenta y qué queda sin nombre, en `hooks/bajaDeUsuario.ts` y en
 * `src/lib/conservacionServidor.ts`; los dos plazos de doce meses, en
 * `src/lib/conservacion.ts`, que es de donde los toma este texto; la dirección
 * IP en memoria, en `src/lib/ritmo.ts`; los treinta días de copias y su
 * cifrado, en `scripts/respaldar.sh`; la copia en Chile, en el servidor ved, que
 * la trae cada mañana (D-295). De la IP se dice solo lo que hace la plataforma,
 * y no «solo vive en memoria», como decía la primera redacción: el proxy de cada
 * servidor puede anotarla en su propio registro de accesos, que no está en este
 * repositorio y nadie ha mirado. El día que algo de eso cambie —una columna
 * nueva con datos de la persona, un plazo—, este texto cambia en el mismo
 * cambio y con él la versión. Un aviso que promete menos de lo que hace el
 * código es peor que no tener aviso: es el que se firma.
 *
 * La transferencia a Estados Unidos se apoya en el contrato con Contabo y no en
 * la aceptación de este aviso (D-294). La primera versión decía «al aceptar
 * este aviso, aceptas también esa transferencia», que hace depender de una
 * casilla algo que tiene que sostenerse solo: si la persona retira su
 * consentimiento, sus datos no vuelven de St. Louis por eso.
 *
 * Los dos espacios en blanco —quién responde y a qué correo se escribe— salen
 * de `RESPONSABLE_DE_LOS_DATOS` y `CORREO_DE_PRIVACIDAD`. Vacíos, se pintan como
 * hueco a la vista (`EnBlanco`) y no con un valor de relleno, que se leería
 * como verdadero.
 */
export function TextoDelAviso() {
  const correo = CORREO_DE_PRIVACIDAD ? (
    <a href={`mailto:${CORREO_DE_PRIVACIDAD}`}>
      <Mail size={14} aria-hidden="true" /> {CORREO_DE_PRIVACIDAD}
    </a>
  ) : (
    <EnBlanco que="correo de privacidad" />
  )
  const plazoDelRegistro = plazoEnPalabras(MESES_DEL_REGISTRO_DE_ACCIONES)
  const plazoDeLasCotizaciones = plazoEnPalabras(MESES_DE_LAS_COTIZACIONES)

  return (
    <>
      <Seccion icono={UserRound} titulo="Quién es responsable">
        <p>
          Responde de los datos personales que se guardan en TraumaHub, plataforma docente de traumatología:{' '}
          {RESPONSABLE_DE_LOS_DATOS ? <strong>{RESPONSABLE_DE_LOS_DATOS}</strong> : <EnBlanco que="nombre del responsable" />}.
          Para cualquier pregunta o solicitud sobre tus datos, escríbenos a {correo}.
        </p>
      </Seccion>

      <Seccion icono={Database} titulo="Qué datos guardamos">
        <p>Solo lo que hace falta para darte una cuenta y para que la plataforma funcione como herramienta docente.</p>

        <h3>Cuando pides la cuenta</h3>
        <ul>
          <li>Tu nombre y apellido, y tu correo electrónico.</li>
          <li>Tu contraseña, guardada de forma que nadie puede leerla, tampoco los administradores.</li>
          <li>
            Tu institución y, si los indicas, tu programa o servicio y tu etapa de formación (de R1 a R4,
            kinesiología o docente).
          </li>
          <li>Lo que escribas para quien revisa la solicitud.</li>
          <li>La fecha de la solicitud.</li>
        </ul>

        <h3>Lo que anota un administrador</h3>
        <ul>
          <li>Tu rol (lector, editor o administrador), si la cuenta está activa y qué módulos puedes ver o editar.</li>
          <li>Si firmas fichas, tu profesión: médico o kinesiólogo.</li>
          <li>Notas internas sobre la cuenta, como quién la pidió o por qué se desactivó.</li>
        </ul>

        <h3>Mientras usas la plataforma</h3>
        <ul>
          <li>
            La fecha y la versión de este aviso que aceptaste, al pedir la cuenta o la primera vez que entraste si
            la cuenta la creó un administrador.
          </li>
          <li>
            La fecha de tu último acceso, tus sesiones abiertas y los intentos fallidos de entrada, que bloquean
            la cuenta un rato si alguien prueba contraseñas.
          </li>
          <li>Qué fichas abres, cuáles marcas como leídas y en qué parte de cada una te quedaste.</li>
          <li>
            Tu avance en el simulador: los casos que recorres, el puntaje, las complicaciones, lo que usaste y
            lo que escribas en la radiografía postoperatoria, como el nombre del cirujano y del equipo.
          </li>
          <li>
            Tu tiempo activo: cuántos minutos al día y a qué horas tienes la plataforma a la vista y la usas, y
            la última página en que estuviste.
          </li>
          <li>Los comentarios que dejes en las fichas.</li>
          <li>
            Un registro de acciones: cuándo entras y sales, qué fichas abres, qué comentas y cuándo aceptas este
            aviso, cada vez con tu nombre, tu correo y tu rol de ese momento.
          </li>
        </ul>

        <h3>Si eres editor</h3>
        <ul>
          <li>
            Lo que creas, cambias, firmas o publicas, con tu nombre, en el registro de acciones y en el historial
            de cada ficha.
          </li>
          <li>
            El tiempo que pasas con cada ficha en revisión: cuánto estuvo abierta y cuánto la usaste, y si al
            validarla se la señaló por ir demasiado rápido.
          </li>
          <li>Las propuestas que dejes en el buzón del módulo anunciado y las que votes.</li>
        </ul>

        <h3>Si pides una cotización</h3>
        <p>
          Desde la portada, y sin cuenta: tu nombre, tu correo, tu institución y tu cargo, cuántos residentes y
          qué módulos te interesan, y tu mensaje. Solo lo leen los administradores, para responderte.
        </p>

        <h3>Para que la plataforma funcione</h3>
        <p>
          Tu navegador guarda una cookie de sesión, que te mantiene dentro hasta ocho horas, y algunas
          preferencias de pantalla y copias de lo que estás editando, que se quedan en tu equipo. Tu dirección IP
          se usa para frenar abusos, como demasiados intentos de entrada: la plataforma la tiene en memoria para
          eso y no la guarda en su base de datos. No usamos cookies de publicidad ni herramientas de analítica de
          terceros.
        </p>
      </Seccion>

      <Seccion icono={Ban} titulo="Lo que no pedimos">
        <p>
          No te pedimos RUT, teléfono, dirección ni datos de salud, ni ninguna imagen con datos de pacientes.
          Los casos del simulador son docentes y no corresponden a ningún paciente: por favor, no escribas datos
          de pacientes reales en los comentarios ni en la radiografía postoperatoria.
        </p>
      </Seccion>

      <Seccion icono={Target} titulo="Para qué los usamos">
        <ul>
          <li>
            Para revisar tu solicitud y gestionar tu cuenta. Un administrador lee lo que escribiste antes de
            activarla, y a tu correo te avisamos de la solicitud y de la activación, y te mandamos los enlaces
            para elegir contraseña. A veces escribimos también a todas las cuentas activas con novedades de la
            plataforma.
          </li>
          <li>
            Para la docencia: que veas tu avance y retomes donde quedaste, y que los administradores sepan cómo
            avanza cada persona.
          </li>
          <li>Para la seguridad: saber quién entró y quién cambió qué y con qué permisos, y frenar los abusos.</li>
          <li>
            Para mejorar la plataforma y dar cuenta de su uso, con cifras agregadas que no identifican a nadie,
            como cuántas personas terminaron un caso.
          </li>
        </ul>
        <p>No los usamos para publicidad ni para nada que no esté en esta lista.</p>
      </Seccion>

      <Seccion icono={Scale} titulo="Con qué base">
        <p>
          Con tu consentimiento, que das al aceptar este aviso: al pedir la cuenta, marcando su casilla, o la
          primera vez que entras, si la cuenta la creó un administrador. Sin él no puedes usar la plataforma.
          Puedes retirarlo cuando quieras pidiéndonos que eliminemos tu cuenta, como se explica más abajo.
        </p>
        <p>Si pides una cotización, la base es tu propia petición: usamos esos datos solo para contestarla.</p>
        <p>
          El envío de tus datos a Estados Unidos no depende de que aceptes este aviso: se apoya en el contrato
          con el proveedor del servidor, como se explica en «Dónde se guardan».
        </p>
      </Seccion>

      <Seccion icono={Eye} titulo="Quién los ve">
        <ul>
          <li>Los administradores de la plataforma: todo lo anterior.</li>
          <li>Los editores de contenido: los comentarios que dejes, con tu nombre y tu correo, para poder atenderlos.</li>
          <li>Si eres editor y firmas una ficha, tu nombre aparece en ella, a la vista de todas las cuentas.</li>
        </ul>
        <p>
          Además, los datos están en los equipos de los proveedores que alojan la plataforma y que envían sus
          correos. Nadie más los recibe.
        </p>
      </Seccion>

      <Seccion icono={Globe2} titulo="Dónde se guardan">
        <p>
          En un servidor privado virtual de la empresa Contabo, en St. Louis, Estados Unidos:{' '}
          <strong>tus datos se guardan fuera de Chile</strong>, lo que la ley llama una transferencia
          internacional de datos. Esa transferencia se apoya en el contrato de la plataforma con Contabo, que la
          obliga a tratar los datos solo para prestarnos el servidor y a protegerlos, y no en que aceptes este
          aviso.
        </p>
        <p>
          Cada noche se hace una copia de seguridad, y se guarda cifrada: en ese mismo servidor y en una copia
          que queda en Chile, en otro servidor de la plataforma. La llave que abre las copias no está en ninguno
          de los dos servidores.
        </p>
        <p>
          Los correos que te enviamos salen por un servidor de correo contratado, que ve tu dirección y el
          mensaje.
        </p>
      </Seccion>

      <Seccion icono={Hourglass} titulo="Cuánto tiempo">
        <p>
          Mientras tu cuenta exista. Desactivar una cuenta no la borra: conserva sus datos por si vuelve a
          activarse.
        </p>
        <p>
          Cuando una cuenta se elimina —porque nos lo pides o porque se rechaza la solicitud—, se borran con ella
          los datos de la cuenta y el avance en las fichas y en el simulador. Queda, sin nada que lo una a ti:
        </p>
        <ul>
          <li>lo que comentaste, sin tu nombre, porque vale por lo que dice de la ficha;</li>
          <li>tu tiempo activo, como cifra;</li>
          <li>
            el registro de acciones, sin tu nombre ni tu correo: queda lo que se hizo —qué fichas se abrieron, qué
            se cambió— y el rol que tenías, pero ya no se sabe que fuiste tú;
          </li>
          <li>
            si eras editor, lo que hiciste en las fichas —ediciones, firmas, publicaciones, su historial, el
            tiempo de revisión— y tus propuestas del buzón, sin tu nombre. Tus votos se borran.
          </li>
        </ul>
        <p>
          El registro de acciones se borra a los {plazoDelRegistro}: cada entrada desaparece cuando cumple{' '}
          {plazoDelRegistro}, exista o no la cuenta.
        </p>
        <p>Una cotización se borra a los {plazoDeLasCotizaciones} de llegar, o antes si nos pides borrarla.</p>
        <p>
          Las copias de seguridad guardan todo lo anterior durante 30 días: lo que se borra de la plataforma sigue
          en ellas, cifrado, hasta que caducan.
        </p>
      </Seccion>

      <Seccion icono={ShieldCheck} titulo="Tus derechos">
        <p>La ley chilena de protección de datos personales, con los cambios de la Ley 21.719, te da derecho a:</p>
        <ul>
          <li>
            <strong>acceso</strong>: saber qué datos tuyos tenemos y recibir una copia;
          </li>
          <li>
            <strong>rectificación</strong>: corregir los que estén mal o incompletos;
          </li>
          <li>
            <strong>supresión</strong>: que los borremos, con lo que se conserva según el apartado anterior;
          </li>
          <li>
            <strong>oposición</strong>: que dejemos de usarlos para un fin determinado;
          </li>
          <li>
            <strong>portabilidad</strong>: recibirlos en un formato que puedas llevar a otro servicio;
          </li>
          <li>
            <strong>bloqueo</strong>: que dejemos de usarlos mientras se resuelve una solicitud tuya.
          </li>
        </ul>
        <p>
          Para ejercerlos, escríbenos a {correo} desde el correo de tu cuenta y cuéntanos qué pides. Si escribes
          desde otra dirección, te pediremos confirmar que la cuenta es tuya. Te responderemos por correo, dentro
          de los plazos que fija la ley. Si pides una copia, te mandamos un archivo con todo lo que la plataforma
          guarda de ti, en un formato estándar (JSON) que se abre con cualquier editor de texto y que puedes
          llevar a otro servicio.
        </p>
        <p>
          Si no te respondemos, o no estás de acuerdo con la respuesta, puedes reclamar ante la Agencia de
          Protección de Datos Personales.
        </p>
      </Seccion>

      <Seccion icono={History} titulo="Cambios a este aviso">
        <p>
          Esta es la versión del {diaDeLaVersion()}. Si cambia lo que guardamos, para qué, dónde, cuánto tiempo o
          quién responde, publicaremos aquí una versión nueva con su fecha y te la mostraremos al entrar: para
          seguir usando la plataforma tendrás que aceptarla. Tu cuenta guarda cuál aceptaste y cuándo.
        </p>
      </Seccion>
    </>
  )
}

/**
 * Un dato del aviso que el dueño todavía no completó (D-294): se ve como hueco,
 * con lo que falta dicho en palabras, para que nadie lo lea como un valor y
 * para que no pase inadvertido al revisar la página.
 */
function EnBlanco({ que }: { que: string }) {
  return (
    <span className="aviso-en-blanco" title="Por completar">
      [{que}]
    </span>
  )
}

/** Una tarjeta del aviso, con el mismo marcado que las de créditos. */
function Seccion({ icono: Icono, titulo, children }: { icono: LucideIcon; titulo: string; children: ReactNode }) {
  return (
    <section className="tarjeta creditos-seccion">
      <span className="icono-modulo" aria-hidden="true">
        <Icono size={20} />
      </span>
      <div>
        <h2>{titulo}</h2>
        <div className="creditos-texto">{children}</div>
      </div>
    </section>
  )
}
