import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { toErrorResponse } from '../../common/errors/all-exceptions.filter.js';
import { AppException } from '../../common/errors/app.exception.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { ReceptionScopeRepository } from '../../rbac/reception-scope.repository.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import {
  NoopPaymentSummaryPort,
  type PaymentSummaryPort,
} from '../ports/payment.port.js';
import { AppointmentListFixtures } from '../testing/appointment-list-fixtures.js';
import {
  BOOKING_T0,
  BookingFixtures,
  HOLD_MINUTES,
} from '../testing/booking-fixtures.js';
import { FakePaymentSummaryPort } from '../testing/fake-ports.js';
import {
  CODES,
  OperationsListFixtures,
  PATIENT_ONE,
} from '../testing/operations-list-fixtures.js';
import type { OperationsAppointmentsQuery } from './operations-appointments.dto.js';
import { OperationsAppointmentsRepository } from './operations-appointments.repository.js';
import { OperationsAppointmentsService } from './operations-appointments.service.js';
import { ReceptionAppointmentsService } from './reception-appointments.service.js';

// Task B3 — danh sách và chi tiết lịch hẹn của LỄ TÂN ở tầng dịch vụ trên MySQL 8.4 THẬT (PLAN booking 7.5, 7.7, 7.9; TRACKING 3.17.3): phạm vi chi nhánh từ DB (DSV-01, QB-04, QB-10), ca không xem được ra
// cùng MỘT 404 (DSV-09), `conPhaiThu` qua cổng (DSV-10), `chuyenDuoc[]` theo ma trận và cửa sổ tiếp đón (CT-11, gồm ca thiếu cấu hình), hình dạng chi tiết (DSV-13). Truy vấn dùng chung (bộ lọc, `q`, sắp xếp):
// operations-appointments.int-spec.ts. HTTP thật: test/booking-reception-appointments.e2e-spec.ts. Mã DSV-13 là [đề xuất]. Dữ liệu giả (email đuôi example.com, SĐT minh hoạ).
// Đồng hồ ứng dụng giả = T0 (02/11/2026 08:00 giờ VN) rồi đặt lại từng ca bằng `vi.setSystemTime`.
let db: DataSource;
let fx: BookingFixtures;
let lf: AppointmentListFixtures;
let ofx: OperationsListFixtures;
let operations: OperationsAppointmentsService;
let scopes: ReceptionScopeService;
let configs: SystemConfigService;
let service: ReceptionAppointmentsService;

// Cổng THẬT của module (bản Noop), tắt cảnh báo để không tràn ra màn hình
function silentNoopPayments(): NoopPaymentSummaryPort {
  const payments = new NoopPaymentSummaryPort();
  payments.logger = { warn: vi.fn() };
  return payments;
}

const serviceWith = (payments: PaymentSummaryPort) =>
  new ReceptionAppointmentsService(db, scopes, operations, payments, configs);

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = new BookingFixtures(testDb);
  lf = new AppointmentListFixtures(fx, testDb);
  ofx = new OperationsListFixtures(fx, lf, testDb);
  operations = new OperationsAppointmentsService(
    testDb,
    new OperationsAppointmentsRepository(),
    new BranchAccessPolicy(),
  );
  scopes = new ReceptionScopeService(new ReceptionScopeRepository(testDb));
  configs = new SystemConfigService(new SystemConfigRepository(testDb));
  service = serviceWith(silentNoopPayments());
});

const ask = (
  query: Partial<OperationsAppointmentsQuery> = {},
): OperationsAppointmentsQuery => {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { ...query, page, pageSize, offset: (page - 1) * pageSize };
};
const idOf = (reception: { account: { taiKhoanId: string } }) =>
  reception.account.taiKhoanId;

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

const DETAIL_KEYS = [
  'bacSi',
  'chiNhanh',
  'chuyenDuoc',
  'chuyenKhoa',
  'conPhaiThu',
  'dichVu',
  'giaSnapshot',
  'hanThanhToan',
  'lyDoHuy',
  'lyDoKham',
  'maLichHen',
  'nguoiDat',
  'nguoiKham',
  'thoiGian',
  'tienCoc',
  'trangThai',
];

