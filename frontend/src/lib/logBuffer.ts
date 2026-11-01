/**
 * Capped line buffer for logs with line numbers and ANSI stripping.
 * Stores up to `maxLines` (default 5000), dropping oldest lines when exceeded.
 */

export interface LogLine {
  n: number; // Line number (stable, incremental)
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
  private nextN = 1; // Line numbers start at 1
  private readonly maxLines: number;

  constructor(maxLines = 5000) {
    this.maxLines = maxLines;
  }

  /**
   * Add lines, stripping ANSI escapes.
   * Returns a new array and the count of lines dropped.
   */
  append(newLines: string[]): { lines: LogLine[]; dropped: number } {
    const cleaned = newLines.map((line) => ({
      n: this.nextN++,
      text: stripAnsi(line),
    }));
    this.lines.push(...cleaned);

    let dropped = 0;
    // Drop oldest lines efficiently if over capacity
    if (this.lines.length > this.maxLines) {
      dropped = this.lines.length - this.maxLines;
      this.lines = this.lines.slice(-this.maxLines);
    }
    return { lines: this.getLines(), dropped };
  }

  /** Clear all lines. */
  clear(): void {
    this.lines = [];
  }

  /** Get all lines as a fresh array. */
  getLines(): LogLine[] {
    return [...this.lines];
  }

  /** Export as plain text. */
  toText(): string {
    return this.lines.map((line) => line.text).join('\n');
  }
}
