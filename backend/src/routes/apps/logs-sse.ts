import { Transform } from "node:stream";

/**
 * Transform stream that buffers partial lines and formats them as SSE data frames.
 */
export class SSELineTransform extends Transform {
  private buffer = "";

  constructor() {
    super();
  }

  _transform(chunk: Buffer, _encoding: string, callback: () => void): void {
    this.buffer += chunk.toString();

    // Split on newlines, keeping the last incomplete line in buffer.
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    // Send complete lines as SSE data frames.
    for (const line of lines) {
      this.push(`data: ${line}\n\n`);
    }

    callback();
  }

  _flush(callback: () => void): void {
    // Flush any remaining buffered content.
    if (this.buffer) {
      this.push(`data: ${this.buffer}\n\n`);
    }
    callback();
  }
}
