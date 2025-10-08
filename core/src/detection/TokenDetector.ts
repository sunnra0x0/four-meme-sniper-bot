import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../config/ConfigManager';

export interface DetectedToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  creator: string;
  deploymentTx: string;
  deploymentBlock: number;
  deploymentTime: number;
  isFourMemeToken: boolean;
  verificationStatus: 'UNKNOWN' | 'VERIFIED' | 'UNVERIFIED' | 'SUSPICIOUS';
}

export interface TokenLaunchEvent {
  tokenAddress: string;
  launchType: 'FOUR_MEME' | 'STANDARD' | 'UNKNOWN';
  launchTime: number;
  initialLiquidity: number;
  creator: string;
  metadata: any;
}

export class TokenDetector extends EventEmitter {
  private logger: Logger;
  private config: ConfigManager;
  private provider: ethers.JsonRpcProvider;
  private isRunning: boolean = false;
  private monitoredBlocks: Set<number> = new Set();
  private knownTokens: Set<string> = new Set();
  private fourMemePatterns: Map<string, any> = new Map();

  constructor(provider: ethers.JsonRpcProvider, config: ConfigManager) {
    super();
    this.logger = new Logger('TokenDetector');
    this.config = config;
    this.provider = provider;
    
    this.initializeFourMemePatterns();
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('🔧 Initializing Token Detector...');
      
      // Test provider connection
      await this.provider.getBlockNumber();
      
      // Load known tokens from database
      await this.loadKnownTokens();
      
      this.logger.info('✅ Token Detector initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Token Detector:', error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      if (this.isRunning) {
        this.logger.warn('Token Detector is already running');
        return;
      }

      this.logger.info('🔍 Starting Token Detector...');
      this.isRunning = true;

      // Start monitoring for new token deployments
      this.startBlockMonitoring();

      this.logger.info('✅ Token Detector started successfully');
    } catch (error) {
      this.logger.error('❌ Failed to start Token Detector:', error);
      this.isRunning = false;
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        this.logger.warn('Token Detector is not running');
        return;
      }

      this.logger.info('🛑 Stopping Token Detector...');
      this.isRunning = false;

      this.logger.info('✅ Token Detector stopped successfully');
    } catch (error) {
      this.logger.error('❌ Error stopping Token Detector:', error);
      throw error;
    }
  }

  private initializeFourMemePatterns(): void {
    // Four.Meme specific patterns
    this.fourMemePatterns.set('CREATOR_PATTERN', /four\.meme|fourmeme/i);
    this.fourMemePatterns.set('SYMBOL_PATTERN', /^[A-Z]{3,10}$/);
    this.fourMemePatterns.set('NAME_PATTERN', /meme|token|coin/i);
    
    // Known Four.Meme creator addresses
    this.fourMemePatterns.set('KNOWN_CREATORS', [
      '0x0000000000000000000000000000000000000000', // Placeholder
      // Add known Four.Meme creator addresses here
    ]);
  }

  private async loadKnownTokens(): Promise<void> {
    try {
      // Load known tokens from database or cache
      // This would typically load from MongoDB or Redis
      this.logger.info('📋 Loaded known tokens');
    } catch (error) {
      this.logger.error('Error loading known tokens:', error);
    }
  }

  private startBlockMonitoring(): void {
    // Monitor new blocks for token deployments
    setInterval(async () => {
      try {
        await this.checkNewBlocks();
      } catch (error) {
        this.logger.error('Error checking new blocks:', error);
      }
    }, 2000); // Check every 2 seconds
  }

  private async checkNewBlocks(): Promise<void> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      
      // Check recent blocks for new token deployments
      for (let blockNumber = currentBlock - 5; blockNumber <= currentBlock; blockNumber++) {
        if (!this.monitoredBlocks.has(blockNumber)) {
          this.monitoredBlocks.add(blockNumber);
          await this.analyzeBlock(blockNumber);
        }
      }
      
      // Clean up old monitored blocks
      this.cleanupMonitoredBlocks(currentBlock);
      
    } catch (error) {
      this.logger.error('Error checking new blocks:', error);
    }
  }

  private async analyzeBlock(blockNumber: number): Promise<void> {
    try {
      const block = await this.provider.getBlock(blockNumber, true);
      
      if (block && block.transactions) {
        for (const tx of block.transactions) {
          if (tx.to === null && tx.contractAddress) {
            // New contract deployment detected
            await this.analyzeContractDeployment(tx.contractAddress, tx.hash, blockNumber);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error analyzing block ${blockNumber}:`, error);
    }
  }

  private async analyzeContractDeployment(contractAddress: string, txHash: string, blockNumber: number): Promise<void> {
    try {
      // Skip if already known
      if (this.knownTokens.has(contractAddress)) {
        return;
      }

      this.logger.info(`🆕 New contract deployment detected: ${contractAddress}`);

      // Check if it's a token contract
      const isToken = await this.isTokenContract(contractAddress);
      
      if (isToken) {
        const tokenData = await this.extractTokenData(contractAddress, txHash, blockNumber);
        
        if (tokenData) {
          this.knownTokens.add(contractAddress);
          
          // Check if it's a Four.Meme token
          const isFourMemeToken = await this.checkFourMemeToken(tokenData);
          tokenData.isFourMemeToken = isFourMemeToken;
          
          this.logger.info(`🪙 Token detected: ${tokenData.symbol} (${tokenData.address})`);
          
          // Emit event
          this.emit('newTokenDetected', tokenData);
          
          // Check for launch event
          if (isFourMemeToken) {
            await this.checkLaunchEvent(tokenData);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error analyzing contract deployment ${contractAddress}:`, error);
    }
  }

  private async isTokenContract(contractAddress: string): Promise<boolean> {
    try {
      const contract = new ethers.Contract(contractAddress, this.getTokenABI(), this.provider);
      
      // Check for standard ERC20 functions
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name().catch(() => null),
        contract.symbol().catch(() => null),
        contract.decimals().catch(() => null),
        contract.totalSupply().catch(() => null)
      ]);
      
      return !!(name && symbol && decimals !== null && totalSupply);
    } catch (error) {
      return false;
    }
  }

  private async extractTokenData(contractAddress: string, txHash: string, blockNumber: number): Promise<DetectedToken | null> {
    try {
      const contract = new ethers.Contract(contractAddress, this.getTokenABI(), this.provider);
      
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
        contract.totalSupply()
      ]);
      
      // Get transaction details
      const tx = await this.provider.getTransaction(txHash);
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      const tokenData: DetectedToken = {
        address: contractAddress,
        name: name,
        symbol: symbol,
        decimals: decimals,
        totalSupply: totalSupply,
        creator: tx.from,
        deploymentTx: txHash,
        deploymentBlock: blockNumber,
        deploymentTime: Date.now(),
        isFourMemeToken: false,
        verificationStatus: 'UNKNOWN'
      };
      
      return tokenData;
    } catch (error) {
      this.logger.error(`Error extracting token data for ${contractAddress}:`, error);
      return null;
    }
  }

  private async checkFourMemeToken(tokenData: DetectedToken): Promise<boolean> {
    try {
      // Check name patterns
      const nameMatch = this.fourMemePatterns.get('NAME_PATTERN').test(tokenData.name);
      
      // Check symbol patterns
      const symbolMatch = this.fourMemePatterns.get('SYMBOL_PATTERN').test(tokenData.symbol);
      
      // Check creator patterns
      const creatorMatch = this.fourMemePatterns.get('KNOWN_CREATORS').includes(tokenData.creator);
      
      // Check for Four.Meme specific metadata
      const metadataMatch = await this.checkFourMemeMetadata(tokenData.address);
      
      // Score the token
      let score = 0;
      if (nameMatch) score += 1;
      if (symbolMatch) score += 1;
      if (creatorMatch) score += 2;
      if (metadataMatch) score += 2;
      
      return score >= 2; // Threshold for Four.Meme token
    } catch (error) {
      this.logger.error('Error checking Four.Meme token:', error);
      return false;
    }
  }

  private async checkFourMemeMetadata(tokenAddress: string): Promise<boolean> {
    try {
      // Check for Four.Meme specific contract features
      const contract = new ethers.Contract(tokenAddress, this.getExtendedABI(), this.provider);
      
      // Check for Four.Meme specific functions
      const hasFourMemeFunctions = await Promise.all([
        contract.fourMemeToken().catch(() => false),
        contract.bondingCurveAddress().catch(() => false),
        contract.launchTime().catch(() => false)
      ]);
      
      return hasFourMemeFunctions.some(result => result);
    } catch (error) {
      return false;
    }
  }

  private async checkLaunchEvent(tokenData: DetectedToken): Promise<void> {
    try {
      // Check for launch events
      const contract = new ethers.Contract(tokenData.address, this.getEventABI(), this.provider);
      
      // Look for launch-related events
      const launchEvents = await contract.queryFilter(
        contract.filters.LaunchStarted(),
        tokenData.deploymentBlock,
        tokenData.deploymentBlock + 10
      );
      
      if (launchEvents.length > 0) {
        const launchEvent: TokenLaunchEvent = {
          tokenAddress: tokenData.address,
          launchType: 'FOUR_MEME',
          launchTime: Date.now(),
          initialLiquidity: 0, // Would be extracted from event
          creator: tokenData.creator,
          metadata: {
            name: tokenData.name,
            symbol: tokenData.symbol,
            totalSupply: tokenData.totalSupply.toString()
          }
        };
        
        this.emit('tokenLaunchDetected', launchEvent);
      }
    } catch (error) {
      this.logger.error('Error checking launch event:', error);
    }
  }

  private cleanupMonitoredBlocks(currentBlock: number): void {
    // Remove blocks older than 100 blocks
    const cutoffBlock = currentBlock - 100;
    
    for (const blockNumber of this.monitoredBlocks) {
      if (blockNumber < cutoffBlock) {
        this.monitoredBlocks.delete(blockNumber);
      }
    }
  }

  private getTokenABI(): any[] {
    return [
      "function name() external view returns (string)",
      "function symbol() external view returns (string)",
      "function decimals() external view returns (uint8)",
      "function totalSupply() external view returns (uint256)"
    ];
  }

  private getExtendedABI(): any[] {
    return [
      ...this.getTokenABI(),
      "function fourMemeToken() external view returns (bool)",
      "function bondingCurveAddress() external view returns (address)",
      "function launchTime() external view returns (uint256)"
    ];
  }

  private getEventABI(): any[] {
    return [
      "event LaunchStarted(address indexed token, uint256 launchTime)",
      "event TokenCreated(address indexed token, address indexed creator)"
    ];
  }

  public getKnownTokens(): string[] {
    return Array.from(this.knownTokens);
  }

  public getMonitoredBlocks(): number[] {
    return Array.from(this.monitoredBlocks);
  }

  public async getTokenInfo(tokenAddress: string): Promise<DetectedToken | null> {
    try {
      if (!this.knownTokens.has(tokenAddress)) {
        return null;
      }

      const contract = new ethers.Contract(tokenAddress, this.getTokenABI(), this.provider);
      
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
        contract.totalSupply()
      ]);

      return {
        address: tokenAddress,
        name,
        symbol,
        decimals,
        totalSupply,
        creator: '', // Would need to be stored
        deploymentTx: '', // Would need to be stored
        deploymentBlock: 0, // Would need to be stored
        deploymentTime: 0, // Would need to be stored
        isFourMemeToken: false, // Would need to be stored
        verificationStatus: 'UNKNOWN'
      };
    } catch (error) {
      this.logger.error(`Error getting token info for ${tokenAddress}:`, error);
      return null;
    }
  }
}
