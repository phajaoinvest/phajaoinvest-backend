import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaperTrade } from './entities/paper-trade.entity';
import { Stock } from '../stocks/entities/stock.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { PlacePaperTradeDto } from './dto/paper-trade.dto';
import { PaperTradeStatus } from '../../common/enums';
import { ExternalPriceFetcherService } from '../stocks/services/external-price-fetcher.service';

// Default demo balance for new or reset wallets
const DEFAULT_DEMO_BALANCE = 100_000;

@Injectable()
export class PaperTradesService {
  private readonly logger = new Logger(PaperTradesService.name);

  constructor(
    @InjectRepository(PaperTrade)
    private readonly paperTradeRepo: Repository<PaperTrade>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    private readonly priceFetcher: ExternalPriceFetcherService,
  ) { }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Fetch the latest price for a symbol from FMP (primary) or other providers.
   */
  private async getLivePrice(symbol: string): Promise<number> {
    const quote = await this.priceFetcher.fetchQuote(symbol);
    if (quote && typeof quote.price === 'number' && quote.price > 0) {
      const change = quote.previousClose && quote.previousClose > 0 ? quote.price - quote.previousClose : undefined;
      const changePct = quote.previousClose && quote.previousClose > 0 ? (change! / quote.previousClose) * 100 : undefined;

      this.stockRepo.update({ symbol }, {
        last_price: quote.price,
        ...(change !== undefined && { change }),
        ...(changePct !== undefined && { change_percent: changePct }),
        updated_at: new Date()
      }).catch(err => this.logger.warn(`Failed to update DB for ${symbol}: ${err.message}`));

      return quote.price;
    }
    // Fallback to last_price in DB
    const stock = await this.stockRepo.findOne({ where: { symbol } });
    if (stock?.last_price) {
      return Number(stock.last_price);
    }
    throw new BadRequestException(
      `Unable to fetch live price for ${symbol}. Please try again later.`,
    );
  }

  /**
   * Get or auto-initialize demo wallet for a customer.
   * If the wallet exists but demo_balance is null/undefined (old records),
   * sets it to the default.
   */
  private async getDemoWallet(customerId: string): Promise<Wallet> {
    let wallet = await this.walletRepo.findOne({
      where: { customer_id: customerId },
    });

    if (!wallet) {
      throw new NotFoundException(
        'Wallet not found. Please contact support.',
      );
    }

    // Auto-initialize demo_balance for old wallets that don't have it set
    if (
      wallet.demo_balance === null ||
      wallet.demo_balance === undefined
    ) {
      wallet.demo_balance = DEFAULT_DEMO_BALANCE;
      wallet = await this.walletRepo.save(wallet);
      this.logger.log(
        `Initialized demo balance of $${DEFAULT_DEMO_BALANCE} for customer ${customerId}`,
      );
    }

    return wallet;
  }

  /**
   * Mask the symbol if show_symbol is false.
   * Returns null when hidden — the frontend renders blur.
   */
  private maskSymbol(stock: Stock): string | null {
    return stock.show_symbol ? stock.symbol : null;
  }

  // ============================================================================
  // Core Trading Operations
  // ============================================================================

  /**
   * Place a new paper trade (Guess Buy).
   * Uses demo_balance (NOT real total_cash).
   */
  async placeTrade(
    customerId: string,
    dto: PlacePaperTradeDto,
  ): Promise<Record<string, unknown>> {
    // 1. Find the stock
    const stock = await this.stockRepo.findOne({
      where: { id: dto.stock_id },
    });
    if (!stock) {
      throw new NotFoundException('Stock not found');
    }
    if (!stock.is_active || !stock.is_tradable) {
      throw new BadRequestException('This stock is not available for trading');
    }

    // 2. Validate max_investment
    if (
      stock.max_investment &&
      dto.investment_amount > Number(stock.max_investment)
    ) {
      throw new BadRequestException(
        `Investment amount exceeds the maximum allowed ($${stock.max_investment})`,
      );
    }

    // 3. Check DEMO balance (not real money)
    const wallet = await this.getDemoWallet(customerId);
    if (wallet.demo_balance < dto.investment_amount) {
      throw new BadRequestException(
        `Insufficient demo balance. Available: $${wallet.demo_balance.toFixed(2)}`,
      );
    }

    // 4. Get live entry price
    const entryPrice = await this.getLivePrice(stock.symbol);
    const sharesBought = dto.investment_amount / entryPrice;

    // 5. Deduct from DEMO balance only
    wallet.demo_balance -= dto.investment_amount;
    await this.walletRepo.save(wallet);

    // 6. Create paper trade
    const trade = this.paperTradeRepo.create({
      customer_id: customerId,
      stock_id: dto.stock_id,
      investment_amount: dto.investment_amount,
      entry_price: entryPrice,
      shares_bought: sharesBought,
      status: PaperTradeStatus.OPEN,
    });

    const saved = await this.paperTradeRepo.save(trade);
    this.logger.log(
      `Paper trade placed: ${stock.symbol} $${dto.investment_amount} @ $${entryPrice} (${sharesBought.toFixed(4)} shares) for customer ${customerId}`,
    );

    // Return masked response (never leak symbol if hidden)
    return {
      id: saved.id,
      stock_id: saved.stock_id,
      symbol: this.maskSymbol(stock),
      name: stock.company || stock.name,
      investment_amount: Number(saved.investment_amount),
      entry_price: Number(saved.entry_price),
      shares_bought: Number(saved.shares_bought),
      status: saved.status,
      created_at: saved.created_at,
    };
  }

