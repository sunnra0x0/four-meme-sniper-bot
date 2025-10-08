import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../config/ConfigManager';
import { FourMemeAPI } from '../fourmeme/FourMemeAPI';
import { BondingCurveAnalyzer } from '../bonding-curve/BondingCurveAnalyzer';
import { TokenDetector } from '../detection/TokenDetector';
import { DEXManager } from '../dex/DEXManager';
import { RiskManager } from '../risk/RiskManager';
import { GasOptimizer } from '../utils/GasOptimizer';
import { MEVProtection } from '../utils/MEVProtection';

export interface FourMemeSniperConfig {
  maxSlippage: number;
  maxGasPrice: number;
  minLiquidity: number;
  maxPositionSize: number;
  profitThreshold: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  bondingCurveThreshold: number;
  fairLaunchDelay: number;
}

export interface FourMemeToken {
  address: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  website: string;
  twitter: string;
  telegram: string;
  category: string;
  launchTime: number;
  bondingCurveAddress: string;
  creator: string;
  totalSupply: bigint;
  initialPrice: number;
  verified: boolean;
}

export interface SniperOpportunity {
  token: FourMemeToken;
  currentPrice: number;
  targetPrice: number;
  bondingCurveProgress: number;
  liquidity: number;
  slippage: number;
  gasCost: number;
  expectedProfit: number;
  riskScore: number;
  launchTime: number;
  timeToLaunch: number;
}

export interface ActiveSnipe {
  id: string;
  token: FourMemeToken;
  entryPrice: number;
  amount: number;
  stopLoss: number;
  takeProfit: number;
  timestamp: number;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'STOPPED';
  bondingCurveProgress: number;
}

export class FourMemeSniperBot extends EventEmitter {
  private logger: Logger;
  private config: ConfigManager;
  private fourMemeAPI: FourMemeAPI;
  private bondingCurveAnalyzer: BondingCurveAnalyzer;
  private tokenDetector: TokenDetector;
  private dexManager: DEXManager;
  private riskManager: RiskManager;
  private gasOptimizer: GasOptimizer;
  private mevProtection: MEVProtection;
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private sniperConfig: FourMemeSniperConfig;
  private activeSnipes: Map<string, ActiveSnipe> = new Map();
  private totalProfit: number = 0;
  private isRunning: boolean = false;
  private monitoredTokens: Set<string> = new Set();

