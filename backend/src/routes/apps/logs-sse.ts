import { StringDecoder } from "node:string_decoder";
import { Transform } from "node:stream";

/**
 * Transform stream that buffers partial lines and formats them as SSE data frames.
 * Handles multi-byte UTF-8 sequences that may span chunk boundaries.
 */
export class SSELineTransform extends Transform {
  private decoder = new StringDecoder("utf8");
  private buffer = "";

  constructor() {
    super();
  }

  _transform(chunk: Buffer, _encoding: string, callback: () => void): void {
    // Decode chunk with proper UTF-8 handling for boundary splits.
    const text = this.decoder.write(chunk);
    this.buffer += text;

    // Split on newlines (both \n and \r\n), keeping incomplete last line in buffer.
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";

    // Send complete lines as SSE data frames.
    for (const line of lines) {
      this.push(`data: ${line}\n\n`);
    }

    callback();
  }

  _flush(callback: () => void): void {
    // Flush any remaining text from the decoder.
    const final = this.decoder.end();
    if (final) {
      this.buffer += final;
    }

    // Flush any remaining buffered content.
    if (this.buffer) {
      this.push(`data: ${this.buffer}\n\n`);
    }
    callback();
  }
}
