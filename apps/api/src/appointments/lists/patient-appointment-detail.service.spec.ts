import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import {
  FakePaymentSummaryPort,
  FakeRefundPort,
} from '../testing/fake-ports.js';
import { PatientAppointmentDetailService } from './patient-appointment-detail.service.js';
import { PATIENT_VISIBLE_STATES } from './patient-appointments.dto.js';
import type {
  PatientAppointmentDetailRow,
  PatientAppointmentsRepository,
} from './patient-appointments.repository.js';

// Task B2 — PatientAppointmentDetailService với kho GIẢ, hai cổng GIẢ và `runReadOnly` giả (không DB): hàng và hai cổng CHUNG một `manager`, 404 ở một chỗ, giờ máy chủ lấy
// sau cùng. SQL thật: patient-appointment-detail.int-spec.ts. Mã LSH-nn là [đề xuất] (TRACKING 3.15.3).
const hoisted = vi.hoisted(() => ({
  manager: { id: 'manager-cua-mot-giao-dich' },
}));
vi.mock('../../common/transaction/read-only-tx.js', () => ({
  runReadOnly: vi.fn(
    (_db: unknown, work: (manager: unknown) => Promise<unknown>) =>
      work(hoisted.manager),
  ),
}));
import { runReadOnly } from '../../common/transaction/read-only-tx.js';

const DB = { id: 'datasource' } as unknown as DataSource;
const PATIENT = '77';
const CODE = 'CLX-20261110-7K3QD';

function row(
  overrides: Partial<PatientAppointmentDetailRow> = {},
): PatientAppointmentDetailRow {
  return {
    maLichHen: CODE,
    trangThai: 'DaXacNhan',
    thoiGian: new Date('2026-11-12T01:30:00.000Z'),
    bacSi: 'Bác sĩ A',
    chuyenKhoa: 'Nội',
    chiNhanh: 'Chi nhánh 1',
    dichVu: 'Khám nội',
    laBanThan: 1,
    nguoiKham: 'Người Khám',
    giaSnapshot: '150000.00',
    tienCoc: '50000.00',
    hanThanhToan: null,
    lichHenId: '9001',
    lyDoKham: null,
    ...overrides,
  };
}

let findDetail: ReturnType<typeof vi.fn>;
let payments: FakePaymentSummaryPort;
let refunds: FakeRefundPort;
let service: PatientAppointmentDetailService;

beforeEach(() => {
  vi.mocked(runReadOnly).mockClear();
  findDetail = vi.fn().mockResolvedValue(row());
  payments = new FakePaymentSummaryPort();
  refunds = new FakeRefundPort();
  service = new PatientAppointmentDetailService(
    DB,
    { findDetail } as unknown as PatientAppointmentsRepository,
    payments,
    refunds,
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T03:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LSH-10 chi tiết: một lần runReadOnly, hàng và hai cổng chung một manager', () => {
  it('gọi findDetail với chủ sở hữu từ token, mã đã chuẩn hoá và tập trạng thái hiển thị (không DaDoiLich)', async () => {
    await service.detail(PATIENT, CODE);
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runReadOnly).mock.calls[0]?.[0]).toBe(DB);
    expect(findDetail).toHaveBeenCalledTimes(1);
    expect(findDetail).toHaveBeenCalledWith(
      hoisted.manager,
      PATIENT,
      CODE,
      PATIENT_VISIBLE_STATES,
    );
    expect(PATIENT_VISIBLE_STATES).not.toContain('DaDoiLich');
  });

  it('LSH-23 hai cổng nhận ĐÚNG manager của runReadOnly và lichHenId của hàng (không phải mã công khai)', async () => {
    await service.detail(PATIENT, CODE);
    expect(payments.findPaymentCall.calls).toStrictEqual([
      [hoisted.manager, '9001'],
    ]);
    expect(refunds.findRefundCall.calls).toStrictEqual([
      [hoisted.manager, '9001'],
    ]);
  });

  it('LSH-10 cổng mặc định (như Noop) trả null ⇒ thanhToan và hoanTien là null; đủ mười sáu khoá; không lichHenId', async () => {
    const detail = await service.detail(PATIENT, CODE);
    expect(detail.thanhToan).toBeNull();
    expect(detail.hoanTien).toBeNull();
    expect(Object.keys(detail)).toHaveLength(16);
    expect(detail).not.toHaveProperty('lichHenId');
    expect(detail.maLichHen).toBe(CODE);
    expect(detail.choPhepHuy).toBe(true);
  });

  it('LSH-23 cổng giả trả giá trị mẫu ⇒ ra đúng hình dạng', async () => {
    const thanhToan = {
      daThu: '50000.00',
      conPhaiThu: '100000.00',
      giaoDich: [
        {
          phuongThuc: 'Vi' as const,
          soTien: '50000.00',
          thoiDiem: '2026-11-10T02:00:00.000Z',
        },
      ],
    };
    const hoanTien = {
      soTien: '50000.00',
      trangThai: 'ThanhCong' as const,
      thoiDiem: '2026-11-11T02:00:00.000Z',
    };
    payments.findPaymentCall.returns(thanhToan);
    refunds.findRefundCall.returns(hoanTien);
    const detail = await service.detail(PATIENT, CODE);
    expect(detail.thanhToan).toStrictEqual(thanhToan);
    expect(detail.hoanTien).toStrictEqual(hoanTien);
  });

  it('thoiGianMayChu lấy SAU khi đọc xong cả hàng lẫn hai cổng (giờ đổi trong lúc đọc ⇒ lấy giờ sau cùng), giữ mili giây', async () => {
    refunds.findRefundCall.onCall(() => {
      vi.setSystemTime(new Date('2026-11-10T03:00:07.456Z'));
    });
    const detail = await service.detail(PATIENT, CODE);
    expect(detail.thoiGianMayChu).toBe('2026-11-10T03:00:07.456Z');
  });
});

describe('LSH-11, LSH-22, QB-01 không xem được ⇒ MỘT lỗi 404 KHONG_TIM_THAY, ở một chỗ', () => {
  it('không có hàng (của người khác, không tồn tại, DaDoiLich đều ra "không có hàng" từ SQL) ⇒ AppException 404 và KHÔNG gọi cổng nào', async () => {
    findDetail.mockResolvedValue(null);
    const error: unknown = await service.detail(PATIENT, CODE).catch((e) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect((error as AppException).maLoi).toBe('KHONG_TIM_THAY');
    expect(payments.findPaymentCall.count).toBe(0);
    expect(refunds.findRefundCall.count).toBe(0);
  });

  it('lỗi của cổng (hay của DB) lan ra nguyên vẹn, KHÔNG bị đổi thành 404', async () => {
    const failure = new Error('cổng hỏng');
    payments.findPaymentCall.throwsOnce(failure);
    await expect(service.detail(PATIENT, CODE)).rejects.toBe(failure);
    expect(refunds.findRefundCall.count).toBe(0);
  });
});
