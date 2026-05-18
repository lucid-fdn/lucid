require('dotenv').config({ path: '.env.local' })

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

console.log('🔧 Loading Supabase configuration...')

// Check for DATABASE_URL first
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in environment variables')
  console.error('   Please set DATABASE_URL in .env.local')
  console.error('   Example: DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres')
  process.exit(1)
}

console.log('✅ DATABASE_URL found')
console.log('   Using connection:', connectionString.replace(/:([^:@]+)@/, ':****@'))

const client = new Client({ 
  connectionString,
  ssl: { rejectUnauthorized: false } // Required for Supabase connections
})

async function runMigration(filename) {
  console.log(`\n🔄 Running migration: ${filename}`)
  
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', filename), 'utf8')
  
  try {
    await client.query(sql)
    console.log(`✅ Migration ${filename} completed successfully`)
    return true
  } catch (err) {
    console.error(`❌ Migration ${filename} failed:`, err.message)
    return false
  }
}

async function main() {
  console.log('🚀 Starting migrations...')
  
  try {
    await client.connect()
    console.log('✅ Connected to database\n')
    
    const migrations = [
      '053_key_templates.sql',
      '054_per_project_keys.sql'
    ]
    
    for (const migration of migrations) {
      const success = await runMigration(migration)
      if (!success) {
        console.error('\n❌ Migration failed. Stopping.')
        process.exit(1)
      }
    }
    
    console.log('\n✅ All migrations completed successfully!')
  } catch (err) {
    console.error('❌ Connection failed:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
