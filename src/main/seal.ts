import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb } from 'crypto'

export const SEAL_MAGIC = 'STRING-ENC-1'
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

type Envelope = { salt: string; iv: string; tag: string; data: string }

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, 32, SCRYPT, (error, key) => {
      if (error) reject(error)
      else resolve(key as Buffer)
    })
  })
}

export function isSealed(content: string): boolean {
  return content.startsWith(`${SEAL_MAGIC}\n`) || content.startsWith(`${SEAL_MAGIC}\r\n`)
}

export async function sealText(plain: string, password: string): Promise<string> {
  if (!password) throw new Error('Enter a password')
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveKey(password, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const body: Envelope = {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64')
  }
  return `${SEAL_MAGIC}\n${JSON.stringify(body)}\n`
}

export async function openText(envelope: string, password: string): Promise<string> {
  if (!password) throw new Error('Enter a password')
  if (!isSealed(envelope)) throw new Error('This note is not encrypted')
  const body = envelope.slice(envelope.indexOf('\n') + 1).trim()
  let parsed: Envelope
  try {
    parsed = JSON.parse(body) as Envelope
  } catch {
    throw new Error('This note is damaged')
  }
  const key = await deriveKey(password, Buffer.from(parsed.salt, 'base64'))
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('Wrong password')
  }
}
