import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { APPOINTMENT_CODE_PATTERN } from '../appointment-code.js';
import { HOLD_EXPIRED_CANCEL_REASON } from '../appointments.constants.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { BOOKING_T0, BookingFixtures } from '../testing/booking-fixtures.js';
import {
  createAppointmentWorld,
  dataState,
  deadlockError,
  ER_LOCK_NOWAIT,
  failureOf,
  lichHenRows,
  nowaitErrno,
  simulateConfirmPaid,
  transactionOf,
  writeTargets,
  type CreateWorld,
  type CreateWorldOptions,
} from '../testing/create-appointment-world.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { firstTableOf, isLockingStatement } from '../testing/query-spy.js';
import {
  failAfterStatement,
  recordStatements,
} from '../testing/statement-recorder.js';
import { isVisitProfileUsable } from '../visit-profile.query.js';

// Task B8 — `CreateAppointmentService` trên MySQL 8.4 THẬT, MỌI phụ thuộc là bản thật trừ các cổng `Fake` (PLAN booking 7.1, 7.12; TRACKING 3.21 B8-H): DL-01…DL-23 và DL-25…DL-28 mức dịch vụ (phần HTTP ở
// test/booking-appointments.e2e-spec.ts), KT-02, KT-04, KT-05, TAO-06, TAO-09, TAO-10, TAO-11. Đồng thời (DT-10, DT-11, KT-01, KT-03, DL-29) ở create-appointment.concurrency.int-spec.ts. Ô i của thế giới
// bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026 (thứ Ba, ISO 2); đồng hồ giả của `useIntegrationHooks` là 08:00 ngày 02/11/2026 (= `BOOKING_T0`), hạn giữ chỗ 15 phút. Dữ liệu giả.
// Mã TAO-nn là [đề xuất]. Mỗi ca ghi gọi `expectSettled` cuối ca: INV-01…INV-05 và không còn khoá nào bị giữ.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const world = (options?: CreateWorldOptions) =>
  createAppointmentWorld(db, fx, options);
const SLOT_8H = new Date('2026-11-10T08:00:00+07:00');
const THU_BA = 2;
const BOOM = new Error('lỗi giả giữa giao dịch');

const hours = (w: CreateWorld, assignments: string) =>
  db.query(
    `UPDATE chi_nhanh_lich_hoat_dong SET ${assignments} WHERE chi_nhanh_id = ? AND thu_trong_tuan = ?`,
    [w.doctor.profile.chiNhanhId, THU_BA],
  );
const lockDoctor = (w: CreateWorld, mode: 'UPDATE' | 'SHARE') =>
  nowaitErrno(
    db,
    `SELECT tai_khoan_id FROM bac_si WHERE tai_khoan_id = ? FOR ${mode} NOWAIT`,
    [w.doctorId],
  );
const strangerPatient = async () =>
  (await fx.admin.patient()).account.taiKhoanId;

describe('đường thành công: cọc 0đ xác nhận ngay (DL-01, DL-25)', () => {
  it('DL-01, DL-25 cọc 0đ: 201 DaXacNhan, han_thanh_toan NULL, khung giờ DaDat và giu_cho_den NULL, mã đúng dạng, chi nhánh, dịch vụ, bác sĩ và giờ suy từ khung giờ và bác sĩ, snapshot hoàn là SQL NULL', async () => {
    const w = await world();

    const result = await w.create(0);

    const [row, ...rest] = await lichHenRows(db);
    expect(rest).toHaveLength(0);
    expect(result).toStrictEqual({
      maLichHen: row!.ma,
      trangThai: 'DaXacNhan',
      hanThanhToan: null,
      giaApDung: '100000.00',
      tienCoc: '0.00',
      canThanhToan: false,
      thoiGianMayChu: '2026-11-02T01:00:00.000Z',
    });
    expect(row).toMatchObject({
      trangThai: 'DaXacNhan',
      han: null,
      khungGioId: w.slot(0),
      benhNhanId: w.patientId,
      hoSoNguoiThanId: null,
      bacSiId: w.doctorId,
      chiNhanhId: w.doctor.profile.chiNhanhId,
      dichVuKhamId: w.dichVuKhamId,
      thoiGian: '2026-11-10 08:00:00',
      gia: '100000.00',
      coc: '0.00',
      chinhSach: null,
      lyDoKham: null,
      thoiDiemTao: '2026-11-02 08:00:00',
      dangGiu: w.slot(0),
    });
    expect(Number(row!.chinhSachSqlNull)).toBe(1);
    expect(row!.ma).toMatch(APPOINTMENT_CODE_PATTERN);
    expect(row!.ma).toMatch(/^CLX-20261102-/);
    expect(await fx.slotState(w.slot(0))).toStrictEqual({
      trangThai: 'DaDat',
      giuChoDen: null,
    });
    await w.expectSettled(0);
  });

  it('DL-01, DL-27 hai cổng chạy TRONG giao dịch của lần tạo: ở chính lúc cổng được gọi, lịch và khung giờ ĐÃ ghi nhưng một kết nối khác CHƯA thấy (chưa commit); đúng một lần, đúng tham số và sự kiện', async () => {
    const w = await world();
    const seen: Record<string, unknown> = {};
    const probe = async (
      em: EntityManager,
      name: string,
      lichHenId: string,
    ) => {
      const lich = 'SELECT trang_thai AS t FROM lich_hen WHERE lich_hen_id = ?';
      const khung =
        'SELECT trang_thai AS t FROM khung_gio WHERE khung_gio_id = ?';
      seen[`${name}.lichTrong`] = await em.query(lich, [lichHenId]);
      seen[`${name}.lichNgoai`] = await db.query(lich, [lichHenId]);
      seen[`${name}.khungTrong`] = await em.query(khung, [w.slot(0)]);
      seen[`${name}.khungNgoai`] = await db.query(khung, [w.slot(0)]);
    };
    w.payment.recordZeroPaymentCall.onCall((em, input) =>
      probe(em, 'payment', input.lichHenId),
    );
    w.notifier.notifyCall.onCall((em, event) =>
      probe(em, 'notify', event.lichHenId),
    );

    await w.create(0);

    const [row] = await lichHenRows(db);
    for (const name of ['payment', 'notify']) {
      expect(seen[`${name}.lichTrong`], name).toEqual([{ t: 'DaXacNhan' }]);
      expect(seen[`${name}.lichNgoai`], name).toEqual([]);
      expect(seen[`${name}.khungTrong`], name).toEqual([{ t: 'DaDat' }]);
      expect(seen[`${name}.khungNgoai`], name).toEqual([{ t: 'ConTrong' }]);
    }
    expect(w.payment.recordZeroPaymentCall.calls).toHaveLength(1);
    expect(w.payment.recordZeroPaymentCall.calls[0]?.[1]).toEqual({
      lichHenId: row!.id,
      benhNhanId: w.patientId,
    });
    expect(w.notifier.events).toEqual([
      {
        loaiSuKien: 'LichHenDaXacNhan',
        lichHenId: row!.id,
        taiKhoanId: w.patientId,
      },
    ]);
  });

  it('DL-25 hồ sơ người thân và lý do khám được ghi đúng; không nhập lý do ⇒ NULL', async () => {
    const w = await world();

    await w.create(0, {
      hoSoNguoiThanId: w.relativeId,
      lyDoKham: 'Đau đầu ba ngày',
    });
    await w.create(1);

    const [withRelative, plain] = await lichHenRows(db);
    expect(withRelative).toMatchObject({
      hoSoNguoiThanId: w.relativeId,
      benhNhanId: w.patientId,
      lyDoKham: 'Đau đầu ba ngày',
    });
    expect(plain).toMatchObject({ hoSoNguoiThanId: null, lyDoKham: null });
    await w.expectSettled(1);
  });
});

