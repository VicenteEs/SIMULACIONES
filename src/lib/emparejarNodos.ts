/**
 * Emparejar los nodos que el caso nombra con los que el modelo trae de verdad.
 *
 * El caso guarda el **nombre de cada pieza** («Tibia_derecha_fragmento_distal») y el lienzo la busca por ese nombre exacto: el rol de hueso, de piel o de implante, y sobre
 * todo **cuál es el fragmento que se reduce**. Si el modelo se vuelve a exportar, o el cargador de glTF sanea el nombre (los espacios pasan a guion bajo y los puntos desaparecen:
 * «Tibia derecha.001» llega como «Tibia_derecha001»), el nombre ya no coincide y el caso se queda sin fragmento: la reducción automática dice que no hay nada que reducir y las
 * capas no encuentran sus piezas. Nadie lo ve, porque el modelo se ve igual.
 *
 * Aquí se decide qué nodo del modelo es cada pieza del caso cuando el nombre no coincide exacto: igual sin mayúsculas, tildes ni separadores, y, si aún no, igual sin el sufijo numérico
 * que añaden Blender o el cargador al duplicar un nombre. Cada nodo del modelo se usa **una sola vez** y una pieza solo se empareja con un nodo que ninguna otra pieza ya tenga por
 * nombre exacto.
 */

/** «Tibia derecha.001» → «tibia_derecha_001»: sin mayúsculas, tildes ni signos, con un solo guion bajo entre palabras. */
export function normalizarNombreDeNodo(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** El nombre normalizado sin el número que se añade al final al duplicar: «tibia_derecha_001» y «tibia_derecha1» → «tibia_derecha». */
export function sinSufijoNumerico(normalizado: string): string {
  return normalizado.replace(/_?\d+$/, '')
}

/**
 * Para cada nombre del caso que el modelo no trae exacto, el nombre del modelo que le corresponde. No incluye los que ya coinciden ni los que no se pudieron emparejar. Si dos nombres
 * del caso reclaman el mismo nodo, se lo queda el primero.
 */
export function emparejarNodos(nombresDelModelo: readonly string[], nombresDelCaso: readonly string[]): Map<string, string> {
  const delModelo = new Set(nombresDelModelo)
  const exactosDelCaso = new Set(nombresDelCaso.filter((n) => delModelo.has(n)))
  // Un nodo que otra pieza del caso ya tiene por nombre exacto no se le quita.
  const libres = nombresDelModelo.filter((n) => !exactosDelCaso.has(n))
  const usados = new Set<string>()
  const resultado = new Map<string, string>()
  const faltan = nombresDelCaso.filter((n) => !delModelo.has(n))

  const etapas: ((n: string) => string)[] = [normalizarNombreDeNodo, (n) => sinSufijoNumerico(normalizarNombreDeNodo(n))]
  for (const clave of etapas) {
    for (const nombre of faltan) {
      if (resultado.has(nombre)) continue
      const objetivo = clave(nombre)
      if (!objetivo) continue
      const candidato = libres.find((m) => !usados.has(m) && clave(m) === objetivo)
      if (candidato === undefined) continue
      usados.add(candidato)
      resultado.set(nombre, candidato)
    }
  }
  return resultado
}
