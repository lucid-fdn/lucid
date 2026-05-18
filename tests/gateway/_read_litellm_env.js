const fs = require('fs')
const path = require('path')

const envPath = 'c:/lucid-plateform-core/.env'
const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  .filter(l => l.match(/LITELLM/i) && !l.startsWith('#'))

const out = lines.map(l => {
  const eq = l.indexOf('=')
  if (eq > 0) {
    const k = l.slice(0, eq).trim()
    let v = l.slice(eq + 1).trim()
    // Strip quotes
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (k === 'LITELLM_API_KEY') return k + '=' + v.slice(0, 8) + '...(len=' + v.length + ')'
    return k + '=' + v
  }
  return l
}).join('\n')

fs.writeFileSync('_env_check.txt', out, 'utf-8')
console.log(out)