import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { EnvironmentVariables } from '../config/env.validation.js';
import {
  buildDataSourceOptions,
  dbSettingsFromEnv,
  type DbEnv,
} from './data-source.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
        const env: DbEnv = {
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          MYSQL_DATABASE: config.get('MYSQL_DATABASE', { infer: true }),
          MYSQL_USER: config.get('MYSQL_USER', { infer: true }),
          MYSQL_PASSWORD: config.get('MYSQL_PASSWORD', { infer: true }),
          DB_TIMEZONE: config.get('DB_TIMEZONE', { infer: true }),
        };
        return {
          ...buildDataSourceOptions(dbSettingsFromEnv(env)),
          migrationsRun: config.get('DB_MIGRATIONS_RUN', { infer: true }),
        };
      },
    }),
  ],
})
export class DatabaseModule {}
