import { findLockOrderViolation } from '../../../appointments/locking/lock-order.js';
import { lockedTablesOf } from '../../../appointments/testing/lock-chain.js';
import { mysqlError } from '../../../appointments/testing/scripted-entity-manager.js';
import {
  failAfterStatement,
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../../../appointments/testing/statement-recorder.js';
import { retryStats } from '../../../appointments/testing/concurrency-report.js';
import {
  db,
  fx,
  logs,
  useStatusWorldHooks,
  world,
} from '../../../appointments/testing/status-int-kit.js';
import { AuditError } from '../../../audit/audit-error.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { assertExamInvariants } from '../testing/exam-invariants.js';
import {
  auditReasonOf,
  bodyOf,
  hideAuditRows,
  hideBody,
  ratingHideService,
  readAverage,
  untouchedByHide,
} from '../testing/hide-rating-stack.js';
import {
  adminRatingsService,
  branchScope,
  moderationWorld,
  ratingsQuery,
  SYSTEM_SCOPE,
} from '../testing/moderation-stack.js';
import { detailService } from '../testing/patient-exam-stack.js';
import { ratingRows } from '../testing/rating-stack.js';
import {
  HIDE_RATING_SQL,
  LOCK_RATING_SQL,
  RatingHideRepository,
  READ_FOR_HIDE_SQL,
} from './rating-hide.repository.js';

// doctor-exam B8 — RatingHideService THẬT trên MySQL 8.4 THẬT (PLAN 5.3, 5.8, 5.12, 5.15; 7.5 KDD-04…KDD-10, KDD-14, KDD-15; 7.6 DTB-03; 7.11 TDK-05; HDK-05, HDK-09; `[đề xuất]` KDD-23, KDD-25): CHECK `chk_danh_gia_an`, khoá hàng,
// `AuditService` THẬT trong cùng giao dịch, hoàn tác, thử lại. Phần ĐƠN VỊ (không DB): rating-hide.*.spec.ts. Phần HTTP: test/doctor-exam-admin-hide-rating.e2e-spec.ts. Ca ĐỒNG THỜI: rating-hide.concurrency.int-spec.ts.
// Điểm trung bình đọc bằng bản CHÉP câu của PLAN 5.9 (`readAverage`): B9 thay bằng `DoctorRatingReader` thật và chạy lại KDD-15, DTB-03. Dữ liệu giả; ba chi nhánh, mỗi chi nhánh một bác sĩ, ba người đặt tên khác nhau. Mọi giá trị mong đợi viết tay.
useStatusWorldHooks();

const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};
const REASON = 'Nội dung quảng cáo, không liên quan đến buổi khám';
const NHAN_XET_RIENG = 'NHAN-XET-RIENG-9137 Bác sĩ nói chuyện thiếu tôn trọng';