describe('đường thành công: cọc > 0 dừng ở ChoThanhToan (DL-02, DL-20, DL-21)', () => {
  it('DL-02 ChoThanhToan, han_thanh_toan = now + thoi_gian_giu_cho, khung giờ DangGiuCho với giu_cho_den = han_thanh_toan, canThanhToan = true, KHÔNG gọi recordZeroPayment và KHÔNG gọi notify', async () => {
    const w = await world();
    await w.deposit('50000.00', [
      [2, 50],
      [24, 100],
    ]);

    const result = await w.create(0);

    const [row] = await lichHenRows(db);
    expect(result).toStrictEqual({
      maLichHen: row!.ma,
      trangThai: 'ChoThanhToan',
      hanThanhToan: '2026-11-02T01:15:00.000Z',
      giaApDung: '100000.00',
      tienCoc: '50000.00',
      canThanhToan: true,
      thoiGianMayChu: '2026-11-02T01:00:00.000Z',
    });
    expect(row).toMatchObject({
      trangThai: 'ChoThanhToan',
      han: '2026-11-02 08:15:00',
      coc: '50000.00',
      dangGiu: w.slot(0),
    });
    expect(await fx.slotState(w.slot(0))).toStrictEqual({
      trangThai: 'DangGiuCho',
      giuChoDen: '2026-11-02 08:15:00',
    });
    expect(w.payment.recordZeroPaymentCall.count).toBe(0);
    expect(w.notifier.notifyCall.count).toBe(0);
    await w.expectSettled(0);
  });

  it('DL-21 cọc > 0 có mốc ⇒ mảng JSON giảm dần theo so_gio_truoc_toi_thieu (khoá snake_case); đổi moc_hoan_tien SAU ĐÓ không đổi lịch đã đặt', async () => {
    const w = await world();
    await w.deposit('50000.00', [
      [2, 50],
      [24, 100],
    ]);
    await w.create(0);

    await fx.depositService(w.dichVuKhamId, '50000.00', [[48, 80]]);

    const [row] = await lichHenRows(db);
    expect(row!.chinhSach).toEqual([
      { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
      { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
    ]);
    expect(Number(row!.chinhSachSqlNull)).toBe(0);
  });

  it('DL-21 cọc > 0 chưa có mốc ⇒ [] (không hoàn gì), KHÁC với SQL NULL của cọc 0đ', async () => {
    const w = await world();
    await w.deposit('50000.00');

    await w.create(0);

    const [row] = await lichHenRows(db);
    expect(row!.chinhSach).toEqual([]);
    expect(Number(row!.chinhSachSqlNull)).toBe(0);
  });

  it('DL-21 cọc 0đ ⇒ SQL NULL (không phải chuỗi JSON "null") DÙ dịch vụ có mốc; không đọc moc_hoan_tien', async () => {
    const w = await world();
    await w.deposit('0.00', [[24, 100]]);
    const statements = recordStatements(db);

    await w.create(0);

    const [row] = await lichHenRows(db);
    expect(row!.chinhSach).toBeNull();
    expect(Number(row!.chinhSachSqlNull)).toBe(1);
    expect(statements.some((sql) => sql.includes('FROM moc_hoan_tien'))).toBe(
      false,
    );
  });

  it('DL-20 giá = giá dịch vụ + phụ phí bằng chuỗi decimal chính xác (100000.10 + 0.20 = 100000.30, không số thực); đổi giá và quy tắc SAU khi đặt không đổi lịch đã đặt, lịch mới theo giá mới', async () => {
    const w = await world();
    await db.query(
      "UPDATE dich_vu_kham SET gia_mac_dinh = '100000.10' WHERE dich_vu_kham_id = ?",
      [w.dichVuKhamId],
    );
    await db.query(
      "INSERT INTO phu_phi_bac_si (chuc_danh, so_nam_kinh_nghiem_tu, phu_phi, ap_dung) VALUES ('BS', 0, '0.20', 1)",
    );

    const first = await w.create(0);
    await db.query(
      "UPDATE dich_vu_kham SET gia_mac_dinh = '900000.00' WHERE dich_vu_kham_id = ?",
      [w.dichVuKhamId],
    );
    await db.query("UPDATE phu_phi_bac_si SET phu_phi = '1.00'");
    const second = await w.create(1);

    const [row1, row2] = await lichHenRows(db);
    expect(first.giaApDung).toBe('100000.30');
    expect(row1!.gia).toBe('100000.30');
    expect(second.giaApDung).toBe('900001.00');
    expect(row2!.gia).toBe('900001.00');
  });

  it('DL-20, TAO-09 giá, cọc và chính sách hoàn lúc tạo BẰNG đúng những gì `checks` đã hiển thị cho cùng khung giờ (một chỗ định nghĩa)', async () => {
    const w = await world();
    await db.query(
      "INSERT INTO phu_phi_bac_si (chuc_danh, so_nam_kinh_nghiem_tu, phu_phi, ap_dung) VALUES ('BS', 0, '50000.00', 1)",
    );
    await w.deposit('20000.00', [
      [2, 50],
      [24, 100],
    ]);

    const { tomTat } = await w.check(0);
    const result = await w.create(0);

    const [row] = await lichHenRows(db);
    expect(result.giaApDung).toBe(tomTat.giaApDung);
    expect(result.tienCoc).toBe(tomTat.tienCoc);
    expect(row!.gia).toBe(tomTat.giaApDung);
    expect(row!.coc).toBe(tomTat.tienCoc);
    expect(row!.chinhSach).toEqual(
      (tomTat.chinhSachHoan ?? []).map((tier) => ({
        so_gio_truoc_toi_thieu: tier.soGioTruocToiThieu,
        ty_le_hoan: tier.tyLeHoan,
      })),
    );
  });

  it.each([
    '2026-11-02T01:00:00.789Z',
    '2026-11-02T01:00:00.999Z',
    '2026-11-02T01:00:00.500Z',
  ])(
    'TAO-09 MỘT mốc now cắt mili giây (now = %s): thoi_diem_tao, han_thanh_toan và giu_cho_den đều là giây nguyên (08:00:00 và 08:15:00), han_thanh_toan = giu_cho_den; thoiGianMayChu giữ mili giây',
    async (instant) => {
      const w = await world();
      await w.deposit('50000.00');
      vi.setSystemTime(new Date(instant));

      const result = await w.create(0);

      const [row] = await lichHenRows(db);
      const slot = await fx.slotState(w.slot(0));
      expect(row!.thoiDiemTao).toBe('2026-11-02 08:00:00');
      expect(row!.han).toBe('2026-11-02 08:15:00');
      expect(slot.giuChoDen).toBe(row!.han);
      expect(result.hanThanhToan).toBe('2026-11-02T01:15:00.000Z');
      expect(result.thoiGianMayChu).toBe(instant);
      await w.expectSettled(0);
    },
  );
});

interface RejectionArgs {
  slot?: number | string;
  hoSoNguoiThanId?: string | null;
  accountId?: string;
}
interface Rejection {
  name: string;
  status: number;
  code: string;
  setup?: (w: CreateWorld) => Promise<RejectionArgs | void>;
}

const REJECTIONS: Rejection[] = [
  {
    name: 'DL-03 khung giờ đã DaDat',
    status: 409,
    code: 'KHUNG_GIO_DA_DAT',
    setup: async (w) => {
      await w.book('DaXacNhan', 0, { patientId: await strangerPatient() });
    },
  },
  {
    name: 'DL-04 khung giờ DangGiuCho còn hạn (người khác giữ)',
    status: 409,
    code: 'KHUNG_GIO_DANG_GIU',
    setup: async (w) => {
      await w.book('ChoThanhToan', 0, { patientId: await strangerPatient() });
    },
  },
  {
    name: 'DL-04 biên: giu_cho_den = now + 1 giây vẫn còn hạn',
    status: 409,
    code: 'KHUNG_GIO_DANG_GIU',
    setup: async (w) => {
      await w.book('ChoThanhToan', 0, {
        patientId: await strangerPatient(),
        hanThanhToan: new Date(BOOKING_T0.getTime() + 1000),
      });
    },
  },
  {
    name: 'DL-10 khung giờ đã qua (now sau giờ bắt đầu)',
    status: 409,
    code: 'KHUNG_GIO_DA_QUA',
    setup: () => {
      vi.setSystemTime(new Date('2026-11-10T09:00:00+07:00'));
      return Promise.resolve();
    },
  },
  {
    name: 'DL-10 biên: now ĐÚNG BẰNG giờ bắt đầu',
    status: 409,
    code: 'KHUNG_GIO_DA_QUA',
    setup: () => {
      vi.setSystemTime(SLOT_8H);
      return Promise.resolve();
    },
  },
  {
    name: 'DL-13 khoá đặt lịch do no-show (hồ sơ bản thân)',
    status: 403,
    code: 'DAT_LICH_BI_KHOA_NO_SHOW',
    setup: async (w) => {
      await w.lockNoShow();
    },
  },
  {
    name: 'DL-13 khoá no-show áp dụng cả khi đặt cho người thân (Q14)',
    status: 403,
    code: 'DAT_LICH_BI_KHOA_NO_SHOW',
    setup: async (w) => {
      await w.lockNoShow();
      return { hoSoNguoiThanId: w.relativeId };
    },
  },
  {
    name: 'DL-11, KT-02 hồ sơ người thân của chính mình đã ngừng',
    status: 409,
    code: 'HO_SO_NGUOI_THAN_DA_NGUNG',
    setup: (w) => Promise.resolve({ hoSoNguoiThanId: w.stoppedRelativeId }),
  },
  {
    name: 'DL-12 hồ sơ người thân của bệnh nhân KHÁC',
    status: 404,
    code: 'KHONG_TIM_THAY',
    setup: async () => ({
      hoSoNguoiThanId: await fx.relative(await strangerPatient()),
    }),
  },
  {
    name: 'DL-12 hồ sơ người thân không tồn tại',
    status: 404,
    code: 'KHONG_TIM_THAY',
    setup: () => Promise.resolve({ hoSoNguoiThanId: '999999999' }),
  },
  {
    name: 'khung giờ không tồn tại',
    status: 404,
    code: 'KHUNG_GIO_KHONG_TON_TAI',
    setup: () => Promise.resolve({ slot: '99999999' }),
  },
  {
    name: 'tài khoản không có hàng benh_nhan (Bác sĩ)',
    status: 403,
    code: 'KHONG_DU_QUYEN',
    setup: (w) => Promise.resolve({ accountId: w.doctorId }),
  },
  {
    name: 'DL-15 ngày nghỉ (hoat_dong = false)',
    status: 409,
    code: 'CHI_NHANH_NGHI',
    setup: async (w) => {
      await hours(
        w,
        'hoat_dong = 0, gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL, gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL',
      );
    },
  },
  {
    name: 'DL-15 thứ chưa khai báo (không có dòng)',
    status: 409,
    code: 'CHI_NHANH_CHUA_KHAI_BAO',
    setup: async (w) => {
      await db.query(
        'DELETE FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = ? AND thu_trong_tuan = ?',
        [w.doctor.profile.chiNhanhId, THU_BA],
      );
    },
  },
  {
    name: 'DL-15 ca không có khoảng (không có buổi sáng, khung giờ thuộc ca sáng)',
    status: 409,
    code: 'CA_KHONG_TON_TAI',
    setup: async (w) => {
      await hours(w, 'gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL');
    },
  },
  {
    name: 'DL-15 khung giờ vượt khoảng (buổi sáng kết thúc 11:00, ô 11:30)',
    status: 409,
    code: 'NGOAI_GIO_HOAT_DONG',
    setup: async (w) => {
      await hours(w, "gio_ket_thuc_sang = '11:00:00'");
      return { slot: 7 };
    },
  },
  {
    name: 'DL-15 biên: ô liền sau khoảng (08:30–09:00 khi buổi sáng tới 08:30)',
    status: 409,
    code: 'NGOAI_GIO_HOAT_DONG',
    setup: async (w) => {
      await hours(w, "gio_ket_thuc_sang = '08:30:00'");
      return { slot: 1 };
    },
  },
  {
    name: 'DL-16 tài khoản bác sĩ NgungHoatDong',
    status: 409,
    code: 'BAC_SI_KHONG_KHA_DUNG',
    setup: async (w) => {
      await db.query(
        "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
        [w.doctorId],
      );
    },
  },
  {
    name: 'DL-16 tài khoản bác sĩ ChoKichHoat',
    status: 409,
    code: 'BAC_SI_KHONG_KHA_DUNG',
    setup: async (w) => {
      await db.query(
        "UPDATE tai_khoan SET trang_thai = 'ChoKichHoat', mat_khau_bam = NULL WHERE tai_khoan_id = ?",
        [w.doctorId],
      );
    },
  },
  {
    name: 'DL-16 chuyên khoa NgungHoatDong',
    status: 409,
    code: 'BAC_SI_KHONG_KHA_DUNG',
    setup: async (w) => {
      await db.query(
        "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong' WHERE chuyen_khoa_id = ?",
        [w.doctor.profile.chuyenKhoaId],
      );
    },
  },
  {
    name: 'DL-16 cặp (chi nhánh, dịch vụ) bị bỏ khỏi chi_nhanh_dich_vu_kham',
    status: 409,
    code: 'BAC_SI_KHONG_KHA_DUNG',
    setup: async (w) => {
      await db.query(
        'DELETE FROM chi_nhanh_dich_vu_kham WHERE chi_nhanh_id = ? AND dich_vu_kham_id = ?',
        [w.doctor.profile.chiNhanhId, w.dichVuKhamId],
      );
    },
  },
  {
    name: 'DL-26 ca ghi chi nhánh khác chi nhánh hiện tại của bác sĩ (D12)',
    status: 409,
    code: 'KHUNG_GIO_KHONG_HOP_LE',
    setup: async (w) => {
      const other = await fx.admin.branch();
      await db.query(
        'UPDATE lich_lam_viec SET chi_nhanh_id = ? WHERE lich_lam_viec_id = ?',
        [other.chiNhanhId, w.shift.lichLamViecId],
      );
    },
  },
  {
    name: 'DL-17 cổng nghỉ phép giả báo DaDuyet',
    status: 409,
    code: 'BAC_SI_NGHI_PHEP',
    setup: (w) => {
      w.leave.blocks({}, 'DaDuyet');
      return Promise.resolve();
    },
  },
  {
    name: 'DL-17 cổng nghỉ phép giả báo ChoDuyet',
    status: 409,
    code: 'BAC_SI_NGHI_PHEP',
    setup: (w) => {
      w.leave.blocks({}, 'ChoDuyet');
      return Promise.resolve();
    },
  },
  {
    name: 'DL-18 cổng đổi chi nhánh giả báo khung giờ nằm vùng bị loại',
    status: 409,
    code: 'KHUNG_GIO_NGOAI_LICH_MOI',
    setup: (w) => {
      w.pending.blocks();
      return Promise.resolve();
    },
  },
  {
    name: 'DL-19 không có dòng cau_hinh_he_thong',
    status: 409,
    code: 'HE_THONG_CHUA_CAU_HINH',
    setup: async () => {
      await db.query('DELETE FROM cau_hinh_he_thong');
    },
  },
];

describe('bị từ chối: đúng mã, KHÔNG ghi gì, không gọi cổng ghi, không khoá nào còn giữ', () => {
  it.each(REJECTIONS)('$name ⇒ $status $code', async (scenario) => {
    const w = await world();
    const args = (await scenario.setup?.(w)) ?? {};
    const before = await dataState(db);

    const { status, body } = await failureOf(
      w.create(
        args.slot ?? 0,
        { hoSoNguoiThanId: args.hoSoNguoiThanId },
        args.accountId,
      ),
    );

    expect(status).toBe(scenario.status);
    expect(body.maLoi).toBe(scenario.code);
    expect(await dataState(db)).toStrictEqual(before);
    expect(w.payment.recordZeroPaymentCall.count).toBe(0);
    expect(w.notifier.notifyCall.count).toBe(0);
    await w.expectSettled(typeof args.slot === 'number' ? args.slot : 0);
  });

  it('DL-12 hồ sơ của người khác và hồ sơ không tồn tại cho CÙNG một thân 404 (không phân biệt, QB-01)', async () => {
    const w = await world();
    const theirs = await fx.relative(await strangerPatient());

    const ofOther = await failureOf(w.create(0, { hoSoNguoiThanId: theirs }));
    const missing = await failureOf(
      w.create(0, { hoSoNguoiThanId: '999999999' }),
    );

    expect(ofOther).toStrictEqual(missing);
  });
});

describe('số lịch, trùng giờ, đồng hồ (DL-06 đến DL-10)', () => {
  it('DL-06 trùng giờ với lịch của CHÍNH hồ sơ này ⇒ 409 LICH_HEN_TRUNG_THOI_GIAN, chiTiet đúng hai khoá; không ghi gì', async () => {
    const w = await world();
    const existing = await w.bookAtOtherDoctor();
    const before = await dataState(db);

    const { status, body } = await failureOf(w.create(0));

    expect(status).toBe(409);
    expect(body.maLoi).toBe('LICH_HEN_TRUNG_THOI_GIAN');
    expect(Object.keys(body.chiTiet as object).sort()).toStrictEqual([
      'maLichHen',
      'thoiGian',
    ]);
    expect(body.chiTiet).toMatchObject({ maLichHen: existing.maLichHen });
    expect(await dataState(db)).toStrictEqual(before);
  });

  it('DL-06 lịch của HỒ SƠ KHÁC (người thân cùng tài khoản) hoặc của bệnh nhân khác cùng giờ KHÔNG gây lỗi', async () => {
    const w = await world();
    await w.bookAtOtherDoctor({ hoSoNguoiThanId: w.relativeId });
    await w.bookAtOtherDoctor({ patientId: await strangerPatient() });

    await expect(w.create(0)).resolves.toMatchObject({
      trangThai: 'DaXacNhan',
    });
    await w.expectSettled(0);
  });

  it('DL-07 biên chạm đầu mút (lịch kia kết thúc đúng lúc ô này bắt đầu) ⇒ đặt được', async () => {
    const w = await world();
    await w.book('DaXacNhan', 0);

    await expect(w.create(1)).resolves.toMatchObject({
      trangThai: 'DaXacNhan',
    });
  });

  it('DL-08 hai hồ sơ CÙNG giờ ⇒ đặt được cả hai; cùng bác sĩ khác giờ ⇒ đặt được', async () => {
    const w = await world();
    await w.bookAtOtherDoctor();
    await w.book('DaXacNhan', 3, { hoSoNguoiThanId: w.relativeId });

    await expect(
      w.create(0, { hoSoNguoiThanId: w.relativeId }),
    ).resolves.toBeDefined();
    await expect(
      w.create(1, { hoSoNguoiThanId: w.relativeId }),
    ).resolves.toBeDefined();
    await w.expectSettled(1);
  });

  it('DL-09 số lịch tối đa (cấu hình 2): thiếu 1 ⇒ đặt được; đúng bằng ⇒ 409 chiTiet.toiDa', async () => {
    const w = await world();
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 2 });
    await w.book('DaXacNhan', 4);
    await expect(w.create(0)).resolves.toBeDefined();
    await w.book('DaXacNhan', 5);

    const { status, body } = await failureOf(w.create(1));

    expect(status).toBe(409);
    expect(body.maLoi).toBe('VUOT_SO_LICH_HEN_TOI_DA');
    expect(body.chiTiet).toStrictEqual({ toiDa: 2 });
  });

  it.each(['DaHuy', 'HoanThanh', 'VangMat', 'DaDoiLich'] as const)(
    'DL-09 lịch %s KHÔNG tính vào số lịch tối đa',
    async (trangThai) => {
      const w = await world();
      await fx.systemConfig({ soLichHenToiDaMoiHoSo: 2 });
      await w.book(trangThai, 4);
      await w.book(trangThai, 5);

      await expect(w.create(0)).resolves.toBeDefined();
    },
  );

  it('DL-09 lịch ChoThanhToan của chính mình CÓ tính', async () => {
    const w = await world();
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 2 });
    await w.book('ChoThanhToan', 4);
    await w.book('ChoThanhToan', 5);

    const { body } = await failureOf(w.create(0));

    expect(body.maLoi).toBe('VUOT_SO_LICH_HEN_TOI_DA');
  });

  it('DL-10 đồng hồ giả: now + 1s trước giờ bắt đầu ⇒ đặt được (now = giờ bắt đầu bị từ chối ở bảng trên)', async () => {
    const w = await world();
    vi.setSystemTime(new Date(SLOT_8H.getTime() - 1000));

    const result = await w.create(0);

    expect(result.trangThai).toBe('DaXacNhan');
    await w.expectSettled(0);
  });
});

