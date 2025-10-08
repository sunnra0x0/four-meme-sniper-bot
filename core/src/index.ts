import { ethers } from 'ethers';
import { Logger } from './utils/Logger';
import { ConfigManager } from './config/ConfigManager';
import { FourMemeSniperBot } from './sniper/FourMemeSniperBot';
import { FourMemeAPI } from './fourmeme/FourMemeAPI';
import { BondingCurveAnalyzer } from './bonding-curve/BondingCurveAnalyzer';
import { TokenDetector } from './detection/TokenDetector';
import { DEXManager } from './dex/DEXManager';
import { RiskManager } from './risk/RiskManager';
import { MonitoringService } from './monitoring/MonitoringService';
import { DatabaseManager } from './utils/DatabaseManager';
import { RedisManager } from './utils/RedisManager';

export class FourMemeSniperBotMain {
  private logger: Logger;
  private config: ConfigManager;
  private sniperBot: FourMemeSniperBot;
  private fourMemeAPI: FourMemeAPI;
  private bondingCurveAnalyzer: BondingCurveAnalyzer;
  private tokenDetector: TokenDetector;
  private dexManager: DEXManager;
  private riskManager: RiskManager;
  private monitoringService: MonitoringService;
  private databaseManager: DatabaseManager;
  private redisManager: RedisManager;
  private provider: ethers.JsonRpcProvider;
  private isRunning: boolean = false;

