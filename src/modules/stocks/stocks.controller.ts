import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ValidationPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import {
  StocksListResponseExample,
  StockGetOneResponseExample,
  StockCreateRequestExample,
  StockCreateResponseExample,
  StockUpdateRequestExample,
  StockUpdateResponseExample,
  StockDeleteResponseExample,
  StockBuyRequestExample,
  StockBuyResponseExample,
  StockSellRequestExample,
  StockSellResponseExample,
} from '../../docs/swagger';
import { StocksService } from './stocks.service';
import { RealTimePriceService } from './services/real-time-price.service';
import {
  CreateStockDto,
  UpdateStockDto,
  StockResponseDto,
  BuyStockDto,
  SellStockDto,
} from './dto/stock.dto';
import {
  handleSuccessOne,
  handleSuccessPaginated,
  handleSuccessMany,
  IOneResponse,
  IPaginatedResponse,
  IManyResponse,
} from '../../common/utils/response.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import type { JwtPayload, PaginationOptions } from '../../common/interfaces';

@ApiTags('stocks')
@ApiBearerAuth()
@Controller('stocks')
@UseGuards(JwtAuthGuard)
export class StocksController {
  constructor(
    private readonly stocksService: StocksService,
    private readonly realTimePriceService: RealTimePriceService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List stocks with pagination' })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number (default 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Items per page (default 10)',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    example: 'created_at',
    description: 'Sort field',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    example: 'DESC',
    description: 'Sort order ASC|DESC',
  })
  @ApiQuery({
    name: 'is_demo',
    required: false,
    type: 'boolean',
    description: 'Filter by demo status',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list returned',
    schema: { example: StocksListResponseExample },
  })
  async findAll(
    @Query() query: PaginationOptions,
  ): Promise<IPaginatedResponse<StockResponseDto>> {
    const result = await this.stocksService.findAll(query);
    return handleSuccessPaginated<StockResponseDto>({
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      message: 'Stocks fetched',
    });
  }

  @Get('good-7')
  @ApiOperation({ summary: 'Curated 7 large-cap tech stocks' })
  @ApiResponse({
    status: 200,
    description: 'Array of 7 stocks',
    schema: {
      example: {
        is_error: false,
        code: 'SUCCESS',
        message: 'Top 7 returned',
        total: 7,
        data: [
          {
            id: 'uuid-here',
            symbol: 'AAPL',
            name: 'Apple Inc.',
            price: 178.25,
            change: 2.5,
            changePercent: 1.42,
            market: 'NASDAQ',
            country: 'USA',
            marketCap: '2.8T',
            pe: 29.5,
            volume: '52.3M',
          },
        ],
        status_code: 200,
      },
    },
  })
  async getGoodSeven(): Promise<IManyResponse<Record<string, unknown>>> {
    const symbols = ['MSFT', 'AAPL', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];

    const fmtShort = (v?: number | null, units?: 'cap' | 'vol') => {
      if (v === null || v === undefined) return null;
      const abs = Math.abs(v);
      if (units === 'cap') {
        if (abs >= 1_000_000_000_000)
          return `${(v / 1_000_000_000_000).toFixed(1)}T`;
        if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
        if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
        if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
        return String(v);
      }
      // volume units
      if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
      if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
      return String(v);
    };

    // Ensure symbols exist and try to refresh quotes quickly (fire & forget)
    await Promise.all(
      symbols.map(async (s) => {
        await this.realTimePriceService.ensureSymbol(s);
        // non-blocking fetch, errors ignored here
        void this.realTimePriceService
          .fetchAndUpdate(s, false)
          .catch(() => undefined);
      }),
    );

    // Fetch stocks and current quotes
    const results = await Promise.all(
      symbols.map(async (s) => {
        const stock = await this.stocksService['stockRepository'].findOne({
          where: { symbol: s },
        });
        const quote = this.realTimePriceService.getCurrentPrice(s);
        return { stock, quote };
      }),
    );

    const data = results
      .map(({ stock, quote }) => {
        if (!stock) return null; // skip if missing
        const price = quote?.price ?? Number(stock.last_price ?? 0);
        const change = quote?.change ?? Number(stock.change ?? 0);
        const changePercent =
          quote?.changePercent ?? Number(stock.change_percent ?? 0);
        return {
          id: stock.id,
          symbol: stock.symbol,
          name: stock.company || stock.name,
          price,
          change,
          changePercent,
          market: stock.exchange || 'SMART',
          country: stock.country || null,
          marketCap: fmtShort(stock.market_cap ?? null, 'cap'),
          pe: stock.pe_ratio ?? null,
          volume: fmtShort(quote?.volume ?? stock.volume ?? null, 'vol'),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    return handleSuccessMany({ data, message: 'Top 7 returned' });
  }

  @Get('id/:id')
  @ApiOperation({ summary: 'Get a stock by id' })
  @ApiResponse({
    status: 200,
    description: 'Stock found',
    schema: { example: StockGetOneResponseExample },
  })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IOneResponse<StockResponseDto>> {
    const data = await this.stocksService.findOne(id);
    return handleSuccessOne({ data, message: 'Stock found' });
  }

  @Get('by-symbol/:symbol')
  @ApiOperation({
    summary:
      'Lookup or auto-create a stock by symbol (also ensures category & optional price refresh)',
  })
  @ApiQuery({
    name: 'refresh',
    required: false,
    example: '1',
    description: 'If provided and truthy, fetch external quote immediately',
  })
  @ApiResponse({ status: 200, description: 'Stock ensured/returned' })
  async findOrCreateBySymbol(
    @Param('symbol') symbol: string,
    @Query('refresh') refresh?: string,
  ): Promise<IOneResponse<Record<string, unknown>>> {
    const upper = symbol.toUpperCase();
    // We trigger a subscription to leverage existing ensure logic.
    await this.realTimePriceService.subscribe(upper);

    if (refresh && refresh !== '0' && refresh !== 'false') {
      await this.realTimePriceService.fetchAndUpdate(upper, true);
    }

    const stock = await this.stocksService['stockRepository'].findOne({
      where: { symbol: upper },
    });

    return handleSuccessOne({
      data: {
        symbol: upper,
        stock: stock
          ? {
              id: stock.id,
              last_price: stock.last_price,
              category_id: stock.stock_categories_id,
            }
          : null,
      },
      message: 'Symbol ensured',
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create new stock' })
  @ApiBody({
    description: 'Create stock payload',
    schema: ((): Record<string, unknown> => ({
      type: 'object',
      properties: {
        name: { type: 'string' },
        symbol: { type: 'string' },
        last_price: { type: 'number' },
        stock_categories_id: { type: 'string' },
      },
      example: StockCreateRequestExample,
    }))(),
  })
  @ApiResponse({
    status: 200,
    description: 'Stock created',
    schema: { example: StockCreateResponseExample },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @UseGuards(PermissionsGuard)
  @Permissions('stocks:create')
  async create(
    @Body(ValidationPipe) createStockDto: CreateStockDto,
  ): Promise<IOneResponse<StockResponseDto>> {
    const data = await this.stocksService.create(createStockDto);
    return handleSuccessOne({
      data,
      message: 'Stock created',
      statusCode: 200,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a stock by id' })
  @ApiBody({
    description: 'Update stock payload (partial)',
    schema: ((): Record<string, unknown> => ({
      type: 'object',
      properties: {
        name: { type: 'string' },
        last_price: { type: 'number' },
      },
      example: StockUpdateRequestExample,
    }))(),
  })
  @ApiResponse({
    status: 200,
    description: 'Stock updated',
    schema: { example: StockUpdateResponseExample },
  })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  @UseGuards(PermissionsGuard)
  @Permissions('stocks:update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) updateStockDto: UpdateStockDto,
  ): Promise<IOneResponse<StockResponseDto>> {
    const data = await this.stocksService.update(id, updateStockDto);
    return handleSuccessOne({ data, message: 'Stock updated' });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a stock by id' })
  @ApiResponse({
    status: 200,
    description: 'Stock deleted',
    schema: { example: StockDeleteResponseExample },
  })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  @UseGuards(PermissionsGuard)
  @Permissions('stocks:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IOneResponse<null>> {
    await this.stocksService.remove(id);
    return handleSuccessOne({ data: null, message: 'Stock deleted' });
  }

  @Get('debug/quote/:symbol')
  @ApiOperation({
    summary: 'Debug current cached quote (price source/provider)',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns cached real-time quote with source',
    schema: {
      example: {
        statusCode: 200,
        message: 'Quote debug',
        data: {
          symbol: 'LAC',
          price: 6.33,
          change: -1.04,
          changePercent: -14.11,
          volume: 80688120,
          bidPrice: 6.28,
          askPrice: 6.29,
          source: 'EXTERNAL',
          provider: 'yahoo',
          high: 6.55,
          low: 6.2,
          open: 6.5,
          previousClose: 7.37,
          lastUpdate: '2025-09-27T19:28:49.123Z',
        },
      },
    },
  })
  debugQuote(
    @Param('symbol') symbol: string,
  ):
    | IOneResponse<Record<string, unknown>>
    | Promise<IOneResponse<Record<string, unknown>>> {
    // Ensure placeholder & category exist for debug lookups, without forcing subscription
    this.realTimePriceService.ensureSymbol(symbol).catch(() => undefined);
    const current = this.realTimePriceService.getCurrentPrice(symbol);
    if (!current) {
      return handleSuccessOne({
        data: { symbol: symbol.toUpperCase(), message: 'No cached quote' },
        message: 'Quote debug',
      });
    }
    return handleSuccessOne({
      data: {
        symbol: current.symbol,
        price: current.price,
        change: current.change,
        changePercent: current.changePercent,
        volume: current.volume,
        bidPrice: current.bidPrice,
        askPrice: current.askPrice,
        bidSize: current.bidSize,
        askSize: current.askSize,
        source: current.source,
        provider: current.provider,
        high: current.high,
        low: current.low,
        open: current.open,
        previousClose: current.previousClose,
        lastUpdate: new Date().toISOString(),
      },
      message: 'Quote debug',
    });
  }

  @Post('buy')
  @ApiOperation({ summary: 'Customer buys stock' })
  @ApiBody({
    description: 'Buy stock payload',
    schema: ((): Record<string, unknown> => ({
      type: 'object',
      properties: {
        stock_id: { type: 'string' },
        quantity: { type: 'number' },
        buy_price: { type: 'number' },
      },
      example: StockBuyRequestExample,
    }))(),
  })
  @ApiResponse({
    status: 200,
    description: 'Buy executed',
    schema: { example: StockBuyResponseExample },
  })
  @ApiResponse({ status: 400, description: 'Validation / business error' })
  async buyStock(
    @AuthUser() user: JwtPayload,
    @Body(ValidationPipe) buyStockDto: BuyStockDto,
  ): Promise<IOneResponse<{ success: boolean; message: string }>> {
    if (user.type !== 'customer') {
      throw new Error('Only customers can buy stocks');
    }
    const data = await this.stocksService.buyStock(user.sub, buyStockDto);
    return handleSuccessOne({ data, message: data.message, statusCode: 200 });
  }

  @Post('sell')
  @ApiOperation({ summary: 'Customer sells stock' })
  @ApiBody({
    description: 'Sell stock payload',
    schema: ((): Record<string, unknown> => ({
      type: 'object',
      properties: {
        stock_id: { type: 'string' },
        quantity: { type: 'number' },
        sell_price: { type: 'number' },
      },
      example: StockSellRequestExample,
    }))(),
  })
  @ApiResponse({
    status: 200,
    description: 'Sell executed',
    schema: { example: StockSellResponseExample },
  })
  @ApiResponse({ status: 400, description: 'Validation / business error' })
  async sellStock(
    @AuthUser() user: JwtPayload,
    @Body(ValidationPipe) sellStockDto: SellStockDto,
  ): Promise<IOneResponse<{ success: boolean; message: string }>> {
    if (user.type !== 'customer') {
      throw new Error('Only customers can sell stocks');
    }
    const data = await this.stocksService.sellStock(user.sub, sellStockDto);
    return handleSuccessOne({ data, message: data.message, statusCode: 200 });
  }
}
