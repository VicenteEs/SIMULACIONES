'use server'

/**
 * Acciones del panel de administración.
 *
 * Todas comparten tres cuidados, y ninguno es opcional:
 *
 *  1. Comprueban el rol real de quien llama (`exigirAdmin`), porque una acción
 *     de servidor se puede invocar sin pasar por la interfaz que la ofrece.
 *  2. Validan cada argumento, porque el tipo de TypeScript desaparece al
 *     compilar y lo que llega es lo que el navegador quiso enviar.
 *  3. Impiden que el administrador se deje fuera a sí mismo. Es el fallo más
 *     fácil de cometer y el más caro de reparar: exige entrar a la base a mano.
 */

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { Payload } from 'payload'
import { direccionPublica, enlaceDeClave } from '@/collections/Usuarios'
import { enviarCorreo, enviarSinEsperar, hayCorreo } from '@/correo/enviar'
import {
  mensajeDeBienvenida,
  mensajeDeClaveNueva,
  mensajeDeCuentaActivada,
  mensajeDeSolicitudRechazada,
} from '@/correo/mensajes'
import { exigirAdmin, exigirEditor, accion, type Respuesta } from '@/lib/guardias'
import {
  exigirContrasena,
  exigirCorreo,
  exigirIdentificador,
  exigirRol,
  exigirTexto,
  modulosValidos,
  textoOpcional,
} from '@/lib/validacion'

const RUTA_USUARIOS = '/admin-panel/usuarios'
const RUTA_COMENTARIOS = '/admin-panel/comentarios'

/**
 * Cuánto dura el enlace de una invitación.
 *
 * La hora del enlace de «Clave» no sirve aquí: quien pide una contraseña nueva
 * está delante de la pantalla, y quien recibe una invitación la lee cuando abre
 * el correo del hospital, que puede ser al día siguiente de guardia. Tres días
 * cubren un fin de semana. Más no: el enlace da entrada a una cuenta, y un
 * buzón compartido o reenviado lo guarda para quien lo encuentre.
 *
 * `forgotPassword` solo respeta este número porque `Usuarios` no declara
 * `auth.forgotPassword.expiration`: la de la colección manda sobre la de la
 * llamada (`auth/operations/forgotPassword.js`), y el día que se declare, la
 * invitación durará lo que diga ella y el correo seguirá prometiendo 72 horas.
 *
 * El mismo número está repetido en `TablaUsuarios.tsx`, que lo dice en el aviso
 * cuando el correo no sale, por la misma razón que `LARGO_MAXIMO_NOTA`; y
 * `tests/unit/solicitudesEnElPanel.test.ts` falla si se separan.
 */
const HORAS_DE_INVITACION = 72

/** Lo que se contesta cuando la solicitud ya no está por revisar. */
const SOLICITUD_YA_RESUELTA = 'Esa solicitud ya se resolvió. Recargue la lista.'

/**
 * Techo del texto de una nota interna.
 *
 * La columna es `text` y no acota nada, y una acción de servidor acepta lo que
 * el navegador quiera mandarle: sin este límite, una llamada a mano deja media
 * novela en una fila que la pantalla de cuentas lee entera —las quinientas— en
 * cada visita. Dos mil caracteres son varios párrafos, de sobra para lo que el
 * campo existe: quién pidió la cuenta y por qué se desactivó.
 *
 * El mismo número está repetido en `TablaUsuarios.tsx`, que frena antes de
 * enviar. No se importa de aquí porque este módulo es `'use server'` y solo
 * puede exportar funciones asíncronas; el comentario de allí dice lo mismo desde
 * el otro lado, y `tests/unit/notasDeCuenta.test.ts` falla si los dos números
 * dejan de coincidir.
 */
const LARGO_MAXIMO_NOTA = 2000

/** Cuántos administradores activos quedan además del indicado. */
async function otrosAdminsActivos(payload: Payload, exceptoId: string): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'usuarios',
    where: {
      and: [
        { rol: { equals: 'admin' } },
        { activo: { equals: true } },
        { id: { not_equals: exceptoId } },
      ],
    },
    overrideAccess: true,
  })
  return totalDocs
}

/** Una cuenta leída tal como está en la base, o `null` si ya no existe. */
async function leerCuenta(payload: Payload, id: string): Promise<Record<string, unknown> | null> {
  const cuenta = await payload.findByID({
    collection: 'usuarios',
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  return (cuenta ?? null) as unknown as Record<string, unknown> | null
}

const esAdministradorActivo = (cuenta: Record<string, unknown> | null): boolean =>
  cuenta?.rol === 'admin' && cuenta.activo === true

/**
 * El final de todo mensaje dirigido a quien acaba de perder el acceso.
 *
 * Es el único consejo cierto que se le puede dar, y por eso no dice «recargue»:
 * recargar la pantalla de cuentas pasa por `exigirPanel('admin')`, que lo manda
 * al inicio y se lleva el aviso consigo sin que llegue a leerlo.
 */
const CIERRE_SIN_ACCESO = ' Ya no puede gestionar cuentas desde aquí.'

/**
 * Antes de escribir: que la plataforma conserve un administrador activo.
 *
 * Desde el panel esto no frena nunca el caso que parece evidente, y hay que
 * saberlo para escribir su mensaje. Quien llama no puede ser la cuenta tocada
 * —cada acción lo corta antes—, `exigirAdmin` acaba de leerlo administrador
 * activo, y el conteo solo excluye la cuenta tocada, así que a él lo cuenta. Si
 * aun así da cero, entre `exigirAdmin` y el conteo otra sesión le retiró el
 * acceso a quien llama: es la misma carrera que para el disparador de la base
 * (`explicarElRechazo`), vista unos milisegundos antes.
 *
 * El mensaje decía «es el único administrador activo», y para quien lo recibía
 * era falso por omisión: leía que la cuenta tocada era la única cuando él mismo
 * acababa de entrar como administrador, y no se enteraba de que la retirada era
 * la suya. Se lee su cuenta en vez de deducirlo, y solo en la rama del rechazo.
 *
 * Donde «cree otro administrador» sí es verdad es fuera del panel —un guion que
 * llama a `payload.update` sin usuario—, y ahí frena el gancho de la colección
 * (`collections/hooks/autobloqueo.ts`), no esto.
 */
async function exigirQueQuedeUnAdmin(
  payload: Payload,
  id: string,
  usuarioId: string,
  queSeIntenta: string,
) {
  if ((await otrosAdminsActivos(payload, id)) > 0) return

  if (!esAdministradorActivo(await leerCuenta(payload, usuarioId))) {
    throw new Error(
      `No se puede ${queSeIntenta}: mientras tanto otra sesión le retiró a usted el acceso de ` +
        'administrador, así que no se cambió nada.' +
        CIERRE_SIN_ACCESO,
    )
  }
  // Quien llama vuelve a leerse administrador activo, y eso contradice el
  // conteo: o alguien lo reactivó entre las dos consultas, o algo más no casa
  // entre ellas. No se sabe cuál, así que se dice solo lo que dio el conteo, sin
  // atribuírselo a nadie, y se manda a mirar la lista.
  throw new Error(
    `No se puede ${queSeIntenta}: al comprobarlo, aparte de esta cuenta no quedaba ningún ` +
      'administrador activo, así que no se cambió nada. Recargue la lista para ver cómo están ' +
      'las cuentas ahora antes de volver a intentarlo.',
  )
}

/** Cuántos administradores activos hay en total, sin excluir a nadie. */
async function adminsActivos(payload: Payload): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'usuarios',
    where: { and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }] },
    overrideAccess: true,
  })
  return totalDocs
}

