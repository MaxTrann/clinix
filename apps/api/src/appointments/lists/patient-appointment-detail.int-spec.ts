import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { T0 } from '../../auth/testing/otp-int-helpers.js';
import { AppException } from '../../common/errors/app.exception.js';
import { toErrorResponse } from '../../common/errors/all-exceptions.filter.js';
import {
  NoopPaymentSummaryPort,
  type PaymentSummaryPort,
} from '../ports/payment.port.js';
import { NoopRefundPort, type RefundPort } from '../ports/wallet.port.js';
import { AppointmentListFixtures } from '../testing/appointment-list-fixtures.js';
import {
  BOOKING_T0,
  BookingFixtures,
  HOLD_MINUTES,
} from '../testing/booking-fixtures.js';
import {
  FakePaymentSummaryPort,
  FakeRefundPort,
} from '../testing/fake-ports.js';
import { PatientAppointmentDetailService } from './patient-appointment-detail.service.js';
import { PatientAppointmentsRepository } from './patient-appointments.repository.js';
import { PatientAppointmentsService } from './patient-appointments.service.js';

// Task B2 — chi tiết lịch hẹn của Bệnh nhân ở tầng dịch vụ và kho trên MySQL 8.4 THẬT (PLAN booking 7.4, 7.9; TRACKING 3.15.3): hình dạng và bản `Noop` thật của hai cổng (LSH-10),
// ca không xem được ra cùng MỘT 404 (LSH-11, LSH-22, QB-01), `choPhepHuy` (LSH-13), hai cổng chung một giao dịch chỉ đọc (LSH-23). HTTP thật (chuẩn hoá mã, thân 404 từng ký tự,
// header, vai trò): test/booking-patient-appointment-detail.e2e-spec.ts. Mã LSH-22, LSH-23 là [đề xuất]. Dữ liệu giả (email đuôi example.com). Đồng hồ ứng dụng giả = T0.
let db: DataSource;
let fx: BookingFixtures;
let lf: AppointmentListFixtures;
let repo: PatientAppointmentsRepository;
let service: PatientAppointmentDetailService;
let listService: PatientAppointmentsService;

// Hai cổng THẬT của module (bản Noop), tắt cảnh báo để không tràn ra màn hình
function silentNoopPorts() {
  const payments = new NoopPaymentSummaryPort();
  const refunds = new NoopRefundPort();
  payments.logger = { warn: vi.fn() };
  refunds.logger = { warn: vi.fn() };
  return { payments, refunds };
}

function detailServiceWith(
  payments: PaymentSummaryPort,
  refunds: RefundPort,
): PatientAppointmentDetailService {
  return new PatientAppointmentDetailService(db, repo, payments, refunds);
}

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = new BookingFixtures(testDb);
  lf = new AppointmentListFixtures(fx, testDb);
  repo = new PatientAppointmentsRepository();
  const ports = silentNoopPorts();
  service = detailServiceWith(ports.payments, ports.refunds);
  listService = new PatientAppointmentsService(testDb, repo);
});

const CODE = 'CLX-20261110-7K3QD';
const OTHER_CODE = 'CLX-20261110-7K3QE';
const DETAIL_KEYS = [
  'bacSi',
  'chiNhanh',
  'choPhepHuy',
  'chuyenKhoa',
  'dichVu',
  'giaSnapshot',
  'hanThanhToan',
  'hoanTien',
  'lyDoKham',
  'maLichHen',
  'nguoiKham',
  'thanhToan',
  'thoiGian',
  'thoiGianMayChu',
  'tienCoc',
  'trangThai',
];

// Lịch DaXacNhan của `patientId` với bác sĩ của `scene` (viết tắt cho nhiều ca, để jscpd không thấy dựng dữ liệu lặp lại)
const bookConfirmed = (
  scene: { doctor: { profile: BacSi } },
  patientId: string,
  ngay: string,
  maLichHen: string,
) => lf.book(scene.doctor.profile, 'DaXacNhan', { patientId, ngay, maLichHen });

// Một Bệnh nhân khác kèm một hồ sơ người thân (chủ sở hữu của những lịch mà Bệnh nhân A không được xem)
async function otherPatientWithRelative() {
  const other = await fx.admin.patient();
  const otherId = other.account.taiKhoanId;
  return { otherId, otherRelativeId: await fx.relative(otherId) };
}

