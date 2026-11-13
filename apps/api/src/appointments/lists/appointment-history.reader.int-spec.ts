import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import {
  AdminListFixtures,
  insertAuditRow,
  overrideChanges,
} from '../testing/admin-list-fixtures.js';
import { AppointmentListFixtures } from '../testing/appointment-list-fixtures.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { OperationsListFixtures } from '../testing/operations-list-fixtures.js';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../testing/statement-recorder.js';
import { AppointmentHistoryReader } from './appointment-history.reader.js';

// Task B4 — bộ đọc panel "Lịch sử trạng thái" trên MySQL 8.4 THẬT (PLAN booking Q28, L26; TRACKING 3.33 B4-E, 3.33.3): hai câu SQL (mốc của lịch, nhật ký `OverrideLichHen`) với dữ liệu thật, gồm ca âm
// (lịch khác, hành động khác, đối tượng khác, thất bại, `changes` hỏng), trần 100, ký tự đặc biệt qua cột JSON. Hàm thuần dựng panel: appointment-history.mapper.spec.ts; chuỗi SQL: appointment-history.reader.spec.ts;
// service và HTTP: admin-appointments.int-spec.ts, test/booking-admin-appointments.e2e-spec.ts. Mã LSD-nn là PLAN 7.39 `[đề xuất]`. Dòng nhật ký ghi bằng SQL thô (testing/admin-list-fixtures.ts), không qua mã của B14.
// Giờ trong test là chuỗi giờ VN; kết quả là ISO UTC (08:00 giờ VN là 01:00Z). Dữ liệu giả.
let db: DataSource;
let afx: AdminListFixtures;
const reader = new AppointmentHistoryReader();

useIntegrationHooks((testDb) => {
  db = testDb;
  const fx = new BookingFixtures(testDb);
  const lf = new AppointmentListFixtures(fx, testDb);
  afx = new AdminListFixtures(
    fx,
    new OperationsListFixtures(fx, lf, testDb),
    testDb,
  );
});

const read = (lichHenId: string) =>
  runReadOnly(db, (manager) => reader.read(manager, lichHenId));
// Giờ VN `YYYY-MM-DD HH:mm:ss` sang ISO UTC (múi giờ +07:00)
const iso = (vn: string) =>
  new Date(`${vn.replace(' ', 'T')}+07:00`).toISOString();
const CREATED = '2026-11-01 08:00:00';
const TAO = { thoiDiem: iso(CREATED), loai: 'TaoLich' };

/** Thế giới hai chi nhánh với mốc tạo của MỌI lịch đặt về `CREATED` (đồng hồ DB thật khác đồng hồ giả của test). */
async function world() {
  const w = await afx.world();
  for (const app of Object.values(w.apps))
    await afx.setMilestones(app.lichHenId, { tao: CREATED });
  return w;
}
const actorOf = (w: { systemAdmin: { account: { taiKhoanId: string } } }) =>
  w.systemAdmin.account.taiKhoanId;

describe('LSD-01, LSD-02 mốc của chính lịch hẹn', () => {
  it('LSD-01 lịch chưa huỷ, chưa override ⇒ ĐÚNG một mục TaoLich theo `thoi_diem_tao`', async () => {
    const w = await world();
    expect(await read(w.apps.a1.lichHenId)).toStrictEqual([TAO]);
  });

  it('LSD-02 lịch huỷ không qua override ⇒ TaoLich rồi HuyLich theo `thoi_diem_huy` và `ly_do_huy`; `ly_do_huy` NULL ⇒ `lyDo` null', async () => {
    const w = await world();
    const id = w.apps.a4.lichHenId;
    await afx.setMilestones(id, {
      huy: '2026-11-02 10:00:00',
      lyDoHuy: 'Fixture huỷ lịch',
    });
    const huy = {
      thoiDiem: iso('2026-11-02 10:00:00'),
      loai: 'HuyLich',
      denTrangThai: 'DaHuy',
    };
    expect(await read(id)).toStrictEqual([
      TAO,
      { ...huy, lyDo: 'Fixture huỷ lịch' },
    ]);
    await afx.setMilestones(id, { lyDoHuy: null });
    expect(await read(id)).toStrictEqual([TAO, { ...huy, lyDo: null }]);
  });
});