  constructor() {
    this.logger = new Logger('FourMemeSniperBotMain');
    this.config = new ConfigManager();
    this.databaseManager = new DatabaseManager();
    this.redisManager = new RedisManager();
    
    // Initialize blockchain provider
    this.provider = new ethers.JsonRpcProvider(this.config.get('BSC_RPC_URL'));
    
    // Initialize core services
    this.fourMemeAPI = new FourMemeAPI(this.config);
    this.bondingCurveAnalyzer = new BondingCurveAnalyzer(this.provider, this.config);
    this.tokenDetector = new TokenDetector(this.provider, this.config);
    this.dexManager = new DEXManager(this.provider, this.config);
    this.riskManager = new RiskManager(this.config);
    this.monitoringService = new MonitoringService(this.provider, this.config);
    
    // Initialize sniper bot
    this.sniperBot = new FourMemeSniperBot(
      this.provider,
      this.fourMemeAPI,
      this.bondingCurveAnalyzer,
      this.tokenDetector,
      this.dexManager,
      this.riskManager,
      this.config
    );
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('🚀 Initializing Four.Meme Sniper Bot...');

      // Validate configuration
      if (!this.config.validate()) {
        throw new Error('Configuration validation failed');
      }

      // Initialize database connections
      await this.databaseManager.connect();
      await this.redisManager.connect();

      // Initialize DEX manager
      await this.dexManager.initialize();

      // Initialize monitoring service
      await this.monitoringService.initialize();

      // Initialize token detector
      await this.tokenDetector.initialize();

      // Initialize bonding curve analyzer
      await this.bondingCurveAnalyzer.initialize();

      // Initialize Four.Meme API
      await this.fourMemeAPI.initialize();

      // Initialize sniper bot
      await this.sniperBot.initialize();

      this.logger.info('✅ Four.Meme Sniper Bot initialization completed successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Four.Meme Sniper Bot:', error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      if (this.isRunning) {
        this.logger.warn('Four.Meme Sniper Bot is already running');
        return;
      }

      this.logger.info('🎯 Starting Four.Meme Sniper Bot...');
      this.isRunning = true;

      // Start monitoring service
      await this.monitoringService.start();

      // Start token detector
      await this.tokenDetector.start();

      // Start sniper bot
      await this.sniperBot.start();

      // Set up event listeners
      this.setupEventListeners();

      this.logger.info('✅ Four.Meme Sniper Bot started successfully');
    } catch (error) {
      this.logger.error('❌ Failed to start Four.Meme Sniper Bot:', error);
      this.isRunning = false;
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        this.logger.warn('Four.Meme Sniper Bot is not running');
        return;
      }

      this.logger.info('🛑 Stopping Four.Meme Sniper Bot...');
      this.isRunning = false;

      // Stop all services
      await this.sniperBot.stop();
      await this.tokenDetector.stop();
      await this.monitoringService.stop();

      this.logger.info('✅ Four.Meme Sniper Bot stopped successfully');
    } catch (error) {
      this.logger.error('❌ Error stopping Four.Meme Sniper Bot:', error);
      throw error;
    }
  }

  public async restart(): Promise<void> {
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    await this.start();
  }

  private setupEventListeners(): void {
    // Token detection events
    this.tokenDetector.on('newTokenDetected', async (tokenData) => {
      this.logger.info('🆕 New token detected:', tokenData);
      
      if (tokenData.isFourMemeToken) {
        this.logger.info('🎯 Four.Meme token detected!');
        // The sniper bot will handle this automatically
      }
    });

    this.tokenDetector.on('tokenLaunchDetected', async (launchEvent) => {
      this.logger.info('🚀 Token launch detected:', launchEvent);
      
      // Handle launch event
      await this.handleTokenLaunch(launchEvent);
    });

    // Sniper bot events
    this.sniperBot.on('snipeExecuted', (snipe) => {
      this.logger.info('✅ Snipe executed successfully:', snipe.id);
    });

    this.sniperBot.on('snipeFailed', (snipe) => {
      this.logger.warn('❌ Snipe failed:', snipe.id);
    });

    this.sniperBot.on('profitUpdated', (profit) => {
      this.logger.info(`💰 Total profit updated: ${profit} BNB`);
    });

    // Risk management events
    this.riskManager.on('riskAlert', (riskData) => {
      this.logger.warn('⚠️ Risk alert:', riskData);
      
      // Handle risk alerts
      this.handleRiskAlert(riskData);
    });

    // Price monitoring events
    this.monitoringService.on('priceAlert', async (alertData) => {
      this.logger.info('📊 Price alert triggered:', alertData);
      
      // Check if this is a sniper opportunity
      const sniperOpportunity = await this.analyzeSniperOpportunity(alertData);
      
      if (sniperOpportunity && sniperOpportunity.expectedProfit > 0) {
        this.logger.info('🎯 Sniper opportunity detected!');
        // The sniper bot will handle this automatically
      }
    });

    // Error handling
    process.on('uncaughtException', (error) => {
      this.logger.error('💥 Uncaught Exception:', error);
      this.stop();
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  private async handleTokenLaunch(launchEvent: any): Promise<void> {
    try {
      this.logger.info('🚀 Handling token launch event:', launchEvent);
      
      // Get token data
      const token = await this.fourMemeAPI.getToken(launchEvent.tokenAddress);
      
      if (token) {
        // Analyze launch opportunity
        const opportunity = await this.analyzeLaunchOpportunity(token, launchEvent);
        
        if (opportunity && opportunity.expectedProfit > 0) {
          this.logger.info('💰 Profitable launch opportunity found!');
          // The sniper bot will handle this automatically
        }
      }
    } catch (error) {
      this.logger.error('Error handling token launch:', error);
    }
  }

  private async analyzeLaunchOpportunity(token: any, launchEvent: any): Promise<any> {
    try {
      // Analyze the launch opportunity
      const analysis = {
        tokenAddress: token.address,
        launchTime: launchEvent.launchTime,
        initialLiquidity: launchEvent.initialLiquidity,
        creator: launchEvent.creator,
        priceImpact: await this.calculatePriceImpact(token),
        gasCost: await this.estimateGasCost(),
        isProfitable: false,
        expectedProfit: 0,
        riskScore: 0
      };

      // Calculate profitability
      analysis.expectedProfit = await this.calculateExpectedProfit(analysis);
      analysis.isProfitable = analysis.expectedProfit > analysis.gasCost * 1.1; // 10% buffer
      analysis.riskScore = await this.riskManager.calculateRiskScore(analysis);

      return analysis;
    } catch (error) {
      this.logger.error('Error analyzing launch opportunity:', error);
      return { isProfitable: false };
    }
  }

  private async analyzeSniperOpportunity(alertData: any): Promise<any> {
    try {
      // Analyze sniper opportunity
      const analysis = {
        tokenAddress: alertData.tokenAddress,
        currentPrice: alertData.price,
        targetPrice: alertData.targetPrice,
        liquidity: await this.dexManager.getLiquidity(alertData.tokenAddress),
        slippage: await this.calculateSlippage(alertData),
        gasCost: await this.estimateSniperGasCost(alertData),
        isProfitable: false,
        expectedProfit: 0,
        riskScore: 0
      };

      // Calculate profitability
      analysis.expectedProfit = await this.calculateSniperProfit(analysis);
      analysis.isProfitable = analysis.expectedProfit > analysis.gasCost * 1.2; // 20% buffer
      analysis.riskScore = await this.riskManager.calculateRiskScore(analysis);

      return analysis;
    } catch (error) {
      this.logger.error('Error analyzing sniper opportunity:', error);
      return { isProfitable: false };
    }
  }

  private async calculatePriceImpact(token: any): Promise<number> {
    // Calculate price impact for launch
    return 0.01; // 1% placeholder
  }

  private async calculateSlippage(alertData: any): Promise<number> {
    // Calculate slippage for sniper trade
    const liquidity = await this.dexManager.getLiquidity(alertData.tokenAddress);
    return Math.min(0.05, 1000 / liquidity); // Max 5% slippage
  }

  private async estimateGasCost(): Promise<number> {
    // Estimate gas cost for launch
    const gasPrice = await this.provider.getFeeData();
    return Number(gasPrice.gasPrice) * 200000; // Estimated gas limit
  }

  private async estimateSniperGasCost(alertData: any): Promise<number> {
    // Estimate gas cost for sniper trade
    const gasPrice = await this.provider.getFeeData();
    return Number(gasPrice.gasPrice) * 150000; // Estimated gas limit
  }

  private async calculateExpectedProfit(analysis: any): Promise<number> {
    // Calculate expected profit from launch
    const launchAmount = 1000; // Example amount
    const priceDifference = analysis.priceImpact * launchAmount;
    return priceDifference;
  }

  private async calculateSniperProfit(analysis: any): Promise<number> {
    // Calculate expected profit from sniper trade
    const tradeAmount = 1000; // Example amount
    const priceDifference = (analysis.targetPrice - analysis.currentPrice) / analysis.currentPrice;
    return tradeAmount * priceDifference;
  }

  private handleRiskAlert(riskData: any): void {
    // Handle risk alerts
    if (riskData.level === 'HIGH') {
      this.logger.warn('🚨 High risk detected, reducing position size');
      // Reduce position size
    } else if (riskData.level === 'CRITICAL') {
      this.logger.error('💥 Critical risk detected, stopping all trades');
      this.sniperBot.stopAllSnipes();
    }
  }

  public getStatus(): any {
    return {
      isRunning: this.isRunning,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      activeSnipes: this.sniperBot.getActiveSnipes(),
      totalProfit: this.sniperBot.getTotalProfit(),
      riskLevel: this.riskManager.getCurrentRiskLevel(),
      monitoredTokens: this.sniperBot.getMonitoredTokens(),
      fourMemeAPIConnected: this.fourMemeAPI.isConnected()
    };
  }
}

// Export for use in other modules
export default FourMemeSniperBotMain;