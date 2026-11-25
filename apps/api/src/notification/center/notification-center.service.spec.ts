import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { NotificationListQueryDto } from './notification-center.dto.js';
import type { NotificationCenterRepository } from './notification-center.repository.js';
import {
  NotificationCenterService,
  READ_ALL_BATCH_SIZE,
} from './notification-center.service.js';

// notification B2 — service với repository và DataSource giả: đánh dấu tất cả chia lô, MỖI LÔ một giao dịch READ COMMITTED (R3; đột biến 7),
// id sai dạng ⇒ 404 mà không chạm DB (TTB-06), soChuaDoc của danh sách không theo bộ lọc (TTB-02; đột biến 5). Hành vi trên DB thật ở notification-center.int-spec.ts.
const manager = { tag: 'manager' } as unknown as EntityManager;

function build(batches: number[] = []) {
  const queue = [...batches];
  const repository = {
    list: vi.fn(() => Promise.resolve([])),
    count: vi.fn(() => Promise.resolve(7)),
    unreadCount: vi.fn(() => Promise.resolve(3)),
    findOne: vi.fn(() => Promise.resolve(null)),
    markRead: vi.fn(() => Promise.resolve(false)),
    markAllBatch: vi.fn(() => Promise.resolve(queue.shift() ?? 0)),
  };
  const isolation: string[] = [];
  const dataSource = {
    manager,
    transaction: vi.fn(
      (level: string, work: (em: EntityManager) => Promise<unknown>) => {
        isolation.push(level);
        return work({
          tag: `tx${String(isolation.length)}`,
        } as unknown as EntityManager);
      },
    ),
  };
  return {
    service: new NotificationCenterService(
      dataSource as unknown as DataSource,
      repository as unknown as NotificationCenterRepository,
    ),
    repository,
    dataSource,
    isolation,
  };
}

describe('NotificationCenterService', () => {
  it('TTB-08 (đơn vị): đánh dấu tất cả lặp lô 500 tới khi một lô < 500; mỗi lô một giao dịch READ COMMITTED riêng', async () => {
    const { service, repository, isolation } = build([500, 500, 200]);
    await expect(service.markAllRead('5')).resolves.toEqual({
      daDanhDau: 1200,
      soChuaDoc: 3,
    });
    expect(isolation).toEqual([
      'READ COMMITTED',
      'READ COMMITTED',
      'READ COMMITTED',
    ]);
    expect(repository.markAllBatch.mock.calls.map((c) => c.slice(1))).toEqual(
      Array(3).fill(['5', READ_ALL_BATCH_SIZE]),
    );
    // Mỗi lô chạy trên em của chính giao dịch đó, không trên manager chung
    expect(
      repository.markAllBatch.mock.calls.map(
        (c) => (c[0] as unknown as { tag: string }).tag,
      ),
    ).toEqual(['tx1', 'tx2', 'tx3']);
    expect(READ_ALL_BATCH_SIZE).toBe(500);
  });

  it('đánh dấu tất cả khi không còn gì: một lô trả 0 rồi dừng', async () => {
    const { service, isolation } = build([0]);
    await expect(service.markAllRead('5')).resolves.toEqual({
      daDanhDau: 0,
      soChuaDoc: 3,
    });
    expect(isolation).toHaveLength(1);
  });

  it.each(['abc', '0', '-1', '1e3', '01', '1'.repeat(21), '', ' 1'])(
    'TTB-06 (đơn vị): id sai dạng "%s" ⇒ 404 KHONG_TIM_THAY, không chạm DB',
    async (id) => {
      const { service, repository } = build();
      for (const call of [service.detail('5', id), service.markRead('5', id)]) {
        const error = await call.catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).getStatus()).toBe(404);
        expect((error as AppException).maLoi).toBe('KHONG_TIM_THAY');
      }
      expect(repository.findOne).not.toHaveBeenCalled();
      expect(repository.markRead).not.toHaveBeenCalled();
    },
  );

  it('id 20 chữ số hợp lệ về dạng vẫn tra DB (không có ⇒ 404)', async () => {
    const { service, repository } = build();
    await expect(service.detail('5', '1'.repeat(20))).rejects.toBeInstanceOf(
      AppException,
    );
    expect(repository.findOne).toHaveBeenCalledWith(
      manager,
      '1'.repeat(20),
      '5',
    );
  });

  it('TTB-02 (đơn vị): bộ lọc đi vào list và count, còn soChuaDoc luôn là unreadCount (không theo bộ lọc)', async () => {
    const { service, repository } = build();
    const query = Object.assign(new NotificationListQueryDto(), {
      trangThaiDoc: 'da-doc',
      page: 2,
      pageSize: 10,
    });
    await expect(service.list('5', query)).resolves.toEqual({
      items: [],
      total: 7,
      page: 2,
      pageSize: 10,
      soChuaDoc: 3,
    });
    expect(repository.list).toHaveBeenCalledWith(manager, {
      taiKhoanId: '5',
      filter: 1,
      limit: 10,
      offset: 10,
    });
    expect(repository.count).toHaveBeenCalledWith(manager, '5', 1);
    expect(repository.unreadCount).toHaveBeenCalledWith(manager, '5');
  });
});
