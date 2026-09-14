import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { esNombreDeRespaldo, fechaDeNombre, marcaDeTiempo } from '@/lib/respaldos'
import { listarRespaldos } from '@/lib/respaldosServidor'

/**
 * Los respaldos del servidor Windows (scripts/respaldar.ps1 y compañía).
 *
 * El servidor de producción es un Windows sin Docker, así que `respaldar.sh`
 * no corre allí y su gemelo en PowerShell es lo único que hay entre un disco
 * que falla y perderlo todo. Tres cosas no pueden romperse sin que nadie lo
 * vea:
 *
 * - El nombre. Si se separa del patrón del panel, los respaldos se siguen
 *   haciendo cada noche y la pantalla de respaldos dice que no hay ninguno.
 * - Los secretos. La tarea escribe un registro, y un registro acaba pegado en
 *   un chat. La clave de la base no puede llegar a él, ni a la pantalla.
 * - La retención. Si borra antes que la de `respaldar.sh`, se pierden días de
 *   copia; si borra después, el disco se llena.
 *
 * Lo primero se comprueba leyendo las constantes del guion, en cualquier
 * sistema. Todo lo demás se comprueba EJECUTANDO los guiones con PowerShell
 * 5.1, que es lo que corre en el servidor: un `pg_dump` y un `psql` de mentira
 * (un .cmd que llama a Node) apuntan lo que reciben, y la prueba mira lo que
 * sale en disco, en pantalla y en el registro. Mirar el texto del guion en
 * busca de un `Write-Host $uri` no demostraría nada: la fuga de verdad sería
 * un mensaje de error de pg_dump que repite la clave y que el guion copia al
 * registro, y eso solo se ve ejecutándolo. Fuera de Windows esa parte se
 * omite, porque no hay con qué ejecutarlo.
 */

const RAIZ = process.cwd()
const COMUN = readFileSync(path.join(RAIZ, 'scripts/respaldo-comun.ps1'), 'utf8')
const RESPALDAR_SH = readFileSync(path.join(RAIZ, 'scripts/respaldar.sh'), 'utf8')

function constante(nombre: string): string {
  const m = new RegExp(`^\\$${nombre}\\s*=\\s*'?([^'\\r\\n]+)'?\\s*$`, 'm').exec(COMUN)
  if (!m) throw new Error(`respaldo-comun.ps1 ya no declara $${nombre}`)
  return m[1]
}

/**
 * `DateTime.ToString(formato)` de .NET, solo con las piezas que tiene sentido
 * poner en un nombre de archivo. Cualquier otra letra hace fallar la prueba en
 * lugar de traducirse a ciegas: una `tt` o una `fff` nuevas en el guion
 * cambiarían el nombre, y esta función no debe fingir que sabe cómo.
 */
function formatoDotNet(formato: string, fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  const piezas: Record<string, string> = {
    yyyy: String(fecha.getFullYear()),
    MM: dos(fecha.getMonth() + 1),
    dd: dos(fecha.getDate()),
    HH: dos(fecha.getHours()),
    mm: dos(fecha.getMinutes()),
    ss: dos(fecha.getSeconds()),
  }
  // Rachas de la misma letra, como las lee .NET: `yyyyMMdd` son tres piezas.
  return formato.replace(/([A-Za-z])\1*/g, (token) => {
    if (!(token in piezas)) throw new Error(`Pieza de formato desconocida en el guion: ${token}`)
    return piezas[token]
  })
}

