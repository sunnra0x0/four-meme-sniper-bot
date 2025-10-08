import { ethers } from 'ethers';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../config/ConfigManager';

export interface DEXInfo {
  name: string;
  routerAddress: string;
  factoryAddress: string;
  wbnbAddress: string;
  fee: number;
}

export interface LiquidityInfo {
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  price: number;
}

export interface SwapQuote {
  inputAmount: bigint;
  outputAmount: bigint;
  priceImpact: number;
  fee: bigint;
  route: string[];
}

export class DEXManager {
  private logger: Logger;
  private config: ConfigManager;
  private provider: ethers.JsonRpcProvider;
  private dexes: Map<string, DEXInfo> = new Map();
  private routerContracts: Map<string, ethers.Contract> = new Map();
  private factoryContracts: Map<string, ethers.Contract> = new Map();

  constructor(provider: ethers.JsonRpcProvider, config: ConfigManager) {
    this.logger = new Logger('DEXManager');
    this.config = config;
    this.provider = provider;
    
    this.initializeDEXes();
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('🔧 Initializing DEX Manager...');
      
      // Initialize router contracts
      for (const [name, dexInfo] of this.dexes) {
        const routerContract = new ethers.Contract(
          dexInfo.routerAddress,
          this.getRouterABI(),
          this.provider
        );
        this.routerContracts.set(name, routerContract);
        
        const factoryContract = new ethers.Contract(
          dexInfo.factoryAddress,
          this.getFactoryABI(),
          this.provider
        );
        this.factoryContracts.set(name, factoryContract);
        
        this.logger.info(`📋 Initialized ${name} DEX`);
      }
      
      this.logger.info('✅ DEX Manager initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize DEX Manager:', error);
      throw error;
    }
  }

  private initializeDEXes(): void {
    // PancakeSwap V2
    this.dexes.set('PancakeSwap', {
      name: 'PancakeSwap',
      routerAddress: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      factoryAddress: '0xcA143Ce0Fe65960E6Aa4D42C8D3cE161c2B6594',
      wbnbAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      fee: 0.25
    });

    // PancakeSwap V3
    this.dexes.set('PancakeSwapV3', {
      name: 'PancakeSwapV3',
      routerAddress: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      factoryAddress: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
      wbnbAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      fee: 0.05
    });

    // Uniswap V2 (if available on BSC)
    this.dexes.set('UniswapV2', {
      name: 'UniswapV2',
      routerAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      factoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
      wbnbAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      fee: 0.3
    });
  }

  public async getLiquidity(tokenAddress: string, dexName: string = 'PancakeSwap'): Promise<number> {
    try {
      const dexInfo = this.dexes.get(dexName);
      if (!dexInfo) {
        throw new Error(`DEX ${dexName} not found`);
      }

      const factoryContract = this.factoryContracts.get(dexName);
      if (!factoryContract) {
        throw new Error(`Factory contract for ${dexName} not initialized`);
      }

      // Get pair address
      const pairAddress = await factoryContract.getPair(tokenAddress, dexInfo.wbnbAddress);
      
      if (pairAddress === ethers.ZeroAddress) {
        return 0; // No liquidity
      }

      // Get pair contract
      const pairContract = new ethers.Contract(pairAddress, this.getPairABI(), this.provider);
      
      // Get reserves
      const reserves = await pairContract.getReserves();
      const reserve0 = reserves[0];
      const reserve1 = reserves[1];

      // Calculate liquidity (simplified)
      const liquidity = Number(ethers.formatEther(reserve1)); // BNB reserve
      
      return liquidity;
    } catch (error) {
      this.logger.error(`Error getting liquidity for ${tokenAddress}:`, error);
      return 0;
    }
  }

  public async getPrice(tokenAddress: string, dexName: string = 'PancakeSwap'): Promise<number> {
    try {
      const dexInfo = this.dexes.get(dexName);
      if (!dexInfo) {
        throw new Error(`DEX ${dexName} not found`);
      }

      const routerContract = this.routerContracts.get(dexName);
      if (!routerContract) {
        throw new Error(`Router contract for ${dexName} not initialized`);
      }

      // Get price by swapping 1 token for BNB
      const amountIn = ethers.parseEther('1');
      const path = [tokenAddress, dexInfo.wbnbAddress];
      
      const amounts = await routerContract.getAmountsOut(amountIn, path);
      const price = Number(ethers.formatEther(amounts[1]));
      
      return price;
    } catch (error) {
      this.logger.error(`Error getting price for ${tokenAddress}:`, error);
      return 0;
    }
  }

  public async getSwapQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    dexName: string = 'PancakeSwap'
  ): Promise<SwapQuote | null> {
    try {
      const dexInfo = this.dexes.get(dexName);
      if (!dexInfo) {
        throw new Error(`DEX ${dexName} not found`);
      }

      const routerContract = this.routerContracts.get(dexName);
      if (!routerContract) {
        throw new Error(`Router contract for ${dexName} not initialized`);
      }

      const path = [tokenIn, tokenOut];
      
      // Get amounts out
      const amounts = await routerContract.getAmountsOut(amountIn, path);
      const outputAmount = amounts[1];
      
      // Calculate price impact
      const priceImpact = await this.calculatePriceImpact(tokenIn, tokenOut, amountIn, dexName);
      
      // Calculate fee
      const fee = (amountIn * BigInt(Math.floor(dexInfo.fee * 100))) / BigInt(10000);
      
      const quote: SwapQuote = {
        inputAmount: amountIn,
        outputAmount: outputAmount,
        priceImpact: priceImpact,
        fee: fee,
        route: path
      };
      
      return quote;
    } catch (error) {
      this.logger.error(`Error getting swap quote:`, error);
      return null;
    }
  }

  public async executeSwap(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    minAmountOut: bigint,
    wallet: ethers.Wallet,
    dexName: string = 'PancakeSwap'
  ): Promise<string | null> {
    try {
      const dexInfo = this.dexes.get(dexName);
      if (!dexInfo) {
        throw new Error(`DEX ${dexName} not found`);
      }

      const routerContract = this.routerContracts.get(dexName);
      if (!routerContract) {
        throw new Error(`Router contract for ${dexName} not initialized`);
      }

      const path = [tokenIn, tokenOut];
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
      
      // Execute swap
      const tx = await routerContract.connect(wallet).swapExactTokensForTokens(
        amountIn,
        minAmountOut,
        path,
        wallet.address,
        deadline
      );
      
      this.logger.info(`🔄 Swap transaction sent: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      this.logger.error(`Error executing swap:`, error);
      return null;
    }
  }

  private async calculatePriceImpact(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    dexName: string
  ): Promise<number> {
    try {
      // Get current reserves
      const liquidityInfo = await this.getLiquidityInfo(tokenIn, tokenOut, dexName);
      if (!liquidityInfo) {
        return 0;
      }

      // Calculate price impact
      const reserveIn = tokenIn < tokenOut ? liquidityInfo.reserve0 : liquidityInfo.reserve1;
      const reserveOut = tokenIn < tokenOut ? liquidityInfo.reserve1 : liquidityInfo.reserve0;
      
      const priceImpact = Number(amountIn) / Number(reserveIn);
      return priceImpact;
    } catch (error) {
      this.logger.error('Error calculating price impact:', error);
      return 0;
    }
  }

  private async getLiquidityInfo(
    tokenA: string,
    tokenB: string,
    dexName: string
  ): Promise<LiquidityInfo | null> {
    try {
      const dexInfo = this.dexes.get(dexName);
      if (!dexInfo) {
        return null;
      }

      const factoryContract = this.factoryContracts.get(dexName);
      if (!factoryContract) {
        return null;
      }

      const pairAddress = await factoryContract.getPair(tokenA, tokenB);
      if (pairAddress === ethers.ZeroAddress) {
        return null;
      }

      const pairContract = new ethers.Contract(pairAddress, this.getPairABI(), this.provider);
      const reserves = await pairContract.getReserves();
      const totalSupply = await pairContract.totalSupply();

      return {
        token0: tokenA,
        token1: tokenB,
        reserve0: reserves[0],
        reserve1: reserves[1],
        totalSupply: totalSupply,
        price: Number(ethers.formatEther(reserves[1])) / Number(ethers.formatEther(reserves[0]))
      };
    } catch (error) {
      this.logger.error('Error getting liquidity info:', error);
      return null;
    }
  }

  private getRouterABI(): any[] {
    return [
      "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
      "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
      "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)"
    ];
  }

  private getFactoryABI(): any[] {
    return [
      "function getPair(address tokenA, address tokenB) external view returns (address pair)",
      "function createPair(address tokenA, address tokenB) external returns (address pair)"
    ];
  }

  private getPairABI(): any[] {
    return [
      "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
      "function totalSupply() external view returns (uint256)"
    ];
  }

  public getAvailableDEXes(): string[] {
    return Array.from(this.dexes.keys());
  }

  public getDEXInfo(dexName: string): DEXInfo | null {
    return this.dexes.get(dexName) || null;
  }
}