  constructor(
    provider: ethers.JsonRpcProvider,
    fourMemeAPI: FourMemeAPI,
    bondingCurveAnalyzer: BondingCurveAnalyzer,
    tokenDetector: TokenDetector,
    dexManager: DEXManager,
    riskManager: RiskManager,
    config: ConfigManager
  ) {
    super();
    this.logger = new Logger('FourMemeSniperBot');
    this.config = config;
    this.fourMemeAPI = fourMemeAPI;
    this.bondingCurveAnalyzer = bondingCurveAnalyzer;
    this.tokenDetector = tokenDetector;
    this.dexManager = dexManager;
    this.riskManager = riskManager;
    this.provider = provider;
    
    // Initialize wallet
    const privateKey = this.config.get('PRIVATE_KEY');
    this.wallet = new ethers.Wallet(privateKey, provider);
    
    // Initialize utilities
    this.gasOptimizer = new GasOptimizer(provider);
    this.mevProtection = new MEVProtection(provider);
    
    // Load sniper configuration
    this.sniperConfig = this.loadSniperConfig();
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('🔧 Initializing Four.Meme Sniper Bot...');
      
      // Verify wallet connection
      const balance = await this.provider.getBalance(this.wallet.address);
      this.logger.info(`💰 Wallet balance: ${ethers.formatEther(balance)} BNB`);
      
      // Initialize Four.Meme API
      await this.fourMemeAPI.initialize();
      
      // Initialize bonding curve analyzer
      await this.bondingCurveAnalyzer.initialize();
      
      // Initialize token detector
      await this.tokenDetector.initialize();
      
      // Initialize gas optimizer
      await this.gasOptimizer.initialize();
      
      // Initialize MEV protection
      await this.mevProtection.initialize();
      
      this.logger.info('✅ Four.Meme Sniper Bot initialized successfully');
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

      // Start monitoring Four.Meme launches
      this.startFourMemeMonitoring();

      // Start bonding curve monitoring
      this.startBondingCurveMonitoring();

      // Start token detection
      this.startTokenDetection();

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

      // Stop all active snipes
      await this.stopAllSnipes();

      this.logger.info('✅ Four.Meme Sniper Bot stopped successfully');
    } catch (error) {
      this.logger.error('❌ Error stopping Four.Meme Sniper Bot:', error);
      throw error;
    }
  }

  private startFourMemeMonitoring(): void {
    // Monitor Four.Meme API for new token launches
    setInterval(async () => {
      try {
        const newTokens = await this.fourMemeAPI.getNewTokens();
        
        for (const token of newTokens) {
          if (!this.monitoredTokens.has(token.address)) {
            this.monitoredTokens.add(token.address);
            await this.analyzeToken(token);
          }
        }
      } catch (error) {
        this.logger.error('Error monitoring Four.Meme tokens:', error);
      }
    }, 5000); // Check every 5 seconds
  }

  private startBondingCurveMonitoring(): void {
    // Monitor bonding curves for opportunities
    setInterval(async () => {
      try {
        for (const tokenAddress of this.monitoredTokens) {
          const bondingCurveData = await this.bondingCurveAnalyzer.getBondingCurveData(tokenAddress);
          
          if (bondingCurveData) {
            await this.analyzeBondingCurveOpportunity(tokenAddress, bondingCurveData);
          }
        }
      } catch (error) {
        this.logger.error('Error monitoring bonding curves:', error);
      }
    }, 2000); // Check every 2 seconds
  }

  private startTokenDetection(): void {
    // Monitor for new token deployments
    this.tokenDetector.on('newTokenDetected', async (tokenData) => {
      try {
        this.logger.info('🆕 New token detected:', tokenData);
        
        // Check if it's a Four.Meme token
        const isFourMemeToken = await this.fourMemeAPI.verifyToken(tokenData.address);
        
        if (isFourMemeToken) {
          this.monitoredTokens.add(tokenData.address);
          await this.analyzeToken(tokenData);
        }
      } catch (error) {
        this.logger.error('Error processing new token:', error);
      }
    });
  }

  private async analyzeToken(token: FourMemeToken): Promise<void> {
    try {
      this.logger.info(`🔍 Analyzing Four.Meme token: ${token.symbol} (${token.address})`);

      // Calculate time to launch
      const timeToLaunch = token.launchTime - Date.now();
      
      if (timeToLaunch > 0) {
        this.logger.info(`⏰ Token launches in ${timeToLaunch / 1000} seconds`);
        
        // Set up pre-launch monitoring
        setTimeout(async () => {
          await this.handleTokenLaunch(token);
        }, timeToLaunch);
      } else {
        // Token already launched, analyze immediately
        await this.handleTokenLaunch(token);
      }

    } catch (error) {
      this.logger.error('Error analyzing token:', error);
    }
  }

  private async handleTokenLaunch(token: FourMemeToken): Promise<void> {
    try {
      this.logger.info(`🚀 Handling token launch: ${token.symbol}`);

      // Get current bonding curve data
      const bondingCurveData = await this.bondingCurveAnalyzer.getBondingCurveData(token.address);
      
      if (bondingCurveData) {
        // Analyze sniper opportunity
        const opportunity = await this.analyzeSniperOpportunity(token, bondingCurveData);
        
        if (opportunity && opportunity.expectedProfit > this.sniperConfig.profitThreshold) {
          this.logger.info('💰 Profitable sniper opportunity found!');
          await this.executeSnipe(opportunity);
        }
      }

    } catch (error) {
      this.logger.error('Error handling token launch:', error);
    }
  }

  private async analyzeBondingCurveOpportunity(tokenAddress: string, bondingCurveData: any): Promise<void> {
    try {
      // Analyze bonding curve for opportunities
      const analysis = await this.bondingCurveAnalyzer.analyzeOpportunity(bondingCurveData);
      
      if (analysis.isProfitable) {
        this.logger.info(`💎 Bonding curve opportunity detected for ${tokenAddress}`);
        
        // Get token data
        const token = await this.fourMemeAPI.getToken(tokenAddress);
        
        if (token) {
          const opportunity: SniperOpportunity = {
            token,
            currentPrice: analysis.currentPrice,
            targetPrice: analysis.targetPrice,
            bondingCurveProgress: analysis.progress,
            liquidity: analysis.liquidity,
            slippage: analysis.slippage,
            gasCost: analysis.gasCost,
            expectedProfit: analysis.expectedProfit,
            riskScore: analysis.riskScore,
            launchTime: token.launchTime,
            timeToLaunch: 0
          };

          await this.executeSnipe(opportunity);
        }
      }

    } catch (error) {
      this.logger.error('Error analyzing bonding curve opportunity:', error);
    }
  }

  private async analyzeSniperOpportunity(token: FourMemeToken, bondingCurveData: any): Promise<SniperOpportunity | null> {
    try {
      // Get current price from bonding curve
      const currentPrice = await this.bondingCurveAnalyzer.getCurrentPrice(bondingCurveData);
      
      // Calculate target price (e.g., 2x current price)
      const targetPrice = currentPrice * 2;
      
      // Get liquidity information
      const liquidity = await this.dexManager.getLiquidity(token.address);
      
      // Calculate slippage
      const slippage = await this.calculateSlippage(token.address, targetPrice);
      
      // Estimate gas cost
      const gasCost = await this.estimateSniperGasCost(token);
      
      // Calculate expected profit
      const expectedProfit = await this.calculateExpectedProfit(token, currentPrice, targetPrice);
      
      // Calculate risk score
      const riskScore = await this.riskManager.calculateRiskScore({
        token: token.address,
        liquidity,
        slippage,
        gasCost
      });

      const opportunity: SniperOpportunity = {
        token,
        currentPrice,
        targetPrice,
        bondingCurveProgress: bondingCurveData.progress,
        liquidity,
        slippage,
        gasCost,
        expectedProfit,
        riskScore,
        launchTime: token.launchTime,
        timeToLaunch: token.launchTime - Date.now()
      };

      return opportunity;
    } catch (error) {
      this.logger.error('Error analyzing sniper opportunity:', error);
      return null;
    }
  }

  private async executeSnipe(opportunity: SniperOpportunity): Promise<void> {
    try {
      this.logger.info(`🎯 Executing snipe for ${opportunity.token.symbol}`);

      // Validate opportunity
      if (!this.validateSniperOpportunity(opportunity)) {
        this.logger.warn('❌ Sniper opportunity validation failed');
        return;
      }

      // Calculate position size
      const positionSize = this.calculatePositionSize(opportunity);
      
      // Create snipe
      const snipe = await this.createSnipe(opportunity, positionSize);
      
      // Execute snipe
      await this.executeSnipeTransaction(snipe);

    } catch (error) {
      this.logger.error('❌ Error executing snipe:', error);
    }
  }

  private validateSniperOpportunity(opportunity: SniperOpportunity): boolean {
    // Check minimum liquidity
    if (opportunity.liquidity < this.sniperConfig.minLiquidity) {
      this.logger.warn('❌ Insufficient liquidity');
      return false;
    }

    // Check slippage
    if (opportunity.slippage > this.sniperConfig.maxSlippage) {
      this.logger.warn('❌ Slippage too high');
      return false;
    }

    // Check profit threshold
    if (opportunity.expectedProfit < this.sniperConfig.profitThreshold) {
      this.logger.warn('❌ Profit below threshold');
      return false;
    }

    // Check risk score
    if (opportunity.riskScore > 0.8) {
      this.logger.warn('❌ Risk score too high');
      return false;
    }

    // Check bonding curve progress
    if (opportunity.bondingCurveProgress > this.sniperConfig.bondingCurveThreshold) {
      this.logger.warn('❌ Bonding curve too advanced');
      return false;
    }

    return true;
  }

  private calculatePositionSize(opportunity: SniperOpportunity): number {
    // Calculate position size based on risk management
    const maxPosition = this.sniperConfig.maxPositionSize;
    const riskAdjustedSize = maxPosition * (1 - opportunity.riskScore);
    
    // Ensure we don't exceed available balance
    const availableBalance = this.getAvailableBalance();
    const positionSize = Math.min(riskAdjustedSize, availableBalance * 0.1); // Max 10% of balance
    
    return positionSize;
  }

  private async createSnipe(opportunity: SniperOpportunity, positionSize: number): Promise<ActiveSnipe> {
    const snipeId = this.generateSnipeId();
    
    const snipe: ActiveSnipe = {
      id: snipeId,
      token: opportunity.token,
      entryPrice: opportunity.currentPrice,
      amount: positionSize,
      stopLoss: opportunity.currentPrice * (1 - this.sniperConfig.stopLossPercentage / 100),
      takeProfit: opportunity.currentPrice * (1 + this.sniperConfig.takeProfitPercentage / 100),
      timestamp: Date.now(),
      status: 'PENDING',
      bondingCurveProgress: opportunity.bondingCurveProgress
    };

    this.activeSnipes.set(snipeId, snipe);
    return snipe;
  }

  private async executeSnipeTransaction(snipe: ActiveSnipe): Promise<void> {
    try {
      this.logger.info(`🚀 Executing snipe transaction ${snipe.id}`);

      // Get optimal gas price
      const gasPrice = await this.gasOptimizer.getOptimalGasPrice();
      
      // Apply MEV protection
      const protectedTx = await this.mevProtection.protectTransaction({
        to: snipe.token.address,
        value: ethers.parseEther(snipe.amount.toString()),
        gasPrice: gasPrice
      });

      // Execute transaction
      const tx = await this.wallet.sendTransaction(protectedTx);
      this.logger.info(`📝 Snipe transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        snipe.status = 'ACTIVE';
        this.logger.info(`✅ Snipe ${snipe.id} executed successfully`);
        this.emit('snipeExecuted', snipe);
      } else {
        snipe.status = 'STOPPED';
        this.logger.error(`❌ Snipe ${snipe.id} failed`);
        this.emit('snipeFailed', snipe);
      }

    } catch (error) {
      this.logger.error(`❌ Error executing snipe ${snipe.id}:`, error);
      snipe.status = 'STOPPED';
      this.emit('snipeError', snipe, error);
    }
  }

  private async calculateSlippage(tokenAddress: string, targetPrice: number): Promise<number> {
    // Calculate slippage for sniper trade
    const liquidity = await this.dexManager.getLiquidity(tokenAddress);
    return Math.min(0.05, 1000 / liquidity); // Max 5% slippage
  }

  private async estimateSniperGasCost(token: FourMemeToken): Promise<number> {
    // Estimate gas cost for sniper trade
    const gasPrice = await this.provider.getFeeData();
    return Number(gasPrice.gasPrice) * 150000; // Estimated gas limit
  }

  private async calculateExpectedProfit(token: FourMemeToken, currentPrice: number, targetPrice: number): Promise<number> {
    // Calculate expected profit from sniper trade
    const tradeAmount = 1000; // Example amount
    const priceDifference = (targetPrice - currentPrice) / currentPrice;
    return tradeAmount * priceDifference;
  }

  private generateSnipeId(): string {
    return `snipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getAvailableBalance(): number {
    // Get available balance for trading
    return 1.0; // Placeholder
  }

  private loadSniperConfig(): FourMemeSniperConfig {
    return {
      maxSlippage: this.config.get('MAX_SLIPPAGE', 0.05),
      maxGasPrice: this.config.get('MAX_GAS_PRICE', 20),
      minLiquidity: this.config.get('MIN_LIQUIDITY', 10000),
      maxPositionSize: this.config.get('MAX_POSITION_SIZE', 0.1),
      profitThreshold: this.config.get('PROFIT_THRESHOLD', 0.01),
      stopLossPercentage: this.config.get('STOP_LOSS_PERCENTAGE', 10),
      takeProfitPercentage: this.config.get('TAKE_PROFIT_PERCENTAGE', 20),
      bondingCurveThreshold: this.config.get('BONDING_CURVE_THRESHOLD', 0.8),
      fairLaunchDelay: this.config.get('FAIR_LAUNCH_DELAY', 1000)
    };
  }

  public async stopAllSnipes(): Promise<void> {
    this.logger.info('🛑 Stopping all active snipes...');
    
    for (const [snipeId, snipe] of this.activeSnipes) {
      if (snipe.status === 'ACTIVE') {
        snipe.status = 'STOPPED';
        this.logger.info(`🛑 Stopped snipe ${snipeId}`);
      }
    }
  }

  public getActiveSnipes(): ActiveSnipe[] {
    return Array.from(this.activeSnipes.values());
  }

  public getTotalProfit(): number {
    return this.totalProfit;
  }

  public updateTotalProfit(profit: number): void {
    this.totalProfit += profit;
    this.emit('profitUpdated', this.totalProfit);
  }

  public getMonitoredTokens(): string[] {
    return Array.from(this.monitoredTokens);
  }
}