/**
 * Segunda mirada, ya escrito el cambio: si la plataforma se quedó sin ningún
 * administrador activo, se le devuelve el rol y la cuenta activa a quien llama.
 *
 * `exigirQueQuedeUnAdmin` cuenta antes de escribir, y las dos cosas son
 * operaciones distintas. Con el aislamiento por omisión de PostgreSQL —READ
 * COMMITTED, que es con el que corre el adaptador— ninguna transacción ve la
 * escritura sin confirmar de la otra: si dos administradores se desactivan a la
 * vez, el conteo de cada uno ve al otro todavía activo, los dos pasan la
 * comprobación y la instalación se queda sin ninguno. A partir de ahí nadie
 * entra al panel, la pantalla de instalación tampoco sirve —`crearPrimeraCuenta`
 * exige que no haya ninguna cuenta— y la única salida es editar la tabla
 * `usuarios` desde psql en un servidor compartido.
 *
 * Envolver el par en una transacción **no** lo arregla: el conteo seguiría sin
 * ver lo ajeno sin confirmar, y los dos pasarían igual. Lo que cierra el hueco
 * de verdad es la restricción en la base, y ya está: la migración
 * `20260913_043401_ultimo_administrador_activo` pone un disparador que deshace
 * la segunda de las dos escrituras al confirmar. Con él puesto, esto no llega a
 * reparar nada en el servidor —el estado sin administradores no se confirma
 * nunca—, y quien se entera del rechazo es `escribirSinDejarSinAdministradores`.
 * Se conserva por desarrollo, donde manda el `push` de Drizzle y el disparador
 * no existe: ahí sigue siendo lo único que reduce la ventana a los milisegundos
 * que separan las dos consultas y deja el invariante en pie sin psql.
 *
 * Se repara la cuenta de **quien llama**, y no la que se acaba de tocar, a
 * propósito: `exigirAdmin` acaba de comprobar contra la base que esa cuenta era
 * administradora y estaba activa, así que devolverle esos dos campos restaura un
 * estado que era cierto hace un instante y no concede nada a nadie. Restaurar en
 * cambio la cuenta editada sería un ascenso: en `actualizarUsuario` el objetivo
 * puede ser un lector al que solo se le estaba cambiando el rol a editor. Y un
 * borrado, además, no se deshace.
 *
 * La escritura va con `overrideAccess` y sin `user` porque la cuenta de quien
 * llama está desactivada justo en este momento, y el control de acceso de la
 * colección le negaría precisamente la escritura que arregla el estropicio.
 */
async function devolverElAdminSiNoQuedaNinguno(
  payload: Payload,
  usuarioId: string,
  aviso: string,
): Promise<void> {
  if ((await adminsActivos(payload)) > 0) return
  await payload.update({
    collection: 'usuarios',
    id: usuarioId,
    data: { rol: 'admin', activo: true },
    overrideAccess: true,
  })
  throw new Error(aviso)
}

/**
 * El SQLSTATE con el que la base rechaza dejar la plataforma sin ningún
 * administrador activo.
 *
 * Es `check_violation`, y lo pone a propósito el disparador de la migración
 * `20260913_043401_ultimo_administrador_activo` para que aquí se reconozca por
 * el código y no por el texto, que es lo que se rompe en silencio el día que
 * alguien reescribe la frase del `RAISE`. El código es genérico, pero sobre las
 * tres escrituras que lo miran —desactivar, quitar el rol y borrar una cuenta—
 * no hay otra restricción que lo lance: los `select` de Payload son tipos
 * enumerados de PostgreSQL, no `CHECK`.
 */
const SIN_ADMINISTRADORES_ACTIVOS = '23514'

/**
 * ¿Es este fallo el rechazo del disparador del último administrador?
 *
 * Se recorre la cadena de `cause` y no se mira solo el primer nivel porque el
 * código nunca viene arriba: Drizzle envuelve el error de `pg` en un
 * `DrizzleQueryError` cuyo `message` es «Failed query: update "usuarios"…» con
 * los parámetros detrás, y el `code` se queda en `cause`. Es ese mensaje el que
 * llegaba en crudo al panel. El tope de profundidad es por si alguna capa
 * encadena un error consigo mismo; con cinco sobra para las dos que hay hoy.
 */
function esRechazoPorQuedarSinAdministradores(error: unknown): boolean {
  let eslabon: unknown = error
  for (let nivel = 0; nivel < 5 && typeof eslabon === 'object' && eslabon !== null; nivel++) {
    if ((eslabon as { code?: unknown }).code === SIN_ADMINISTRADORES_ACTIVOS) return true
    eslabon = (eslabon as { cause?: unknown }).cause
  }
  return false
}

