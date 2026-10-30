import { Test } from '@nestjs/testing';
import type { EntityManager } from 'typeorm';
import { AuditModule } from '../audit.module.js';
import { AuditService } from '../audit.service.js';
import { AuditRepository } from '../audit.repository.js';
import { NhatKyHanhDong } from '../../admin/entities/nhat-ky-hanh-dong.entity.js';
import { auditEntries } from '../testing/audit-fixtures.js';

function activeManager() {
  const state = {
    isReleased: false,
    isTransactionActive: true,
    manager: null as unknown,
  };
  const manager = { queryRunner: state } as unknown as EntityManager;
  state.manager = manager;
  return { manager, state };
}

describe('C2-01/02/04/05/06/07 — service/repository/module', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('C2-07 consumer chỉ import AuditModule là resolve được AuditService', async () => {
    const module = await Test.createTestingModule({
      imports: [AuditModule],
    }).compile();
    expect(module.get(AuditService)).toBeInstanceOf(AuditService);
    await module.close();
  });
  it('C2-01 không nhận manager global, không transaction, released hoặc lệch runner', async () => {
    const repository = { insert: vi.fn() };
    const service = new AuditService(repository);
    const { manager, state } = activeManager();
    const entry = auditEntries()[0]!;
    await expect(service.record({} as EntityManager, entry)).rejects.toThrow(
      'AUDIT_TRANSACTION_REQUIRED',
    );
    state.isTransactionActive = false;
    await expect(service.record(manager, entry)).rejects.toThrow(
      'AUDIT_TRANSACTION_REQUIRED',
    );
    state.isTransactionActive = true;
    state.isReleased = true;
    await expect(service.record(manager, entry)).rejects.toThrow(
      'AUDIT_TRANSACTION_REQUIRED',
    );
    state.isReleased = false;
    state.manager = {};
    await expect(service.record(manager, entry)).rejects.toThrow(
      'AUDIT_TRANSACTION_REQUIRED',
    );
    expect(repository.insert).not.toHaveBeenCalled();
  });
  it('C2-02/06 ghi đúng manager một lần, thời điểm cắt giây, snapshot trước await', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T16:59:59.999Z'));
    const repository = { insert: vi.fn().mockResolvedValue(undefined) };
    const service = new AuditService(repository);
    const { manager } = activeManager();
    const input = auditEntries().find(
      (row) => row.action === 'CapNhatCauHinh',
    )!;
    const expected = structuredClone(input);
    const work = service.record(manager, input);
    input.changes.sau.check_in_truoc_phut = 90;
    await work;
    expect(repository.insert).toHaveBeenCalledExactlyOnceWith(
      manager,
      expected,
      new Date('2026-10-30T16:59:59Z'),
    );
  });
  it('C2-05 validation lỗi không chạm repository và không log raw input', async () => {
    const repository = { insert: vi.fn() };
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { manager } = activeManager();
    await expect(
      new AuditService(repository).record(manager, {
        ...auditEntries()[0]!,
        changes: {},
      } as never),
    ).rejects.toThrow('AUDIT_ENTRY_INVALID');
    expect(repository.insert).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
  it('C2-04/05 lỗi driver thoát bằng mã cố định, không cause/query/parameters', async () => {
    const marker = 'driver error test only';
    const repository = {
      insert: vi.fn().mockRejectedValue(
        Object.assign(new Error(marker), {
          query: marker,
          parameters: [marker],
        }),
      ),
    };
    const { manager } = activeManager();
    const error = await new AuditService(repository)
      .record(manager, auditEntries()[0]!)
      .catch((value: unknown) => value);
    expect(
      error instanceof Error && error.message === 'AUDIT_WRITE_FAILED',
    ).toBe(true);
    expect(Object.hasOwn(error as object, 'cause')).toBe(false);
    expect(JSON.stringify(error).includes(marker)).toBe(false);
  });
  it.each(auditEntries())(
    'C2-02 repository map $action qua manager caller, không manager fallback',
    async (entry) => {
      const insert = vi.fn().mockResolvedValue(undefined);
      const manager = { insert } as unknown as EntityManager;
      const at = new Date('2026-10-30T01:00:00Z');
      await new AuditRepository().insert(manager, entry, at);
      expect(insert).toHaveBeenCalledExactlyOnceWith(NhatKyHanhDong, {
        taiKhoanId: entry.actorId,
        chiNhanhId: entry.branchId,
        hanhDong: entry.action,
        loaiDoiTuong: entry.targetType,
        maDoiTuong: entry.targetId,
        ketQua: entry.result,
        chiTietThayDoi: entry.changes,
        thoiDiem: at,
      });
    },
  );
});
