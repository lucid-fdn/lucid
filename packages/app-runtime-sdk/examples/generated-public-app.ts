import { createPublicAppRuntimeClient } from '@lucid/app-runtime-sdk'

const app = createPublicAppRuntimeClient({
  baseUrl: process.env.NEXT_PUBLIC_LUCID_URL ?? 'http://localhost:3000',
  slug: process.env.NEXT_PUBLIC_LUCID_APP_SLUG ?? 'support-concierge',
  token: process.env.NEXT_PUBLIC_LUCID_APP_TOKEN,
  auth: { mode: 'none' },
})

export async function askGeneratedApp(question: string) {
  const { session } = await app.createSession({ metadata: { source: 'sdk-example' } })
  const { chat } = await app.sendChat({
    visitor_session_id: session.id,
    messages: [{ role: 'user', content: question }],
  })
  return chat.message?.content ?? ''
}