describe('LSD-03, LSD-04 thứ tự và khử trùng trên dữ liệu thật', () => {
  it('LSD-03 dòng nhật ký chèn SAI thứ tự thời gian vẫn ra đúng: theo thời điểm tăng, cùng giây theo id nhật ký, HuyLich sau cùng; TaoLich đầu', async () => {
    const w = await world();
    const lich = w.apps.a6;
    const at = (vn: string, lyDo: string) =>
      afx.override({
        lichHenId: lich.lichHenId,
        chiNhanhId: w.branchA.chiNhanhId,
        actorId: actorOf(w),
        at: vn,
        from: 'DaXacNhan',
        to: 'VangMat',
        lyDo,
      });
    // Chèn muộn trước: id nhỏ nhất nhưng thời điểm lớn nhất
    await at('2026-11-05 09:00:00', 'm1');
    await at('2026-11-03 09:00:00', 'm2');
    await at('2026-11-04 09:00:00', 'm3');
    await at('2026-11-04 09:00:00', 'm4');
    await afx.setMilestones(lich.lichHenId, {
      huy: '2026-11-06 09:00:00',
      lyDoHuy: 'Bệnh nhân hủy',
    });
    const history = await read(lich.lichHenId);
    expect(
      history.map((entry) => ('lyDo' in entry ? entry.lyDo : 'TaoLich')),
    ).toStrictEqual(['TaoLich', 'm2', 'm3', 'm4', 'm1', 'Bệnh nhân hủy']);
    expect(history.map((entry) => entry.loai)).toStrictEqual([
      'TaoLich',
      'OverrideLichHen',
      'OverrideLichHen',
      'OverrideLichHen',
      'OverrideLichHen',
      'HuyLich',
    ]);
    expect(history[1]).toStrictEqual({
      thoiDiem: iso('2026-11-03 09:00:00'),
      loai: 'OverrideLichHen',
      tuTrangThai: 'DaXacNhan',
      denTrangThai: 'VangMat',
      lyDo: 'm2',
    });
  });

  it('LSD-04 huỷ qua override: lịch có CẢ `thoi_diem_huy` lẫn dòng nhật ký sang DaHuy ⇒ chỉ MỘT mục (override), không HuyLich trùng', async () => {
    const w = await world();
    const lich = w.apps.a4;
    await afx.override({
      lichHenId: lich.lichHenId,
      chiNhanhId: w.branchA.chiNhanhId,
      actorId: actorOf(w),
      at: '2026-11-03 09:00:00',
      from: 'DaXacNhan',
      to: 'DaHuy',
      lyDo: 'Trùng lịch',
    });
    await afx.setMilestones(lich.lichHenId, {
      huy: '2026-11-03 09:00:01',
      lyDoHuy: 'Trùng lịch',
    });
    expect(await read(lich.lichHenId)).toStrictEqual([
      TAO,
      {
        thoiDiem: iso('2026-11-03 09:00:00'),
        loai: 'OverrideLichHen',
        tuTrangThai: 'DaXacNhan',
        denTrangThai: 'DaHuy',
        lyDo: 'Trùng lịch',
      },
    ]);
  });
});

describe('LSD-05 nhật ký không thuộc lịch hay không phải override', () => {
  it('LSD-05 không lẫn dòng của lịch KHÁC (cùng chi nhánh), của hành động khác, của đối tượng khác cùng `ma_doi_tuong`, và dòng ThatBai; chỉ dòng hợp lệ của đúng lịch', async () => {
    const w = await world();
    const target = w.apps.a1;
    const base = {
      lichHenId: target.lichHenId,
      chiNhanhId: w.branchA.chiNhanhId,
      actorId: actorOf(w),
      from: 'DaXacNhan',
      to: 'VangMat',
    } as const;
    await afx.override({ ...base, at: '2026-11-03 09:00:00', lyDo: 'đúng' });
    // Bốn dòng nhiễu, mỗi dòng sai MỘT điều kiện
    await afx.override({
      ...base,
      lichHenId: w.apps.a3.lichHenId,
      at: '2026-11-03 09:01:00',
      lyDo: 'lịch khác',
    });
    await afx.override(
      { ...base, at: '2026-11-03 09:02:00', lyDo: 'hành động khác' },
      { hanhDong: 'HoanTienDacBiet' },
    );
    await afx.override(
      { ...base, at: '2026-11-03 09:03:00', lyDo: 'đối tượng khác' },
      { loaiDoiTuong: 'tai_khoan' },
    );
    await afx.override(
      { ...base, at: '2026-11-03 09:04:00', lyDo: 'thất bại' },
      { ketQua: 'ThatBai' },
    );
    const history = await read(target.lichHenId);
    expect(
      history.map((entry) => ('lyDo' in entry ? entry.lyDo : 'TaoLich')),
    ).toStrictEqual(['TaoLich', 'đúng']);
    // Lịch kia vẫn thấy dòng của nó (điều kiện không loại nhầm)
    expect(
      (await read(w.apps.a3.lichHenId)).map((entry) =>
        'lyDo' in entry ? entry.lyDo : 'TaoLich',
      ),
    ).toStrictEqual(['TaoLich', 'lịch khác']);
  });
});

