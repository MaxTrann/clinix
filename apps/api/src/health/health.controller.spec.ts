import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

// Task P1 (khởi tạo apps/api) — không có mã test case riêng trong plan auth.
describe('HealthController', () => {
  it('check() trả { status: "ok" }', async () => {
    const mod = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    expect(mod.get(HealthController).check()).toEqual({ status: 'ok' });
  });
});
