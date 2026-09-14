import type { CollectionConfig, FieldAccess } from 'payload'
import {
  accesoDePropiedad,
  administracionDeUsuarios,
  creacionEnModuloVisible,
  mantenimientoDeContenido,
  soloSuAutor,
} from '@/access/payload'
import { enviarSinEsperar, hayCorreo } from '@/correo/enviar'
import { mensajeDeComentarioNuevo } from '@/correo/mensajes'
// De `modulos.ts` y no de `datos.ts`: aquel son constantes sin un solo import, y
// este importa `@/collections`, que importa este archivo. El ciclo no falla al
// compilar; falla al arrancar, con la tabla todavía sin definir.
import { NOMBRE_DE_MODULO } from '@/app/(frontend)/admin-panel/modulos'
import { direccionPublica } from './Usuarios'

/**
 * Campos que fija la plataforma al crear el comentario y que nadie reescribe
 * después.
 *
 * `admin: { readOnly: true }` no protege nada: es una indicación para la
 * interfaz de Payload —retirada en D-038— y el servidor nunca la miró. Lo único
 * que filtra campos en escritura es el acceso de campo, y solo sobre los campos
 * que lo declaran: `fields/hooks/beforeValidate/promise.js` hace
 * `if (field.access && field.access[operation])` y, sin esa declaración, se
 * salta la comprobación entera y conserva el valor que mandó el cliente.
 *
 * Sin esto, `update: accesoDePropiedad` deja que el autor de un comentario haga
 * `PATCH /api/comentarios/<id>` —la API REST sigue montada— con
 * `{"usuario": <otra cuenta>}` y el panel atribuya su observación a otro médico
 * con nombre y correo, o que lo mueva a otra ficha con `coleccion` y
 * `documentoId`.
 *
 * Solo cierra la modificación, a propósito: en la creación el gancho pone el
 * autor y la acción de servidor valida módulo y ficha. Y solo actúa por REST,
 * porque el acceso de campo se salta cuando `overrideAccess` es cierto, que es
 * el valor por omisión de la API local con la que escriben el panel y la baja
 * de cuentas.
 */
const FIJADO_AL_CREAR: { update: FieldAccess } = { update: () => false }

// `mantenimientoDeContenido` —administrador o editor con la cuenta activa— vivía
// aquí como constante local. Se mudó a `src/access/payload.ts`, que es donde
// este proyecto promete tener toda la política junta, y desde allí delega en
// `reglas.ts` igual que sus vecinas. El comportamiento es el mismo.

/**
 * Cuántos administradores como mucho reciben el aviso de un comentario nuevo.
 *
 * Aquí hubo un `limit: 10` suelto: el día que hubiera once administradores
 * activos, uno dejaría de recibir avisos y nada lo delataría. El número alto es
 * un tope de cortesía contra una consulta desbocada, no una política: esta
 * plataforma tiene un puñado de administradores y en la práctica los alcanza a
 * todos.
 */
const MAXIMO_DE_ADMINISTRADORES_AVISADOS = 200

