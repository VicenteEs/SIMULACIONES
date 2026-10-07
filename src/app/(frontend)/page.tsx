import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { InsigniaMantencion } from '@/components/ui/InsigniaMantencion'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { CuerpoDePortada } from '@/components/CuerpoDePortada'
import { MallaDeNodos } from '@/components/MallaDeNodos'
import { ruta } from '@/lib/rutas'
import { recorridoGuardado, type RecorridoGuardado } from '@/lib/progresoDelSimulador'
// `modulos.ts` no importa Payload a propósito (lo explica su cabecera), así que
// la portada puede tomar el mapa de nombres sin arrastrar el servidor.
import { NOMBRE_DE_MODULO, rutaPublica } from '@/app/(frontend)/admin-panel/modulos'
import { IDENTIDAD_DE_MODULO } from '@/components/ui/modulos'
import { TarjetaFicha } from '@/components/TarjetaFicha'
import { MODULOS_ANUNCIADOS, ROTULO_PROXIMAMENTE } from '@/lib/modulosAnunciados'
import { ArrowRight, BookOpen, Clock3, Library, PenLine, ScanLine, UserPlus, Hourglass } from 'lucide-react'

export const dynamic = 'force-dynamic'

const MODULOS = [
  {
    numero: '01',
    ruta: '/biblioteca',
    coleccion: 'patologias' as const,
    titulo: 'Biblioteca de patologías',
    descripcion:
      'Fichas por segmento con clasificaciones, criterios de decisión y una pestaña completa de rehabilitación.',
    publico: ['Residentes', 'Traumatología'],
  },
  {
    numero: '02',
    ruta: '/examen-fisico',
    coleccion: 'maniobras' as const,
    titulo: 'Examen físico',
    descripcion: 'Maniobras por segmento con técnica, interpretación y video propio.',
    publico: ['Residentes', 'Kinesiología'],
  },
  {
    numero: '03',
    ruta: '/tecnica-ao',
    coleccion: 'casos-ao' as const,
    titulo: 'Técnica AO',
    descripcion: 'El paso a paso quirúrgico con el principio AO que sustenta cada gesto.',
    publico: ['Residentes', 'Traumatología'],
  },
  {
    numero: '04',
    ruta: '/simulador',
    coleccion: 'cirugias' as const,
    // «Simulador quirúrgico» y no «Simula tu cirugía»: era el único de los cinco
    // cuyo título aquí no coincidía con el de la tabla única
    // (`admin-panel/modulos.ts`), y por tanto el único módulo con dos nombres
    // repartidos por la plataforma —esta tarjeta decía uno; el <h1> de
    // `/simulador`, la barra y la insignia de «Continúa leyendo» decían el
    // otro—. Si se vuelve a cambiar aquí, hay que cambiarlo allí: quien pulsa un
    // nombre espera aterrizar en una página que se llame igual.
    titulo: 'Simulador quirúrgico',
    descripcion: 'Instrumental, fuerza aplicada en newtons y registro de complicaciones.',
    publico: ['Residentes', 'Traumatología'],
  },
  {
    numero: '05',
    ruta: '/imagenes',
    coleccion: 'estudios-ia' as const,
    titulo: 'Lectura de imágenes',
    descripcion: 'Clasificación propuesta y opciones de manejo asociadas al trazo.',
    publico: ['Traumatología'],
  },
]