describe('hết hạn lười (DL-05)', () => {
  const lapsedHolder = async (w: CreateWorld, han: Date) => {
    const holder = await strangerPatient();
    return w.book('ChoThanhToan', 0, { patientId: holder, hanThanhToan: han });
  };

  it.each([
    ['cọc 0đ', '0.00', 'DaXacNhan', 'DaDat', null],
    [
      'cọc > 0',
      '50000.00',
      'ChoThanhToan',
      'DangGiuCho',
      '2026-11-02 08:15:00',
    ],
  ])(
    'DL-05 (%s) khung giờ DangGiuCho đã quá hạn, job chưa quét ⇒ tạo được; lịch cũ DaHuy (ly_do_huy là hằng, thoi_diem_huy = now), khung giờ giữ cho người mới, MỘT giao dịch, INV',
    async (_name, tienCoc, trangThai, slotStatus, giuChoDen) => {
      const w = await world();
      await w.deposit(tienCoc);
      const old = await lapsedHolder(
        w,
        new Date(BOOKING_T0.getTime() - 60_000),
      );

      await w.create(0);

      const rows = await lichHenRows(db);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        id: String(old.lichHenId),
        trangThai: 'DaHuy',
        lyDoHuy: HOLD_EXPIRED_CANCEL_REASON,
        thoiDiemHuy: '2026-11-02 08:00:00',
        dangGiu: null,
      });
      expect(rows[1]).toMatchObject({
        trangThai,
        benhNhanId: w.patientId,
        dangGiu: w.slot(0),
      });
      expect(await fx.slotState(w.slot(0))).toStrictEqual({
        trangThai: slotStatus,
        giuChoDen,
      });
      await w.expectSettled(0);
    },
  );

  it('DL-05 biên nửa mở: giu_cho_den ĐÚNG BẰNG now là đã hết (HG-14) ⇒ tạo được; hơn now 1 giây (bảng trên) ⇒ KHUNG_GIO_DANG_GIU', async () => {
    const w = await world();
    await lapsedHolder(w, BOOKING_T0);

    await expect(w.create(0)).resolves.toBeDefined();
    await w.expectSettled(0);
  });

  it('DL-05 khung giờ hết hạn KHÔNG có lịch giữ (lời mời danh sách chờ hết hạn, waitlist chưa quét) ⇒ tạo được, khung giờ giữ cho người mới', async () => {
    const w = await world();
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'DangGiuCho', giu_cho_den = '2026-11-02 07:59:00' WHERE khung_gio_id = ?",
      [w.slot(0)],
    );

    await w.create(0);

    expect(await lichHenRows(db)).toHaveLength(1);
    expect((await fx.slotState(w.slot(0))).trangThai).toBe('DaDat');
    await w.expectSettled(0);
  });

  it('DL-05 lịch cũ của CHÍNH người đặt đã hết hạn không bị tính vào số lịch tối đa và không gây trùng giờ: đặt lại đúng khung giờ đó được', async () => {
    const w = await world();
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 1 });
    await w.book('ChoThanhToan', 0, {
      hanThanhToan: new Date(BOOKING_T0.getTime() - 60_000),
    });

    await expect(w.create(0)).resolves.toBeDefined();
    await w.expectSettled(0);
  });
});

