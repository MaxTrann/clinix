import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  NoopPaymentSummaryPort,
  type PaymentSummaryPort,
} from '../ports/payment.port.js';
import {
  ADMIN_DETAIL_KEYS,
  ADMIN_ITEM_KEYS,
  AdminListFixtures,
  appErrorOf,
  errorBodyText,
} from '../testing/admin-list-fixtures.js';
import { AppointmentListFixtures } from '../testing/appointment-list-fixtures.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { FakePaymentSummaryPort } from '../testing/fake-ports.js';
import {
  CODES,
  OperationsListFixtures,
  PATIENT_ONE,
  PATIENT_TWO,
  RELATIVE_NAME,
} from '../testing/operations-list-fixtures.js';
import {
  collectKeys,
  collectStrings,
  FORBIDDEN_KEY,
} from '../testing/response-keys.js';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../testing/statement-recorder.js';
import { AdminAppointmentsService } from './admin-appointments.service.js';
import { AppointmentHistoryReader } from './appointment-history.reader.js';
import type { OperationsAppointmentsQuery } from './operations-appointments.dto.js';
import { OperationsAppointmentsRepository } from './operations-appointments.repository.js';
import { OperationsAppointmentsService } from './operations-appointments.service.js';

// Task B4 — danh sách và chi tiết lịch hẹn của QUẢN TRỊ VIÊN ở tầng dịch vụ trên MySQL 8.4 THẬT (PLAN booking 7.7, 7.9, 7.39; TRACKING 3.33.3): phạm vi `ChiNhanh` và `ToanHeThong` (DSV-02, DSV-03), thứ tự
// GIẢM dần (ADL-01), 404 cùng thân và nhật ký không bị đọc khi ngoài phạm vi (DSV-09, QB-05), hình dạng 17 khoá (ADL-02), `chuyenDuoc[]` theo ma trận Q24 khi KHÔNG có cấu hình hệ thống (ADL-03), `conPhaiThu` qua cổng
// (ADL-04), panel trong cùng MỘT giao dịch (LSD-02, LSD-03), phân trang (ADL-09). Truy vấn dùng chung (bộ lọc, `q`, sắp xếp) đã kiểm đủ ở operations-appointments.int-spec.ts (B3): ở đây mỗi mã một ca qua dịch vụ
// Quản trị viên, không lặp ma trận. Bộ đọc nhật ký: appointment-history.reader.int-spec.ts. HTTP thật: test/booking-admin-appointments.e2e-spec.ts. Dữ liệu giả (email đuôi example.com, SĐT minh hoạ).
// Đồng hồ ứng dụng giả = T0 (02/11/2026 08:00 giờ VN); danh sách không dùng giờ hiện tại.
let db: DataSource;
let fx: BookingFixtures;
let lf: AppointmentListFixtures;
let ofx: OperationsListFixtures;
let afx: AdminListFixtures;
let operations: OperationsAppointmentsService;
let service: AdminAppointmentsService;

// Cổng THẬT của module (bản Noop), tắt cảnh báo để không tràn ra màn hình
function silentNoopPayments(): NoopPaymentSummaryPort {
  const payments = new NoopPaymentSummaryPort();
  payments.logger = { warn: vi.fn() };
  return payments;
}

const serviceWith = (payments: PaymentSummaryPort) =>
  new AdminAppointmentsService(
    db,
    operations,
    payments,
    new AppointmentHistoryReader(),
  );

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = new BookingFixtures(testDb);
  lf = new AppointmentListFixtures(fx, testDb);
  ofx = new OperationsListFixtures(fx, lf, testDb);
  afx = new AdminListFixtures(fx, ofx, testDb);
  operations = new OperationsAppointmentsService(
    testDb,
    new OperationsAppointmentsRepository(),
    new BranchAccessPolicy(),
  );
  service = serviceWith(silentNoopPayments());
});

const ALL: AdminScope = { kind: 'ToanHeThong' };
const within = (branch: { chiNhanhId: string }): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId: branch.chiNhanhId,
});
const ask = (
  query: Partial<OperationsAppointmentsQuery> = {},
): OperationsAppointmentsQuery => {
  const { page = 1, pageSize = 20 } = query;
  return { ...query, page, pageSize, offset: (page - 1) * pageSize };
};
const codes = (page: { items: { maLichHen: string }[] }) =>
  page.items.map((item) => item.maLichHen);

