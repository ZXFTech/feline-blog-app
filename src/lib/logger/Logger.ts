enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR,
}

const levelColorMap = {
  [LogLevel.INFO]: "green",
  [LogLevel.DEBUG]: "blue",
  [LogLevel.WARN]: "orange",
  [LogLevel.ERROR]: "red",
};

class Logger {
  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }
  private level: LogLevel;
  private environment = !window ? "Node" : "Browser";
  private timeStamp = new Date().toISOString();
  private messageStatus = `[${this.environment}] [${this.timeStamp}]`;

  error(...args: any[]): void {
    console.log(
      `${this.messageStatus} %c${args}`,
      `color: ${levelColorMap[this.level]},font-weight: bold;`
    );
  }
  log(...args: any[]): void {
    console.log(
      `${this.messageStatus} %c${args}`,
      `color: ${levelColorMap[this.level]},font-weight: bold;`
    );
  }
  warning(...args: any[]): void {
    console.log(
      `${this.messageStatus} %c${args}`,
      `color: ${levelColorMap[this.level]},font-weight: bold;`
    );
  }
  success(...args: any[]): void {
    console.log(
      `${this.messageStatus} %c${args}`,
      `color: ${levelColorMap[this.level]},font-weight: bold;`
    );
  }
}
const globalForLogger = globalThis as unknown as { logger: Logger };

const logger = globalForLogger.logger || new Logger();

export default logger;

if (process.env.NODE_ENV !== "production") {
  globalForLogger.logger = logger;
}