async function setup() {
  const m = await moderationWorld(db, fx, await world());
  return { m, service: ratingHideService(db) };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const adminId = (t: Setup, who: 'system' | 'a' | 'b') =>
  t.m.admins[who].account.taiKhoanId;
const rowOf = async (danhGiaId: string) => {
  const row = (await ratingRows(db)).find((r) => r.danhGiaId === danhGiaId);
  if (row === undefined) throw new Error(`không có đánh giá ${danhGiaId}`);
  return row;
};
/** Lỗi ném ra (hoặc `null` nếu không lỗi): để so CẢ thân của 404 và 409, không chỉ mã. */
const failureOf = (work: Promise<unknown>): Promise<unknown> =>
  work.then(
    () => null,
    (error: unknown) => error,
  );
const bodyOfError = (error: unknown): unknown => {
  expect(error).toBeInstanceOf(AppException);
  return (error as AppException).getResponse();
};
const notHidden = (row: Awaited<ReturnType<typeof rowOf>>) => {
  expect(row.biAn).toBe(0);
  expect(row.lyDoAn).toBeNull();
};

describe('KDD-04, TDK-05 ẩn đánh giá HienThi với lý do hợp lệ', () => {
  it('Admin Toàn hệ thống ẩn đánh giá của chi nhánh A: 200 { danhGiaId, biAn: true }; bi_an = 1 và ly_do_an = lý do; ĐÚNG MỘT nhật ký AnDanhGia đủ trường; không đổi bảng nào khác', async () => {
    const t = await setup();
    const r = await t.m.seed({ nhanXet: NHAN_XET_RIENG });
    const before = await untouchedByHide(db);
    expect(
      await t.service.hide(
        SYSTEM_SCOPE,
        adminId(t, 'system'),
        r.danhGiaId,
        hideBody(),
      ),
    ).toEqual({ danhGiaId: r.danhGiaId, biAn: true });
    const row = await rowOf(r.danhGiaId);
    expect(row.biAn).toBe(1);
    expect(row.lyDoAn).toBe(REASON);
    expect(await hideAuditRows(db)).toEqual([
      {
        taiKhoanId: adminId(t, 'system'),
        chiNhanhId: t.m.branches.a.chiNhanhId,
        loaiDoiTuong: 'danh_gia_bac_si',
        maDoiTuong: r.danhGiaId,
        ketQua: 'ThanhCong',
        chiTiet: {
          truoc: { bi_an: false },
          sau: { bi_an: true },
          ly_do: REASON,
          bac_si_id: t.m.doctors.a.account.taiKhoanId,
        },
      },
    ]);
    expect(await untouchedByHide(db)).toEqual(before);
    await assertExamInvariants(db);
  });

  it('TDK-05 nhật ký KHÔNG lộ nhận xét, tên người đặt, tên bác sĩ, SĐT, email (quét chuỗi mẫu duy nhất)', async () => {
    const t = await setup();
    const r = await t.m.seed({ nhanXet: NHAN_XET_RIENG });
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      r.danhGiaId,
      hideBody(),
    );
    const text = JSON.stringify(await hideAuditRows(db));
    for (const secret of [
      NHAN_XET_RIENG,
      'NHAN-XET-RIENG',
      t.m.names.buyerOne,
      t.m.names.doctorA,
      '@example.com',
      'soDienThoai',
    ])
      expect(text, secret).not.toContain(secret);
  });

  it('Admin Chi nhánh ĐÚNG chi nhánh của lịch ẩn được; người ẩn của nhật ký là Admin đó', async () => {
    const t = await setup();
    const r = await t.m.seed();
    await t.service.hide(
      branchScope(t.m.branches.a.chiNhanhId),
      adminId(t, 'a'),
      r.danhGiaId,
      hideBody(),
    );
    expect((await rowOf(r.danhGiaId)).biAn).toBe(1);
    const [audit] = await hideAuditRows(db);
    expect(audit?.taiKhoanId).toBe(adminId(t, 'a'));
  });

  it('Admin Toàn hệ thống ẩn đánh giá của chi nhánh B: branchId của nhật ký = chi nhánh B (chi nhánh của LỊCH, không null, không chi nhánh của Admin)', async () => {
    const t = await setup();
    const r = await t.m.seed({ doctor: t.m.doctors.b });
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      r.danhGiaId,
      hideBody(),
    );
    const [audit] = await hideAuditRows(db);
    expect(audit?.chiNhanhId).toBe(t.m.branches.b.chiNhanhId);
  });

  it('lý do được chuẩn hoá (trim, CRLF ⇒ LF, bỏ ký tự điều khiển) rồi mới ghi: cột và nhật ký cùng một chuỗi', async () => {
    const t = await setup();
    const r = await t.m.seed();
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      r.danhGiaId,
      hideBody({ lyDo: '  Quảng cáo\r\nlặp lại nhiều lần\u0001  ' }),
    );
    expect((await rowOf(r.danhGiaId)).lyDoAn).toBe(
      'Quảng cáo\nlặp lại nhiều lần',
    );
    const [audit] = await hideAuditRows(db);
    expect(auditReasonOf(audit)).toBe('Quảng cáo\nlặp lại nhiều lần');
  });

  it('L10: bác sĩ chuyển chi nhánh SAU khi khám ⇒ chi nhánh của LỊCH quyết định: Admin chi nhánh B (chi nhánh mới của bác sĩ) bị 404, Admin chi nhánh A ẩn được và nhật ký ghi chi nhánh A', async () => {
    const t = await setup();
    const r = await t.m.seed();
    await t.m.moveDoctor(t.m.doctors.a, t.m.branches.b.chiNhanhId);
    expect(
      bodyOfError(
        await failureOf(
          t.service.hide(
            branchScope(t.m.branches.b.chiNhanhId),
            adminId(t, 'b'),
            r.danhGiaId,
            hideBody(),
          ),
        ),
      ),
    ).toEqual(NOT_FOUND_BODY);
    notHidden(await rowOf(r.danhGiaId));
    await t.service.hide(
      branchScope(t.m.branches.a.chiNhanhId),
      adminId(t, 'a'),
      r.danhGiaId,
      hideBody(),
    );
    const [audit] = await hideAuditRows(db);
    expect(audit?.chiNhanhId).toBe(t.m.branches.a.chiNhanhId);
  });
});