  /**
   * Close an open paper trade and realize PnL.
   * Returns demo funds + PnL to demo_balance.
   */
  async closeTrade(
    tradeId: string,
    customerId: string,
  ): Promise<Record<string, unknown>> {
    const trade = await this.paperTradeRepo.findOne({
      where: { id: tradeId, customer_id: customerId },
      relations: ['stock'],
    });
    if (!trade) {
      throw new NotFoundException('Trade not found');
    }
    if (trade.status !== PaperTradeStatus.OPEN) {
      throw new BadRequestException('Trade is already closed');
    }

    // Get live close price
    const closePrice = await this.getLivePrice(trade.stock.symbol);
    const pnl =
      (closePrice - Number(trade.entry_price)) * Number(trade.shares_bought);

    // Update trade
    trade.close_price = closePrice;
    trade.pnl = Math.round(pnl * 100) / 100;
    trade.status = PaperTradeStatus.CLOSED;
    trade.closed_at = new Date();

    // Return funds + PnL to DEMO balance (not real money)
    const wallet = await this.getDemoWallet(customerId);
    wallet.demo_balance += Number(trade.investment_amount) + trade.pnl;
    await this.walletRepo.save(wallet);

    const saved = await this.paperTradeRepo.save(trade);
    this.logger.log(
      `Paper trade closed: ${trade.stock.symbol} PnL=$${trade.pnl} for customer ${customerId}`,
    );

    return {
      id: saved.id,
      stock_id: saved.stock_id,
      symbol: this.maskSymbol(trade.stock),
      name: trade.stock.company || trade.stock.name,
      investment_amount: Number(saved.investment_amount),
      entry_price: Number(saved.entry_price),
      close_price: Number(saved.close_price),
      shares_bought: Number(saved.shares_bought),
      pnl: saved.pnl,
      status: saved.status,
      closed_at: saved.closed_at,
    };
  }

  // ============================================================================
  // Portfolio & Balance
  // ============================================================================

  /**
   * Get portfolio with live PnL calculation for all open trades.
   * Symbols are masked when show_symbol=false — never leaked to client.
   */
  async getPortfolio(customerId: string) {
    const trades = await this.paperTradeRepo.find({
      where: { customer_id: customerId },
      relations: ['stock'],
      order: { created_at: 'DESC' },
    });

    const openTrades = trades.filter((t) => t.status === PaperTradeStatus.OPEN);
    const closedTrades = trades.filter(
      (t) => t.status === PaperTradeStatus.CLOSED,
    );

    // Fetch live prices for all open positions
    const symbolsToFetch = [
      ...new Set(openTrades.map((t) => t.stock.symbol)),
    ];
    const livePrices: Record<string, number> = {};

    await Promise.all(
      symbolsToFetch.map(async (symbol) => {
        try {
          livePrices[symbol] = await this.getLivePrice(symbol);
        } catch {
          const stock = await this.stockRepo.findOne({ where: { symbol } });
          livePrices[symbol] = stock?.last_price
            ? Number(stock.last_price)
            : 0;
        }
      }),
    );

    // Calculate live PnL for open trades
    const openPositions = openTrades.map((trade) => {
      const currentPrice = livePrices[trade.stock.symbol] || 0;
      const unrealizedPnl =
        (currentPrice - Number(trade.entry_price)) *
        Number(trade.shares_bought);
      const pnlPercent =
        Number(trade.entry_price) > 0
          ? ((currentPrice - Number(trade.entry_price)) /
            Number(trade.entry_price)) *
          100
          : 0;
      const currentValue = currentPrice * Number(trade.shares_bought);

      return {
        id: trade.id,
        stock_id: trade.stock_id,
        symbol: this.maskSymbol(trade.stock), // null when hidden
        show_symbol: trade.stock.show_symbol,
        name: this.maskSymbol(trade.stock),
        investment_amount: Number(trade.investment_amount),
        entry_price: Number(trade.entry_price),
        current_price: currentPrice,
        shares_bought: Number(trade.shares_bought),
        current_value: Math.round(currentValue * 100) / 100,
        unrealized_pnl: Math.round(unrealizedPnl * 100) / 100,
        pnl_percent: Math.round(pnlPercent * 100) / 100,
        is_profit: unrealizedPnl >= 0,
        opened_at: trade.created_at,
        status: trade.status,
      };
    });

    // Format closed trades
    const closedPositions = closedTrades.map((trade) => ({
      id: trade.id,
      stock_id: trade.stock_id,
      symbol: this.maskSymbol(trade.stock), // null when hidden
      show_symbol: trade.stock.show_symbol,
      name: trade.stock.company || trade.stock.name,
      investment_amount: Number(trade.investment_amount),
      entry_price: Number(trade.entry_price),
      close_price: Number(trade.close_price),
      shares_bought: Number(trade.shares_bought),
      realized_pnl: Number(trade.pnl),
      is_profit: Number(trade.pnl) >= 0,
      opened_at: trade.created_at,
      closed_at: trade.closed_at,
      status: trade.status,
    }));

    // Portfolio summary
    const totalInvested = openPositions.reduce(
      (sum, p) => sum + p.investment_amount,
      0,
    );
    const totalCurrentValue = openPositions.reduce(
      (sum, p) => sum + p.current_value,
      0,
    );
    const totalUnrealizedPnl = openPositions.reduce(
      (sum, p) => sum + p.unrealized_pnl,
      0,
    );
    const totalRealizedPnl = closedPositions.reduce(
      (sum, p) => sum + p.realized_pnl,
      0,
    );

    return {
      summary: {
        total_invested: Math.round(totalInvested * 100) / 100,
        total_current_value: Math.round(totalCurrentValue * 100) / 100,
        total_unrealized_pnl: Math.round(totalUnrealizedPnl * 100) / 100,
        total_realized_pnl: Math.round(totalRealizedPnl * 100) / 100,
        total_pnl:
          Math.round((totalUnrealizedPnl + totalRealizedPnl) * 100) / 100,
        open_trades_count: openPositions.length,
        closed_trades_count: closedPositions.length,
      },
      open_positions: openPositions,
      closed_positions: closedPositions,
    };
  }

