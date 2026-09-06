import crypto from 'node:crypto'
import pg from 'pg'

const clave = 'Diagnostico-2026-TraumaHub'
const salt = crypto.randomBytes(32).toString('hex')
const hash = crypto.pbkdf2Sync(clave, salt, 25000, 512, 'sha256').toString('hex')

const pool = new pg.Pool({ connectionString: process.env.URI })
const email = 'diagnostico@traumahub.local'

await pool.query('delete from usuarios where email = $1', [email])
const { rows } = await pool.query(
  `insert into usuarios (nombre, rol, activo, institucion, email, hash, salt, updated_at, created_at)
   values ($1,'admin',true,$2,$3,$4,$5, now(), now()) returning id, rol, activo`,
  ['Cuenta de diagnostico', 'temporal', email, hash, salt],
)
console.log('creada:', JSON.stringify(rows[0]))
console.log('correo:', email)
console.log('clave: ', clave)
await pool.end()