/** Saludo según la hora del servidor. Cuesta nada y la portada deja de ser fría. */
function saludo(): string {
  const hora = new Date().getHours()
  if (hora < 6) return 'Buenas noches'
  if (hora < 13) return 'Buenos días'
  if (hora < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

export default async function Inicio() {
  const { usuario, usuarioEfectivo, activo, rolReal } = await obtenerSesion()

  // Los módulos en mantención (D-156). Quien no ha entrado se trata como un
  // residente: no se le enseñan, ni en la tira ni en el texto que los cuenta.
  const enMantencion = await modulosEnMantencion()

  // ----------------------------------------------------------- sin sesión
  if (!usuario) {
    const publicos = MODULOS.filter((m) => !enMantencion.includes(m.coleccion))
    return (
      <main className="portada-publica">
        <div className="portada-fondo" aria-hidden="true">
          <MallaDeNodos className="portada-malla" />
        </div>

        <section className="portada-hero">
          <img src={ruta('/logo-hd.png')} alt="TraumaHub" className="portada-logo" />

          <h1 className="portada-titular">
            Estudiar, examinar y <em>operar mejor</em>.
          </h1>

          <p className="portada-bajada">
            {publicos.length === MODULOS.length ? 'Cinco módulos' : 'Módulos'} que recorren la cadena
            completa de una decisión clínica: del estudio de la patología a la ejecución en pabellón.
          </p>

          {/* Las dos puertas son el `.boton` de toda la plataforma: la
              principal en el cian de la marca, que es lo que se distingue sobre
              el marino, y la segunda en contorno. «Solicitar acceso» llevaba
              su estilo en línea, con un margen a la izquierda que en el
              teléfono la dejaba descolgada debajo de la otra. */}
          <div className="portada-acciones">
            <Link className="boton boton-lg portada-boton" href="/entrar">
              Entrar a la plataforma
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="boton boton-lg portada-enlace-secundario" href="/registro">
              <UserPlus size={18} aria-hidden="true" />
              Solicitar acceso
            </Link>
          </div>

          <p className="portada-nota">
            El acceso es cerrado: cada solicitud la revisa un administrador antes de activar la
            cuenta.
          </p>
        </section>

        <section
          className="portada-tira"
          aria-label={publicos.length === MODULOS.length ? 'Los cinco módulos' : 'Los módulos'}
        >
          {publicos.map((m) => {
            const Icono = IDENTIDAD_DE_MODULO[m.coleccion]?.icono ?? BookOpen
            return (
              <div key={m.ruta} className="portada-tira-item">
                <span className="portada-tira-icono" aria-hidden="true">
                  <Icono size={18} />
                </span>
                <span>
                  <span className="portada-tira-numero">{m.numero}</span>
                  <br />
                  <span className="portada-tira-nombre">{m.titulo}</span>
                </span>
              </div>
            )
          })}
          {/* Los módulos anunciados (D-163): con su insignia y sin enlace, porque
              su página es para quien tiene cuenta. No cuentan en el texto de
              arriba ni en la lista de la mantención. */}
          {MODULOS_ANUNCIADOS.map((m) => (
            <div key={m.ruta} className="portada-tira-item portada-tira-anunciado">
              <span className="portada-tira-icono" aria-hidden="true">
                <ScanLine size={18} />
              </span>
              <span>
                <span className="portada-tira-numero">{m.numero}</span>
                <br />
                <span className="portada-tira-nombre">{m.nombre}</span>{' '}
                <span className="insignia-proximamente">{ROTULO_PROXIMAMENTE}</span>
              </span>
            </div>
          ))}
        </section>
      </main>
    )
  }

  // -------------------------------------------------- cuenta sin activar
  if (!activo) {
    return (
      <main>
        <div className="estado estado-candado">
          <span className="estado-icono" aria-hidden="true">
            <Hourglass size={34} strokeWidth={1.6} />
          </span>
          <span className="rotulo estado-codigo">Solicitud en revisión</span>
          <h1>Cuenta pendiente de activación</h1>
          <p>
            Su cuenta existe pero un administrador todavía no la ha habilitado. En cuanto lo haga,
            verá el contenido sin necesidad de volver a registrarse.
          </p>
        </div>
      </main>
    )
  }

  // ----------------------------------------------------------- con sesión
  const payload = await getPayload({ config })

  // La rejilla se recorta con el mismo `puedeVerModulo` que recorta la barra
  // superior (`Navegacion.tsx`), y por el mismo motivo: `lecturaDeModulo`
  // devuelve `false` para un módulo que la cuenta no tiene, y ante un `false`
  // Payload no contesta con una lista vacía sino que lanza `Forbidden`.
  //
  // Sin este filtro el módulo vetado costaba dos mentiras seguidas. El
  // `.catch(() => 0)` de abajo convertía ese `Forbidden` en un cero, así que la
  // tarjeta rotulaba «Sin contenido» sobre un módulo que puede estar lleno
  // —y el conteo es la única señal que da la portada sobre dónde hay material,
  // de modo que la daba justo al revés—; y la tarjeta seguía siendo un enlace
  // que al pulsarlo acababa en la pantalla genérica de Next, en inglés y sin
  // barra para volver, porque los listados consultan sin `catch`
  // (`simulador/page.tsx`). Recortada la lista, el `.catch` vuelve a cubrir
  // solo lo que decía cubrir: la tabla que todavía no existe.
  //
  // Se filtra una vez y la misma lista sirve para los conteos y para la
  // rejilla, que es lo que mantiene a `conteos[i]` casando con su tarjeta.
  //
  // También con la lista de mantención: al residente se le quita el módulo
  // apartado y a quien puede editarlo se le deja, con su marca (D-156). Es el
  // mismo recorte que hace la barra, y por lo mismo que los conteos de abajo:
  // contar un módulo que el listado no enseña vuelve a separar las dos pantallas.
  const modulosVisibles = MODULOS.filter((m) =>
    puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, m.coleccion, enMantencion),
  )
  const verBiblioteca = modulosVisibles.some((m) => m.coleccion === 'patologias')
  const verTecnicaAO = modulosVisibles.some((m) => m.coleccion === 'casos-ao')

  // Se cuenta con el control de acceso puesto y con el usuario efectivo, que es
  // exactamente como consulta el listado al que lleva cada tarjeta
  // (`biblioteca/page.tsx`, `simulador/page.tsx`, …). Con `overrideAccess: true`
  // el conteo incluía los borradores —la tabla principal de una colección
  // versionada los guarda, como demuestra `admin-panel/datos.ts` separando
  // `published` de `draft`— y se saltaba los módulos permitidos a la cuenta: la
  // portada prometía «6 entradas» y el módulo contestaba «todavía no hay fichas
  // escritas», dos pantallas contradiciéndose en dos clics. La cifra «por leer»
  // arrastraba el mismo error y no bajaba nunca a cero.
  //
  // No se fuerza `where: SOLO_PUBLICADO`: para un editor la regla de acceso
  // devuelve `true` y el conteo incluye sus borradores, que es justo lo que su
  // listado le enseña con la etiqueta «Borrador». Filtrarlos aquí volvería a
  // separar la portada del módulo, solo que al revés.
  //
  // El `.catch(() => 0)` cubre la colección cuya tabla todavía no existe: en una
  // base recién levantada `count` falla y la portada entera se caía con ella.
  const conteos = await Promise.all(
    modulosVisibles.map((m) =>
      payload
        .count({ collection: m.coleccion, overrideAccess: false, user: usuarioEfectivo as never })
        .then((r) => r.totalDocs)
        .catch(() => 0),
    ),
  )

  // Las dos mitades de la resta «por leer» tienen que hablar del mismo
  // conjunto. `totalFichas` suma solo los módulos que esta cuenta ve, así que
  // `leidas` se acota a esos mismos: contando todas sus filas, una cuenta a la
  // que se le retiró un módulo seguía sumando como leídas fichas que ya no
  // están en el total, y «por leer» salía más baja de lo que era —o pegada al
  // cero por el `Math.max` de abajo, que es la versión silenciosa del mismo
  // error—.
  //
  // Si la lista está vacía no se pregunta: un `in: []` es una condición que no
  // dice nada y no hay por qué averiguar a qué la traduce cada adaptador. Esa
  // cuenta no ve ningún módulo y su total es cero, así que lo leído tampoco
  // puede ser otra cosa, ni hay ficha que pueda ofrecerse para retomar.
  const coleccionesVisibles = modulosVisibles.map((m) => m.coleccion)

  const [actividad, leidas] = await Promise.all([
    // «Continúa leyendo» se acota a los mismos módulos, y aquí el recorte no es
    // una cuestión de coherencia sino de que la sección tenga algo que enseñar.
    // El único filtro por visibilidad llegaba tarde: lo hacía el `findByID` con
    // `overrideAccess: false` del bucle de abajo, que ante un módulo retirado no
    // devuelve nada sino que lanza `Forbidden` —lo mismo que se explica veinte
    // líneas más arriba—, y el `catch` de ese bucle lo descarta en silencio. Así
    // que las tres plazas se las comían filas que la cuenta ya no puede ver y la
    // sección salía con dos tarjetas, con una o vacía, teniendo el residente
    // fichas a medias en los módulos que sí ve. Se recorta en la consulta y no
    // pidiendo de más, porque «de más» no tiene número: pueden ser todas.
    //
    // Desde que el examen físico anota lecturas esto pesa más, no menos: sus
    // maniobras generan filas con `completado: false` y compiten por las mismas
    // tres plazas.
    coleccionesVisibles.length === 0
      ? Promise.resolve({ docs: [] as unknown[] })
      : payload
          .find({
            collection: 'actividad',
            where: {
              and: [
                { usuario: { equals: usuario?.id } },
                { completado: { equals: false } },
                { coleccion: { in: coleccionesVisibles } },
              ],
            },
            sort: '-ultimaVisita',
            limit: 3,
            user: usuario as never,
          })
          .catch(() => ({ docs: [] as unknown[] })),
    coleccionesVisibles.length === 0
      ? Promise.resolve(0)
      : payload
          .count({
            collection: 'actividad',
            where: {
              and: [
                { usuario: { equals: usuario?.id } },
                { completado: { equals: true } },
                { coleccion: { in: coleccionesVisibles } },
              ],
            },
            overrideAccess: true,
          })
          .then((r) => r.totalDocs)
          .catch(() => 0),
  ])

  // Se resuelve el título de cada ficha a medias para poder ofrecer el enlace
  // con su nombre y no con un número, que no le dice nada a nadie.
  //
  // `destino` sale de `rutaPublica` y no de pegar `${ruta}/${id}`, que es lo que
  // se hacía. Los cuatro módulos con página por documento daban igual con las
  // dos formas; el examen físico, no: no existe `examen-fisico/[id]/`, así que
  // esa concatenación componía `/examen-fisico/7` y aterrizaba en el 404 en
  // inglés de Next, sin barra para volver. No se notaba porque de las maniobras
  // no se registraba ninguna lectura y por tanto no aparecían aquí jamás; en
  // cuanto el listado empezó a anotarlas, la sección estrenaba enlaces rotos.
  // `rutaPublica` es quien sabe que ese módulo se enlaza por ancla
  // (`/examen-fisico#maniobra-<id>`) y quien dejará de saberlo el día que tenga
  // ficha propia.
  const continuarLeyendo: { id: string; nombre: string; coleccion: string; destino: string }[] = []
  for (const registro of actividad.docs as Record<string, unknown>[]) {
    try {
      const doc = (await payload.findByID({
        collection: registro.coleccion as never,
        id: registro.documentoId as string,
        // Sin `overrideAccess: false` aquí no se comprobaba nada: en la API
        // local vale `true` por omisión, así que pasar `user` a secas no
        // activaba `lecturaDeModulo` ni el filtro de publicación, y el `catch`
        // de abajo prometía omitir lo no publicado mientras imprimía su título.
        //
        // Importa más de lo que parece porque la fila que se resuelve la elige
        // quien la crea: `POST /api/actividad` solo exige sesión activa y
        // acepta cualquier `coleccion` y `documentoId`. Era un listador de
        // títulos de borradores —y de módulos vetados— a base de probar
        // identificadores 1, 2, 3…, justo lo que D-020 se toma el trabajo de
        // ocultar.
        overrideAccess: false,
        user: usuarioEfectivo as never,
        // Solo se lee el título: sin esto cada ficha llegaba con sus medios y
        // sus relaciones pobladas a dos niveles (D-128).
        depth: 0,
      })) as Record<string, unknown>
      const nombre = (doc?.nombre ?? doc?.titulo) as string | undefined
      if (nombre) {
        continuarLeyendo.push({
          id: String(registro.documentoId),
          nombre,
          coleccion: String(registro.coleccion),
          destino: rutaPublica(String(registro.coleccion), String(registro.documentoId)),
        })
      }
    } catch {
      // La ficha pudo borrarse, o dejar de estar publicada: se omite.
    }
  }

  const totalFichas = conteos.reduce((a, b) => a + b, 0)

  // Lo leído de cada módulo, para la barra de avance de su tarjeta. Una cuenta
  // por módulo visible y no una lista de filas: un residente constante acumula
  // cientos de lecturas y para pintar cinco barras basta con cinco números.
  // Acotado al usuario, por eso `overrideAccess: true`, como el conteo de
  // arriba. Va después de los conteos de fichas a propósito: la prueba de la
  // portada localiza aquel por ser el primer `count` sobre la colección.
  //
  // Puede salir más alto que el total del módulo si se marcó como leída una
  // ficha que luego se retiró: la barra se recorta al cien.
  const leidasPorModulo = await Promise.all(
    modulosVisibles.map((m) =>
      payload
        .count({
          collection: 'actividad',
          where: {
            and: [
              { usuario: { equals: usuario?.id } },
              { completado: { equals: true } },
              { coleccion: { equals: m.coleccion } },
            ],
          },
          overrideAccess: true,
        })
        .then((r) => r.totalDocs)
        .catch(() => 0),
    ),
  )

  // ------------------------------------------------ su paso por el simulador
  //
  // La tarjeta del módulo 04 promete «registro de complicaciones» desde el
  // primer día, y hasta hoy no existía en ninguna pantalla: la consola lo
  // pintaba recortado a diez líneas, seiscientos píxeles más abajo, y lo perdía
  // al recargar. Desde que `registrarResultadoDeCirugia` lo escribe en
  // `actividad`, este es el sitio donde el residente lo encuentra sin volver a
  // abrir el caso.
  //
  // Va aparte del `Promise.all` de arriba y no dentro: aquellas dos consultas
  // son las de «Continúa leyendo» y su conteo, y comparten la acotación por
  // módulos visibles que `tests/unit/continuaLeyendoAcotado.test.ts` sostiene
  // sobre ese bloque. Esta pregunta otra cosa —los casos que además se jugaron—
  // y solo tiene sentido si esta cuenta ve el simulador.
  //
  // `puntaje: { exists: true }` es lo que separa el caso recorrido del caso
  // abierto y cerrado: la columna no lleva `defaultValue`, así que el nulo es
  // el «todavía no» (`src/collections/Actividad.ts`). `recorridoGuardado`
  // vuelve a filtrar por si acaso, porque de esa condición depende que la
  // sección no se llene de partidas que nadie jugó.
  const recorridos: {
    id: string
    nombre: string
    destino: string
    recorrido: RecorridoGuardado
  }[] = []

  if (coleccionesVisibles.includes('cirugias')) {
    const filas = await payload
      .find({
        collection: 'actividad',
        where: {
          and: [
            { usuario: { equals: usuario?.id } },
            { coleccion: { equals: 'cirugias' } },
            { puntaje: { exists: true } },
          ],
        },
        sort: '-ultimaVisita',
        limit: 3,
        depth: 0,
        overrideAccess: true,
      })
      .then((r) => r.docs)
      .catch(() => [])

    for (const fila of filas) {
      const recorrido = recorridoGuardado(fila)
      if (!recorrido) continue
      const id = String(fila.documentoId)
      try {
        // Con el acceso puesto, y por lo mismo que el bucle de «Continúa
        // leyendo»: la fila la pudo crear `POST /api/actividad` con el
        // identificador que quisiera, así que sin esto la sección sería otro
        // listador de títulos de borradores.
        const doc = await payload.findByID({
          collection: 'cirugias',
          id,
          depth: 0,
          overrideAccess: false,
          user: usuarioEfectivo as never,
        })
        const nombreDelCaso = doc?.nombre
        if (typeof nombreDelCaso === 'string' && nombreDelCaso.trim() !== '') {
          recorridos.push({
            id,
            nombre: nombreDelCaso,
            destino: rutaPublica('cirugias', id),
            recorrido,
          })
        }
      } catch {
        // El caso pudo borrarse o dejar de estar publicado: se omite.
      }
    }
  }

  const nombre = String(usuario?.nombre ?? '').split(' ')[0]
  const puedeEditar = rolReal === 'admin' || rolReal === 'editor'
  const leidasAcotadas = Math.min(leidas, totalFichas)
  const porcentaje = totalFichas > 0 ? Math.round((leidasAcotadas / totalFichas) * 100) : 0

  return (
    <main>
      {/* El saludo y el avance primero. El eslogan de la portada pública ya lo
          leyó al entrar, y repetido aquí empujaba hacia abajo lo único que
          cambia de una visita a otra: por dónde va. */}
      <section className="portada-saludo">
        <div>
          <span className="eyebrow">Su plataforma docente</span>
          <h1>
            {saludo()}
            {nombre ? `, ${nombre}` : ''}
          </h1>
          <p className="lead">
            {continuarLeyendo.length > 0
              ? 'Retome la lectura donde la dejó o elija un módulo.'
              : 'Elija un módulo para empezar. Lo que vaya leyendo quedará aquí.'}
          </p>

          <div className="kpis">
            <div className="kpi kpi-leidas">
              <span className="rotulo">Su avance</span>
              <span className="kpi-valor">
                {leidasAcotadas} <span className="kpi-total">/ {totalFichas}</span>
              </span>
              <span
                className="progreso"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={porcentaje}
                aria-label="Fichas marcadas como leídas"
              >
                <span style={{ width: `${porcentaje}%` }} />
              </span>
              <span className="kpi-texto">
                {porcentaje} % marcado como leído
              </span>
            </div>
            <div className="kpi">
              <span className="rotulo">Por leer</span>
              <span className="kpi-valor">{Math.max(0, totalFichas - leidas)}</span>
              <span className="kpi-texto">fichas pendientes</span>
            </div>
            <div className="kpi">
              <span className="rotulo">Disponibles</span>
              <span className="kpi-valor">{totalFichas}</span>
              <span className="kpi-texto">
                en {modulosVisibles.length} {modulosVisibles.length === 1 ? 'módulo' : 'módulos'}
              </span>
            </div>
          </div>

          <div className="fila-botones">
            {/* Los dos accesos fijos solo se ofrecen si el módulo se ve: eran
                enlaces escritos a mano que no pasaban por ningún filtro, y con
                un módulo en mantención llevaban al residente a la pantalla de
                «no disponible» desde la propia portada. */}
            {verBiblioteca ? (
              <Link className="boton" href="/biblioteca">
                <Library size={18} aria-hidden="true" />
                Ir a la biblioteca
              </Link>
            ) : null}
            {puedeEditar ? (
              <Link className="boton boton-secundario" href="/admin-panel/contenido">
                <PenLine size={18} aria-hidden="true" />
                Escribir contenido
              </Link>
            ) : verTecnicaAO ? (
              <Link className="boton boton-secundario" href="/tecnica-ao">
                Ver técnica AO
              </Link>
            ) : null}
          </div>
        </div>

        <div className="hero-figura">
          <CuerpoDePortada />
          <div className="hero-pie">
            <span>Cuerpo completo · atlas anatómico</span>
            <span className="hero-codigo">BodyParts3D · CC BY 4.0</span>
          </div>
        </div>
      </section>

      {continuarLeyendo.length > 0 ? (
        <section className="seccion-portada continuar-leyendo">
          <span className="eyebrow">Donde lo dejó</span>
          <h2 className="titulo-seccion">Continúa leyendo</h2>
          <div className="rejilla-fichas">
            {continuarLeyendo.map((item) => (
              // Cada tarjeta en el color de su módulo, con su nombre como
              // insignia: «Continúa leyendo» mezcla los cinco y sin eso no se
              // sabía de dónde era cada ficha hasta abrirla.
              <div key={`${item.coleccion}-${item.id}`} className={IDENTIDAD_DE_MODULO[item.coleccion]?.clase}>
                <TarjetaFicha
                  href={item.destino}
                  titulo={item.nombre}
                  accion="Retomar lectura"
                  insignias={
                    // El slug crudo solo como último recurso: sacaba a la
                    // portada el nombre de la tabla de PostgreSQL
                    // —«patologias» sin tilde, «casos ao»—, que ni siquiera
                    // son palabras.
                    <span className="insignia insignia-acento">
                      <Clock3 size={13} aria-hidden="true" />
                      {NOMBRE_DE_MODULO[item.coleccion] ?? item.coleccion}
                    </span>
                  }
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {recorridos.length > 0 ? (
        <section className="seccion-portada continuar-leyendo mod-4">
          <EyebrowPabellon />
          <h2 className="titulo-seccion">Su paso por el simulador</h2>
          <div className="rejilla-fichas">
            {recorridos.map((item) => {
              const cuantas = item.recorrido.complicaciones.length
              // La última es la de arriba del todo porque es la que se recuerda
              // —y la que se va a repasar—; el registro entero está en el caso.
              const ultima = item.recorrido.complicaciones[cuantas - 1]
              return (
                <TarjetaFicha
                  key={item.id}
                  href={item.destino}
                  titulo={item.nombre}
                  accion="Volver al caso"
                  insignias={
                    // Insignias y no `.codigo`: la del código es para el de la
                    // ficha, y esto son dos cifras del recorrido. Las
                    // complicaciones en ámbar, que es lo que hay que repasar.
                    <>
                      <span className="insignia insignia-acento">
                        {item.recorrido.puntaje}
                        {item.recorrido.puntajeMaximo !== null
                          ? ` de ${item.recorrido.puntajeMaximo}`
                          : ''}{' '}
                        {item.recorrido.puntaje === 1 ? 'punto' : 'puntos'}
                      </span>
                      <span className={`insignia ${cuantas === 0 ? 'insignia-ok' : 'insignia-atencion'}`}>
                        {cuantas === 0
                          ? 'Sin complicaciones'
                          : `${cuantas} ${cuantas === 1 ? 'complicación' : 'complicaciones'}`}
                      </span>
                    </>
                  }
                  resumen={
                    ultima
                      ? `${ultima.numero ? `Paso ${ultima.numero}. ` : ''}${
                          ultima.detalle ?? ultima.titulo ?? 'Complicación sin detalle guardado.'
                        }`
                      : 'Recorrió el caso sin complicaciones.'
                  }
                />
              )
            })}
          </div>
          {/* Dicho aquí y no solo en el panel. El puntaje lo calcula la consola
              en el navegador y el servidor no puede recalcularlo sin repetir la
              simulación (`src/collections/Actividad.ts`), así que es seguimiento
              del propio progreso y no una nota. Enseñarlo sin esta línea lo
              convierte, para quien lo lee, en lo segundo. */}
          <p className="nota-al-pie">
            Estas cifras las lleva la consola para que usted vea lo que le costó
            cada caso. No son una calificación.
          </p>
        </section>
      ) : null}

      {modulosVisibles.length > 0 ? (
        <section className="seccion-portada">
          {/* Los rótulos cuentan lo que hay debajo y no lo que tiene la
              plataforma: a una cuenta restringida a dos módulos, «Los cinco
              módulos» le encabezaba una rejilla de dos tarjetas, y de paso le
              decía cuántos se le están ocultando. */}
          <span className="eyebrow">
            {modulosVisibles.length === MODULOS.length ? 'Los cinco módulos' : 'Sus módulos'}
          </span>
          <h2 className="titulo-seccion">
            {modulosVisibles.length === MODULOS.length
              ? 'Qué incluye la plataforma'
              : 'Qué tiene disponible'}
          </h2>
          <div className="rejilla-modulos">
            {modulosVisibles.map((m, i) => (
              // La clase del módulo va en la envoltura y no en el enlace: así
              // la tarjeta, su icono, su número y su barra toman `--acento`
              // sin que cada pieza tenga que saber de qué módulo es.
              <div key={m.ruta} className={IDENTIDAD_DE_MODULO[m.coleccion]?.clase}>
              <Link href={m.ruta} className="tarjeta-modulo">
                <span className="modulo-numero" aria-hidden="true">
                  {m.numero}
                </span>
                <IconoDelModulo coleccion={m.coleccion} />
                <h3>{m.titulo}</h3>
                <p>{m.descripcion}</p>
                {conteos[i] > 0 ? (
                  <span className="modulo-avance">
                    {Math.min(leidasPorModulo[i], conteos[i])} de {conteos[i]} leídas
                    <span className="progreso" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.round((Math.min(leidasPorModulo[i], conteos[i]) / conteos[i]) * 100)}%`,
                        }}
                      />
                    </span>
                  </span>
                ) : null}
                <div className="modulo-pie">
                  <div className="etiquetas">
                    {enMantencion.includes(m.coleccion) ? <InsigniaMantencion /> : null}
                    {m.publico.map((p) => (
                      <span key={p} className="etiqueta">
                        {p}
                      </span>
                    ))}
                  </div>
                  <span className={`conteo${conteos[i] === 0 ? ' conteo-vacio' : ''}`}>
                    {conteos[i] === 0
                      ? 'Sin contenido'
                      : `${conteos[i]} ${conteos[i] === 1 ? 'entrada' : 'entradas'}`}
                  </span>
                </div>
              </Link>
              </div>
            ))}
            {/* El módulo anunciado (D-163): una tarjeta más, atenuada, con su
                insignia y sin conteos de lectura —no hay nada que leer—. Lleva a
                su página, que cuenta lo que va a ser. */}
            {MODULOS_ANUNCIADOS.map((m) => (
              <div key={m.ruta} className="modulo-anunciado">
                <Link href={m.ruta} className="tarjeta-modulo">
                  <span className="modulo-numero" aria-hidden="true">
                    {m.numero}
                  </span>
                  <span className="icono-modulo" aria-hidden="true">
                    <ScanLine size={20} />
                  </span>
                  <h3>{m.nombre}</h3>
                  <p>{m.resumen}</p>
                  <div className="modulo-pie">
                    <div className="etiquetas">
                      <span className="insignia-proximamente">{ROTULO_PROXIMAMENTE}</span>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : (
        // Cuenta cuyo `modulosVisibles` —el campo del usuario, no la lista de
        // arriba— está puesto y no contiene ninguno de los cinco. La barra
        // superior sale igual de vacía (`Navegacion.tsx` recorta con la misma
        // regla), así que sin esta línea la portada se lee como una avería del
        // servidor y no como un permiso que nadie le ha dado todavía.
        <p className="nota-al-pie">
          Su cuenta todavía no tiene módulos asignados. Solicítelos al equipo docente.
        </p>
      )}
    </main>
  )
}

/** El icono del módulo en su cuadro tenue, para la tarjeta de la rejilla. */
function IconoDelModulo({ coleccion }: { coleccion: string }) {
  const Icono = IDENTIDAD_DE_MODULO[coleccion]?.icono ?? BookOpen
  return (
    <span className="icono-modulo" aria-hidden="true">
      <Icono size={20} />
    </span>
  )
}

/** El antetítulo de «Pabellón», en el color del simulador. */
function EyebrowPabellon() {
  const Icono = IDENTIDAD_DE_MODULO.cirugias?.icono ?? BookOpen
  return (
    <span className="eyebrow-modulo">
      <span className="icono-modulo icono-modulo-sm" aria-hidden="true">
        <Icono size={15} />
      </span>
      Pabellón
    </span>
  )
}
