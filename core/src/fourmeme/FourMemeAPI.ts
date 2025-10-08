import axios from 'axios';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../config/ConfigManager';

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
  marketCap: number;
  volume24h: number;
  holders: number;
  liquidity: number;
  priceChange24h: number;
}

export interface FourMemeLaunch {
  id: string;
  token: FourMemeToken;
  launchType: 'FAIR_LAUNCH' | 'PRESALE' | 'BONDING_CURVE';
  startTime: number;
  endTime: number;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  participants: number;
  raisedAmount: number;
  targetAmount: number;
}

export interface FourMemeStats {
  totalTokens: number;
  totalVolume: number;
  totalLiquidity: number;
  activeLaunches: number;
  averageMarketCap: number;
  topPerformers: FourMemeToken[];
}

export class FourMemeAPI {
  private logger: Logger;
  private config: ConfigManager;
  private baseURL: string;
  private apiKey: string;
  private isInitialized: boolean = false;

  constructor(config: ConfigManager) {
    this.logger = new Logger('FourMemeAPI');
    this.config = config;
    this.baseURL = this.config.get('FOUR_MEME_API_URL', 'https://api.four.meme');
    this.apiKey = this.config.get('FOUR_MEME_API_KEY', '');
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('🔧 Initializing Four.Meme API...');
      
      // Test API connection
      await this.testConnection();
      
      this.isInitialized = true;
      this.logger.info('✅ Four.Meme API initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Four.Meme API:', error);
      throw error;
    }
  }

  private async testConnection(): Promise<void> {
    try {
      const response = await axios.get(`${this.baseURL}/health`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      if (response.status !== 200) {
        throw new Error(`API health check failed: ${response.status}`);
      }
    } catch (error) {
      this.logger.error('Four.Meme API connection test failed:', error);
      throw error;
    }
  }

  public async getNewTokens(): Promise<FourMemeToken[]> {
    try {
      const response = await axios.get(`${this.baseURL}/tokens/new`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data.tokens.map(this.mapTokenData);
    } catch (error) {
      this.logger.error('Error fetching new tokens:', error);
      return [];
    }
  }

  public async getToken(tokenAddress: string): Promise<FourMemeToken | null> {
    try {
      const response = await axios.get(`${this.baseURL}/tokens/${tokenAddress}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return this.mapTokenData(response.data);
    } catch (error) {
      this.logger.error(`Error fetching token ${tokenAddress}:`, error);
      return null;
    }
  }

  public async getUpcomingLaunches(): Promise<FourMemeLaunch[]> {
    try {
      const response = await axios.get(`${this.baseURL}/launches/upcoming`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data.launches.map(this.mapLaunchData);
    } catch (error) {
      this.logger.error('Error fetching upcoming launches:', error);
      return [];
    }
  }

  public async getActiveLaunches(): Promise<FourMemeLaunch[]> {
    try {
      const response = await axios.get(`${this.baseURL}/launches/active`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data.launches.map(this.mapLaunchData);
    } catch (error) {
      this.logger.error('Error fetching active launches:', error);
      return [];
    }
  }

  public async getTokenStats(tokenAddress: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseURL}/tokens/${tokenAddress}/stats`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching token stats for ${tokenAddress}:`, error);
      return null;
    }
  }

  public async getBondingCurveData(tokenAddress: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseURL}/tokens/${tokenAddress}/bonding-curve`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching bonding curve data for ${tokenAddress}:`, error);
      return null;
    }
  }

  public async verifyToken(tokenAddress: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseURL}/tokens/${tokenAddress}/verify`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      return response.data.verified === true;
    } catch (error) {
      this.logger.error(`Error verifying token ${tokenAddress}:`, error);
      return false;
    }
  }

  public async getPlatformStats(): Promise<FourMemeStats | null> {
    try {
      const response = await axios.get(`${this.baseURL}/stats`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error fetching platform stats:', error);
      return null;
    }
  }

  public async getTopTokens(limit: number = 10): Promise<FourMemeToken[]> {
    try {
      const response = await axios.get(`${this.baseURL}/tokens/top`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: { limit },
        timeout: 10000
      });

      return response.data.tokens.map(this.mapTokenData);
    } catch (error) {
      this.logger.error('Error fetching top tokens:', error);
      return [];
    }
  }

  public async searchTokens(query: string): Promise<FourMemeToken[]> {
    try {
      const response = await axios.get(`${this.baseURL}/tokens/search`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: { q: query },
        timeout: 10000
      });

      return response.data.tokens.map(this.mapTokenData);
    } catch (error) {
      this.logger.error(`Error searching tokens with query "${query}":`, error);
      return [];
    }
  }

  public async getTokenCategories(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseURL}/categories`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data.categories;
    } catch (error) {
      this.logger.error('Error fetching token categories:', error);
      return [];
    }
  }

  public async getTokensByCategory(category: string): Promise<FourMemeToken[]> {
    try {
      const response = await axios.get(`${this.baseURL}/tokens/category/${category}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data.tokens.map(this.mapTokenData);
    } catch (error) {
      this.logger.error(`Error fetching tokens for category "${category}":`, error);
      return [];
    }
  }

  private mapTokenData(data: any): FourMemeToken {
    return {
      address: data.address,
      name: data.name,
      symbol: data.symbol,
      description: data.description,
      image: data.image,
      website: data.website,
      twitter: data.twitter,
      telegram: data.telegram,
      category: data.category,
      launchTime: data.launchTime,
      bondingCurveAddress: data.bondingCurveAddress,
      creator: data.creator,
      totalSupply: BigInt(data.totalSupply),
      initialPrice: data.initialPrice,
      verified: data.verified,
      marketCap: data.marketCap,
      volume24h: data.volume24h,
      holders: data.holders,
      liquidity: data.liquidity,
      priceChange24h: data.priceChange24h
    };
  }

  private mapLaunchData(data: any): FourMemeLaunch {
    return {
      id: data.id,
      token: this.mapTokenData(data.token),
      launchType: data.launchType,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status,
      participants: data.participants,
      raisedAmount: data.raisedAmount,
      targetAmount: data.targetAmount
    };
  }

  public isConnected(): boolean {
    return this.isInitialized;
  }

  public async refreshConnection(): Promise<void> {
    try {
      await this.testConnection();
      this.logger.info('✅ Four.Meme API connection refreshed');
    } catch (error) {
      this.logger.error('❌ Failed to refresh Four.Meme API connection:', error);
      this.isInitialized = false;
    }
  }
}