// Thứ tự GIẢM dần của sáu lịch hiển thị ở chi nhánh A (bỏ a5 DaDoiLich): a7 15/11, a6 14/11, a4 12/11, a3 11/11, a2 10/11 08:30, a1 10/11 08:00
const DESC_A = [CODES.a7, CODES.a6, CODES.a4, CODES.a3, CODES.a2, CODES.a1];
// Toàn hệ thống: thêm b1 (10/11 08:00, CÙNG giờ với a1 nhưng `lich_hen_id` lớn hơn ⇒ đứng TRƯỚC a1 khi giảm dần)
const DESC_ALL = [
  CODES.a7,
  CODES.a6,
  CODES.a4,
  CODES.a3,
  CODES.a2,
  CODES.b1,
  CODES.a1,
];

describe('DSV-02, DSV-03, ADL-01 phạm vi và thứ tự giảm dần', () => {
  it('DSV-02, ADL-01 Quản trị viên Chi nhánh chỉ thấy lịch của chi nhánh được gán, sắp GIẢM dần; `chiNhanhId` của query (chi nhánh khác, id không tồn tại) bị BỎ QUA', async () => {
    const w = await afx.world();
    const a = await service.list(within(w.branchA), ask());
    expect(codes(a)).toStrictEqual(DESC_A);
    expect(a.total).toBe(6);
    expect(codes(await service.list(within(w.branchB), ask()))).toStrictEqual([
      CODES.b1,
    ]);
    for (const chiNhanhId of [w.branchB.chiNhanhId, '999999999'])
      expect(
        await service.list(within(w.branchA), ask({ chiNhanhId })),
      ).toStrictEqual(a);
    expect(
      codes(
        await service.list(
          within(w.branchB),
          ask({ chiNhanhId: w.branchA.chiNhanhId }),
        ),
      ),
    ).toStrictEqual([CODES.b1]);
  });

  it('DSV-03, ADL-01 Toàn hệ thống: không `chiNhanhId` thấy MỌI chi nhánh (cùng giờ thì `lich_hen_id` giảm); có `chiNhanhId` thì chỉ chi nhánh đó; chi nhánh không tồn tại ⇒ rỗng, không lỗi', async () => {
    const w = await afx.world();
    const all = await service.list(ALL, ask());
    expect(codes(all)).toStrictEqual(DESC_ALL);
    expect(all.total).toBe(7);
    expect(
      codes(await service.list(ALL, ask({ chiNhanhId: w.branchA.chiNhanhId }))),
    ).toStrictEqual(DESC_A);
    expect(
      codes(await service.list(ALL, ask({ chiNhanhId: w.branchB.chiNhanhId }))),
    ).toStrictEqual([CODES.b1]);
    expect(
      await service.list(ALL, ask({ chiNhanhId: '999999999' })),
    ).toStrictEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('DSV-04, DSV-15 bộ lọc của dịch vụ dùng chung hoạt động với phạm vi Quản trị viên: bác sĩ, chuyên khoa, dịch vụ, trạng thái, khoảng ngày (giảm dần)', async () => {
    const w = await afx.world();
    const a2 = w.doctorA2;
    expect(
      codes(await service.list(ALL, ask({ bacSiId: a2.account.taiKhoanId }))),
    ).toStrictEqual([CODES.a7, CODES.a4, CODES.a3]);
    expect(
      codes(
        await service.list(
          ALL,
          ask({
            chuyenKhoaId: a2.profile.chuyenKhoaId,
            dichVuKhamId: a2.profile.dichVuKhamId,
            trangThai: ['DaHuy', 'HoanThanh'],
          }),
        ),
      ),
    ).toStrictEqual([CODES.a4, CODES.a3]);
    expect(
      codes(
        await service.list(
          ALL,
          ask({ tuNgay: '2026-11-11', denNgay: '2026-11-12' }),
        ),
      ),
    ).toStrictEqual([CODES.a4, CODES.a3]);
  });

  it('DSV-07, DSV-12 `q` theo mã chữ thường và SĐT người đặt; mặc định KHÔNG có DaDoiLich, `trangThai=DaDoiLich` hiện đúng dòng đó', async () => {
    await afx.world();
    expect(
      codes(await service.list(ALL, ask({ q: CODES.a3.toLowerCase() }))),
    ).toStrictEqual([CODES.a3]);
    expect(
      codes(await service.list(ALL, ask({ q: PATIENT_TWO.soDienThoai }))),
    ).toStrictEqual([CODES.a6, CODES.a4, CODES.a3]);
    expect(codes(await service.list(ALL, ask()))).not.toContain(CODES.a5);
    expect(
      codes(await service.list(ALL, ask({ trangThai: ['DaDoiLich'] }))),
    ).toStrictEqual([CODES.a5]);
  });

  it('DSV-05, ADL-09 chi nhánh chưa có lịch ⇒ 200 rỗng; trang vượt cuối và `page` cực lớn ⇒ rỗng với `total` đúng, không lỗi MySQL', async () => {
    const empty = await ofx.branchWith('Bác Sĩ Trống');
    await afx.world();
    expect(
      await service.list(ALL, ask({ chiNhanhId: empty.branch.chiNhanhId })),
    ).toStrictEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(
      codes(await service.list(ALL, ask({ page: 4, pageSize: 2 }))),
    ).toStrictEqual([CODES.a1]);
    const beyond = await service.list(ALL, ask({ page: 5, pageSize: 2 }));
    expect(beyond).toStrictEqual({ items: [], total: 7, page: 5, pageSize: 2 });
    const huge = await service.list(
      ALL,
      ask({ page: 9007199254740991, pageSize: 100 }),
    );
    expect(huge.items).toStrictEqual([]);
    expect(huge.total).toBe(7);
  });

  it('ADL-02, DSV-13 mỗi dòng đúng 11 khoá; lịch người thân: người khám là người thân, người đặt là tài khoản đặt (không lẫn); không khoá lộ id, email, băm, ngày sinh', async () => {
    await afx.world();
    const page = await service.list(ALL, ask());
    for (const item of page.items)
      expect(Object.keys(item).sort()).toStrictEqual(ADMIN_ITEM_KEYS);
    expect(
      collectKeys(page).filter((key) => FORBIDDEN_KEY.test(key)),
    ).toStrictEqual([]);
    const relative = page.items.find((item) => item.maLichHen === CODES.a2);
    expect(relative?.nguoiKham).toStrictEqual({
      hoTen: RELATIVE_NAME,
      laBanThan: false,
    });
    expect(relative?.nguoiDat).toStrictEqual({
      hoTen: PATIENT_ONE.hoTen,
      soDienThoai: PATIENT_ONE.soDienThoai,
    });
    const phones = new Set(
      collectStrings(page).filter((value) => /^0\d{9}$/.test(value)),
    );
    expect([...phones].sort()).toStrictEqual(
      [PATIENT_ONE.soDienThoai, PATIENT_TWO.soDienThoai].sort(),
    );
  });
});

describe('DSV-09, QB-05 chi tiết ngoài phạm vi', () => {
  it('DSV-09, QB-05 lịch CHI NHÁNH KHÁC và mã không tồn tại: cùng một 404 KHONG_TIM_THAY, thân giống từng ký tự (không chứa mã); Toàn hệ thống xem được cả hai chi nhánh', async () => {
    const w = await afx.world();
    const outside = await appErrorOf(
      service.detail(within(w.branchA), CODES.b1),
    );
    const missing = await appErrorOf(
      service.detail(within(w.branchA), CODES.missing),
    );
    expect(outside.getStatus()).toBe(404);
    expect(errorBodyText(outside)).toBe(errorBodyText(missing));
    expect(errorBodyText(outside)).toContain('KHONG_TIM_THAY');
    expect(errorBodyText(outside)).not.toContain(CODES.b1);
    expect(
      errorBodyText(
        await appErrorOf(service.detail(within(w.branchB), CODES.a1)),
      ),
    ).toBe(errorBodyText(missing));
    expect((await service.detail(ALL, CODES.b1)).maLichHen).toBe(CODES.b1);
    expect((await service.detail(ALL, CODES.a1)).maLichHen).toBe(CODES.a1);
    expect((await service.detail(within(w.branchA), CODES.a1)).maLichHen).toBe(
      CODES.a1,
    );
  });

  it('QB-05 lịch ngoài phạm vi: KHÔNG đọc nhật ký hành động (câu `nhat_ky_hanh_dong` chỉ chạy khi lịch đã qua phạm vi), không câu ghi nào', async () => {
    const w = await afx.world();
    const outside = recordStatements(db);
    await appErrorOf(service.detail(within(w.branchA), CODES.b1));
    expect(outside.some((sql) => /nhat_ky_hanh_dong/.test(sql))).toBe(false);
    expect(outside.some((sql) => /thoi_diem_huy/.test(sql))).toBe(false);
    expect(outside.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toStrictEqual(
      [],
    );
  });

  it('DSV-09, DSV-12 lịch DaDoiLich của chính chi nhánh: nhân sự vẫn xem được chi tiết; `chuyenDuoc` rỗng, `conPhaiThu` null', async () => {
    const w = await afx.world();
    const detail = await service.detail(within(w.branchA), CODES.a5);
    expect(detail.trangThai).toBe('DaDoiLich');
    expect(detail.chuyenDuoc).toStrictEqual([]);
    expect(detail.conPhaiThu).toBeNull();
  });
});

describe('ADL-02, ADL-03, ADL-04 chi tiết', () => {
  it('ADL-02 đúng 17 khoá; lịch bản thân: giá trị đúng, `lichSuTrangThai` có mục TaoLich; không `lichHenId`, `thanhToan`, `hoanTien`, `thoiGianMayChu`, email', async () => {
    const w = await afx.world();
    const detail = await service.detail(within(w.branchA), CODES.a1);
    expect(Object.keys(detail).sort()).toStrictEqual(ADMIN_DETAIL_KEYS);
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
      lyDoKham: 'Đau đầu ba ngày',
      giaSnapshot: '100000.00',
      tienCoc: '0.00',
    });
    expect(detail.lichSuTrangThai).toHaveLength(1);
    expect(detail.lichSuTrangThai[0]?.loai).toBe('TaoLich');
    expect(JSON.stringify(detail)).not.toContain('@');
    expect(
      collectKeys(detail).filter((key) => FORBIDDEN_KEY.test(key)),
    ).toStrictEqual([]);
  });

  it('ADL-03 chuyenDuoc đúng ma trận Q24 cho cả bảy trạng thái nguồn, khi CHƯA có dòng `cau_hinh_he_thong` nào và không cổng thanh toán giả', async () => {
    const w = await afx.world();
    const tiepDon = await ofx.book(w.doctorA1.profile, 'DaTiepDon', {
      patientId: w.twoId,
      ngay: '2026-11-20',
    });
    const config = await db.query<{ total: string }[]>(
      'SELECT COUNT(*) AS total FROM cau_hinh_he_thong',
    );
    expect(Number(config[0]?.total)).toBe(0);
    const targets = async (code: string) =>
      (await service.detail(ALL, code)).chuyenDuoc;
    expect(await targets(CODES.a2)).toStrictEqual(['DaHuy']);
    expect(await targets(CODES.a1)).toStrictEqual([
      'DaTiepDon',
      'DaHuy',
      'VangMat',
    ]);
    expect(await targets(tiepDon.maLichHen)).toStrictEqual([
      'DaXacNhan',
      'DaHuy',
      'VangMat',
    ]);
    expect(await targets(CODES.a6)).toStrictEqual([
      'DaXacNhan',
      'DaTiepDon',
      'DaHuy',
    ]);
    for (const code of [CODES.a3, CODES.a4, CODES.a5])
      expect(await targets(code), code).toStrictEqual([]);
  });

  it('ADL-04 bản `Noop` THẬT (chưa thu đồng nào): `DaXacNhan` có `conPhaiThu` = giá, giá 0 ⇒ "0.00"; mọi trạng thái khác null', async () => {
    const w = await afx.world();
    expect((await service.detail(ALL, CODES.a1)).conPhaiThu).toBe('100000.00');
    const free = await ofx.book(w.doctorA1.profile, 'DaXacNhan', {
      patientId: w.oneId,
      ngay: '2026-11-20',
      giaSnapshot: '0.00',
    });
    expect((await service.detail(ALL, free.maLichHen)).conPhaiThu).toBe('0.00');
    for (const code of [CODES.a2, CODES.a3, CODES.a4, CODES.a5, CODES.a6])
      expect((await service.detail(ALL, code)).conPhaiThu, code).toBeNull();
  });

  it('ADL-04 cổng giả: giá trị của cổng ra nguyên dạng chuỗi; cổng chỉ được hỏi MỘT lần (cho DaXacNhan), với đúng `lichHenId`, trong giao dịch ĐANG MỞ (không phải manager chung)', async () => {
    const w = await afx.world();
    const payments = new FakePaymentSummaryPort().remaining(
      { [w.apps.a1.lichHenId]: '35000.50' },
      '0.00',
    );
    const active: (boolean | undefined)[] = [];
    payments.remainingCall.onCall((em: EntityManager) => {
      active.push(em.queryRunner?.isTransactionActive);
    });
    const faked = serviceWith(payments);
    const results: Record<string, string | null> = {};
    for (const code of [CODES.a1, CODES.a2, CODES.a3, CODES.a4, CODES.a6])
      results[code] = (await faked.detail(ALL, code)).conPhaiThu;
    expect(results).toStrictEqual({
      [CODES.a1]: '35000.50',
      [CODES.a2]: null,
      [CODES.a3]: null,
      [CODES.a4]: null,
      [CODES.a6]: null,
    });
    expect(payments.remainingCall.count).toBe(1);
    expect(payments.remainingCall.calls[0]?.[1]).toBe(w.apps.a1.lichHenId);
    expect(active).toStrictEqual([true]);
  });
});

describe('LSD-02, LSD-03 panel trong cùng một giao dịch chỉ đọc', () => {
  it('chi tiết kèm panel dựng từ ba nguồn: lịch override rồi bị huỷ khác có TaoLich, mục override và HuyLich theo thứ tự; lịch DaHuy chỉ có mốc huỷ', async () => {
    const w = await afx.world();
    const actorId = w.systemAdmin.account.taiKhoanId;
    await afx.setMilestones(w.apps.a1.lichHenId, {
      tao: '2026-11-01 08:00:00',
    });
    await afx.override({
      lichHenId: w.apps.a1.lichHenId,
      chiNhanhId: w.branchA.chiNhanhId,
      actorId,
      at: '2026-11-03 09:00:00',
      from: 'DaXacNhan',
      to: 'VangMat',
      lyDo: 'Bệnh nhân không đến',
    });
    const a1 = await service.detail(within(w.branchA), CODES.a1);
    expect(a1.lichSuTrangThai.map((entry) => entry.loai)).toStrictEqual([
      'TaoLich',
      'OverrideLichHen',
    ]);
    expect(a1.lichSuTrangThai[1]).toMatchObject({
      tuTrangThai: 'DaXacNhan',
      denTrangThai: 'VangMat',
      lyDo: 'Bệnh nhân không đến',
    });
    await afx.setMilestones(w.apps.a4.lichHenId, {
      huy: '2026-11-12 10:00:00',
      lyDoHuy: 'Bệnh nhân hủy',
    });
    const a4 = await service.detail(within(w.branchA), CODES.a4);
    expect(a4.lichSuTrangThai.map((entry) => entry.loai)).toStrictEqual([
      'TaoLich',
      'HuyLich',
    ]);
  });

  it('LSD-03 hàng chi tiết, cổng và panel cùng MỘT giao dịch: đúng một START TRANSACTION, chỉ SELECT, không câu ghi hay khoá', async () => {
    const w = await afx.world();
    const seen = recordStatements(db);
    await service.detail(within(w.branchA), CODES.a3);
    expect(seen.filter((sql) => /START TRANSACTION/i.test(sql))).toHaveLength(
      1,
    );
    expect(seen.filter((sql) => /^\s*SELECT\b/i.test(sql))).toHaveLength(3);
    expect(seen.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toStrictEqual([]);
  });
});
