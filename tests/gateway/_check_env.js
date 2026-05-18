const fs = require('fs')
const path = require('path')
const envPath = path.resolve(__dirname, '../../.env.local')
const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
const matches = lines.filter(l => l.match(/LUCIDGATEWAY|LITELLM|LLM_PROXY|GATEWAY/i))
matches.forEach(l => {
  const eq = l.indexOf('=')
  if (eq > 0) {
    const k = l.slice(0, eq).trim()
    const v = l.slice(eq + 1).trim()
    console.log(k + '=' + v.slice(0, 20) + '...')
  }
})