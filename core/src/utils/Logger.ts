import winston from 'winston';
import path from 'path';

export class Logger {
  private logger: winston.Logger;
  private context: string;

  constructor(context: string) {
    this.context = context;
    this.logger = this.createLogger();
  }

  private createLogger(): winston.Logger {
    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context }) => {
              return `${timestamp} [${context || this.context}] ${level}: ${message}`;
            })
          )
        }),
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5
        }),
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'combined.log'),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5
        })
      ]
    });
  }

  public info(message: string, meta?: any): void {
    this.logger.info(message, { context: this.context, ...meta });
  }

  public warn(message: string, meta?: any): void {
    this.logger.warn(message, { context: this.context, ...meta });
  }

  public error(message: string, error?: any): void {
    this.logger.error(message, { context: this.context, error });
  }

  public debug(message: string, meta?: any): void {
    this.logger.debug(message, { context: this.context, ...meta });
  }
}
