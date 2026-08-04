import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { JobsModule } from './modules/jobs/jobs.module';
import { GritMeterModule } from './modules/grit-meter/grit-meter.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbEngine = config.get<string>('DATABASE_ENGINE') || config.get<string>('DB_TYPE') || 'mysql';
        const isMysql = dbEngine.includes('mysql') || dbEngine.includes('mariadb');
        const entities = [__dirname + '/**/*.entity{.ts,.js}'];

        if (!isMysql) {
          throw new Error(`Unsupported database engine "${dbEngine}". Please check DATABASE_ENGINE / DB_TYPE in .env`);
        }

        return {
          type: 'mysql' as const,
          host: config.get<string>('DATABASE_HOST', 'localhost'),
          port: parseInt(config.get<string>('DATABASE_PORT', '3306'), 10),
          username: config.get<string>('DATABASE_USER', 'root'),
          password: config.get<string>('DATABASE_PASSWORD', ''),
          database: config.get<string>('DATABASE_NAME', 'mulearn'),
          entities,
          synchronize: config.get<string>('DB_SYNC', 'false') === 'true',
          logging: config.get<string>('DB_LOGGING', 'false') === 'true',
        };
      },
    }),
    JobsModule,
    GritMeterModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
