import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign as cryptoSign, KeyObject } from 'node:crypto'
import { verifyDiscordSignature } from '../signature-verify'

function rawPublicKeyHex(pub: KeyObject): string {
  const der = pub.export({ format: 'der', type: 'spki' }) as Buffer
  // SPKI prefix for Ed25519 is 12 bytes; the raw key is the last 32
  return der.subarray(der.length - 32).toString('hex')
}

function signMessage(priv: KeyObject, msg: Buffer): string {
  return cryptoSign(null, msg, priv).toString('hex')
}

describe('verifyDiscordSignature', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicKeyHex = rawPublicKeyHex(publicKey)

  it('verifies a valid signature over timestamp+body', () => {
    const timestamp = '1700000000'
    const rawBody = '{"type":1}'
    const signatureHex = signMessage(
      privateKey,
      Buffer.concat([Buffer.from(timestamp), Buffer.from(rawBody)]),
    )
    expect(
      verifyDiscordSignature({ publicKeyHex, signatureHex, timestamp, rawBody }),
    ).toBe(true)
  })

  it('rejects a tampered body', () => {
    const timestamp = '1700000000'
    const rawBody = '{"type":1}'
    const signatureHex = signMessage(
      privateKey,
      Buffer.concat([Buffer.from(timestamp), Buffer.from(rawBody)]),
    )
    expect(
      verifyDiscordSignature({
        publicKeyHex,
        signatureHex,
        timestamp,
        rawBody: '{"type":2}',
      }),
    ).toBe(false)
  })

  it('rejects a bad signature (wrong length)', () => {
    expect(
      verifyDiscordSignature({
        publicKeyHex,
        signatureHex: 'deadbeef',
        timestamp: '1',
        rawBody: 'x',
      }),
    ).toBe(false)
  })

  it('rejects a malformed public key', () => {
    expect(
      verifyDiscordSignature({
        publicKeyHex: 'not-hex',
        signatureHex: 'a'.repeat(128),
        timestamp: '1',
        rawBody: 'x',
      }),
    ).toBe(false)
  })

  it('rejects empty fields', () => {
    expect(
      verifyDiscordSignature({
        publicKeyHex,
        signatureHex: '',
        timestamp: '1',
        rawBody: 'x',
      }),
    ).toBe(false)
    expect(
      verifyDiscordSignature({
        publicKeyHex,
        signatureHex: 'a'.repeat(128),
        timestamp: '',
        rawBody: 'x',
      }),
    ).toBe(false)
  })

  it('rejects signature from a different keypair', () => {
    const other = generateKeyPairSync('ed25519')
    const timestamp = '1700000000'
    const rawBody = '{"type":1}'
    const sigFromOther = signMessage(
      other.privateKey,
      Buffer.concat([Buffer.from(timestamp), Buffer.from(rawBody)]),
    )
    expect(
      verifyDiscordSignature({
        publicKeyHex,
        signatureHex: sigFromOther,
        timestamp,
        rawBody,
      }),
    ).toBe(false)
  })
})
