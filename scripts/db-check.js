const { Pool } = require('pg')
const DB_URL = process.env.DATABASE_URL || process.env.RAILWAY_DATABASE_URL

if (!DB_URL) {
  console.error('Missing DATABASE_URL or RAILWAY_DATABASE_URL.')
  process.exit(1)
}

const p = new Pool({ connectionString: DB_URL, max: 1 })

async function main() {
  // Check if passports table exists and its columns
  const { rows: cols } = await p.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='passports' ORDER BY ordinal_position"
  )
  if (cols.length === 0) {
    console.log('passports table does NOT exist')
  } else {
    console.log('passports table columns:', JSON.stringify(cols, null, 2))
  }

  // Check if receipt_events exists
  const { rows: re } = await p.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='receipt_events' ORDER BY ordinal_position"
  )
  console.log('receipt_events columns:', re.length === 0 ? 'TABLE DOES NOT EXIST' : JSON.stringify(re.map(r => r.column_name)))

  // Check all tables
  const { rows: tables } = await p.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
  )
  console.log('All public tables:', tables.map(t => t.tablename))

  await p.end()
}
main().catch(e => { console.error(e.message); p.end() })
