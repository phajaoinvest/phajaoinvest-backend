import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  ValidationPipe,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { PaperTradesService } from './paper-trades.service';
import { PlacePaperTradeDto } from './dto/paper-trade.dto';
import { JwtCustomerAuthGuard } from '../auth/guards/jwt-customer.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import type { JwtPayload } from '../../common/interfaces';
import {
  handleSuccessOne,
  handleSuccessMany,
} from '../../common/utils/response.util';

@ApiTags('paper-trades')
@ApiBearerAuth()
@Controller('paper-trades')
export class PaperTradesController {
  constructor(private readonly paperTradesService: PaperTradesService) {}

  // ============================================================================
  // Customer Routes
  // ============================================================================

  @Post()
  @UseGuards(JwtCustomerAuthGuard)
  @ApiOperation({ summary: 'Place a paper trade (Guess Buy) using demo balance' })
  @ApiBody({
    description: 'Paper trade payload',
    schema: {
      type: 'object',
      properties: {
        stock_id: { type: 'string', example: 'uuid-here' },
        investment_amount: { type: 'number', example: 1000 },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Trade placed successfully' })
  @ApiResponse({ status: 400, description: 'Validation / business error' })
  async placeTrade(
    @AuthUser() user: JwtPayload,
    @Body(ValidationPipe) dto: PlacePaperTradeDto,
  ) {
    if (user.type !== 'customer') {
      throw new ForbiddenException('Only customers can place paper trades');
    }
    const trade = await this.paperTradesService.placeTrade(user.sub, dto);
    return handleSuccessOne({
      data: trade,
      message: 'Paper trade placed successfully',
      statusCode: 200,
    });
  }

  @Post(':id/close')
  @UseGuards(JwtCustomerAuthGuard)
  @ApiOperation({ summary: 'Close an open paper trade and realize PnL' })
  @ApiResponse({ status: 200, description: 'Trade closed with realized PnL' })
  @ApiResponse({ status: 404, description: 'Trade not found' })
  async closeTrade(
    @AuthUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (user.type !== 'customer') {
      throw new ForbiddenException('Only customers can close paper trades');
    }
    const trade = await this.paperTradesService.closeTrade(id, user.sub);
    return handleSuccessOne({
      data: trade,
      message: `Trade closed successfully`,
      statusCode: 200,
    });
  }

  @Get('portfolio')
  @UseGuards(JwtCustomerAuthGuard)
  @ApiOperation({
    summary: 'Get paper trading portfolio with live PnL (symbols masked when hidden)',
  })
  @ApiResponse({
    status: 200,
    description: 'Portfolio with open/closed positions and live PnL',
  })
  async getPortfolio(@AuthUser() user: JwtPayload) {
    if (user.type !== 'customer') {
      throw new ForbiddenException('Only customers can view their portfolio');
    }
    const portfolio = await this.paperTradesService.getPortfolio(user.sub);
    return handleSuccessOne({
      data: portfolio,
      message: 'Portfolio fetched with live prices',
    });
  }

  @Get('balance')
  @UseGuards(JwtCustomerAuthGuard)
  @ApiOperation({ summary: 'Get remaining demo balance (separate from real wallet)' })
  @ApiResponse({ status: 200, description: 'Demo balance information' })
  async getBalance(@AuthUser() user: JwtPayload) {
    if (user.type !== 'customer') {
      throw new ForbiddenException('Only customers can check balance');
    }
    const balance = await this.paperTradesService.getBalance(user.sub);
    return handleSuccessOne({
      data: balance,
      message: 'Demo balance fetched',
    });
  }

  @Get('available-stocks')
  @UseGuards(JwtCustomerAuthGuard)
  @ApiOperation({ summary: 'Get available stocks for paper trading (symbols masked when hidden)' })
  @ApiResponse({
    status: 200,
    description: 'List of active/tradable stocks with masked symbols',
  })
  async getAvailableStocks(@AuthUser() user: JwtPayload) {
    if (user.type !== 'customer') {
      throw new ForbiddenException('Only customers can view stocks');
    }
    const stocks = await this.paperTradesService.getAvailableStocks();
    return handleSuccessMany({
      data: stocks,
      message: 'Available stocks fetched',
    });
  }

  // ============================================================================
  // Admin Routes
  // ============================================================================

  @Post('admin/reset-balance/:customerId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[Admin] Reset a customer demo balance' })
  @ApiBody({
    description: 'Optional new balance amount',
    schema: {
      type: 'object',
      properties: {
        new_balance: {
          type: 'number',
          example: 100000,
          description: 'New demo balance. Defaults to $100,000 if omitted.',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Demo balance reset successfully' })
  async resetDemoBalance(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: { new_balance?: number },
  ) {
    const result = await this.paperTradesService.resetDemoBalance(
      customerId,
      body.new_balance,
    );
    return handleSuccessOne({
      data: result,
      message: `Demo balance reset to $${result.demo_balance.toLocaleString()}`,
    });
  }
}
