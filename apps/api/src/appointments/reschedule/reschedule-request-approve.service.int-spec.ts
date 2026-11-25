import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AuditRepository } from '../../audit/audit.repository.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { secondDoctorOf } from '../testing/create-appointment-world.js';
import { lockedTablesOfDistinct } from '../testing/lock-chain.js';
import { appFailure } from '../testing/patient-reschedule-world.js';
import {
  FlakyAudit,
  FlakyNotifier,
  HANDLED_AT,
  HANDLING_NOTE,
  requestHandleWorld,
  type RequestHandleWorld,
  type RequestHandleWorldOptions,
} from '../testing/reschedule-request-handle-world.js';
import { insertRequestAt } from '../testing/reschedule-request-world.js';
import { buildRescheduleChain } from '../testing/reschedule-world.js';
import {
  interceptStatements,
  type StatementCall,
} from '../testing/statement-recorder.js';

// reschedule B9 — DUYỆT yêu cầu đổi lịch: `RescheduleRequestApproveService` THẬT trên MySQL 8.4 THẬT (PLAN reschedule 5.5, 5.7, 5.11, 7.4; TRACKING reschedule 1.13): lõi B4 `DuyetYeuCau`, `ReceptionScopeService`,
// `AuditService`, `BookingNotifier` và repository đều là bản THẬT. Phủ XDL-06, 07, 10, 11, 12, 14, 43, 44, 46, 47, 48 và NDL-05, 26, 28 (phần duyệt). Từ chối: reschedule-request-reject.service.int-spec.ts; đồng thời:
// reschedule-request-handle.concurrency.int-spec.ts. Ô i của thế giới bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026 (thứ Ba); đồng hồ giả là 08:00 ngày 02/11/2026. Mọi dữ liệu là giả.
const GIO = (time: string) =>
  new Date(`2026-11-10T${time.length === 5 ? `${time}:00` : time}+07:00`);
const NOT_FOUND_BODY = {
  maLoi: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
  thongBao: 'Không tìm thấy yêu cầu đổi lịch.',
};
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const world = (options?: RequestHandleWorldOptions) =>
  requestHandleWorld(db, fx, options);

/** Mọi bảng đã nêu của một lần duyệt thành công: hàng yêu cầu, Audit và thông báo (đúng MỘT mỗi loại). */
async function expectOneApproval(
  w: RequestHandleWorld,
  input: {
    yeuCauId: string;
    lichHenId: string;
    maLichHen: string;
    maLichHenMoi: string;
    handlerId: string;
    ghiChu?: string;
  },
) {
  const ghiChu = input.ghiChu ?? HANDLING_NOTE;
  expect(await w.requestRow(input.yeuCauId)).toMatchObject({
    trangThai: 'DaDuyet',
    ghiChuXuLy: ghiChu,
    nguoiXuLyId: input.handlerId,
    thoiDiemXuLy: HANDLED_AT,
    lichHenId: input.lichHenId,
  });
  expect(await w.auditRows()).toEqual([
    {
      taiKhoanId: input.handlerId,
      chiNhanhId: w.branchId,
      hanhDong: 'XuLyDoiLichNgoaiChinhSach',
      loaiDoiTuong: 'yeu_cau_doi_lich_ngoai_chinh_sach',
      maDoiTuong: input.yeuCauId,
      ketQua: 'ThanhCong',
      chiTiet: {
        truoc: { trang_thai: 'ChoDuyet' },
        sau: { trang_thai: 'DaDuyet' },
        ghi_chu: ghiChu,
        ma_lich_hen_cu: input.maLichHen,
        ma_lich_hen_moi: input.maLichHenMoi,
      },
    },
  ]);
  const notices = await w.notices();
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({
    loai: 'YeuCauDoiLichDaDuyet',
    taiKhoanId: w.patientId,
    lichHenId: null,
    yeuCauId: input.yeuCauId,
    emailTrangThai: 'ChoGui',
  });
}