describe('DSV-01, QB-04, QB-10 phạm vi chi nhánh lấy từ DB', () => {
  it('DSV-01 mỗi Lễ tân chỉ thấy lịch của chi nhánh của mình, sắp theo giờ TĂNG dần; `chiNhanhId` của query (chi nhánh khác, id không tồn tại) bị bỏ qua', async () => {
    const w = await ofx.world();
    const a = await service.list(idOf(w.receptionA), ask());
    expect(a.items.map((item) => item.maLichHen)).toStrictEqual([
      CODES.a1,
      CODES.a2,
      CODES.a3,
      CODES.a4,
      CODES.a6,
      CODES.a7,
    ]);
    const b = await service.list(idOf(w.receptionB), ask());
    expect(b.items.map((item) => item.maLichHen)).toStrictEqual([CODES.b1]);
    for (const chiNhanhId of [w.branchB.chiNhanhId, '999999999'])
      expect(
        await service.list(idOf(w.receptionA), ask({ chiNhanhId })),
      ).toStrictEqual(a);
  });

  it('QB-10 đổi chi nhánh của Lễ tân giữa hai request: request sau thấy ngay chi nhánh mới (không cache); khoá tài khoản hoặc không phải Lễ tân ⇒ 403 KHONG_DU_QUYEN và không đọc lịch nào', async () => {
    const w = await ofx.world();
    const before = await service.list(idOf(w.receptionA), ask());
    expect(before.total).toBe(6);
    await db.query(
      'UPDATE le_tan SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.branchB.chiNhanhId, idOf(w.receptionA)],
    );
    const after = await service.list(idOf(w.receptionA), ask());
    expect(after.items.map((item) => item.maLichHen)).toStrictEqual([CODES.b1]);

    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [idOf(w.receptionB)],
    );
    for (const accountId of [idOf(w.receptionB), w.oneId]) {
      const failure = await rejection(service.list(accountId, ask()));
      expect(failure.getStatus()).toBe(403);
      expect(failure.getResponse()).toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });
      expect(
        (await rejection(service.detail(accountId, CODES.a1))).getStatus(),
      ).toBe(403);
    }
  });
});

describe('DSV-09, QB-04 chi tiết: ca không xem được', () => {
  it('DSV-09 lịch CHI NHÁNH KHÁC và mã không tồn tại: cùng một 404 KHONG_TIM_THAY, thân giống từng ký tự; lịch của chính chi nhánh vẫn 200', async () => {
    const w = await ofx.world();
    const outside = await rejection(
      service.detail(idOf(w.receptionA), CODES.b1),
    );
    const missing = await rejection(
      service.detail(idOf(w.receptionA), CODES.missing),
    );
    expect(outside.getStatus()).toBe(404);
    expect(bodyOf(outside)).toBe(bodyOf(missing));
    expect(bodyOf(outside)).toContain('KHONG_TIM_THAY');
    // Phía bên kia: B xem được lịch của B, không xem được lịch của A
    expect((await service.detail(idOf(w.receptionB), CODES.b1)).maLichHen).toBe(
      CODES.b1,
    );
    expect(
      bodyOf(await rejection(service.detail(idOf(w.receptionB), CODES.a1))),
    ).toBe(bodyOf(missing));
    expect((await service.detail(idOf(w.receptionA), CODES.a1)).maLichHen).toBe(
      CODES.a1,
    );
  });

  it('DSV-09, DSV-12 lịch DaDoiLich của chính chi nhánh: nhân sự vẫn xem được chi tiết (khác Bệnh nhân)', async () => {
    const w = await ofx.world();
    const detail = await service.detail(idOf(w.receptionA), CODES.a5);
    expect(detail.trangThai).toBe('DaDoiLich');
    expect(detail.chuyenDuoc).toStrictEqual([]);
    expect(detail.conPhaiThu).toBeNull();
  });
});

describe('DSV-13 hình dạng chi tiết', () => {
  it('DSV-13 đúng MƯỜI SÁU khoá; lịch bản thân: lyDoKham, hanThanhToan null, nguoiDat và nguoiKham đúng; không `lichHenId`, `thanhToan`, `hoanTien`, `thoiGianMayChu`', async () => {
    const w = await ofx.world();
    const detail = await service.detail(idOf(w.receptionA), CODES.a1);
    expect(Object.keys(detail).sort()).toStrictEqual(DETAIL_KEYS);
    expect(detail).toMatchObject({
      maLichHen: CODES.a1,
      trangThai: 'DaXacNhan',
      bacSi: 'Bác Sĩ Một',
      chiNhanh: w.branchA.ten,
      nguoiDat: {
        hoTen: PATIENT_ONE.hoTen,
        soDienThoai: PATIENT_ONE.soDienThoai,
      },
      nguoiKham: { hoTen: PATIENT_ONE.hoTen, laBanThan: true },
      giaSnapshot: '100000.00',
      tienCoc: '0.00',
      lyDoKham: 'Đau đầu ba ngày',
      lyDoHuy: null,
      hanThanhToan: null,
    });
    expect(detail.thoiGian).toBe(w.apps.a1.thoiGian.toISOString());
    // Khoá đã khớp ĐÚNG danh sách ở trên (không `lichHenId`, `thanhToan`, `hoanTien`, `thoiGianMayChu`); giá trị không có email
    expect(JSON.stringify(detail)).not.toContain('@');
  });

  it('DSV-13 lịch ChoThanhToan: `hanThanhToan` là ISO; lịch DaHuy: `lyDoHuy` là chữ của người huỷ; lịch người thân: người khám là người thân, người đặt vẫn là tài khoản đặt', async () => {
    const w = await ofx.world();
    const pending = await service.detail(idOf(w.receptionA), CODES.a2);
    expect(pending.hanThanhToan).toBe(
      new Date(BOOKING_T0.getTime() + HOLD_MINUTES * 60 * 1000).toISOString(),
    );
    expect(pending.nguoiKham.laBanThan).toBe(false);
    expect(pending.nguoiDat.hoTen).toBe(PATIENT_ONE.hoTen);
    const cancelled = await service.detail(idOf(w.receptionA), CODES.a4);
    expect(cancelled.lyDoHuy).toBe('Fixture huỷ lịch');
  });
});

