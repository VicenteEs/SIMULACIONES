import type { Metadata } from 'next'
import { obtenerSesion } from '@/lib/sesion'
import { puedeEditarContenido, type UsuarioSesion } from '@/access/reglas'
import { usuarioDeSesion } from '@/access/payload'
import { SinAcceso, Miga } from '@/components/Estados'
import { BuzonDeRequisitos } from '@/components/BuzonDeRequisitos'
import { MODULOS_ANUNCIADOS, ROTULO_PROXIMAMENTE } from '@/lib/modulosAnunciados'
import { Hourglass } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Planificación con imágenes del paciente · TraumaHub',
  robots: { index: false, follow: false },
}

const MODULO = MODULOS_ANUNCIADOS[0]

/**
 * El módulo 06, anunciado (D-163, E7).
 *
 * Lo ve toda cuenta activa: es la descripción de lo que va a ser. El buzón de
 * requisitos, debajo, solo se monta para quien lo puede usar —editores y
 * administradores—, y se decide con el usuario **efectivo**: quien mira la
 * plataforma «como un residente» no ve lo que un residente no ve.
 *
 * El texto lo revisa Cristóbal. Es una promesa de lo que se quiere construir, no
 * de lo que hay: la insignia lo dice arriba y el apartado «Lo que no va a ser»
 * abajo.
 */
export default async function Planificacion() {
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo={MODULO.nombre} />

  const sesion = usuarioDeSesion(usuarioEfectivo) as UsuarioSesion | null
  const puedeUsarElBuzon = puedeEditarContenido(sesion)
  const esAdmin = sesion?.rol === 'admin'

  return (
    <main>
      <Miga href="/" texto="Inicio" />
      <p className="rotulo">Módulo {MODULO.numero}</p>
      <h1>
        {MODULO.nombre} <span className="insignia-proximamente">{ROTULO_PROXIMAMENTE}</span>
      </h1>
      <p className="entrada">
        Cargar la tomografía de una fractura, reconstruirla en tres dimensiones y planificar la cirugía sobre ella,
        con las mismas herramientas con que hoy se prepara una fractura de práctica.
      </p>

      <section className="tarjeta">
        <h2>Lo que va a ser</h2>
        <ol className="planificacion-pasos">
          <li>
            <strong>Cargar el estudio.</strong> Una tomografía en DICOM; la resonancia, no, en la primera versión. Se
            lee en el navegador y se <strong>anonimiza antes de subir</strong>: se borran nombre, RUT e
            identificadores, fechas, institución y médico, siguiendo el perfil básico de confidencialidad de DICOM.
            Nada que identifique al paciente sale del computador.
          </li>
          <li>
            <strong>Reconstruir.</strong> El hueso se segmenta en la tomografía y se obtiene una malla por hueso,
            suavizada y reducida.
          </li>
          <li>
            <strong>Separar los fragmentos.</strong> Cada pieza ósea suelta es un fragmento: quien lo prepara los
            nombra y confirma, y la plataforma propone el código AO.
          </li>
          <li>
            <strong>Llevarlo al taller.</strong> La fractura del paciente se abre como cualquier preparación: se
            reduce, se ponen los implantes y se graba el paso a paso.
          </li>
          <li>
            <strong>Planificar.</strong> Reducción virtual, implante elegido, largo de cada tornillo y un resumen en
            PDF para el pabellón.
          </li>
          <li>
            <strong>Conservar poco.</strong> El estudio y su reconstrucción se borran solos a los pocos días, y solo
            los ven su autor y los administradores.
          </li>
        </ol>
      </section>

      <section className="tarjeta">
        <h2>Lo que no va a ser</h2>
        <p>
          No diagnostica, no reemplaza el criterio del cirujano y no se usa con estudios sin anonimizar. Es una
          herramienta de enseñanza y de preparación, no un dispositivo médico.
        </p>
      </section>

      {puedeUsarElBuzon ? (
        <BuzonDeRequisitos esAdmin={esAdmin} />
      ) : (
        <p className="campo-ayuda">
          <Hourglass size={14} aria-hidden="true" /> Todavía no se puede usar. Los editores están reuniendo qué
          debería hacer.
        </p>
      )}
    </main>
  )
}
