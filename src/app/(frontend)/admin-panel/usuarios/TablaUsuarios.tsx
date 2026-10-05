'use client'

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  CircleSlash,
  Copy,
  Hourglass,
  KeyRound,
  Pencil,
  RefreshCw,
  SearchX,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react'
import { MODULOS } from '../modulos'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { PlegarTodo } from '@/components/admin/PlegarTodo'
import { Modal } from '@/components/ui/Modal'
import { useConfirmar } from '@/components/ui/Confirmar'
import { useAvisos } from '@/components/ui/Avisos'
import { MenuAcciones } from '@/components/ui/MenuAcciones'
import { SeccionPlegable } from '@/components/ui/SeccionPlegable'
import { Vacio } from '@/components/ui/Vacio'
import { claseDeInsignia } from '@/lib/tonosDeEstado'
import { normalizar } from '@/lib/busqueda'
import {
  actualizarUsuario,
  cambiarActivoUsuario,
  crearUsuario,
  eliminarUsuario,
  generarEnlaceDeClave,
  resolverSolicitud,
} from '@/app/(frontend)/acciones/admin'
import { SolicitudesPendientes } from './SolicitudesPendientes'
import './solicitudes.css'

export interface UsuarioDelPanel {
  id: string
  email: string
  nombre: string
  rol: 'admin' | 'editor' | 'lector'
  activo: boolean
  institucion: string
  creado: string
  ultimoAcceso: string | null
  modulosVisibles: string[]
  modulosEditables: string[]
  /**
   * Notas del administrador **sobre** la cuenta: quién la pidió, por qué se
   * desactivó. No las escribe ni las ve su titular; esta pantalla ya exige rol
   * de administrador entera.
   *
   * Obligatoria, y no `notas?: string`, porque el único sitio que arma esta
   * lista es `page.tsx` —`payload.find` sin `select` devuelve el documento
   * entero, la nota incluida— y con el campo opcional el `map` se la dejó sin
   * copiar sin que nada protestara: llegaba `undefined` en las quinientas
   * filas y toda esta pantalla quedaba inerte de golpe, la fila sin nota, la
   * búsqueda concatenando vacío y el cuadro del modal abriendo en blanco sobre
   * una nota que sí existía. Exigirla en el tipo convierte ese olvido en un
   * error de compilación en la línea exacta donde falta, que es la única forma
   * de que no vuelva a pasar en silencio.
   */
  notas: string
  /**
   * Los cuatro campos de la solicitud de cuenta, obligatorios por el mismo
   * motivo que `notas`: sin `pendiente` copiado en `page.tsx`, las solicitudes
   * se pintaban como bajas —«Sin activar»— y la sección de arriba no aparecía,
   * sin un solo error.
   */
  origen: 'panel' | 'solicitud'
  pendiente: boolean
  motivoDeSolicitud: string
  solicitadaEn: string | null
}

const ETIQUETA_ROL: Record<UsuarioDelPanel['rol'], string> = {
  admin: 'Administrador',
  editor: 'Editor',
  lector: 'Lector',
}

const fecha = (valor?: string | null) =>
  valor
    ? new Date(valor).toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

/**
 * Lo que se dice cuando la acción ni siquiera llegó a contestar.
 *
 * `accion()` (src/lib/guardias.ts) convierte en mensaje lo que falla DENTRO del
 * servidor. Lo que se rompe en el camino no pasa por ahí: el proxy compartido
 * devuelve 502, la sesión caduca y vuelve HTML en vez de la respuesta de
 * acción, o se reconstruye la imagen y Next ya no reconoce el identificador de
 * acción que tiene abierta esta pestaña. En esos casos la promesa rechaza y no
 * hay ningún `mensaje` que enseñar, así que lo pone este texto.
 */
const FALLO_DE_TRANSPORTE = 'No se pudo contactar con el servidor. Recargue la página y reintente.'

/**
 * Techo de la nota interna, el mismo que exige el servidor
 * (`LARGO_MAXIMO_NOTA`, en `acciones/admin.ts`).
 *
 * Se repite en vez de importarse porque aquel módulo es `'use server'` y solo
 * puede exportar funciones asíncronas: importar de él una constante es un error
 * de compilación, no una dependencia pesada. Sin techo aquí, el administrador
 * escribe la historia entera de la cuenta y el rechazo llega después de pulsar
 * guardar, cuando ya no hay dónde recuperarla.
 * `tests/unit/notasDeCuenta.test.ts` falla si los dos números se separan.
 */
const LARGO_MAXIMO_NOTA = 2000

/**
 * Lo que dura el enlace de una invitación, el mismo número que
 * `HORAS_DE_INVITACION` en `acciones/admin.ts`.
 *
 * Repetido por la misma razón que `LARGO_MAXIMO_NOTA`. Aquí solo se usa para
 * decírselo al administrador cuando el correo no salió y tiene que entregar el
 * enlace a mano: si el servidor lo cambia y esto no, le dice a la persona que
 * tiene tres días cuando tiene uno. `tests/unit/solicitudesEnElPanel.test.ts`
 * falla si los dos se separan.
 */
const HORAS_DE_INVITACION = 72

/** Lo que se enseña de una nota dentro de la fila, que no es sitio para un párrafo. */
const RESUMEN_DE_NOTA = 90

const resumirNota = (nota: string): string => {
  // Los saltos de línea se colapsan a mano: dentro de la celda el navegador ya
  // los trataría como un espacio, pero el recorte cuenta caracteres y sin esto
  // una nota de cuatro líneas cortas gastaba el resumen en blancos.
  const enUnaLinea = nota.replace(/\s+/g, ' ').trim()
  return enUnaLinea.length > RESUMEN_DE_NOTA
    ? `${enUnaLinea.slice(0, RESUMEN_DE_NOTA)}…`
    : enUnaLinea
}

/**
 * Contraseña inicial sugerida.
 *
 * Se genera en el navegador y se muestra una sola vez: el administrador la
 * entrega y la persona la cambia con el enlace de restablecimiento. Es mejor
 * que la alternativa real, que es teclear «Trauma2026» en las cinco cuentas.
 */
function claveSugerida(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const valores = new Uint32Array(16)
  crypto.getRandomValues(valores)
  return Array.from(valores, (v) => alfabeto[v % alfabeto.length]).join('')
}

type Aviso = { tipo: 'ok' | 'error' | 'info'; texto: string; enlace?: string } | null

type Invitacion = { enviada: boolean; enlace: string }

/**
 * Qué se le dice al administrador después de crear una cuenta con invitación.
 *
 * Cuando el correo no salió, el aviso es `info` y lleva el enlace, como el de
 * «Clave» sin servidor de correo: es el mismo problema con la misma salida. Y
 * dice primero que la cuenta **sí** se creó, porque lo que se lee al ver un
 * fallo es que no se hizo nada, y el siguiente gesto es volver a crearla, que
 * choca con «ese correo ya existe».
 */