describe('XDL-06, XDL-47, XDL-48 duyệt vào khung giờ mong muốn còn trống', () => {
  it('Lễ tân: 200; lịch mới nối chuỗi, bộ đếm GIỮ NGUYÊN; lịch cũ DaDoiLich; khung giờ cũ trống, mới đã đặt; yêu cầu DaDuyet kèm ghi chú, người và thời điểm xử lý, khung giờ mong muốn không đổi; ĐÚNG một Audit và một thông báo (không LichHenDaDoiLich); mời danh sách chờ đúng một lần; INV-1…INV-10', async () => {
    const w = await world();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const money = await w.moneyBefore();

    const result = await w.approve(yeuCauId);

    expect(Object.keys(result).sort()).toEqual([
      'lichHenMoi',
      'thoiGianMayChu',
      'yeuCau',
    ]);
    expect(result).toMatchObject({
      yeuCau: { trangThai: 'DaDuyet' },
      lichHenMoi: {
        trangThai: 'DaXacNhan',
        thoiGian: '2026-11-10T02:00:00.000Z',
      },
    });
    const newId = await w.idOfCode(result.lichHenMoi.maLichHen);
    const row = await w.rowOf(newId);
    expect(row).toMatchObject({
      trangThai: 'DaXacNhan',
      truoc: lich.lichHenId,
      khungGioId: w.slot(2),
      hanThanhToan: null,
      benhNhanId: w.patientId,
      chiNhanhId: w.branchId,
      gia: '200000.00',
      coc: '50000.00',
    });
    expect(Number(row.soLan)).toBe(2);
    expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaDoiLich');
    await w.expectSlot(0, 'ConTrong');
    await w.expectSlot(2, 'DaDat');
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      khungGioMongMuonId: w.slot(2),
    });
    await expectOneApproval(w, {
      yeuCauId,
      lichHenId: lich.lichHenId,
      maLichHen: lich.maLichHen,
      maLichHenMoi: result.lichHenMoi.maLichHen,
      handlerId: w.receptionId,
    });
    expect(w.waitlist.releasedSlotIds).toEqual([w.slot(0)]);
    await w.expectSettled(money);
  });

  it.each(['all', 'branch'] as const)(
    'Quản trị viên %s: 200; người xử lý và Audit là Quản trị viên; branchId VẪN là chi nhánh của lịch (kể cả Toàn hệ thống); thông báo gửi cho tài khoản ĐẶT, không cho Quản trị viên',
    async (kind) => {
      const w = await world();
      const handler = await w.admin(kind);
      const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });

      const result = await w.approveAs(handler, yeuCauId);

      await expectOneApproval(w, {
        yeuCauId,
        lichHenId: lich.lichHenId,
        maLichHen: lich.maLichHen,
        maLichHenMoi: result.lichHenMoi.maLichHen,
        handlerId: handler.accountId,
      });
      await w.expectSettled();
    },
  );

  it('XDL-47 id yêu cầu lớn hơn 2^53 đi NGUYÊN đường dẫn tới hàng, Audit và thông báo (không ép số)', async () => {
    const w = await world();
    await db.query(
      'ALTER TABLE yeu_cau_doi_lich_ngoai_chinh_sach AUTO_INCREMENT = 9007199254740993',
    );
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    expect(BigInt(yeuCauId) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);

    const result = await w.approve(yeuCauId);

    await expectOneApproval(w, {
      yeuCauId,
      lichHenId: lich.lichHenId,
      maLichHen: lich.maLichHen,
      maLichHenMoi: result.lichHenMoi.maLichHen,
      handlerId: w.receptionId,
    });
  });

  it('XDL-48 thông báo có mã lịch mới và ghi chú nguyên văn; thư là dòng hộp thư đi ChoGui (worker gửi sau); chỉ MỘT thông báo trong cả hệ thống', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });

    const result = await w.approve(yeuCauId);

    const [notice] = await w.notices();
    expect(notice?.noiDung).toContain(result.lichHenMoi.maLichHen);
    expect(notice?.noiDung).toContain(HANDLING_NOTE);
    expect(notice?.noiDung.length).toBeLessThanOrEqual(500);
    expect(await w.countRows('thong_bao')).toBe(1);
    expect(await w.countRows('email_thong_bao')).toBe(1);
  });
});

