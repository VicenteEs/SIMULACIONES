import type { Metadata } from 'next'
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
import { Miga } from '@/components/Estados'
import { CORREO_DE_PRIVACIDAD, VERSION_DEL_AVISO_DE_PRIVACIDAD, diaDeLaVersion } from '@/lib/avisoDePrivacidad'

export const metadata: Metadata = {
  title: 'Aviso de privacidad · TraumaHub',
  // Fuera de los buscadores como el resto (D-020). Abrirla aquí no serviría de
  // nada: `public/robots.txt` cierra el dominio entero, y lo que pide la ley es
  // que el aviso esté a la vista de quien entrega sus datos, que lo tiene
  // enlazado en el registro y en el pie de cada página.
  robots: { index: false, follow: false },
}

/**
 * El aviso de privacidad (Q-005, D-258): qué datos de la persona guarda la
 * plataforma, para qué, dónde, cuánto tiempo y cómo ejercer sus derechos.
 *
 * Pública y sin sesión, como `/creditos`: quien más la necesita es quien
 * todavía no tiene cuenta y está a punto de pedirla. La casilla del último paso
 * de `/registro` enlaza aquí, y la cuenta guarda qué versión se aceptó
 * (`VERSION_DEL_AVISO_DE_PRIVACIDAD`).
 *
 * **Cada afirmación sale del código, no de lo que se quisiera.** Lo que guarda
 * la cuenta está en `Usuarios.ts`; el avance, en `Actividad.ts`; el tiempo
 * activo, en `TiempoActivo.ts`; el registro de acciones —y que conserva nombre
 * y correo después de borrar la cuenta— en `RegistroDeAcciones.ts` y en
 * `hooks/registrarAccion.ts`; qué se borra con la cuenta, en
 * `hooks/bajaDeUsuario.ts`; la dirección IP en memoria, en `src/lib/ritmo.ts`;
 * los treinta días de copias, en `scripts/respaldar.sh`. De la IP se dice solo
 * lo que hace la plataforma, y no «solo vive en memoria», como decía la primera
 * redacción: el proxy de cada servidor puede anotarla en su propio registro de
 * accesos, que no está en este repositorio y nadie ha mirado. El día que algo de eso
 * cambie —una columna nueva con datos de la persona, un plazo de borrado—, este
 * texto cambia en el mismo cambio y con él la versión. Un aviso que promete
 * menos de lo que hace el código es peor que no tener aviso: es el que se
 * firma.
 *
 * Viste con las clases de créditos (`creditos-seccion`, `creditos-texto`), que
 * es la otra página pública de texto largo. Una tercera hoja para lo mismo
 * sería otra forma de lo mismo.
 */
export default function PaginaPrivacidad() {
  const correo = (
    <a href={`mailto:${CORREO_DE_PRIVACIDAD}`}>
      <Mail size={14} aria-hidden="true" /> {CORREO_DE_PRIVACIDAD}
    </a>
  )

  return (
    <main>
      <Miga href="/privacidad" texto="Privacidad" />
      <span className="eyebrow">
        Versión del <time dateTime={VERSION_DEL_AVISO_DE_PRIVACIDAD}>{diaDeLaVersion()}</time>
      </span>
      <h1>Aviso de privacidad</h1>
      <p className="entrada">
        Qué datos tuyos guarda TraumaHub, para qué los usa, dónde están, cuánto tiempo se quedan y cómo
        pedir que los corrijamos o los borremos.
      </p>

      <Seccion icono={UserRound} titulo="Quién es responsable">
        <p>
          TraumaHub, plataforma docente de traumatología, es responsable de los datos personales que se
          guardan en ella. Para cualquier pregunta o solicitud sobre tus datos, escríbenos a {correo}.
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
          <li>La fecha de la solicitud, y la fecha y la versión de este aviso que aceptaste.</li>
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
            Un registro de acciones: cuándo entras y sales, qué fichas abres y qué comentas, cada vez con tu
            nombre, tu correo y tu rol de ese momento.
          </li>
        </ul>

        <h3>Si eres editor</h3>
        <ul>
          <li>
            Lo que creas, cambias, firmas o publicas, con tu nombre, en el registro de acciones y en el historial
            de cada ficha.
          </li>
          <li>El tiempo que pasas con cada ficha en revisión: cuánto estuvo abierta y cuánto la usaste.</li>
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
          Con tu consentimiento, que das al marcar la casilla de este aviso cuando pides la cuenta: sin él, la
          cuenta no se crea. Puedes retirarlo cuando quieras pidiéndonos que eliminemos tu cuenta, como se
          explica más abajo.
        </p>
        <p>Si pides una cotización, la base es tu propia petición: usamos esos datos solo para contestarla.</p>
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
          En servidores que contrata la plataforma. El principal es un servidor privado virtual de la empresa
          Contabo en St. Louis, Estados Unidos: <strong>tus datos se guardan fuera de Chile</strong>, lo que la
          ley llama una transferencia internacional de datos. Al aceptar este aviso, aceptas también esa
          transferencia.
        </p>
        <p>
          Las copias de seguridad se guardan en ese servidor y en otro de la plataforma. Los correos que te
          enviamos salen por un servidor de correo contratado, que ve tu dirección y el mensaje.
        </p>
      </Seccion>

      <Seccion icono={Hourglass} titulo="Cuánto tiempo">
        <p>
          Mientras tu cuenta exista. Desactivar una cuenta no la borra: conserva sus datos por si vuelve a
          activarse.
        </p>
        <p>
          Cuando una cuenta se elimina —porque nos lo pides o porque se rechaza la solicitud—, se borran con ella
          los datos de la cuenta y el avance en las fichas y en el simulador. Quedan, en cambio:
        </p>
        <ul>
          <li>tus comentarios, sin tu nombre, porque valen por lo que dicen de la ficha;</li>
          <li>tu tiempo activo, como cifra y sin nada que lo una a ti;</li>
          <li>
            el registro de acciones, con tu nombre, tu correo y tu rol de cada momento: qué fichas abriste, el
            comienzo de cada comentario y, si fuiste editor, qué cambiaste. Es la bitácora de quién hizo qué en
            la plataforma, y hoy no tiene plazo de borrado; si llega a tenerlo, lo dirá una versión nueva de este
            aviso.
          </li>
        </ul>
        <p>Una cotización se guarda hasta que la borremos o nos pidas borrarla.</p>
        <p>
          Las copias de seguridad guardan todo lo anterior durante 30 días: lo que se borra de la plataforma
          sigue en ellas hasta que caducan.
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
          de los plazos que fija la ley.
        </p>
        <p>
          Si no te respondemos, o no estás de acuerdo con la respuesta, puedes reclamar ante la Agencia de
          Protección de Datos Personales.
        </p>
      </Seccion>

      <Seccion icono={History} titulo="Cambios a este aviso">
        <p>
          Esta es la versión del {diaDeLaVersion()}. Si cambia lo que guardamos, para qué o dónde, publicaremos
          aquí una versión nueva con su fecha, y tu cuenta guarda cuál aceptaste.
        </p>
      </Seccion>

      {/* La casilla del registro abre este aviso en otra pestaña para no
          perder lo escrito; sin esta línea, quien llega por ahí no sabe que
          su formulario sigue intacto en la de al lado. */}
      <p className="nota-al-pie">
        Si llegaste desde la solicitud de cuenta, puedes cerrar esta pestaña: el formulario sigue en la otra.
      </p>
    </main>
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
