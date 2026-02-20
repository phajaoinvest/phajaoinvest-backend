import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Trading Platform API')
    .setVersion('1.0')
    .build();

  const globalDocument = SwaggerModule.createDocument(app, swaggerConfig);
  fs.writeFileSync('swagger.json', JSON.stringify(globalDocument));
  await app.close();
  console.log('Swagger generated');
}
bootstrap();