function avisoDeInvitacion(
  email: string,
  activa: boolean,
  invitacion: Invitacion | undefined,
): NonNullable<Aviso> {
  // Una cuenta sin activar no puede usar el enlace todavía: `fijarClaveNueva`
  // pasa por el mismo `beforeLogin` que la entrada y la rechaza. El testigo no
  // se gasta y sirve en cuanto se active, mientras no caduque.
  const sinActivar = activa
    ? ''
    : ' La cuenta quedó sin activar: el enlace no le servirá hasta que la active.'
  if (invitacion?.enviada) {
    return {
      tipo: 'ok',
      texto: `Cuenta creada. Se envió a ${email} un correo para elegir su contraseña; el enlace caduca en ${HORAS_DE_INVITACION} horas.${sinActivar}`,
    }
  }
  return {
    tipo: 'info',
    texto: `La cuenta de ${email} se creó, pero el correo de invitación no se pudo enviar. Entréguele este enlace para que elija su contraseña: sirve una sola vez y caduca en ${HORAS_DE_INVITACION} horas.${sinActivar}`,
    enlace: invitacion?.enlace,
  }
}

export function TablaUsuarios({
  usuarios,
  solicitudes,
  sinMostrar,
  idPropio,
  hayCorreo,
  hayDireccion,
}: {
  /** Todas las filas de la tabla: las cuentas revisadas y las solicitudes. */
  usuarios: UsuarioDelPanel[]
  /** Las solicitudes, aparte y por antigüedad, para las tarjetas de arriba. */
  solicitudes: UsuarioDelPanel[]
  /** Lo que existe en la base y no entró en la lectura por los topes de `page.tsx`. */
  sinMostrar: { cuentas: number; solicitudes: number }
  idPropio: string
  hayCorreo: boolean
  /** Si hay dirección pública con la que armar enlaces que funcionen fuera. */
  hayDireccion: boolean
}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [aviso, setAviso] = useState<Aviso>(null)
  const avisar = useAvisos()
  const confirmar = useConfirmar()

  /**
   * Dónde se cuenta un resultado: flotando o en la página.
   *
   * Un éxito sin nada que copiar sale en un aviso flotante, que se ve esté
   * donde esté la fila —antes se pintaba encima de los filtros, fuera de la
   * pantalla para quien activaba la cuenta treinta— y se va solo. Lo que trae
   * un dato que hay que guardar se queda en la página hasta que se cierre la
   * región: un enlace de un solo uso o una contraseña inicial que se enseña
   * una vez desaparecerían a los cinco segundos con lo único que no se puede
   * volver a pedir. Los errores también se quedan en la página, que es donde
   * caben con su explicación y desde donde los lee el modal abierto.
   */
  const mostrar = (a: NonNullable<Aviso>) => {
    if (a.tipo === 'ok' && !a.enlace) avisar('ok', a.texto)
    else setAviso(a)
  }

  /**
   * Qué fila está trabajando, no solo si hay algo trabajando.
   *
   * `enCurso` es uno para toda la tabla: usándolo como `disabled` en los seis
   * controles de cada fila, una acción sobre una cuenta dejaba inertes los
   * controles de las treinta y siete durante todo el viaje de ida y vuelta, que
   * además incluye un `router.refresh()` sobre una página `force-dynamic`.
   * Guardando el identificador solo se apaga la fila afectada. `enCurso` se
   * sigue usando en los modales, donde sí hay una única acción posible.
   */
  const [filaEnCurso, setFilaEnCurso] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')

  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<UsuarioDelPanel | null>(null)
  const [permisos, setPermisos] = useState<UsuarioDelPanel | null>(null)

  /**
   * El rol elegido se ve mientras la acción viaja.
   *
   * El `<select>` de la columna Rol es controlado con el rol que llega del
   * servidor, y ese valor no cambia hasta que termina el `router.refresh()`.
   * Sin esto, React devolvía el desplegable al rol anterior en cuanto se elegía
   * otro —es un control controlado: React reescribe el valor del nodo— y
   * parecía que el cambio no se había aplicado, con lo que se volvía a elegir y
   * se disparaba una segunda escritura. React descarta el valor optimista
   * cuando la transición acaba, así que un fallo revierte solo, que es
   * exactamente lo que aquí se quiere.
   */
  const [listaMostrada, ponerRolOptimista] = useOptimistic<
    UsuarioDelPanel[],
    { id: string; rol: UsuarioDelPanel['rol'] }
  >(usuarios, (lista, cambio) =>
    lista.map((u) => (u.id === cambio.id ? { ...u, rol: cambio.rol } : u)),
  )

  const visibles = useMemo(() => {
    // `normalizar()` quita las tildes además de las mayúsculas, que es lo que
    // `toLowerCase()` no hacía: buscar «jose» no encontraba a José Pérez ni
    // «munoz» a Muñoz, y en un padrón chileno eso es media tabla. Las palabras
    // se exigen todas y en cualquier orden, igual que en `filtrarFichas`, para
    // que «perez jose» valga tanto como «jose perez».
    const palabras = normalizar(busqueda).split(' ').filter(Boolean)
    return listaMostrada.filter((u) => {
      if (filtroRol !== 'todos' && u.rol !== filtroRol) return false
      if (filtroEstado === 'activos' && !u.activo) return false
      // «Sin activar» son las bajas y las cuentas creadas sin acceso, no las
      // solicitudes: una cosa se atiende reactivando a quien ya estuvo y la
      // otra decidiendo si alguien entra por primera vez, y mezcladas en un
      // mismo filtro ninguna de las dos listas servía para su trabajo.
      if (filtroEstado === 'inactivos' && (u.activo || u.pendiente)) return false
      if (filtroEstado === 'solicitudes' && !u.pendiente) return false
      if (palabras.length === 0) return true
      // La nota entra en la búsqueda: el caso que el campo resuelve es «quién
      // pidió esta cuenta», y eso solo sirve si buscando al jefe de servicio
      // aparecen las cuatro cuentas que pidió. No filtra nada que el
      // administrador no esté viendo ya: esta pantalla es suya entera.
      const donde = normalizar([u.nombre, u.email, u.institucion, u.notas].join(' '))
      return palabras.every((palabra) => donde.includes(palabra))
    })
  }, [listaMostrada, busqueda, filtroRol, filtroEstado])

  /**
   * Ejecuta una acción, muestra su resultado y recarga los datos del servidor.
   *
   * El `try` no es precaución de más: sin él, el rechazo de la promesa se
   * propaga al render de la transición —React guarda el thenable rechazado como
   * estado y vuelve a lanzarlo al pintar—, ninguna de las dos ramas llega a
   * poner un aviso y la frontera de error de Next se lleva por delante la tabla
   * entera. El administrador se queda con «Application error» y sin saber si la
   * acción llegó a aplicarse.
   *
   * `alLograrlo` corre solo si el servidor confirmó: es lo que permite cerrar
   * el modal DESPUÉS de guardar. Cerrándolo antes, un rechazo —un correo que ya
   * existe, la sesión caducada mientras se marcaban diez casillas— desmontaba
   * el formulario con todo lo escrito dentro y no había dónde volver.
   *
   * `exitoso` puede ser una función de lo que devolvió el servidor, para los
   * éxitos que no se saben antes de preguntar: si la invitación salió por
   * correo o hay que entregar el enlace a mano, si a quien se activó se le avisó.
   * Sigue siendo el mismo camino, con su recarga y su `filaEnCurso`; la
   * alternativa era copiar este bloque entero en cada acción con datos, como
   * `pedirEnlace`, y cada copia es un sitio más donde olvidar el `catch`.
   */
  const ejecutar = <T,>(
    tarea: () => Promise<{ exito: boolean; mensaje?: string; datos?: T }>,
    exitoso: string | ((datos: T | undefined) => NonNullable<Aviso>),
    opciones: { fila?: string; alEnviar?: () => void; alLograrlo?: () => void } = {},
  ) => {
    setAviso(null)
    iniciar(async () => {
      // Dentro de la transición y antes del `await`: es la única forma de que
      // React acepte el valor optimista y lo mantenga hasta que la acción y su
      // recarga terminen.
      opciones.alEnviar?.()
      if (opciones.fila) setFilaEnCurso(opciones.fila)
      try {
        const resultado = await tarea()
        if (resultado.exito) {
          opciones.alLograrlo?.()
          if (typeof exitoso === 'function') mostrar(exitoso(resultado.datos))
          else avisar('ok', exitoso)
          router.refresh()
        } else {
          // Sin `router.refresh()`, a propósito. Se probó a recargar también
          // aquí, pensando en la lista vieja de la carrera entre dos
          // administradores, y el aviso no llegaba a leerse: en esa carrera
          // quien recibe el rechazo es justo la cuenta que la otra sesión
          // retiró —nadie puede retirarse a sí mismo, y ni la base ni las dos
          // comprobaciones de antes rechazan mientras quien llama siga siendo
          // administrador activo, porque las tres lo cuentan—. La recarga
          // vuelve a pintar `usuarios/page.tsx`, `exigirPanel('admin')` lo manda
          // al inicio y esta tabla se desmonta con la explicación dentro. Sin
          // recarga, el mensaje se queda y la siguiente navegación ya redirige.
          // Por lo mismo ese mensaje no le pide recargar (`CIERRE_SIN_ACCESO`,
          // en `acciones/admin.ts`). Para los
          // demás rechazos no se pierde nada: el valor optimista se descarta
          // solo al acabar la transición, y el mensaje que habla de una lista
          // vieja pide él mismo recargarla.
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo completar la acción.' })
        }
      } catch {
        setAviso({ tipo: 'error', texto: FALLO_DE_TRANSPORTE })
      } finally {
        setFilaEnCurso(null)
      }
    })
  }

  const pedirEnlace = (u: UsuarioDelPanel) => {
    setAviso(null)
    iniciar(async () => {
      setFilaEnCurso(u.id)
      try {
        const resultado = await generarEnlaceDeClave(u.id)
        if (!resultado.exito || !resultado.datos) {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo generar el enlace.' })
          return
        }
        // Con correo configurado y `enviadoPorCorreo` en falso, el envío falló:
        // el servidor ya lo anotó, y aquí lo que importa es que el administrador
        // no lea «no hay servidor de correo» —que lo mandaría a revisar una
        // variable que está bien puesta— sino que el mensaje no salió y que el
        // enlace de abajo sí vale.
        setAviso({
          tipo: 'info',
          texto: resultado.datos.enviadoPorCorreo
            ? `Se envió un enlace a ${u.email}. Caduca en una hora y sirve una sola vez.`
            : hayCorreo
              ? `El correo a ${u.email} no se pudo enviar: entréguele este enlace a mano. Caduca en una hora y sirve una sola vez.`
              : `No hay servidor de correo configurado: entregue este enlace a ${u.email}. Caduca en una hora y sirve una sola vez.`,
          enlace: resultado.datos.enlace,
        })
      } catch {
        // Sin esto, el fallo de transporte tumbaba la página y el testigo ya
        // emitido quedaba sin enseñar: cada nueva pulsación invalida el
        // anterior, así que el administrador acababa copiando un enlace muerto.
        setAviso({ tipo: 'error', texto: FALLO_DE_TRANSPORTE })
      } finally {
        setFilaEnCurso(null)
      }
    })
  }

  /** El error que hay que enseñar dentro del modal abierto, si lo hay. */
  const errorDelModal = aviso?.tipo === 'error' ? aviso.texto : null

  /**
   * El aviso se trae a la vista cuando es lo único que cuenta qué pasó.
   *
   * La región vive encima de los filtros, y con la tabla larga quien pulsa
   * «Desactivar» en la fila treinta la tiene fuera de la pantalla. Un éxito se
   * ve igual en la propia fila —cambia la insignia, cambia el rol—, pero un
   * rechazo no cambia nada: la fila se queda como estaba y, sin ver el mensaje,
   * lo que se deduce es que el clic no entró y se vuelve a pulsar. Con el
   * rechazo del último administrador eso es pedir dos veces lo que la base ya
   * dijo que no, y con «Clave» es peor, porque cada pulsación invalida el enlace
   * anterior. Por eso se desplaza para `error` e `info` y no para `ok`: mover
   * la página tras cada activación haría perder el sitio a quien activa diez
   * cuentas seguidas.
   *
   * Con un modal abierto no se toca nada: el error ya se pinta dentro de él.
   * Y se desplaza sin mover el foco, que sigue en el botón de la fila por los
   * mismos motivos por los que esos botones no se desactivan.
   *
   * Si hay modal se lee de una referencia y no se pone en las dependencias,
   * para que lo único que dispare el desplazamiento sea un aviso nuevo. Con el
   * modal entre las dependencias, cerrar con «Cancelar» un modal que había
   * dado error volvía a disparar el efecto con ese error viejo y la página
   * saltaba arriba sin que acabara de pasar nada. La referencia se pone al día
   * en un efecto propio, declarado antes, que React corre primero.
   */
  const regionDeAvisos = useRef<HTMLDivElement>(null)
  const hayModalAbierto = useRef(false)
  useEffect(() => {
    hayModalAbierto.current = creando || editando !== null || permisos !== null
  })
  useEffect(() => {
    if (!aviso || aviso.tipo === 'ok' || hayModalAbierto.current) return
    regionDeAvisos.current?.scrollIntoView({ block: 'nearest' })
  }, [aviso])

  // Las tarjetas llegan en su propia lista, leída con su propia consulta, y no
  // salen de `visibles`: no obedecen a la búsqueda ni a los filtros de la
  // tabla, que están debajo. Escribir un nombre para buscar a otra persona no
  // puede esconder la solicitud que espera arriba.
  //
  // Los totales suman lo que no se leyó. Contando solo las filas recibidas, la
  // cabecera decía menos de lo que hay justo cuando más importa —con la base por
  // encima del tope—, y no coincidía con el número de la barra, que cuenta sin
  // tope.
  const totalDeSolicitudes = solicitudes.length + sinMostrar.solicitudes
  const totalDeCuentas = usuarios.length + sinMostrar.cuentas + sinMostrar.solicitudes

  /**
   * Lo que se dice al activar una solicitud, desde su tarjeta o desde su fila.
   *
   * Recuerda «Permisos» porque la cuenta nace viendo los cinco módulos —la
   * lista vacía significa «todos»— y el momento de restringirla es este: una
   * semana después ya ha leído lo que no le tocaba.
   */
  const avisoDeActivacion = (
    email: string,
    avisoPorCorreo: boolean | undefined,
  ): NonNullable<Aviso> => ({
    tipo: 'ok',
    texto: `${email} ya puede entrar${
      avisoPorCorreo ? ' y se le avisó por correo' : ''
    }. Si solo debe ver algunos módulos, ajústelos en «Permisos».`,
  })

  /** Quita los tres filtros de una vez, desde el estado vacío de la tabla. */
  const quitarFiltros = () => {
    setBusqueda('')
    setFiltroRol('todos')
    setFiltroEstado('todos')
  }

  const hayFiltros = busqueda !== '' || filtroRol !== 'todos' || filtroEstado !== 'todos'

  return (
    <div>
      <CabeceraDePagina
        titulo="Usuarios y roles"
        subtitulo={
          <>
            {totalDeCuentas} cuenta{totalDeCuentas === 1 ? '' : 's'} ·{' '}
            {usuarios.filter((u) => u.activo).length} con acceso
            {sinMostrar.cuentas > 0 ? ' entre las mostradas' : ''}
            {totalDeSolicitudes > 0
              ? ` · ${totalDeSolicitudes} solicitud${totalDeSolicitudes === 1 ? '' : 'es'} por revisar`
              : ''}
            . Una cuenta sin activar no ve nada de la plataforma.
          </>
        }
        acciones={
          <button className="admin-btn admin-btn-primary" onClick={() => setCreando(true)}>
            <UserPlus aria-hidden size={16} />
            Nueva cuenta
          </button>
        }
      />

      {/*
        La región viva se queda montada aunque no haya nada que decir. Un
        `role="status"` que aparece con el mensaje no se anuncia de forma
        fiable: el lector de pantalla tiene que estar observando la región antes
        de que su contenido cambie. Vacía no ocupa sitio, porque el borde y el
        margen los pone `.admin-aviso`, que sí es condicional. Sin esto, pulsar
        «Clave» no anunciaba nada y se volvía a pulsar, invalidando el testigo
        recién emitido. Los éxitos sin nada que guardar ya no pasan por aquí,
        sino por los avisos flotantes (`mostrar`).
      */}
      <div role="status" ref={regionDeAvisos}>
        {aviso ? (
          <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>
            {aviso.texto}
            {aviso.enlace ? (
              <div className="admin-copiable">
                <input
                  readOnly
                  aria-label="Enlace de restablecimiento"
                  value={aviso.enlace}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  className="admin-btn admin-btn-sm admin-btn-secondary"
                  onClick={() => {
                    navigator.clipboard?.writeText(aviso.enlace!)
                    avisar('info', 'Enlace copiado.')
                  }}
                >
                  <Copy aria-hidden size={14} />
                  Copiar
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Con las dos secciones en pantalla, el atajo de plegarlas a la vez; con
          una sola no tiene a qué aplicarse. */}
      {solicitudes.length > 0 ? <PlegarTodo /> : null}

      <SolicitudesPendientes
        solicitudes={solicitudes}
        sinMostrar={sinMostrar.solicitudes}
        filaEnCurso={filaEnCurso}
        hayCorreo={hayCorreo}
        onActivar={(s, rol) =>
          ejecutar(
            () => resolverSolicitud(s.id, 'activar', rol),
            (datos) => avisoDeActivacion(s.email, datos?.avisoPorCorreo),
            { fila: s.id },
          )
        }
        onRechazar={(s) =>
          ejecutar(
            () => resolverSolicitud(s.id, 'rechazar'),
            (datos) => ({
              tipo: 'ok',
              texto: `Se rechazó la solicitud de ${s.email} y se borraron sus datos.${
                datos?.avisoPorCorreo ? ' Se le avisó por correo.' : ''
              }`,
            }),
            { fila: s.id },
          )
        }
      />

      <SeccionPlegable
        clave="usuarios.cuentas"
        titulo="Cuentas"
        resumen={`${visibles.length} de ${usuarios.length}`}
      >
        <div className="admin-filters">
          <div className="admin-filter-group">
            <label className="admin-filter-label" htmlFor="buscar-usuario">
              Buscar
            </label>
            <input
              id="buscar-usuario"
              className="admin-input usuarios-buscar"
              type="search"
              placeholder="Nombre, correo, institución o nota"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="admin-filter-group">
            <label className="admin-filter-label" htmlFor="filtro-rol">
              Rol
            </label>
            <select
              id="filtro-rol"
              className="admin-select"
              value={filtroRol}
              onChange={(e) => setFiltroRol(e.target.value)}
            >
              <option value="todos">Todos los roles</option>
              <option value="admin">Administradores</option>
              <option value="editor">Editores</option>
              <option value="lector">Lectores</option>
            </select>
          </div>
          <div className="admin-filter-group">
            <label className="admin-filter-label" htmlFor="filtro-estado">
              Estado
            </label>
            <select
              id="filtro-estado"
              className="admin-select"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="activos">Con acceso</option>
              <option value="inactivos">Sin activar</option>
              <option value="solicitudes">Solicitudes</option>
            </select>
          </div>
          <span className="admin-filter-count u-num">
            {visibles.length} de {usuarios.length}
          </span>
        </div>

        {/*
          Fuera de la región de avisos, que es para el resultado de lo que se
          acaba de pulsar: esto es el estado de la lista y está desde que se abre
          la página. La búsqueda de arriba filtra en el navegador, así que no
          alcanza a lo que no se leyó, y hay que decirlo; si no, «Ninguna cuenta
          coincide» se lee como que la cuenta no existe.
        */}
        {sinMostrar.cuentas > 0 ? (
          <div className="admin-aviso admin-aviso-atencion">
            La tabla enseña las primeras {usuarios.length - solicitudes.length} cuentas por orden de
            correo; hay {sinMostrar.cuentas} más que no caben en esta pantalla y que la búsqueda no
            encuentra.
          </div>
        ) : null}

        {visibles.length === 0 ? (
          <Vacio
            icono={SearchX}
            titulo="Ninguna cuenta coincide con el filtro"
            compacto
            accion={
              hayFiltros ? (
                <button className="admin-btn admin-btn-secondary" onClick={quitarFiltros}>
                  Quitar los filtros
                </button>
              ) : null
            }
          />
        ) : (
          <div className="admin-table-container">
            {/* En el teléfono cada fila se vuelve tarjeta (`.tabla-apilable`):
                seis columnas y un desplegable no caben en 390 px, y desplazar
                de lado para llegar a las acciones escondía la mitad de la
                cuenta que se estaba tocando. */}
            <table className="admin-table tabla-apilable">
              <thead>
                <tr>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Último acceso</th>
                  <th scope="col">Alta</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((u) => {
                  const esUnoMismo = u.id === idPropio
                  const ocupada = filaEnCurso === u.id
                  return (
                    <tr key={u.id} className={ocupada ? 'usuarios-fila-ocupada' : undefined}>
                      {/* La celda que nombra la fila es un `th`: ata el
                          «Editar» y el menú de cada fila a la cuenta que tocan. */}
                      <th scope="row">
                        <div className="admin-table-user-name usuarios-nombre">
                          {u.nombre || '—'}
                          {esUnoMismo ? <span className={claseDeInsignia('neutra')}>usted</span> : null}
                        </div>
                        <div className="admin-table-user-email">{u.email}</div>
                        {u.institucion ? (
                          <div className="admin-table-user-email">{u.institucion}</div>
                        ) : null}
                        {/*
                          La nota se resume en la fila y se lee entera en el modal
                          de editar. Aquí importa que se **vea que existe**: una
                          nota que solo aparece al abrir un modal no se abre nunca,
                          y el dato que guarda —por qué se desactivó esta cuenta—
                          se consulta justo mirando la lista, antes de reactivar a
                          nadie. `.admin-table-text` acota el ancho y pone los
                          puntos suspensivos de CSS, que es lo que se ve; el
                          recorte de `resumirNota` no ahorra peso —la nota entera
                          viaja igual, en el `title` de aquí al lado y en las
                          props que necesita el modal— sino lectura: sin él, el
                          nodo de texto conserva los dos mil caracteres que CSS
                          solo esconde, y un lector de pantalla los recita
                          enteros en cada una de las quinientas filas.
                        */}
                        {u.notas ? (
                          <div className="admin-table-user-email admin-table-text" title={u.notas}>
                            Nota: {resumirNota(u.notas)}
                          </div>
                        ) : null}
                      </th>
                      <td data-etiqueta="Rol">
                        {/*
                          Mientras la fila trabaja, este desplegable lleva
                          `aria-disabled` y no `disabled`, por la misma razón que
                          los botones de la última columna —ver el comentario de
                          ahí— y con más motivo: es el único control de la fila
                          que con seguridad tiene el foco en el instante en que su
                          acción arranca, porque el `onChange` lo dispara él
                          mismo. Desactivándolo de verdad, el navegador le quitaba
                          el foco y lo soltaba en `<body>`, y la siguiente
                          tabulación volvía a empezar por el principio del
                          documento. Tampoco hace falta apagarlo para que se vea
                          el rol recién elegido: de eso se encarga el valor
                          optimista.
                        */}
                        <select
                          className="admin-select usuarios-rol"
                          value={u.rol}
                          disabled={esUnoMismo}
                          aria-disabled={ocupada}
                          aria-label={`Rol de ${u.email}`}
                          title={
                            esUnoMismo ? 'No puede cambiarse el rol a sí mismo.' : 'Cambiar el rol'
                          }
                          onChange={(e) => {
                            if (ocupada) return
                            const rol = e.target.value as UsuarioDelPanel['rol']
                            ejecutar(
                              () => actualizarUsuario(u.id, { rol }),
                              `${u.email} ahora es ${ETIQUETA_ROL[rol].toLowerCase()}.`,
                              { fila: u.id, alEnviar: () => ponerRolOptimista({ id: u.id, rol }) },
                            )
                          }}
                        >
                          <option value="admin">Administrador</option>
                          <option value="editor">Editor</option>
                          <option value="lector">Lector</option>
                        </select>
                      </td>
                      <td data-etiqueta="Estado">
                        {/*
                          Una solicitud lleva su propia insignia, ámbar como los
                          demás «por atender» del panel, y no «Sin activar»: con
                          la etiqueta de las bajas, quien buscaba a quién
                          reactivar encontraba personas que no han entrado nunca,
                          y quien buscaba solicitudes no las distinguía. El icono
                          va con el texto para que el estado no dependa del color.
                        */}
                        {u.pendiente ? (
                          <span className={claseDeInsignia('atencion')}>
                            <Hourglass aria-hidden size={12} />
                            Solicitud
                          </span>
                        ) : u.activo ? (
                          <span className={claseDeInsignia('ok')}>
                            <CheckCircle2 aria-hidden size={12} />
                            Con acceso
                          </span>
                        ) : (
                          <span className={claseDeInsignia('neutra')}>
                            <CircleSlash aria-hidden size={12} />
                            Sin activar
                          </span>
                        )}
                      </td>
                      <td data-etiqueta="Último acceso" className="u-nowrap">
                        {fecha(u.ultimoAcceso)}
                      </td>
                      <td data-etiqueta="Alta" className="u-nowrap">
                        {fecha(u.creado)}
                      </td>
                      <td className="admin-table-acciones">
                        {/*
                          Mientras la fila trabaja, sus controles llevan
                          `aria-disabled` y no `disabled`: un elemento que se
                          desactiva teniendo el foco lo devuelve a `<body>`, y
                          quien navega con teclado tenía que tabular otra vez
                          desde los filtros y por todas las filas anteriores. El
                          `disabled` de verdad se reserva para lo que no depende
                          del momento —no puede uno desactivarse ni eliminarse a
                          sí mismo—, que en el menú es `desactivada`. Lo que
                          frena la segunda pulsación es el `if (ocupada) return`
                          de cada manejador; el aviso visual, la opacidad de
                          `.usuarios-fila-ocupada`.

                          Fuera queda «Editar», lo que más se hace con una cuenta;
                          lo demás va al menú «⋯». Eran cinco botones por fila, y
                          en un portátil la columna de acciones se comía media
                          tabla.
                        */}
                        <div className="admin-table-acciones-fila" aria-busy={ocupada}>
                          <button
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            aria-disabled={ocupada}
                            aria-label={`Editar la cuenta de ${u.email}`}
                            onClick={() => {
                              if (ocupada) return
                              setEditando(u)
                            }}
                          >
                            <Pencil aria-hidden size={14} />
                            Editar
                          </button>
                          <MenuAcciones
                            etiqueta={`Más acciones para ${u.email}`}
                            opciones={[
                              {
                                etiqueta: 'Permisos por módulo',
                                icono: ShieldCheck,
                                alElegir: () => {
                                  if (ocupada) return
                                  setPermisos(u)
                                },
                              },
                              {
                                /*
                                  Apagada de verdad en una solicitud, porque no
                                  depende del momento sino de lo que la cuenta
                                  es. Con ella encendida, a alguien que nadie ha
                                  revisado le llegaba «alguien pidió una
                                  contraseña nueva para su cuenta», y aquí se
                                  leía «se envió un enlace», cuando el enlace
                                  contesta que la cuenta no está activada:
                                  `fijarClaveNueva` pasa por el mismo
                                  `beforeLogin` que la entrada.
                                  `generarEnlaceDeClave` lo rechaza también, para
                                  quien llame a la acción sin pasar por aquí. El
                                  motivo, que antes iba en el `title` del botón,
                                  va ahora en el propio rótulo: una opción de
                                  menú apagada no enseña su `title`.
                                */
                                etiqueta: u.pendiente
                                  ? 'Enlace de contraseña (antes, actívela)'
                                  : hayCorreo
                                    ? 'Enviar enlace de contraseña'
                                    : 'Generar enlace de contraseña',
                                icono: KeyRound,
                                desactivada: u.pendiente,
                                alElegir: () => {
                                  if (ocupada) return
                                  pedirEnlace(u)
                                },
                              },
                              {
                                etiqueta:
                                  esUnoMismo && u.activo
                                    ? 'Desactivar (es su cuenta)'
                                    : u.activo
                                      ? 'Retirar el acceso'
                                      : 'Dar acceso',
                                icono: u.activo ? UserX : UserCheck,
                                desactivada: esUnoMismo && u.activo,
                                alElegir: () => {
                                  if (ocupada) return
                                  // Activar una solicitud desde su fila la
                                  // resuelve igual que desde su tarjeta, con el
                                  // rol que ya tiene: `cambiarActivoUsuario` le
                                  // quita la marca y la avisa. Por eso el
                                  // mensaje es el mismo.
                                  ejecutar(
                                    () => cambiarActivoUsuario(u.id, !u.activo),
                                    u.activo
                                      ? `Se retiró el acceso a ${u.email}.`
                                      : u.pendiente
                                        ? avisoDeActivacion(u.email, hayCorreo).texto
                                        : `${u.email} ya puede entrar.`,
                                    { fila: u.id },
                                  )
                                },
                              },
                              {
                                etiqueta: esUnoMismo ? 'Eliminar (es su cuenta)' : 'Eliminar la cuenta',
                                icono: Trash2,
                                peligro: true,
                                desactivada: esUnoMismo,
                                alElegir: async () => {
                                  if (ocupada) return
                                  const seguro = await confirmar({
                                    titulo: `¿Eliminar la cuenta de ${u.email}?`,
                                    mensaje:
                                      'Se pierde su historial de lectura y sus comentarios quedan sin autor. Si solo quiere retirarle el acceso, desactívela.',
                                    confirmar: 'Eliminar la cuenta',
                                    peligro: true,
                                  })
                                  if (!seguro) return
                                  ejecutar(
                                    () => eliminarUsuario(u.id),
                                    `Se eliminó la cuenta de ${u.email}.`,
                                    { fila: u.id },
                                  )
                                },
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SeccionPlegable>

      {creando ? (
        <ModalNuevaCuenta
          enCurso={enCurso}
          error={errorDelModal}
          puedeInvitar={hayCorreo && hayDireccion}
          onCerrar={() => setCreando(false)}
          onCrear={(datos) =>
            ejecutar(
              () =>
                crearUsuario(
                  datos.email,
                  datos.nombre,
                  // Con invitación la contraseña no viaja: el servidor pone una
                  // que no conoce nadie, y mandar la sugerida sería dejar en
                  // la petición una clave que no se va a usar.
                  datos.invitar ? '' : datos.contrasena,
                  datos.rol,
                  datos.institucion,
                  datos.activo,
                  datos.notas,
                  datos.invitar,
                ),
              datos.invitar
                ? (resultado) => avisoDeInvitacion(datos.email, datos.activo, resultado?.invitacion)
                : // `info` y no `ok`: la contraseña inicial se enseña una sola
                  // vez, y un aviso flotante se la llevaría a los cinco
                  // segundos. En la página se queda hasta la siguiente acción.
                  () => ({
                    tipo: 'info',
                    texto: `Cuenta creada para ${datos.email}. Contraseña inicial: ${datos.contrasena} — entréguela y pida que la cambie.`,
                  }),
              { alLograrlo: () => setCreando(false) },
            )
          }
        />
      ) : null}

      {permisos ? (
        <ModalPermisos
          usuario={permisos}
          enCurso={enCurso}
          error={errorDelModal}
          onCerrar={() => setPermisos(null)}
          onGuardar={(datos) =>
            ejecutar(() => actualizarUsuario(permisos.id, datos), 'Permisos actualizados.', {
              alLograrlo: () => setPermisos(null),
            })
          }
        />
      ) : null}

      {editando ? (
        <ModalEditar
          usuario={editando}
          enCurso={enCurso}
          error={errorDelModal}
          onCerrar={() => setEditando(null)}
          onGuardar={(datos) =>
            ejecutar(() => actualizarUsuario(editando.id, datos), 'Cuenta actualizada.', {
              alLograrlo: () => setEditando(null),
            })
          }
        />
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------ modales

/*
 * Los tres modales de esta pantalla usan el `Modal` compartido
 * (`src/components/ui/Modal.tsx`), que nació aquí como `EnvolturaModal`: el
 * único diálogo de verdad del panel cuando el resto preguntaba con
 * `confirm()`. Se subió entero —foco dentro al abrir y de vuelta al cerrar,
 * Tab que no escapa de lo que `aria-modal` promete, `:disabled` para las
 * casillas de un `fieldset` apagado— y la copia de aquí se borró: dos
 * envolturas iguales acaban divergiendo, y la de aquí era la que tenía los
 * arreglos. La caja vive en `ui.css`, con su alto máximo: el modal de permisos
 * de esta pantalla es el que manda sobre esos valores —mide unos 675 px y no
 * cabe en un portátil 1080p con el escalado de Windows al 125 %—, así que
 * quien los cambie tiene que abrirlo.
 *
 * El motivo de un rechazo se pinta dentro del modal (`error`) y no solo en
 * el aviso de la página: el modal sobrevive al error, y el aviso de arriba
 * queda detrás del velo, donde no se ve.
 */

/**
 * Alta de una cuenta, con las dos maneras de que la persona entre.
 *
 * Invitar por correo va primero y marcada cuando se puede, porque es la que no
 * deja una contraseña escrita en ningún sitio: ni en el aviso verde de la
 * pantalla, ni en el mensaje de WhatsApp con que se entregaba, ni en la memoria
 * de quien la dictó por teléfono. La otra se queda, y no escondida: es la única
 * que funciona sin servidor de correo, y la que sirve cuando la persona está
 * delante y no tiene su correo del hospital a mano.
 *
 * Cuando la invitación no se puede ofrecer, la opción se ve apagada con el
 * motivo, en vez de desaparecer. Desaparecida, nadie sabe que existe ni qué
 * falta configurar para tenerla.
 */
function ModalNuevaCuenta({
  enCurso,
  error,
  puedeInvitar,
  onCerrar,
  onCrear,
}: {
  enCurso: boolean
  error?: string | null
  puedeInvitar: boolean
  onCerrar: () => void
  onCrear: (datos: {
    email: string
    nombre: string
    contrasena: string
    rol: string
    institucion: string
    activo: boolean
    notas: string
    invitar: boolean
  }) => void
}) {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [institucion, setInstitucion] = useState('')
  const [contrasena, setContrasena] = useState(claveSugerida)
  const [rol, setRol] = useState('lector')
  const [activo, setActivo] = useState(true)
  const [notas, setNotas] = useState('')
  const [invitar, setInvitar] = useState(puedeInvitar)

  return (
    <Modal titulo="Nueva cuenta" error={error} onCerrar={onCerrar} ancho="ancho">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          // `invitar && puedeInvitar` y no `invitar` a secas: el estado se toma
          // de la prop al abrir y no la sigue. Si la tabla se recarga con el
          // modal abierto —otra acción de la pantalla hace `router.refresh()`—
          // y la invitación ya no está disponible, lo que se ve marcado es la
          // contraseña, y es eso lo que tiene que viajar.
          onCrear({
            email,
            nombre,
            contrasena,
            rol,
            institucion,
            activo,
            notas,
            invitar: invitar && puedeInvitar,
          })
        }}
      >
        <div className="admin-form-fila">
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="nuevo-nombre">
              Nombre y apellido
            </label>
            <input
              id="nuevo-nombre"
              className="admin-form-input"
              data-foco-inicial
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="nuevo-email">
              Correo
            </label>
            <input
              id="nuevo-email"
              type="email"
              className="admin-form-input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor="nueva-institucion">
            Institución o servicio
          </label>
          <input
            id="nueva-institucion"
            className="admin-form-input"
            value={institucion}
            onChange={(e) => setInstitucion(e.target.value)}
          />
        </div>

        <fieldset className="alta-opciones">
          <legend className="admin-form-label">Cómo entra esta persona</legend>
          <label className="alta-opcion">
            <input
              type="radio"
              name="nueva-forma-de-entrar"
              checked={invitar && puedeInvitar}
              disabled={!puedeInvitar}
              onChange={() => setInvitar(true)}
            />
            <span>
              Enviarle un correo para que elija su contraseña
              <small>
                {puedeInvitar
                  ? `Recibe un enlace de un solo uso que caduca en ${HORAS_DE_INVITACION} horas. Nadie más conoce su contraseña.`
                  : 'No disponible: hace falta configurar el servidor de correo (SMTP_HOST) y la dirección pública de la plataforma (NEXT_PUBLIC_SERVER_URL).'}
              </small>
            </span>
          </label>
          <label className="alta-opcion">
            <input
              type="radio"
              name="nueva-forma-de-entrar"
              checked={!(invitar && puedeInvitar)}
              onChange={() => setInvitar(false)}
            />
            <span>
              Ponerle yo una contraseña y entregársela
              <small>Para cuando no hay correo, o la persona está delante.</small>
            </span>
          </label>
        </fieldset>

        {/*
          El campo se quita del formulario, no solo se esconde, cuando se
          invita: lleva `required` y `minLength`, y un campo oculto que el
          navegador valida igual frena el envío con un globo de error apuntando
          a algo que no se ve.
        */}
        {invitar && puedeInvitar ? null : (
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="nueva-clave">
              Contraseña inicial
            </label>
            <div className="alta-clave">
              <input
                id="nueva-clave"
                className="admin-form-input"
                required
                minLength={12}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
              />
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => setContrasena(claveSugerida())}
              >
                <RefreshCw aria-hidden size={14} />
                Generar
              </button>
            </div>
            <p className="admin-form-hint">
              Mínimo 12 caracteres. Se muestra una sola vez: cópiela antes de guardar y pida que la
              cambie con el botón «Clave».
            </p>
          </div>
        )}

        <div className="admin-form-fila">
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="nuevo-rol">
              Rol
            </label>
            <select
              id="nuevo-rol"
              className="admin-form-input"
              value={rol}
              onChange={(e) => setRol(e.target.value)}
            >
              <option value="lector">Lector — solo lee lo publicado</option>
              <option value="editor">Editor — redacta y publica contenido</option>
              <option value="admin">Administrador — además gestiona cuentas</option>
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="nuevo-activo">
              Acceso
            </label>
            <label htmlFor="nuevo-activo" className="alta-casilla">
              <input
                id="nuevo-activo"
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
              />
              <span>Activar de inmediato</span>
            </label>
            {/* Se avisa antes de crear y no solo después: elegir contraseña
                pasa por la misma cerradura que entrar, y la invitación a una
                cuenta sin activar llega con un enlace que contesta «su cuenta
                todavía no está activada». */}
            {invitar && puedeInvitar && !activo ? (
              <p className="admin-form-hint">
                Sin activar, el enlace del correo no le servirá hasta que usted active la cuenta.
              </p>
            ) : null}
          </div>
        </div>

        {/*
          La nota se pide ya al crear porque el dato que el campo existe para
          guardar —quién pidió esta cuenta— se sabe ahora y se olvida en una
          semana. Va después del rol y del acceso, al final del formulario, para
          no meter un párrafo entre los campos que sí son obligatorios.
        */}
        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor="nueva-nota">
            Notas internas
          </label>
          <textarea
            id="nueva-nota"
            className="admin-form-input"
            rows={3}
            maxLength={LARGO_MAXIMO_NOTA}
            data-redimensionable="vertical"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
          <p className="admin-form-hint">
            Opcional y solo para administradores: quién pidió la cuenta, con qué autorización. La
            persona titular no las ve.
          </p>
        </div>

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={enCurso}>
            {enCurso ? 'Creando…' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ModalEditar({
  usuario,
  enCurso,
  error,
  onCerrar,
  onGuardar,
}: {
  usuario: UsuarioDelPanel
  enCurso: boolean
  error?: string | null
  onCerrar: () => void
  onGuardar: (datos: {
    nombre: string
    email: string
    institucion: string
    notas?: string
  }) => void
}) {
  const [nombre, setNombre] = useState(usuario.nombre)
  const [email, setEmail] = useState(usuario.email)
  const [institucion, setInstitucion] = useState(usuario.institucion)
  const notaOriginal = usuario.notas
  const [notas, setNotas] = useState(notaOriginal)

  return (
    <Modal titulo="Editar cuenta" error={error} onCerrar={onCerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          // La nota solo se manda si se tocó, y es el único campo del formulario
          // con ese trato. El motivo es la concurrencia entre administradores:
          // este modal se abre con la nota tal como estaba al abrirlo y puede
          // quedarse abierto media hora. Mandándola siempre, quien solo venía a
          // corregir un correo reescribiría además la nota con la copia vieja
          // que tiene delante, borrando sin decir nada lo que otro administrador
          // escribió entretanto desde su propia pestaña. `actualizarUsuario`
          // ignora el campo que no viene, así que omitirla es exactamente «no
          // tocar», y solo se pisa lo que se pisó a propósito.
          onGuardar({ nombre, email, institucion, ...(notas === notaOriginal ? {} : { notas }) })
        }}
      >
        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor="editar-nombre">
            Nombre y apellido
          </label>
          <input
            id="editar-nombre"
            className="admin-form-input"
            data-foco-inicial
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor="editar-email">
            Correo
          </label>
          <input
            id="editar-email"
            type="email"
            className="admin-form-input"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="admin-form-hint">
            Cambiar el correo cambia también el usuario con el que esta persona inicia sesión.
          </p>
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor="editar-institucion">
            Institución o servicio
          </label>
          <input
            id="editar-institucion"
            className="admin-form-input"
            value={institucion}
            onChange={(e) => setInstitucion(e.target.value)}
          />
        </div>
        {/*
          El cuadro solo se estira en vertical: `resize` vale `both` por omisión
          y, arrastrando a lo ancho, el textarea se sale de la caja del modal.
          Lo dice `[data-redimensionable]` en `solicitudes.css`, y no un
          `style` en línea, que eran dos copias de la misma regla.
          `.admin-form-input` sirve igual para un `textarea` —es la clase de los
          tres formularios de cuentas y declara color además de fondo, que es lo
          que lo salva en modo oscuro—.
        */}
        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor="editar-notas">
            Notas internas
          </label>
          <textarea
            id="editar-notas"
            className="admin-form-input"
            rows={4}
            maxLength={LARGO_MAXIMO_NOTA}
            data-redimensionable="vertical"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
          <p className="admin-form-hint">
            Solo las ve un administrador, aquí y en la lista de cuentas. Quién pidió la cuenta, por
            qué se desactivó. La persona titular no las ve nunca.
          </p>
        </div>
        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={enCurso}>
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Permisos por módulo de una cuenta.
 *
 * Dos listas y una regla que hay que dejar dicha en la propia pantalla: no
 * marcar nada significa «todos», no «ninguno». Es la interpretación que evita
 * el error más probable —crear una cuenta, olvidar los módulos y que la persona
 * no vea nada sin que se entienda por qué—, pero solo funciona si quien
 * administra lo sabe al mirar.
 */
function ModalPermisos({
  usuario,
  enCurso,
  error,
  onCerrar,
  onGuardar,
}: {
  usuario: UsuarioDelPanel
  enCurso: boolean
  error?: string | null
  onCerrar: () => void
  onGuardar: (datos: { modulosVisibles: string[]; modulosEditables: string[] }) => void
}) {
  const [visibles, setVisibles] = useState<string[]>(usuario.modulosVisibles)
  const [editables, setEditables] = useState<string[]>(usuario.modulosEditables)

  const alternar = (lista: string[], slug: string): string[] =>
    lista.includes(slug) ? lista.filter((s) => s !== slug) : [...lista, slug]

  const esAdmin = usuario.rol === 'admin'
  const esLector = usuario.rol === 'lector'

  return (
    <Modal
      titulo={`Permisos de ${usuario.nombre || usuario.email}`}
      error={error}
      onCerrar={onCerrar}
    >
      {esAdmin ? (
        <div className="admin-aviso admin-aviso-info">
          Es administrador: ve y edita los cinco módulos siempre. Estos permisos no le afectan.
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onGuardar({ modulosVisibles: visibles, modulosEditables: editables })
        }}
      >
        <fieldset className="permisos-grupo" disabled={esAdmin}>
          <legend>Módulos que puede ver</legend>
          <p className="admin-form-hint">
            {visibles.length === 0
              ? 'Sin marcar ninguno: ve los cinco. Marque solo para restringir.'
              : `Ve únicamente ${visibles.length} de 5 módulos.`}
          </p>
          {MODULOS.map((m) => (
            <label key={m.slug} className="permisos-casilla">
              <input
                type="checkbox"
                checked={visibles.includes(m.slug)}
                onChange={() => setVisibles(alternar(visibles, m.slug))}
              />
              <span>{m.nombre}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="permisos-grupo" disabled={esAdmin || esLector}>
          <legend>Módulos que puede editar</legend>
          <p className="admin-form-hint">
            {esLector
              ? 'Un lector no escribe contenido: cambie el rol a editor para asignar módulos.'
              : editables.length === 0
                ? 'Sin marcar ninguno: edita los cinco.'
                : `Edita únicamente ${editables.length} de 5 módulos.`}
          </p>
          {MODULOS.map((m) => (
            <label key={m.slug} className="permisos-casilla">
              <input
                type="checkbox"
                checked={editables.includes(m.slug)}
                onChange={() => setEditables(alternar(editables, m.slug))}
              />
              <span>{m.nombre}</span>
            </label>
          ))}
        </fieldset>

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            disabled={enCurso || esAdmin}
          >
            Guardar permisos
          </button>
        </div>
      </form>
    </Modal>
  )
}
