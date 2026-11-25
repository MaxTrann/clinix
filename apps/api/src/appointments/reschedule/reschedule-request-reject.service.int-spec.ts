import type { DataSource } from 'typeorm';
import { AuditRepository } from '../../audit/audit.repository.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { appFailure } from '../testing/patient-reschedule-world.js';
import { firstTableOf, isLockingStatement } from '../testing/query-spy.js';
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
import {
  interceptStatements,
  type StatementCall,
} from '../testing/statement-recorder.js';

// reschedule B9 — TỪ CHỐI yêu cầu đổi lịch: `RescheduleRequestRejectService` THẬT trên MySQL 8.4 THẬT (PLAN reschedule 5.4, 5.7, 5.11, 7.4; TRACKING reschedule 1.13): giao dịch RIÊNG, `ReceptionScopeService`,
// `AuditService`, `BookingNotifier` và repository đều là bản THẬT. Phủ XDL-08, 10, 14, 45, 46, 47, 48 và NDL-05, 26, 28, 29 (phần từ chối). Duyệt: reschedule-request-approve.service.int-spec.ts; đồng thời:
// reschedule-request-handle.concurrency.int-spec.ts. Ô i của thế giới bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026; đồng hồ giả là 08:00 ngày 02/11/2026. Mọi dữ liệu là giả.
const NOT_FOUND_BODY = {
  maLoi: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
  thongBao: 'Không tìm thấy yêu cầu đổi lịch.',
};
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const WRITTEN_TABLE = /^\s*(?:INSERT\s+(?:IGNORE\s+)?INTO|UPDATE)\s+`?(\w+)`?/i;
const REQUEST_TABLE = 'yeu_cau_doi_lich_ngoai_chinh_sach';

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const world = (options?: RequestHandleWorldOptions) =>
  requestHandleWorld(db, fx, options);

/** Ghi lại mọi câu SQL của MỘT lần gọi (mảng được điền thêm khi câu chạy). */
function captureStatements(): StatementCall[] {
  const calls: StatementCall[] = [];
  interceptStatements(db, (call, run) => {
    calls.push(call);
    return run();
  });
  return calls;
}

/** Đúng MỘT từ chối thành công: hàng yêu cầu, Audit (KHÔNG `ma_lich_hen_moi`) và thông báo `YeuCauDoiLichBiTuChoi` gắn yêu cầu. */
async function expectOneRejection(
  w: RequestHandleWorld,
  input: {
    yeuCauId: string;
    lichHenId: string;
    maLichHen: string;
    handlerId: string;
    ghiChu?: string;
  },
) {
  const ghiChu = input.ghiChu ?? HANDLING_NOTE;
  expect(await w.requestRow(input.yeuCauId)).toMatchObject({
    trangThai: 'TuChoi',
    ghiChuXuLy: ghiChu,
    nguoiXuLyId: input.handlerId,
    thoiDiemXuLy: HANDLED_AT,
    lichHenId: input.lichHenId,
  });
  const audit = await w.auditRows();
  expect(audit).toEqual([
    {
      taiKhoanId: input.handlerId,
      chiNhanhId: w.branchId,
      hanhDong: 'XuLyDoiLichNgoaiChinhSach',
      loaiDoiTuong: 'yeu_cau_doi_lich_ngoai_chinh_sach',
      maDoiTuong: input.yeuCauId,
      ketQua: 'ThanhCong',
      chiTiet: {
        truoc: { trang_thai: 'ChoDuyet' },
        sau: { trang_thai: 'TuChoi' },
        ghi_chu: ghiChu,
        ma_lich_hen_cu: input.maLichHen,
      },
    },
  ]);
  expect(Object.keys(audit[0]?.chiTiet as object)).not.toContain(
    'ma_lich_hen_moi',
  );
  const notices = await w.notices();
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({
    loai: 'YeuCauDoiLichBiTuChoi',
    taiKhoanId: w.patientId,
    lichHenId: null,
    yeuCauId: input.yeuCauId,
    emailTrangThai: 'ChoGui',
  });
}