  /**
   * Get remaining DEMO balance for a customer.
   * Clearly returns demo_balance, separate from real funds.
   */
  async getBalance(customerId: string) {
    const wallet = await this.getDemoWallet(customerId);

    const openTrades = await this.paperTradeRepo.find({
      where: { customer_id: customerId, status: PaperTradeStatus.OPEN },
    });

    const totalInvested = openTrades.reduce(
      (sum, t) => sum + Number(t.investment_amount),
      0,
    );

    return {
      demo_balance: Math.round(wallet.demo_balance * 100) / 100,
      total_invested: Math.round(totalInvested * 100) / 100,
      total_demo_value:
        Math.round((wallet.demo_balance + totalInvested) * 100) / 100,
      initial_demo_balance: DEFAULT_DEMO_BALANCE,
    };
  }

  /**
   * Get available stocks for paper trading.
   * Only stocks with is_demo=true appear in Guess Buy.
   * Symbols are masked when show_symbol=false.
   */
  async getAvailableStocks() {
    const stocks = await this.stockRepo.find({
      where: { is_active: true, is_tradable: true, is_demo: true },
      order: { symbol: 'ASC' },
    });

    await Promise.all(
      stocks.map(async (stock) => {
        try {
          const quote = await this.priceFetcher.fetchQuote(stock.symbol);
          console.log({ quote });
          if (quote && typeof quote.price === 'number' && quote.price > 0) {
            stock.last_price = quote.price;
            if (quote.previousClose && quote.previousClose > 0) {
              stock.change = quote.price - quote.previousClose;
              stock.change_percent = (stock.change / quote.previousClose) * 100;
            }
            await this.stockRepo.update(stock.id, {
              last_price: stock.last_price,
              change: stock.change,
              change_percent: stock.change_percent,
              updated_at: new Date()
            });
          }
        } catch (e) {
          // ignore and keep DB cached price
        }
      })
    );

    return stocks.map((stock) => ({
      id: stock.id,
      symbol: this.maskSymbol(stock), // null when hidden
      show_symbol: stock.show_symbol,
      name: this.maskSymbol(stock),
      last_price: stock.last_price ? Number(stock.last_price) : null,
      change: stock.change ? Number(stock.change) : null,
      change_percent: stock.change_percent
        ? Number(stock.change_percent)
        : null,
      max_investment: stock.max_investment
        ? Number(stock.max_investment)
        : null,
      sector: stock.sector,
      exchange: stock.exchange,
    }));
  }

  // ============================================================================
  // Admin Operations
  // ============================================================================

  /**
   * Reset a customer's demo balance (admin only).
   */
  async resetDemoBalance(
    customerId: string,
    newBalance?: number,
  ): Promise<{ demo_balance: number }> {
    const wallet = await this.walletRepo.findOne({
      where: { customer_id: customerId },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found for this customer');
    }

    wallet.demo_balance = newBalance ?? DEFAULT_DEMO_BALANCE;
    await this.walletRepo.save(wallet);

    this.logger.log(
      `Demo balance reset to $${wallet.demo_balance} for customer ${customerId}`,
    );

    return { demo_balance: wallet.demo_balance };
  }
}
