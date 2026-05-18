import { createOperatorAppRuntimeClient } from '@lucid/app-runtime-sdk'

const cockpit = createOperatorAppRuntimeClient({
  baseUrl: process.env.LUCID_URL ?? 'http://localhost:3000',
  appId: process.env.LUCID_APP_ID ?? '',
  auth: { mode: 'bearer', token: process.env.LUCID_TOKEN ?? '' },
})

export async function readOwnerCockpit() {
  const [summary, usage, origins] = await Promise.all([
    cockpit.getSummary(),
    cockpit.getUsage(),
    cockpit.listOrigins(),
  ])
  return { summary, usage, origins }
}