describe('DL-14 kiểm lại cờ no-show DƯỚI khoá benh_nhan', () => {
  it('checks ok, rồi cờ no-show bật, rồi tạo ⇒ 403 DAT_LICH_BI_KHOA_NO_SHOW; lịch đã có KHÔNG bị huỷ', async () => {
    const w = await world();
    await w.create(1);
    await expect(w.check(0)).resolves.toBeDefined();
    await w.lockNoShow();
    const before = await dataState(db);

    const { status, body } = await failureOf(w.create(0));

    expect(status).toBe(403);
    expect(body.maLoi).toBe('DAT_LICH_BI_KHOA_NO_SHOW');
    expect(await dataState(db)).toStrictEqual(before);
    expect((await lichHenRows(db)).map((r) => r.trangThai)).toStrictEqual([
      'DaXacNhan',
    ]);
  });
});

describe('DL-17, DL-18 cổng chạy DƯỚI khoá bac_si FOR SHARE (H5, H6)', () => {
  it('cả hai cổng được gọi khi bac_si đang bị khoá kiểu SHARE: một kết nối khác xin FOR UPDATE NOWAIT bị từ chối (3572), nhưng FOR SHARE NOWAIT thì được (không phải FOR UPDATE)', async () => {
    const w = await world();
    const seen: Record<string, (number | null)[]> = {
      leaveUpdate: [],
      leaveShare: [],
      pendingUpdate: [],
    };
    w.leave.findBlockingLeaveCall.onCall(async () => {
      seen.leaveUpdate!.push(await lockDoctor(w, 'UPDATE'));
      seen.leaveShare!.push(await lockDoctor(w, 'SHARE'));
    });
    w.pending.findBlockingCall.onCall(async () => {
      seen.pendingUpdate!.push(await lockDoctor(w, 'UPDATE'));
    });

    await w.create(0);

    expect(seen).toStrictEqual({
      leaveUpdate: [ER_LOCK_NOWAIT],
      leaveShare: [null],
      pendingUpdate: [ER_LOCK_NOWAIT],
    });
    // sau commit không còn khoá nào
    expect(await lockDoctor(w, 'UPDATE')).toBeNull();
  });
});

