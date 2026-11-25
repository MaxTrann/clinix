import { vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../../appointments/appointments.constants.js';
import { BookingNotifier } from '../../appointments/notifications/booking-notifier.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ExamNotifier } from '../../doctor/examination/notifications/exam-notifier.js';
import {
  LEAVE_EVENTS,
  LeaveNotifier,
} from '../../doctor/notifications/leave-notifier.js';
import { TopupNotifier } from '../../payment/topup/topup-notifier.js';
import { RefundNotifier } from '../../wallet/refund/refund-notifier.js';
import { WithdrawalNotifier } from '../../wallet/withdrawal/withdrawal-notifier.js';
import { BRANCH_CHANGE_EVENTS } from '../branch-change-events.js';
import { BranchChangeNotifier } from '../branch-change-notifier.js';
import { NotificationListQueryDto } from './notification-center.dto.js';
import {
  LIST_FILTERED_SQL,
  LIST_SQL,
  MARK_READ_SQL,
  NotificationCenterRepository,
  UNREAD_COUNT_SQL,
} from './notification-center.repository.js';
import { NotificationCenterService } from './notification-center.service.js';

// notification B2 — Trung tâm thông báo qua service THẬT trên MySQL 8.4: TTB-01…TTB-14, TTB-16, QTB-03, QTB-05, HTB-04.
// Phần HTTP (khoá phản hồi, 400, 401, 404 cùng thân, Cache-Control, năm vai trò qua token) ở test/notification-center.e2e-spec.ts.
let db: DataSource;
let fx: AdminFixtures;
let service: NotificationCenterService;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
  service = new NotificationCenterService(
    d,
    new NotificationCenterRepository(),
  );
});

const query = (over: Partial<NotificationListQueryDto> = {}) =>
  Object.assign(new NotificationListQueryDto(), over);

/** Chèn một thông báo (khoá ngoại tới tài khoản thật); trả id. */
async function insertNotice(
  taiKhoanId: string,
  over: {
    loai?: string;
    noiDung?: string;
    daDoc?: boolean;
    at?: string;
    lichHenId?: string | null;
  } = {},
): Promise<string> {
  const result = (await db.query(
    'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, trang_thai_doc, lich_hen_id, thoi_diem_tao) VALUES (?, ?, ?, ?, ?, ?)',
    [
      taiKhoanId,
      over.noiDung ?? 'Nội dung',
      over.loai ?? 'NapViThanhCong',
      over.daDoc ? 1 : 0,
      over.lichHenId ?? null,
      over.at ?? '2026-11-20 08:00:00',
    ],
  )) as { insertId: number };
  return String(insertId(result));
}
const insertId = (r: { insertId: number }) => r.insertId;

async function rowOf(id: string) {
  const [row] = (await db.query(
    'SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, trang_thai_doc AS daDoc FROM thong_bao WHERE thong_bao_id = ?',
    [id],
  )) as { taiKhoanId: string; daDoc: number }[];
  return row;
}

/** Lỗi `AppException` mà lời gọi ném; chạy thành công thì test đỏ. */
async function appError(work: Promise<unknown>): Promise<AppException> {
  const error = await work.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppException);
  return error as AppException;
}