/** Lỗi ném ra của một lần gọi (ca âm), hoặc làm hỏng test nếu không ném. */
async function rejection(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('Lẽ ra phải ném AppException');
}
const bodyOf = (error: AppException) =>
  JSON.stringify(toErrorResponse(error).body);

describe('LSH-10 chi tiết: đủ mười sáu khoá, hai cổng THẬT (Noop) cho null', () => {
  it('LSH-10 lịch bản thân DaXacNhan: đúng mười sáu khoá; thanhToan, hoanTien là null; lyDoKham, thoiGianMayChu đúng; cùng mười hai khoá với dòng danh sách', async () => {
    const s = await lf.scene({
      doctorName: 'Bác Sĩ Chi Tiết',
      patientName: 'Bệnh Nhân Chi Tiết',
    });
    const booked = await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
      maLichHen: CODE,
      lyDoKham: 'Đau đầu ba ngày',
    });

    const detail = await service.detail(s.patientId, CODE);
    expect(Object.keys(detail).sort()).toStrictEqual(DETAIL_KEYS);
    expect(detail).toMatchObject({
      maLichHen: CODE,
      trangThai: 'DaXacNhan',
      bacSi: 'Bác Sĩ Chi Tiết',
      nguoiKham: { hoTen: 'Bệnh Nhân Chi Tiết', laBanThan: true },
      giaSnapshot: '100000.00',
      tienCoc: '0.00',
      hanThanhToan: null,
      choPhepHuy: true,
      lyDoKham: 'Đau đầu ba ngày',
      thanhToan: null,
      hoanTien: null,
      thoiGianMayChu: T0.toISOString(),
    });
    expect(detail.thoiGian).toBe(booked.thoiGian.toISOString());
    // Cùng hàm ánh xạ với danh sách: mười hai khoá của chi tiết = dòng danh sách của chính lịch đó
    const [item] = (
      await listService.list(s.patientId, {
        page: 1,
        pageSize: 20,
        offset: 0,
      })
    ).items;
    const twelve = Object.fromEntries(
      Object.entries(detail).filter(([key]) =>
        Object.keys(item ?? {}).includes(key),
      ),
    );
    expect(twelve).toStrictEqual(item);
    expect(Object.keys(twelve)).toHaveLength(12);
  });

  it('LSH-10 lyDoKham NULL ⇒ null; ChoThanhToan có hanThanhToan ISO; không khoá nào lộ id (lichHenId, benhNhanId, khungGioId, hoSoNguoiThanId)', async () => {
    const s = await lf.scene();
    await lf.book(s.doctor.profile, 'ChoThanhToan', {
      patientId: s.patientId,
      ngay: '2026-11-12',
      maLichHen: CODE,
    });
    const detail = await service.detail(s.patientId, CODE);
    expect(detail.lyDoKham).toBeNull();
    expect(detail.hanThanhToan).toBe(
      new Date(BOOKING_T0.getTime() + HOLD_MINUTES * 60 * 1000).toISOString(),
    );
    expect(detail.choPhepHuy).toBe(true);
    expect(Object.keys(detail).filter((key) => key.endsWith('Id'))).toEqual([]);
    for (const hidden of ['lichHenId', 'benhNhanId', 'khungGioId', 'lyDoHuy'])
      expect(detail).not.toHaveProperty(hidden);
  });

  it('LSH-10 lịch của người thân (đang dùng và đã ngừng) vẫn xem được: nguoiKham là họ tên người thân, laBanThan false', async () => {
    const s = await lf.scene();
    const relativeId = await fx.relative(s.patientId, {
      hoTen: 'Người Thân Còn',
    });
    const stoppedId = await fx.relative(s.patientId, {
      hoTen: 'Người Thân Ngừng',
      active: false,
    });
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
      hoSoNguoiThanId: relativeId,
      maLichHen: CODE,
    });
    await lf.book(s.doctor.profile, 'HoanThanh', {
      patientId: s.patientId,
      ngay: '2026-11-05',
      hoSoNguoiThanId: stoppedId,
      maLichHen: OTHER_CODE,
    });
    expect((await service.detail(s.patientId, CODE)).nguoiKham).toStrictEqual({
      hoTen: 'Người Thân Còn',
      laBanThan: false,
    });
    expect(
      (await service.detail(s.patientId, OTHER_CODE)).nguoiKham,
    ).toStrictEqual({ hoTen: 'Người Thân Ngừng', laBanThan: false });
  });
});