describe('DL-22 mã lịch hẹn', () => {
  it('ngày trong mã là ngày Việt Nam của now (17:30 UTC ngày 02/11 đã là 03/11): CLX-20261103-', async () => {
    const w = await world();
    vi.setSystemTime(new Date('2026-11-02T18:00:00Z'));

    await w.create(0);

    expect((await lichHenRows(db))[0]!.ma).toMatch(
      /^CLX-20261103-[0-9A-HJKMNP-TV-Z]{5}$/,
    );
  });

  it('mã thật (crypto.randomInt) của nhiều lịch: đúng dạng, không I L O U, không trùng nhau', async () => {
    const w = await world();
    const patients = [
      w.patientId,
      ...(await fx.patients(4)).map((p) => p.account.taiKhoanId),
    ];

    for (const [index, accountId] of patients.entries())
      await w.create(index, {}, accountId);

    const codes = (await lichHenRows(db)).map((r) => r.ma);
    expect(codes).toHaveLength(5);
    expect(new Set(codes).size).toBe(5);
    for (const code of codes) expect(code).toMatch(APPOINTMENT_CODE_PATTERN);
  });

  it('1062 trên ma_lich_hen ⇒ sinh LẠI mã trong CÙNG giao dịch rồi tạo được; lịch đã có không bị động tới', async () => {
    const draws = ['AAAAA', 'BBBBB'];
    let next = 0;
    const w = await world({
      random: () => draws[Math.min(next++, draws.length - 1)]!,
    });
    await w.book('DaXacNhan', 5, {
      patientId: await strangerPatient(),
      maLichHen: 'CLX-20261102-AAAAA',
    });

    const result = await w.create(0);

    expect(result.maLichHen).toBe('CLX-20261102-BBBBB');
    expect(next).toBe(2);
    expect((await lichHenRows(db)).map((r) => r.ma)).toStrictEqual([
      'CLX-20261102-AAAAA',
      'CLX-20261102-BBBBB',
    ]);
    await w.expectSettled(0);
  });

  it('hết 5 lần chèn vẫn trùng ⇒ Error thường (500 LOI_HE_THONG, KHÔNG AppException); không ghi gì; đã thử đúng 5 lần', async () => {
    let draws = 0;
    const w = await world({
      random: () => {
        draws += 1;
        return 'AAAAA';
      },
    });
    await w.book('DaXacNhan', 5, {
      patientId: await strangerPatient(),
      maLichHen: 'CLX-20261102-AAAAA',
    });
    const before = await dataState(db);

    const error: unknown = await w.create(0).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    expect(draws).toBe(5);
    expect(await dataState(db)).toStrictEqual(before);
    await w.expectSettled(0);
  });
});