describe('Trung tâm thông báo trên MySQL thật', () => {
  it('TTB-01: mới nhất trước, đủ tám khoá, total, page, pageSize, soChuaDoc đúng; không khoá nội bộ', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    for (const [i, daDoc] of [false, true, false, true, false].entries())
      await insertNotice(a, { daDoc, at: `2026-11-2${i} 08:00:00` });

    const page = await service.list(a, query());
    expect(page).toMatchObject({
      total: 5,
      page: 1,
      pageSize: 20,
      soChuaDoc: 3,
    });
    expect(page.items.map((x) => x.thoiDiemTao)).toEqual(
      [4, 3, 2, 1, 0].map((i) =>
        new Date(`2026-11-2${i}T08:00:00+07:00`).toISOString(),
      ),
    );
    for (const item of page.items)
      expect(Object.keys(item).sort()).toEqual([
        'daDoc',
        'id',
        'lienKet',
        'loai',
        'nhom',
        'noiDung',
        'thoiDiemTao',
        'tieuDe',
      ]);
  });

  it('TTB-02: ba bộ lọc; total theo bộ lọc, soChuaDoc luôn là tổng chưa đọc', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    for (const daDoc of [false, false, true]) await insertNotice(a, { daDoc });
    const unread = await service.list(a, query({ trangThaiDoc: 'chua-doc' }));
    const read = await service.list(a, query({ trangThaiDoc: 'da-doc' }));
    const all = await service.list(a, query({ trangThaiDoc: 'tat-ca' }));
    expect([unread.total, read.total, all.total]).toEqual([2, 1, 3]);
    expect([unread.soChuaDoc, read.soChuaDoc, all.soChuaDoc]).toEqual([
      2, 2, 2,
    ]);
    expect(unread.items.every((x) => !x.daDoc)).toBe(true);
    expect(read.items.every((x) => x.daDoc)).toBe(true);
  });

  it('TTB-03: pageSize 1 và 100 hợp lệ; trang vượt cuối ⇒ items rỗng, total đúng', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    for (let i = 0; i < 3; i++) await insertNotice(a);
    expect((await service.list(a, query({ pageSize: 1 }))).items).toHaveLength(
      1,
    );
    expect(
      (await service.list(a, query({ pageSize: 100 }))).items,
    ).toHaveLength(3);
    const beyond = await service.list(a, query({ page: 5, pageSize: 2 }));
    expect(beyond).toMatchObject({ items: [], total: 3, page: 5 });
  });

  it('TTB-04: chưa có thông báo nào ⇒ danh sách trống, 0, 0', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    expect(await service.list(a, query())).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      soChuaDoc: 0,
    });
    expect(await service.unreadCount(a)).toEqual({ soChuaDoc: 0 });
  });

  it('TTB-05, QTB-05: A chỉ thấy của A; hai Quản trị viên cùng chi nhánh không thấy của nhau', async () => {
    const branch = await fx.branch();
    const a = (await fx.admin(branch)).account.taiKhoanId;
    const b = (await fx.admin(branch)).account.taiKhoanId;
    const sys = (await fx.admin()).account.taiKhoanId;
    const ofA = await insertNotice(a);
    await insertNotice(b);
    await insertNotice(b);
    await insertNotice(sys);
    const pageA = await service.list(a, query());
    expect(pageA.items.map((x) => x.id)).toEqual([ofA]);
    expect([pageA.total, pageA.soChuaDoc]).toEqual([1, 1]);
    expect((await service.list(b, query())).total).toBe(2);
    expect((await service.list(sys, query())).total).toBe(1);
  });

  it('TTB-06: id của người khác, không có, sai dạng ⇒ cùng một lỗi 404 KHONG_TIM_THAY; id đúng ⇒ chi tiết', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    const b = (await fx.patient()).account.taiKhoanId;
    const ofA = await insertNotice(a);
    const ofB = await insertNotice(b);
    const bodies: unknown[] = [];
    for (const id of [
      ofB,
      '999999999',
      'abc',
      '0',
      '-1',
      '1e3',
      '01',
      '1'.repeat(21),
    ]) {
      const error = await appError(service.detail(a, id));
      expect(error.getStatus(), id).toBe(404);
      bodies.push(error.getResponse());
    }
    expect(new Set(bodies.map((x) => JSON.stringify(x))).size).toBe(1);
    expect(bodies[0]).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
    expect((await service.detail(a, ofA)).id).toBe(ofA);
  });

  it('TTB-07: đánh dấu một bằng MỘT câu UPDATE có tai_khoan_id; lần hai 200 không đổi; id của người khác ⇒ 404 y hệt "không có", hàng của họ không đổi', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    const b = (await fx.patient()).account.taiKhoanId;
    const ofA = await insertNotice(a);
    await insertNotice(a);
    const ofB = await insertNotice(b);

    const spy = vi.spyOn(db.manager, 'query');
    const first = await service.markRead(a, ofA);
    // Câu đầu tiên chạm DB là UPDATE có điều kiện sở hữu; không SELECT sở hữu nào chạy trước nó
    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      MARK_READ_SQL,
      UNREAD_COUNT_SQL,
    ]);
    expect(spy.mock.calls[0]?.[1]).toEqual([ofA, a]);
    expect(MARK_READ_SQL).toMatch(
      /WHERE thong_bao_id = \? AND tai_khoan_id = \?$/,
    );
    spy.mockRestore();

    expect(first).toEqual({ id: ofA, daDoc: true, soChuaDoc: 1 });
    expect(await service.markRead(a, ofA)).toEqual({
      id: ofA,
      daDoc: true,
      soChuaDoc: 1,
    });

    const foreign = await appError(service.markRead(a, ofB));
    const missing = await appError(service.markRead(a, '999999999'));
    expect(foreign.getStatus()).toBe(404);
    expect(foreign.getResponse()).toEqual(missing.getResponse());
    expect(await rowOf(ofB)).toEqual({ taiKhoanId: b, daDoc: 0 });
  });

  it('TTB-08: đánh dấu tất cả 1.200 chưa đọc (chia lô 500); hàng của B nguyên; lần hai đánh dấu 0', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    const b = (await fx.patient()).account.taiKhoanId;
    await db.query(
      `INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, trang_thai_doc, thoi_diem_tao)
       WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 40)
       SELECT ?, 'TTB08', 'NapViThanhCong', 0, '2026-11-20 08:00:00' FROM s s1 CROSS JOIN s s2 LIMIT 1200`,
      [a],
    );
    for (let i = 0; i < 3; i++) await insertNotice(b);
    const transaction = vi.spyOn(db, 'transaction');
    expect(await service.markAllRead(a)).toEqual({
      daDanhDau: 1200,
      soChuaDoc: 0,
    });
    // 500 + 500 + 200: ba giao dịch riêng
    expect(transaction).toHaveBeenCalledTimes(3);
    transaction.mockRestore();
    expect((await service.unreadCount(b)).soChuaDoc).toBe(3);
    expect(await service.markAllRead(a)).toEqual({
      daDanhDau: 0,
      soChuaDoc: 0,
    });
  });

  it('TTB-09, TTB-10: số chưa đọc đúng qua chuỗi thêm, đọc một, đọc tất cả, thêm; xem chi tiết không tự đánh dấu', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    const first = await insertNotice(a);
    await insertNotice(a);
    expect((await service.unreadCount(a)).soChuaDoc).toBe(2);
    await service.detail(a, first);
    expect((await service.unreadCount(a)).soChuaDoc).toBe(2);
    await service.markRead(a, first);
    expect((await service.unreadCount(a)).soChuaDoc).toBe(1);
    await service.markAllRead(a);
    expect((await service.unreadCount(a)).soChuaDoc).toBe(0);
    await insertNotice(a);
    expect((await service.unreadCount(a)).soChuaDoc).toBe(1);
  });

  it('TTB-11: mã trong danh mục, mã có hậu tố :v2, mã lạ, mã khác hoa thường', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    const known = await insertNotice(a, {
      loai: 'NapViThatBai',
      at: '2026-11-20 08:00:04',
    });
    const versioned = await insertNotice(a, {
      loai: 'ThayDoiChiNhanhAnhHuongLichHen:v2',
      at: '2026-11-20 08:00:03',
    });
    const unknown = await insertNotice(a, {
      loai: 'MaChuaCoTrongDanhMuc',
      at: '2026-11-20 08:00:02',
    });
    const otherCase = await insertNotice(a, {
      loai: 'napvithatbai',
      at: '2026-11-20 08:00:01',
    });
    const items = (await service.list(a, query())).items;
    const byId = Object.fromEntries(items.map((x) => [x.id, x]));
    expect(byId[known]).toMatchObject({
      loai: 'NapViThatBai',
      nhom: 'Vi',
      tieuDe: 'Nạp ví thất bại',
      lienKet: { kieu: 'Vi' },
    });
    expect(byId[versioned]).toMatchObject({
      loai: 'ThayDoiChiNhanhAnhHuongLichHen',
      nhom: 'ChiNhanh',
      tieuDe: 'Chi nhánh thay đổi, ảnh hưởng lịch hẹn',
      lienKet: { kieu: 'ThayDoiChiNhanh' },
    });
    expect(byId[unknown]).toMatchObject({
      loai: 'MaChuaCoTrongDanhMuc',
      nhom: null,
      tieuDe: 'Thông báo',
      lienKet: null,
    });
    // Danh mục tra đúng chữ (mã do hằng của module ghi): khác hoa thường là mã lạ, không lỗi
    expect(byId[otherCase]).toMatchObject({ tieuDe: 'Thông báo', nhom: null });
  });

  it('TTB-12: có lịch hẹn ⇒ liên kết theo MÃ lịch (không id); không gắn gì ⇒ theo danh mục; danh mục ghi LichHen mà không có lịch ⇒ null', async () => {
    const branch = await fx.branch();
    const doctor = await fx.doctor(branch);
    const patient = await fx.patient();
    const a = patient.account.taiKhoanId;
    const appointment = await fx.appointment(
      doctor.profile,
      await fx.slot(await fx.shift(doctor.profile)),
      a,
    );
    const withAppointment = await insertNotice(a, {
      loai: 'LichHenDaXacNhan',
      lichHenId: appointment.lichHenId,
      at: '2026-11-20 08:00:03',
    });
    const leave = await insertNotice(a, {
      loai: 'NghiPhepDaDuyet',
      at: '2026-11-20 08:00:02',
    });
    const lichHenNoLink = await insertNotice(a, {
      loai: 'LichHenDaHuy',
      at: '2026-11-20 08:00:01',
    });
    const items = Object.fromEntries(
      (await service.list(a, query())).items.map((x) => [x.id, x]),
    );
    expect(items[withAppointment]?.lienKet).toEqual({
      kieu: 'LichHen',
      maLichHen: appointment.maLichHen,
    });
    // Liên kết chỉ có kiểu và MÃ lịch; không khoá nào mang id nội bộ của lịch
    expect(Object.keys(items[withAppointment] ?? {})).not.toContain(
      'lichHenId',
    );
    expect(Object.keys(items[withAppointment]?.lienKet ?? {}).sort()).toEqual([
      'kieu',
      'maLichHen',
    ]);
    expect(items[leave]?.lienKet).toEqual({ kieu: 'NghiPhep' });
    expect(items[lichHenNoLink]?.lienKet).toBeNull();
  });

  it('TTB-13: 30 thông báo cùng một giây, hai trang 15: không lặp, không sót, thứ tự id giảm dần', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    const ids: string[] = [];
    for (let i = 0; i < 30; i++)
      ids.push(await insertNotice(a, { at: '2026-11-20 08:00:00' }));
    const p1 = await service.list(a, query({ page: 1, pageSize: 15 }));
    const p2 = await service.list(a, query({ page: 2, pageSize: 15 }));
    const seen = [...p1.items, ...p2.items].map((x) => x.id);
    expect(seen).toEqual([...ids].sort((x, y) => Number(y) - Number(x)));
  });

  it('TTB-14: noi_dung 500 ký tự có <script>, &, ", tiếng Việt và ký tự đa byte trả nguyên văn', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    const head = '<script>alert("x")</script> & "nháy" Đặt lịch 😀 ';
    // varchar(500) đếm theo KÝ TỰ (code point), không theo đơn vị UTF-16: emoji là 1 ký tự nhưng `length` = 2
    const codePoints = (value: string) => Array.from(value).length;
    const text = head + 'ệ'.repeat(500 - codePoints(head));
    expect(codePoints(text)).toBe(500);
    const id = await insertNotice(a, { noiDung: text });
    expect((await service.detail(a, id)).noiDung).toBe(text);
  });

  it('TTB-16: Bệnh nhân, Bác sĩ, Lễ tân, Quản trị viên Toàn hệ thống và Chi nhánh đều đọc và đánh dấu được, chỉ của chính mình', async () => {
    const branch = await fx.branch();
    const accounts = [
      (await fx.patient()).account.taiKhoanId,
      (await fx.doctor(branch)).account.taiKhoanId,
      (await fx.receptionist(branch)).account.taiKhoanId,
      (await fx.admin()).account.taiKhoanId,
      (await fx.admin(branch)).account.taiKhoanId,
    ];
    const own = new Map<string, string>();
    for (const id of accounts) own.set(id, await insertNotice(id));
    for (const id of accounts) {
      const page = await service.list(id, query());
      expect(page.items.map((x) => x.id)).toEqual([own.get(id)]);
      expect(await service.markRead(id, own.get(id) ?? '')).toMatchObject({
        soChuaDoc: 0,
      });
    }
  });

  it('QTB-03: A đoán tuần tự id quanh thông báo của B: không đọc, không đánh dấu được; hàng của B không đổi', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    const b = (await fx.patient()).account.taiKhoanId;
    const ofB = await insertNotice(b);
    for (let id = Number(ofB) - 2; id <= Number(ofB) + 2; id++) {
      if (id < 1) continue;
      expect((await appError(service.detail(a, String(id)))).getStatus()).toBe(
        404,
      );
      expect(
        (await appError(service.markRead(a, String(id)))).getStatus(),
      ).toBe(404);
    }
    expect(await service.markAllRead(a)).toEqual({
      daDanhDau: 0,
      soChuaDoc: 0,
    });
    expect(await rowOf(ofB)).toEqual({ taiKhoanId: b, daDoc: 0 });
  });
});

