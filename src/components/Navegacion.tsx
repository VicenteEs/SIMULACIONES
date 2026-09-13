import Link from 'next/link'
import { ConmutadorVista } from './ConmutadorVista'
import { BotonSalir } from './BotonSalir'
import { BarraDeModulos, MenuMovil } from './MenuMovil'
import { ruta } from '@/lib/rutas'
import { obtenerSesion } from '@/lib/sesion'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { MODULOS as MODULOS_DE_LA_PLATAFORMA } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Rótulo de cada módulo en la barra.
 *
 * Más corto que el nombre completo del panel: en la fila de escritorio los
 * cinco compiten por el mismo ancho, y «Biblioteca de patologías» obligaba a
 * partir la barra en dos líneas. Un módulo que no figure aquí sale con su
 * nombre largo, que es feo pero visible; desaparecer sería peor.
 */
const ETIQUETA_EN_LA_BARRA: Record<string, string> = {
  patologias: 'Biblioteca',
  maniobras: 'Examen físico',
  'casos-ao': 'Técnica AO',
  cirugias: 'Simulador',
  'estudios-ia': 'Imágenes',
}

// La pareja ruta/colección no se vuelve a escribir aquí: sale de la tabla única
// de `admin-panel/modulos.ts`. Cuando estaban las dos, la colección era la
// clave con la que `puedeVerModulo` decide, y una lista copiada que se queda
// atrás no falla —el módulo simplemente deja de verse para todo el que no sea
// administrador, que es justo el caso que nadie prueba—.
const MODULOS = MODULOS_DE_LA_PLATAFORMA.map((m) => ({
  ruta: m.ruta,
  coleccion: m.slug,
  etiqueta: ETIQUETA_EN_LA_BARRA[m.slug] ?? m.nombre,
}))

/**
 * Barra superior de la plataforma.
 *
 * Dos navegaciones para el mismo destino: la fila de módulos en pantalla ancha
 * y un panel desplegable en el teléfono. Se pintan las dos y CSS decide cuál se
 * ve, en lugar de medir la ventana en JavaScript: así la primera pintada ya es
 * la correcta y no hay un salto cuando el componente descubre el tamaño.
 *
 * El enlace al panel lo ven administrador y editor, y lleva al panel propio:
 * la interfaz de Payload no se ofrece a nadie.
 *
 * La lista de módulos se recorta con el mismo usuario efectivo con el que las
 * páginas consultan. No es cosmética: `filtroDeLecturaDeModulo` devuelve
 * `false` para un módulo que la cuenta no tiene, y ante un `false` Payload no
 * responde con una lista vacía sino que lanza `Forbidden` —la rama de
 * `docs: []` solo se alcanza con los errores desactivados—. Como en `src/app`
 * no hay ningún `error.tsx`, ofrecer aquí un módulo restringido acaba en la
 * pantalla genérica de Next, en inglés y sin barra para volver.
 *
 * La sesión se resuelve aquí en vez de recibirse por props porque el rol no
 * basta: la restricción por módulos es una segunda capa que vive en el registro
 * del usuario (`modulosVisibles`), y el layout solo entrega el rol. Cuesta una
 * lectura de sesión más por petición; una pestaña que se comporta como una
 * avería del servidor cuesta bastante más.
 *
 * Ojo: esconder el enlace no cierra el módulo. La URL escrita a mano sigue
 * llegando, y quien la escriba se encontrará con el mismo `Forbidden`. La
 * guardia que falta va en cada página de módulo, antes del `find`.
 */
export async function Navegacion({
  nombre,
  rolReal,
  simulando,
}: {
  nombre?: string
  rolReal: string
  simulando: boolean
}) {
  const hayPanel = rolReal === 'admin' || rolReal === 'editor'

  const { usuarioEfectivo } = await obtenerSesion()
  const modulos = MODULOS.filter((m) =>
    puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, m.coleccion),
  )

  return (
    <header className="barra">
      <div className="barra-interior">
        {/* La marca sola, no el logotipo completo: el archivo `logo.png` ya
            lleva el nombre escrito, y ponerlo al lado de un texto distinto
            deja dos nombres compitiendo en el mismo sitio. */}
        <Link href="/" className="marca">
          <img src={ruta('/icon.png')} alt="" className="marca-logo" />
          <div>
            TraumaHub
            <span className="marca-sub">Plataforma docente</span>
          </div>
        </Link>

        <BarraDeModulos modulos={modulos} />

        <div className="barra-derecha">
          <ConmutadorVista rolReal={rolReal} simulando={simulando} />
          {hayPanel ? (
            <Link href="/admin-panel" className="enlace-nav">
              Panel
            </Link>
          ) : null}
          {nombre ? <span className="quien">{nombre}</span> : null}
          <BotonSalir />
        </div>

        <div className="barra-movil">
          <MenuMovil
            modulos={modulos}
            nombre={nombre}
            rolReal={rolReal}
            simulando={simulando}
            hayPanel={hayPanel}
          />
        </div>
      </div>
    </header>
  )
}
