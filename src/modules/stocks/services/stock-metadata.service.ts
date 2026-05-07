import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockCategory } from '../../stock-categories/entities/stock-category.entity';

interface CompanyProfile {
  symbol: string;
  name?: string;
  description?: string;
  country?: string;
  sector?: string;
  industry?: string;
}

interface FmpProfileRaw {
  symbol?: string;
  companyName?: string;
  description?: string;
  country?: string;
  sector?: string;
  industry?: string;
  exchangeShortName?: string;
  website?: string;
}

interface PolygonTickerDetailsRaw {
  ticker?: string;
  name?: string;
  locale?: string;
  market?: string;
  type?: string;
  sic_description?: string;
  industry?: string;
  primary_exchange?: string;
  market_cap?: number;
  homepage_url?: string;
  branding?: { logo_url?: string | null } | null;
  share_class_shares_outstanding?: number | null;
  weighted_shares_outstanding?: number | null;
  list_date?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

interface PolygonTickerDetailsResponse {
  results?: PolygonTickerDetailsRaw | null;
  status?: string;
  request_id?: string;
}

@Injectable()
export class StockMetadataService {
  private readonly logger = new Logger(StockMetadataService.name);
  private readonly categoryMap: Record<string, string> = {
    // Simple normalization mapping; can be extended.
    // Keyed by lowercase industry or sector keywords
    'computer hardware': 'Technology',
    software: 'Technology',
    semiconductors: 'Technology',
    biotechnology: 'Healthcare',
    'health care': 'Healthcare',
    banks: 'Financials',
    'capital markets': 'Financials',
    insurance: 'Financials',
    'oil & gas': 'Energy',
    'oil & gas e&p': 'Energy',
    'oil & gas midstream': 'Energy',
    'oil & gas equipment & services': 'Energy',
    'renewable energy': 'Energy',
    'metals & mining': 'Materials',
    chemicals: 'Materials',
    gold: 'Materials',
    silver: 'Materials',
    lithium: 'Materials',
    'auto manufacturers': 'Consumer Discretionary',
    automobiles: 'Consumer Discretionary',
    'internet retail': 'Consumer Discretionary',
    'apparel retail': 'Consumer Discretionary',
    'beverages - non-alcoholic': 'Consumer Staples',
    confectioners: 'Consumer Staples',
    'packaged foods': 'Consumer Staples',
    'household & personal products': 'Consumer Staples',
    'aerospace & defense': 'Industrials',
    airlines: 'Industrials',
    railroads: 'Industrials',
    'utilities - regulated electric': 'Utilities',
    'utilities - regulated gas': 'Utilities',
    'utilities - renewable': 'Utilities',
    'real estate services': 'Real Estate',
    reit: 'Real Estate',
    'telecom services': 'Communication Services',
    entertainment: 'Communication Services',
    'interactive media & services': 'Communication Services',
  };

  private profileCache = new Map<
    string,
    { data: CompanyProfile | null; fetchedAt: number }
  >();
  private readonly PROFILE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
  private readonly MISS_TTL_MS = 1000 * 60 * 60; // 1 hour for failed lookups

  constructor(
    @InjectRepository(StockCategory)
    private readonly categoryRepository: Repository<StockCategory>,
  ) { }

  private getSystemUserId(): string | undefined {
    const v = process.env.SYSTEM_USER_ID?.trim();
    return v && v.length > 0 ? v : undefined;
  }

