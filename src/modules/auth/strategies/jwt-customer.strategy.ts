import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../../common/interfaces';

@Injectable()
export class JwtCustomerStrategy extends PassportStrategy(
  Strategy,
  'jwt-customer',
) {
  private readonly secret: string;
  constructor(private readonly config: ConfigService) {
    const fallback = config.get<string>('JWT_SECRET', 'your-secret-key');
    const secret = config.get<string>('JWT_CUSTOMER_SECRET') || fallback;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
    this.secret = secret;
  }

  validate(payload: JwtPayload): JwtPayload {
    if (payload.type !== 'customer') {
      throw new UnauthorizedException('Invalid token type for customer route');
    }
    return payload;
  }
}