describe('el nombre que escribe el guion es el que lista el panel', () => {
  const fecha = new Date(2026, 8, 14, 3, 0, 7)
  const marca = () => formatoDotNet(constante('FORMATO_MARCA'), fecha)

  it('la marca es la misma que la del panel', () => {
    // Si coinciden, un respaldo de la tarea y uno del botón del panel hechos en
    // el mismo segundo se llaman igual, y la retención los trata por igual.
    expect(marca()).toBe(marcaDeTiempo(fecha))
  })

  it('los dos nombres pasan esNombreDeRespaldo y la fecha se lee de vuelta', () => {
    const m = marca()
    for (const plantilla of [constante('PLANTILLA_BASE'), constante('PLANTILLA_MEDIOS')]) {
      const nombre = plantilla.replace('{0}', m)
      expect(esNombreDeRespaldo(nombre), nombre).toBe(true)
      expect(fechaDeNombre(nombre)?.getTime(), nombre).toBe(fecha.getTime())
    }
    // Y cada uno con el tipo que el panel deduce del prefijo.
    expect(constante('PLANTILLA_BASE').replace('{0}', m)).toMatch(/^base-.*\.sql\.gz$/)
    expect(constante('PLANTILLA_MEDIOS').replace('{0}', m)).toMatch(/^medios-.*\.tar\.gz$/)
  })

  it('la retención por defecto es la de respaldar.sh', () => {
    const delSh = /DIAS_A_CONSERVAR="\$\{DIAS_A_CONSERVAR:-(\d+)\}"/.exec(RESPALDAR_SH)
    expect(delSh, 'respaldar.sh cambió la forma de declarar la retención').not.toBeNull()
    expect(Number(constante('DIAS_A_CONSERVAR_POR_DEFECTO'))).toBe(Number(delSh![1]))
    // Y la regla que se imita en Aplicar-Retencion es la de find -mtime; si el
    // .sh deja de usarla, la traducción de abajo deja de ser la suya.
    expect(RESPALDAR_SH).toMatch(/-mtime "\+\$DIAS_A_CONSERVAR"/)
  })
})

// --- ejecutando los guiones de verdad -------------------------------------------

const POWERSHELL = path.join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
)
const HAY_POWERSHELL = process.platform === 'win32' && existsSync(POWERSHELL)

/** La clave de mentira. Con una arroba, para que viaje escapada en la URI. */
const CLAVE = 'Centinela@Fuga7'
const CLAVE_EN_URI = 'Centinela%40Fuga7'
const URI = `postgresql://trauma:${CLAVE_EN_URI}@127.0.0.1:5432/trauma`

/** El volcado que «emite» el pg_dump falso, con tildes para ver que no se estropean. */
const FALSO = String.raw`
import { writeFileSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
const [programa, ...argumentos] = process.argv.slice(2)
const aqui = path.dirname(process.argv[1])
// La consulta de comprobación de restaurar.ps1 va a su propio archivo, para no
// pisar lo que recibió la restauración.
const sufijo = argumentos.includes('-tAc') ? '-consulta' : ''
writeFileSync(path.join(aqui, 'recibido-' + programa + sufijo + '.json'),
  JSON.stringify({ argumentos, clave: process.env.PGPASSWORD ?? null }))
const modo = process.env.FALSO_MODO
if (programa === 'pg_dump') {
  if (modo === 'falla') {
    process.stderr.write('pg_dump: error: conexion fallida a ' + process.env.URI_DEL_TEST +
      '\nFATAL: password authentication failed, clave=' + process.env.PGPASSWORD + '\n')
    process.exit(1)
  }
  // Como pg_dump 17.6 y posteriores, el de producción: \restrict con una clave al
  // principio y \unrestrict con la misma DETRÁS del pie. Esa última línea es la
  // que se lleva un corte de pocos bytes, dejando el pie intacto.
  const clave = randomBytes(24).toString('hex')
  let sql = '--\n-- PostgreSQL database dump\n--\n\n\\restrict ' + clave + '\n\nSET client_encoding = ' + "'UTF8'" + ';\n'
  for (let i = 0; i < 60; i++) {
    sql += "INSERT INTO fichas VALUES (" + i + ", 'Fractura de cadera en el anciano: tracción, fémur, Núñez', '" +
      randomBytes(48).toString('hex') + "');\n"
  }
  if (modo !== 'cortado') sql += '\n--\n-- PostgreSQL database dump complete\n--\n\n\\unrestrict ' + clave + '\n\n'
  writeFileSync(path.join(aqui, 'emitido.sql'), sql)
  process.stdout.write(Buffer.from(sql, 'utf8'))
  process.exit(0)
}
if (programa === 'psql') {
  if (argumentos.includes('-tAc')) { process.stdout.write('2\n'); process.exit(0) }
  writeFileSync(path.join(aqui, 'recibido.sql'), readFileSync(0))
  process.exit(0)
}
`