describe('DSV-10 conPhaiThu qua cổng thanh toán', () => {
  it('DSV-10 bản `Noop` THẬT (chưa thu đồng nào): `DaXacNhan` có `conPhaiThu` = giá; giá 0 ⇒ "0.00"; mọi trạng thái khác ⇒ null', async () => {
    const w = await ofx.world();
    const receptionId = idOf(w.receptionA);
    expect((await service.detail(receptionId, CODES.a1)).conPhaiThu).toBe(
      '100000.00',
    );
    const free = await ofx.book(w.doctorA1.profile, 'DaXacNhan', {
      patientId: w.oneId,
      ngay: '2026-11-20',
      giaSnapshot: '0.00',
    });
    expect((await service.detail(receptionId, free.maLichHen)).conPhaiThu).toBe(
      '0.00',
    );
    for (const code of [CODES.a2, CODES.a3, CODES.a4, CODES.a5, CODES.a6])
      expect(
        (await service.detail(receptionId, code)).conPhaiThu,
        code,
      ).toBeNull();
  });

  it('DSV-10 cổng giả: giá trị của cổng ra nguyên dạng chuỗi; cổng chỉ được hỏi cho DaXacNhan, với đúng `lichHenId` và manager của giao dịch ĐANG MỞ (không phải manager chung của DataSource)', async () => {
    const w = await ofx.world();
    const payments = new FakePaymentSummaryPort().remaining(
      { [w.apps.a1.lichHenId]: '35000.50' },
      '0.00',
    );
    const inTransaction: (boolean | undefined)[] = [];
    payments.remainingCall.onCall((em) => {
      inTransaction.push(em.queryRunner?.isTransactionActive);
    });
    const faked = serviceWith(payments);
    expect((await faked.detail(idOf(w.receptionA), CODES.a1)).conPhaiThu).toBe(
      '35000.50',
    );
    for (const code of [CODES.a2, CODES.a3, CODES.a4, CODES.a6])
      await faked.detail(idOf(w.receptionA), code);
    expect(payments.remainingCall.count).toBe(1);
    const em = payments.remainingCall.calls[0]?.[0] as EntityManager;
    expect(em).not.toBe(db.manager);
    expect(inTransaction).toStrictEqual([true]);
    expect(payments.remainingCall.calls[0]?.[1]).toBe(w.apps.a1.lichHenId);
  });
});

// Mốc đối chiếu của CT-11: lịch lúc 09:00 giờ VN ngày 10/11/2026, cửa sổ tiếp đón 30 phút trước và 15 phút sau (cấu hình mặc định của `BookingFixtures.systemConfig`)
const APPOINTMENT_AT = new Date('2026-11-10T02:00:00.000Z');
const MIN = 60_000;
const CLOCKS = {
  truocCuaSo: -30 * MIN - 1000,
  dungMocDau: -30 * MIN,
  dungMocCuoi: 15 * MIN,
  sauCuaSo: 15 * MIN + 1000,
} as const;
type Clock = keyof typeof CLOCKS;
const ALL_STATES: TrangThaiLichHen[] = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'DaHuy',
  'DaDoiLich',
  'VangMat',
];

// Bảng kỳ vọng VIẾT TAY (không gọi lại ma trận), theo thứ tự `TRANG_THAI_LICH_HEN`. `DaXacNhan` chia theo còn phải thu và theo cấu hình.
const FIXED: Partial<Record<TrangThaiLichHen, TrangThaiLichHen[]>> = {
  ChoThanhToan: ['DaHuy'],
  DaTiepDon: [],
  HoanThanh: [],
  DaHuy: [],
  DaDoiLich: [],
  VangMat: [],
};
const CONFIRMED_PAID: Record<Clock, TrangThaiLichHen[]> = {
  truocCuaSo: ['DaHuy'],
  dungMocDau: ['DaTiepDon', 'DaHuy'],
  dungMocCuoi: ['DaTiepDon', 'DaHuy'],
  sauCuaSo: ['DaHuy', 'VangMat'],
};
const CONFIRMED_UNPAID: Record<Clock, TrangThaiLichHen[]> = {
  ...CONFIRMED_PAID,
  dungMocDau: ['DaHuy'],
  dungMocCuoi: ['DaHuy'],
};
const CONFIRMED_NO_CONFIG: Record<Clock, TrangThaiLichHen[]> = {
  truocCuaSo: ['DaHuy'],
  dungMocDau: ['DaHuy'],
  dungMocCuoi: ['DaHuy'],
  sauCuaSo: ['DaHuy'],
};