describe('LSH-13 choPhepHuy ở chi tiết', () => {
  it('LSH-13 true chỉ ở ChoThanhToan và DaXacNhan, false ở bốn trạng thái còn lại; luôn bằng giá trị của dòng danh sách', async () => {
    const s = await lf.scene();
    const states: TrangThaiLichHen[] = [
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
      'HoanThanh',
      'DaHuy',
      'VangMat',
    ];
    const codes: Record<string, string> = {};
    for (const [index, state] of states.entries()) {
      const code = `CLX-20261110-AAAA${String(index)}`;
      codes[state] = code;
      await lf.book(s.doctor.profile, state, {
        patientId: s.patientId,
        ngay: `2026-11-${String(10 + index)}`,
        maLichHen: code,
      });
    }
    const page = await listService.list(s.patientId, {
      page: 1,
      pageSize: 20,
      offset: 0,
    });
    for (const state of states) {
      const detail = await service.detail(s.patientId, codes[state] ?? '');
      expect(detail.trangThai).toBe(state);
      expect(detail.choPhepHuy).toBe(
        state === 'ChoThanhToan' || state === 'DaXacNhan',
      );
      expect(
        page.items.find((i) => i.maLichHen === codes[state]),
      ).toMatchObject({ choPhepHuy: detail.choPhepHuy });
    }
  });
});

describe('LSH-11, LSH-22, QB-01 không xem được ⇒ cùng MỘT 404', () => {
  it('LSH-11, QB-01 lịch của người khác (bản thân và người thân của họ) và mã không tồn tại ra cùng AppException 404 KHONG_TIM_THAY, thân giống từng ký tự', async () => {
    const s = await lf.scene();
    const { otherId, otherRelativeId } = await otherPatientWithRelative();
    await bookConfirmed(s, otherId, '2026-11-10', CODE);
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: otherId,
      ngay: '2026-11-11',
      hoSoNguoiThanId: otherRelativeId,
      maLichHen: OTHER_CODE,
    });
    const mine = await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-12',
      maLichHen: 'CLX-20261110-AAA01',
    });

    const errors = [
      await rejection(service.detail(s.patientId, CODE)),
      await rejection(service.detail(s.patientId, OTHER_CODE)),
      await rejection(service.detail(s.patientId, 'CLX-20261110-ZZZZZ')),
    ];
    for (const error of errors) {
      expect(error.getStatus()).toBe(404);
      expect(error.maLoi).toBe('KHONG_TIM_THAY');
    }
    expect(new Set(errors.map(bodyOf)).size).toBe(1);
    // Chủ sở hữu thật vẫn thấy lịch của mình, và người kia thấy lịch của họ
    expect((await service.detail(s.patientId, mine.maLichHen)).maLichHen).toBe(
      'CLX-20261110-AAA01',
    );
    expect((await service.detail(otherId, CODE)).maLichHen).toBe(CODE);
  });

  it('LSH-22 lịch DaDoiLich của CHÍNH MÌNH ⇒ 404 giống hệt "không tồn tại"; các trạng thái hiển thị còn lại vẫn xem được', async () => {
    const s = await lf.scene();
    await lf.book(s.doctor.profile, 'DaDoiLich', {
      patientId: s.patientId,
      ngay: '2026-11-09',
      maLichHen: CODE,
    });
    await bookConfirmed(s, s.patientId, '2026-11-10', OTHER_CODE);
    const replaced = await rejection(service.detail(s.patientId, CODE));
    const missing = await rejection(
      service.detail(s.patientId, 'CLX-20261110-ZZZZZ'),
    );
    expect(replaced.getStatus()).toBe(404);
    expect(bodyOf(replaced)).toBe(bodyOf(missing));
    expect((await service.detail(s.patientId, OTHER_CODE)).trangThai).toBe(
      'DaXacNhan',
    );
  });
});

