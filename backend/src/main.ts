import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  const app = await NestFactory.create(AppModule, {
    // Disable x-powered-by header
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });
  const configService = app.get(ConfigService);

  // Security Headers with Helmet
  const isProduction = configService.get('NODE_ENV') === 'production';
  
  app.use(helmet({
    contentSecurityPolicy: isProduction ? undefined : false, // Disable CSP in dev for Swagger
    crossOriginEmbedderPolicy: false, // Needed for some API clients
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // API prefix
  const apiPrefix = configService.get('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS - Allow multiple frontend origins in development
  const frontendUrl = configService.get('FRONTEND_URL', 'http://localhost:3000');
  const allowedOrigins = [frontendUrl, 'http://localhost:3001', 'http://localhost:3002'];
  
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('EUTLAS API')
    .setDescription('EU MongoDB Atlas Control Plane API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Users', 'User management')
    .addTag('Organizations', 'Organization management')
    .addTag('Projects', 'Project management')
    .addTag('Clusters', 'Cluster lifecycle management')
    .addTag('Backups', 'Backup management')
    .addTag('Events', 'Event history')
    .addTag('Health', 'Health checks')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Start server
  const port = configService.get('PORT', 4000);
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📚 API documentation: http://localhost:${port}/docs`);
  logger.log(`🔗 API base URL: http://localhost:${port}/${apiPrefix}`);
}

bootstrap();
