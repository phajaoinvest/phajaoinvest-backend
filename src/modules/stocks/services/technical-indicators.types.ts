export type PriceResolution = 'day' | 'week' | 'month';

export interface RSISignal {
  symbol: string;
  rsi: number;
  status: 'oversold' | 'neutral' | 'overbought';
  timestamp: Date;
  provider: 'alphaVantage' | 'polygon' | 'fmp' | 'google-script';
}

export interface MarketMoverStock {
  symbol: string;
  lastPrice: number;
  changePercent: number;
  change: number;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  companyName?: string | null;
}

export interface MarketMoversResponse {
  topGainers: MarketMoverStock[];
  topLosers: MarketMoverStock[];
  timestamp: Date;
}

// Alpha Vantage Market Movers Types
export interface AlphaVantageStock {
  ticker: string;
  price: string;
  change_amount: string;
  change_percentage: string;
  volume: string;
  market?: string;
  region?: string;
  exchange?: string;
  is_etf?: string;
  is_actively_trading?: string;
}

export interface AlphaVantageMarketMoversResponse {
  metadata: string;
  last_updated: string;
  top_gainers: AlphaVantageStock[];
  top_losers: AlphaVantageStock[];
  most_actively_traded: AlphaVantageStock[];
}

export interface PolygonRsiValue {
  timestamp: number;
  value: number;
}

export interface PolygonRsiResponse {
  status: 'OK' | 'ERROR';
  request_id: string;
  results?: {
    values?: PolygonRsiValue[];
  };
  error?: string;
}

export type AlphaVantageMoverCategory =
  | 'top_gainers'
  | 'top_losers'
  | 'most_actively_traded';

export interface USMarketRsiBucketStock {
  symbol: string;
  companyName?: string | null;
  lastPrice?: number | null;
  changePercent?: number | null;
  change?: number | null;
  rsi: number;
  status: 'oversold' | 'overbought';
  group?: string | null;
  lastUpdated?: Date | null;
}

export interface USMarketRsiBucketMetadata {
  limitPerBucket: number;
  inspected: number;
  produced: number;
  oversoldCount: number;
  overboughtCount: number;
  source: 'google-script';
  sourceUrl?: string | null;
}

export interface USMarketRsiBucketResponse {
  timestamp: Date;
  oversold: USMarketRsiBucketStock[];
  overbought: USMarketRsiBucketStock[];
  metadata: USMarketRsiBucketMetadata;
}

export interface SupportBreakLoser {
  symbol: string;
  companyName?: string | null;
  lastPrice: number;
  changePercent: number;
  change: number | null;
  volume?: number | null;
  supportLevel?: number | null;
  supportLevelSecondary?: number | null;
  resistance1?: number | null;
  resistance2?: number | null;
  belowSupportPercent?: number | null;
  distanceToSupportPercent?: number | null;
  rsi?: number | null;
  ema50?: number | null;
  ema200?: number | null;
  group?: string | null;
}

export interface SupportBreakLosersMetadata {
  limitRequested: number;
  inspected: number;
  produced: number;
  tolerancePercent: number;
  minDropPercent: number;
  resolution: PriceResolution;
  skippedSymbols: Array<{ symbol: string; reason: string }>;
}

export interface SupportBreakLosersResponse {
  timestamp: Date;
  stocks: SupportBreakLoser[];
  metadata: SupportBreakLosersMetadata;
}

export type StockPriceHistoryRange = '1M' | '3M' | '6M' | 'YTD' | '1Y';

export interface StockPricePoint {
  timestamp: number;
  date: string;
  close: number;
  volume?: number | null;
}

export interface SupportLevelsSnapshot {
  supportLevel?: number | null;
  supportLevelSecondary?: number | null;
  resistance1?: number | null;
  resistance2?: number | null;
  belowSupportPercent?: number | null;
  distanceToSupportPercent?: number | null;
}

export interface StockOverviewResponse {
  symbol: string;
  companyName?: string | null;
  supportLevel: number | null;
  supportLevelSecondary: number | null;
  resistance1: number | null;
  resistance2: number | null;
  rsi: number | null;
  ema50: number | null;
  ema200: number | null;
  price: number | null;
  changePrice: number | null;
  changePercent: number | null;
  group: string | null;
  metadata: {
    provider: 'fmp' | 'polygon' | 'alphaVantage' | 'google-script' | 'database' | null;
    sourceUrl: string | null;
    timestamp: Date;
    message?: string;
  };
}

export interface StockPriceHistoryResponse {
  symbol: string;
  companyName?: string | null;
  range: StockPriceHistoryRange;
  resolution: PriceResolution;
  provider: 'fmp' | 'polygon' | 'alphaVantage' | 'database' | null;
  points: StockPricePoint[];
  support?: SupportLevelsSnapshot | null;
  metadata: {
    from: number;
    to: number;
    count: number;
    disabled?: boolean;
    message?: string;
  };
}