describe('LSH-23 hai cổng cùng một giao dịch chỉ đọc với hàng lich_hen', () => {
  it('LSH-23 hai cổng nhận CÙNG MỘT manager, là manager của giao dịch đang mở (không phải manager chung của DataSource) và đúng lichHenId', async () => {
    const s = await lf.scene();
    const booked = await bookConfirmed(s, s.patientId, '2026-11-10', CODE);
    const payments = new FakePaymentSummaryPort();
    const refunds = new FakeRefundPort();
    const inTransaction: (boolean | undefined)[] = [];
    payments.findPaymentCall.onCall((em) => {
      inTransaction.push(em.queryRunner?.isTransactionActive);
    });
    refunds.findRefundCall.onCall((em) => {
      inTransaction.push(em.queryRunner?.isTransactionActive);
    });

    await detailServiceWith(payments, refunds).detail(s.patientId, CODE);

    const paymentEm = payments.findPaymentCall.calls[0]?.[0] as EntityManager;
    const refundEm = refunds.findRefundCall.calls[0]?.[0] as EntityManager;
    expect(paymentEm).toBe(refundEm);
    expect(paymentEm).not.toBe(db.manager);
    expect(inTransaction).toStrictEqual([true, true]);
    expect(payments.findPaymentCall.calls[0]?.[1]).toBe(booked.lichHenId);
    expect(refunds.findRefundCall.calls[0]?.[1]).toBe(booked.lichHenId);
  });

  it('LSH-23 cùng ảnh chụp: lịch chèn và commit ở kết nối KHÁC ngay khi cổng được gọi không thấy được qua manager mà cổng nhận, nhưng có ở lần gọi sau', async () => {
    const s = await lf.scene();
    await bookConfirmed(s, s.patientId, '2026-11-10', CODE);
    const payments = new FakePaymentSummaryPort();
    const seen: number[] = [];
    payments.findPaymentCall.onCall(async (em) => {
      // Kết nối KHÁC (pool) chèn và commit sau khi hàng chi tiết đã được đọc (ảnh chụp đã lập)
      await bookConfirmed(s, s.patientId, '2026-11-11', OTHER_CODE);
      const rows = await em.query<{ total: string }[]>(
        'SELECT COUNT(*) AS total FROM lich_hen WHERE benh_nhan_id = ?',
        [s.patientId],
      );
      seen.push(Number(rows[0]?.total));
    });

    await detailServiceWith(payments, new FakeRefundPort()).detail(
      s.patientId,
      CODE,
    );
    expect(seen).toStrictEqual([1]);
    const after = await db.query<{ total: string }[]>(
      'SELECT COUNT(*) AS total FROM lich_hen WHERE benh_nhan_id = ?',
      [s.patientId],
    );
    expect(Number(after[0]?.total)).toBe(2);
  });

  it('LSH-23 cổng giả trả giá trị mẫu (kèm trường thừa) ⇒ JSON đúng hình dạng đã khai, không trường thừa', async () => {
    const s = await lf.scene();
    await bookConfirmed(s, s.patientId, '2026-11-10', CODE);
    const payments = new FakePaymentSummaryPort();
    const refunds = new FakeRefundPort();
    payments.findPaymentCall.returns({
      daThu: '50000.00',
      conPhaiThu: '0.00',
      giaoDich: [
        {
          phuongThuc: 'MoMo',
          soTien: '50000.00',
          thoiDiem: '2026-11-02T02:00:00.000Z',
          maGiaoDichCong: 'BI-MAT',
        } as unknown as {
          phuongThuc: 'MoMo';
          soTien: string;
          thoiDiem: string;
        },
      ],
    });
    refunds.findRefundCall.returns({
      soTien: '50000.00',
      trangThai: 'ThanhCong',
      thoiDiem: '2026-11-03T02:00:00.000Z',
    });
    const detail = await detailServiceWith(payments, refunds).detail(
      s.patientId,
      CODE,
    );
    expect(detail.thanhToan).toStrictEqual({
      daThu: '50000.00',
      conPhaiThu: '0.00',
      giaoDich: [
        {
          phuongThuc: 'MoMo',
          soTien: '50000.00',
          thoiDiem: '2026-11-02T02:00:00.000Z',
        },
      ],
    });
    expect(detail.hoanTien).toStrictEqual({
      soTien: '50000.00',
      trangThai: 'ThanhCong',
      thoiDiem: '2026-11-03T02:00:00.000Z',
    });
    expect(JSON.stringify(detail)).not.toContain('BI-MAT');
  });
});
