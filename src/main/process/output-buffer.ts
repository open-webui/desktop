// Bound retained output by bytes, including when a process emits one huge chunk.
export class OutputBuffer {
  private chunks: Buffer[] = []
  private bytes = 0
  private truncated = false

  constructor(private readonly limit = 256 * 1024) {}

  append(data: string): void {
    if (!data) return
    const chunk = Buffer.from(data)
    this.chunks.push(chunk)
    this.bytes += chunk.length
    while (this.bytes > this.limit) {
      this.truncated = true
      const first = this.chunks[0]
      const excess = this.bytes - this.limit
      if (first.length <= excess) {
        this.bytes -= first.length
        this.chunks.shift()
      } else {
        let offset = excess
        while (offset < first.length && (first[offset] & 0xc0) === 0x80) offset++
        this.chunks[0] = Buffer.from(first.subarray(offset))
        this.bytes -= offset
      }
    }
  }

  read(): string {
    return (
      (this.truncated ? '[Earlier output omitted]\r\n' : '') + Buffer.concat(this.chunks).toString()
    )
  }

  clear(): void {
    this.chunks = []
    this.bytes = 0
    this.truncated = false
  }
}
