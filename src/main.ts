import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ClassSerializerInterceptor } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for browser requests
  const corsOrigins = process.env.CORS_ORIGIN?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://localhost:8080',
  ];

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  // Configure WebSocket adapter for real-time features
  app.useWebSocketAdapter(new IoAdapter(app));

  // Set global API prefix (versioned)
  app.setGlobalPrefix('api/v1');

  // Global error response wrapper
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global serializer to handle @Exclude() decorators
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector), {
      excludeExtraneousValues: false,
      exposeUnsetFields: false,
    }),
  );

  // Shared Swagger configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Trading Platform API')
    .setDescription(
      'Unified API documentation for the trading backend. Use this single endpoint for all modules.',
    )
    // Version aligned with API prefix (v1). Increment when breaking changes are introduced.
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  // 1. Global document (all modules auto-discovered)
  const globalDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    // Optionally could specify include: [AppModule] explicitly; left default to pick all.
  });
  SwaggerModule.setup('api/v1/docs', app, globalDocument, {
    swaggerOptions: {
      persistAuthorization: true,
      filter: true, // enables search box that filters operations by text
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const basePort = Number(process.env.PORT) || 3000;
  const maxTries = 10;
  for (let i = 0; i < maxTries; i++) {
    const port = basePort + i;
    try {
      await app.listen(port);
      const base = `http://localhost:${port}`;
      console.log(`Server running on endpoint: ${base}/api/v1`);
      console.log(`Global API docs: ${base}/api/v1/docs`);
      if (i > 0) {
        console.warn(
          `Port ${basePort} was busy; started on fallback port ${port}`,
        );
      }
      break;
    } catch (err) {
      if (i === maxTries - 1) throw err;
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        console.warn(`Port ${port} in use, trying ${port + 1}...`);
        continue;
      }
      throw err;
    }
  }
}
void bootstrap();