describe('HTB-04 notifier THẬT của các module ghi, đọc lại qua Trung tâm thông báo', () => {
  it('mỗi dòng ra đúng tieuDe, nhom, lienKet theo danh mục', async () => {
    const branch = await fx.branch();
    const patient = await fx.patient();
    const doctor = await fx.doctor(branch);
    const proposer = await fx.admin(branch);
    const p = patient.account.taiKhoanId;
    const appointment = await fx.appointment(
      doctor.profile,
      await fx.slot(await fx.shift(doctor.profile)),
      p,
    );
    const request = (await db.query(
      `INSERT INTO yeu_cau_thay_doi_chi_nhanh (chi_nhanh_id, nguoi_de_xuat_id, noi_dung_truoc, noi_dung_sau, trang_thai)
       VALUES (?, ?, JSON_OBJECT('ten', 'Cũ'), JSON_OBJECT('ten', 'Mới'), 'ChoDuyet')`,
      [branch.chiNhanhId, proposer.account.taiKhoanId],
    )) as { insertId: number };
    const now = new Date('2026-11-02T08:00:00+07:00');
    const money = { benhNhanId: p, soTien: '100000.00', now };

    await db.transaction(async (em) => {
      await new BookingNotifier().notify(em, {
        loaiSuKien: BOOKING_NOTIFICATION_EVENTS.CONFIRMED,
        lichHenId: appointment.lichHenId,
        taiKhoanId: p,
        daThu: '0.00',
      });
      await new ExamNotifier().notifyCompleted(em, {
        taiKhoanId: p,
        lichHenId: appointment.lichHenId,
        maLichHen: appointment.maLichHen,
        now,
      });
      await new TopupNotifier().notifyFailed(em, money);
      await new WithdrawalNotifier().notifyApproved(em, money);
      await new RefundNotifier().notifyRefunded(em, {
        lichHenId: appointment.lichHenId,
        taiKhoanId: p,
        maLichHen: appointment.maLichHen,
        soTien: '100000.00',
        now,
      });
      await new BranchChangeNotifier().notify(em, {
        yeuCauId: String(request.insertId),
        taiKhoanId: p,
        event: { type: BRANCH_CHANGE_EVENTS.AFFECTED, version: 2 },
        noiDung: 'Lịch hẹn của bạn bị ảnh hưởng.',
        now,
      });
      await new LeaveNotifier().notify(em, {
        loaiSuKien: LEAVE_EVENTS.Approved,
        bacSiId: doctor.account.taiKhoanId,
        chiNhanhId: branch.chiNhanhId,
        tenBacSi: 'Bác sĩ Test',
        ngayBatDau: '2026-11-10',
        ngayKetThuc: '2026-11-10',
        ca: null,
      });
    });

    const pick = (
      items: {
        loai: string;
        nhom: unknown;
        tieuDe: string;
        lienKet: unknown;
      }[],
    ) =>
      Object.fromEntries(
        items.map((x) => [
          x.loai,
          { nhom: x.nhom, tieuDe: x.tieuDe, lienKet: x.lienKet },
        ]),
      );
    const ofPatient = pick((await service.list(p, query())).items);
    const link = { kieu: 'LichHen', maLichHen: appointment.maLichHen };
    expect(ofPatient).toEqual({
      LichHenDaXacNhan: {
        nhom: 'LichHen',
        tieuDe: 'Đặt lịch thành công',
        lienKet: link,
      },
      LichHenHoanThanh: {
        nhom: 'LichHen',
        tieuDe: 'Đã hoàn thành lịch khám',
        lienKet: link,
      },
      NapViThatBai: {
        nhom: 'Vi',
        tieuDe: 'Nạp ví thất bại',
        lienKet: { kieu: 'Vi' },
      },
      RutTienDuocDuyet: {
        nhom: 'Vi',
        tieuDe: 'Yêu cầu rút tiền được duyệt',
        lienKet: { kieu: 'Vi' },
      },
      HoanCocThanhCong: {
        nhom: 'Vi',
        tieuDe: 'Đã hoàn tiền cọc',
        lienKet: link,
      },
      ThayDoiChiNhanhAnhHuongLichHen: {
        nhom: 'ChiNhanh',
        tieuDe: 'Chi nhánh thay đổi, ảnh hưởng lịch hẹn',
        lienKet: { kieu: 'ThayDoiChiNhanh' },
      },
    });
    expect(
      pick((await service.list(doctor.account.taiKhoanId, query())).items),
    ).toEqual({
      NghiPhepDaDuyet: {
        nhom: 'NghiPhep',
        tieuDe: 'Yêu cầu nghỉ phép được duyệt',
        lienKet: { kieu: 'NghiPhep' },
      },
    });
  });
});

