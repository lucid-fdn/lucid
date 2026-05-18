#!/usr/bin/env node

import http from 'node:http'

const port = Number(process.env.MOCK_WORKER_PORT || 8789)
const host = process.env.MOCK_WORKER_HOST || '127.0.0.1'
const requests = []

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__requests') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(requests))
    return
  }

  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
    })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
})

server.listen(port, host, () => {
  console.log(`worker trigger mock listening on http://${host}:${port}`)
})