describe('XDL-08, XDL-46, XDL-47, XDL-48 từ chối: chỉ khoá yêu cầu, lịch và khung giờ không đổi', () => {
  it('Lễ tân: 200 đúng hai khoá; yêu cầu TuChoi kèm ghi chú, người và thời điểm xử lý; lịch gốc và hai khung giờ NGUYÊN; không lịch mới; ĐÚNG một Audit và một thông báo; không mời danh sách chờ', async () => {
    const w = await world();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const rowBefore = await w.rawRow(lich.lichHenId);
    const lichCount = await w.countRows('lich_hen');
    const money = await w.moneyBefore();

    const result = await w.reject(yeuCauId);

    expect(Object.keys(result).sort()).toEqual(['thoiGianMayChu', 'yeuCau']);
    expect(result.yeuCau).toEqual({ trangThai: 'TuChoi' });
    expect(result.thoiGianMayChu).toBe('2026-11-02T01:00:00.000Z');
    await expectOneRejection(w, {
      yeuCauId,
      lichHenId: lich.lichHenId,
      maLichHen: lich.maLichHen,
      handlerId: w.receptionId,
    });
    expect(await w.rawRow(lich.lichHenId)).toEqual(rowBefore);
    expect(await w.countRows('lich_hen')).toBe(lichCount);
    await w.expectSlot(0, 'DaDat');
    await w.expectSlot(2, 'ConTrong');
    expect(w.waitlist.releasedSlotIds).toEqual([]);
    await w.expectSettled(money);
  });

  it('XDL-08, XDL-46 M10 chuỗi SQL THẬT: đúng MỘT câu khoá và nó là FOR UPDATE bảng yêu cầu; KHÔNG UPDATE hay INSERT lich_hen, khung_gio, benh_nhan; ghi đúng yêu cầu, nhật ký, thông báo, thư', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const calls = captureStatements();

    await w.reject(yeuCauId);

    const locking = calls.filter((call) => isLockingStatement(call.sql));
    expect(locking.map((call) => firstTableOf(call.sql))).toEqual([
      REQUEST_TABLE,
    ]);
    expect(locking[0]?.sql).toMatch(
      /WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = \?/,
    );
    const written = calls
      .map((call) => WRITTEN_TABLE.exec(call.sql)?.[1])
      .filter((table): table is string => table !== undefined);
    for (const table of [
      'lich_hen',
      'khung_gio',
      'benh_nhan',
      'ho_so_nguoi_than',
    ])
      expect(written, table).not.toContain(table);
    expect(written[0]).toBe(REQUEST_TABLE);
    expect(written).toContain('nhat_ky_hanh_dong');
    expect(written).toContain('thong_bao');
    expect(written).toContain('email_thong_bao');
    // UPDATE yêu cầu đứng TRƯỚC Audit rồi thông báo (thứ tự của B4)
    expect(written.indexOf('nhat_ky_hanh_dong')).toBeLessThan(
      written.indexOf('thong_bao'),
    );
  });

  it.each(['all', 'branch'] as const)(
    'Quản trị viên %s: 200; người xử lý và Audit là Quản trị viên; branchId VẪN là chi nhánh của lịch; thông báo gửi cho tài khoản ĐẶT',
    async (kind) => {
      const w = await world();
      const handler = await w.admin(kind);
      const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });

      await w.rejectAs(handler, yeuCauId);

      await expectOneRejection(w, {
        yeuCauId,
        lichHenId: lich.lichHenId,
        maLichHen: lich.maLichHen,
        handlerId: handler.accountId,
      });
    },
  );

  it('XDL-47 id yêu cầu lớn hơn 2^53 đi NGUYÊN tới hàng, Audit và thông báo', async () => {
    const w = await world();
    await db.query(
      'ALTER TABLE yeu_cau_doi_lich_ngoai_chinh_sach AUTO_INCREMENT = 9007199254740993',
    );
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    expect(BigInt(yeuCauId) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);

    await w.reject(yeuCauId);

    await expectOneRejection(w, {
      yeuCauId,
      lichHenId: lich.lichHenId,
      maLichHen: lich.maLichHen,
      handlerId: w.receptionId,
    });
  });

  it('XDL-48 thông báo từ chối: người nhận là tài khoản ĐẶT (không phải Lễ tân), nội dung nói "bị từ chối" kèm ghi chú nguyên văn và KHÔNG có mã lịch mới; chỉ MỘT thông báo và MỘT thư trong cả hệ thống', async () => {
    const w = await world();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });

    await w.reject(yeuCauId);

    const [notice] = await w.notices();
    expect(notice?.taiKhoanId).toBe(w.patientId);
    expect(notice?.taiKhoanId).not.toBe(w.receptionId);
    expect(notice?.noiDung).toContain('bị từ chối');
    expect(notice?.noiDung).toContain(HANDLING_NOTE);
    expect(notice?.noiDung).toContain(lich.maLichHen);
    expect(notice?.noiDung.length).toBeLessThanOrEqual(500);
    expect(await w.countRows('thong_bao')).toBe(1);
    expect(await w.countRows('email_thong_bao')).toBe(1);
  });
});