describe('DL-27 hỏng giữa giao dịch ⇒ hoàn tác TRỌN (mỗi bước cho chạy thật rồi mới ném)', () => {
  // COUNT(*) có thể ra số hoặc chuỗi tuỳ driver: luôn đổi sang số
  const thongBaoCount = async (runner: {
    query(sql: string): Promise<unknown>;
  }) =>
    Number(
      (
        (await runner.query('SELECT COUNT(*) AS n FROM thong_bao')) as {
          n: unknown;
        }[]
      )[0]!.n,
    );

  const rolledBack = async (w: CreateWorld, before: unknown) => {
    expect(await dataState(db)).toStrictEqual(before);
    expect(await lichHenRows(db)).toHaveLength(0);
    expect(await fx.slotState(w.slot(0))).toStrictEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
    expect(await thongBaoCount(db)).toBe(0);
    await w.expectSettled(0);
  };

  it.each([
    ['INSERT lich_hen', /^INSERT INTO lich_hen\b/],
    [
      'UPDATE khung_gio (hold)',
      /^UPDATE khung_gio SET trang_thai = 'DangGiuCho'/,
    ],
    [
      'UPDATE khung_gio (markBooked)',
      /^UPDATE khung_gio SET trang_thai = 'DaDat'/,
    ],
  ])(
    'lỗi SAU câu %s đã chạy thật (cọc 0đ) ⇒ hoàn tác trọn; lỗi đi nguyên ra; cổng ghi chưa được gọi tới câu hỏng thì không để lại gì',
    async (_name, pattern) => {
      const w = await world();
      const before = await dataState(db);
      const matched = failAfterStatement(db, pattern, BOOM);

      await expect(w.create(0)).rejects.toBe(BOOM);

      expect(matched.length).toBeGreaterThanOrEqual(1);
      await rolledBack(w, before);
    },
  );

  it('lỗi ở recordZeroPayment (sau INSERT và hai UPDATE khung giờ đã chạy thật) ⇒ hoàn tác trọn, notify chưa gọi', async () => {
    const w = await world();
    const before = await dataState(db);
    w.payment.recordZeroPaymentCall.throwsOnce(BOOM);

    await expect(w.create(0)).rejects.toBe(BOOM);

    expect(w.notifier.notifyCall.count).toBe(0);
    await rolledBack(w, before);
  });

  it('lỗi ở ghi thông báo SAU KHI hàng thong_bao đã được ghi trong giao dịch ⇒ hàng đó cũng bị hoàn tác (thông báo cùng giao dịch)', async () => {
    const w = await world();
    const before = await dataState(db);
    w.notifier.notifyCall
      .onCall(async (em, event) => {
        await em.query(
          'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, ?, ?, ?, NOW())',
          [event.taiKhoanId, 'TAO-DL27', event.loaiSuKien, event.lichHenId],
        );
        // hàng đã thấy được TRONG giao dịch, chưa thấy được từ kết nối khác
        expect(await thongBaoCount(em)).toBe(1);
        expect(await thongBaoCount(db)).toBe(0);
      })
      .throwsOnce(BOOM);

    await expect(w.create(0)).rejects.toBe(BOOM);

    await rolledBack(w, before);
  });

  it.each([
    ['INSERT lich_hen', /^INSERT INTO lich_hen\b/],
    [
      'UPDATE khung_gio (hold)',
      /^UPDATE khung_gio SET trang_thai = 'DangGiuCho'/,
    ],
  ])(
    'cọc > 0: lỗi SAU câu %s đã chạy thật ⇒ hoàn tác trọn như cọc 0đ',
    async (_name, pattern) => {
      const w = await world();
      await w.deposit('50000.00');
      const before = await dataState(db);
      failAfterStatement(db, pattern, BOOM);

      await expect(w.create(0)).rejects.toBe(BOOM);

      await rolledBack(w, before);
    },
  );
});