describe('XDL-07 khung giờ mong muốn đã bị chiếm: 409, rồi duyệt khung giờ THAY THẾ', () => {
  it('KHUNG_GIO_DA_DAT: yêu cầu VẪN ChoDuyet, lịch không đổi, 0 Audit, 0 thông báo; duyệt khungGioId thay thế thành công, Audit ghi mã lịch MỚI, khung giờ mong muốn của yêu cầu giữ nguyên', async () => {
    const w = await world();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const [other] = await fx.patients(1);
    await w.book(2, { patientId: other!.account.taiKhoanId });
    const base = await w.untouched();

    const failure = await appFailure(w.approve(yeuCauId));

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('KHUNG_GIO_DA_DAT');
    expect(await w.untouched()).toEqual(base);
    expect((await w.requestRow(yeuCauId)).trangThai).toBe('ChoDuyet');

    const result = await w.approve(yeuCauId, {
      ghiChu: HANDLING_NOTE,
      khungGioId: w.slot(4),
    });

    expect(result.lichHenMoi.thoiGian).toBe('2026-11-10T03:00:00.000Z');
    const row = await w.rowOf(await w.idOfCode(result.lichHenMoi.maLichHen));
    expect(row.khungGioId).toBe(w.slot(4));
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      trangThai: 'DaDuyet',
      khungGioMongMuonId: w.slot(2),
    });
    const [entry] = await w.auditRows();
    expect(entry?.chiTiet).toMatchObject({
      ma_lich_hen_cu: lich.maLichHen,
      ma_lich_hen_moi: result.lichHenMoi.maLichHen,
    });
    await w.expectSlot(2, 'DaDat');
    await w.expectSlot(4, 'DaDat');
    await w.expectSettled();
  });
});

describe('XDL-43 khung giờ THAY THẾ sai: lỗi của bộ luật B4, yêu cầu vẫn ChoDuyet và không ghi gì', () => {
  it.each([
    ['cùng khung giờ với lịch CŨ', 'KHUNG_GIO_TRUNG_LICH_CU', 409],
    ['không tồn tại', 'KHUNG_GIO_KHONG_TON_TAI', 404],
    ['của bác sĩ KHÁC', 'KHUNG_GIO_KHAC_BAC_SI', 409],
  ] as const)('khungGioId %s ⇒ %s', async (name, maLoi, status) => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const khungGioId =
      name === 'cùng khung giờ với lịch CŨ'
        ? w.slot(0)
        : name === 'không tồn tại'
          ? '999999999'
          : (await secondDoctorOf(fx, w.branch)).slotIds[2]!;
    const base = await w.untouched();

    const failure = await appFailure(
      w.approve(yeuCauId, { ghiChu: HANDLING_NOTE, khungGioId }),
    );

    expect(failure.status).toBe(status);
    expect(failure.body.maLoi).toBe(maLoi);
    expect(await w.untouched()).toEqual(base);
    expect((await w.requestRow(yeuCauId)).trangThai).toBe('ChoDuyet');
  });
});

describe('XDL-44 mọi từ chối có kiểu của B4: giữ ChoDuyet, 0 Audit, 0 thông báo, 0 lịch mới', () => {
  const REFUSALS: {
    name: string;
    maLoi: string;
    setup: (w: RequestHandleWorld) => void | Promise<void>;
  }[] = [
    {
      name: 'khung giờ đang được giữ chỗ',
      maLoi: 'KHUNG_GIO_DANG_GIU',
      setup: async (w) => {
        const [other] = await fx.patients(1);
        await fx.appointmentIn('ChoThanhToan', {
          doctor: w.doctor,
          khungGioId: w.slot(2),
          patientId: other!.account.taiKhoanId,
        });
        vi.setSystemTime(new Date('2026-11-02T08:05:00+07:00'));
      },
    },
    {
      name: 'bác sĩ có nghỉ phép đã duyệt',
      maLoi: 'BAC_SI_NGHI_PHEP',
      setup: (w) => {
        w.leave.blocks({}, 'DaDuyet');
      },
    },
    {
      name: 'khung giờ nằm vùng bị loại bởi thay đổi chi nhánh',
      maLoi: 'KHUNG_GIO_NGOAI_LICH_MOI',
      setup: (w) => {
        w.pending.blocks();
      },
    },
  ];

  it.each(REFUSALS)('$name ⇒ $maLoi', async ({ maLoi, setup }) => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    await setup(w);
    const base = await w.untouched();

    const failure = await appFailure(w.approve(yeuCauId));

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe(maLoi);
    expect(await w.untouched()).toEqual(base);
    expect(await w.countRows('thong_bao')).toBe(0);
  });

  it('hồ sơ người thân đã ngừng ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, {
      hoSoNguoiThanId: w.stoppedRelativeId,
    });
    const base = await w.untouched();
    const failure = await appFailure(w.approve(yeuCauId));
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    expect(await w.untouched()).toEqual(base);
  });

  it('chuỗi 19 lịch ⇒ 409 CHUOI_DOI_LICH_QUA_DAI', async () => {
    const w = await world();
    const long = await buildRescheduleChain(db, fx, {
      doctor: w.doctor,
      patientId: w.patientId,
      khungGioId: w.slot(0),
      length: 19,
    });
    const yeuCauId = await insertRequestAt(db, {
      lichHenId: long.lichHenId,
      khungGioMongMuonId: w.slot(2),
      thoiDiemTao: '2026-11-01 09:00:00',
    });
    const base = await w.untouched();
    const failure = await appFailure(w.approve(yeuCauId));
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('CHUOI_DOI_LICH_QUA_DAI');
    expect(await w.untouched()).toEqual(base);
  });

  it('thiếu cấu hình hệ thống ⇒ 409 HE_THONG_CHUA_CAU_HINH (B4 ném trước mọi giao dịch), yêu cầu vẫn ChoDuyet', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    await db.query('DELETE FROM cau_hinh_he_thong');
    const base = await w.untouched();
    const failure = await appFailure(w.approve(yeuCauId));
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    expect(await w.untouched()).toEqual(base);
  });
});