export interface PolygonAggregateBar {
  v?: number;
  vw?: number;
  o?: number;
  c?: number;
  h?: number;
  l?: number;
  t?: number;
  n?: number;
}

export type StockPerformanceTimeframe =
  | '1D'
  | '1W'
  | '1M'
  | '3M'
  | '6M'
  | 'YTD'
  | '1Y'
  | '5Y';

export interface StockPerformanceEntry {
  timeframe: StockPerformanceTimeframe;
  changePercent: number | null;
  startPrice: number | null;
  endPrice: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface StockPerformanceResponse {
  symbol: string;
  companyName?: string | null;
  entries: StockPerformanceEntry[];
  latestClose?: number | null;
  metadata: {
    provider: 'fmp' | 'polygon' | 'alphaVantage' | 'database' | null;
    from: number;
    to: number;
    count: number;
    disabled?: boolean;
    message?: string;
  };
}

export interface PolygonFinancialValue {
  value?: number | null;
  unit?: string | null;
  label?: string | null;
  order?: number | null;
}

export type PolygonFinancialSection = Record<string, PolygonFinancialValue>;

export type PolygonFinancialTimeframe = 'quarterly' | 'annual';

export interface PolygonFinancialStatements {
  income_statement?: PolygonFinancialSection;
  balance_sheet?: PolygonFinancialSection;
  cash_flow_statement?: PolygonFinancialSection;
  comprehensive_income?: PolygonFinancialSection;
}

export interface StockFinancialMetricEntry {
  period: string;
  fiscalPeriod?: string | null;
  fiscalYear?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  filingDate?: string | null;
  value: number | null;
  valueFormatted?: string | null;
  yoyChangePercent: number | null;
}

export interface StockFinancialMetrics {
  totalRevenue: StockFinancialMetricEntry[];
  grossProfit: StockFinancialMetricEntry[];
  operatingIncome: StockFinancialMetricEntry[];
  netIncome: StockFinancialMetricEntry[];
}

export interface PolygonFinancialResult {
  start_date?: string;
  end_date?: string;
  timeframe?: string;
  fiscal_period?: string;
  fiscal_year?: string;
  cik?: string;
  sic?: string;
  tickers?: string[];
  company_name?: string;
  filing_date?: string;
  acceptance_datetime?: string;
  source_filing_url?: string;
  source_filing_file_url?: string;
  financials?: PolygonFinancialStatements;
}

export interface StockRevenueResponse {
  symbol: string;
  companyName?: string | null;
  status?: string;
  request_id?: string;
  count?: number;
  next_url?: string | null;
  results: PolygonFinancialResult[];
  metrics: StockFinancialMetrics;
  metadata: {
    provider: 'fmp' | 'polygon';
    limit: number;
    timeframe: PolygonFinancialTimeframe;
    order: 'asc' | 'desc';
    normalizedOrder?: 'asc' | 'desc';
    sort: string;
    hasApiKey: boolean;
    fetchedAt: Date;
    message?: string;
  };
}

export interface StockNewsItem {
  title: string;
  title_th?: string | null;
  description?: string | null;
  description_th?: string | null;
  source?: string | null;
  url?: string | null;
  summary?: string | null;
  publishedAt?: string | null;
  imageUrl?: string | null;
}

export interface StockNewsResponse {
  symbol: string;
  items: StockNewsItem[];
  metadata: {
    provider: 'fmp' | 'polygon' | 'google-script';
    limit: number;
    hasApiKey: boolean;
    fetchedAt: Date;
    message?: string;
  };
}

export type SECFilingType =
  | '10-K' // Annual report
  | '10-Q' // Quarterly report
  | '8-K' // Current report
  | '4' // Insider trading
  | 'DEF 14A' // Proxy statement
  | 'S-1' // IPO registration
  | '6-K' // Foreign issuer report
  | 'TRANSCRIPT' // Earnings call transcript
  | 'PRESS_RELEASE'; // Press releases

export interface CompanyDocument {
  id: string;
  type: SECFilingType | string;
  title: string;
  description?: string | null;
  filingDate: string;
  periodDate?: string | null;
  fiscalYear?: string | null;
  fiscalQuarter?: string | null;
  url?: string | null;
  fileUrl?: string | null;
  acceptanceDateTime?: string | null;
  cik?: string | null;
  size?: number | null;
  tags?: string[];
}

export interface CompanyDocumentsResponse {
  symbol: string;
  companyName?: string | null;
  cik?: string | null;
  documents: CompanyDocument[];
  filteredBy: {
    type?: SECFilingType | string;
    year?: number;
    limit?: number;
  };
  metadata: {
    provider: 'fmp' | 'polygon' | 'sec' | 'google-script' | 'database';
    total: number;
    hasMore: boolean;
    fetchedAt: Date;
    message?: string;
  };
}
