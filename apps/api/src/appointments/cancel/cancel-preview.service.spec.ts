import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { TRANG_THAI_LICH_HEN } from '../../admin/entities/enums.js';
import { canPatientCancel } from '../lists/patient-appointment.mapper.js';
import type { PatientVisibleState } from '../lists/patient-appointments.dto.js';
import { FakePaymentSummaryPort } from '../testing/fake-ports.js';
import type { CancelPreviewRow } from './cancel-preview.query.js';
import { CancelPreviewService } from './cancel-preview.service.js';

// Task B10 — HBN-03: CancelPreviewService với `runReadOnly` giả và câu đọc giả (không DB): MỘT lần runReadOnly, `amountPaid` cùng `manager` với câu đọc hàng, dùng đúng `calculateRefund` và `canPatientCancel`,
// 404 ở một chỗ, không khoá. SQL thật: appointment-cancellation.service.int-spec.ts (HL-07, HL-08). Mã HBN-03 là `[đề xuất]` (PLAN 7.29; TRACKING 3.23 B10-I).
const hoisted = vi.hoisted(() => ({
  manager: { id: 'manager-cua-mot-giao-dich' },
}));
vi.mock('../../common/transaction/read-only-tx.js', () => ({
  runReadOnly: vi.fn(
    (_db: unknown, work: (manager: unknown) => Promise<unknown>) =>
      work(hoisted.manager),
  ),
}));
vi.mock('./cancel-preview.query.js', () => ({
  readCancelPreviewRow: vi.fn(),
}));
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { readCancelPreviewRow } from './cancel-preview.query.js';

const DB = { id: 'datasource' } as unknown as DataSource;
const PATIENT = '77';
const CODE = 'CLX-20261110-AAA01';
const THOI_GIAN = new Date('2026-11-10T08:00:00+07:00');
const TIERS = [
  { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
  { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
  { so_gio_truoc_toi_thieu: 0, ty_le_hoan: 0 },
];

const row = (overrides: Partial<CancelPreviewRow> = {}): CancelPreviewRow => ({
  lichHenId: '9001',
  trangThai: 'DaXacNhan',
  thoiGian: THOI_GIAN,
  chinhSachHoan: TIERS,
  ...overrides,
});

let payments: FakePaymentSummaryPort;
let service: CancelPreviewService;

beforeEach(() => {
  vi.mocked(runReadOnly).mockClear();
  vi.mocked(readCancelPreviewRow).mockReset();
  vi.mocked(readCancelPreviewRow).mockResolvedValue(row());
  payments = new FakePaymentSummaryPort();
  payments.paid({ '9001': '100000.00' });
  service = new CancelPreviewService(DB, payments);
  vi.useFakeTimers({ toFake: ['Date'] });
  // còn 30 giờ tới giờ hẹn
  vi.setSystemTime(new Date(THOI_GIAN.getTime() - 30 * 3_600_000));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HBN-03 CancelPreviewService', () => {
  it('MỘT lần runReadOnly; câu đọc hàng và amountPaid dùng CÙNG manager; chủ sở hữu từ token và mã đã chuẩn hoá đi vào câu đọc', async () => {
    await service.preview(PATIENT, CODE);
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runReadOnly).mock.calls[0]?.[0]).toBe(DB);
    expect(readCancelPreviewRow).toHaveBeenCalledExactlyOnceWith(
      hoisted.manager,
      PATIENT,
      CODE,
    );
    expect(payments.amountPaidCall.calls).toEqual([[hoisted.manager, '9001']]);
  });

  it('lịch DaXacNhan đã thu 100.000, còn 30 giờ ⇒ choPhepHuy, hoanCoc theo bậc 24 giờ (100%), không lyDoKhongHuy', async () => {
    await expect(service.preview(PATIENT, CODE)).resolves.toStrictEqual({
      choPhepHuy: true,
      hoanCoc: { tyLe: 100, soTien: '100000.00', mocApDung: 24 },
    });
  });

  it('dùng đúng chính sách của BỆNH NHÂN (theo bậc, Q17): còn 5 giờ ⇒ 50%, còn 1 giờ ⇒ 0%, đã quá giờ ⇒ 0% (đều là kết quả, không phải null)', async () => {
    for (const [hoursLeft, expected] of [
      [5, { tyLe: 50, soTien: '50000.00', mocApDung: 2 }],
      [1, { tyLe: 0, soTien: '0.00', mocApDung: 0 }],
      [-2, { tyLe: 0, soTien: '0.00', mocApDung: null }],
    ] as const) {
      vi.setSystemTime(new Date(THOI_GIAN.getTime() - hoursLeft * 3_600_000));
      await expect(service.preview(PATIENT, CODE)).resolves.toMatchObject({
        choPhepHuy: true,
        hoanCoc: expected,
      });
    }
  });

  it('chưa thu đồng nào (lịch cọc 0đ hay ChoThanhToan chưa thanh toán, Q45) ⇒ choPhepHuy và hoanCoc null; snapshot hỏng không chặn xem trước', async () => {
    payments.paid({}, '0.00');
    vi.mocked(readCancelPreviewRow).mockResolvedValue(
      row({ trangThai: 'ChoThanhToan', chinhSachHoan: 'hỏng' }),
    );
    await expect(service.preview(PATIENT, CODE)).resolves.toStrictEqual({
      choPhepHuy: true,
      hoanCoc: null,
    });
  });

  it.each(TRANG_THAI_LICH_HEN.filter((s) => s !== 'DaDoiLich'))(
    'trạng thái %s: choPhepHuy do canPatientCancel (ma trận P1) quyết; không cho thì có lyDoKhongHuy, hoanCoc null và KHÔNG hỏi amountPaid',
    async (trangThai) => {
      vi.mocked(readCancelPreviewRow).mockResolvedValue(row({ trangThai }));
      const expected = canPatientCancel(trangThai as PatientVisibleState);
      const result = await service.preview(PATIENT, CODE);
      expect(result.choPhepHuy).toBe(expected);
      if (expected) {
        expect(result).not.toHaveProperty('lyDoKhongHuy');
        expect(payments.amountPaidCall.count).toBe(1);
      } else {
        expect(result).toStrictEqual({
          choPhepHuy: false,
          lyDoKhongHuy: 'LICH_HEN_KHONG_CHO_HUY',
          hoanCoc: null,
        });
        expect(payments.amountPaidCall.count).toBe(0);
      }
    },
  );

  it('không có hàng (của người khác, không tồn tại, DaDoiLich) ⇒ ném 404 KHONG_TIM_THAY, không hỏi cổng', async () => {
    vi.mocked(readCancelPreviewRow).mockResolvedValue(null);
    const error = await service
      .preview(PATIENT, CODE)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect((error as AppException).maLoi).toBe('KHONG_TIM_THAY');
    expect(payments.amountPaidCall.count).toBe(0);
  });

  it('snapshot hỏng khi đã thu > 0 ⇒ lỗi đi nguyên ra ngoài (500 ở HTTP), không đoán số', async () => {
    vi.mocked(readCancelPreviewRow).mockResolvedValue(
      row({ chinhSachHoan: 'hỏng' }),
    );
    await expect(service.preview(PATIENT, CODE)).rejects.toThrow(/hoàn/);
  });
});
