export class LineRingBuffer {
  private readonly lines: string[] = []
  private partial = ''

  constructor(private readonly capacity = 500) {}

  append(chunk: string, source?: 'stdout' | 'stderr'): void {
    const normalized = (this.partial + chunk).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const parts = normalized.split('\n')
    this.partial = parts.pop() ?? ''
    for (const line of parts) this.pushLine(line, source)
  }

  add(line: string, source?: 'stdout' | 'stderr'): void {
    this.pushLine(line, source)
  }

  toArray(): string[] {
    const result = [...this.lines]
    if (this.partial) result.push(this.partial)
    return result
  }

  private pushLine(line: string, source?: 'stdout' | 'stderr'): void {
    const timestamp = new Date().toISOString()
    const prefix = source ? ` [${source}]` : ''
    this.lines.push(`${timestamp}${prefix} ${line}`)
    if (this.lines.length > this.capacity) {
      this.lines.splice(0, this.lines.length - this.capacity)
    }
  }
}
