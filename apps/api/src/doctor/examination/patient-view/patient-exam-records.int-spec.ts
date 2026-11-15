import { vi } from 'vitest';
import {
  interceptStatements,
  recordStatements,
  WRITE_OR_LOCK_SQL,
  type StatementCall,
} from '../../../appointments/testing/statement-recorder.js';
import {
  db,
  fx,
  useStatusWorldHooks,
  world,
} from '../../../appointments/testing/status-int-kit.js';
import { ExamFixtures } from '../testing/exam-fixtures.js';
import {
  completedVisits,
  FORBIDDEN_LIST_KEYS,
  keysDeep,
  listQuery,
  listService,
  seedVisits,
  setVisitTime,
} from '../testing/patient-exam-stack.js';
import type { PatientExamRecordsPage } from './patient-exam-records.dto.js';

// doctor-exam B4 — PatientExamRecordsService THẬT trên MySQL 8.4 THẬT (PLAN 5.6, 5.15; 7.3 XHS-01…XHS-05, XHS-08, XHS-15, XHS-16, XHS-17; 7.7 QHK-05): bốn câu SELECT THẬT trong MỘT `runReadOnly` THẬT.
// Phần ĐƠN VỊ (không DB): patient-exam-records.*.spec.ts. Phần HTTP: test/doctor-exam-patient-records.e2e-spec.ts. Đồng hồ giả đặt MỘT lần ở `setup` (NOW = 10/11/2026 09:00 giờ VN: năm mặc định 2026).
// Dữ liệu giả; mọi lịch dựng qua `seedVisits` (booking) nên khung giờ nhất quán với trạng thái; giờ khám đặt lại bằng `setVisitTime` (chỉ test). Không ca GHI: dịch vụ chỉ đọc.
useStatusWorldHooks();

const NOW = new Date('2026-11-10T09:00:00+07:00');
const emptyMonths = (over: Record<string, number> = {}) => ({
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [String(index + 1), 0]),
  ),
  ...over,
});

async function setup() {
  vi.setSystemTime(NOW);
  const w = await world();
  return { w, service: listService(db), exam: new ExamFixtures(db) };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const codes = (page: PatientExamRecordsPage) =>
  page.items.map((item) => item.maLichHen);
const sumOf = (page: PatientExamRecordsPage) =>
  Object.values(page.demTheoThang).reduce((sum, n) => sum + n, 0);

/** Lịch HoanThanh rải quanh các biên tháng và năm (giờ VN) cho bản thân, người thân và năm nhuận 2028. */
async function calendar(t: Setup) {
  const rel = { hoSoNguoiThanId: t.w.relativeId };
  return seedVisits(db, fx, t.w, {
    jan1: { at: '2026-01-01 00:00:00' },
    oct31: { at: '2026-10-31 23:59:59' },
    nov30: { at: '2026-11-30 23:30:00' },
    novRel: { at: '2026-11-15 10:00:00', ...rel },
    dec1: { at: '2026-12-01 00:00:00' },
    dec31: { at: '2026-12-31 23:59:59' },
    next: { at: '2027-01-01 00:00:00' },
    feb29: { at: '2028-02-29 10:00:00' },
    mar1: { at: '2028-03-01 00:00:00' },
  });
}

describe('XHS-01 chỉ lịch HoanThanh của chính Bệnh nhân (bản thân và người thân); thứ tự', () => {
  it('trạng thái khác HoanThanh và lịch của Bệnh nhân khác không lọt; thoi_gian giảm dần rồi lich_hen_id giảm dần (cùng giờ: lịch tạo sau đứng trước)', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      old: { at: '2026-11-03 09:00:00' },
      mid: { at: '2026-11-05 10:00:00' },
      rel: {
        at: '2026-11-05 10:00:00',
        hoSoNguoiThanId: t.w.relativeId,
      },
      hold: { state: 'ChoThanhToan' },
      confirmed: { state: 'DaXacNhan' },
      inVisit: { state: 'DaTiepDon' },
      cancelled: { state: 'DaHuy' },
      absent: { state: 'VangMat' },
      moved: { state: 'DaDoiLich' },
      other: { patientId: t.w.secondPatientId },
    });
    const page = await t.service.list(t.w.patientId, listQuery(), NOW);
    expect(codes(page)).toEqual([
      v.rel.maLichHen,
      v.mid.maLichHen,
      v.old.maLichHen,
    ]);
    expect(page.total).toBe(3);
  });
});

