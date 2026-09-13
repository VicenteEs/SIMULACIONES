import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { SinAcceso, SinAccesoAlModulo, Miga } from '@/components/Estados'
import { CasoConSuLectura } from '@/components/simulador/CasoConSuLectura'
import { FormularioComentario } from '@/components/FormularioComentario'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'
import { lecturasDelResidente } from '@/lib/lecturas'
import { recorridoGuardado } from '@/lib/progresoDelSimulador'
import { Rico } from '@/components/Rico'

export const dynamic = 'force-dynamic'

export default async function CirugiaSimulada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Simulador quirúrgico" />

  // Antes del `findByID`, y con el usuario efectivo que va a él: su `.catch`
  // convierte en `notFound()` también el `Forbidden` de la regla de lectura, y
  // quien no tiene el módulo leía «Esta ficha ya no está» sobre un caso
  // publicado. El porqué entero, en la cabecera de `SinAccesoAlModulo`.
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'cirugias')) {
    return <SinAccesoAlModulo titulo="Simulador quirúrgico" />
  }

  const payload = await getPayload({ config })
  const cirugia = await payload
    .findByID({
      collection: 'cirugias',
      id,
      overrideAccess: false,
      user: usuarioEfectivo as never,
      // Profundidad 2: el paso trae su instrumento y su fase ya poblados, y el
      // caso trae su modelo con la dirección del archivo. Con profundidad 1 el
      // instrumento llegaría como número y la bandeja saldría vacía.
      depth: 2,
    })
    .catch(() => null)
  if (!cirugia) notFound()

  const caso = casoParaLaConsola(cirugia as unknown as Record<string, unknown>)

  // La casilla de «leída» tiene que nacer sabiendo si ya lo está, y
  // `RastreadorActividad` es de cliente: no puede consultarlo él. Sin esto la
  // casilla aparece en blanco en cada carga y el residente vuelve a marcar lo
  // que ya había marcado.
  //
  // De la misma fila sale el recorrido guardado del simulador —puntaje y
  // complicaciones—, y por el mismo motivo: `ConsolaQuirurgica` corre en el
  // navegador y no puede preguntarlo. Es una consulta y no dos: los tres campos
  // viven en esta misma fila (`src/collections/Actividad.ts`), y `depth: 0` no
  // se lleva por delante la lista de complicaciones, que es un `array` del
  // documento y no una relación.
  //
  // La pregunta es la misma en los cinco módulos y vive en `src/lib/lecturas.ts`
  // —antes era una copia literal por página—, que explica también por qué no
  // lanza: el caso se enseña igual con la tabla de actividad caída, sin casilla
  // marcada y sin recorrido anterior.
  const lecturas = await lecturasDelResidente(payload, usuarioEfectivo, 'cirugias', [id])
  const registroDeLectura = lecturas.registro(id)

  return (
    <main>
      <Miga href="/simulador" texto="Simulador" />
      <h1>{caso.nombre}</h1>
      <Rico valor={cirugia.resumen} className="entrada" />

      {/* La casilla y la consola van juntas en `CasoConSuLectura` porque desde
          que terminar el caso lo marca como leído las dos escriben la misma
          marca, y la casilla tiene que enterarse sin recargar: su cabecera
          explica por qué no se resuelve desde aquí.

          `documentoId` es lo que le da a la consola dónde escribir, y
          `recorridoGuardado` lo que le devuelve lo de la vez anterior. Sin los
          dos, el puntaje y las complicaciones vuelven a ser estado local que
          muere con la pestaña, que es de donde se viene. */}
      <CasoConSuLectura
        caso={caso}
        documentoId={id}
        completadoInicial={lecturas.leida(id)}
        recorridoGuardado={recorridoGuardado(registroDeLectura)}
      />

      <FormularioComentario
        coleccion="cirugias"
        documentoId={id}
        label="¿Sugerencia o corrección sobre este caso? Comentar"
      />
    </main>
  )
}