describe('CT-11 chuyenDuoc[] khớp ma trận theo trạng thái × thời điểm × còn phải thu × cấu hình', () => {
  // Bảy lịch, mỗi trạng thái một lịch lúc 09:00 ngày 10/11 (giá 0: đã thu đủ với bản Noop), thêm một lịch DaXacNhan CÓ giá (còn phải thu)
  async function sevenAt9() {
    const w = await ofx.world();
    const at9 = { patientId: w.twoId, ngay: '2026-11-10', gio: '09:00:00' };
    const codes: Record<string, string> = {};
    for (const state of ALL_STATES)
      codes[state] = (
        await ofx.book(w.doctorA1.profile, state, {
          ...at9,
          giaSnapshot: '0.00',
        })
      ).maLichHen;
    const owing = await ofx.book(w.doctorA1.profile, 'DaXacNhan', at9);
    return { w, codes, owing: owing.maLichHen };
  }

  const targetsAt = async (receptionId: string, code: string, clock: Clock) => {
    vi.setSystemTime(new Date(APPOINTMENT_AT.getTime() + CLOCKS[clock]));
    return (await service.detail(receptionId, code)).chuyenDuoc;
  };

  it('CT-11 có cấu hình: bảy trạng thái × bốn thời điểm (trước cửa sổ 1 giây, đúng mốc đầu, đúng mốc cuối, sau cửa sổ 1 giây), đã thu đủ và còn phải thu', async () => {
    const { w, codes, owing } = await sevenAt9();
    await fx.systemConfig();
    const receptionId = idOf(w.receptionA);
    for (const clock of Object.keys(CLOCKS) as Clock[]) {
      for (const state of ALL_STATES) {
        const expected =
          state === 'DaXacNhan' ? CONFIRMED_PAID[clock] : FIXED[state];
        expect(
          await targetsAt(receptionId, codes[state] ?? '', clock),
          `${state} ${clock}`,
        ).toStrictEqual(expected);
      }
      expect(
        await targetsAt(receptionId, owing, clock),
        `DaXacNhan còn phải thu ${clock}`,
      ).toStrictEqual(CONFIRMED_UNPAID[clock]);
    }
  });

  it('CT-11 (thiếu cấu hình) thiếu `cau_hinh_he_thong`: KHÔNG lỗi (không 409); `DaXacNhan` chỉ còn `DaHuy` ở mọi thời điểm, các trạng thái khác như bảng', async () => {
    const { w, codes } = await sevenAt9();
    const receptionId = idOf(w.receptionA);
    for (const clock of Object.keys(CLOCKS) as Clock[]) {
      expect(
        await targetsAt(receptionId, codes['DaXacNhan'] ?? '', clock),
        clock,
      ).toStrictEqual(CONFIRMED_NO_CONFIG[clock]);
      expect(
        await targetsAt(receptionId, codes['ChoThanhToan'] ?? '', clock),
      ).toStrictEqual(['DaHuy']);
    }
  });

  it('CT-11 cấu hình đổi thì cửa sổ đổi theo ở request sau (không cache): trước 10 phút, sau 0 phút', async () => {
    const { w, codes } = await sevenAt9();
    await fx.systemConfig({ checkInTruocPhut: 10, checkInSauPhut: 0 });
    const receptionId = idOf(w.receptionA);
    const code = codes['DaXacNhan'] ?? '';
    vi.setSystemTime(new Date(APPOINTMENT_AT.getTime() - 11 * MIN));
    expect((await service.detail(receptionId, code)).chuyenDuoc).toStrictEqual([
      'DaHuy',
    ]);
    vi.setSystemTime(new Date(APPOINTMENT_AT.getTime() - 10 * MIN));
    expect((await service.detail(receptionId, code)).chuyenDuoc).toStrictEqual([
      'DaTiepDon',
      'DaHuy',
    ]);
    vi.setSystemTime(new Date(APPOINTMENT_AT.getTime() + 1000));
    expect((await service.detail(receptionId, code)).chuyenDuoc).toStrictEqual([
      'DaHuy',
      'VangMat',
    ]);
  });
});