/**
 * Lo que se le dice al administrador cuando el cambio habría dejado la
 * plataforma sin ninguno.
 *
 * Llegar aquí es siempre la carrera, y la carrera tiene una forma sola. Nadie
 * puede retirarse a sí mismo (lo cortan `actualizarUsuario`,
 * `cambiarActivoUsuario` y `eliminarUsuario` antes de escribir), y tanto el
 * disparador como el gancho de la colección cuentan a quien llama. Si al
 * confirmar no quedaba ninguno, la cuenta de quien llama ya no lo era: la
 * sesión que ganó la carrera retiró precisamente a esta persona, no «a otro
 * administrador».
 *
 * La redacción no nombra a la base a propósito: a esta función se llega por
 * dos puertas —el disparador, que deshace al confirmar, y el gancho, que corta
 * antes de escribir (`escribirSinDejarSinAdministradores`)— y «la base deshizo
 * el cambio» solo es verdad de una. «No se aplicó» lo es de las dos.
 *
 * El texto anterior no lo veía así, y fallaba dos veces. Mandaba a «crear otro
 * administrador» a alguien que ya no puede crear cuentas, y atribuía la carrera
 * a «otro administrador» cuando la cuenta retirada era la de quien lo leía. Por eso
 * se lee la cuenta de quien llama en vez de deducirlo: si el día de mañana se
 * permite actuar sobre uno mismo, la deducción dejaría de valer sin avisar y la
 * lectura no. Cuesta una consulta, y solo en la rama del rechazo.
 *
 * Cuando quien llama sí vuelve a ser administrador —una tercera sesión lo
 * reactivó entre el `COMMIT` y la relectura—, tampoco se le manda a crear a
 * nadie: en ese momento hay al menos dos administradores, él y la cuenta que
 * no se tocó, y repetir la operación funciona. Lo único cierto es que la lista
 * que tiene delante está vieja.
 *
 * Y el mensaje tiene que servir **sin recargar**. Quien lo recibe ya no pasa
 * `exigirPanel('admin')`: cualquier recarga de la pantalla de cuentas lo
 * redirige al inicio y se lleva el aviso consigo. `TablaUsuarios` no recarga en
 * la rama del rechazo justamente por esto.
 */
async function explicarElRechazo(
  payload: Payload,
  objetivo: Record<string, unknown> | null,
  usuarioId: string,
  queSeIntenta: string,
): Promise<string> {
  if (!esAdministradorActivo(await leerCuenta(payload, usuarioId))) {
    // El correo solo se nombra si la relectura lo enseña todavía administrador:
    // entre el `COMMIT` y esta lectura una tercera sesión pudo tocarlo, y
    // afirmar que «sigue siendo administrador» sin haberlo visto sería volver a
    // decir algo que no se sabe.
    const cierre =
      esAdministradorActivo(objetivo) && typeof objetivo?.email === 'string'
        ? ` ${objetivo.email} sigue siendo administrador; ya no puede gestionar cuentas desde aquí.`
        : CIERRE_SIN_ACCESO
    return (
      `No se pudo ${queSeIntenta}: mientras tanto otra sesión le retiró a usted el acceso de ` +
      'administrador, y el cambio no se aplicó para no dejar la plataforma sin ninguno.' +
      cierre
    )
  }
  return (
    `No se pudo ${queSeIntenta}: en ese momento la plataforma se habría quedado sin ningún ` +
    'administrador activo, así que no se cambió nada. Otra sesión estaba cambiando cuentas de ' +
    'administrador a la vez: recargue la lista para ver cómo quedaron antes de volver a ' +
    'intentarlo.'
  )
}

/**
 * La explicación de la carrera, si la cuenta tocada es la última administradora
 * activa que queda; `null` si no lo es.
 *
 * Es la condición que miran a la vez el gancho de la colección y el disparador
 * —«aparte de esta, ninguna»—, leída ya sobre lo confirmado. Cuando se cumple,
 * cualquiera de los dos habría rechazado el cambio y la explicación es cierta
 * venga de donde venga el rechazo; cuando no, no hay por qué suponérsela.
 */
async function explicarSiEraLaUltima(
  payload: Payload,
  cuenta: Record<string, unknown> | null,
  objetivo: string,
  usuarioId: string,
  queSeIntenta: string,
): Promise<string | null> {
  if (!esAdministradorActivo(cuenta)) return null
  if ((await otrosAdminsActivos(payload, objetivo)) > 0) return null
  return explicarElRechazo(payload, cuenta, usuarioId, queSeIntenta)
}

/**
 * Hace una escritura que puede dejar la plataforma sin administradores y
 * comprueba que de verdad quedó hecha.
 *
 * Son dos comprobaciones porque el rechazo del disparador puede llegar por dos
 * sitios, y hoy llega por el que no avisa.
 *
 * El disparador es diferido: no salta al escribir la fila sino al confirmar la
 * transacción, y la transacción la confirma Payload. Su adaptador
 * (`@payloadcms/drizzle`, `transactions/beginTransaction.js`) cuelga un
 * `.catch` de la transacción de Drizzle que se traga el error del `COMMIT`, así
 * que `payload.update` y `payload.delete` **resuelven como si todo hubiera ido
 * bien** mientras PostgreSQL deshace el cambio. Se comprobó contra un
 * PostgreSQL 17 de verdad, y lo fija
 * `tests/unit/ultimoAdministradorEnElPanel.test.ts`. Sin volver a leer la
 * cuenta, el panel pintaría «Se retiró el acceso» en verde, recargaría la lista
 * y la cuenta seguiría activa, sin una línea en el registro.
 *
 * La otra vía es la que daba por hecha la cabecera de la migración: si la
 * escritura corre sin transacción —`transactionOptions: false`, o el día que
 * Payload deje de tragarse ese error—, el rechazo sale de la propia llamada
 * como `DrizzleQueryError` y su texto es SQL en crudo. Se captura aquí, se
 * reconoce por el código y se cambia por el mensaje en español; el original
 * viaja en `cause` para que `accion()` lo deje entero en el registro.
 *
 * `seHizo` recibe la cuenta releída y decide si el cambio está. Un campo que no
 * vuelve en la lectura se da por bueno: solo cuenta como no hecho lo que la base
 * enseña positivamente sin cambiar. Si no se hizo y la cuenta sigue siendo la
 * última administradora activa, es el disparador; si no, se dice lo único
 * cierto —que la base no confirmó— sin inventarle una causa.
 *
 * La misma carrera tiene una tercera puerta, que no es la base. El gancho `impedirAutobloqueo` (o
 * `impedirBorradoDelUltimoAdmin`) vuelve a contar dentro de la escritura, y si
 * la otra sesión confirma entre `exigirQueQuedeUnAdmin` y ese conteo, corta él,
 * con un «Cree otro administrador» que es verdad para un guion sin usuario y
 * falso para quien llama desde aquí: ya no puede crear a nadie. Su error es un
 * `Error` sin código, así que no se reconoce por el error sino por el estado
 * —`explicarSiEraLaUltima`—, y si esa lectura falla también, sale el fallo
 * original tal cual: una base que no contesta no se disfraza de carrera.
 *
 * Recibe `usuarioId` porque el rechazo no se explica mirando solo la cuenta
 * tocada: en esa carrera, quien pierde el acceso es quien llama, y lo que se le
 * diga depende de eso (`explicarElRechazo`).
 */