describe('XHS-02 cờ coHoSoKham, daDanhGia; danh sách trắng', () => {
  it('bốn tổ hợp (hồ sơ, đánh giá), đánh giá bị ẩn vẫn là daDanhGia (Q19), hồ sơ có cột chữ NULL không lỗi; ĐÚNG bảy khoá, không khoá cấm ở bất kỳ độ sâu nào', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      none: { at: '2026-11-01 08:00:00' },
      record: { at: '2026-11-02 08:00:00' },
      rated: { at: '2026-11-03 08:00:00' },
      both: { at: '2026-11-04 08:00:00' },
      hidden: { at: '2026-11-05 08:00:00' },
    });
    await t.exam.record(v.record.lichHenId, {
      trieuChung: null,
      chanDoanSoBo: null,
      huongXuLy: null,
    });
    await t.exam.record(v.both.lichHenId);
    await t.exam.rating(v.rated.lichHenId);
    await t.exam.rating(v.both.lichHenId);
    await t.exam.rating(v.hidden.lichHenId, {
      biAn: true,
      lyDoAn: 'Nội dung vi phạm quy định',
    });

    const page = await t.service.list(t.w.patientId, listQuery(), NOW);
    const flags = Object.fromEntries(
      page.items.map((item) => [
        item.maLichHen,
        [item.coHoSoKham, item.daDanhGia],
      ]),
    );
    expect(flags).toEqual({
      [v.none.maLichHen]: [false, false],
      [v.record.maLichHen]: [true, false],
      [v.rated.maLichHen]: [false, true],
      [v.both.maLichHen]: [true, true],
      [v.hidden.maLichHen]: [false, true],
    });
    for (const item of page.items)
      expect(Object.keys(item).toSorted()).toEqual(
        [
          'bacSi',
          'chuyenKhoa',
          'coHoSoKham',
          'daDanhGia',
          'maLichHen',
          'nguoiKham',
          'thoiGian',
        ].toSorted(),
      );
    const leaked = keysDeep(page).filter((key) =>
      (FORBIDDEN_LIST_KEYS as readonly string[]).includes(key),
    );
    expect(leaked).toEqual([]);
  });
});

describe('XHS-03 không có lịch HoanThanh nào', () => {
  it('không lịch nào, hoặc chỉ lịch chưa hoàn thành: 200 rỗng, total 0, demTheoThang đủ 12 khoá bằng 0, nguoiKham rỗng (không lỗi)', async () => {
    const t = await setup();
    await seedVisits(db, fx, t.w, {
      inVisit: { state: 'DaTiepDon' },
      cancelled: { state: 'DaHuy' },
    });
    const page = await t.service.list(t.w.patientId, listQuery(), NOW);
    expect(page).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      demTheoThang: emptyMonths(),
      nguoiKham: [],
    });
  });
});

