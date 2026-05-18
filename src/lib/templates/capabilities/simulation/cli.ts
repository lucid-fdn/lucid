#!/usr/bin/env npx tsx
import 'dotenv/config'

import { WEB3_CAPABILITY_TEMPLATES } from '@/lib/templates/capabilities/catalog'
import { assertWeb3SimulationReady, runWeb3TemplateSimulation } from './runner'
import { getWeb3SimulationScenario } from './web3-fixtures'

function main() {
  for (const manifest of WEB3_CAPABILITY_TEMPLATES) {
    const scenario = getWeb3SimulationScenario(manifest.key)
    const result = runWeb3TemplateSimulation({ manifest, scenario })
    assertWeb3SimulationReady(result)
    console.log(`✓ ${manifest.key}: ${scenario.title}`)
  }
  console.log(`\n${WEB3_CAPABILITY_TEMPLATES.length} Web3 capability simulation(s) passed.`)
}

main()