async function escribirSinDejarSinAdministradores(
  payload: Payload,
  objetivo: string,
  usuarioId: string,
  queSeIntenta: string,
  escribir: () => Promise<unknown>,
  seHizo: (cuenta: Record<string, unknown> | null) => boolean,
): Promise<void> {
  try {
    await escribir()
  } catch (error) {
    const mensaje = esRechazoPorQuedarSinAdministradores(error)
      ? await explicarElRechazo(payload, await leerCuenta(payload, objetivo), usuarioId, queSeIntenta)
      : await leerCuenta(payload, objetivo)
          .then((cuenta) => explicarSiEraLaUltima(payload, cuenta, objetivo, usuarioId, queSeIntenta))
          .catch(() => null)
    if (mensaje === null) throw error
    throw new Error(mensaje, { cause: error })
  }

  const cuenta = await leerCuenta(payload, objetivo)
  if (seHizo(cuenta)) return

  const carrera = await explicarSiEraLaUltima(payload, cuenta, objetivo, usuarioId, queSeIntenta)
  if (carrera !== null) throw new Error(carrera)
  throw new Error(
    `No se pudo ${queSeIntenta}: la base no confirmó el cambio y la cuenta sigue como estaba. ` +
      'Recargue la lista y vuelva a intentarlo.',
  )
}

// ---------------------------------------------------------------- usuarios

/**
 * La nota interna, lista para guardar.
 *
 * Se recorta antes de validar porque un cuadro de texto que se «vacía» casi
 * nunca queda vacío: deja un salto de línea o un espacio, y `textoOpcional`
 * solo convierte en `undefined` la cadena vacía exacta. Sin este recorte,
 * borrar una nota contestaba «no puede quedar vacío» y la nota seguía donde
 * estaba, que es justo lo contrario de lo que se pedía.
 */
function notaParaGuardar(valor: unknown): string | undefined {
  const recortado = typeof valor === 'string' ? valor.trim() : valor
  return textoOpcional(recortado, 'El texto de la nota', LARGO_MAXIMO_NOTA)
}

/**
 * Una contraseña que no conoce nadie.
 *
 * Payload no crea una cuenta con autenticación sin contraseña, y la invitación
 * no quiere ninguna: la elige la persona con el enlace. Se genera aquí, en el
 * servidor, y no se usa la que manda el formulario, porque esa pasó por el
 * navegador del administrador —el campo de la pantalla la sugiere siempre— y
 * una clave que alguien más ha visto no es de quien la recibe. No se devuelve
 * ni se anota en ningún sitio: 32 bytes aleatorios no se adivinan, y la única
 * puerta a la cuenta es el enlace.
 */
const contrasenaQueNadieConoce = (): string => randomBytes(32).toString('base64url')

/**
 * Crea una cuenta desde el panel, de una de dos maneras.
 *
 * Sin `invitar`, como siempre: el administrador pone la contraseña y se la
 * entrega. Es el camino que sirve sin servidor de correo, y no se quita.
 *
 * Con `invitar === true` —el literal, no cualquier valor verdadero: esto llega
 * del navegador—, la persona recibe un correo de bienvenida con un enlace para
 * elegir su contraseña. Las dos cosas que ese correo necesita se comprueban
 * **antes** de crear. Después ya no hay vuelta limpia: la cuenta existe, y
 * repetir el formulario con otra opción choca con «ese correo ya está
 * registrado».
 *
 * Que el envío falle no deshace la creación, y es a propósito. El correo de
 * cPanel tiene cuota por hora, y un tope alcanzado o un servidor que no contesta
 * no dicen nada de la cuenta, que está bien hecha. Borrarla para «dejarlo como
 * estaba» pasaría por el gancho de baja y sus comprobaciones por un fallo que no
 * es suyo. Se devuelve el enlace y la pantalla lo enseña para entregarlo a mano,
 * que es exactamente lo que ya hace «Clave» cuando no hay correo.
 */
