/**
 * «Docente revisor» → «DR», «Dra. Paula Riquelme» → «PR»: el círculo de una
 * persona en las tablas del panel (P-007 E5, D-238).
 *
 * El tratamiento no cuenta: con él, la mitad del equipo docente sería «D» y el
 * círculo dejaría de distinguir a nadie. Lo que no empieza por letra —un
 * correo usado como nombre, un número— tampoco. Sin nada que poner queda un
 * punto, para que el círculo no salga vacío y parezca un fallo de carga.
 */
export const iniciales = (nombre: string): string =>
  nombre
    .split(/\s+/)
    .filter((p) => /^[\p{L}]/u.test(p) && !/^(dr|dra)\.?$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '·'