describe('XDL-10 duyệt hai lần, duyệt sau từ chối: 409 YEU_CAU_DA_XU_LY, không ghi thêm', () => {
  it('duyệt lần hai ⇒ 409; Audit, thông báo, lịch và yêu cầu giữ nguyên như sau lần một', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    await w.approve(yeuCauId);
    const base = await w.untouched();
    const notices = await w.notices();

    const failure = await appFailure(w.approve(yeuCauId));

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('YEU_CAU_DA_XU_LY');
    expect(await w.untouched()).toEqual(base);
    expect(await w.notices()).toEqual(notices);
    await w.expectSettled();
  });

  it('duyệt sau TỪ CHỐI ⇒ 409; yêu cầu vẫn TuChoi, lịch gốc không đổi, không lịch mới', async () => {
    const w = await world();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    await w.reject(yeuCauId);
    const base = await w.untouched();

    const failure = await appFailure(w.approve(yeuCauId));

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('YEU_CAU_DA_XU_LY');
    expect(await w.untouched()).toEqual(base);
    expect((await w.requestRow(yeuCauId)).trangThai).toBe('TuChoi');
    expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaXacNhan');
  });
});

describe('XDL-11 lịch gốc không còn đổi được: duyệt 409 LICH_HEN_KHONG_CHO_DOI kèm trạng thái, yêu cầu vẫn ChoDuyet', () => {
  it.each(['DaHuy', 'DaTiepDon', 'VangMat', 'DaDoiLich'] as const)(
    'lịch gốc %s',
    async (state) => {
      const w = await world();
      const { yeuCauId } = await w.openRequest(0, 2, { state });
      const base = await w.untouched();

      const failure = await appFailure(w.approve(yeuCauId));

      expect(failure.status).toBe(409);
      expect(failure.body.maLoi).toBe('LICH_HEN_KHONG_CHO_DOI');
      expect(failure.body.chiTiet).toMatchObject({ trangThai: state });
      expect(await w.untouched()).toEqual(base);
      expect((await w.requestRow(yeuCauId)).trangThai).toBe('ChoDuyet');
    },
  );
});

describe('XDL-12 quá hạn duyệt: nửa mở tại giờ hẹn + check_in_sau_phut', () => {
  it('lịch 08:30 (hạn 08:45): 08:45 ⇒ 409 LICH_HEN_DA_QUA_GIO, không ghi gì; 08:44:59 ⇒ duyệt được và không mời danh sách chờ (giờ cũ ≤ now)', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(1, 4, { soLan: 2 });
    vi.setSystemTime(GIO('08:45'));
    const base = await w.untouched();

    const late = await appFailure(w.approve(yeuCauId));

    expect(late.status).toBe(409);
    expect(late.body.maLoi).toBe('LICH_HEN_DA_QUA_GIO');
    expect(await w.untouched()).toEqual(base);

    vi.setSystemTime(GIO('08:44:59'));
    const ok = await w.approve(yeuCauId);

    expect(ok.yeuCau.trangThai).toBe('DaDuyet');
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      thoiDiemXuLy: '2026-11-10 08:44:59',
    });
    expect(w.waitlist.releasedSlotIds).toEqual([]);
    await w.expectSettled();
  });
});

