import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { FakeAppointmentNotifier } from '../testing/fake-ports.js';
import {
  OWNER_ID,
  reschedulabilityFacts,
  rescheduleSource,
} from '../testing/reschedulability-facts.js';
import type { RescheduleRequestRepository } from './reschedule-request.repository.js';
import { RescheduleRequestService } from './reschedule-request.service.js';
import type { RescheduleReader } from './reschedule.reader.js';

// reschedule B5 — XDL-30 phần "lỗi lập trình" `[đề xuất]`: ba lớp bảo vệ mà bộ luật THẬT không bao giờ chạm tới (luật chỉ cho qua khi có lịch và có khung giờ đích; từ chối sớm chỉ khi luật chắc chắn từ chối).
// Muốn kiểm phải thay luật bằng bản giả trả "cho qua" bất hợp lý; vì vậy tách khỏi `reschedule-request.service.spec.ts` (nơi dùng luật thật). Mỗi lớp bảo vệ phải NÉM (không âm thầm ghi dở).
const hoisted = vi.hoisted(() => ({ manager: { id: 'manager-giao-dich' } }));
vi.mock('../locking/booking-transaction.js', () => ({
  withBookingTransaction: vi.fn(
    (_db: unknown, work: (manager: unknown) => Promise<unknown>) =>
      work(hoisted.manager),
  ),
}));
vi.mock('./reschedule-locks.js', () => ({
  lockRequestCreation: vi.fn().mockResolvedValue({ kind: 'Locked' }),
}));
vi.mock('./reschedulability.rules.js', () => ({
  evaluateReschedulability: vi.fn(),
}));
import { evaluateReschedulability } from './reschedulability.rules.js';

const DB = { manager: { id: 'manager-doc-thuong' } } as unknown as DataSource;
const OK_REQUEST = { ok: true, branch: 'Request', lapsedHold: null } as const;
const LOCATED = {
  lichHenId: '100',
  benhNhanId: OWNER_ID,
  hoSoNguoiThanId: null,
  bacSiId: '5',
  khungGioCuId: '11',
  bacSiCuaKhungGioMoiId: '5',
};

let reader: Record<'config' | 'locate' | 'read', ReturnType<typeof vi.fn>>;
let repository: { insert: ReturnType<typeof vi.fn> };
let notifier: FakeAppointmentNotifier;
let service: RescheduleRequestService;

const create = (khungGioMongMuonId = '10') =>
  service.create({
    maLichHen: 'CLX-20261109-OLDAP',
    khungGioMongMuonId,
    lyDoYeuCau: 'Tôi bận việc đột xuất',
    accountId: OWNER_ID,
  });

beforeEach(() => {
  reader = {
    config: vi.fn().mockResolvedValue({
      soLanTuDoiLichToiDa: 2,
      checkInSauPhut: 15,
      soLichHenToiDaMoiHoSo: 3,
    }),
    locate: vi.fn().mockResolvedValue(LOCATED),
    read: vi.fn().mockResolvedValue({
      facts: reschedulabilityFacts({
        source: rescheduleSource({ soLanTuDoiLich: 2 }),
      }),
      locked: null,
    }),
  };
  repository = { insert: vi.fn().mockResolvedValue('501') };
  notifier = new FakeAppointmentNotifier();
  service = new RescheduleRequestService(
    DB,
    reader as unknown as RescheduleReader,
    repository as unknown as RescheduleRequestRepository,
    notifier,
  );
  vi.mocked(evaluateReschedulability).mockReset();
});

describe('XDL-30 lớp bảo vệ: luật "cho qua" bất hợp lý thì NÉM, không ghi', () => {
  it('khung giờ không khoá được (trùng khung giờ cũ) mà luật cho qua ⇒ ném lỗi lập trình', async () => {
    vi.mocked(evaluateReschedulability).mockReturnValue(OK_REQUEST);
    await expect(create('11')).rejects.toThrow(/không khoá được/);
    expect(repository.insert).not.toHaveBeenCalled();
    expect(notifier.notifyCall.count).toBe(0);
  });

  it('luật cho qua nhánh Request nhưng không có lịch cũ trong facts ⇒ ném, không INSERT', async () => {
    vi.mocked(evaluateReschedulability).mockReturnValue(OK_REQUEST);
    reader.read.mockResolvedValue({
      facts: reschedulabilityFacts({ source: null }),
      locked: null,
    });
    await expect(create()).rejects.toThrow(/không có lịch cũ/);
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('luật cho qua nhánh Request nhưng không có khung giờ đích trong facts ⇒ ném, không INSERT, không thông báo', async () => {
    vi.mocked(evaluateReschedulability).mockReturnValue(OK_REQUEST);
    reader.read.mockResolvedValue({
      facts: reschedulabilityFacts({
        source: rescheduleSource({ soLanTuDoiLich: 2 }),
        bookability: null,
      }),
      locked: null,
    });
    await expect(create()).rejects.toThrow(/không có khung giờ đích/);
    expect(repository.insert).not.toHaveBeenCalled();
    expect(notifier.notifyCall.count).toBe(0);
  });
});
