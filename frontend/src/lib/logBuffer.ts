/**
 * Capped line buffer for logs with stable incrementing ids.
 * Stores up to `maxLines` (default 5000), dropping oldest lines when exceeded.
 * Applies ANSI/OSC escape stripping on ingest.
 */

interface LogLine {
  id: number;
  text: string;
}

/** Strips ANSI color and OSC escape sequences. */
function stripAnsi(line: string): string {
  // CSI (Control Sequence Introducer): ESC [ ... (letter)
  // OSC (Operating System Command): ESC ] ... (ST or BEL)
  return line
    // SGR (Select Graphic Rendition): ESC [ ... m
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')
    // OSC: ESC ] ... (ESC \ or BEL)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\].*?(?:\x1b\\|\x07)/g, '');
}

export class LogBuffer {
  private lines: LogLine[] = [];
  private nextId = 0;
  private readonly maxLines: number;

  constructor(maxLines = 5000) {
    this.maxLines = maxLines;
  }

  /** Add lines, stripping ANSI escapes. Return the count of lines dropped. */
  append(newLines: string[]): number {
    const cleaned = newLines.map((line) => ({
      id: this.nextId++,
      text: stripAnsi(line),
    }));
    this.lines.push(...cleaned);

    let dropped = 0;
    while (this.lines.length > this.maxLines) {
      this.lines.shift();
      dropped++;
    }
    return dropped;
  }

  /** Clear all lines. */
  clear(): void {
    this.lines = [];
  }

  /** Get all lines (for rendering). */
  getLines(): LogLine[] {
    return this.lines;
  }

  /** Get the count of stored lines. */
  getLength(): number {
    return this.lines.length;
  }

  /** Export as plain text. */
  toText(): string {
    return this.lines.map((line) => line.text).join('\n');
  }
}
