/**
 * Migrate passports from Lucid-L2 file-based JSON to Postgres.
 * Handles object-keyed format: { passports: { passport_id: {...}, ... } }
 * Usage: DATABASE_URL=... node scripts/migrate-passports-to-pg.js [path]
 */
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const jsonPath = process.argv[2] || 'c:\\Lucid-L2\\data\\passports\\passports.json'
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('❌ DATABASE_URL required'); process.exit(1) }

async function main() {
  const raw = fs.readFileSync(path.resolve(jsonPath), 'utf-8')
  const parsed = JSON.parse(raw)

  // Support both array and object-keyed formats
  let passports
  if (Array.isArray(parsed)) {
    passports = parsed
  } else if (parsed.passports && typeof parsed.passports === 'object' && !Array.isArray(parsed.passports)) {
    passports = Object.values(parsed.passports)
  } else if (Array.isArray(parsed.passports)) {
    passports = parsed.passports
  } else if (Array.isArray(parsed.data)) {
    passports = parsed.data
  } else {
    console.error('❌ Unrecognized format'); process.exit(1)
  }

  console.log(`📊 Found ${passports.length} passports to migrate`)

  const pool = new Pool({ connectionString: DATABASE_URL, max: 3 })

  let inserted = 0, skipped = 0, errors = 0

  for (const p of passports) {
    if (!p.passport_id || !p.type || !p.owner) {
      console.warn(`⚠️  Skipping invalid: ${p.passport_id || '(no id)'}`)
      skipped++
      continue
    }
    try {
      const createdAt = p.created_at
        ? new Date(typeof p.created_at === 'number' ? p.created_at : p.created_at).toISOString()
        : new Date().toISOString()
      const updatedAt = p.updated_at
        ? new Date(typeof p.updated_at === 'number' ? p.updated_at : p.updated_at).toISOString()
        : createdAt

      const result = await pool.query(
        `INSERT INTO passports
          (passport_id, type, owner, metadata, name, description, version, tags, status,
           on_chain_pda, on_chain_tx, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (passport_id) DO NOTHING
         RETURNING passport_id`,
        [
          p.passport_id,
          p.type,
          p.owner,
          JSON.stringify(p.metadata || {}),
          p.name || null,
          p.description || null,
          p.version || null,
          p.tags || [],
          p.status || 'active',
          p.on_chain_pda || null,
          p.on_chain_tx || null,
          createdAt,
          updatedAt,
        ]
      )
      if (result.rowCount > 0) inserted++
      else skipped++
    } catch (err) {
      errors++
      console.error(`   ❌ ${p.passport_id}: ${err.message}`)
    }
  }

  await pool.end()

  console.log('\n📊 Migration Summary:')
  console.log(`   ✅ Inserted: ${inserted}`)
  console.log(`   ⏭️  Skipped: ${skipped}`)
  console.log(`   ❌ Errors: ${errors}`)
  if (errors === 0) console.log('\n✅ Migration complete!')
  else { console.log('\n⚠️  Completed with errors'); process.exit(1) }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })