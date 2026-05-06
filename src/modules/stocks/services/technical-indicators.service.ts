import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stock } from '../entities/stock.entity';
import {
  AlphaVantageMarketMoversResponse,
  AlphaVantageStock,
  MarketMoverStock,
  MarketMoversResponse,
  PolygonRsiResponse,
  PolygonAggregateBar,
  PriceResolution,
  RSISignal,
  StockNewsItem,
  StockNewsResponse,
  StockOverviewResponse,
  StockPerformanceEntry,
  StockPerformanceResponse,
  StockPriceHistoryRange,
  StockPriceHistoryResponse,
  StockPricePoint,
  StockRevenueResponse,
  PolygonFinancialResult,
  PolygonFinancialTimeframe,
  PolygonFinancialValue,
  StockFinancialMetrics,
  SupportBreakLoser,
  SupportBreakLosersResponse,
  SupportLevelsSnapshot,
  USMarketRsiBucketResponse,
  USMarketRsiBucketStock,
  CompanyDocumentsResponse,
  CompanyDocument,
} from './technical-indicators.types';
import { StockMetadataService } from './stock-metadata.service';

interface PolygonAggregatePayload {
  results?: Array<{
    c?: number;
    h?: number;
    l?: number;
    o?: number;
    v?: number;
    t?: number;
  }>;
  status?: string;
}

interface AlphaVantageDailySeries {
  [date: string]: {
    '1. open'?: string;
    '2. high'?: string;
    '3. low'?: string;
    '4. close'?: string;
    '5. adjusted close'?: string;
    '6. volume'?: string;
  };
}

interface GoogleSupportBreakRow {
  Ticker?: string;
  Price?: number | string;
  'Change %'?: number | string;
  'Support 1'?: number | string;
  'Support 2'?: number | string;
  'Resistance 1'?: number | string;
  'Resistance 2'?: number | string;
  RSI?: number | string;
  'EMA 50'?: number | string;
  'EMA 200'?: number | string;
  'Company name'?: string;
  Group?: string;
}

interface GoogleSupportBreakResponse {
  error?: boolean;
  data?: GoogleSupportBreakRow[];
  count?: number;
}

interface GoogleUsMarketRsiRow {
  Ticker?: string;
  RSI?: number | string;
  Price?: number | string;
  'Change %'?: number | string;
  Change?: number | string;
  Group?: string;
  'Company name'?: string;
  'Last Updated'?: string;
  'Updated At'?: string;
}

interface GoogleUsMarketRsiResponse {
  error?: boolean;
  data?: GoogleUsMarketRsiRow[];
  count?: number;
}

interface GoogleStockNewsRow {
  title?: string;
  title_th?: string;
  description?: string;
  description_th?: string;
  url?: string;
  publishedAt?: string;
  source?: string;
  ticker?: string;
  image?: string;
  sentiment?: string;
  topics?: string[];
}

interface GoogleStockNewsResponse {
  error?: boolean;
  data?: GoogleStockNewsRow[];
  count?: number;
}

interface GoogleStockOverviewResponse {
  error?: boolean;
  data?: GoogleSupportBreakRow | null;
}

type AlphaInterval =
  | '1min'
  | '5min'
  | '15min'
  | '30min'
  | '60min'
  | 'daily'
  | 'weekly'
  | 'monthly';

type PolygonTimespan = 'minute' | 'hour' | 'day' | 'week' | 'month';

@Injectable()
export class TechnicalIndicatorsService {
  private readonly logger = new Logger(TechnicalIndicatorsService.name);
  private readonly alphaVantageApiKey = process.env.ALPHA_VANTAGE_KEY;
  private readonly polygonApiKey = process.env.POLYGON_API_KEY;
  private readonly fmpApiKey = process.env.FMP_API_KEY;
  private readonly primaryProvider = process.env.MARKET_DATA_PRIMARY?.toLowerCase() || 'polygon';

  private readonly allowedUsExchanges = new Set<string>([
    'NASDAQ',
    'NYSE',
    'NYSEARCA',
    'NYSEAMERICAN',
    'NYSEMKT',
    'AMEX',
    'CBOE',
    'BATS',
    'ARCA',
    'NASDAQGS',
    'NASDAQCM',
    'NASDAQGM',
    'XNYS',
    'XNAS',
    'XNCM',
    'XNMS',
    'XASE',
    'ARCX',
    'BATSZ',
    'EDGX',
    'EDGA',
    'IEX',
  ]);
  private readonly blockedExchangePrefixes = new Set<string>([
    'OTC',
    'OTCMKTS',
    'OTCBB',
    'OTCPK',
    'PINK',
    'TSX',
    'TSXV',
    'CSE',
    'CNQ',
    'BSE',
    'NSE',
    'LON',
    'ASX',
    'TSE',
    'SSE',
    'SZSE',
    'HKSE',
    'SGX',
    'FOREX',
    'CRYPTO',
    'INDEX',
  ]);
  private readonly usRegions = new Set<string>([
    'UNITED STATES',
    'UNITED STATES OF AMERICA',
    'USA',
    'US',
    'AMERICA',
  ]);
  private readonly symbolPattern = /^[A-Z0-9.-]+$/;
  private readonly supportBreakSourceUrl = process.env.SUPPORT_BREAK_SOURCE_URL;
  private readonly allUsMarketMoversSourceUrl =
    process.env.ALL_US_MARKET_MOVERS_SOURCE_URL ?? '';
  private readonly stockNewsSourceUrl =
    process.env.STOCK_NEWS_SOURCE_URL ??
    process.env.GOOGLE_STOCK_NEWS_SOURCE_URL ??
    '';
  private readonly usMarketRsiSourceUrl =
    process.env.US_MARKET_RSI_SOURCE_URL ??
    process.env.ALL_US_RSI_SOURCE_URL ??
    '';
  private readonly stockOverviewSourceUrl =
    process.env.STOCK_OVERVIEW_SOURCE_URL ?? '';
  constructor(
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    private readonly stockMetadataService: StockMetadataService,
  ) {
    if (!this.alphaVantageApiKey && !this.polygonApiKey) {
      this.logger.warn(
        'No market data provider configured. Please set ALPHA_VANTAGE_KEY and/or POLYGON_API_KEY.',
      );
    }
  }

  private classifyRsi(value: number): RSISignal['status'] {
    if (value <= 30) {
      return 'oversold';
    }
    if (value >= 70) {
      return 'overbought';
    }
    return 'neutral';
  }

  private parseNumericString(value: string): number | null {
    const cleaned = value.replace(/[%,$]/g, '').replace(/,/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeNumeric(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private roundTo(
    value: number | null | undefined,
    decimals = 2,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (!Number.isFinite(value)) {
      return null;
    }
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  private parseBooleanString(value?: string): boolean | null {
    if (value === undefined || value === null) {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
    return null;
  }

  private async fetchGoogleSupportDatasetRows(
    url: string | null | undefined,
    datasetLabel: string,
  ): Promise<GoogleSupportBreakRow[] | null> {
    const normalizedUrl = url?.trim();
    if (!normalizedUrl) {
      this.logger.error(`${datasetLabel} dataset URL not configured`);
      return null;
    }

    try {
      const response = await fetch(normalizedUrl);
      if (!response.ok) {
        this.logger.error(
          `Failed to fetch ${datasetLabel} dataset (status=${response.status})`,
        );
        return null;
      }

      const payload = (await response.json()) as GoogleSupportBreakResponse;
      if (payload.error) {
        this.logger.error(`${datasetLabel} dataset reported an error flag`);
        return null;
      }

      if (!Array.isArray(payload.data) || !payload.data.length) {
        this.logger.warn(`${datasetLabel} dataset returned no rows`);
        return null;
      }

      return payload.data;
    } catch (error) {
      this.logger.error(`Error fetching ${datasetLabel} dataset`, error);
      return null;
    }
  }

  private async fetchExternalSupportBreakRows(): Promise<
    GoogleSupportBreakRow[] | null
  > {
    return this.fetchGoogleSupportDatasetRows(
      this.supportBreakSourceUrl,
      'external support-break',
    );
  }

  private async fetchExternalAllUsMarketMoverRows(): Promise<
    GoogleSupportBreakRow[] | null
  > {
    return this.fetchGoogleSupportDatasetRows(
      this.allUsMarketMoversSourceUrl,
      'ALL US market movers',
    );
  }

  private async fetchGoogleStockNewsRows(): Promise<
    GoogleStockNewsRow[] | null
  > {
    const url = this.stockNewsSourceUrl?.trim();
    if (!url) {
      this.logger.error('Stock news dataset URL not configured');
      return null;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.error(
          `Failed to fetch stock news dataset (status=${response.status})`,
        );
        return null;
      }

      const payload = (await response.json()) as GoogleStockNewsResponse;
      if (payload.error) {
        this.logger.error('Stock news dataset reported an error flag');
        return null;
      }

      if (!Array.isArray(payload.data) || !payload.data.length) {
        this.logger.warn('Stock news dataset returned no rows');
        return null;
      }

      return payload.data;
    } catch (error) {
      this.logger.error('Error fetching stock news dataset', error);
      return null;
    }
  }

  private async fetchGoogleStockOverviewRow(
    symbol: string,
  ): Promise<GoogleSupportBreakRow | null> {
    const baseUrl = this.stockOverviewSourceUrl?.trim();
    if (!baseUrl) {
      this.logger.error('Stock overview dataset URL not configured');
      return null;
    }

    const searchParams = new URLSearchParams({
      ticker: symbol,
      symbol,
    });
    const separator = baseUrl.includes('?') ? '&' : '?';
    const requestUrl = `${baseUrl}${separator}${searchParams.toString()}`;

    try {
      const response = await fetch(requestUrl);
      if (!response.ok) {
        this.logger.error(
          `Failed to fetch stock overview dataset (status=${response.status})`,
        );
        return null;
      }

      const payload = (await response.json()) as any;

      if (!payload || !payload.data) {
        this.logger.warn(
          `Stock overview dataset returned no data field for ${symbol}`,
        );
        return null;
      }

      // Handle both single object and array responses
      const rows = Array.isArray(payload.data) ? payload.data : [payload.data];

      // Find the specific ticker in the response (case-insensitive)
      const targetRow = rows.find(
        (row: any) => row.Ticker?.toUpperCase() === symbol.toUpperCase(),
      );

      if (!targetRow) {
        this.logger.warn(`Ticker ${symbol} not found in script response`);
      }

      return targetRow || null;
    } catch (error) {
      this.logger.error('Error fetching stock overview dataset', error);
      return null;
    }
  }

  private async fetchExternalUsMarketRsiRows(): Promise<
    GoogleUsMarketRsiRow[] | null
  > {
    if (!this.usMarketRsiSourceUrl) {
      this.logger.error('US market RSI dataset URL not configured');
      return null;
    }

    try {
      const response = await fetch(this.usMarketRsiSourceUrl);
      if (!response.ok) {
        this.logger.error(
          `Failed to fetch US market RSI dataset (status=${response.status})`,
        );
        return null;
      }

      const payload =
        (await response.json()) as GoogleUsMarketRsiResponse | null;

      if (!payload || payload.error) {
        this.logger.error('US market RSI dataset reported an error');
        return null;
      }

      if (!Array.isArray(payload.data) || !payload.data.length) {
        this.logger.warn('US market RSI dataset returned no rows');
        return null;
      }

      return payload.data;
    } catch (error) {
      this.logger.error('Error fetching US market RSI dataset', error);
      return null;
    }
  }

  private mapGoogleSupportBreakRow(
    row: GoogleSupportBreakRow,
  ): SupportBreakLoser | null {
    const symbol = this.asString(row.Ticker)?.trim().toUpperCase();
    if (!symbol || !this.symbolPattern.test(symbol)) {
      return null;
    }

    const parseValue = (value?: number | string): number | null => {
      if (typeof value === 'string' && !value.trim()) {
        return null;
      }
      return this.normalizeNumeric(value);
    };

    const price = parseValue(row.Price);
    if (price === null) {
      return null;
    }

    const changePercentRaw = parseValue(row['Change %']);
    const changePercent =
      changePercentRaw !== null && Number.isFinite(changePercentRaw)
        ? changePercentRaw
        : 0;

    const support1 = this.roundTo(parseValue(row['Support 1']));
    const support2 = this.roundTo(parseValue(row['Support 2']));
    const resistance1 = this.roundTo(parseValue(row['Resistance 1']));
    const resistance2 = this.roundTo(parseValue(row['Resistance 2']));
    const rsi = this.roundTo(parseValue(row.RSI));
    const ema50 = this.roundTo(parseValue(row['EMA 50']));
    const ema200 = this.roundTo(parseValue(row['EMA 200']));
    const companyName = this.asString(row['Company name'])?.trim() ?? null;
    const group = this.asString(row.Group)?.trim() ?? null;

    const changeValue = this.roundTo(
      price * (changePercent !== null ? changePercent / 100 : 0),
    );

    let belowSupportPercent: number | null = null;
    let distanceToSupportPercent: number | null = null;

    if (support1 !== null && support1 !== 0) {
      const deltaPercent = this.roundTo(((price - support1) / support1) * 100);
      if (deltaPercent !== null) {
        if (deltaPercent < 0) {
          belowSupportPercent = deltaPercent;
        } else {
          distanceToSupportPercent = deltaPercent;
        }
      }
    }

    return {
      symbol,
      companyName,
      lastPrice: price,
      changePercent,
      change: changeValue,
      volume: null,
      supportLevel: support1,
      supportLevelSecondary: support2,
      resistance1,
      resistance2,
      belowSupportPercent,
      distanceToSupportPercent,
      rsi,
      ema50,
      ema200,
      group,
    };
  }

  private mapGoogleMarketMoverRow(
    row: GoogleSupportBreakRow,
  ): MarketMoverStock | null {
    const symbol = this.asString(row.Ticker)?.trim().toUpperCase();
    if (!symbol || !this.symbolPattern.test(symbol)) {
      return null;
    }

    const price = this.normalizeNumeric(row.Price);
    const changePercentValue = this.normalizeNumeric(row['Change %']);
    if (price === null || changePercentValue === null) {
      return null;
    }

    const lastPrice = this.roundTo(price);
    const changePercent = this.roundTo(changePercentValue);
    if (lastPrice === null || changePercent === null) {
      return null;
    }

    const change = this.roundTo(lastPrice * (changePercent / 100)) ?? 0;

    return {
      symbol,
      lastPrice,
      changePercent,
      change,
      high: null,
      low: null,
      volume: null,
      companyName: row['Company name']?.toString().trim() || null,
    };
  }

  private getFinancialResultTimestamp(result: PolygonFinancialResult): number {
    const candidates = [
      result.end_date,
      result.start_date,
      result.filing_date,
      result.acceptance_datetime,
    ];
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const timestamp = Date.parse(candidate);
      if (!Number.isNaN(timestamp)) {
        return timestamp;
      }
    }
    return 0;
  }

  private sortFinancialResults(
    results: PolygonFinancialResult[],
  ): PolygonFinancialResult[] {
    return [...results].sort(
      (a, b) =>
        this.getFinancialResultTimestamp(a) -
        this.getFinancialResultTimestamp(b),
    );
  }

  private buildFinancialPeriodLabel(result: PolygonFinancialResult): string {
    const period = result.fiscal_period?.trim();
    const year = result.fiscal_year?.trim();
    if (period && year) {
      return `${period} ${year}`;
    }
    const fallback = result.end_date ?? result.filing_date ?? result.start_date;
    return fallback ?? 'Unknown period';
  }

  private extractFinancialValue(value?: PolygonFinancialValue): number | null {
    if (value === null) {
      return null;
    }
    if (value?.value === null || value?.value === undefined) {
      return null;
    }
    return Number.isFinite(value.value) ? value.value : null;
  }

  private computeFinancialYoy(
    results: PolygonFinancialResult[],
    index: number,
    timeframe: PolygonFinancialTimeframe,
    extractor: (
      financials?: PolygonFinancialResult['financials'],
    ) => number | null,
  ): number | null {
    const current = extractor(results[index]?.financials);
    if (current === null) {
      return null;
    }
    const offset = timeframe === 'quarterly' ? 4 : 1;
    const comparison = results[index - offset];
    if (!comparison) {
      return null;
    }
    const previous = extractor(comparison.financials);
    if (previous === null || previous === 0) {
      return null;
    }
    return this.roundTo(((current - previous) / previous) * 100, 1);
  }

  private formatFinancialValue(value: number | null): string | null {
    if (value === null) {
      return null;
    }
    const abs = Math.abs(value);
    const units = [
      { threshold: 1_000_000_000_000, suffix: 'T', divisor: 1_000_000_000_000 },
      { threshold: 1_000_000_000, suffix: 'B', divisor: 1_000_000_000 },
      { threshold: 1_000_000, suffix: 'M', divisor: 1_000_000 },
      { threshold: 1_000, suffix: 'K', divisor: 1_000 },
    ];

    for (const unit of units) {
      if (abs >= unit.threshold) {
        const rounded = this.roundTo(value / unit.divisor, 2);
        if (rounded === null) {
          return null;
        }
        const prefix = value < 0 ? '-$' : '$';
        return `${prefix}${Math.abs(rounded)}${unit.suffix}`;
      }
    }

    const rounded = this.roundTo(value, 2);
    if (rounded === null) {
      return null;
    }
    const prefix = value < 0 ? '-$' : '$';
    return `${prefix}${Math.abs(rounded)}`;
  }

  private buildFinancialMetrics(
    results: PolygonFinancialResult[],
    timeframe: PolygonFinancialTimeframe,
  ): StockFinancialMetrics {
    const buildEntries = (
      extractor: (
        financials?: PolygonFinancialResult['financials'],
      ) => number | null,
    ) =>
      results.map((entry, index) => {
        const value = extractor(entry.financials);
        return {
          period: this.buildFinancialPeriodLabel(entry),
          fiscalPeriod: entry.fiscal_period ?? null,
          fiscalYear: entry.fiscal_year ?? null,
          startDate: entry.start_date ?? null,
          endDate: entry.end_date ?? null,
          filingDate: entry.filing_date ?? null,
          value,
          valueFormatted: this.formatFinancialValue(value),
          yoyChangePercent: this.computeFinancialYoy(
            results,
            index,
            timeframe,
            extractor,
          ),
        };
      });

    return {
      totalRevenue: buildEntries((financials) =>
        this.extractFinancialValue(financials?.income_statement?.revenues),
      ),
      grossProfit: buildEntries((financials) =>
        this.extractFinancialValue(financials?.income_statement?.gross_profit),
      ),
      operatingIncome: buildEntries((financials) =>
        this.extractFinancialValue(
          financials?.income_statement?.operating_income_loss,
        ),
      ),
      netIncome: buildEntries((financials) =>
        this.extractFinancialValue(
          financials?.income_statement?.net_income_loss,
        ),
      ),
    };
  }

  private mapGoogleUsMarketRsiRow(
    row: GoogleUsMarketRsiRow,
  ): USMarketRsiBucketStock | null {
    const symbol = this.asString(row.Ticker)?.trim().toUpperCase();
    if (!symbol || !this.symbolPattern.test(symbol)) {
      return null;
    }

    const rsi = this.roundTo(this.normalizeNumeric(row.RSI));
    if (rsi === null) {
      return null;
    }

    const status = this.classifyRsi(rsi);
    if (status === 'neutral') {
      return null;
    }

    const lastPrice = this.roundTo(this.normalizeNumeric(row.Price));
    const changePercent = this.roundTo(this.normalizeNumeric(row['Change %']));
    const change =
      changePercent !== null && lastPrice !== null
        ? this.roundTo(lastPrice * (changePercent / 100))
        : this.roundTo(this.normalizeNumeric(row.Change));
    const group = this.asString(row.Group)?.trim() ?? null;
    const companyName = this.asString(row['Company name'])?.trim() ?? null;
    const lastUpdatedRaw =
      this.asString(row['Last Updated']) ?? this.asString(row['Updated At']);
    const lastUpdated = lastUpdatedRaw ? new Date(lastUpdatedRaw) : null;

    return {
      symbol,
      rsi,
      status,
      lastPrice,
      changePercent,
      change,
      group,
      companyName,
      lastUpdated:
        lastUpdated && Number.isNaN(lastUpdated.getTime()) ? null : lastUpdated,
    };
  }

  private isLikelyUsExchange(value?: string, regionIsUs = false): boolean {
    if (!value) {
      return false;
    }
    const upper = value.trim().toUpperCase();
    if (!upper) {
      return false;
    }
    if (this.blockedExchangePrefixes.has(upper)) {
      return false;
    }
    if (this.allowedUsExchanges.has(upper)) {
      return true;
    }
    if (
      upper.startsWith('NYSE') ||
      upper.startsWith('NASDAQ') ||
      upper.startsWith('BATS') ||
      upper.startsWith('CBOE') ||
      upper.startsWith('EDGX') ||
      upper.startsWith('EDGA') ||
      upper.startsWith('IEX') ||
      upper.startsWith('ARCX') ||
      upper.startsWith('XNY') ||
      upper.startsWith('XNA')
    ) {
      return true;
    }
    return regionIsUs;
  }

  private normalizeAlphaVantageTicker(stock: AlphaVantageStock): string | null {
    const rawTicker = stock.ticker?.trim();
    if (!rawTicker) {
      return null;
    }

    if (this.parseBooleanString(stock.is_etf) === true) {
      return null;
    }

    if (this.parseBooleanString(stock.is_actively_trading) === false) {
      return null;
    }

    const segments = rawTicker.split(':');
    let exchangePrefix: string | undefined;
    let symbolPart = rawTicker;

    if (segments.length > 1) {
      exchangePrefix = segments[0]?.trim().toUpperCase();
      symbolPart = segments.slice(1).join(':').trim();
    }

    const region = stock.region?.trim().toUpperCase();
    const regionIsUs = region ? this.usRegions.has(region) : false;
    if (region && !regionIsUs) {
      return null;
    }

    if (
      exchangePrefix &&
      !this.isLikelyUsExchange(exchangePrefix, regionIsUs) &&
      !regionIsUs
    ) {
      return null;
    }

    const marketValue = (stock.market ?? stock.exchange ?? '').trim();
    if (
      marketValue &&
      !this.isLikelyUsExchange(marketValue, regionIsUs) &&
      !regionIsUs
    ) {
      return null;
    }

    const symbol = (symbolPart || rawTicker).toUpperCase();
    if (!this.symbolPattern.test(symbol)) {
      return null;
    }

    return symbol;
  }

  private filterAlphaVantageStocks<T>(
    stocks: AlphaVantageStock[] | undefined,
    limit: number,
    mapper: (stock: AlphaVantageStock, symbol: string) => T,
  ): { items: T[]; skipped: string[] } {
    const items: T[] = [];
    const skipped: string[] = [];
    const seenSymbols = new Set<string>();

    for (const stock of stocks ?? []) {
      const normalizedSymbol = this.normalizeAlphaVantageTicker(stock);
      if (!normalizedSymbol) {
        if (stock.ticker) {
          skipped.push(stock.ticker);
        }
        continue;
      }

      if (seenSymbols.has(normalizedSymbol)) {
        continue;
      }

      seenSymbols.add(normalizedSymbol);
      items.push(mapper(stock, normalizedSymbol));

      if (items.length >= limit) {
        break;
      }
    }

    return { items, skipped };
  }

  private toMarketMoverStock(
    stock: AlphaVantageStock,
    symbol: string,
  ): MarketMoverStock {
    const price = this.parseNumericString(stock.price) ?? 0;
    const change = this.parseNumericString(stock.change_amount) ?? 0;
    const changePercent = this.parseNumericString(stock.change_percentage) ?? 0;
    const volume = this.parseNumericString(stock.volume);

    return {
      symbol,
      lastPrice: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      high: null,
      low: null,
      volume: volume !== null ? Math.round(volume) : null,
    };
  }

  private mapResolutionToPolygon(resolution: PriceResolution): {
    multiplier: number;
    timespan: PolygonTimespan;
  } {
    switch (resolution) {
      case 'week':
        return { multiplier: 1, timespan: 'week' };
      case 'month':
        return { multiplier: 1, timespan: 'month' };
      default:
        return { multiplier: 1, timespan: 'day' };
    }
  }

  private async fetchPolygonAggregates(
    symbol: string,
    resolution: PriceResolution,
    from: number,
    to: number,
  ): Promise<StockPricePoint[] | null> {
    if (!this.polygonApiKey) {
      return null;
    }

    const upper = symbol.toUpperCase();
    const { multiplier, timespan } = this.mapResolutionToPolygon(resolution);
    const fromMs = Math.max(0, from * 1000);
    const toMs = Math.max(fromMs + 60_000, to * 1000);
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(upper)}/range/${multiplier}/${timespan}/${fromMs}/${toMs}?adjusted=true&sort=asc&limit=50000&apiKey=${this.polygonApiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(
          `Polygon aggregates request failed for ${upper}: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const payload = (await response.json()) as PolygonAggregatePayload;
      const results = Array.isArray(payload?.results) ? payload.results : [];

      if (!results.length) {
        this.logger.debug(`Polygon returned no aggregates for ${upper}`);
        return null;
      }

      const points: StockPricePoint[] = [];
      for (const item of results) {
        const close = item?.c;
        const timestamp = item?.t;
        if (typeof close !== 'number' || !Number.isFinite(close)) {
          continue;
        }
        if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
          continue;
        }
        const volume = item?.v;
        points.push({
          timestamp,
          date: new Date(timestamp).toISOString(),
          close: this.roundTo(close, 2) ?? close,
          volume:
            typeof volume === 'number' && Number.isFinite(volume)
              ? Math.round(volume)
              : null,
        });
      }

      points.sort((a, b) => a.timestamp - b.timestamp);
      return points;
    } catch (error) {
      this.logger.error(
        `Error fetching Polygon aggregates for ${upper}:`,
        error,
      );
      return null;
    }
  }

  private async fetchAlphaVantageSeries(
    symbol: string,
    resolution: PriceResolution,
    from: number,
    to: number,
  ): Promise<StockPricePoint[] | null> {
    if (!this.alphaVantageApiKey) {
      return null;
    }

    const upper = symbol.toUpperCase();
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(upper)}&outputsize=full&apikey=${this.alphaVantageApiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(
          `Alpha Vantage daily series request failed for ${upper}: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      if (typeof payload['Error Message'] === 'string') {
        this.logger.warn(
          `Alpha Vantage returned error for ${upper}: ${payload['Error Message']}`,
        );
        return null;
      }
      if (typeof payload['Note'] === 'string') {
        this.logger.warn(
          `Alpha Vantage throttle notice for ${upper}: ${payload['Note']}`,
        );
        return null;
      }

      const seriesKey = Object.keys(payload).find((key) =>
        key.toLowerCase().includes('time series'),
      );
      if (!seriesKey) {
        this.logger.debug(
          `Alpha Vantage payload missing time series for ${upper}`,
        );
        return null;
      }

      const series = payload[seriesKey];
      if (!series || typeof series !== 'object') {
        this.logger.debug(`Alpha Vantage time series invalid for ${upper}`);
        return null;
      }

      const fromMs = from * 1000;
      const toMs = to * 1000;

      const points: StockPricePoint[] = [];
      for (const [date, values] of Object.entries(
        series as AlphaVantageDailySeries,
      )) {
        const closeRaw = values['5. adjusted close'] ?? values['4. close'];
        const volumeRaw = values['6. volume'];
        const closeValue = this.parseNumericString(closeRaw ?? '') ?? null;
        if (closeValue === null) {
          continue;
        }
        const timestamp = Date.parse(`${date}T00:00:00Z`);
        if (!Number.isFinite(timestamp)) {
          continue;
        }
        if (timestamp < fromMs || timestamp > toMs) {
          continue;
        }
        const volumeValue = this.parseNumericString(volumeRaw ?? '');
        points.push({
          timestamp,
          date: new Date(timestamp).toISOString(),
          close: this.roundTo(closeValue, 2) ?? closeValue,
          volume: volumeValue !== null ? Math.round(volumeValue) : null,
        });
      }

      points.sort((a, b) => a.timestamp - b.timestamp);

      if (!points.length) {
        this.logger.debug(
          `Alpha Vantage returned no points within range for ${upper}`,
        );
        return null;
      }

      if (resolution === 'day') {
        return points;
      }

      return this.aggregateSeries(points, resolution);
    } catch (error) {
      this.logger.error(
        `Error fetching Alpha Vantage daily series for ${upper}:`,
        error,
      );
      return null;
    }
  }

  private aggregateSeries(
    points: StockPricePoint[],
    resolution: PriceResolution,
  ): StockPricePoint[] {
    if (resolution === 'day' || !points.length) {
      return points;
    }

    const buckets = new Map<
      number,
      {
        timestamp: number;
        close: number;
        volume: number;
      }
    >();

    for (const point of points) {
      const bucketStart =
        resolution === 'week'
          ? this.getWeekStart(point.timestamp)
          : this.getMonthStart(point.timestamp);
      const existing = buckets.get(bucketStart);
      const pointVolume = typeof point.volume === 'number' ? point.volume : 0;
      if (!existing) {
        buckets.set(bucketStart, {
          timestamp: point.timestamp,
          close: point.close,
          volume: pointVolume,
        });
        continue;
      }

      if (point.timestamp >= existing.timestamp) {
        existing.timestamp = point.timestamp;
        existing.close = point.close;
      }

      existing.volume += pointVolume;
    }

    return Array.from(buckets.entries())
      .map(([, data]) => ({
        timestamp: data.timestamp,
        date: new Date(data.timestamp).toISOString(),
        close: this.roundTo(data.close, 2) ?? data.close,
        volume: Number.isFinite(data.volume) ? Math.round(data.volume) : null,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private getWeekStart(timestamp: number): number {
    const date = new Date(timestamp);
    const day = date.getUTCDay();
    const diff = (day + 6) % 7; // convert so Monday is start of week
    const start = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    );
    return start - diff * 86400 * 1000;
  }

  private getMonthStart(timestamp: number): number {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }

  private async fetchPriceSeries(
    symbol: string,
    resolution: PriceResolution,
    from: number,
    to: number,
  ): Promise<{
    provider: 'fmp' | 'polygon' | 'alphaVantage' | null;
    points: StockPricePoint[];
    message?: string;
  }> {
    let message: string | undefined;

    const providers: Array<{
      id: 'fmp' | 'polygon' | 'alphaVantage';
      fetcher: () => Promise<StockPricePoint[] | null>;
      key: string | undefined;
    }> = [
        { id: 'fmp', fetcher: () => this.fetchFmpSeries(symbol, resolution, from, to), key: this.fmpApiKey },
        { id: 'polygon', fetcher: () => this.fetchPolygonAggregates(symbol, resolution, from, to), key: this.polygonApiKey },
        { id: 'alphaVantage', fetcher: () => this.fetchAlphaVantageSeries(symbol, resolution, from, to), key: this.alphaVantageApiKey },
      ];

    // Reorder based on primary preference
    if (this.primaryProvider === 'fmp') {
      const fmpIdx = providers.findIndex(p => p.id === 'fmp');
      if (fmpIdx > -1) {
        const [fmp] = providers.splice(fmpIdx, 1);
        providers.unshift(fmp);
      }
    } else if (this.primaryProvider === 'alphavantage') {
      const avIdx = providers.findIndex(p => p.id === 'alphaVantage');
      if (avIdx > -1) {
        const [av] = providers.splice(avIdx, 1);
        providers.unshift(av);
      }
    }

    for (const p of providers) {
      if (!p.key) continue;
      const points = await p.fetcher();
      if (points && points.length) {
        return { provider: p.id, points };
      }
      message = message ? `${message}; ${p.id} returned no data` : `${p.id} returned no data`;
    }

    if (!this.fmpApiKey && !this.polygonApiKey && !this.alphaVantageApiKey) {
      message = 'No FMP, Polygon, or Alpha Vantage API key configured';
    }

    return { provider: null, points: [], message };
  }

  private async fetchFmpSeries(
    symbol: string,
    resolution: PriceResolution,
    from: number,
    to: number,
  ): Promise<StockPricePoint[] | null> {
    if (!this.fmpApiKey) return null;

    const upper = symbol.toUpperCase();
    const fromDate = this.formatDatePath(from * 1000);
    const toDate = this.formatDatePath(to * 1000);
    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(
      upper,
    )}?from=${fromDate}&to=${toDate}&apikey=${this.fmpApiKey}`;

    // const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(
    //   )}&from=${fromDate}&to=${toDate}&apikey=${this.fmpApiKey}`;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const payload = (await response.json()) as any;
      const historical = Array.isArray(payload) ? payload : payload?.historical;
      if (!Array.isArray(historical)) return null;

      const points: StockPricePoint[] = historical.map((h: any) => ({
        timestamp: Date.parse(`${h.date}T00:00:00Z`),
        date: new Date(`${h.date}T00:00:00Z`).toISOString(),
        close: h.close,
        volume: h.volume,
      }));

      points.sort((a, b) => a.timestamp - b.timestamp);

      if (resolution === 'day') return points;
      return this.aggregateSeries(points, resolution);
    } catch (error) {
      this.logger.debug(`FMP price history error: ${error.message}`);
      return null;
    }
  }

  private quantile(sorted: number[], q: number): number | null {
    if (!sorted.length) {
      return null;
    }
    if (q <= 0) {
      return sorted[0];
    }
    if (q >= 1) {
      return sorted[sorted.length - 1];
    }

    const position = (sorted.length - 1) * q;
    const base = Math.floor(position);
    const rest = position - base;
    const lower = sorted[base];
    const upper = sorted[base + 1] ?? lower;
    return lower + rest * (upper - lower);
  }

  private buildSupportSnapshot(
    points: StockPricePoint[],
    currentPrice?: number | null,
  ): SupportLevelsSnapshot | null {
    const closes = points
      .map((point) => point.close)
      .filter((value) => typeof value === 'number' && Number.isFinite(value));

    if (!closes.length) {
      return null;
    }

    const sorted = [...closes].sort((a, b) => a - b);
    const latest =
      typeof currentPrice === 'number' && Number.isFinite(currentPrice)
        ? currentPrice
        : (points[points.length - 1]?.close ?? null);

    const supportPrimary = this.quantile(sorted, sorted.length > 1 ? 0.2 : 0);
    const supportSecondary = this.quantile(
      sorted,
      sorted.length > 2 ? 0.35 : 0,
    );
    const resistancePrimary = this.quantile(
      sorted,
      sorted.length > 1 ? 0.65 : 1,
    );
    const resistanceSecondary = this.quantile(
      sorted,
      sorted.length > 2 ? 0.85 : 1,
    );

    const belowSupportPercent =
      supportPrimary !== null && supportPrimary !== 0 && latest !== null
        ? ((latest - supportPrimary) / supportPrimary) * 100
        : null;

    return {
      supportLevel:
        supportPrimary !== null ? this.roundTo(supportPrimary, 2) : null,
      supportLevelSecondary:
        supportSecondary !== null ? this.roundTo(supportSecondary, 2) : null,
      resistance1:
        resistancePrimary !== null ? this.roundTo(resistancePrimary, 2) : null,
      resistance2:
        resistanceSecondary !== null
          ? this.roundTo(resistanceSecondary, 2)
          : null,
      belowSupportPercent:
        belowSupportPercent !== null
          ? this.roundTo(belowSupportPercent, 2)
          : null,
      distanceToSupportPercent:
        belowSupportPercent !== null
          ? this.roundTo(Math.abs(belowSupportPercent), 2)
          : null,
    } satisfies SupportLevelsSnapshot;
  }

  private readonly performanceTimeframes: Array<{
    label: StockPerformanceEntry['timeframe'];
    days?: number;
    mode?: 'YTD';
  }> = [
      { label: '1D', days: 1 },
      { label: '1W', days: 7 },
      { label: '1M', days: 30 },
      { label: '3M', days: 90 },
      { label: '6M', days: 180 },
      { label: 'YTD', mode: 'YTD' },
      { label: '1Y', days: 365 },
      { label: '5Y', days: 5 * 365 },
    ];

  private resolveHistoryRange(range: StockPriceHistoryRange): {
    from: number;
    resolution: PriceResolution;
  } {
    const nowSeconds = Math.floor(Date.now() / 1000);
    switch (range) {
      case '1M':
        return { from: nowSeconds - 30 * 86400, resolution: 'day' };
      case '3M':
        return { from: nowSeconds - 90 * 86400, resolution: 'day' };
      case '6M':
        return { from: nowSeconds - 180 * 86400, resolution: 'day' };
      case '1Y':
        return { from: nowSeconds - 365 * 86400, resolution: 'day' };
      case 'YTD': {
        const now = new Date();
        const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0);
        return {
          from: Math.floor(startOfYear / 1000),
          resolution: 'day',
        };
      }
      default:
        return { from: nowSeconds - 180 * 86400, resolution: 'day' };
    }
  }

  private formatDatePath(timestampMs: number): string {
    const date = new Date(timestampMs);
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getPerformanceWindowStart(): number {
    // Fetch slightly more than five years of data to cover the longest timeframe bucket.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const fiveYearsSeconds = 5 * 365 * 86400;
    const bufferSeconds = 30 * 86400; // pad for market holidays/weekends
    return nowSeconds - fiveYearsSeconds - bufferSeconds;
  }

  private getSupportLookbackSeconds(resolution: PriceResolution): number {
    switch (resolution) {
      case 'week':
        return 3 * 365 * 86400; // approx 3 years
      case 'month':
        return 5 * 365 * 86400; // approx 5 years
      default:
        return 180 * 86400; // 6 months for daily data
    }
  }

  private async computeSupportSnapshot(
    symbol: string,
    resolution: PriceResolution,
    currentPrice?: number | null,
  ): Promise<{
    snapshot: SupportLevelsSnapshot | null;
    provider: 'fmp' | 'polygon' | 'alphaVantage' | 'database' | null;
    message?: string;
  }> {
    const upper = symbol.toUpperCase();
    
    // 1. Check database for manual/curated support levels first
    const dbStock = await this.stockRepository.findOne({ where: { symbol: upper } }).catch(() => null);
    const hasDbSupports = dbStock && (
      dbStock.support1 !== null || 
      dbStock.support2 !== null || 
      dbStock.resistance1 !== null || 
      dbStock.resistance2 !== null
    );

    // 2. Fetch history for RSI/EMA calculations and fallback S/R
    const now = Math.floor(Date.now() / 1000);
    const from = now - this.getSupportLookbackSeconds(resolution);
    const history = await this.fetchPriceSeries(symbol, resolution, from, now);
    
    // 3. Build baseline snapshot from history
    let snapshot = history.points.length
      ? this.buildSupportSnapshot(history.points, currentPrice)
      : null;

    // 4. Apply database overrides (Priority 1)
    if (hasDbSupports) {
      if (!snapshot) {
        snapshot = {
          supportLevel: null,
          supportLevelSecondary: null,
          resistance1: null,
          resistance2: null,
        };
      }
      
      // We use the database values if present, otherwise keep what history provided
      snapshot.supportLevel = this.normalizeNumeric(dbStock.support1) ?? snapshot.supportLevel;
      snapshot.supportLevelSecondary = this.normalizeNumeric(dbStock.support2) ?? snapshot.supportLevelSecondary;
      snapshot.resistance1 = this.normalizeNumeric(dbStock.resistance1) ?? snapshot.resistance1;
      snapshot.resistance2 = this.normalizeNumeric(dbStock.resistance2) ?? snapshot.resistance2;
    }

    return {
      snapshot,
      provider: hasDbSupports ? 'database' : (history.provider as any),
      message: history.message,
    };
  }

  private findPointOnOrBefore(
    points: StockPricePoint[],
    targetMs: number,
  ): StockPricePoint | null {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].timestamp <= targetMs) {
        return points[i];
      }
    }
    return points.length ? points[0] : null;
  }

  private buildPerformanceEntries(
    points: StockPricePoint[],
  ): StockPerformanceEntry[] {
    if (!points.length) {
      return [];
    }

    const latest = points[points.length - 1];
    const latestMs = latest.timestamp;

    return this.performanceTimeframes.map(({ label, days, mode }) => {
      let targetMs = latestMs;
      if (mode === 'YTD') {
        const latestDate = new Date(latestMs);
        targetMs = Date.UTC(latestDate.getUTCFullYear(), 0, 1, 0, 0, 0);
      } else if (typeof days === 'number') {
        targetMs = latestMs - days * 86400 * 1000;
      }

      const baseline = this.findPointOnOrBefore(points, targetMs);
      if (!baseline || baseline.close === null) {
        return {
          timeframe: label,
          changePercent: null,
          startPrice: null,
          endPrice: latest.close ?? null,
          startDate: baseline?.date ?? null,
          endDate: latest.date,
        };
      }

      const change =
        baseline.close && baseline.close !== 0
          ? ((latest.close - baseline.close) / baseline.close) * 100
          : null;

      return {
        timeframe: label,
        changePercent: this.roundTo(change, 2),
        startPrice: this.roundTo(baseline.close, 2) ?? baseline.close,
        endPrice: this.roundTo(latest.close, 2) ?? latest.close,
        startDate: baseline.date,
        endDate: latest.date,
      };
    });
  }

  async getStockOverview(symbol: string): Promise<StockOverviewResponse> {
    const upper = symbol.toUpperCase();

    // 1. Primary Source: Internal Database
    const dbStock = await this.stockRepository.findOne({ 
      where: { symbol: upper },
      relations: ['stockCategory']
    }).catch(() => null);

    // 2. Secondary Sources: External Metadata and Google Spreadsheet
    const [basics, datasetRow] = await Promise.all([
      this.stockMetadataService.getCompanyBasics(upper).catch(() => null),
      this.fetchGoogleStockOverviewRow(upper).catch(() => null),
    ]);

    // Validate spreadsheet row
    const validDatasetRow = (datasetRow && datasetRow.Ticker && datasetRow.Ticker.toUpperCase() === upper) ? datasetRow : null;

    // 3. Build response with fallback chain: Database -> Spreadsheet -> Basics/Third-party
    const response: StockOverviewResponse = {
      symbol: upper,
      companyName:
        dbStock?.name ||
        basics?.name ||
        this.asString(validDatasetRow?.['Company name'])?.trim() ||
        null,
      supportLevel: this.normalizeNumeric(dbStock?.support1) ?? this.normalizeNumeric(validDatasetRow?.['Support 1']),
      supportLevelSecondary: this.normalizeNumeric(dbStock?.support2) ?? this.normalizeNumeric(validDatasetRow?.['Support 2']),
      resistance1: this.normalizeNumeric(dbStock?.resistance1) ?? this.normalizeNumeric(validDatasetRow?.['Resistance 1']),
      resistance2: this.normalizeNumeric(dbStock?.resistance2) ?? this.normalizeNumeric(validDatasetRow?.['Resistance 2']),
      rsi: this.normalizeNumeric(validDatasetRow?.RSI),
      ema50: this.normalizeNumeric(validDatasetRow?.['EMA 50']),
      ema200: this.normalizeNumeric(validDatasetRow?.['EMA 200']),
      price: this.normalizeNumeric(dbStock?.last_price) ?? this.normalizeNumeric(validDatasetRow?.Price),
      changePrice: this.normalizeNumeric(dbStock?.change) ?? null,
      changePercent: this.normalizeNumeric(dbStock?.change_percent) ?? this.normalizeNumeric(validDatasetRow?.['Change %']),
      group: dbStock?.stockCategory?.name || this.asString(validDatasetRow?.Group)?.trim() || null,
      metadata: {
        provider: dbStock?.support1 ? 'database' : (validDatasetRow ? 'google-script' : null) as any,
        sourceUrl: this.stockOverviewSourceUrl || null,
        timestamp: new Date(),
        message: (dbStock?.support1 || validDatasetRow)
          ? undefined
          : 'Live data calculation active (no manual data found)',
      },
    };

    // 4. Tertiary Augmentation: Real-time providers (FMP/Polygon)
    // We only perform live augmentation if spreadsheet data is missing OR if we still have null technical levels
    const hasMissingTechLevels = !response.supportLevel || !response.supportLevelSecondary || !response.resistance1 || !response.resistance2;
    const useLive = this.primaryProvider === 'fmp' || !validDatasetRow;

    if ((useLive || hasMissingTechLevels) && this.fmpApiKey) {
      this.logger.debug(`FMP: Orchestrating overview augmentation for ${upper}`);

      const [quote, rsiSignal, e50, e200, supportResult] = await Promise.all([
        this.fetchFmpQuote(upper),
        this.getFmpRSI(upper),
        this.getFmpEMA(upper, 50),
        this.getFmpEMA(upper, 200),
        this.computeSupportSnapshot(upper, 'day', response.price),
      ]);

      if (quote) {
        response.price = response.price ?? quote.price;
        response.changePercent = response.changePercent ?? quote.changesPercentage;
        response.changePrice = response.changePrice ?? quote.change;
        if (!response.companyName) response.companyName = quote.name;
        if (!response.metadata.provider) response.metadata.provider = 'fmp';
      }

      if (rsiSignal) response.rsi = response.rsi ?? rsiSignal.rsi;
      if (e50) response.ema50 = response.ema50 ?? e50;
      if (e200) response.ema200 = response.ema200 ?? e200;

      if (supportResult && supportResult.snapshot) {
        const s = supportResult.snapshot;
        // Apply FMP support levels ONLY where they are still missing (to honor Database priority)
        response.supportLevel = response.supportLevel ?? s.supportLevel ?? null;
        response.supportLevelSecondary = response.supportLevelSecondary ?? s.supportLevelSecondary ?? null;
        response.resistance1 = response.resistance1 ?? s.resistance1 ?? null;
        response.resistance2 = response.resistance2 ?? s.resistance2 ?? null;
        
        if (response.metadata.provider === null) {
          response.metadata.provider = (supportResult.provider || 'fmp') as any;
        }
      }
    }

    // 5. Final Rounding and Cleanup
    if (response.price && response.changePercent && response.changePrice === null) {
      response.changePrice = (response.price * response.changePercent) / 100;
    }

    response.price = this.roundTo(response.price, 2);
    response.changePrice = this.roundTo(response.changePrice, 2);
    response.changePercent = this.roundTo(response.changePercent, 2);
    response.rsi = this.roundTo(response.rsi, 2);
    response.ema50 = this.roundTo(response.ema50, 2);
    response.ema200 = this.roundTo(response.ema200, 2);
    response.supportLevel = this.roundTo(response.supportLevel, 2);
    response.supportLevelSecondary = this.roundTo(response.supportLevelSecondary, 2);
    response.resistance1 = this.roundTo(response.resistance1, 2);
    response.resistance2 = this.roundTo(response.resistance2, 2);

    return response;
  }

  async getStockPriceHistory(
    symbol: string,
    range: StockPriceHistoryRange = '6M',
    supportResolution: PriceResolution = 'day',
  ): Promise<StockPriceHistoryResponse> {
    const upper = symbol.toUpperCase();
    const basics = await this.stockMetadataService
      .getCompanyBasics(upper)
      .catch(() => null);
    const { from, resolution } = this.resolveHistoryRange(range);
    const to = Math.floor(Date.now() / 1000);

    const disabled = !this.polygonApiKey && !this.alphaVantageApiKey;
    const history = await this.fetchPriceSeries(upper, resolution, from, to);

    const response: StockPriceHistoryResponse = {
      symbol: upper,
      companyName: basics?.name ?? null,
      range,
      resolution,
      provider: history.provider,
      points: history.points,
      metadata: {
        from,
        to,
        count: history.points.length,
        disabled,
        message: history.message,
      },
    };

    if (history.points.length) {
      const latestClose = history.points[history.points.length - 1]?.close;
      const supportResult = await this.computeSupportSnapshot(
        upper,
        supportResolution,
        latestClose,
      );
      response.support = supportResult.snapshot;
      if (supportResult.message) {
        response.metadata.message = response.metadata.message
          ? `${response.metadata.message}; ${supportResult.message}`
          : supportResult.message;
      }
    }

    if (!response.metadata.message && disabled) {
      response.metadata.message =
        'No FMP, Polygon, or Alpha Vantage API key configured';
    }

    return response;
  }

  async getPolygonPriceHistoryBars(
    symbol: string,
    options?: {
      startDate?: string;
      endDate?: string;
      range?: StockPriceHistoryRange;
      multiplier?: number;
      timespan?: PolygonTimespan;
      limit?: number;
      adjusted?: boolean;
      sort?: 'asc' | 'desc';
    },
  ): Promise<PolygonAggregateBar[]> {
    const upper = symbol.toUpperCase();

    // Prioritize FMP if requested
    if (this.primaryProvider === 'fmp' && this.fmpApiKey) {
      const fmpBars = await this.fetchFmpPriceHistoryBars(upper, options);
      if (fmpBars && fmpBars.length) {
        return fmpBars;
      }
    }

    if (!this.polygonApiKey) {
      this.logger.warn(
        'POLYGON_API_KEY not configured; cannot fetch price history bars',
      );
      return [];
    }
    const multiplier = options?.multiplier ?? 1;
    const allowedTimespans: PolygonTimespan[] = [
      'minute',
      'hour',
      'day',
      'week',
      'month',
    ];
    const timespan: PolygonTimespan =
      options?.timespan && allowedTimespans.includes(options.timespan)
        ? options.timespan
        : 'day';
    const limitCandidate =
      typeof options?.limit === 'number' && Number.isFinite(options.limit)
        ? Math.floor(options.limit)
        : 50_000;
    const limit = Math.max(1, Math.min(limitCandidate, 50_000));
    const adjusted = options?.adjusted ?? true;
    const sort = options?.sort ?? 'asc';
    const apiKey = this.polygonApiKey;

    const normalizeDate = (value?: string): string | null => {
      if (!value?.trim()) {
        return null;
      }
      const parsed = Date.parse(`${value.trim()}T00:00:00Z`);
      if (!Number.isFinite(parsed)) {
        return null;
      }
      return this.formatDatePath(parsed);
    };

    let startPath = normalizeDate(options?.startDate);
    let endPath = normalizeDate(options?.endDate);

    if (!startPath || !endPath) {
      const { from } = this.resolveHistoryRange(options?.range ?? '6M');
      const toSeconds = Math.floor(Date.now() / 1000);
      startPath = this.formatDatePath(from * 1000);
      endPath = this.formatDatePath(toSeconds * 1000);
    }

    if (startPath > endPath) {
      const temp = startPath;
      startPath = endPath;
      endPath = temp;
    }

    const query = new URLSearchParams({
      adjusted: String(adjusted),
      sort,
      limit: limit.toString(),
      apiKey,
    });

    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(upper)}/range/${multiplier}/${timespan}/${startPath}/${endPath}?${query.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(
          `Polygon price history request failed for ${upper}: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const payload = (await response.json()) as {
        results?: PolygonAggregateBar[];
      };

      if (!Array.isArray(payload.results) || !payload.results.length) {
        return [];
      }

      return payload.results;
    } catch (error) {
      this.logger.error(
        `Error fetching Polygon price history for ${upper}:`,
        error,
      );
      return [];
    }
  }

  private async fetchFmpPriceHistoryBars(
    symbol: string,
    options?: {
      startDate?: string;
      endDate?: string;
      range?: StockPriceHistoryRange;
      multiplier?: number;
      timespan?: PolygonTimespan;
      limit?: number;
      adjusted?: boolean;
      sort?: 'asc' | 'desc';
    },
  ): Promise<PolygonAggregateBar[]> {
    if (!this.fmpApiKey) return [];

    const multiplier = options?.multiplier ?? 1;
    const timespan = options?.timespan ?? 'day';
    const limit = options?.limit ?? 1000;
    const sort = options?.sort ?? 'asc';

    // FMP v3 historical-chart only supports common intraday intervals
    // For day/week/month we use historical-price-full
    const isIntraday = timespan === 'minute' || timespan === 'hour';

    let url: string;
    if (isIntraday) {
      const interval = timespan === 'minute' ? '1min' : '1hour';
      url = `https://financialmodelingprep.com/api/v3/historical-chart/${interval}/${symbol}?apikey=${this.fmpApiKey}`;
      // url = `https://financialmodelingprep.com/stable/historical-chart/${interval}/${symbol}?apikey=${this.fmpApiKey}`;
    } else {
      let fromDate = options?.startDate;
      let toDate = options?.endDate;

      if (!fromDate || !toDate) {
        const { from } = this.resolveHistoryRange(options?.range ?? '6M');
        const toSeconds = Math.floor(Date.now() / 1000);
        if (!fromDate) fromDate = this.formatDatePath(from * 1000);
        if (!toDate) toDate = this.formatDatePath(toSeconds * 1000);
      }

      const query = new URLSearchParams({
        //  symbol: symbol,
        from: fromDate,
        to: toDate,
        apikey: this.fmpApiKey,
      });
      url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?${query.toString()}`;
      // url = `https://financialmodelingprep.com/stable/historical-price-eod/full?${query.toString()}`;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) return [];

      const payload = await response.json();
      let rawResults: any[] = Array.isArray(payload) ? payload : (payload?.historical || []);
      if (!Array.isArray(rawResults) || !rawResults.length) return [];

      let bars: PolygonAggregateBar[] = rawResults.map((item: any) => ({
        v: item.volume,
        o: item.open,
        c: item.close,
        h: item.high,
        l: item.low,
        t: Date.parse(item.date.includes(' ') ? item.date : `${item.date}T00:00:00Z`),
        vw: item.vwap || item.close,
      }));

      // Filter by limit and sort
      if (sort === 'desc') {
        bars.sort((a, b) => b.t! - a.t!);
      } else {
        bars.sort((a, b) => a.t! - b.t!);
      }

      if (bars.length > limit) {
        bars = sort === 'desc' ? bars.slice(0, limit) : bars.slice(-limit);
      }

      // Handle multiplier (Aggregation)
      if (multiplier > 1) {
        return this.aggregateFmpBars(bars, multiplier);
      }

      return bars;
    } catch (e) {
      this.logger.debug(`FMP price bars error: ${e.message}`);
      return [];
    }
  }

  private aggregateFmpBars(bars: PolygonAggregateBar[], multiplier: number): PolygonAggregateBar[] {
    const results: PolygonAggregateBar[] = [];
    for (let i = 0; i < bars.length; i += multiplier) {
      const chunk = bars.slice(i, i + multiplier);
      if (!chunk.length) continue;

      const o = chunk[0].o;
      const c = chunk[chunk.length - 1].c;
      const h = Math.max(...chunk.map(b => b.h ?? 0));
      const l = Math.min(...chunk.map(b => b.l ?? Infinity));
      const v = chunk.reduce((acc, b) => acc + (b.v ?? 0), 0);
      const t = chunk[chunk.length - 1].t;

      results.push({ o, c, h, l, v, t });
    }
    return results;
  }

  async getStockPerformance(symbol: string): Promise<StockPerformanceResponse> {
    const upper = symbol.toUpperCase();
    const basics = await this.stockMetadataService
      .getCompanyBasics(upper)
      .catch(() => null);
    const from = this.getPerformanceWindowStart();
    const to = Math.floor(Date.now() / 1000);

    const disabled = !this.polygonApiKey && !this.alphaVantageApiKey;
    const history = await this.fetchPriceSeries(upper, 'day', from, to);

    const response: StockPerformanceResponse = {
      symbol: upper,
      companyName: basics?.name ?? null,
      entries: [],
      latestClose: null,
      metadata: {
        provider: history.provider,
        from,
        to,
        count: history.points.length,
        disabled,
        message: history.message,
      },
    };

    if (!history.points.length) {
      if (!response.metadata.message && disabled) {
        response.metadata.message =
          'No price data available (FMP/Polygon/AlphaVantage)';
      }
      return response;
    }

    response.latestClose = history.points[history.points.length - 1].close;
    response.entries = this.buildPerformanceEntries(history.points);
    return response;
  }

  async getStockRevenueSeries(
    symbol: string,
    options?: {
      limit?: number;
      timeframe?: PolygonFinancialTimeframe;
      order?: 'asc' | 'desc';
      sort?: string;
    },
  ): Promise<StockRevenueResponse> {
    const upper = symbol.toUpperCase();
    const basics = await this.stockMetadataService
      .getCompanyBasics(upper)
      .catch(() => null);
    const hasApiKey = Boolean(this.polygonApiKey);
    const {
      limit = 100,
      timeframe = 'quarterly',
      order = 'asc',
      sort = 'filing_date',
    } = options ?? {};

    const base: StockRevenueResponse = {
      symbol: upper,
      companyName: basics?.name ?? null,
      status: undefined,
      request_id: undefined,
      count: undefined,
      next_url: undefined,
      results: [],
      metrics: {
        totalRevenue: [],
        grossProfit: [],
        operatingIncome: [],
        netIncome: [],
      },
      metadata: {
        provider: this.primaryProvider === 'fmp' ? 'fmp' : 'polygon',
        limit,
        timeframe,
        order,
        normalizedOrder: order,
        sort,
        hasApiKey: Boolean(this.fmpApiKey || this.polygonApiKey),
        fetchedAt: new Date(),
        message: undefined,
      },
    };

    if (base.metadata.provider === 'fmp') {
      const fmpData = await this.fetchFmpFinancials(upper, limit, timeframe);
      if (fmpData) {
        base.results = fmpData.results;
        base.metrics = fmpData.metrics;
        base.count = fmpData.results.length;
        base.status = 'OK';
        return base;
      }
      base.metadata.message = 'FMP financials unavailable; falling back to Polygon';
    }

    if (!this.polygonApiKey) {
      base.metadata.message =
        'POLYGON_API_KEY not configured; cannot fetch revenue';
      return base;
    }

    const apiKey = this.polygonApiKey as string;
    const search = new URLSearchParams({
      ticker: upper,
      timeframe,
      order,
      limit: limit.toString(),
      sort,
      apiKey,
    });
    const url = `https://api.polygon.io/vX/reference/financials?${search.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const message = `Polygon financials failed with status ${response.status}`;
        base.metadata.message = message;
        this.logger.error(`${message} (symbol=${upper})`);
        return base;
      }

      const payload = (await response.json()) as {
        results?: PolygonFinancialResult[];
        status?: string;
        request_id?: string;
        count?: number;
        next_url?: string | null;
      };

      base.status = payload.status;
      base.request_id = payload.request_id;
      base.count = payload.count;
      // base.next_url = payload.next_url ?? null;
      base.results = Array.isArray(payload.results) ? payload.results : [];

      if (!base.results.length) {
        base.metadata.message = 'Polygon returned no financial data';
      }

      if (payload.status && payload.status !== 'OK') {
        const statusMessage = `Polygon responded with status ${payload.status}`;
        base.metadata.message = base.metadata.message ?? statusMessage;
        this.logger.warn(`${statusMessage} for ${upper}`);
      }

      if (base.results.length) {
        base.results = this.sortFinancialResults(base.results);
        if (order !== 'asc') {
          base.metadata.normalizedOrder = 'asc';
        }
      } else {
        base.metadata.normalizedOrder = 'asc';
      }

      base.metrics = this.buildFinancialMetrics(base.results, timeframe);
      base.results = [];

      return base;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Polygon fetch error';
      base.metadata.message = `Error fetching Polygon financials: ${message}`;
      this.logger.error(
        `Error fetching Polygon financials for ${upper}: ${message}`,
        error,
      );
      return base;
    }
  }

  private async fetchFmpFinancials(
    symbol: string,
    limit: number,
    timeframe: PolygonFinancialTimeframe,
  ): Promise<{
    results: PolygonFinancialResult[];
    metrics: StockFinancialMetrics;
  } | null> {
    if (!this.fmpApiKey) return null;

    const periodStr = timeframe === 'quarterly' ? 'period=quarter' : 'period=annual';
    const url = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?${periodStr}&limit=${limit}&apikey=${this.fmpApiKey}`;
    // const url = `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&${periodStr}&limit=${limit}&apikey=${this.fmpApiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const payload = (await response.json()) as any[];
      if (!Array.isArray(payload)) return null;

      const results: PolygonFinancialResult[] = payload.map((f: any) => ({
        start_date: f.date,
        end_date: f.date,
        fiscal_period: f.period,
        fiscal_year: f.calendarYear,
        filing_date: f.fillingDate,
        financials: {
          income_statement: {
            revenues: { value: f.revenue },
            gross_profit: { value: f.grossProfit },
            operating_income_loss: { value: f.operatingIncome },
            net_income_loss: { value: f.netIncome },
          },
        },
      }));

      // Sort chronological for buildFinancialMetrics
      const sorted = this.sortFinancialResults(results);
      const metrics = this.buildFinancialMetrics(sorted, timeframe);

      return { results: sorted, metrics };
    } catch (error) {
      this.logger.debug(`FMP Financials error: ${error.message}`);
      return null;
    }
  }

  private async fetchPolygonNews(symbol: string, limit: number): Promise<StockNewsItem[] | null> {
    if (!this.polygonApiKey) return null;
    const url = `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=${limit}&apiKey=${this.polygonApiKey}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json() as any;
      if (!data?.results || !Array.isArray(data.results)) return null;

      return data.results.map((item: any) => ({
        title: item.title || 'Unknown headline',
        description: item.description || null,
        source: item.publisher?.name || item.author || 'Polygon',
        url: item.article_url || null,
        publishedAt: item.published_utc || null,
        imageUrl: item.image_url || null,
      }));
    } catch {
      return null;
    }
  }

  private async fetchFmpNews(symbol: string, limit: number): Promise<StockNewsItem[] | null> {
    if (!this.fmpApiKey) return null;
    const url = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${symbol}&limit=${limit}&apikey=${this.fmpApiKey}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json() as any;
      if (!Array.isArray(data)) return null;

      return data.map((item: any) => ({
        title: item.title || 'Unknown headline',
        description: item.text || null,
        source: item.site || 'FMP',
        url: item.url || null,
        publishedAt: item.publishedDate || null,
        imageUrl: item.image || null,
      }));
    } catch {
      return null;
    }
  }

  async getStockNews(symbol: string, limit = 6): Promise<StockNewsResponse> {
    const upper = symbol.toUpperCase();
    const normalizedLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 6;

    const metadata = {
      provider: 'google-script' as any,
      limit: normalizedLimit,
      hasApiKey: Boolean(this.stockNewsSourceUrl || this.polygonApiKey || this.fmpApiKey),
      fetchedAt: new Date(),
      message: undefined as string | undefined,
    };

    const fetchGoogle = async (): Promise<StockNewsItem[] | null> => {
      const rows = await this.fetchGoogleStockNewsRows();
      if (!rows) return null;
      const filtered = rows.filter((row) => this.asString(row.ticker)?.trim().toUpperCase() === upper);
      if (filtered.length === 0) return null;

      const toTimestamp = (value?: string): number => {
        if (!value) return 0;
        const time = new Date(value).getTime();
        return Number.isNaN(time) ? 0 : time;
      };

      return filtered
        .sort((a, b) => toTimestamp(b.publishedAt) - toTimestamp(a.publishedAt))
        .slice(0, normalizedLimit)
        .map((row) => ({
          title: this.asString(row.title) ?? 'Unknown headline',
          title_th: this.asString(row.title_th) ?? 'Unknown headline',
          description: this.asString(row.description) ?? null,
          description_th: this.asString(row.description_th) ?? null,
          source: this.asString(row.source) ?? null,
          url: this.asString(row.url) ?? null,
          publishedAt: this.asString(row.publishedAt) ?? null,
          imageUrl: this.asString(row.image) ?? null,
          topicTags: this.asString(row.topics),
          sentiment: this.asString(row.sentiment) ?? null,
        }));
    };

    const providers = [
      { id: 'google-script', fetcher: fetchGoogle, key: Boolean(this.stockNewsSourceUrl) },
      { id: 'fmp', fetcher: () => this.fetchFmpNews(upper, normalizedLimit), key: Boolean(this.fmpApiKey) },
      { id: 'polygon', fetcher: () => this.fetchPolygonNews(upper, normalizedLimit), key: Boolean(this.polygonApiKey) },
    ];

    // Priorities: If MARKET_DATA_PRIMARY is fmp, move FMP to the front
    if (this.primaryProvider === 'fmp') {
      const idx = providers.findIndex(p => p.id === 'fmp');
      if (idx > -1) {
        const [fmp] = providers.splice(idx, 1);
        providers.unshift(fmp);
      }
    } else if (this.primaryProvider === 'polygon') {
      const idx = providers.findIndex(p => p.id === 'polygon');
      if (idx > -1) {
        const [poly] = providers.splice(idx, 1);
        providers.unshift(poly);
      }
    }

    let items: StockNewsItem[] = [];
    let providerName = 'google-script';

    for (const p of providers) {
      if (!p.key && p.id !== 'google-script') continue; // google-script key logic is softer
      const result = await p.fetcher();
      if (result && result.length > 0) {
        items = result;
        providerName = p.id;
        break;
      }
    }

    metadata.provider = providerName;

    if (!items.length) {
      metadata.message = `No news entries found for ${upper}`;
    }

    return {
      symbol: upper,
      items,
      metadata,
    };
  }

  async getCompanyDocuments(
    symbol: string,
    options?: {
      type?: string;
      limit?: number;
      order?: 'asc' | 'desc';
    },
  ): Promise<CompanyDocumentsResponse> {
    const upper = symbol.toUpperCase();
    const limit = options?.limit ?? 50;
    const order = options?.order ?? 'desc';
    const type = options?.type?.toUpperCase();

    const response: CompanyDocumentsResponse = {
      symbol: upper,
      companyName: null,
      cik: null,
      documents: [],
      filteredBy: {
        type: type,
        limit: limit,
      },
      metadata: {
        provider: 'polygon',
        total: 0,
        hasMore: false,
        fetchedAt: new Date(),
      },
    };

    // Order providers based on primary preference
    const providers: Array<{
      id: 'fmp' | 'polygon' | 'sec';
      fetcher: () => Promise<CompanyDocumentsResponse | null>;
    }> = [
        {
          id: 'fmp', fetcher: async () => {
            const res = await this.fetchFmpFilings(upper, type, limit, order);
            return res.success ? res.data! : null;
          }
        },
        {
          id: 'polygon', fetcher: async () => {
            const res = await this.fetchPolygonFilings(upper, type, limit, order);
            return res.success ? res.data! : null;
          }
        },
      ];

    if (this.primaryProvider === 'fmp') {
      const fmpIdx = providers.findIndex(p => p.id === 'fmp');
      if (fmpIdx > -1) {
        const [fmp] = providers.splice(fmpIdx, 1);
        providers.unshift(fmp);
      }
    }

    for (const p of providers) {
      const data = await p.fetcher();
      if (data && data.documents.length) {
        return data;
      }
    }

    // Default Fallback
    return this.fetchSECFilings(upper, type, limit, order, response);
  }

  private async fetchFmpFilings(
    symbol: string,
    type: string | undefined,
    limit: number,
    order: string,
  ): Promise<{ success: boolean; data?: CompanyDocumentsResponse; error?: string }> {
    if (!this.fmpApiKey) return { success: false, error: 'No FMP key' };

    const url = `https://financialmodelingprep.com/api/v3/sec_filings/${symbol}?limit=${limit}&apikey=${this.fmpApiKey}`;
    // const url = `https://financialmodelingprep.com/stable/sec-filings?symbol=${symbol}&limit=${limit}&apikey=${this.fmpApiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };

      const payload = (await res.json()) as any[];
      if (!Array.isArray(payload) || !payload.length) return { success: false, error: 'No results' };

      const filtered = type ? payload.filter(f => f.type === type) : payload;

      const data: CompanyDocumentsResponse = {
        symbol,
        companyName: null,
        cik: payload[0]?.cik || null,
        documents: filtered.map(f => ({
          id: f.link || Math.random().toString(),
          type: f.type || 'UNKNOWN',
          title: this.generateDocumentTitle(f.type, f.fillingDate.split('-')[0]),
          description: `${f.type} filing for ${symbol}`,
          filingDate: f.fillingDate,
          periodDate: f.fillingDate,
          url: f.finalLink || f.link,
          fileUrl: f.link,
          acceptanceDateTime: f.acceptedDate,
          cik: f.cik,
          tags: this.generateDocumentTags(f.type),
        })),
        filteredBy: { type, limit },
        metadata: {
          provider: 'fmp',
          total: filtered.length,
          hasMore: payload.length >= limit,
          fetchedAt: new Date(),
        }
      };
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  private async fetchPolygonFilings(
    symbol: string,
    type: string | undefined,
    limit: number,
    order: string,
  ): Promise<{
    success: boolean;
    data?: CompanyDocumentsResponse;
    error?: string;
  }> {
    if (!this.polygonApiKey) {
      return { success: false, error: 'No API key' };
    }

    const params = new URLSearchParams({
      ticker: symbol,
      limit: Math.min(limit, 100).toString(),
      order,
    });

    if (type) {
      params.append('filing_type', type);
    }

    const url = `https://api.polygon.io/vX/reference/filings?${params.toString()}&apiKey=${this.polygonApiKey}`;

    try {
      const apiResponse = await fetch(url);
      if (!apiResponse.ok) {
        return {
          success: false,
          error: `HTTP ${apiResponse.status}`,
        };
      }

      const payload = (await apiResponse.json()) as {
        results?: Array<{
          id?: string;
          filing_date?: string;
          filing_type?: string;
          report_url?: string;
          filing_url?: string;
          acceptance_datetime?: string;
          period_of_report_date?: string;
          cik?: string;
          company_name?: string;
          fiscal_year?: string;
          fiscal_quarter?: string;
          form_type?: string;
        }>;
        count?: number;
        next_url?: string;
        status?: string;
      };

      if (!payload.results || payload.results.length === 0) {
        return { success: false, error: 'No results' };
      }

      const response: CompanyDocumentsResponse = {
        symbol: symbol,
        companyName: payload.results[0]?.company_name || null,
        cik: payload.results[0]?.cik || null,
        documents: payload.results.map((filing) => {
          const filingType =
            filing.filing_type || filing.form_type || 'UNKNOWN';
          return {
            id: filing.id || `${symbol}-${filing.filing_date}-${filingType}`,
            type: filingType,
            title: this.generateDocumentTitle(
              filingType,
              filing.fiscal_year,
              filing.fiscal_quarter,
              filing.period_of_report_date,
            ),
            description: `${filingType} filing for ${filing.company_name || symbol}`,
            filingDate: filing.filing_date || '',
            periodDate: filing.period_of_report_date || null,
            fiscalYear: filing.fiscal_year || null,
            fiscalQuarter: filing.fiscal_quarter || null,
            url: filing.report_url || filing.filing_url || null,
            fileUrl: filing.filing_url || null,
            acceptanceDateTime: filing.acceptance_datetime || null,
            cik: filing.cik || null,
            tags: this.generateDocumentTags(filingType, filing.fiscal_quarter),
          };
        }),
        filteredBy: { type, limit },
        metadata: {
          provider: 'polygon',
          total: payload.count || 0,
          hasMore: !!payload.next_url,
          fetchedAt: new Date(),
        },
      };

      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async fetchSECFilings(
    symbol: string,
    type: string | undefined,
    limit: number,
    order: string,
    baseResponse: CompanyDocumentsResponse,
  ): Promise<CompanyDocumentsResponse> {
    const response = { ...baseResponse };
    response.metadata.provider = 'sec';

    try {
      // First, get CIK number from SEC company tickers
      const tickersUrl = 'https://www.sec.gov/files/company_tickers.json';
      const tickersResponse = await fetch(tickersUrl, {
        headers: {
          'User-Agent': 'DeeDee Trading Platform support@deedeetrading.com',
        },
      });

      if (!tickersResponse.ok) {
        response.metadata.message = `SEC API unavailable: ${tickersResponse.status}`;
        return response;
      }

      const tickers = (await tickersResponse.json()) as Record<
        string,
        { cik_str: number; ticker: string; title: string }
      >;

      // Find the company by ticker
      const company = Object.values(tickers).find(
        (t) => t.ticker.toUpperCase() === symbol,
      );

      if (!company) {
        response.metadata.message = `Company ${symbol} not found in SEC database`;
        return response;
      }

      const cik = company.cik_str.toString().padStart(10, '0');
      response.companyName = company.title;
      response.cik = cik;

      // Get recent filings
      const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
      const submissionsResponse = await fetch(submissionsUrl, {
        headers: {
          'User-Agent': 'DeeDee Trading Platform support@deedeetrading.com',
        },
      });

      if (!submissionsResponse.ok) {
        response.metadata.message = `Failed to fetch SEC submissions: ${submissionsResponse.status}`;
        return response;
      }

      const submissions = (await submissionsResponse.json()) as {
        name?: string;
        cik?: string;
        filings?: {
          recent?: {
            accessionNumber?: string[];
            filingDate?: string[];
            reportDate?: string[];
            acceptanceDateTime?: string[];
            form?: string[];
            primaryDocument?: string[];
            primaryDocDescription?: string[];
          };
        };
      };

      const recent = submissions.filings?.recent;
      if (!recent || !recent.form || recent.form.length === 0) {
        response.metadata.message = `No SEC filings found for ${symbol}`;
        return response;
      }

      // Filter by type if specified
      const documents: CompanyDocument[] = [];
      for (let i = 0; i < recent.form.length; i++) {
        const formType = recent.form[i];
        if (type && formType !== type) continue;

        const accessionNumber =
          recent.accessionNumber?.[i]?.replace(/-/g, '') || '';
        const accessionNumberWithDashes = recent.accessionNumber?.[i] || '';
        const filingDate = recent.filingDate?.[i] || '';
        const reportDate = recent.reportDate?.[i];
        const primaryDoc = recent.primaryDocument?.[i];

        // Generate better URLs similar to TradingView
        // Use SEC's filing detail page which shows all documents in a filing
        const filingDetailUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${formType}&dateb=${filingDate}&owner=exclude&count=10&search_text=`;

        // Direct document URL (if primary document exists)
        const directDocUrl =
          primaryDoc && accessionNumber
            ? `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${cik}&accession_number=${accessionNumberWithDashes}&xbrl_type=v`
            : null;

        documents.push({
          id: accessionNumber,
          type: formType || 'UNKNOWN',
          title: this.generateDocumentTitle(
            formType || '',
            filingDate
              ? new Date(filingDate).getFullYear().toString()
              : undefined,
            undefined,
            reportDate,
          ),
          description: `${formType} filing for ${company.title}`,
          filingDate: filingDate,
          periodDate: reportDate || null,
          fiscalYear: filingDate
            ? new Date(filingDate).getFullYear().toString()
            : null,
          fiscalQuarter: null,
          url: directDocUrl || filingDetailUrl,
          fileUrl: primaryDoc
            ? `https://www.sec.gov/Archives/edgar/data/${company.cik_str}/${accessionNumber}/${primaryDoc}`
            : null,
          acceptanceDateTime: recent.acceptanceDateTime?.[i] || null,
          cik: cik,
          tags: this.generateDocumentTags(formType || '', undefined),
        });

        if (documents.length >= limit) break;
      }

      // Sort by date
      if (order === 'asc') {
        documents.sort(
          (a, b) =>
            new Date(a.filingDate).getTime() - new Date(b.filingDate).getTime(),
        );
      } else {
        documents.sort(
          (a, b) =>
            new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime(),
        );
      }

      response.documents = documents;
      response.metadata.total = documents.length;
      response.metadata.hasMore = recent.form.length > limit;

      return response;
    } catch (error) {
      response.metadata.message = `Error fetching SEC filings: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error(response.metadata.message, error);
      return response;
    }
  }

  private generateDocumentTitle(
    type: string,
    fiscalYear?: string,
    fiscalQuarter?: string,
    periodDate?: string,
  ): string {
    const year =
      fiscalYear ||
      (periodDate ? new Date(periodDate).getFullYear().toString() : '');
    const quarter = fiscalQuarter ? `Q${fiscalQuarter}` : '';

    switch (type) {
      case '10-K':
        return `Annual Report ${year}`;
      case '10-Q':
        return `Quarterly Report ${quarter} ${year}`.trim();
      case '8-K':
        return `Current Report ${year}`;
      case 'DEF 14A':
        return `Proxy Statement ${year}`;
      case '4':
        return `Insider Trading Statement ${year}`;
      case 'S-1':
        return 'IPO Registration Statement';
      default:
        return `${type} Filing ${year}`.trim();
    }
  }

  private generateDocumentTags(type: string, quarter?: string): string[] {
    const tags: string[] = [];

    if (type === '10-K') tags.push('Annual', 'Financial Statement');
    if (type === '10-Q') tags.push('Quarterly', 'Financial Statement');
    if (type === '8-K') tags.push('Current Event', 'Material Event');
    if (type === 'DEF 14A') tags.push('Proxy', 'Shareholder Meeting');
    if (type === '4') tags.push('Insider Trading', 'Form 4');
    if (quarter) tags.push(`Q${quarter}`);

    return tags;
  }

  async getAlphaVantageRSI(
    symbol: string,
    interval: AlphaInterval = 'daily',
    timeperiod = 14,
  ): Promise<RSISignal | null> {
    if (!this.alphaVantageApiKey) {
      this.logger.error('Alpha Vantage API key not available');
      return null;
    }

    try {
      const upperSymbol = symbol.toUpperCase();
      const url = `https://www.alphavantage.co/query?function=RSI&symbol=${upperSymbol}&interval=${interval}&time_period=${timeperiod}&series_type=close&apikey=${this.alphaVantageApiKey}`;
      this.logger.debug(
        `Fetching Alpha Vantage RSI for ${upperSymbol}: ${url.replace(/apikey=[^&]+/, 'apikey=***')}`,
      );

      const response = await fetch(url);
      if (!response.ok) {
        this.logger.error(
          `Alpha Vantage RSI API failed for ${upperSymbol}: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const rsiSection = payload['Technical Analysis: RSI'];
      if (!rsiSection || typeof rsiSection !== 'object') {
        this.logger.warn(`No Alpha Vantage RSI data for ${upperSymbol}`);
        return null;
      }

      const entries = Object.keys(rsiSection as Record<string, unknown>);
      if (!entries.length) {
        this.logger.warn(`No Alpha Vantage RSI entries for ${upperSymbol}`);
        return null;
      }

      const latestDate = entries.sort().pop();
      if (!latestDate) {
        this.logger.warn(
          `Unable to determine latest RSI date for ${upperSymbol}`,
        );
        return null;
      }

      const latestRecord = (
        rsiSection as Record<string, Record<string, string>>
      )[latestDate];
      const latestValue = this.parseNumericString(latestRecord?.RSI ?? '');
      if (latestValue === null) {
        this.logger.warn(`Invalid Alpha Vantage RSI value for ${upperSymbol}`);
        return null;
      }

      const rounded = Math.round(latestValue * 100) / 100;
      const status = this.classifyRsi(rounded);

      this.logger.debug(
        `Alpha Vantage RSI for ${upperSymbol}: ${rounded.toFixed(2)} (${status})`,
      );

      return {
        symbol: upperSymbol,
        rsi: rounded,
        status,
        timestamp: new Date(latestDate),
        provider: 'alphaVantage',
      };
    } catch (error) {
      this.logger.error('Error fetching Alpha Vantage RSI:', error);
      return null;
    }
  }

  async getPolygonRSI(
    symbol: string,
    timespan: PolygonTimespan = 'day',
    window = 14,
  ): Promise<RSISignal | null> {
    if (!this.polygonApiKey) {
      this.logger.error('Polygon API key not available');
      return null;
    }

    try {
      const upperSymbol = symbol.toUpperCase();
      const windowSize = window ?? 14;
      const url = `https://api.polygon.io/v1/indicators/rsi/${upperSymbol}?timespan=${timespan}&adjusted=true&window=${windowSize}&series_type=close&order=desc&limit=1&apiKey=${this.polygonApiKey}`;
      this.logger.debug(
        `Fetching Polygon RSI for ${upperSymbol}: ${url.replace(/apiKey=[^&]+/, 'apiKey=***')}`,
      );

      const response = await fetch(url);
      if (!response.ok) {
        this.logger.error(
          `Polygon RSI API failed for ${upperSymbol}: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const payload = (await response.json()) as PolygonRsiResponse;
      const latest = payload.results?.values?.[0];
      if (
        payload.status !== 'OK' ||
        !latest ||
        typeof latest.value !== 'number'
      ) {
        this.logger.warn(`No Polygon RSI data available for ${upperSymbol}`);
        return null;
      }

      const rounded = Math.round(latest.value * 100) / 100;
      const status = this.classifyRsi(rounded);

      this.logger.debug(
        `Polygon RSI for ${upperSymbol}: ${rounded.toFixed(2)} (${status})`,
      );

      return {
        symbol: upperSymbol,
        rsi: rounded,
        status,
        timestamp: new Date(latest.timestamp),
        provider: 'polygon',
      };
    } catch (error) {
      this.logger.error('Error fetching Polygon RSI:', error);
      return null;
    }
  }

  async getRSI(
    symbol: string,
    {
      provider,
      interval = 'daily',
      timeperiod = 14,
      timespan = 'day',
      window,
      fallback = true,
    }: {
      provider?: 'fmp' | 'polygon' | 'alphaVantage';
      interval?: AlphaInterval;
      timeperiod?: number;
      timespan?: PolygonTimespan;
      window?: number;
      fallback?: boolean;
    } = {},
  ): Promise<RSISignal | null> {
    const preferredProvider =
      provider ?? this.primaryProvider;

    if (preferredProvider === 'fmp') {
      const fmpResult = await this.getFmpRSI(symbol, interval, timeperiod);
      if (fmpResult || provider === 'fmp' || !fallback) {
        return fmpResult;
      }
    }

    if (preferredProvider === 'polygon' || (preferredProvider === 'fmp' && fallback)) {
      const polygonResult = await this.getPolygonRSI(
        symbol,
        timespan,
        window ?? timeperiod,
      );

      if (polygonResult || provider === 'polygon' || !fallback) {
        return polygonResult;
      }
    }

    return this.getAlphaVantageRSI(symbol, interval, timeperiod);
  }

  async getFmpRSI(
    symbol: string,
    interval: AlphaInterval = 'daily',
    timeperiod = 14,
  ): Promise<RSISignal | null> {
    if (!this.fmpApiKey) return null;

    const upper = symbol.toUpperCase();
    const fmpInterval = interval === 'daily' ? 'daily' : '1min'; // simplified
    const url = `https://financialmodelingprep.com/api/v3/technical_indicator/${fmpInterval}/${upper}?type=rsi&period=${timeperiod}&apikey=${this.fmpApiKey}`;
    // const url = `https://financialmodelingprep.com/stable/technical-indicator/${fmpInterval}/${upper}?indicator=rsi&period=${timeperiod}&apikey=${this.fmpApiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const payload = (await response.json()) as any[];
      if (!Array.isArray(payload) || !payload.length) return null;

      const latest = payload[0];
      return {
        symbol: upper,
        rsi: this.roundTo(latest.rsi, 2) ?? latest.rsi,
        status: this.classifyRsi(latest.rsi),
        timestamp: new Date(latest.date),
        provider: 'fmp',
      };
    } catch (error) {
      this.logger.debug(`FMP RSI error: ${error.message}`);
      return null;
    }
  }

  private async getFmpEMA(
    symbol: string,
    period: number,
    interval: AlphaInterval = 'daily',
  ): Promise<number | null> {
    if (!this.fmpApiKey) return null;

    const upper = symbol.toUpperCase();
    const fmpInterval = interval === 'daily' ? 'daily' : '1min';
    const url = `https://financialmodelingprep.com/api/v3/technical_indicator/${fmpInterval}/${upper}?type=ema&period=${period}&apikey=${this.fmpApiKey}`;
    // const url = `https://financialmodelingprep.com/stable/technical-indicator/${fmpInterval}/${upper}?indicator=ema&period=${period}&apikey=${this.fmpApiKey}`;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const payload = (await response.json()) as any[];
      if (!Array.isArray(payload) || !payload.length) return null;

      return payload[0]?.ema ?? null;
    } catch (error) {
      this.logger.debug(`FMP EMA error for ${upper} (${period}): ${error.message}`);
      return null;
    }
  }

  private async fetchFmpQuote(symbol: string): Promise<any | null> {
    if (!this.fmpApiKey) return null;

    const upper = symbol.toUpperCase();
    const url = `https://financialmodelingprep.com/api/v3/quote/${upper}?apikey=${this.fmpApiKey}`;
    // const url = `https://financialmodelingprep.com/stable/quote?symbol=${upper}&apikey=${this.fmpApiKey}`;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const payload = (await response.json()) as any[];
      if (!Array.isArray(payload) || !payload.length) return null;

      return payload[0];
    } catch (error) {
      this.logger.debug(`FMP Quote error for ${upper}: ${error.message}`);
      return null;
    }
  }

  private async getFmpMarketMovers(
    limit = 10,
  ): Promise<MarketMoversResponse | null> {
    if (!this.fmpApiKey) return null;

    try {
      const [gainersRes, losersRes] = await Promise.all([
        fetch(
          `https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${this.fmpApiKey}`,
          // `https://financialmodelingprep.com/stable/stock-market/gainers?apikey=${this.fmpApiKey}`,
        ),
        fetch(
          `https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${this.fmpApiKey}`,
          // `https://financialmodelingprep.com/stable/stock-market/losers?apikey=${this.fmpApiKey}`,
        ),
      ]);

      if (!gainersRes.ok || !losersRes.ok) return null;

      const gainersRaw = (await gainersRes.json()) as any[];
      const losersRaw = (await losersRes.json()) as any[];

      const mapStock = (s: any): MarketMoverStock => ({
        symbol: s.symbol,
        lastPrice: this.roundTo(s.price, 2) ?? 0,
        change: this.roundTo(s.change, 2) ?? 0,
        changePercent: this.roundTo(s.changesPercentage, 2) ?? 0,
        companyName: s.name || s.symbol,
      });

      return {
        topGainers: Array.isArray(gainersRaw)
          ? gainersRaw.slice(0, limit).map(mapStock)
          : [],
        topLosers: Array.isArray(losersRaw)
          ? losersRaw.slice(0, limit).map(mapStock)
          : [],
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.debug(`FMP Market Movers error: ${error.message}`);
      return null;
    }
  }

  private async fetchAlphaVantageMarketMovers(): Promise<AlphaVantageMarketMoversResponse | null> {
    if (!this.alphaVantageApiKey) {
      this.logger.error('Alpha Vantage API key not available');
      return null;
    }

    try {
      const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${this.alphaVantageApiKey}`;
      this.logger.debug('Fetching Alpha Vantage top gainers/losers universe');

      const response = await fetch(url);
      if (!response.ok) {
        this.logger.error(
          `Alpha Vantage market movers request failed: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const payload =
        (await response.json()) as Partial<AlphaVantageMarketMoversResponse>;

      if (
        !payload.top_gainers?.length &&
        !payload.top_losers?.length &&
        !payload.most_actively_traded?.length
      ) {
        this.logger.warn('Alpha Vantage returned no market mover data');
        return null;
      }

      return {
        metadata: payload.metadata ?? '',
        last_updated: payload.last_updated ?? new Date().toISOString(),
        top_gainers: payload.top_gainers ?? [],
        top_losers: payload.top_losers ?? [],
        most_actively_traded: payload.most_actively_traded ?? [],
      };
    } catch (error) {
      this.logger.error('Error fetching Alpha Vantage market movers:', error);
      return null;
    }
  }

  async getAlphaVantageMarketMovers(
    limitPerCategory = 10,
  ): Promise<MarketMoversResponse | null> {
    const payload = await this.fetchAlphaVantageMarketMovers();
    if (!payload) {
      return null;
    }

    const limit = Math.max(1, limitPerCategory);
    const gainersResult = this.filterAlphaVantageStocks(
      payload.top_gainers,
      limit,
      (stock, symbol) => this.toMarketMoverStock(stock, symbol),
    );
    const losersResult = this.filterAlphaVantageStocks(
      payload.top_losers,
      limit,
      (stock, symbol) => this.toMarketMoverStock(stock, symbol),
    );

    const topGainers = gainersResult.items;
    const topLosers = losersResult.items;

    const skippedTickers = [...gainersResult.skipped, ...losersResult.skipped];
    if (skippedTickers.length) {
      this.logger.debug(
        `Skipped ${skippedTickers.length} non-US or inactive tickers from Alpha Vantage movers: ${skippedTickers.join(', ')}`,
      );
    }

    this.logger.log(
      `Alpha Vantage market movers fetched (${topGainers.length} gainers, ${topLosers.length} losers)`,
    );

    const timestamp = payload.last_updated
      ? new Date(payload.last_updated)
      : new Date();

    return {
      topGainers,
      topLosers,
      timestamp,
    };
  }

  async getGoogleScriptMarketMovers(
    limitPerCategory = 10,
  ): Promise<MarketMoversResponse | null> {
    // 1. Prioritize FMP if requested
    if (this.primaryProvider === 'fmp' && this.fmpApiKey) {
      const fmpMovers = await this.getFmpMarketMovers(limitPerCategory);
      if (
        fmpMovers &&
        (fmpMovers.topGainers.length || fmpMovers.topLosers.length)
      ) {
        return fmpMovers;
      }
    }

    const rows = await this.fetchExternalAllUsMarketMoverRows();
    if (!rows) {
      return null;
    }

    const mapped = rows
      .map((row) => this.mapGoogleMarketMoverRow(row))
      .filter((row): row is MarketMoverStock => row !== null);

    if (!mapped.length) {
      this.logger.warn(
        'ALL US market movers dataset did not contain any valid rows',
      );
      return null;
    }

    const limit = Math.max(1, limitPerCategory);
    const topGainers = mapped
      .filter((stock) => stock.changePercent > 0)
      .sort((stockA, stockB) => stockB.changePercent - stockA.changePercent)
      .slice(0, limit);
    const topLosers = mapped
      .filter((stock) => stock.changePercent < 0)
      .sort((stockA, stockB) => stockA.changePercent - stockB.changePercent)
      .slice(0, limit);

    if (!topGainers.length && !topLosers.length) {
      this.logger.warn(
        'ALL US market movers dataset produced no qualifying gainers or losers',
      );
      return null;
    }

    this.logger.debug(
      `Google Apps Script market movers processed (gainers=${topGainers.length}, losers=${topLosers.length}, inspected=${mapped.length})`,
    );

    return {
      topGainers,
      topLosers,
      timestamp: new Date(),
    };
  }

  async getUSLosersBreakingSupport({
    limit = 10,
    tolerancePercent = 8,
    minDropPercent = 0.5,
    resolution = 'day',
  }: {
    limit?: number;
    tolerancePercent?: number;
    minDropPercent?: number;
    resolution?: PriceResolution;
  } = {}): Promise<SupportBreakLosersResponse | null> {
    const normalizedLimit = Math.max(1, limit);
    const normalizedTolerance = tolerancePercent >= 0 ? tolerancePercent : 1;
    const normalizedDrop = minDropPercent >= 0 ? minDropPercent : 0;
    const normalizedResolution: PriceResolution = resolution ?? 'day';

    this.logger.debug(
      `Fetching external support-break dataset (limit=${normalizedLimit})`,
    );

    const rows = await this.fetchExternalSupportBreakRows();
    if (!rows) {
      return null;
    }

    const transformed = rows
      .map((row) => this.mapGoogleSupportBreakRow(row))
      .filter(
        (row): row is SupportBreakLoser =>
          row !== null &&
          row.supportLevel !== null &&
          row.lastPrice < (row.supportLevel || 0),
      )
      .sort((a, b) => {
        const dropA = a.belowSupportPercent ?? 0;
        const dropB = b.belowSupportPercent ?? 0;
        return dropA - dropB;
      });

    if (!transformed.length) {
      this.logger.warn(
        'External support-break dataset did not contain any valid rows',
      );
      return null;
    }

    const limited = transformed.slice(0, normalizedLimit);

    return {
      timestamp: new Date(),
      stocks: limited,
      metadata: {
        limitRequested: normalizedLimit,
        inspected: rows.length,
        produced: limited.length,
        tolerancePercent: normalizedTolerance,
        minDropPercent: normalizedDrop,
        resolution: normalizedResolution,
        skippedSymbols: [],
      },
    };
  }

  async getUSMarketRsi({
    limitPerBucket = 25,
  }: {
    limitPerBucket?: number;
  } = {}): Promise<USMarketRsiBucketResponse | null> {
    const rows = await this.fetchExternalUsMarketRsiRows();
    if (!rows) {
      return null;
    }

    const limit = Math.max(1, limitPerBucket);
    const oversold: USMarketRsiBucketStock[] = [];
    const overbought: USMarketRsiBucketStock[] = [];
    let produced = 0;
    let oversoldCount = 0;
    let overboughtCount = 0;

    for (const row of rows) {
      const mapped = this.mapGoogleUsMarketRsiRow(row);
      if (!mapped) {
        continue;
      }

      produced += 1;

      if (mapped.status === 'oversold') {
        oversoldCount += 1;
        if (oversold.length < limit) {
          oversold.push(mapped);
        }
      } else if (mapped.status === 'overbought') {
        overboughtCount += 1;
        if (overbought.length < limit) {
          overbought.push(mapped);
        }
      }
    }

    if (!oversold.length && !overbought.length) {
      this.logger.warn(
        'External US market RSI dataset contained no oversold or overbought entries',
      );
      return null;
    }

    this.logger.debug(
      `US market RSI dataset processed (oversold=${oversoldCount}, overbought=${overboughtCount}, limit=${limit})`,
    );

    return {
      timestamp: new Date(),
      oversold: oversold
        .filter((stock) => stock.rsi > 0)
        .sort((stockA, stockB) => stockA.rsi - stockB.rsi),
      overbought: overbought
        .filter((stock) => stock.rsi > 0)
        .sort((stockA, stockB) => stockB.rsi - stockA.rsi),
      metadata: {
        limitPerBucket: limit,
        inspected: rows.length,
        produced,
        oversoldCount,
        overboughtCount,
        source: 'google-script',
        // sourceUrl: this.usMarketRsiSourceUrl || null,
      },
    };
  }
}
