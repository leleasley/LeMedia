type LogLevel = "info" | "warn" | "error" | "debug";

class Logger {
  private isDev = process.env.NODE_ENV === "development";

  private timestamp(): string {
    return new Date().toISOString();
  }

  private sanitizeError(error: unknown): string {
    if (error instanceof Error) {
      if (this.isDev) return error.stack || error.message;
      return error.message;
    }
    return String(error);
  }

  info(message: string, meta?: Record<string, unknown>) {
    console.log(`[${this.timestamp()}] [INFO] ${message}`, meta ? JSON.stringify(meta) : "");
  }

  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(`[${this.timestamp()}] [WARN] ${message}`, meta ? JSON.stringify(meta) : "");
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    const safeError = error ? this.sanitizeError(error) : "";
    const metaStr = meta ? JSON.stringify(meta) : "";
    console.error(`[${this.timestamp()}] [ERROR] ${message}`, safeError, metaStr);
  }

  debug(message: string, meta?: Record<string, unknown>) {
    if (this.isDev) {
      console.debug(`[${this.timestamp()}] [DEBUG] ${message}`, meta ? JSON.stringify(meta) : "");
    }
  }
}

export const logger = new Logger();