export async function crearUsuario(
  email: unknown,
  nombre: unknown,
  contrasena: unknown,
  rol: unknown,
  institucion?: unknown,
  activo: unknown = true,
  notas?: unknown,
  invitar?: unknown,
): Promise<Respuesta<{ id: string; invitacion?: { enviada: boolean; enlace: string } }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    const conInvitacion = invitar === true

    if (conInvitacion) {
      if (!hayCorreo()) {
        throw new Error(
          'No hay servidor de correo configurado (SMTP_HOST), así que la invitación no puede ' +
            'salir. Elija ponerle usted una contraseña y entregársela.',
        )
      }
      // La misma pregunta que `generarEnlaceDeClave`, y por lo mismo: sin
      // dirección pública el botón del correo sería `/clave/<testigo>`, una
      // ruta sin origen que la plantilla descarta por no ser http(s). Saldría
      // un correo de bienvenida sin manera de entrar.
      if (!direccionPublica()) {
        throw new Error(
          'Falta configurar la dirección pública de la plataforma (NEXT_PUBLIC_SERVER_URL): ' +
            'sin ella el correo de invitación no llevaría un enlace que funcione.',
        )
      }
    }

    const correo = exigirCorreo(email)
    const nombreLimpio = exigirTexto(nombre, 'El nombre', 120)
    const creado = await payload.create({
      collection: 'usuarios',
      data: {
        email: correo,
        nombre: nombreLimpio,
        password: conInvitacion ? contrasenaQueNadieConoce() : exigirContrasena(contrasena),
        rol: exigirRol(rol),
        institucion: textoOpcional(institucion, 'La institución', 160),
        activo: activo !== false,
        // La nota se acepta ya al crear porque el caso que el campo existe para
        // resolver —«quién pidió esta cuenta»— se sabe exactamente aquí y en
        // ningún momento mejor. Obligar a crear primero y anotar después es
        // pedir un segundo paso que nadie da.
        notas: notaParaGuardar(notas),
      },
      user: usuario as never,
    })
    revalidatePath(RUTA_USUARIOS)
    const id = String(creado.id)
    if (!conInvitacion) return { id }

    // `disableEmail` siempre: el correo de Payload es el de «contraseña nueva»
    // y dura una hora, y a quien acaban de dar de alta hay que darle la
    // bienvenida, no decirle que alguien pidió cambiar una clave que no tiene.
    let testigo: string | null
    try {
      testigo = await payload.forgotPassword({
        collection: 'usuarios',
        data: { email: correo },
        disableEmail: true,
        expiration: HORAS_DE_INVITACION * 60 * 60 * 1000,
      })
    } catch (error) {
      testigo = null
      console.error('[panel] no se pudo emitir el testigo de la invitación:', error)
    }
    if (!testigo) {
      // Sin esto, el fallo salía como «no se pudo crear» y quien lo leía volvía
      // a pulsar «Crear cuenta», que contesta que el correo ya existe.
      throw new Error(
        `La cuenta de ${correo} se creó, pero no se pudo emitir el enlace para elegir contraseña. ` +
          'No la cree otra vez: recargue la lista y use «Clave» en su fila para generar uno.',
      )
    }

    const enlace = enlaceDeClave(testigo)
    try {
      await enviarCorreo(payload, {
        para: correo,
        correo: mensajeDeBienvenida({ nombre: nombreLimpio, enlace, horas: HORAS_DE_INVITACION }),
      })
      return { id, invitacion: { enviada: true, enlace } }
    } catch (error) {
      console.error('[panel] no se pudo enviar la invitación:', error)
      return { id, invitacion: { enviada: false, enlace } }
    }
  })
}

/**
 * Campos que el panel puede modificar. Cualquier otro se ignora.
 *
 * La lista es cerrada a propósito y se arma campo por campo en `cambios`: lo
 * que llega aquí es lo que el navegador quiso mandar, y volcarlo entero dejaría
 * escribir `ultimoAcceso` —del que depende saber si una cuenta sigue en uso— o
 * `activo`, que tiene su propia acción justamente porque hay que contar
 * administradores antes de tocarlo.
 *
 * `notas` está en la lista desde que el campo se conectó a la pantalla de
 * cuentas. Son notas **del administrador sobre la cuenta** —quién la pidió, por
 * qué se desactivó—, no del titular: las escribe y las lee el mismo rol que esta
 * acción ya exige, así que no necesitan permiso aparte. Quien las pinta y las
 * manda es `admin-panel/usuarios/TablaUsuarios.tsx`; aceptarlas aquí sin que
 * nadie las escriba desde la pantalla sería dejar el campo tan muerto como
 * estaba.
 */
export async function actualizarUsuario(
  id: unknown,
  datos: {
    nombre?: unknown
    rol?: unknown
    institucion?: unknown
    email?: unknown
    modulosVisibles?: unknown
    modulosEditables?: unknown
    notas?: unknown
  },
): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario, usuarioId } = await exigirAdmin()
    const objetivo = exigirIdentificador(id, 'El usuario')

    const cambios: Record<string, unknown> = {}
    if (datos.nombre !== undefined) cambios.nombre = exigirTexto(datos.nombre, 'El nombre', 120)
    if (datos.email !== undefined) cambios.email = exigirCorreo(datos.email)
    if (datos.institucion !== undefined) {
      cambios.institucion = textoOpcional(datos.institucion, 'La institución', 160) ?? null
    }
    if (datos.modulosVisibles !== undefined) {
      cambios.modulosVisibles = modulosValidos(datos.modulosVisibles)
    }
    if (datos.modulosEditables !== undefined) {
      cambios.modulosEditables = modulosValidos(datos.modulosEditables)
    }
    if (datos.notas !== undefined) {
      // El `?? null` es lo que borra la nota de verdad. `undefined` no viaja en
      // el cuerpo de la escritura y Payload dejaría el texto anterior en su
      // sitio: el administrador vaciaría el cuadro, vería «Cuenta actualizada» y
      // encontraría la nota intacta al volver a abrir. Es el mismo `?? null` de
      // `institucion`, y por el mismo motivo.
      cambios.notas = notaParaGuardar(datos.notas) ?? null
    }
    let quitaUnAdmin = false
    if (datos.rol !== undefined) {
      const nuevoRol = exigirRol(datos.rol)
      if (objetivo === usuarioId && nuevoRol !== 'admin') {
        throw new Error('No puede quitarse a sí mismo el rol de administrador.')
      }
      if (nuevoRol !== 'admin') {
        await exigirQueQuedeUnAdmin(payload, objetivo, usuarioId, 'cambiarle el rol')
        quitaUnAdmin = true
      }
      cambios.rol = nuevoRol
    }

    if (Object.keys(cambios).length === 0) throw new Error('No hay nada que cambiar.')

    const escribir = () =>
      payload.update({
        collection: 'usuarios',
        id: objetivo,
        data: cambios as never,
        user: usuario as never,
      })
    // Solo el cambio de rol puede toparse con el disparador del último
    // administrador; el nombre, el correo o las notas no lo despiertan, y
    // releer la cuenta en cada uno sería una consulta de más por nada.
    if (quitaUnAdmin) {
      await escribirSinDejarSinAdministradores(
        payload,
        objetivo,
        usuarioId,
        'cambiarle el rol',
        escribir,
        (cuenta) => cuenta?.rol === undefined || cuenta.rol === cambios.rol,
      )
    } else {
      await escribir()
    }
    revalidatePath(RUTA_USUARIOS)

    if (quitaUnAdmin) {
      await devolverElAdminSiNoQuedaNinguno(
        payload,
        usuarioId,
        'El rol sí se cambió, pero otra sesión desactivó su cuenta mientras tanto y la ' +
          'plataforma habría quedado sin ningún administrador: se reactivó la suya. Revise la ' +
          'lista antes de seguir.',
      )
    }
    return null
  })
}