describe('DL-28 lưới an toàn cuối: 1062 trên khung_gio_dang_giu', () => {
  it('khung giờ ConTrong nhưng đã có lịch ĐANG HOẠT ĐỘNG giữ nó (dữ liệu lệch, luật không thấy) ⇒ 409 KHUNG_GIO_DA_DAT, không 500; không thêm lịch nào; hoàn tác', async () => {
    const w = await world();
    const holder = await strangerPatient();
    await w.book('DaXacNhan', 0, { patientId: holder });
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL WHERE khung_gio_id = ?",
      [w.slot(0)],
    );
    const before = await dataState(db);

    const { status, body } = await failureOf(w.create(0));

    expect(status).toBe(409);
    expect(body.maLoi).toBe('KHUNG_GIO_DA_DAT');
    expect(await dataState(db)).toStrictEqual(before);
    expect(w.payment.recordZeroPaymentCall.count).toBe(0);
    // dữ liệu dựng cố ý lệch (INV-04 vỡ từ trước), nên chỉ kiểm khoá đã nhả
    expect(await lockDoctor(w, 'UPDATE')).toBeNull();
  });
});

describe('KT-04, KT-05 hợp đồng khoá với patient', () => {
  it('KT-04 (NT-24) giao dịch tạo cho hồ sơ người thân: hai câu ĐẦU chạm bảng là benh_nhan FOR UPDATE rồi ho_so_nguoi_than FOR UPDATE; trước chúng chỉ có SELECT @@ và SET SESSION của withBookingTransaction (không chạm bảng); không câu đọc thường nào chen trước', async () => {
    const w = await world();
    const statements = recordStatements(db);

    await w.create(0, { hoSoNguoiThanId: w.relativeId });

    const tx = transactionOf(statements);
    const isSetup = (sql: string) => /^\s*(SELECT @@|SET )/i.test(sql);
    const firstReal = tx.findIndex((sql) => !isSetup(sql));
    expect(tx.slice(0, firstReal).every(isSetup)).toBe(true);
    const [first, second, third] = tx.slice(firstReal);
    expect(isLockingStatement(first!)).toBe(true);
    expect(firstTableOf(first!)).toBe('benh_nhan');
    expect(isLockingStatement(second!)).toBe(true);
    expect(firstTableOf(second!)).toBe('ho_so_nguoi_than');
    // câu thứ ba là câu đọc thường biết khoá bac_si nào cần xin (BookabilityReader)
    expect(isLockingStatement(third!)).toBe(false);
  });

  it('KT-05 isVisitProfileUsable: hồ sơ đã ngừng ⇒ false, của bệnh nhân khác ⇒ false, đang hiệu lực ⇒ true; và đường tạo cho ba kết quả tương ứng 409, 404, đặt được', async () => {
    const w = await world();
    const theirs = await fx.relative(await strangerPatient());
    const usable = (id: string) =>
      db.transaction('READ COMMITTED', (em) =>
        isVisitProfileUsable(em, w.patientId, id),
      );

    expect(await usable(w.stoppedRelativeId)).toBe(false);
    expect(await usable(theirs)).toBe(false);
    expect(await usable(w.relativeId)).toBe(true);
    expect(
      (await failureOf(w.create(0, { hoSoNguoiThanId: w.stoppedRelativeId })))
        .body.maLoi,
    ).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    expect(
      (await failureOf(w.create(0, { hoSoNguoiThanId: theirs }))).body.maLoi,
    ).toBe('KHONG_TIM_THAY');
    await expect(
      w.create(0, { hoSoNguoiThanId: w.relativeId }),
    ).resolves.toMatchObject({ trangThai: 'DaXacNhan' });
  });
});

