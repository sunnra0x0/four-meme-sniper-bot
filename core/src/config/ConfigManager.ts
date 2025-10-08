import dotenv from 'dotenv';
import { Logger } from './Logger';

export class ConfigManager {
  private logger: Logger;
  private config: Map<string, any> = new Map();

  constructor() {
    this.logger = new Logger('ConfigManager');
    this.loadEnvironmentVariables();
  }

  private loadEnvironmentVariables(): void {
    try {
      dotenv.config({ path: './config/.env' });
      
      // Load all environment variables
      Object.keys(process.env).forEach(key => {
        this.config.set(key, process.env[key]);
      });
      
      this.logger.info('✅ Environment variables loaded successfully');
    } catch (error) {
      this.logger.error('❌ Failed to load environment variables:', error);
    }
  }

  public get(key: string, defaultValue?: any): any {
    const value = this.config.get(key);
    return value !== undefined ? value : defaultValue;
  }

  public set(key: string, value: any): void {
    this.config.set(key, value);
  }

  public getNumber(key: string, defaultValue?: number): number {
    const value = this.get(key, defaultValue);
    return typeof value === 'number' ? value : parseFloat(value) || defaultValue || 0;
  }

  public getBoolean(key: string, defaultValue?: boolean): boolean {
    const value = this.get(key, defaultValue);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return defaultValue || false;
  }

  public getArray(key: string, defaultValue?: string[]): string[] {
    const value = this.get(key, defaultValue);
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.split(',').map(item => item.trim());
    }
    return defaultValue || [];
  }

  public getAll(): Map<string, any> {
    return new Map(this.config);
  }

  public validate(): boolean {
    const requiredKeys = [
      'BSC_RPC_URL',
      'PRIVATE_KEY',
      'MONGODB_URI',
      'REDIS_URL'
    ];

    const missingKeys = requiredKeys.filter(key => !this.get(key));
    
    if (missingKeys.length > 0) {
      this.logger.error(`❌ Missing required configuration keys: ${missingKeys.join(', ')}`);
      return false;
    }

    this.logger.info('✅ Configuration validation passed');
    return true;
  }
}