describe('EXPLAIN M1 trên chính câu SQL của B2', () => {
  it('danh sách Tất cả và hai bộ lọc của tài khoản 2.000 dòng: không filesort; Tất cả dùng chỉ mục của notification P2', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    await db.query(
      `INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, trang_thai_doc, thoi_diem_tao)
       WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 50)
       SELECT ?, 'M1', 'NapViThanhCong', (s1.n + s2.n) % 2, TIMESTAMP('2026-11-20 08:00:00') - INTERVAL (s1.n * 50 + s2.n) MINUTE
         FROM s s1 CROSS JOIN s s2 LIMIT 2000`,
      [a],
    );
    // Bảng chỉ có dòng của MỘT tài khoản thì optimizer quét cả bảng (mọi dòng đều khớp): thêm 3.000 dòng của 300 tài khoản khác như dữ liệu thật
    // (khoá ngoại tắt trên MỘT kết nối, chỉ để nạp; như X1 M1 và thong-bao-chi-muc.int-spec.ts)
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await runner.query('SET FOREIGN_KEY_CHECKS = 0');
      await runner.query(
        `INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, trang_thai_doc, thoi_diem_tao)
         WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 60)
         SELECT 900000 + ((s1.n * 60 + s2.n) % 300), 'Khác', 'NapViThanhCong', 0, '2026-11-20 08:00:00'
           FROM s s1 CROSS JOIN s s2 LIMIT 3000`,
      );
    } finally {
      await runner.query('SET FOREIGN_KEY_CHECKS = 1');
      await runner.release();
    }
    await db.query('ANALYZE TABLE thong_bao');
    const planOf = async (sql: string, params: unknown[]) =>
      (
        (await db.query(`EXPLAIN ${sql}`, params)) as {
          table: string;
          key: string | null;
          Extra: string | null;
        }[]
      ).find((row) => row.table === 't');
    const all = await planOf(LIST_SQL, [a, 20, 0]);
    expect(all?.key).toBe('thong_bao_index_tai_khoan_thoi_diem');
    expect(all?.Extra ?? '').not.toContain('filesort');
    for (const filter of [0, 1]) {
      const plan = await planOf(LIST_FILTERED_SQL, [a, filter, 20, 0]);
      expect(plan?.key, String(filter)).not.toBeNull();
      expect(plan?.Extra ?? '', String(filter)).not.toContain('filesort');
    }
  });
});
