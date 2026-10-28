import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { T0, captureNestLogger } from './otp-int-helpers.js';

/**
 * Hook chung cho test tích hợp của `auth` trên MySQL thật: mở kết nối một lần cho cả file; trước MỖI test xoá bảng, giả đồng hồ ứng dụng
 * tại `T0` và gom log Nest, rồi gọi `onTest` để file test gán biến của nó (kết nối, fixture, dòng log).
 * Đồng hồ giả chỉ giả `Date`: bộ hẹn giờ thật vẫn chạy nên kết nối MySQL không bị ảnh hưởng.
 */
export function useIntegrationHooks(
  onTest: (db: DataSource, logs: string[]) => void,
): void {
  let db: DataSource;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
  });

  beforeEach(async () => {
    await resetTables(db);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    onTest(db, captureNestLogger());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db?.destroy();
  });
}
