import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { desplazamientoEnMilimetros } from '@/lib/piezasDelCaso'

/**
 * Los dos defectos de `formulario/Campos.tsx` que no se ven ni al compilar ni
 * en la pantalla de quien no sabe qué buscar.
 *
 * El entorno de la suite es `node` y el proyecto no tiene jsdom ni biblioteca
 * de componentes (ver `vitest.config.ts`), así que aquí no se pinta nada y el
 * componente ni siquiera se importa: arrastra `next/dynamic`, el esquema y la
 * acción de servidor de subida. Lo que se hace es lo mismo que ya hace
 * `formularios.test.ts` con los otros dos formularios —leer la fuente y exigir
 * que las decisiones sigan escritas— más, en la parte que sí es código puro,
 * ejercitar de verdad la función de abajo para fijar cuál es el agujero que el
 * guardián de arriba tapa. Si algún día entra jsdom, estas dos comprobaciones
 * se sustituyen por las de verdad; hasta entonces son lo único que hay.
 */

const RAIZ = process.cwd()
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')

const CAMPOS = fuente('src', 'components', 'admin', 'formulario', 'Campos.tsx')
const CONFIG = fuente('next.config.mjs')

// ------------------------------------------------------- el foco de los bloques

describe('el menú de «+ Agregar bloque» no roba el foco al montar', () => {
  /**
   * El defecto era solo de desarrollo, y por eso hay que dejarlo escrito: el
   * Modo Estricto ejecuta el efecto dos veces al montar y NO reinicia los
   * `useRef` entre ambas vueltas, de modo que un centinela de «primera vuelta»
   * llegaba puesto a la segunda, el efecto caía al `else` y cada editor de
   * bloques arrastraba la página hasta su disparador nada más abrir la ficha.
   * En producción no pasaba, así que nadie con la ficha delante lo iba a
   * reproducir dos veces seguidas.
   */
  it('guarda el valor anterior de «agregando», no un «ya monté»', () => {
    expect(CAMPOS).toContain('const anterior = useRef(agregando)')
    expect(CAMPOS).toContain('if (anterior.current === agregando) return')
    expect(CAMPOS).toContain('anterior.current = agregando')
  })

  it('no queda ningún centinela booleano de primera vuelta', () => {
    // `useRef(false)` sembrado con una constante es justo lo que el Modo
    // Estricto derrota: la segunda vuelta lo encuentra ya cambiado.
    expect(CAMPOS).not.toContain('yaMontado')
    expect(CAMPOS).not.toMatch(/useRef\(false\)/)
  })

  it('el peligro sigue vivo: nada desactiva el Modo Estricto', () => {
    // Si algún día alguien pone `reactStrictMode: false`, esta prueba cae y
    // quien la lea se entera de que la desactivación existe antes de dar por
    // buena una guarda que solo aguanta en producción. Desde Next 13.5.1 el
    // App Router lo trae activo por omisión.
    expect(CONFIG).not.toMatch(/reactStrictMode/)
  })
})

// -------------------------------------------------- «Milímetros por unidad»

describe('la escala del caso', () => {
  /**
   * Lo que de verdad dejaba pasar el respaldo de la función pura, medido
   * contra ella misma. El comentario de `escalaDelCaso` afirma esto; aquí se
   * comprueba, para que nadie vuelva a presentar como arreglado el caso del 0.
   */
  const quieto = { posicion: { x: 1, y: 0, z: 0 }, giros: { x: 0, y: 0, z: 0 } }

  it('el 0 y el NaN ya acababan en 1000 por el `||` de la función pura', () => {
    expect(desplazamientoEnMilimetros(quieto, 0).x).toBe(1000)
    expect(desplazamientoEnMilimetros(quieto, Number.NaN).x).toBe(1000)
  })

  it('el negativo y el infinito sí pasaban, y son lo que tapa el guardián', () => {
    // -1 no equivoca la magnitud: espeja los seis números, que en un caso
    // publicado parece plausible y la consola puntúa contra ello.
    expect(desplazamientoEnMilimetros(quieto, -1).x).toBe(-1)
    expect(desplazamientoEnMilimetros(quieto, Number.POSITIVE_INFINITY).x).toBe(Infinity)
  })

  it('la pantalla los rechaza antes de llegar ahí', () => {
    expect(CAMPOS).toMatch(
      /const escalaDelCaso[\s\S]*Number\.isFinite\(bruto\)[\s\S]*bruto > 0/,
    )
  })
})

describe('el aviso de «Milímetros por unidad»', () => {
  /**
   * El encargo no se cerraba con el guardián: con un 0 escrito se seguía
   * midiendo con 1000 y en pantalla no había una sola palabra que lo dijera.
   */
  it('se pinta en la rama del taller de piezas y se anuncia como alerta', () => {
    expect(CAMPOS).toMatch(
      /escalaSustituida\(hermanos\?\.milimetrosPorUnidad\)[\s\S]{0,200}className="campo-error" role="alert"/,
    )
    expect(CAMPOS).toContain('tiene que ser un número mayor que cero')
  })

  it('el aviso pregunta por el mismo número que se usa, sin repetir la condición', () => {
    // Copiar aquí `typeof bruto === 'number' && …` es lo que separa el aviso
    // de la política: se cambiaría una y la otra se quedaría mintiendo.
    expect(CAMPOS).toContain('escalaDelCaso(bruto) !== bruto')
  })

  it('el campo vacío no avisa: llega como `\'\'` del documento en blanco', () => {
    expect(CAMPOS).toMatch(/escalaSustituida[\s\S]{0,200}bruto !== ''/)
  })
})