export const Comentarios: CollectionConfig = {
  slug: 'comentarios',
  labels: { singular: 'Comentario', plural: 'Comentarios' },
  admin: {
    useAsTitle: 'texto',
    defaultColumns: ['usuario', 'coleccion', 'estado', 'createdAt'],
    group: 'Administración',
  },
  access: {
    read: accesoDePropiedad,
    // Bastaba una cuenta activa, y eso dejaba comentar un módulo vetado: la
    // misma regla que decide si se puede abrir la ficha decide si se puede
    // comentar. Ver `creacionEnModuloVisible`.
    create: creacionEnModuloVisible,
    update: accesoDePropiedad,
    delete: administracionDeUsuarios,
  },
  hooks: {
    beforeChange: [
      ({ req, data, operation }) => {
        if (operation === 'create') {
          return { ...data, usuario: req.user?.id }
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        // `hayCorreo()` mira `SMTP_HOST`, la misma variable que miraba aquí la
        // condición escrita a mano: se pregunta a la regla común para que el
        // gancho y el transporte no puedan discrepar sobre si hay servidor.
        if (operation === 'create' && hayCorreo()) {
          try {
            const adminQuery = await req.payload.find({
              collection: 'usuarios',
              where: {
                and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }],
              },
              limit: MAXIMO_DE_ADMINISTRADORES_AVISADOS,
            })

            const adminEmails = adminQuery.docs.map((a: any) => a.email).filter(Boolean)

            if (adminEmails.length > 0) {
              // El envío no se espera, y no es un descuido. Los ganchos
              // `afterChange` de colección corren **dentro** de la transacción
              // de la escritura: en `collections/operations/create.js` el bucle
              // de ganchos está en la línea 291 y `commitTransaction` en la
              // 324. Esperar aquí al diálogo SMTP deja abierta la transacción
              // que acaba de insertar el comentario todo lo que tarde el
              // servidor de correo —hasta los dos minutos de espera de
              // nodemailer el día que deje de responder—, con el botón girando:
              // el residente cree que no se guardó y vuelve a pulsar, y el
              // comentario sale duplicado. La condición de entrada es solo que
              // `SMTP_HOST` esté puesta, no que el servidor conteste.
              //
              // Lo garantiza `enviarSinEsperar`, que no devuelve promesa que
              // esperar y ataja él mismo el fallo —sin ese `.catch`, una promesa
              // suelta que se rompe después de responder tumba el proceso por
              // rechazo no atendido—. Si alguien cambia esta llamada por
              // `await enviarCorreo(…)`, vuelven los dos fallos a la vez.
              //
              // El texto del comentario ya no se escapa aquí: lo hace la
              // plantilla con todo lo que recibe (`src/correo/plantilla.ts`).
              // Escaparlo también aquí lo escaparía dos veces, y el
              // administrador leería `&lt;` donde el residente escribió `<`.
              enviarSinEsperar(
                req.payload,
                {
                  para: adminEmails,
                  correo: mensajeDeComentarioNuevo({
                    autor: req.user?.nombre?.trim() || req.user?.email || 'Cuenta desconocida',
                    // El nombre del módulo y no su slug: el asunto se lee en la
                    // bandeja, y «casos-ao» ahí no dice nada a quien no ha visto
                    // nunca la base.
                    modulo: NOMBRE_DE_MODULO[String(doc.coleccion)] ?? String(doc.coleccion),
                    texto: String(doc.texto ?? ''),
                    enlacePanel: `${direccionPublica()}/admin-panel/comentarios`,
                  }),
                },
                'aviso de comentario nuevo',
              )
            }
          } catch (error) {
            req.payload.logger.error({ msg: 'Error al enviar email de comentario', err: error })
          }
        }
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'usuario',
      type: 'relationship',
      relationTo: 'usuarios',
      // No es obligatorio a proposito: al dar de baja una cuenta, sus
      // comentarios se conservan sin autor. Valen por lo que dicen del
      // contenido, no por quien los escribio. El gancho de creacion siempre
      // pone el autor, de modo que un comentario nuevo nunca nace anonimo.
      // Y el acceso de campo impide que deje de serlo después: sin él, el autor
      // se regalaba el comentario a otra cuenta, o se lo quitaba a sí mismo
      // mandando `null`, que es el estado reservado a las cuentas eliminadas.
      access: FIJADO_AL_CREAR,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'coleccion',
      type: 'select',
      required: true,
      options: [
        { label: 'patologias', value: 'patologias' },
        { label: 'maniobras', value: 'maniobras' },
        { label: 'casos-ao', value: 'casos-ao' },
        { label: 'cirugias', value: 'cirugias' },
        { label: 'estudios-ia', value: 'estudios-ia' },
      ],
      access: FIJADO_AL_CREAR,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'documentoId',
      type: 'text',
      required: true,
      // Se consulta por ficha al abrirla: sin indice, cada apertura recorre la
      // tabla entera de comentarios.
      index: true,
      access: FIJADO_AL_CREAR,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'texto',
      type: 'textarea',
      required: true,
      // Lo reescribe su autor y nadie más. `update: accesoDePropiedad` deja al
      // editor tocar cualquier fila —tiene que poder resolverla—, y sin esto
      // también cambiaba lo que el residente escribió mientras el panel lo
      // seguía firmando con su nombre. Ver `soloSuAutor`.
      access: { update: soloSuAutor },
    },
    {
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'pendiente',
      options: [
        { label: 'Pendiente', value: 'pendiente' },
        { label: 'Resuelto', value: 'resuelto' },
      ],
      // Las dos operaciones, no solo `update`: Payload se salta el acceso de un
      // campo cuando la operación en curso no está declarada, de modo que un
      // `estado` sin `create` lo elegía quien mandaba la petición. Un
      // `POST /api/comentarios` con `{"estado": "resuelto"}` desde una cuenta de
      // lector nacía archivado: fuera del contador de pendientes de la barra
      // lateral y fuera de la vista por omisión de la tabla, que arranca
      // filtrada en «solo pendientes». El comentario no le llegaba a nadie y
      // tampoco quedaba rastro de que se hubiera archivado solo.
      //
      // El `defaultValue` de arriba se encarga del resto: cuando la regla
      // rechaza el valor, Payload lo borra de los datos entrantes y cae en el
      // valor por omisión, así que el comentario de un lector nace pendiente
      // aunque él mande otra cosa.
      access: {
        create: mantenimientoDeContenido,
        update: mantenimientoDeContenido,
      },
    },
  ],
}