describe('XDL-14 lỗi Audit hay thông báo ⇒ hoàn tác TRỌN: yêu cầu vẫn ChoDuyet, không lịch mới, không thông báo, không thư', () => {
  it('M7 AuditError NỔI nguyên (Audit ghi xong dòng rồi ném); mọi thứ về đúng trạng thái trước; lần sau Audit lành duyệt được', async () => {
    const audit = new FlakyAudit(new AuditRepository());
    const w = await world({ audit });
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 1 });
    const base = await w.untouched();
    const rowBefore = await w.rawRow(lich.lichHenId);

    await expect(w.approve(yeuCauId)).rejects.toMatchObject({
      name: 'AuditError',
      code: 'AUDIT_WRITE_FAILED',
    });

    expect(await w.untouched()).toEqual(base);
    expect(await w.auditCount()).toBe(0);
    expect(await w.countRows('thong_bao')).toBe(0);
    expect(await w.countRows('email_thong_bao')).toBe(0);
    expect(await w.rawRow(lich.lichHenId)).toEqual(rowBefore);
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      trangThai: 'ChoDuyet',
      ghiChuXuLy: null,
      nguoiXuLyId: null,
      thoiDiemXuLy: null,
    });
    expect(w.waitlist.releasedSlotIds).toEqual([]);
    await w.expectSlot(0, 'DaDat');
    await w.expectSlot(2, 'ConTrong');
    await w.expectSettled();

    audit.failing = false;
    const retry = await w.approve(yeuCauId);
    expect(retry.yeuCau.trangThai).toBe('DaDuyet');
    expect(await w.auditCount()).toBe(1);
    await w.expectSettled();
  });

  it('lỗi ghi thông báo SAU Audit và SAU UPDATE yêu cầu: dòng Audit, UPDATE yêu cầu, lịch mới đều bị hoàn tác', async () => {
    const notifier = new FlakyNotifier();
    const w = await world({ notifier });
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 1 });
    const base = await w.untouched();

    await expect(w.approve(yeuCauId)).rejects.toThrow('ghi thông báo lỗi');

    expect(await w.untouched()).toEqual(base);
    expect(await w.auditCount()).toBe(0);
    expect((await w.requestRow(yeuCauId)).trangThai).toBe('ChoDuyet');
    expect(await w.countRows('thong_bao')).toBe(0);
    await w.expectSettled();

    notifier.failing = false;
    expect((await w.approve(yeuCauId)).yeuCau.trangThai).toBe('DaDuyet');
    await w.expectSettled();
  });
});

describe('XDL-46 thứ tự khoá của duyệt theo PLAN reschedule 5.4', () => {
  it('chuỗi khoá THẬT có đủ benh_nhan, bac_si, khung_gio (hai hàng), lich_hen rồi yeu_cau_doi_lich_ngoai_chinh_sach (6c, SAU lich_hen); findLockOrderViolation rỗng', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const calls: StatementCall[] = [];
    interceptStatements(db, (call, run) => {
      calls.push(call);
      return run();
    });

    await w.approve(yeuCauId);

    const tables = lockedTablesOfDistinct(calls);
    expect(findLockOrderViolation(tables)).toBeNull();
    for (const table of ['benh_nhan', 'bac_si', 'khung_gio', 'lich_hen'])
      expect(tables, table).toContain(table);
    expect(tables.filter((t) => t === 'khung_gio')).toHaveLength(2);
    expect(
      tables.filter((t) => t === 'yeu_cau_doi_lich_ngoai_chinh_sach'),
    ).toHaveLength(1);
    // Thứ tự tầng 2 → 4 → 5 → 6 → 6c: mỗi bảng đứng SAU bảng của tầng trước
    const order = [
      tables.indexOf('benh_nhan'),
      tables.indexOf('bac_si'),
      tables.indexOf('khung_gio'),
      tables.lastIndexOf('khung_gio'),
      tables.indexOf('lich_hen'),
      tables.indexOf('yeu_cau_doi_lich_ngoai_chinh_sach'),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Đọc yêu cầu (`findForHandling`) KHÔNG khoá: chỉ có đúng MỘT câu khoá bảng yêu cầu
    expect(
      calls.filter(
        (call) =>
          /FROM yeu_cau_doi_lich_ngoai_chinh_sach/.test(call.sql) &&
          /FOR\s+(UPDATE|SHARE)/i.test(call.sql),
      ),
    ).toHaveLength(1);
  });
});