describe('KDD-05, KDD-06, KDD-25 lỗi lý do ⇒ 400, không ghi gì (DB thật)', () => {
  it.each([
    ['vắng', undefined, 'LY_DO_BAT_BUOC'],
    ['null', null, 'LY_DO_BAT_BUOC'],
    ['rỗng', '', 'LY_DO_BAT_BUOC'],
    ['chỉ khoảng trắng', '    ', 'LY_DO_BAT_BUOC'],
    ['9 đơn vị', 'x'.repeat(9), 'LY_DO_QUA_NGAN'],
    ['256 đơn vị', 'x'.repeat(256), 'LY_DO_QUA_DAI'],
    [
      'dạng bí mật (token)',
      'Ghi chú token=abc123 lộ ra',
      'NOI_DUNG_KHONG_HOP_LE',
    ],
    [
      'dạng bí mật (Bearer)',
      'Authorization: Bearer abc.def',
      'NOI_DUNG_KHONG_HOP_LE',
    ],
  ])(
    '%s ⇒ 400 loi[{ lyDo, %s }]; bi_an giữ 0, không nhật ký, KHÔNG câu SQL nào (lỗi 400 chưa chạm DB)',
    async (_name, lyDo, ma) => {
      const t = await setup();
      const r = await t.m.seed();
      const seen = recordStatements(db);
      const error = await failureOf(
        t.service.hide(
          SYSTEM_SCOPE,
          adminId(t, 'system'),
          r.danhGiaId,
          hideBody({ lyDo }),
        ),
      );
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(400);
      expect((error as AppException).getResponse()).toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        loi: [{ truong: 'lyDo', ma }],
      });
      expect(bodyOf(seen)).toEqual([]);
      notHidden(await rowOf(r.danhGiaId));
      expect(await hideAuditRows(db)).toEqual([]);
    },
  );

  it.each([
    ['10 đơn vị (biên dưới)', 'x'.repeat(10)],
    ['255 đơn vị (biên trên: vừa varchar(255))', 'x'.repeat(255)],
    [
      '255 đơn vị gồm 127 emoji (cặp thay thế) và một chữ',
      `${'😀'.repeat(127)}a`,
    ],
    ['hai dòng', 'Dòng một quảng cáo\nDòng hai lặp lại'],
  ])(
    'KDD-06, HDK-09 %s: vào DB thật và qua AuditService thật; ly_do_an khứ hồi nguyên văn',
    async (_name, lyDo) => {
      const t = await setup();
      const r = await t.m.seed();
      await t.service.hide(
        SYSTEM_SCOPE,
        adminId(t, 'system'),
        r.danhGiaId,
        hideBody({ lyDo }),
      );
      expect((await rowOf(r.danhGiaId)).lyDoAn).toBe(lyDo);
      const [audit] = await hideAuditRows(db);
      expect(auditReasonOf(audit)).toBe(lyDo);
      await assertExamInvariants(db);
    },
  );
});