  private async fetchFmpProfile(
    symbol: string,
  ): Promise<CompanyProfile | null> {
    const apiKey = process.env.FMP_API_KEY?.trim();
    if (!apiKey) {
      this.logger.debug('FMP_API_KEY missing; cannot fetch profile');
      return null;
    }

    const upper = symbol.toUpperCase();
    const url = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(
      upper,
    )}&apikey=${apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        // Silent during plan restrictions (403) to avoid log noise
        if (response.status !== 403) {
          this.logger.debug(
            `FMP profile request failed for ${upper} status=${response.status}`,
          );
        }
        return null;
      }

      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload) || payload.length === 0) {
        return null;
      }

      const raw = payload[0] as FmpProfileRaw | undefined;
      if (!raw) {
        return null;
      }

      return {
        symbol: upper,
        name: raw.companyName ?? undefined,
        description: raw.description ?? undefined,
        country: raw.country ?? undefined,
        sector: raw.sector ?? undefined,
        industry: raw.industry ?? raw.sector ?? undefined,
      };
    } catch (error) {
      this.logger.debug(
        `FMP profile error for ${upper}: ${error instanceof Error ? error.message : error
        }`,
      );
      return null;
    }
  }

  private async fetchYahooProfile(
    symbol: string,
  ): Promise<CompanyProfile | null> {
    const upper = symbol.toUpperCase();
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
      upper,
    )}`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });
      if (!response.ok) return null;

      const payload = (await response.json()) as any;
      const result = payload?.quoteResponse?.result?.[0];
      if (!result) return null;

      return {
        symbol: upper,
        name: result.longName ?? result.shortName ?? result.symbol,
        description: result.description ?? undefined,
        country: result.region === 'US' ? 'USA' : result.region,
        // Yahoo simple quote doesn't provide sector/industry reliably without extra modules.
        sector: result.quoteType ?? undefined,
      };
    } catch (error) {
      this.logger.debug(
        `Yahoo metadata fallback error for ${upper}: ${error instanceof Error ? error.message : error
        }`,
      );
      return null;
    }
  }

  private async fetchPolygonProfile(
    symbol: string,
  ): Promise<CompanyProfile | null> {
    const apiKey = process.env.POLYGON_API_KEY?.trim();
    if (!apiKey) {
      this.logger.debug('POLYGON_API_KEY missing; cannot fetch profile');
      return null;
    }

    const upper = symbol.toUpperCase();
    const url = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(
      upper,
    )}?apiKey=${apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.debug(
          `Polygon ticker details request failed for ${upper} status=${response.status}`,
        );
        return null;
      }

      const payload = (await response.json()) as PolygonTickerDetailsResponse;
      const result = payload?.results;
      if (!result) {
        return null;
      }

      const industry =
        typeof result.sic_description === 'string'
          ? result.sic_description
          : typeof result.industry === 'string'
            ? result.industry
            : undefined;

      const country =
        typeof result.country === 'string'
          ? result.country
          : typeof result.locale === 'string'
            ? result.locale.toUpperCase()
            : undefined;

      return {
        symbol: upper,
        name: result.name ?? undefined,
        description: result.description ?? undefined,
        country,
        sector: result.type ?? undefined,
        industry,
      };
    } catch (error) {
      this.logger.debug(
        `Polygon profile error for ${upper}: ${error instanceof Error ? error.message : error
        }`,
      );
      return null;
    }
  }

  private async fetchCompanyProfile(
    symbol: string,
  ): Promise<CompanyProfile | null> {
    const upper = symbol.toUpperCase();
    const cached = this.profileCache.get(upper);
    const now = Date.now();

    if (cached) {
      const ttl = cached.data ? this.PROFILE_TTL_MS : this.MISS_TTL_MS;
      if (now - cached.fetchedAt < ttl) {
        return cached.data;
      }
    }

    const sources: Array<{ name: string; fetcher: () => Promise<CompanyProfile | null> }> = [
      { name: 'FMP', fetcher: () => this.fetchFmpProfile(upper) },
      { name: 'Polygon', fetcher: () => this.fetchPolygonProfile(upper) },
      { name: 'Yahoo', fetcher: () => this.fetchYahooProfile(upper) },
    ];

    for (const source of sources) {
      const profile = await source.fetcher();
      if (profile) {
        if (source.name !== 'FMP') {
          this.logger.debug(
            `Resolved metadata for ${upper} via fallback: ${source.name}`,
          );
        }
        this.profileCache.set(upper, { data: profile, fetchedAt: now });
        return profile;
      }
    }

    // All sources failed
    this.logger.warn(
      `Metadata resolution failed for ${upper} across all providers (FMP, Polygon, Yahoo)`,
    );
    this.profileCache.set(upper, { data: null, fetchedAt: now });
    return null;
  }

  /**
   * Get basic company metadata for a symbol (company name and country) using cached profile lookup.
   */
  async getCompanyBasics(symbol: string): Promise<{
    name?: string;
    description?: string;
    country?: string;
  } | null> {
    const profile = await this.fetchCompanyProfile(symbol);
    if (!profile) return null;
    return { name: profile.name, description: profile.description, country: profile.country };
  }

  private normalizeCategory(industry?: string): string | null {
    if (!industry) return null;
    const key = industry.toLowerCase();
    for (const pattern in this.categoryMap) {
      if (key.includes(pattern)) return this.categoryMap[pattern];
    }
    // Fallback: Title Case original industry as category
    return industry
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  async classifySymbol(
    symbol: string,
  ): Promise<{ category: StockCategory | null; industry?: string } | null> {
    const enabled =
      (process.env.ENABLE_CATEGORY_AUTO_CLASSIFY || 'true') === 'true';
    if (!enabled) return null;

    const profile = await this.fetchCompanyProfile(symbol);
    if (!profile) return null;

    const rawIndustry = profile.industry ?? profile.sector;
    const categoryName = this.normalizeCategory(rawIndustry);
    if (!categoryName) return null;

    let category = await this.categoryRepository.findOne({
      where: { name: categoryName },
    });
    if (!category) {
      category = this.categoryRepository.create({
        name: categoryName,
        created_by: this.getSystemUserId(),
        updated_by: this.getSystemUserId(),
      });
      try {
        await this.categoryRepository.save(category);
        this.logger.log(
          `Created new stock category '${categoryName}' (industry='${rawIndustry}')`,
        );
      } catch (e) {
        this.logger.debug(
          `Race creating category '${categoryName}': ${e instanceof Error ? e.message : e}`,
        );
        category = await this.categoryRepository.findOne({
          where: { name: categoryName },
        });
      }
    }

    return { category, industry: rawIndustry };
  }
}

/**
 * Classification Flow Overview
 * ---------------------------------
 * 1. When a new symbol is first seen, a placeholder stock row is created with default category 'Uncategorized'.
 * 2. A fire-and-forget call to assignCategoryIfPossible() triggers classifySymbol() here.
 * 3. classifySymbol():
 *    - Fetches FMP or Polygon company profile (cached for 6h) for sector/industry context.
 *    - Normalizes raw industry string via categoryMap (substring match) to a broader category (e.g., 'semiconductors' -> 'Technology').
 *    - If no mapping match, uses Title Cased original industry as a category name.
 *    - Ensures (creates if needed) a StockCategory row for the resolved name.
 *    - Returns that category so caller can update stock row.
 * 4. Lazy Reclassification: getStockWithCategory() will attempt classification again if category still 'Uncategorized'.
 * 5. Env Toggle: Set ENABLE_CATEGORY_AUTO_CLASSIFY=false to disable all automatic classification.
 *
 * Extending Mapping:
 *  - Add new lower-case keys to categoryMap whose substring should map to a standardized category.
 *  - Keep category names consistent to avoid duplicates with slightly different capitalization.
 *  - Consider migrating to a more robust taxonomy (GICS, ICB) if needed; that would change normalizeCategory().
 */
