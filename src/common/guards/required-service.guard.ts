import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CustomerServiceType } from '../../modules/customers/entities/customer-service.entity';
import { CustomersService } from '../../modules/customers/customers.service';
import { REQUIRED_SERVICE_TYPE } from '../decorators/requires-service.decorator';

type MinimalCustomerService = {
  service_type: CustomerServiceType;
  active?: boolean | null;
  subscription_expires_at?: Date | string | null;
};

const SERVICE_LABELS: Record<CustomerServiceType, string> = {
  [CustomerServiceType.PREMIUM_MEMBERSHIP]: 'Premium membership',
  [CustomerServiceType.PREMIUM_STOCK_PICKS]: 'Premium stock picks',
  [CustomerServiceType.INTERNATIONAL_STOCK_ACCOUNT]:
    'International stock account',
  [CustomerServiceType.GUARANTEED_RETURNS]: 'Guaranteed returns',
};

@Injectable()
export class RequiredServiceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly customersService: CustomersService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<CustomerServiceType>(
      REQUIRED_SERVICE_TYPE,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true; // no requirement defined

    const req = context
      .switchToHttp()
      .getRequest<{ user?: { sub: string; type: string } }>();
    const user = req.user;
    if (!user || user.type !== 'customer') {
      throw new ForbiddenException('Customer authentication required');
    }

    const services = (await this.customersService.listServices(
      user.sub,
    )) as MinimalCustomerService[];
    const now = new Date();

    const ok = Array.isArray(services)
      ? services.some((service) => {
        if (service.service_type !== required) return false;
        if (!service.active) return false;

        if (!service.subscription_expires_at) return true;
        const expires = new Date(service.subscription_expires_at);
        return Number.isFinite(expires.getTime()) && expires > now;
      })
      : false;
    if (!ok) {
      const label = SERVICE_LABELS[required] ?? 'Required customer service';
      throw new ForbiddenException(
        `${label} is inactive, expired, or missing. Please apply, renew, or complete payment to regain access.`,
      );
    }
    return true;
  }
}