describe('KDD-07 ẩn lần hai ⇒ 409 DANH_GIA_DA_AN; không nhật ký thứ hai; lý do cũ giữ nguyên', () => {
  it('hai lần liên tiếp: lần hai 409 (thân không chiTiet); ly_do_an là của lần đầu; MỘT nhật ký', async () => {
    const t = await setup();
    const r = await t.m.seed();
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      r.danhGiaId,
      hideBody({ lyDo: 'Lý do của lần ẩn thứ nhất' }),
    );
    const error = await failureOf(
      t.service.hide(
        SYSTEM_SCOPE,
        adminId(t, 'a'),
        r.danhGiaId,
        hideBody({ lyDo: 'Lý do của lần ẩn thứ hai' }),
      ),
    );
    expect((error as AppException).getStatus()).toBe(409);
    expect(bodyOfError(error)).toMatchObject({ maLoi: 'DANH_GIA_DA_AN' });
    expect(bodyOfError(error)).not.toHaveProperty('chiTiet');
    expect((await rowOf(r.danhGiaId)).lyDoAn).toBe('Lý do của lần ẩn thứ nhất');
    expect(await hideAuditRows(db)).toHaveLength(1);
  });

  it('đánh giá ĐÃ ẩn từ đầu (dữ liệu dựng với bi_an = 1) ⇒ 409; hàng giữ nguyên', async () => {
    const t = await setup();
    const r = await t.m.seed({ hiddenReason: 'Lý do dựng sẵn từ trước' });
    const before = await rowOf(r.danhGiaId);
    const error = await failureOf(
      t.service.hide(
        SYSTEM_SCOPE,
        adminId(t, 'system'),
        r.danhGiaId,
        hideBody(),
      ),
    );
    expect(bodyOfError(error)).toMatchObject({ maLoi: 'DANH_GIA_DA_AN' });
    expect(await rowOf(r.danhGiaId)).toEqual(before);
    expect(await hideAuditRows(db)).toEqual([]);
  });

  it('(b) lớp bảo vệ THỨ HAI: khoá đọc cũ (giả) báo bi_an = 0 trong khi hàng đã ẩn ⇒ UPDATE … AND bi_an = 0 trúng 0 hàng ⇒ vẫn 409; ly_do_an không bị ghi đè; KHÔNG nhật ký thứ hai', async () => {
    const t = await setup();
    const r = await t.m.seed();
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      r.danhGiaId,
      hideBody({ lyDo: 'Lý do của lần ẩn thứ nhất' }),
    );
    class StaleLockRepository extends RatingHideRepository {
      override lock(): Promise<{ biAn: boolean } | null> {
        return Promise.resolve({ biAn: false });
      }
    }
    const stale = ratingHideService(db, undefined, new StaleLockRepository());
    const error = await failureOf(
      stale.hide(
        SYSTEM_SCOPE,
        adminId(t, 'system'),
        r.danhGiaId,
        hideBody({ lyDo: 'Lý do của lần ẩn thứ hai' }),
      ),
    );
    expect(bodyOfError(error)).toMatchObject({ maLoi: 'DANH_GIA_DA_AN' });
    expect((await rowOf(r.danhGiaId)).lyDoAn).toBe('Lý do của lần ẩn thứ nhất');
    expect(await hideAuditRows(db)).toHaveLength(1);
  });
});