/**
 * Le avisa a una persona de que ya puede entrar.
 *
 * Sin esperar: la activación ya está hecha, y el administrador que acaba de
 * pulsar no tiene por qué quedarse mirando lo que tarde el servidor de correo.
 * Si falla, queda en el registro (`enviarSinEsperar`) y la cuenta sigue activa,
 * que es lo que importa; la persona se enterará al intentar entrar.
 *
 * Sin dirección pública, el enlace sale relativo y la plantilla quita el botón
 * (`esEnlaceSeguro`). Se manda igual: «su cuenta ya está activa» es verdad y
 * útil sin botón, y callarlo por una variable dejaría a la persona esperando un
 * aviso que no llega.
 */
function avisarDeCuentaActivada(payload: Payload, cuenta: Record<string, unknown>): void {
  const correo = typeof cuenta.email === 'string' ? cuenta.email : ''
  if (!correo) return
  enviarSinEsperar(
    payload,
    {
      para: correo,
      correo: mensajeDeCuentaActivada({
        nombre: typeof cuenta.nombre === 'string' ? cuenta.nombre : '',
        enlaceEntrar: `${direccionPublica()}/entrar`,
      }),
    },
    `aviso de cuenta activada a ${correo}`,
  )
}

export async function cambiarActivoUsuario(id: unknown, activo: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario, usuarioId } = await exigirAdmin()
    const objetivo = exigirIdentificador(id, 'El usuario')
    const nuevoEstado = activo === true

    if (!nuevoEstado) {
      if (objetivo === usuarioId) throw new Error('No puede desactivar su propia cuenta.')
      await exigirQueQuedeUnAdmin(payload, objetivo, usuarioId, 'desactivar esta cuenta')
    }

    // Una solicitud también se puede activar desde su fila, con el botón de
    // siempre, y tiene que acabar igual que desde su tarjeta: sin la marca de
    // pendiente y con la persona avisada. Sin esto, la cuenta entraba pero
    // seguía contando en el aviso de la barra y en «Solicitudes», y nadie le
    // decía que ya podía entrar. Por eso activar lee la cuenta antes de
    // escribir; desactivar no, porque una solicitud no se «desactiva»: se
    // rechaza, y eso es `resolverSolicitud`.
    const antes = nuevoEstado ? await leerCuenta(payload, objetivo) : null
    const respondeAUnaSolicitud = antes?.pendiente === true

    const escribir = () =>
      payload.update({
        collection: 'usuarios',
        id: objetivo,
        // En la misma escritura, no en dos: con dos, un fallo entre ambas deja
        // una cuenta activa y todavía «por revisar», y quien la revise después
        // puede rechazarla —borrarla— creyendo que nunca entró.
        data: respondeAUnaSolicitud ? { activo: true, pendiente: false } : { activo: nuevoEstado },
        user: usuario as never,
      })
    // Activar no puede dejar a nadie sin administradores: solo se vigila el
    // sentido que el disparador rechaza.
    if (nuevoEstado) {
      await escribir()
      if (respondeAUnaSolicitud && antes) avisarDeCuentaActivada(payload, antes)
    } else {
      await escribirSinDejarSinAdministradores(
        payload,
        objetivo,
        usuarioId,
        'desactivar esta cuenta',
        escribir,
        (cuenta) => cuenta?.activo === undefined || cuenta.activo === false,
      )
    }
    revalidatePath(RUTA_USUARIOS)
    // El número de solicitudes de la barra lo pinta el layout del panel, que
    // no se vuelve a pintar al revalidar solo la página.
    if (respondeAUnaSolicitud) revalidatePath('/admin-panel', 'layout')

    if (!nuevoEstado) {
      await devolverElAdminSiNoQuedaNinguno(
        payload,
        usuarioId,
        'La cuenta sí se desactivó, pero otra sesión desactivó la suya al mismo tiempo y la ' +
          'plataforma habría quedado sin ningún administrador: se reactivó la suya. Revise la ' +
          'lista antes de seguir.',
      )
    }
    return null
  })
}

export async function eliminarUsuario(id: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario, usuarioId } = await exigirAdmin()
    await borrarCuentaVigilada(payload, usuario, usuarioId, exigirIdentificador(id, 'El usuario'))
    return null
  })
}

/**
 * El borrado de una cuenta con todas sus protecciones, para las dos acciones que
 * borran: eliminar una cuenta y rechazar una solicitud.
 *
 * Está sacado de `eliminarUsuario` para que rechazar no escriba su propio
 * `payload.delete`. Una cuenta por revisar nunca debería ser administradora
 * activa —nace desactivada—, pero un rechazo que borrara por su cuenta sería la
 * única escritura de cuentas del panel sin el conteo previo, sin la relectura
 * que descubre el `COMMIT` tragado y sin la reparación de después: bastaría
 * con que alguien marcara `pendiente` a mano en la base sobre la cuenta
 * equivocada. `tests/unit/ultimoAdministradorEnElPanel.test.ts` cuenta que el
 * borrado de cuentas siga escrito una sola vez.
 */