describe('XDL-45 từ chối được với MỌI trạng thái của lịch gốc và khi khung giờ mong muốn đã bị chiếm', () => {
  it.each(['DaXacNhan', 'DaHuy', 'DaTiepDon', 'VangMat', 'DaDoiLich'] as const)(
    'lịch gốc %s ⇒ 200 TuChoi, một Audit, một thông báo (R6: không đọc trạng thái lịch gốc để quyết)',
    async (state) => {
      const w = await world();
      const { lich, yeuCauId } = await w.openRequest(0, 2, { state });

      const result = await w.reject(yeuCauId);

      expect(result.yeuCau.trangThai).toBe('TuChoi');
      expect((await w.requestRow(yeuCauId)).trangThai).toBe('TuChoi');
      expect((await w.rowOf(lich.lichHenId)).trangThai).toBe(state);
      expect(await w.auditCount()).toBe(1);
      expect(await w.countRows('thong_bao')).toBe(1);
    },
  );

  it('khung giờ mong muốn đã bị người khác đặt và đã QUÁ giờ hạn duyệt: vẫn từ chối được (duyệt thì 409)', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const [other] = await fx.patients(1);
    await w.book(2, { patientId: other!.account.taiKhoanId });

    await expect(w.reject(yeuCauId)).resolves.toMatchObject({
      yeuCau: { trangThai: 'TuChoi' },
    });
    await w.expectSlot(2, 'DaDat');
  });
});

describe('XDL-10 từ chối hai lần, từ chối sau duyệt: 409 YEU_CAU_DA_XU_LY dưới khoá, không ghi thêm', () => {
  it('từ chối lần hai ⇒ 409; nhật ký, thông báo và yêu cầu giữ nguyên như sau lần một (NDL-29: không thông báo thứ hai)', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    await w.reject(yeuCauId);
    const base = await w.untouched();
    const notices = await w.notices();

    const failure = await appFailure(w.reject(yeuCauId));

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('YEU_CAU_DA_XU_LY');
    expect(await w.untouched()).toEqual(base);
    expect(await w.notices()).toEqual(notices);
  });

  it('từ chối sau DUYỆT ⇒ 409; yêu cầu vẫn DaDuyet với ghi chú của lần duyệt; lịch mới còn nguyên', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    await w.approve(yeuCauId, { ghiChu: 'Đã duyệt' });
    const base = await w.untouched();

    const failure = await appFailure(
      w.reject(yeuCauId, { ghiChu: 'Từ chối muộn' }),
    );

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('YEU_CAU_DA_XU_LY');
    expect(await w.untouched()).toEqual(base);
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      trangThai: 'DaDuyet',
      ghiChuXuLy: 'Đã duyệt',
    });
    await w.expectSettled();
  });

  it('NDL-29 một lịch có HAI yêu cầu theo thời gian (từ chối rồi gửi lại rồi duyệt): mỗi yêu cầu có ĐỦ thông báo riêng của nó, đúng hai thông báo, không trùng', async () => {
    const w = await world();
    const { lich, yeuCauId: first } = await w.openRequest(0, 2, { soLan: 2 });
    await w.reject(first, { ghiChu: 'Hết giờ đó' });
    const second = await insertRequestAt(db, {
      lichHenId: lich.lichHenId,
      khungGioMongMuonId: w.slot(3),
      thoiDiemTao: '2026-11-01 10:00:00',
    });

    await w.approve(second, { ghiChu: 'Đồng ý giờ khác' });

    const notices = await w.notices();
    expect(notices.map((n) => [n.loai, n.yeuCauId])).toEqual([
      ['YeuCauDoiLichBiTuChoi', first],
      ['YeuCauDoiLichDaDuyet', second],
    ]);
    expect(await w.countRows('email_thong_bao')).toBe(2);
  });
});