describe('LSD-06 `chi_tiet_thay_doi` sai hình dạng', () => {
  const VALID = { truoc: 'DaXacNhan', sau: 'VangMat' } as const;
  it.each([
    ['NULL', null],
    ['chuỗi JSON', 'không phải đối tượng'],
    ['số JSON', 7],
    ['mảng JSON', []],
    ['đối tượng rỗng', {}],
    [
      'thiếu ly_do',
      { truoc: { trang_thai: 'DaXacNhan' }, sau: { trang_thai: 'VangMat' } },
    ],
    ['thiếu truoc', { sau: { trang_thai: 'VangMat' }, ly_do: 'x' }],
    [
      'truoc là chuỗi',
      { truoc: 'DaXacNhan', sau: { trang_thai: 'VangMat' }, ly_do: 'x' },
    ],
    [
      'trạng thái ngoài enum',
      {
        truoc: { trang_thai: 'KhongCo' },
        sau: { trang_thai: 'VangMat' },
        ly_do: 'x',
      },
    ],
    [
      'ly_do là số',
      {
        truoc: { trang_thai: 'DaXacNhan' },
        sau: { trang_thai: 'VangMat' },
        ly_do: 5,
      },
    ],
  ])(
    'LSD-06 %s ⇒ bỏ mục đó; mục hợp lệ cạnh nó vẫn đủ; không lỗi',
    async (_name, changes) => {
      const w = await world();
      const lich = w.apps.a1;
      await afx.override({
        lichHenId: lich.lichHenId,
        chiNhanhId: w.branchA.chiNhanhId,
        actorId: actorOf(w),
        at: '2026-11-03 09:00:00',
        from: VALID.truoc,
        to: VALID.sau,
        lyDo: 'hợp lệ',
      });
      await afx.override(
        {
          lichHenId: lich.lichHenId,
          chiNhanhId: w.branchA.chiNhanhId,
          actorId: actorOf(w),
          at: '2026-11-03 09:30:00',
          from: VALID.truoc,
          to: VALID.sau,
        },
        { changes },
      );
      const history = await read(lich.lichHenId);
      expect(history).toHaveLength(2);
      expect(history[1]).toMatchObject({
        loai: 'OverrideLichHen',
        lyDo: 'hợp lệ',
      });
    },
  );
});