interface Ejecucion {
  codigo: number | null
  pantalla: string
  registro: string
}

describe.skipIf(!HAY_POWERSHELL)('respaldar.ps1 y restaurar.ps1, ejecutados', () => {
  let raiz: string
  let app: string
  let bin: string
  let respaldos: string

  function ejecutar(guion: string, extra: string[], modo: string): Ejecucion {
    // El entorno del hijo se limpia de todo lo que el guion podría leer de
    // aquí en lugar del .env de la prueba: tests/setup.ts carga el .env de
    // desarrollo en este proceso, con su DATABASE_URI de verdad.
    const entorno = Object.fromEntries(
      Object.entries(process.env).filter(
        ([clave]) => !/^(DATABASE_URI|RESPALDOS_|DIAS_A_CONSERVAR|PG)/.test(clave),
      ),
    ) as NodeJS.ProcessEnv
    entorno.FALSO_MODO = modo
    entorno.URI_DEL_TEST = URI
    const r = spawnSync(
      POWERSHELL,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(RAIZ, 'scripts', guion),
        ...extra,
        '-DirectorioApp',
        app,
        '-BinPostgres',
        bin,
      ],
      { encoding: 'utf8', env: entorno, timeout: 60_000 },
    )
    const archivoRegistro = path.join(app, 'registros', 'respaldos.log')
    return {
      codigo: r.status,
      pantalla: `${r.stdout}\n${r.stderr}`,
      registro: existsSync(archivoRegistro) ? readFileSync(archivoRegistro, 'utf8') : '',
    }
  }

  const recibido = (programa: string) =>
    JSON.parse(readFileSync(path.join(bin, `recibido-${programa}.json`), 'utf8')) as {
      argumentos: string[]
      clave: string | null
    }

  const nuestros = () => readdirSync(respaldos).filter((n) => /^(base|medios)-/.test(n)).sort()

  function sinSecretos(texto: string) {
    for (const secreto of [CLAVE, CLAVE_EN_URI, URI]) {
      expect(texto, `se filtró «${secreto}»`).not.toContain(secreto)
    }
  }

  beforeAll(() => {
    raiz = mkdtempSync(path.join(os.tmpdir(), 'respaldo-windows-'))
    bin = path.join(raiz, 'bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(path.join(bin, 'falso.mjs'), FALSO)
    for (const programa of ['pg_dump', 'psql']) {
      writeFileSync(
        path.join(bin, `${programa}.cmd`),
        `@"${process.execPath}" "%~dp0falso.mjs" ${programa} %*\r\n`,
      )
    }
  })

  afterAll(() => {
    rmSync(raiz, { recursive: true, force: true })
  })

  beforeEach(() => {
    app = path.join(raiz, `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    respaldos = path.join(app, 'copias')
    mkdirSync(path.join(app, 'medios', 'modelos'), { recursive: true })
    mkdirSync(respaldos, { recursive: true })
    writeFileSync(path.join(app, 'medios', '.gitkeep'), '')
    writeFileSync(path.join(app, 'medios', 'modelos', 'fémur.glb'), 'glTF de prueba, con tilde')
    writeFileSync(path.join(app, '.env'), `DATABASE_URI=${URI}\r\nRESPALDOS_DIR=${respaldos}\r\n`)
    for (const f of readdirSync(bin).filter((n) => n.startsWith('recibido') || n === 'emitido.sql')) {
      rmSync(path.join(bin, f))
    }
  })

  it(
    'deja base y medios con nombres que el panel lista, y el volcado intacto',
    async () => {
      const r = ejecutar('respaldar.ps1', [], 'bien')
      expect(r.codigo, r.pantalla).toBe(0)

      const archivos = nuestros()
      expect(archivos).toHaveLength(2)
      for (const nombre of archivos) expect(esNombreDeRespaldo(nombre), nombre).toBe(true)
      expect(readdirSync(respaldos).filter((n) => n.endsWith('.parcial'))).toEqual([])

      // La pantalla de respaldos, tal cual, leyendo la carpeta que dice el .env.
      const previo = process.env.RESPALDOS_DIR
      process.env.RESPALDOS_DIR = respaldos
      try {
        const listados = await listarRespaldos()
        expect(listados.map((l) => l.tipo).sort()).toEqual(['base', 'medios'])
        for (const l of listados) {
          expect(Math.abs(new Date(l.creado).getTime() - Date.now())).toBeLessThan(5 * 60_000)
        }
      } finally {
        if (previo === undefined) delete process.env.RESPALDOS_DIR
        else process.env.RESPALDOS_DIR = previo
      }

      // Byte a byte lo que emitió pg_dump: ni una tilde cambiada por el camino.
      const base = archivos.find((n) => n.startsWith('base-'))!
      expect(gunzipSync(readFileSync(path.join(respaldos, base)))).toEqual(
        readFileSync(path.join(bin, 'emitido.sql')),
      )
      const medios = archivos.find((n) => n.startsWith('medios-'))!
      expect(gunzipSync(readFileSync(path.join(respaldos, medios))).toString('latin1')).toContain(
        'medios/modelos/',
      )

      expect(r.registro).toMatch(/ OK .*base-\d{8}-\d{6}\.sql\.gz/)
      expect(r.registro.trim().split(/\r?\n/)).toHaveLength(1)
    },
    60_000,
  )

  it(
    'la clave llega a pg_dump por PGPASSWORD y a ningún otro sitio',
    () => {
      const r = ejecutar('respaldar.ps1', [], 'bien')
      expect(r.codigo, r.pantalla).toBe(0)

      const pgDump = recibido('pg_dump')
      // Desescapada: libpq no entiende %40 dentro de PGPASSWORD.
      expect(pgDump.clave).toBe(CLAVE)
      expect(pgDump.argumentos).toContain('--dbname=postgresql://trauma@127.0.0.1:5432/trauma')
      expect(pgDump.argumentos).toContain('--no-password')
      sinSecretos(pgDump.argumentos.join(' '))
      sinSecretos(r.pantalla)
      sinSecretos(r.registro)
    },
    60_000,
  )

  it(
    'si pg_dump falla y repite la clave en su error, no queda archivo ni fuga',
    () => {
      // Un respaldo viejo que la retención borraría: tras un fallo tiene que
      // seguir ahí, o un mes de fallos se llevaría la última copia buena.
      const viejo = path.join(respaldos, 'base-20200101-000000.sql.gz')
      writeFileSync(viejo, 'viejo')
      const hace40 = new Date(Date.now() - 40 * 86_400_000)
      utimesSync(viejo, hace40, hace40)

      const r = ejecutar('respaldar.ps1', [], 'falla')
      expect(r.codigo).toBe(1)
      expect(nuestros()).toEqual(['base-20200101-000000.sql.gz'])
      expect(readdirSync(respaldos).filter((n) => n.endsWith('.parcial'))).toEqual([])
      // El error llega al registro, pero saneado.
      expect(r.registro).toMatch(/ ERROR .*pg_dump termino con codigo 1/)
      sinSecretos(r.pantalla)
      sinSecretos(r.registro)
    },
    60_000,
  )

  it(
    'un volcado sin el pie de pg_dump se descarta y el guion falla',
    () => {
      // El caso que .NET no detecta: un gzip cortado se descomprime «entero»
      // sin error. Solo el pie delata que el volcado no terminó.
      const r = ejecutar('respaldar.ps1', [], 'cortado')
      expect(r.codigo).toBe(1)
      expect(nuestros()).toEqual([])
      expect(r.registro).toMatch(/ ERROR .*incompleto/)
    },
    60_000,
  )

  it(
    'la retención borra a partir de los 31 días cumplidos, como find -mtime +30',
    () => {
      const conEdad = (nombre: string, dias: number) => {
        const ruta = path.join(respaldos, nombre)
        writeFileSync(ruta, 'x')
        const cuando = new Date(Date.now() - dias * 86_400_000)
        utimesSync(ruta, cuando, cuando)
      }
      conEdad('base-20200101-000000.sql.gz', 31.1)
      conEdad('medios-20200101-000000.tar.gz', 45)
      conEdad('base-20200102-000000.sql.gz', 30.9)
      // Lo que no es nuestro no se toca, por viejo que sea.
      conEdad('ajeno-20200101-000000.sql.gz', 400)
      // Un .parcial de un respaldo al que se le fue la luz se retira al día;
      // uno reciente puede ser de otra ejecución en marcha y se respeta.
      conEdad('base-20200103-000000.sql.gz.parcial', 2)
      conEdad('base-20200104-000000.sql.gz.parcial', 0.1)

      const r = ejecutar('respaldar.ps1', [], 'bien')
      expect(r.codigo, r.pantalla).toBe(0)
      const quedan = readdirSync(respaldos)
      expect(quedan).not.toContain('base-20200101-000000.sql.gz')
      expect(quedan).not.toContain('medios-20200101-000000.tar.gz')
      expect(quedan).toContain('base-20200102-000000.sql.gz')
      expect(quedan).toContain('ajeno-20200101-000000.sql.gz')
      expect(quedan).not.toContain('base-20200103-000000.sql.gz.parcial')
      expect(quedan).toContain('base-20200104-000000.sql.gz.parcial')
      expect(r.registro).toMatch(/retirados 2/)
    },
    60_000,
  )

  it(
    'restaurar.ps1 entrega a psql el volcado byte a byte y devuelve los medios',
    async () => {
      const r = ejecutar('respaldar.ps1', [], 'bien')
      expect(r.codigo, r.pantalla).toBe(0)
      const emitido = readFileSync(path.join(bin, 'emitido.sql'))
      const base = nuestros().find((n) => n.startsWith('base-'))!

      const modelo = path.join(app, 'medios', 'modelos', 'fémur.glb')
      rmSync(modelo)
      // El respaldo previo de restaurar.ps1 lleva la marca del segundo en que
      // corre; en el mismo segundo que el de arriba se llamaría igual.
      await new Promise((resolver) => setTimeout(resolver, 1100))

      const s = ejecutar('restaurar.ps1', [base, '-SinServicio', '-Confirmado'], 'bien')
      expect(s.codigo, s.pantalla).toBe(0)

      // Sin pasar por la tubería de texto de PowerShell, que cambia cada tilde
      // por un signo de interrogación.
      expect(readFileSync(path.join(bin, 'recibido.sql'))).toEqual(emitido)
      const psql = recibido('psql')
      expect(psql.clave).toBe(CLAVE)
      expect(psql.argumentos).toEqual(expect.arrayContaining(['--single-transaction', 'ON_ERROR_STOP=1']))
      expect(readFileSync(modelo, 'utf8')).toBe('glTF de prueba, con tilde')

      // El respaldo previo se hizo: ahora hay dos bases.
      expect(nuestros().filter((n) => n.startsWith('base-'))).toHaveLength(2)
      expect(s.registro).toMatch(/RESTAURACION-OK/)
      sinSecretos(s.pantalla)
      sinSecretos(s.registro)
    },
    120_000,
  )

  it(
    'restaurar.ps1 rechaza un volcado cortado antes de llegar a psql',
    () => {
      // El GZipStream de .NET Framework no exige el pie del gzip: un archivo al
      // que le faltan los últimos bytes se descomprime «entero» sin error. Con
      // un volcado real de PostgreSQL 17.11 cortado 20 bytes, el pie de pg_dump
      // seguía ahí —detrás va `\unrestrict CLAVE`, y el corte solo se llevó la
      // clave—, así que pasaba la comprobación, llegaba a psql y fallaba en la
      // última línea. Cada variante de abajo esquiva una comprobación distinta.
      const r = ejecutar('respaldar.ps1', [], 'bien')
      expect(r.codigo, r.pantalla).toBe(0)
      const bueno = readFileSync(path.join(respaldos, nuestros().find((n) => n.startsWith('base-'))!))
      const emitido = readFileSync(path.join(bin, 'emitido.sql'), 'utf8')

      const variantes: Record<string, Buffer> = {
        // El caso del revisor: el pie de pg_dump sobrevive, la clave no.
        'base-20200101-000000.sql.gz': bueno.subarray(0, bueno.length - 20),
        // Solo los 8 bytes del pie del gzip: el SQL sale completo, clave
        // incluida. Lo único que lo delata es el tamaño que declara el pie.
        'base-20200102-000000.sql.gz': bueno.subarray(0, bueno.length - 8),
        // Un gzip íntegro de un SQL al que se le cortó la clave del final.
        'base-20200103-000000.sql.gz': gzipSync(
          Buffer.from(emitido.replace(/^(\\unrestrict [0-9a-f]{10})[0-9a-f]+/m, '$1'), 'utf8'),
        ),
      }
      expect(variantes['base-20200103-000000.sql.gz'].length).toBeGreaterThan(100)

      for (const [nombre, contenido] of Object.entries(variantes)) {
        writeFileSync(path.join(respaldos, nombre), contenido)
        for (const f of readdirSync(bin).filter((n) => n.startsWith('recibido'))) rmSync(path.join(bin, f))
        rmSync(path.join(app, 'registros'), { recursive: true, force: true })

        const s = ejecutar('restaurar.ps1', [nombre, '-SinServicio', '-Confirmado', '-SinRespaldoPrevio'], 'bien')
        expect(s.codigo, `${nombre}\n${s.pantalla}`).toBe(1)
        expect(existsSync(path.join(bin, 'recibido.sql')), nombre).toBe(false)
        expect(existsSync(path.join(bin, 'recibido-psql.json')), nombre).toBe(false)
        expect(s.registro, nombre).toMatch(/RESTAURACION-ERROR .*esta cortado/)
      }

      // Y el mismo SQL, íntegro y comprimido por otro programa —zlib, como el
      // `gzip -9` de respaldar.sh—, se sigue aceptando: las comprobaciones
      // nuevas no pueden dejar sin restaurar los respaldos hechos en Linux.
      writeFileSync(path.join(respaldos, 'base-20200104-000000.sql.gz'), gzipSync(Buffer.from(emitido, 'utf8'), { level: 9 }))
      const control = ejecutar(
        'restaurar.ps1',
        ['base-20200104-000000.sql.gz', '-SinServicio', '-Confirmado', '-SinRespaldoPrevio'],
        'bien',
      )
      expect(control.codigo, control.pantalla).toBe(0)
      expect(readFileSync(path.join(bin, 'recibido.sql'), 'utf8')).toBe(emitido)
    },
    120_000,
  )

  it(
    'sin RESPALDOS_COPIA_DIR, cada línea del registro avisa de que no hay copia fuera del disco',
    () => {
      // El respaldo es bueno y sale OK, pero no protege de que el disco muera:
      // eso tiene que constar en la línea de cada noche, no solo en un documento.
      const r = ejecutar('respaldar.ps1', [], 'bien')
      expect(r.codigo, r.pantalla).toBe(0)
      expect(r.registro).toMatch(/ OK .*AVISO sin copia fuera del disco: RESPALDOS_COPIA_DIR no esta puesta/)
      expect(r.pantalla).toMatch(/AVISO: sin copia fuera del disco/)
    },
    60_000,
  )

  it(
    'una copia en el mismo disco se hace, sin .parcial, y aun así se avisa',
    () => {
      // La carpeta temporal de la prueba y la de la copia están en el mismo
      // disco: es exactamente el caso de un D: que es otra partición del disco
      // de C:, y la letra distinta no puede engañar al aviso.
      const copia = path.join(app, 'copia-mismo-disco')
      writeFileSync(path.join(app, '.env'), `DATABASE_URI=${URI}\r\nRESPALDOS_DIR=${respaldos}\r\nRESPALDOS_COPIA_DIR=${copia}\r\n`)
      // Lo que dejó una copia a la que se le fue la luz hace dos días.
      mkdirSync(copia, { recursive: true })
      const huerfano = path.join(copia, 'base-20200101-000000.sql.gz.parcial')
      writeFileSync(huerfano, 'cortado')
      const hace2 = new Date(Date.now() - 2 * 86_400_000)
      utimesSync(huerfano, hace2, hace2)

      const r = ejecutar('respaldar.ps1', [], 'bien')
      expect(r.codigo, r.pantalla).toBe(0)

      const copiados = readdirSync(copia).sort()
      expect(copiados).toEqual(nuestros())
      for (const n of copiados) {
        expect(readFileSync(path.join(copia, n))).toEqual(readFileSync(path.join(respaldos, n)))
      }
      expect(r.registro).toMatch(/ OK .*copia en .*AVISO sin copia fuera del disco: RESPALDOS_COPIA_DIR .* esta en el mismo disco \d/)
      sinSecretos(r.registro)
    },
    60_000,
  )

  it(
    'la comprobación de disco distingue lo que está en otra máquina',
    () => {
      // Sin segundo disco en la máquina de pruebas, el lado «no avisar» se prueba
      // con una ruta de red, que Disco-DeRuta resuelve sin salir a buscarla.
      const orden = [
        `. '${path.join(RAIZ, 'scripts', 'respaldo-comun.ps1')}'`,
        `$c = @{ CopiaDir = '\\\\otra-maquina\\respaldos'; RespaldosDir = '${respaldos}' }`,
        `Write-Output ('fuera=[' + (Riesgo-DeLaCopia $c '${app}' '${bin}') + ']')`,
        `$c.CopiaDir = '${path.join(app, 'otra')}'`,
        `Write-Output ('dentro=[' + (Riesgo-DeLaCopia $c '${app}' '${bin}') + ']')`,
        `Write-Output ('disco=[' + (Disco-DeRuta '${app}') + ']')`,
      ].join('; ')
      const r = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', orden], {
        encoding: 'utf8',
        timeout: 60_000,
      })
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout).toContain('fuera=[]')
      expect(r.stdout).toMatch(/dentro=\[sin copia fuera del disco: .*mismo disco \d/)
      // Por disco físico y no por letra: si Win32_DiskPartition dejara de
      // responder, caería a «unidad C:» y dos particiones parecerían dos discos.
      expect(r.stdout).toMatch(/disco=\[disco \d+\]/)
    },
    60_000,
  )

  it(
    'el instalador enseña el aviso de disco antes de registrar nada',
    () => {
      // Con -WhatIf no registra la tarea ni pide administrador, y recorre el
      // mismo cálculo que imprime el aviso al terminar la instalación de verdad.
      mkdirSync(path.join(app, 'scripts'), { recursive: true })
      writeFileSync(path.join(app, 'scripts', 'respaldar.ps1'), '')
      const r = ejecutar('instalar-respaldo-programado.ps1', ['-WhatIf'], 'bien')
      expect(r.codigo, r.pantalla).toBe(0)
      expect(r.pantalla).toMatch(/Copia: +AVISO, sin copia fuera del disco: RESPALDOS_COPIA_DIR no esta puesta/)
      sinSecretos(r.pantalla)
    },
    60_000,
  )
})
