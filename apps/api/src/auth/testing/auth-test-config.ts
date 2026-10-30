import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { TEST_AUTH_ENV } from './auth-test-env.js';

// ConfigService đã "kiểm" sẵn, giống cái app thật nhận từ validateEnv; `overrides` để thử ca đặc biệt.
export function createTestConfigService(
  overrides: Partial<Record<keyof EnvironmentVariables, unknown>> = {},
): ConfigService<EnvironmentVariables, true> {
  return new ConfigService<EnvironmentVariables, true>({
    JWT_ACCESS_SECRET: TEST_AUTH_ENV.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: TEST_AUTH_ENV.JWT_REFRESH_SECRET,
    OTP_HMAC_SECRET: TEST_AUTH_ENV.OTP_HMAC_SECRET,
    JWT_RESET_SECRET: TEST_AUTH_ENV.JWT_RESET_SECRET,
    NODE_ENV: 'test',
    WEB_ORIGIN: TEST_AUTH_ENV.WEB_ORIGIN,
    COOKIE_SECURE: true,
    ...overrides,
  });
}
