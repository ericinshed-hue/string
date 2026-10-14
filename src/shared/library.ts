import { createHash } from 'crypto'
import path from 'path'

export function libraryId(folder: string): string {
  return createHash('sha1').update(path.resolve(folder).toLowerCase()).digest('hex').slice(0, 10)
}
