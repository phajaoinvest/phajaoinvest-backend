import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const config = {
    type: 'postgres' as const,
    host: configService.get<string>('DATABASE_HOST', 'localhost'),
    port: configService.get<number>('DATABASE_PORT', 5432),
    username: configService.get<string>('DATABASE_USERNAME', 'postgres'),
    password: configService.get<string>('DATABASE_PASSWORD', 'password'),
    database: configService.get<string>('DATABASE_NAME', 'trading_db'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    // synchronize: false,
    synchronize: true,
    // synchronize: configService.get<boolean>('DATABASE_SYNCHRONIZE', false),
    logging: configService.get<boolean>('DATABASE_LOGGING', true),
    ssl: false, // Explicitly disable SSL for local development
    extra: {
      // Additional connection options
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },
  };

  return config;
};

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  ssl: boolean;
}