describe('XHS-04 lọc người khám, năm, tháng; demTheoThang; biên giờ Việt Nam', () => {
  it('mặc định năm 2026: total và demTheoThang đúng; 23:30 ngày 30/11 vào tháng 11, 00:00:00 ngày 01/12 vào tháng 12, 23:59:59 ngày 31/12 vào năm đó, 00:00:00 ngày 01/01/2027 KHÔNG', async () => {
    const t = await setup();
    await calendar(t);
    const page = await t.service.list(t.w.patientId, listQuery(), NOW);
    expect(page.total).toBe(6);
    expect(page.demTheoThang).toEqual(
      emptyMonths({ '1': 1, '10': 1, '11': 2, '12': 2 }),
    );
  });

  it('thang=11: total và trang là đúng tháng 11; demTheoThang KHÔNG đổi theo `thang`; thang=12 lấy cả hai biên 01/12 00:00:00 và 31/12 23:59:59', async () => {
    const t = await setup();
    const v = await calendar(t);
    const all = await t.service.list(t.w.patientId, listQuery(), NOW);
    const nov = await t.service.list(
      t.w.patientId,
      listQuery({ thang: 11 }),
      NOW,
    );
    expect(codes(nov)).toEqual([v.nov30.maLichHen, v.novRel.maLichHen]);
    expect(nov.total).toBe(2);
    expect(nov.demTheoThang).toEqual(all.demTheoThang);
    const dec = await t.service.list(
      t.w.patientId,
      listQuery({ thang: 12 }),
      NOW,
    );
    expect(codes(dec)).toEqual([v.dec31.maLichHen, v.dec1.maLichHen]);
  });

  it('nam=2027 chỉ có 00:00:00 ngày 01/01; nam=2028 (năm nhuận): 29/02 vào tháng 2, 01/03 00:00:00 vào tháng 3; thang=2 chỉ có 29/02', async () => {
    const t = await setup();
    const v = await calendar(t);
    const next = await t.service.list(
      t.w.patientId,
      listQuery({ nam: 2027 }),
      NOW,
    );
    expect(codes(next)).toEqual([v.next.maLichHen]);
    expect(next.demTheoThang).toEqual(emptyMonths({ '1': 1 }));
    const leap = await t.service.list(
      t.w.patientId,
      listQuery({ nam: 2028 }),
      NOW,
    );
    expect(leap.demTheoThang).toEqual(emptyMonths({ '2': 1, '3': 1 }));
    const feb = await t.service.list(
      t.w.patientId,
      listQuery({ nam: 2028, thang: 2 }),
      NOW,
    );
    expect(codes(feb)).toEqual([v.feb29.maLichHen]);
  });

  it('lọc người khám: BanThan, id hồ sơ người thân, id không thuộc mình (200 rỗng, KHÔNG 404); demTheoThang áp người khám; nguoiKham[] KHÔNG đổi theo bộ lọc: bản thân đứng đầu (id null, quanHe null)', async () => {
    const t = await setup();
    const v = await calendar(t);
    const other = await fx.relative(t.w.secondPatientId);
    const self = await t.service.list(
      t.w.patientId,
      listQuery({ nguoiKham: 'BanThan' }),
      NOW,
    );
    expect(self.total).toBe(5);
    expect(self.demTheoThang['11']).toBe(1);
    const rel = await t.service.list(
      t.w.patientId,
      listQuery({ nguoiKham: t.w.relativeId }),
      NOW,
    );
    expect(codes(rel)).toEqual([v.novRel.maLichHen]);
    expect(rel.demTheoThang).toEqual(emptyMonths({ '11': 1 }));
    const stranger = await t.service.list(
      t.w.patientId,
      listQuery({ nguoiKham: other }),
      NOW,
    );
    expect(stranger).toMatchObject({
      items: [],
      total: 0,
      demTheoThang: emptyMonths(),
    });
    for (const page of [self, rel, stranger])
      expect(page.nguoiKham).toEqual(
        expect.arrayContaining([
          {
            id: null,
            hoTen: t.w.patient.account.hoTen,
            quanHe: null,
          },
        ]),
      );
    expect(self.nguoiKham).toHaveLength(2);
    expect(self.nguoiKham[0]?.id).toBeNull();
    expect(self.nguoiKham[1]?.id).toBe(t.w.relativeId);
  });

  it('M11, XHS-04 năm mặc định theo giờ VN: 17:30 UTC ngày 31/12 đã là 00:30 ngày 01/01/2027; kết quả giống nhau ở TZ tiến trình Asia/Ho_Chi_Minh và UTC (cận là chuỗi, giờ đọc về qua driver +07:00)', async () => {
    const t = await setup();
    const v = await calendar(t);
    const late = new Date('2026-12-31T17:30:00Z');
    const before = process.env.TZ;
    try {
      const pages: PatientExamRecordsPage[] = [];
      for (const zone of ['Asia/Ho_Chi_Minh', 'UTC']) {
        process.env.TZ = zone;
        pages.push(await t.service.list(t.w.patientId, listQuery(), late));
        pages.push(await t.service.list(t.w.patientId, listQuery(), NOW));
      }
      expect(pages[2]).toEqual(pages[0]);
      expect(pages[3]).toEqual(pages[1]);
      expect(pages[0]?.items.map((item) => item.maLichHen)).toEqual([
        v.next.maLichHen,
      ]);
      expect(pages[0]?.items[0]?.thoiGian).toBe('2026-12-31T17:00:00.000Z');
      expect(pages[1]?.total).toBe(6);
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

describe('XHS-05 phân trang: trang vượt cuối, thứ tự ổn định, các trang nối nhau', () => {
  /** 28 lịch bản thân rồi 28 lịch người thân, theo bốn lịch một ngày CÙNG GIỜ (hòa `thoi_gian`: chỉ khoá phụ `lich_hen_id` giữ thứ tự). */
  async function crowd(t: Setup) {
    const self = await completedVisits(fx, t.w, 28);
    const rel = await completedVisits(fx, t.w, 28, {
      hoSoNguoiThanId: t.w.relativeId,
    });
    const all = [...self, ...rel];
    for (const [index, lich] of all.entries())
      await setVisitTime(
        db,
        lich.lichHenId,
        `2026-03-${String(1 + Math.floor(index / 4)).padStart(2, '0')} 09:00:00`,
      );
    const expected = all
      .map((lich, index) => ({ code: lich.maLichHen, index }))
      .toSorted(
        (a, b) =>
          Math.floor(b.index / 4) - Math.floor(a.index / 4) ||
          b.index - a.index,
      )
      .map((entry) => entry.code);
    return {
      expected,
      selfCodes: self.map((lich) => lich.maLichHen),
      relCodes: rel.map((lich) => lich.maLichHen),
    };
  }

  it('pageSize 50 và 20: các trang nối nhau đúng thứ tự, không trùng, không sót; trang cuối ngắn; total đúng', async () => {
    const t = await setup();
    const { expected } = await crowd(t);
    const fifty = await t.service.list(
      t.w.patientId,
      listQuery({ pageSize: 50 }),
      NOW,
    );
    const rest = await t.service.list(
      t.w.patientId,
      listQuery({ page: 2, pageSize: 50 }),
      NOW,
    );
    expect([...codes(fifty), ...codes(rest)]).toEqual(expected);
    expect([fifty.total, fifty.items.length, rest.items.length]).toEqual([
      56, 50, 6,
    ]);
    const joined: string[] = [];
    for (const page of [1, 2, 3]) {
      const result = await t.service.list(
        t.w.patientId,
        listQuery({ page, pageSize: 20 }),
        NOW,
      );
      joined.push(...codes(result));
    }
    expect(joined).toEqual(expected);
  });

  it('thứ tự ổn định cả khi lọc người khám (BanThan và người thân dùng chỉ mục khác, có filesort)', async () => {
    const t = await setup();
    const { expected, selfCodes, relCodes } = await crowd(t);
    const selfPage = await t.service.list(
      t.w.patientId,
      listQuery({ nguoiKham: 'BanThan', pageSize: 50 }),
      NOW,
    );
    const relPage = await t.service.list(
      t.w.patientId,
      listQuery({ nguoiKham: t.w.relativeId, pageSize: 50 }),
      NOW,
    );
    expect([selfPage.total, relPage.total]).toEqual([28, 28]);
    expect(codes(selfPage)).toEqual(
      expected.filter((code) => selfCodes.includes(code)),
    );
    expect(codes(relPage)).toEqual(
      expected.filter((code) => relCodes.includes(code)),
    );
  });

  it('trang vượt cuối nhỏ (999) và CỰC LỚN (1e18: offset vượt 2^64) ⇒ items rỗng, total đúng, không lỗi', async () => {
    const t = await setup();
    await completedVisits(fx, t.w, 3);
    for (const page of [999, 1e18]) {
      const result = await t.service.list(
        t.w.patientId,
        listQuery({ page }),
        NOW,
      );
      expect(result.items).toEqual([]);
      expect(result.total).toBe(3);
      expect(result.page).toBe(page);
    }
  });
});

describe('XHS-08 Q18 hồ sơ người thân đã ngừng dùng', () => {
  it('lịch HoanThanh của hồ sơ ngừng dùng vẫn có trong danh sách, trong nguoiKham[] và lọc theo id đó ra đúng', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      stopped: {
        at: '2026-11-02 09:00:00',
        hoSoNguoiThanId: t.w.stoppedRelativeId,
      },
    });
    const page = await t.service.list(t.w.patientId, listQuery(), NOW);
    expect(codes(page)).toEqual([v.stopped.maLichHen]);
    expect(page.items[0]?.nguoiKham.hoTen).toBe('Người thân đã ngừng');
    expect(page.nguoiKham.map((option) => option.id)).toEqual([
      t.w.stoppedRelativeId,
    ]);
    const filtered = await t.service.list(
      t.w.patientId,
      listQuery({ nguoiKham: t.w.stoppedRelativeId }),
      NOW,
    );
    expect(codes(filtered)).toEqual([v.stopped.maLichHen]);
  });
});

describe('QHK-05 Bệnh nhân khác không lọt, kể cả hồ sơ người thân của người khác', () => {
  it('B không thấy lịch của A; truyền id hồ sơ người thân của A ⇒ rỗng; nguoiKham[] và demTheoThang của B không có người của A', async () => {
    const t = await setup();
    const aRel = await fx.relative(t.w.patientId, {
      hoTen: 'Người thân của A',
    });
    const b = t.w.secondPatientId;
    const bRel = await fx.relative(b, { hoTen: 'Người thân của B' });
    const v = await seedVisits(db, fx, t.w, {
      a1: { at: '2026-11-02 09:00:00' },
      aRel: { at: '2026-11-03 09:00:00', hoSoNguoiThanId: aRel },
      b1: { at: '2026-11-04 09:00:00', patientId: b },
      bRel: { at: '2026-11-05 09:00:00', patientId: b, hoSoNguoiThanId: bRel },
    });
    const own = await t.service.list(b, listQuery(), NOW);
    expect(codes(own)).toEqual([v.bRel.maLichHen, v.b1.maLichHen]);
    expect(own.demTheoThang).toEqual(emptyMonths({ '11': 2 }));
    expect(own.nguoiKham.map((option) => option.hoTen)).not.toContain(
      'Người thân của A',
    );
    const probe = await t.service.list(b, listQuery({ nguoiKham: aRel }), NOW);
    expect(probe).toMatchObject({ items: [], total: 0 });
    expect(probe.demTheoThang).toEqual(emptyMonths());
    const mine = await t.service.list(t.w.patientId, listQuery(), NOW);
    expect(codes(mine)).toEqual([v.aRel.maLichHen, v.a1.maLichHen]);
  });
});

const SELECT = /^\s*SELECT\b/i;

describe('XHS-16 chuỗi câu SQL thật: chỉ đọc, một giao dịch, mỗi câu có chủ sở hữu', () => {
  it('đúng bốn SELECT, không ghi hay khoá, giao dịch READ ONLY và REPEATABLE READ bao cả bốn, mỗi câu có `lh.benh_nhan_id = ?`; không dòng nào bị đổi', async () => {
    const t = await setup();
    await completedVisits(fx, t.w, 3);
    const tables = ['lich_hen', 'ho_so_kham', 'danh_gia_bac_si', 'thong_bao'];
    const count = async () =>
      Promise.all(
        tables.map(async (table) => {
          const rows = await db.query<{ n: string }[]>(
            `SELECT COUNT(*) AS n FROM ${table}`,
          );
          return Number(rows[0]?.n);
        }),
      );
    const before = await count();
    const seen = recordStatements(db);
    await t.service.list(t.w.patientId, listQuery(), NOW);
    const during = [...seen];
    const selects = during.filter((sql) => SELECT.test(sql));
    expect(selects).toHaveLength(4);
    expect(during.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toEqual([]);
    for (const sql of selects) expect(sql).toContain('lh.benh_nhan_id = ?');
    const at = (pattern: RegExp) =>
      during.findIndex((sql) => pattern.test(sql));
    const firstSelect = during.findIndex((sql) => SELECT.test(sql));
    const lastSelect = during.findLastIndex((sql) => SELECT.test(sql));
    expect(at(/SET TRANSACTION READ ONLY/i)).toBeGreaterThanOrEqual(0);
    expect(at(/SET TRANSACTION READ ONLY/i)).toBeLessThan(firstSelect);
    expect(at(/REPEATABLE READ/i)).toBeLessThan(firstSelect);
    expect(at(/^\s*START TRANSACTION/i)).toBeLessThan(firstSelect);
    expect(at(/^\s*COMMIT/i)).toBeGreaterThan(lastSelect);
    expect(await count()).toEqual(before);
  });

  it('trang vượt cuối: chỉ ba SELECT (không gọi câu trang)', async () => {
    const t = await setup();
    await completedVisits(fx, t.w, 2);
    const seen = recordStatements(db);
    await t.service.list(t.w.patientId, listQuery({ page: 999 }), NOW);
    expect([...seen].filter((sql) => SELECT.test(sql))).toHaveLength(3);
  });
});

describe('XHS-17 cùng một ảnh chụp giữa bốn câu', () => {
  it('một lịch HoanThanh mới (kết nối khác, đã commit) chèn GIỮA câu đếm và câu 12 tháng KHÔNG làm total, demTheoThang và trang lệch nhau; sau đó lần gọi kế thấy lịch mới', async () => {
    const t = await setup();
    await completedVisits(fx, t.w, 3);
    let inserted = 0;
    interceptStatements(db, async (call: StatementCall, run) => {
      const result = await run();
      if (inserted === 0 && /^\s*SELECT COUNT\(\*\) AS total/i.test(call.sql)) {
        inserted += 1; // đặt TRƯỚC khi dựng: câu của chính bộ dựng cũng đi qua đây
        await seedVisits(db, fx, t.w, { late: { at: '2026-11-20 10:00:00' } });
      }
      return result;
    });
    const page = await t.service.list(t.w.patientId, listQuery(), NOW);
    expect(inserted).toBe(1);
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(3);
    expect(sumOf(page)).toBe(3);
    const after = await t.service.list(t.w.patientId, listQuery(), NOW);
    expect([after.total, after.items.length, sumOf(after)]).toEqual([4, 4, 4]);
  });
});

describe('XHS-15 EXPLAIN bốn câu SQL thật ở DB nhỏ (đo 100.000 lịch: spec đo tạm, TRACKING 15.8)', () => {
  it('câu nào đọc lich_hen cũng có chỉ mục bắt đầu bằng benh_nhan_id trong `possible_keys` (cả "tất cả" lẫn lọc người khám); ở DB nhỏ optimizer được phép chọn quét bảng nên KHÔNG khẳng định `type`', async () => {
    const t = await setup();
    await completedVisits(fx, t.w, 3);
    await completedVisits(fx, t.w, 1, { hoSoNguoiThanId: t.w.relativeId });
    const captured: StatementCall[] = [];
    interceptStatements(db, (call, run) => {
      captured.push(call);
      return run();
    });
    for (const nguoiKham of [undefined, 'BanThan', t.w.relativeId])
      await t.service.list(t.w.patientId, listQuery({ nguoiKham }), NOW);
    const selects = captured.filter((call) => SELECT.test(call.sql));
    expect(selects).toHaveLength(12);
    for (const call of selects) {
      const plan = await db.query<
        { table: string; possible_keys: string | null }[]
      >(`EXPLAIN ${call.sql}`, call.params);
      const lich = plan.find((row) => row.table === 'lh');
      expect(lich?.possible_keys ?? '').toMatch(
        /lich_hen_index_9|lich_hen_index_ho_so_benh_nhan_trang_thai/,
      );
    }
  });
});