describe('XDL-14 lỗi Audit hay thông báo ⇒ hoàn tác TRỌN: yêu cầu vẫn ChoDuyet, không dòng nhật ký, không thông báo, không thư', () => {
  it('AuditError NỔI nguyên (Audit ghi xong dòng rồi ném); UPDATE yêu cầu và dòng Audit đều mất; lần sau Audit lành từ chối được', async () => {
    const audit = new FlakyAudit(new AuditRepository());
    const w = await world({ audit });
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 1 });
    const base = await w.untouched();

    await expect(w.reject(yeuCauId)).rejects.toMatchObject({
      name: 'AuditError',
      code: 'AUDIT_WRITE_FAILED',
    });

    expect(await w.untouched()).toEqual(base);
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      trangThai: 'ChoDuyet',
      ghiChuXuLy: null,
      nguoiXuLyId: null,
      thoiDiemXuLy: null,
    });
    expect(await w.countRows('thong_bao')).toBe(0);

    audit.failing = false;
    expect((await w.reject(yeuCauId)).yeuCau.trangThai).toBe('TuChoi');
    expect(await w.auditCount()).toBe(1);
  });

  it('lỗi ghi thông báo SAU Audit và SAU UPDATE yêu cầu: cả hai đều bị hoàn tác; lần sau từ chối được', async () => {
    const notifier = new FlakyNotifier();
    const w = await world({ notifier });
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 1 });
    const base = await w.untouched();

    await expect(w.reject(yeuCauId)).rejects.toThrow('ghi thông báo lỗi');

    expect(await w.untouched()).toEqual(base);
    expect(await w.auditCount()).toBe(0);
    expect((await w.requestRow(yeuCauId)).trangThai).toBe('ChoDuyet');

    notifier.failing = false;
    expect((await w.reject(yeuCauId)).yeuCau.trangThai).toBe('TuChoi');
    expect(await w.countRows('thong_bao')).toBe(1);
  });
});

describe('NDL-05, QDL-13 phạm vi: yêu cầu ngoài phạm vi và 4xx KHÔNG đổi nhật ký, thông báo hay thư', () => {
  it('Lễ tân chi nhánh KHÁC, id không tồn tại, id sai dạng ⇒ CÙNG một thân 404 YEU_CAU_DOI_LICH_KHONG_TON_TAI; yêu cầu ĐÃ XỬ LÝ ở chi nhánh khác vẫn 404 (không 409); không ghi gì', async () => {
    const w = await world();
    const other = await w.otherBranch();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const handled = await w.openRequest(1, 3, { soLan: 2 });
    await w.approve(handled.yeuCauId);
    const base = await w.untouched();

    const bodies: string[] = [];
    for (const id of [yeuCauId, handled.yeuCauId, '999999', 'abc', '0', '']) {
      const failure = await appFailure(
        w.reject(id, { ghiChu: HANDLING_NOTE }, other.receptionId),
      );
      expect(failure.status).toBe(404);
      bodies.push(JSON.stringify(failure.body));
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]!)).toEqual(NOT_FOUND_BODY);
    expect(await w.untouched()).toEqual(base);
  });

  it('Quản trị viên Chi nhánh ngoài phạm vi ⇒ 404; Toàn hệ thống từ chối được yêu cầu ở MỌI chi nhánh', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const stranger = await fx.admin.branch();
    const strangerAdmin = await fx.admin.admin(stranger);
    const base = await w.untouched();

    const failure = await appFailure(
      w.rejectAs(
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
    expect((await w.rejectAs(all, yeuCauId)).yeuCau.trangThai).toBe('TuChoi');
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
      const failure = await appFailure(w.reject(id));
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

      const result = await w.reject(yeuCauId, { ghiChu });

      expect(result.yeuCau.trangThai).toBe('TuChoi');
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