describe('TAO-06 đường GHI chỉ chạy đúng các câu dự kiến, khoá đúng thứ tự (PLAN 5.3, AR-06)', () => {
  it.each([
    ['cọc > 0', '50000.00', ['INSERT INTO lich_hen', 'UPDATE khung_gio']],
    [
      'cọc 0đ',
      '0.00',
      ['INSERT INTO lich_hen', 'UPDATE khung_gio', 'UPDATE khung_gio'],
    ],
  ])(
    '%s: các câu GHI là %j (không UPDATE lich_hen, không ghi thong_bao); khoá theo thứ tự benh_nhan → bac_si → khung_gio (không lich_hen)',
    async (_name, tienCoc, expectedWrites) => {
      const w = await world();
      await w.deposit(tienCoc);
      const statements = recordStatements(db);

      await w.create(0);

      const tx = transactionOf(statements);
      expect(writeTargets(tx)).toStrictEqual(expectedWrites);
      const tables = tx.filter(isLockingStatement).map(firstTableOf);
      expect(tables).toStrictEqual(['benh_nhan', 'bac_si', 'khung_gio']);
      expect(findLockOrderViolation(tables as string[])).toBeNull();
    },
  );

  it('hồ sơ người thân: khoá benh_nhan → ho_so_nguoi_than → bac_si → khung_gio (tầng 2, 3, 4, 5)', async () => {
    const w = await world();
    const statements = recordStatements(db);

    await w.create(0, { hoSoNguoiThanId: w.relativeId });

    const tables = transactionOf(statements)
      .filter(isLockingStatement)
      .map(firstTableOf);
    expect(tables).toStrictEqual([
      'benh_nhan',
      'ho_so_nguoi_than',
      'bac_si',
      'khung_gio',
    ]);
    expect(findLockOrderViolation(tables as string[])).toBeNull();
  });

  it('hết hạn lười: thêm khoá lich_hen THEO KHOÁ CHÍNH SAU khung_gio (tầng 6 sau tầng 5), không khoá theo khung_gio_id', async () => {
    const w = await world();
    await w.book('ChoThanhToan', 0, {
      patientId: await strangerPatient(),
      hanThanhToan: new Date(BOOKING_T0.getTime() - 60_000),
    });
    const statements = recordStatements(db);

    await w.create(0);

    const locking = transactionOf(statements).filter(isLockingStatement);
    const tables = locking.map(firstTableOf);
    expect(tables).toStrictEqual([
      'benh_nhan',
      'bac_si',
      'khung_gio',
      'lich_hen',
    ]);
    expect(findLockOrderViolation(tables as string[])).toBeNull();
    expect(locking[3]).toMatch(/WHERE lich_hen_id = \?/);
  });

  it('bị từ chối (khung giờ đã DaDat) ⇒ giao dịch KHÔNG có câu ghi nào', async () => {
    const w = await world();
    await w.book('DaXacNhan', 0, { patientId: await strangerPatient() });
    const statements = recordStatements(db);

    await failureOf(w.create(0));

    expect(writeTargets(transactionOf(statements))).toStrictEqual([]);
  });
});

describe('TAO-10 thân chạy lại sau deadlock (1213) không để lại gì', () => {
  it('lỗi 1213 giả NGAY SAU INSERT lich_hen đã chạy thật ⇒ withBookingTransaction thử lại: đúng MỘT lịch, mã MỚI (sinh trong thân), now không đổi, cổng chỉ gọi ở lần chạy thành công', async () => {
    const draws = ['AAAA1', 'BBBB2', 'CCCC3'];
    let next = 0;
    const w = await world({ random: () => draws[next++]! });
    const matched = failAfterStatement(
      db,
      /^INSERT INTO lich_hen\b/,
      deadlockError(),
    );

    const result = await w.create(0);

    expect(matched).toHaveLength(2);
    expect(matched.map((call) => call.params?.[0])).toStrictEqual([
      'CLX-20261102-AAAA1',
      'CLX-20261102-BBBB2',
    ]);
    // hai lần chạy dùng CÙNG mốc now (thoi_diem_tao là tham số cuối của INSERT)
    expect(matched[0]!.params?.[14]).toStrictEqual(matched[1]!.params?.[14]);
    const rows = await lichHenRows(db);
    expect(rows.map((r) => r.ma)).toStrictEqual(['CLX-20261102-BBBB2']);
    expect(result.maLichHen).toBe('CLX-20261102-BBBB2');
    expect(w.payment.recordZeroPaymentCall.count).toBe(1);
    expect(w.notifier.notifyCall.count).toBe(1);
    await w.expectSettled(0);
  });
});

describe('TAO-11 hai lối vào DaXacNhan (INSERT của B8 và confirmPaid của B11) cùng giữ INV-01…INV-05', () => {
  it('cọc 0đ (INSERT thẳng DaXacNhan) và cọc > 0 rồi confirmPaid giả (ChoThanhToan → DaXacNhan) cho CÙNG trạng thái cuối: lịch DaXacNhan, han_thanh_toan NULL, khung giờ DaDat, giu_cho_den NULL, khung_gio_dang_giu = khung_gio_id; INV đúng ở từng bước', async () => {
    const w = await world();

    // Lối 1: cọc 0đ, xác nhận ngay lúc tạo
    await w.create(0);
    await assertBookingInvariants(db);
    // Lối 2: cọc > 0, dừng ở ChoThanhToan, rồi xác nhận thanh toán
    await w.deposit('50000.00');
    await w.create(1);
    await assertBookingInvariants(db);
    const [, pending] = await lichHenRows(db);
    expect(pending).toMatchObject({ trangThai: 'ChoThanhToan' });
    expect(await fx.slotState(w.slot(1))).toStrictEqual({
      trangThai: 'DangGiuCho',
      giuChoDen: '2026-11-02 08:15:00',
    });
    await simulateConfirmPaid(db, {
      khungGioId: w.slot(1),
      lichHenId: pending!.id,
    });
    await assertBookingInvariants(db);

    const [viaCreate, viaConfirm] = await lichHenRows(db);
    for (const [row, index] of [
      [viaCreate!, 0],
      [viaConfirm!, 1],
    ] as const) {
      expect(row).toMatchObject({
        trangThai: 'DaXacNhan',
        han: null,
        khungGioId: w.slot(index),
        dangGiu: w.slot(index),
      });
      expect(await fx.slotState(w.slot(index))).toStrictEqual({
        trangThai: 'DaDat',
        giuChoDen: null,
      });
    }
    await w.expectSettled(1);
  });
});
