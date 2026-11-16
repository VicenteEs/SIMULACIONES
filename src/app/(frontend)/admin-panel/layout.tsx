import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { payloadDelLugar } from '@/lib/payloadDelLugar'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import {
  EnlaceConGuardia,
  GuardiaDeSalida,
  NavegacionAdmin,
  type SeccionDeMenu,
} from '@/components/admin/NavegacionAdmin'
import { GuardiaDeAtras } from '@/components/admin/GuardiaDeAtras'
import { NotasDelRevisorEnLaBarra } from '@/components/admin/NotasDelRevisorEnLaBarra'
import { BotonSalir } from '@/components/BotonSalir'
import { LogoChessCore } from '@/components/LogoChessCore'
import { CajonDelPanel } from '@/components/admin/CajonDelPanel'
import { IconoDeMenu } from '@/components/admin/NavegacionAdmin'
import './admin.css'
// Después de `admin.css`, para que el contorno mande sobre lo que allí quede.
import './panel.css'
import { ruta } from '@/lib/rutas'
import { AUTORIA } from '@/lib/autoria'
import { esDeTraumaHub, lugarDeLaCuenta, puedeEditar } from '@/lib/guardias'
import { MODULOS } from './modulos'

export const dynamic = 'force-dynamic'

/**
 * Contorno del panel.
 *
 * Entran administrador y editor, y ven cosas distintas: el editor escribe
 * contenido, el administrador además gestiona cuentas, respaldos y sistema. La
 * navegación se arma según el rol, pero eso es comodidad, no seguridad: cada
 * página vuelve a comprobar quién entra, porque ocultar un enlace no protege
 * una ruta.
 *
 * Se usa el **rol real** y nunca el efectivo: un administrador que está mirando
 * la plataforma «como residente» sigue siendo administrador, pero nadie debe
 * poder administrar desde una simulación.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  const rol = sesion.rolReal
  if (!sesion?.usuario || !sesion.activo || (rol !== 'admin' && rol !== 'editor')) {
    redirect('/')
  }
  const esAdmin = rol === 'admin'
  // Lo que es de toda la plataforma no se le ofrece a una cuenta de
  // institución (D-396). Cada pantalla lo vuelve a mirar (`exigirPanelCentral`).
  const esCentral = esDeTraumaHub(sesion.usuario)

  // Un aviso en la barra evita que los comentarios queden meses sin leer por no
  // haber entrado a esa sección.
  //
  // Lo mismo con las solicitudes de cuenta, y con más motivo: quien pidió
  // entrar no puede hacer nada hasta que alguien la active, y no hay otro sitio
  // del panel que lo diga. Solo se cuentan para el administrador, que es el
  // único que puede resolverlas; al editor no se le enseña un número que no le
  // toca atender.
  let pendientes = 0
  let solicitudes = 0
  // La revisión del contenido (D-142): cuántas fichas esperan a quien entra
  // —asignadas a él, o sin asignar si es editor—, y para el administrador,
  // cuántas están validadas esperando que las publique.
  let porRevisar = 0
  let listas = 0
  // Las cotizaciones nuevas de la portada (P-007 E3), para el administrador:
  // quien las pidió espera respuesta, como quien pidió una cuenta.
  let cotizaciones = 0
  // En una constante: la guardia de arriba estrecha `sesion.usuario`, pero ese
  // estrechamiento no llega dentro de la función que se le pasa a `filter`.
  const cuenta = sesion.usuario
  const usuarioId = String(cuenta.id)
  const misModulos = MODULOS.filter((m) => puedeEditar(cuenta, m.slug)).map((m) => m.slug)
  try {
    // Los números de la barra, de su lugar (D-401): al administrador de una
    // institución, sus solicitudes y sus revisiones. Los comentarios, de todas
    // las instituciones y solo para TraumaHub, que es adonde van (D-371).
    const deTodas = await getPayload({ config })
    const payload = payloadDelLugar(deTodas, lugarDeLaCuenta(cuenta))
    const [conteo, conteoDeSolicitudes, conteoPorRevisar, conteoDeListas, conteoDeCotizaciones] = await Promise.all([
      esCentral
        ? deTodas.count({
            collection: 'comentarios',
            where: { estado: { equals: 'pendiente' } },
            overrideAccess: true,
          })
        : Promise.resolve({ totalDocs: 0 }),
      esAdmin
        ? payload.count({
            collection: 'usuarios',
            where: { pendiente: { equals: true } },
            overrideAccess: true,
          })
        : Promise.resolve({ totalDocs: 0 }),
      misModulos.length === 0
        ? Promise.resolve({ totalDocs: 0 })
        : payload
        .count({
          collection: 'revisiones',
          where: {
            and: [
              { estado: { in: ['pendiente', 'en-revision', 'devuelta'] } },
              { coleccion: { in: misModulos } },
              esAdmin
                ? { asignadaA: { equals: usuarioId } }
                : { or: [{ asignadaA: { equals: usuarioId } }, { asignadaA: { exists: false } }] },
            ],
          } as never,
          overrideAccess: true,
        })
        // Si la tabla de revisiones no responde, la barra se pinta igual.
        .catch(() => ({ totalDocs: 0 })),
      esAdmin
        ? payload
            .count({ collection: 'revisiones', where: { estado: { equals: 'lista' } }, overrideAccess: true })
            .catch(() => ({ totalDocs: 0 }))
        : Promise.resolve({ totalDocs: 0 }),
      // Con su `catch`, como las revisiones: una tabla que falta no puede
      // dejar el panel entero sin barra.
      esAdmin && esCentral
        ? payload
            .count({ collection: 'cotizaciones', where: { estado: { equals: 'nueva' } }, overrideAccess: true })
            .catch(() => ({ totalDocs: 0 }))
        : Promise.resolve({ totalDocs: 0 }),
    ])
    pendientes = conteo.totalDocs
    solicitudes = conteoDeSolicitudes.totalDocs
    porRevisar = conteoPorRevisar.totalDocs
    listas = conteoDeListas.totalDocs
    cotizaciones = conteoDeCotizaciones.totalDocs
  } catch {
    // Si la base no responde, el panel debe abrirse igual para poder
    // diagnosticarlo desde la sección de sistema.
    pendientes = 0
    solicitudes = 0
  }

  const secciones: SeccionDeMenu[] = [
    {
      titulo: 'Trabajo',
      entradas: [
        { ruta: '/admin-panel', etiqueta: 'Resumen', icono: 'panel' },
        {
          ruta: '/admin-panel/revision',
          etiqueta: 'Por revisar',
          icono: 'revision',
          aviso: porRevisar || undefined,
        },
        { ruta: '/admin-panel/contenido', etiqueta: 'Contenido', icono: 'contenido' },
        // El taller y las estructuras editan el catálogo común: solo TraumaHub.
        ...(esCentral ? [{ ruta: '/admin-panel/atlas', etiqueta: 'Taller anatómico', icono: 'atlas' }] : []),
        // Los comentarios van todos a TraumaHub (D-371): la institución no los ve.
        ...(esCentral
          ? [{ ruta: '/admin-panel/comentarios', etiqueta: 'Comentarios', icono: 'comentarios', aviso: pendientes || undefined }]
          : []),
        // Debajo de Comentarios, como pidió el dueño (D-179). Sin aviso: «2.000
        // pendientes» en la barra no se atiende, se trabaja de a poco.
        ...(esCentral ? [{ ruta: '/admin-panel/estructuras', etiqueta: 'Estructuras', icono: 'estructuras' }] : []),
      ],
    },
  ]

  if (esAdmin) {
    secciones.push({
      titulo: 'Seguimiento',
      entradas: [
        { ruta: '/admin-panel/estadisticas', etiqueta: 'Estadísticas', icono: 'estadisticas' },
        { ruta: '/admin-panel/actividad', etiqueta: 'Actividad', icono: 'actividad' },
        { ruta: '/admin-panel/registro', etiqueta: 'Registro', icono: 'registro' },
        {
          ruta: '/admin-panel/auditoria',
          etiqueta: 'Auditoría',
          icono: 'auditoria',
          aviso: listas || undefined,
        },
      ],
    })
    secciones.push({
      titulo: 'Administración',
      entradas: [
        {
          ruta: '/admin-panel/usuarios',
          etiqueta: 'Usuarios y permisos',
          icono: 'usuarios',
          aviso: solicitudes || undefined,
        },
        // El resto es de toda la plataforma: el administrador de una
        // institución administra sus cuentas, y nada más de esta sección.
        ...(esCentral
          ? [
              // Las instituciones y su plazo (P-016 E5.5): junto a las cuentas,
              // porque crear una es dar de alta a su administrador.
              { ruta: '/admin-panel/instituciones', etiqueta: 'Instituciones', icono: 'instituciones' },
              // Debajo de las solicitudes de cuenta: las dos son alguien de
              // fuera que espera respuesta.
              {
                ruta: '/admin-panel/cotizaciones',
                etiqueta: 'Cotizaciones',
                icono: 'cotizaciones',
                aviso: cotizaciones || undefined,
              },
              { ruta: '/admin-panel/contenido/equipo', etiqueta: 'Equipo', icono: 'equipo' },
              // Las fotos y los textos de la portada pública (P-007 E2). No
              // «Medios», que es la colección del contenido clínico: lo pidió
              // el dueño así.
              { ruta: '/admin-panel/medios-pagina', etiqueta: 'Medios de la página', icono: 'mediosPagina' },
              { ruta: '/admin-panel/difusion', etiqueta: 'Difusión', icono: 'difusion' },
              { ruta: '/admin-panel/respaldos', etiqueta: 'Respaldos', icono: 'respaldos' },
              // El servidor, las visitas y Cloudflare (P-016 E7, D-408). En
              // todos los servidores, aunque solo la producción tenga con qué
              // llenarla: en ved dice qué le falta, y eso también sirve.
              { ruta: '/admin-panel/monitoreo', etiqueta: 'Monitoreo', icono: 'monitoreo' },
              { ruta: '/admin-panel/sistema', etiqueta: 'Sistema', icono: 'sistema' },
            ]
          : []),
      ],
    })
  }

  return (
    <div className="admin-layout">
      {/* Atrás y Adelante del navegador, que no pasan ni por la barra ni por
          `beforeunload`. Aquí y solo aquí: el contorno dura lo que dura el
          panel, y dos guardias preguntarían dos veces por el mismo viaje. */}
      <GuardiaDeAtras />
      <aside className="admin-sidebar">
        <CajonDelPanel
          cabecera={
            <>
              <img src={ruta('/icon.png')} alt="" className="admin-sidebar-logo" />
              <div>
                <div className="admin-sidebar-title">TraumaHub</div>
                <span className="admin-sidebar-sub">Panel de control</span>
              </div>
            </>
          }
          // Las notas del modelo para el revisor, arriba del todo y siempre a
          // la vista con una ficha abierta (D-144): abajo quedaban bajo el
          // pliegue. Fuera del cajón, para que en el teléfono no se escondan
          // detrás del botón «Menú». Se lee la ruta en el cliente.
          antes={<NotasDelRevisorEnLaBarra />}
        >
          <NavegacionAdmin secciones={secciones} />

          {/* Todo lo que saca del panel desde esta barra pregunta antes si hay
              una ficha a medio escribir. Aquí no hay `<Link>` a secas: este
              archivo es de servidor y no puede darle a `<Link>` la función que
              pregunta, así que la ponen `EnlaceConGuardia` y `GuardiaDeSalida`
              desde el cliente. `tests/unit/salidaDelEditor.test.ts` lo vigila. */}
          <div className="admin-nav-back">
            <EnlaceConGuardia href="/" className="admin-nav-link">
              <IconoDeMenu nombre="volver" />
              <span className="admin-nav-texto">Volver a la plataforma</span>
            </EnlaceConGuardia>
            <div className="admin-sidebar-pie">
              <span className="admin-sidebar-quien">
                {(sesion.usuario.nombre as string) || (sesion.usuario.email as string)}
                {' · '}
                {esAdmin ? 'administrador' : 'editor'}
              </span>
              <GuardiaDeSalida>
                <BotonSalir clase="admin-salir" />
              </GuardiaDeSalida>
            </div>
            <p className="admin-sidebar-credito">
              <span className="admin-sidebar-credito-marca">
                Desarrollado por
                <LogoChessCore sobre="oscuro" alto={60} />
              </span>
              {AUTORIA.nombre} · <a href={`mailto:${AUTORIA.correo}`}>{AUTORIA.correo}</a>
            </p>
          </div>
        </CajonDelPanel>
      </aside>
      <main className="admin-content">{children}</main>
    </div>
  )
}