describe('NDL-05, QDL-13 phạm vi và nhật ký: mọi 4xx KHÔNG đổi nhật ký, thông báo hay thư', () => {
  it('yêu cầu ở chi nhánh KHÁC, id không tồn tại, id sai dạng ⇒ CÙNG một thân 404 YEU_CAU_DOI_LICH_KHONG_TON_TAI; yêu cầu ĐÃ XỬ LÝ ở chi nhánh khác vẫn 404 (không 409); không ghi gì', async () => {
    const w = await world();
    const other = await w.otherBranch();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const handled = await w.openRequest(1, 3, { soLan: 2 });
    await w.reject(handled.yeuCauId);
    const base = await w.untouched();

    const bodies = [];
    for (const id of [yeuCauId, handled.yeuCauId, '999999', 'abc', '0', '']) {
      const failure = await appFailure(
        w.approve(id, { ghiChu: HANDLING_NOTE }, other.receptionId),
      );
      expect(failure.status).toBe(404);
      bodies.push(JSON.stringify(failure.body));
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]!)).toEqual(NOT_FOUND_BODY);
    expect(await w.untouched()).toEqual(base);
  });

  it('Quản trị viên Chi nhánh ngoài phạm vi ⇒ 404; Toàn hệ thống duyệt được yêu cầu ở MỌI chi nhánh', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const stranger = await fx.admin.branch();
    const strangerAdmin = await fx.admin.admin(stranger);
    const base = await w.untouched();

    const failure = await appFailure(
      w.approveAs(
        {
          accountId: strangerAdmin.account.taiKhoanId,
          scope: { kind: 'ChiNhanh', chiNhanhId: stranger.chiNhanhId },
        },
        yeuCauId,
      ),
    );
    expect(failure.status).toBe(404);
    expect(await w.untouched()).toEqual(base);

    const all = await w.admin('all');
    expect((await w.approveAs(all, yeuCauId)).yeuCau.trangThai).toBe('DaDuyet');
  });

  it('Lễ tân bị khoá ⇒ 403 KHONG_DU_QUYEN TRƯỚC mọi thứ (kể cả id sai dạng); không ghi gì', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.receptionId],
    );
    const base = await w.untouched();
    for (const id of [yeuCauId, 'abc']) {
      const failure = await appFailure(w.approve(id));
      expect(failure.status).toBe(403);
      expect(failure.body.maLoi).toBe('KHONG_DU_QUYEN');
    }
    expect(await w.untouched()).toEqual(base);
  });
});

describe('NDL-26, NDL-28 ghi chú đúng 255 đơn vị UTF-16 qua Audit, thông báo và hộp thư đi thật', () => {
  it.each([
    ['255 chữ a', 'a'.repeat(255)],
    ['cặp thay thế ở biên 255', `${'a'.repeat(253)}😀`],
    ['xen emoji và chữ (cắt thông báo giữa cặp thay thế)', '😀a'.repeat(85)],
  ])(
    '%s: không 500; Audit ghi nguyên; noi_dung ≤ 500 và không hỏng cặp thay thế; thư ChoGui (lỗi gửi thư KHÔNG hoàn tác, worker gửi sau)',
    async (_name, ghiChu) => {
      expect(ghiChu.length).toBe(255);
      const w = await world();
      const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });

      const result = await w.approve(yeuCauId, { ghiChu });

      expect(result.yeuCau.trangThai).toBe('DaDuyet');
      const [entry] = await w.auditRows();
      expect(entry?.chiTiet).toMatchObject({ ghi_chu: ghiChu });
      const [notice] = await w.notices();
      expect(notice?.noiDung.length).toBeLessThanOrEqual(500);
      expect(LONE_SURROGATE.test(notice?.noiDung ?? '')).toBe(false);
      expect(notice?.emailTrangThai).toBe('ChoGui');
      expect((await w.requestRow(yeuCauId)).ghiChuXuLy).toBe(ghiChu);
    },
  );
});
