import crypto from 'crypto'

// Configuration from environment variables.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || ''
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_HOSTED_BOT_TOKEN || ''

function assertConfig(): void {
  if (!ENCRYPTION_KEY || !/^[a-fA-F0-9]{64}$/.test(ENCRYPTION_KEY)) {
    throw new Error('ENCRYPTION_KEY must be set to a 64-char hex key')
  }
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN (or TELEGRAM_HOSTED_BOT_TOKEN) must be set')
  }
}

/**
 * Encrypt secrets using AES-256-GCM
 */
function encryptSecrets(data: Record<string, string>, keyHex: string): string {
  const iv = crypto.randomBytes(16)
  const key = Buffer.from(keyHex, 'hex')
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  
  const plaintext = JSON.stringify(data)
  let ciphertext = cipher.update(plaintext, 'utf8')
  ciphertext = Buffer.concat([ciphertext, cipher.final()])
  
  const authTag = cipher.getAuthTag()
  
  // Format: iv:authTag:ciphertext (all in hex)
  const encrypted = `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
  
  console.log('✅ Encrypted successfully')
  console.log('  IV length:', iv.toString('hex').length, '(should be 32)')
  console.log('  AuthTag length:', authTag.toString('hex').length, '(should be 32)')
  console.log('  Ciphertext length:', ciphertext.toString('hex').length, '(should be EVEN)')
  console.log('  Total encrypted length:', encrypted.length)
  
  return encrypted
}

/**
 * Test decryption to verify it works
 */
function testDecrypt(encrypted: string, keyHex: string): boolean {
  try {
    const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':')
    
    console.log('\n🔍 Testing decryption...')
    console.log('  IV length:', ivHex.length)
    console.log('  AuthTag length:', authTagHex.length)
    console.log('  Ciphertext length:', ciphertextHex.length)
    
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const ciphertext = Buffer.from(ciphertextHex, 'hex')
    const key = Buffer.from(keyHex, 'hex')

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(ciphertext, undefined, 'utf8')
    decrypted += decipher.final('utf8')

    const data = JSON.parse(decrypted)
    console.log('✅ Decryption test PASSED')
    console.log('  Decrypted data:', data)
    
    return true
  } catch (error) {
    console.error('❌ Decryption test FAILED:', error)
    return false
  }
}

async function main() {
  assertConfig()
  console.log('🔐 Encrypting Telegram Bot Token\n')
  
  // 1. Encrypt the bot token
  const secrets = {
    bot_token: TELEGRAM_BOT_TOKEN
  }
  
  const encryptedData = encryptSecrets(secrets, ENCRYPTION_KEY)
  
  // 2. Test decryption
  if (!testDecrypt(encryptedData, ENCRYPTION_KEY)) {
    console.error('\n❌ Encryption verification failed! Do not proceed.')
    process.exit(1)
  }
  
  console.log('\n📝 Encrypted data to update in Supabase:')
  console.log(encryptedData)
  console.log('\n📄 Writing to file for accurate copy...')
  
  // Write to file to avoid terminal wrapping issues
  const fs = await import('fs')
  await fs.promises.writeFile('encrypted-data.txt', encryptedData, 'utf8')
  
  console.log('✅ Encrypted data saved to: encrypted-data.txt')
  console.log('\n✅ Encryption complete!')
}

main().catch(console.error)