describe('KDD-08, QHK-06 Admin Chi nhánh ẩn đánh giá chi nhánh khác ⇒ 404 cùng thân, KHÔNG ghi, KHÔNG xin khoá', () => {
  it('404 thân y hệt "không có" (từng byte); hàng và nhật ký nguyên; chỉ MỘT câu SELECT đọc thường (không FOR UPDATE, không UPDATE, không INSERT, không giao dịch)', async () => {
    const t = await setup();
    const r = await t.m.seed();
    const seen = recordStatements(db);
    const outOfScope = await failureOf(
      t.service.hide(
        branchScope(t.m.branches.b.chiNhanhId),
        adminId(t, 'b'),
        r.danhGiaId,
        hideBody(),
      ),
    );
    const outOfScopeStatements = bodyOf(seen).length;
    const missing = await failureOf(
      t.service.hide(
        SYSTEM_SCOPE,
        adminId(t, 'system'),
        '999999999',
        hideBody(),
      ),
    );
    expect(JSON.stringify(bodyOfError(outOfScope))).toBe(
      JSON.stringify(NOT_FOUND_BODY),
    );
    expect(JSON.stringify(bodyOfError(missing))).toBe(
      JSON.stringify(bodyOfError(outOfScope)),
    );
    expect((outOfScope as AppException).getStatus()).toBe(404);
    expect((missing as AppException).getStatus()).toBe(404);
    expect(outOfScopeStatements).toBe(1);
    expect(bodyOf(seen)).toEqual([READ_FOR_HIDE_SQL, READ_FOR_HIDE_SQL]);
    expect(bodyOf(seen).some((sql) => WRITE_OR_LOCK_SQL.test(sql))).toBe(false);
    notHidden(await rowOf(r.danhGiaId));
    expect(await hideAuditRows(db)).toEqual([]);
  });
});