describe('LSD-07, LSD-08, LSD-09 nội dung, trần và quyền riêng tư', () => {
  it('LSD-07 `lyDo` có ký tự đặc biệt đi qua cột JSON của MySQL và ra nguyên từng ký tự (nháy, gạch chéo ngược, thẻ HTML, tiếng Việt, emoji, xuống dòng, %, _, !)', async () => {
    const w = await world();
    const special =
      'Nói "đã gọi" \\ <script>alert(1)</script> Đặng Văn Cường 😀\nDòng hai 100% a_b !';
    await afx.override({
      lichHenId: w.apps.a1.lichHenId,
      chiNhanhId: w.branchA.chiNhanhId,
      actorId: actorOf(w),
      at: '2026-11-03 09:00:00',
      from: 'DaXacNhan',
      to: 'VangMat',
      lyDo: special,
    });
    const history = await read(w.apps.a1.lichHenId);
    expect(history[1]).toMatchObject({ lyDo: special });
    expect(Object.keys(history[1] ?? {}).sort()).toStrictEqual([
      'denTrangThai',
      'loai',
      'lyDo',
      'thoiDiem',
      'tuTrangThai',
    ]);
  });

  it('LSD-08 101 dòng nhật ký của một lịch ⇒ TaoLich cộng 100 dòng MỚI nhất; dòng cũ nhất bị bỏ; thứ tự cũ đến mới', async () => {
    const w = await world();
    const id = w.apps.a3.lichHenId;
    for (let i = 0; i < 101; i += 1) {
      const at = new Date(Date.UTC(2026, 10, 3, 0, 0, 0) + i * 60_000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
      await afx.override({
        lichHenId: id,
        chiNhanhId: w.branchA.chiNhanhId,
        actorId: actorOf(w),
        at,
        from: 'DaXacNhan',
        to: 'VangMat',
        lyDo: `lan-${String(i)}`,
      });
    }
    const history = await read(id);
    expect(history).toHaveLength(101);
    const reasons = history
      .slice(1)
      .map((entry) => ('lyDo' in entry ? entry.lyDo : ''));
    expect(reasons[0]).toBe('lan-1');
    expect(reasons[99]).toBe('lan-100');
    expect(reasons).not.toContain('lan-0');
  });

  it('LSD-09 không lộ người thực hiện: khoá mỗi loại mục đúng danh sách; JSON không chứa email của Quản trị viên, mã tài khoản, id nhật ký hay chi nhánh', async () => {
    const w = await world();
    await afx.override({
      lichHenId: w.apps.a4.lichHenId,
      chiNhanhId: w.branchA.chiNhanhId,
      actorId: actorOf(w),
      at: '2026-11-03 09:00:00',
      from: 'DaXacNhan',
      to: 'VangMat',
      lyDo: 'vì lý do riêng',
    });
    await afx.setMilestones(w.apps.a4.lichHenId, {
      huy: '2026-11-04 09:00:00',
      lyDoHuy: 'Bệnh nhân hủy',
    });
    const history = await read(w.apps.a4.lichHenId);
    expect(history.map((entry) => Object.keys(entry).sort())).toStrictEqual([
      ['loai', 'thoiDiem'],
      ['denTrangThai', 'loai', 'lyDo', 'thoiDiem', 'tuTrangThai'],
      ['denTrangThai', 'loai', 'lyDo', 'thoiDiem'],
    ]);
    const actors = await db.query<{ email: string }[]>(
      'SELECT email FROM tai_khoan WHERE tai_khoan_id = ?',
      [actorOf(w)],
    );
    const json = JSON.stringify(history);
    expect(json).not.toContain(actors[0]?.email ?? '?');
    expect(json).not.toMatch(/taiKhoan|nhatKy|chiNhanh|nguoiThucHien/);
  });
});

describe('chỉ đọc và hình dạng dữ liệu thật', () => {
  it('đúng hai câu SELECT trong giao dịch chỉ đọc: không INSERT, UPDATE, DELETE, không FOR UPDATE hay FOR SHARE; không hàm giờ của DB (AR-04)', async () => {
    const w = await world();
    await afx.override({
      lichHenId: w.apps.a1.lichHenId,
      chiNhanhId: w.branchA.chiNhanhId,
      actorId: actorOf(w),
      at: '2026-11-03 09:00:00',
      from: 'DaXacNhan',
      to: 'VangMat',
    });
    const seen = recordStatements(db);
    await read(w.apps.a1.lichHenId);
    const selects = seen.filter((sql) => /^\s*SELECT\b/i.test(sql));
    expect(selects).toHaveLength(2);
    expect(selects.some((sql) => /nhat_ky_hanh_dong/.test(sql))).toBe(true);
    expect(seen.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toStrictEqual([]);
    expect(seen.join('\n')).not.toMatch(/\b(NOW|CURDATE|CURRENT_TIMESTAMP)\b/i);
  });

  it('dòng nhật ký chèn trực tiếp bằng `insertAuditRow` (hàm của fixture) đúng bốn cột JSON của B14: đọc lại ra đúng ba khoá `truoc`, `sau`, `ly_do`', async () => {
    const w = await world();
    const id = await insertAuditRow(db, {
      actorId: actorOf(w),
      chiNhanhId: w.branchA.chiNhanhId,
      hanhDong: 'OverrideLichHen',
      loaiDoiTuong: 'lich_hen',
      maDoiTuong: w.apps.a1.lichHenId,
      at: '2026-11-03 09:00:00',
      ketQua: 'ThanhCong',
      changes: overrideChanges('DaXacNhan', 'VangMat', 'kiểm hình dạng'),
    });
    const rows = await db.query<{ changes: unknown }[]>(
      'SELECT chi_tiet_thay_doi AS changes FROM nhat_ky_hanh_dong WHERE nhat_ky_hanh_dong_id = ?',
      [id],
    );
    expect(rows[0]?.changes).toStrictEqual({
      truoc: { trang_thai: 'DaXacNhan' },
      sau: { trang_thai: 'VangMat' },
      ly_do: 'kiểm hình dạng',
    });
  });
});
