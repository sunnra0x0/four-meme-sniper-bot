import { ethers } from 'ethers';
import { Logger } from './Logger';

export class GasOptimizer {
  private logger: Logger;
  private provider: ethers.JsonRpcProvider;
  private gasPriceHistory: number[] = [];
  private maxHistorySize: number = 100;

  constructor(provider: ethers.JsonRpcProvider) {
    this.logger = new Logger('GasOptimizer');
    this.provider = provider;
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('🔧 Initializing Gas Optimizer...');
      
      // Load initial gas price history
      await this.updateGasPriceHistory();
      
      this.logger.info('✅ Gas Optimizer initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Gas Optimizer:', error);
      throw error;
    }
  }

  public async getOptimalGasPrice(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      const currentGasPrice = feeData.gasPrice || BigInt(0);
      
      // Calculate optimal gas price based on network conditions
      const optimalGasPrice = await this.calculateOptimalGasPrice(currentGasPrice);
      
      this.logger.info(`⛽ Optimal gas price: ${ethers.formatUnits(optimalGasPrice, 'gwei')} gwei`);
      
      return optimalGasPrice;
    } catch (error) {
      this.logger.error('Error getting optimal gas price:', error);
      return BigInt(5 * 1e9); // Fallback to 5 gwei
    }
  }

  private async calculateOptimalGasPrice(currentGasPrice: bigint): Promise<bigint> {
    try {
      // Get network congestion level
      const congestionLevel = await this.getNetworkCongestion();
      
      // Calculate optimal gas price based on congestion
      let multiplier = 1.0;
      
      if (congestionLevel > 0.8) {
        multiplier = 1.5; // High congestion - increase gas price
      } else if (congestionLevel > 0.6) {
        multiplier = 1.2; // Medium congestion - slight increase
      } else if (congestionLevel < 0.3) {
        multiplier = 0.9; // Low congestion - can use lower gas price
      }
      
      const optimalGasPrice = BigInt(Math.floor(Number(currentGasPrice) * multiplier));
      
      // Ensure minimum gas price
      const minGasPrice = BigInt(1 * 1e9); // 1 gwei minimum
      return optimalGasPrice > minGasPrice ? optimalGasPrice : minGasPrice;
      
    } catch (error) {
      this.logger.error('Error calculating optimal gas price:', error);
      return currentGasPrice;
    }
  }

  private async getNetworkCongestion(): Promise<number> {
    try {
      // Analyze recent gas price history to determine congestion
      if (this.gasPriceHistory.length < 10) {
        return 0.5; // Default to medium congestion
      }
      
      // Calculate gas price volatility
      const recentPrices = this.gasPriceHistory.slice(-10);
      const avgPrice = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
      const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - avgPrice, 2), 0) / recentPrices.length;
      const volatility = Math.sqrt(variance) / avgPrice;
      
      // Higher volatility indicates higher congestion
      return Math.min(volatility * 2, 1.0);
      
    } catch (error) {
      this.logger.error('Error calculating network congestion:', error);
      return 0.5;
    }
  }

  private async updateGasPriceHistory(): Promise<void> {
    try {
      const feeData = await this.provider.getFeeData();
      const gasPrice = Number(feeData.gasPrice || BigInt(0)) / 1e9; // Convert to gwei
      
      this.gasPriceHistory.push(gasPrice);
      
      // Keep only recent history
      if (this.gasPriceHistory.length > this.maxHistorySize) {
        this.gasPriceHistory = this.gasPriceHistory.slice(-this.maxHistorySize);
      }
      
    } catch (error) {
      this.logger.error('Error updating gas price history:', error);
    }
  }

  public async estimateGasLimit(transaction: any): Promise<bigint> {
    try {
      // Estimate gas limit for transaction
      const estimatedGas = await this.provider.estimateGas(transaction);
      
      // Add buffer for safety
      const gasBuffer = BigInt(Math.floor(Number(estimatedGas) * 0.1)); // 10% buffer
      const gasLimit = estimatedGas + gasBuffer;
      
      this.logger.info(`⛽ Estimated gas limit: ${gasLimit.toString()}`);
      
      return gasLimit;
    } catch (error) {
      this.logger.error('Error estimating gas limit:', error);
      return BigInt(200000); // Fallback gas limit
    }
  }

  public async getGasPriceTrend(): Promise<'INCREASING' | 'DECREASING' | 'STABLE'> {
    try {
      if (this.gasPriceHistory.length < 5) {
        return 'STABLE';
      }
      
      const recentPrices = this.gasPriceHistory.slice(-5);
      const firstHalf = recentPrices.slice(0, 3);
      const secondHalf = recentPrices.slice(2);
      
      const firstAvg = firstHalf.reduce((sum, price) => sum + price, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, price) => sum + price, 0) / secondHalf.length;
      
      const change = (secondAvg - firstAvg) / firstAvg;
      
      if (change > 0.05) return 'INCREASING';
      if (change < -0.05) return 'DECREASING';
      return 'STABLE';
      
    } catch (error) {
      this.logger.error('Error calculating gas price trend:', error);
      return 'STABLE';
    }
  }

  public getGasPriceHistory(): number[] {
    return [...this.gasPriceHistory];
  }

  public async refreshGasPriceHistory(): Promise<void> {
    await this.updateGasPriceHistory();
  }
}
