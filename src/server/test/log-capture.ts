import { Writable } from 'node:stream'

/** A `logStream` for `createTestApp` that keeps everything the app logs, as text. */
export function captureLogs(): { stream: Writable; text: () => string } {
  let text = ''
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      text += chunk.toString()
      done()
    },
  })
  return { stream, text: () => text }
}