describe('KDD-10 nhật ký lỗi ⇒ hoàn tác (DB thật)', () => {
  it('AuditService (giả) ném AuditError: lỗi đi ra NGUYÊN VẸN; bi_an giữ 0, ly_do_an NULL, không nhật ký', async () => {
    const t = await setup();
    const r = await t.m.seed();
    const failure = new AuditError('AUDIT_WRITE_FAILED');
    const service = ratingHideService(db, {
      record: () => Promise.reject(failure),
    });
    const error = await failureOf(
      service.hide(SYSTEM_SCOPE, adminId(t, 'system'), r.danhGiaId, hideBody()),
    );
    expect(error).toBe(failure);
    notHidden(await rowOf(r.danhGiaId));
    expect(await hideAuditRows(db)).toEqual([]);
  });

  it('INSERT nhật ký đã chạy THẬT rồi mới ném lỗi: cả UPDATE bi_an lẫn dòng nhật ký bị hoàn tác', async () => {
    const t = await setup();
    const r = await t.m.seed();
    failAfterStatement(
      db,
      /INSERT INTO `?nhat_ky_hanh_dong/i,
      new Error('lỗi giả sau nhật ký'),
    );
    const error = await failureOf(
      t.service.hide(
        SYSTEM_SCOPE,
        adminId(t, 'system'),
        r.danhGiaId,
        hideBody(),
      ),
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    notHidden(await rowOf(r.danhGiaId));
    expect(await hideAuditRows(db)).toEqual([]);
    await assertExamInvariants(db);
  });

  it('UPDATE đã chạy THẬT rồi mới ném lỗi: hoàn tác, không nhật ký', async () => {
    const t = await setup();
    const r = await t.m.seed();
    failAfterStatement(
      db,
      /^UPDATE danh_gia_bac_si/i,
      new Error('lỗi giả sau UPDATE'),
    );
    await failureOf(
      t.service.hide(
        SYSTEM_SCOPE,
        adminId(t, 'system'),
        r.danhGiaId,
        hideBody(),
      ),
    );
    notHidden(await rowOf(r.danhGiaId));
    expect(await hideAuditRows(db)).toEqual([]);
  });

  it('thử lại an toàn: deadlock 1213 giả SAU khi UPDATE đã chạy ⇒ hoàn tác rồi chạy lại cả thân; kết cục đúng MỘT nhật ký, bi_an = 1, một lần thử lại mang nhãn exam-hide, cùng tham số ở hai lần chạy', async () => {
    const t = await setup();
    const r = await t.m.seed();
    const updates = failAfterStatement(
      db,
      /^UPDATE danh_gia_bac_si/i,
      mysqlError(1213),
    );
    expect(
      await t.service.hide(
        SYSTEM_SCOPE,
        adminId(t, 'system'),
        r.danhGiaId,
        hideBody(),
      ),
    ).toEqual({ danhGiaId: r.danhGiaId, biAn: true });
    expect(updates).toHaveLength(2);
    expect(updates[0]?.params).toEqual(updates[1]?.params);
    expect(retryStats(logs).retries).toEqual({ 'exam-hide MySQL 1213': 1 });
    expect((await rowOf(r.danhGiaId)).biAn).toBe(1);
    expect(await hideAuditRows(db)).toHaveLength(1);
    await assertExamInvariants(db);
  });
});

describe('KDD-14 ẩn không đổi so_sao, nhan_xet, thoi_diem_tao, lich_hen_id; đánh giá khác nguyên vẹn', () => {
  it('ba đánh giá của hai bác sĩ: chỉ bi_an và ly_do_an của ĐÚNG đánh giá được ẩn đổi', async () => {
    const t = await setup();
    const a = await t.m.seed({
      soSao: 4,
      nhanXet: 'Một',
      at: '2026-11-01 08:00:00',
    });
    const b = await t.m.seed({
      soSao: 2,
      nhanXet: 'Hai',
      at: '2026-11-02 08:00:00',
    });
    const c = await t.m.seed({
      doctor: t.m.doctors.b,
      soSao: 1,
      nhanXet: null,
      at: '2026-11-03 08:00:00',
    });
    const before = await ratingRows(db);
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      b.danhGiaId,
      hideBody(),
    );
    const after = await ratingRows(db);
    expect(after).toEqual(
      before.map((row) =>
        row.danhGiaId === b.danhGiaId
          ? { ...row, biAn: 1, lyDoAn: REASON }
          : row,
      ),
    );
    expect(after.map((row) => row.danhGiaId)).toEqual([
      a.danhGiaId,
      b.danhGiaId,
      c.danhGiaId,
    ]);
  });
});

describe('KDD-15, DTB-03 điểm trung bình loại đánh giá đã ẩn (bên đọc = bản chép câu PLAN 5.9; B9 chạy lại bằng reader thật)', () => {
  it('KDD-15 bác sĩ có 5, 4, 1: ẩn 1 sao ⇒ soDanhGia 3 ⇒ 2, điểm "3.3" ⇒ "4.5"; đánh giá ĐÃ ẩn từ trước không tính; bác sĩ khác không đổi', async () => {
    const t = await setup();
    const doctorA = t.m.doctors.a.account.taiKhoanId;
    const doctorB = t.m.doctors.b.account.taiKhoanId;
    await t.m.seed({ soSao: 5, at: '2026-11-01 08:00:00' });
    await t.m.seed({ soSao: 4, at: '2026-11-02 08:00:00' });
    const one = await t.m.seed({ soSao: 1, at: '2026-11-03 08:00:00' });
    await t.m.seed({
      soSao: 2,
      hiddenReason: 'Đã ẩn từ trước',
      at: '2026-11-04 08:00:00',
    });
    await t.m.seed({
      doctor: t.m.doctors.b,
      soSao: 2,
      at: '2026-11-05 08:00:00',
    });
    await t.m.seed({
      doctor: t.m.doctors.b,
      soSao: 3,
      at: '2026-11-06 08:00:00',
    });
    expect(await readAverage(db, doctorA)).toEqual({
      diem: '3.3',
      soDanhGia: 3,
    });
    expect(await readAverage(db, doctorB)).toEqual({
      diem: '2.5',
      soDanhGia: 2,
    });
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      one.danhGiaId,
      hideBody(),
    );
    expect(await readAverage(db, doctorA)).toEqual({
      diem: '4.5',
      soDanhGia: 2,
    });
    expect(await readAverage(db, doctorB)).toEqual({
      diem: '2.5',
      soDanhGia: 2,
    });
  });

  it('DTB-03 ẩn hết đánh giá của một bác sĩ ⇒ không còn dòng điểm (B9 đổi thành null và 0); ẩn từng cái giảm dần số lượt', async () => {
    const t = await setup();
    const doctorA = t.m.doctors.a.account.taiKhoanId;
    const x = await t.m.seed({ soSao: 5, at: '2026-11-01 08:00:00' });
    const y = await t.m.seed({ soSao: 4, at: '2026-11-02 08:00:00' });
    expect(await readAverage(db, doctorA)).toEqual({
      diem: '4.5',
      soDanhGia: 2,
    });
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      x.danhGiaId,
      hideBody(),
    );
    expect(await readAverage(db, doctorA)).toEqual({
      diem: '4.0',
      soDanhGia: 1,
    });
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      y.danhGiaId,
      hideBody(),
    );
    expect(await readAverage(db, doctorA)).toBeNull();
  });
});

describe('KDD-03, Q19 sau khi ẩn: Admin thấy biAn và lyDoAn; Bệnh nhân vẫn thấy đánh giá như chưa ẩn', () => {
  it('chi tiết của B7: trước ẩn KHÔNG có khoá lyDoAn, sau ẩn biAn true và lyDoAn = lý do; danh sách dịch HienThi ⇒ DaAn', async () => {
    const t = await setup();
    const doctorA = t.m.doctors.a.account.taiKhoanId;
    const read = adminRatingsService(db);
    const r = await t.m.seed({ nhanXet: 'Nhận xét gốc' });
    await t.m.seed({ at: '2026-11-02 08:00:00' });
    const query = ratingsQuery({ bacSiId: doctorA });
    expect((await read.list(SYSTEM_SCOPE, query)).demTheoTrangThai).toEqual({
      HienThi: 2,
      DaAn: 0,
    });
    const before = await read.get(SYSTEM_SCOPE, r.danhGiaId);
    expect(before.biAn).toBe(false);
    expect(before).not.toHaveProperty('lyDoAn');
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      r.danhGiaId,
      hideBody(),
    );
    const after = await read.get(SYSTEM_SCOPE, r.danhGiaId);
    expect(after).toMatchObject({
      biAn: true,
      lyDoAn: REASON,
      nhanXet: 'Nhận xét gốc',
    });
    expect((await read.list(SYSTEM_SCOPE, query)).demTheoTrangThai).toEqual({
      HienThi: 1,
      DaAn: 1,
    });
  });

  it('Q19 Bệnh nhân xem chi tiết lịch của mình: danhGia giữ đúng ba khoá và nội dung như TRƯỚC khi ẩn (không biAn, không lyDoAn)', async () => {
    const t = await setup();
    const r = await t.m.seed({ soSao: 4, nhanXet: 'Nhận xét của người đặt' });
    const view = detailService(db);
    const before = await view.detail(t.m.buyers.one, r.maLichHen);
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      r.danhGiaId,
      hideBody(),
    );
    const after = await view.detail(t.m.buyers.one, r.maLichHen);
    expect(after.danhGia).toEqual(before.danhGia);
    expect(Object.keys(after.danhGia ?? {}).toSorted()).toEqual([
      'nhanXet',
      'soSao',
      'thoiDiemTao',
    ]);
    expect(after.danhGia).toMatchObject({
      soSao: 4,
      nhanXet: 'Nhận xét của người đặt',
    });
  });
});

describe('HDK-05, KDD-23 chuỗi câu SQL THẬT (PLAN 5.3: chỉ tầng 6b, không khoá lich_hen) và số câu', () => {
  it('thành công: đọc thường → FOR UPDATE danh_gia_bac_si (khoá chính) → UPDATE … AND bi_an = 0 → INSERT nhat_ky_hanh_dong; ĐÚNG 4 câu; chỉ khoá [danh_gia_bac_si]; thứ tự khoá hợp lệ; không câu nào sau đọc thường nhắc lich_hen', async () => {
    const t = await setup();
    const r = await t.m.seed();
    const seen = recordStatements(db);
    await t.service.hide(
      SYSTEM_SCOPE,
      adminId(t, 'system'),
      r.danhGiaId,
      hideBody(),
    );
    const body = bodyOf(seen);
    expect(body).toHaveLength(4);
    expect(body[0]).toBe(READ_FOR_HIDE_SQL);
    expect(body[1]).toBe(LOCK_RATING_SQL);
    expect(body[2]).toBe(HIDE_RATING_SQL);
    expect(body[3]).toMatch(/^INSERT INTO `?nhat_ky_hanh_dong/);
    const locked = lockedTablesOf(body);
    expect(locked).toEqual(['danh_gia_bac_si']);
    expect(findLockOrderViolation([...locked, 'nhat_ky_hanh_dong'])).toBeNull();
    for (const sql of body.slice(1)) expect(sql).not.toMatch(/\blich_hen\b/);
    expect(body.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toHaveLength(3);
  });

  it('đã ẩn ⇒ đúng 2 câu (đọc thường, FOR UPDATE), không UPDATE, không nhật ký; không có ⇒ đúng 1 câu, không mở giao dịch', async () => {
    const t = await setup();
    const r = await t.m.seed({ hiddenReason: 'Lý do dựng sẵn từ trước' });
    const seen = recordStatements(db);
    await failureOf(
      t.service.hide(
        SYSTEM_SCOPE,
        adminId(t, 'system'),
        r.danhGiaId,
        hideBody(),
      ),
    );
    expect(bodyOf(seen)).toEqual([READ_FOR_HIDE_SQL, LOCK_RATING_SQL]);
    const before = seen.length;
    await failureOf(
      t.service.hide(
        SYSTEM_SCOPE,
        adminId(t, 'system'),
        '999999999',
        hideBody(),
      ),
    );
    expect(seen.slice(before)).toEqual([READ_FOR_HIDE_SQL]);
  });

  it('KDD-23 EXPLAIN của ba câu mới: đều theo khoá chính (không quét bảng); kế hoạch không phụ thuộc cỡ bảng (câu theo khoá chính)', async () => {
    const t = await setup();
    const r = await t.m.seed();
    interface Plan {
      table: string;
      type: string;
      key: string | null;
      rows: number | string | null;
    }
    const explain = (sql: string, params: unknown[]) =>
      db.query<Plan[]>(`EXPLAIN ${sql}`, params);
    const plans = {
      read: await explain(READ_FOR_HIDE_SQL, [r.danhGiaId]),
      lock: await explain(LOCK_RATING_SQL, [r.danhGiaId]),
      update: await explain(HIDE_RATING_SQL, [REASON, r.danhGiaId]),
    };
    // Kế hoạch ĐO THẬT trên MySQL 8.4 (17/11/2026): đọc thường nối hai bảng đều `const` theo khoá chính; khoá `const`; `UPDATE` dạng `range` trên khoá chính; mọi câu 1 hàng, không quét bảng
    const shape = (rows: Plan[]) =>
      rows.map(
        (plan) =>
          `${plan.table}:${plan.type}:${String(plan.key)}:${String(plan.rows)}`,
      );
    expect(shape(plans.read)).toEqual([
      'dg:const:PRIMARY:1',
      'lh:const:PRIMARY:1',
    ]);
    expect(shape(plans.lock)).toEqual(['danh_gia_bac_si:const:PRIMARY:1']);
    expect(shape(plans.update)).toEqual(['danh_gia_bac_si:range:PRIMARY:1']);
  });
});