async function borrarCuentaVigilada(
  payload: Payload,
  usuario: Record<string, unknown>,
  usuarioId: string,
  objetivo: string,
): Promise<void> {
  if (objetivo === usuarioId) throw new Error('No puede eliminar su propia cuenta.')
  await exigirQueQuedeUnAdmin(payload, objetivo, usuarioId, 'eliminar esta cuenta')

  await escribirSinDejarSinAdministradores(
    payload,
    objetivo,
    usuarioId,
    'eliminar esta cuenta',
    () =>
      payload.delete({
        collection: 'usuarios',
        id: objetivo,
        user: usuario as never,
      }),
    // Borrada es no encontrarla. Y si la base deshizo el borrado, deshizo con
    // él lo que `limpiarRastroDeUsuario` hizo dentro de la misma transacción:
    // la cuenta sigue con su historial de lectura y sus comentarios firmados,
    // que es lo que permite decir «no se cambió nada» sin mentir.
    (cuenta) => cuenta === null,
  )
  revalidatePath(RUTA_USUARIOS)

  await devolverElAdminSiNoQuedaNinguno(
    payload,
    usuarioId,
    'La cuenta se eliminó, pero otra sesión desactivó la suya al mismo tiempo y la ' +
      'plataforma habría quedado sin ningún administrador: se reactivó la suya.',
  )
}

/**
 * Resuelve una solicitud de cuenta: la activa con el rol elegido, o la rechaza.
 *
 * Es una acción aparte de `cambiarActivoUsuario` y `eliminarUsuario`, aunque por
 * debajo haga lo mismo que ellas, porque lo que se decide aquí es otra cosa. Una
 * solicitud se activa **eligiendo el rol** en el mismo gesto —la cuenta nació
 * lector porque nadie la ha mirado, no porque alguien lo decidiera—, y se
 * rechaza sabiendo que se borra: no hay «desactivar» una cuenta que nunca tuvo
 * acceso, y dejarla desactivada la mezclaría con las bajas, que es justo lo que
 * `pendiente` existe para separar.
 *
 * Se comprueba que siga pendiente **leyéndola**, no fiándose de la pantalla. Dos
 * administradores pueden tener la lista abierta a la vez, y la tarjeta que uno
 * ve puede ser de una solicitud que el otro resolvió hace un minuto: sin esta
 * lectura, «Rechazar» sobre una tarjeta vieja borraría una cuenta que el otro
 * acaba de activar y que quizá ya entró. Queda la ventana de milisegundos entre
 * esta lectura y la escritura; para un servicio con uno o dos administradores
 * es un precio razonable, y cerrarla exigiría una condición en el propio borrado
 * que el borrado vigilado no admite.
 *
 * `avisoPorCorreo` le dice a la pantalla si decir «se le avisó por correo». Es
 * `hayCorreo()` y no el resultado del envío, porque el aviso sale sin esperar:
 * la decisión ya está tomada y no depende del buzón de nadie.
 */
export async function resolverSolicitud(
  id: unknown,
  decision: unknown,
  rol?: unknown,
): Promise<Respuesta<{ avisoPorCorreo: boolean }>> {
  return accion(async () => {
    const { payload, usuario, usuarioId } = await exigirAdmin()
    const objetivo = exigirIdentificador(id, 'La solicitud')
    if (decision !== 'activar' && decision !== 'rechazar') {
      throw new Error('La decisión sobre la solicitud no es válida.')
    }
    // El rol se valida antes de leer nada: un rol que no existe no es motivo
    // para tocar la base, ni siquiera para leerla.
    const rolElegido = decision === 'activar' ? exigirRol(rol ?? 'lector') : null

    const cuenta = await leerCuenta(payload, objetivo)
    if (cuenta?.pendiente !== true) throw new Error(SOLICITUD_YA_RESUELTA)

    if (rolElegido !== null) {
      // Sin la vigilancia del último administrador: activar a alguien, con el
      // rol que sea, no deja a nadie sin acceso.
      await payload.update({
        collection: 'usuarios',
        id: objetivo,
        data: { activo: true, pendiente: false, rol: rolElegido },
        user: usuario as never,
      })
      avisarDeCuentaActivada(payload, cuenta)
    } else {
      // El correo y el nombre se sacan de la lectura de arriba, que es de antes
      // del borrado: después ya no hay a quién preguntárselos.
      const correo = typeof cuenta.email === 'string' ? cuenta.email : ''
      await borrarCuentaVigilada(payload, usuario, usuarioId, objetivo)
      if (correo) {
        enviarSinEsperar(
          payload,
          {
            para: correo,
            correo: mensajeDeSolicitudRechazada({
              nombre: typeof cuenta.nombre === 'string' ? cuenta.nombre : '',
            }),
          },
          `aviso de solicitud rechazada a ${correo}`,
        )
      }
    }

    revalidatePath(RUTA_USUARIOS)
    // El aviso con el número de solicitudes vive en la barra, que la pinta el
    // layout del panel y no esta página: sin revalidar el layout, la barra seguía
    // anunciando una solicitud que ya no existe hasta la siguiente navegación
    // completa.
    revalidatePath('/admin-panel', 'layout')
    return { avisoPorCorreo: hayCorreo() }
  })
}

/**
 * Emite un enlace de restablecimiento de contraseña.
 *
 * El administrador no fija la clave de nadie: entrega un enlace de un solo uso
 * y quien lo recibe elige su contraseña. Si hay servidor de correo configurado
 * llega además por correo; si no, o si el envío falla, el panel muestra el
 * enlace para entregarlo por el canal que corresponda.
 */
export async function generarEnlaceDeClave(
  id: unknown,
): Promise<Respuesta<{ enlace: string; enviadoPorCorreo: boolean }>> {
  return accion(async () => {
    const { payload } = await exigirAdmin()
    const objetivo = exigirIdentificador(id, 'El usuario')

    const cuenta = await payload.findByID({
      collection: 'usuarios',
      id: objetivo,
      overrideAccess: true,
    })
    const correo = (cuenta as { email?: string }).email
    if (!correo) throw new Error('La cuenta no tiene correo asociado.')

    // Una solicitud sin revisar no recibe enlace, y se corta antes del testigo.
    // El enlace no le serviría —`fijarClaveNueva` pasa por el mismo
    // `beforeLogin` que la entrada, y la cuenta está desactivada—, pero con
    // correo configurado le llegaba igual «alguien pidió una contraseña nueva
    // para su cuenta» a una persona que nadie ha revisado, y el panel decía
    // «se envió un enlace» como si sirviera. La tabla apaga el botón en esas
    // filas; esto es para quien llame a la acción sin pasar por ella.
    if ((cuenta as { pendiente?: unknown }).pendiente === true) {
      throw new Error(
        'Esa cuenta es una solicitud sin revisar: actívela o recházela antes de generarle un ' +
          'enlace de contraseña.',
      )
    }

    // Se comprueba **antes** de pedir el testigo: cada `forgotPassword` invalida
    // el anterior, así que fallar después dejaría sin efecto un enlace que a lo
    // mejor ya estaba entregado. Y sin dirección pública el enlace saldría como
    // `/clave/<testigo>`: una ruta relativa, sin origen y sin prefijo, que no
    // sirve para pegar en ningún mensaje ni en el botón de un correo. Una
    // variable que falta se arregla; un enlace mudo que nadie sabe por qué no
    // funciona, no.
    //
    // Se le pregunta a `direccionPublica()` y no a la variable a secas porque es
    // la misma regla con la que `enlaceDeClave` arma el enlace de abajo: si la
    // comprobación recortara la barra por su cuenta, el recorte volvería a estar
    // escrito dos veces.
    if (!direccionPublica()) {
      throw new Error(
        'Falta configurar la dirección pública de la plataforma (NEXT_PUBLIC_SERVER_URL): ' +
          'sin ella no se puede armar un enlace que se pueda entregar.',
      )
    }

    // `disableEmail` siempre, haya correo o no. Antes valía `!hayCorreo` y el
    // envío lo hacía Payload por dentro de `forgotPassword`: si el servidor de
    // correo fallaba, la llamada entera lanzaba, su `killTransaction` deshacía
    // el testigo recién escrito (`auth/operations/forgotPassword.js`) y el panel
    // contestaba un error sin enlace que entregar, justo el día en que el
    // enlace a mano era la única salida. Pedido el testigo por un lado y
    // enviado por otro, un correo que no sale deja al administrador con el
    // enlace en la mano. Y el correo sale con la plantilla y el logotipo
    // adjunto, que el envío de Payload no admite.
    const testigo = await payload.forgotPassword({
      collection: 'usuarios',
      data: { email: correo },
      disableEmail: true,
    })

    // `enlaceDeClave` y no una plantilla aquí: es la misma que pega el correo de
    // recuperación, y cuando el panel armaba su propia copia se dejó el recorte
    // de la barra final —con `NEXT_PUBLIC_SERVER_URL=…/traumahub/` entregaba
    // `…/traumahub//clave/<testigo>`, que contesta con el 404 de otra página del
    // servidor compartido—. Sin SMTP, este enlace es el único camino para que
    // alguien elija clave, y caduca en una hora.
    const enlace = enlaceDeClave(testigo)

    // `enviadoPorCorreo` dice lo que pasó, no lo que se intentó: con `true`, la
    // pantalla le cuenta al administrador que el enlace ya está en el buzón, y
    // no se lo enseña con la insistencia de «entréguelo usted». Decirlo por
    // haber visto `SMTP_HOST` puesto, como antes, era afirmarlo también cuando
    // la cuota por hora de cPanel acababa de rechazar el mensaje.
    let enviadoPorCorreo = false
    if (hayCorreo()) {
      try {
        await enviarCorreo(payload, { para: correo, correo: mensajeDeClaveNueva(enlace) })
        enviadoPorCorreo = true
      } catch (error) {
        console.error('[panel] no se pudo enviar por correo el enlace de contraseña:', error)
      }
    }
    return { enlace, enviadoPorCorreo }
  })
}

// ------------------------------------------------------------- comentarios

export async function actualizarComentario(id: unknown, estado: unknown): Promise<Respuesta> {
  return accion(async () => {
    // El editor también resuelve: es quien arregla lo que se le señala.
    const { payload, usuario } = await exigirEditor()
    if (estado !== 'pendiente' && estado !== 'resuelto') {
      throw new Error('El estado del comentario no es válido.')
    }
    await payload.update({
      collection: 'comentarios',
      id: exigirIdentificador(id, 'El comentario'),
      data: { estado },
      user: usuario as never,
    })
    revalidatePath(RUTA_COMENTARIOS)
    return null
  })
}

export async function eliminarComentario(id: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    await payload.delete({
      collection: 'comentarios',
      id: exigirIdentificador(id, 'El comentario'),
      user: usuario as never,
    })
    revalidatePath(RUTA_COMENTARIOS)
    return null
  })
}

/** Marca como resueltos todos los comentarios pendientes de una sola vez. */
export async function resolverTodosLosComentarios(): Promise<Respuesta<{ resueltos: number }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const resultado = await payload.update({
      collection: 'comentarios',
      where: { estado: { equals: 'pendiente' } },
      data: { estado: 'resuelto' },
      user: usuario as never,
    })
    revalidatePath(RUTA_COMENTARIOS)

    // La escritura masiva de Payload no lanza: captura el error de cada
    // documento, lo acumula en `errors` y sigue con el siguiente. Sin mirar ese
    // array, un éxito parcial sale por la puerta como total —«7 resueltos», en
    // verde— y los tres que quedaron no aparecen en ningún sitio: ni en la
    // pantalla, ni en el registro, porque `accion()` solo anota lo que lanza.
    // El administrador ve la bandeja recargarse con pendientes que acaba de
    // resolver y no tiene una pista de cuáles son ni por qué.
    const resueltos = resultado.docs?.length ?? 0
    const fallidos = resultado.errors ?? []
    if (fallidos.length > 0) {
      console.error('[panel] comentarios que no se pudieron resolver:', fallidos)
      throw new Error(
        `Se resolvieron ${resueltos}, pero ${fallidos.length} no. El primero falló así: ` +
          fallidos[0].message,
      )
    }
    return { resueltos }
  })
}
