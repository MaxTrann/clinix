import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { CODES } from '../testing/operations-list-fixtures.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { requestRows } from '../testing/reschedule-request-world.js';
import {
  realRequestListService,
  requestListWorld,
  SENTINELS,
  type RequestListWorld,
} from '../testing/reschedule-request-list-world.js';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../testing/statement-recorder.js';
import type { RescheduleRequestListQuery } from './reschedule-request-list.types.js';
import type { RescheduleRequestListService } from './reschedule-request-list.service.js';

// reschedule B8 — DANH SÁCH yêu cầu đổi lịch cho Lễ tân và Quản trị viên trên MySQL 8.4 THẬT (PLAN reschedule 5.7, 7.4): XDL-03, XDL-04, XDL-33 đến XDL-36, XDL-40, XDL-15 (không rò), HDL-31 (chỉ đọc).
// Chi tiết và `coTheDuyet`: reschedule-request-detail.int-spec.ts. HTTP thật: test/booking-reschedule-requests.e2e-spec.ts. Hình dạng SQL (không DB): reschedule-request-list.sql.spec.ts.
// Mã XDL-33 đến XDL-40, HDL-31 là `[đề xuất]` (TRACKING reschedule 1.12). Đồng hồ ứng dụng giả = 02/11/2026 08:00 giờ Việt Nam. "Đáp án" của thứ tự và `total` tính bằng JavaScript từ `requestRows` (đọc thẳng
// bảng), KHÔNG từ chính câu SQL đang thử.
let db: DataSource;
let fx: BookingFixtures;
let service: RescheduleRequestListService;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
  service = realRequestListService(d);
});

const PENDING = ['ChoDuyet'] as const;
const HANDLED = ['DaDuyet', 'TuChoi'] as const;
const EVERY = ['ChoDuyet', 'DaDuyet', 'TuChoi'] as const;

const queryOf = (
  overrides: Partial<RescheduleRequestListQuery> = {},
): RescheduleRequestListQuery => {
  const page = overrides.page ?? 1;
  const pageSize = overrides.pageSize ?? 20;
  return { page, pageSize, offset: (page - 1) * pageSize, ...overrides };
};
const branchScope = (chiNhanhId: string): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId,
});
const ALL: AdminScope = { kind: 'ToanHeThong' };
const idsOf = (page: { items: { yeuCauId: string }[] }) =>
  page.items.map((item) => item.yeuCauId);

/** Đáp án độc lập: thứ tự `(thoi_diem_tao, id)` của các yêu cầu có trạng thái trong `states` và lịch thuộc `lichHenIds`, đọc thẳng từ bảng. */
async function expectedOrder(
  states: readonly string[],
  lichHenIds: readonly string[],
  direction: 'ASC' | 'DESC',
  extra: (row: { lichHenId: string }) => boolean = () => true,
) {
  const rows = (await requestRows(db)).filter(
    (row) =>
      states.includes(row.trangThai) &&
      lichHenIds.includes(row.lichHenId) &&
      extra(row),
  );
  rows.sort((a, b) => {
    const byTime = a.thoiDiemTao.localeCompare(b.thoiDiemTao);
    const byId = BigInt(a.id) < BigInt(b.id) ? -1 : 1;
    return (byTime !== 0 ? byTime : byId) * (direction === 'ASC' ? 1 : -1);
  });
  return rows.map((row) => row.id);
}

const lichOfA = (w: RequestListWorld) =>
  [
    w.apps.a1,
    w.apps.a2,
    w.apps.a3,
    w.apps.a4,
    w.apps.a5,
    w.apps.a6,
    w.apps.a7,
  ].map((lich) => lich.lichHenId);

describe('XDL-03 danh sách của Lễ tân', () => {
  it('mặc định ChoDuyet, CŨ NHẤT TRƯỚC, chỉ chi nhánh của Lễ tân; yêu cầu chi nhánh khác VẮNG; total khớp', async () => {
    const w = await requestListWorld(db, fx);
    const a = await service.listForReception(
      w.receptionA.account.taiKhoanId,
      queryOf(),
    );
    const { ids } = w;
    // Hoà thoi_diem_tao (p2, p3) xếp theo id tăng
    expect(idsOf(a)).toStrictEqual([ids.pOld, ids.p1, ids.p2, ids.p3, ids.p4]);
    expect(idsOf(a)).toStrictEqual(
      await expectedOrder(PENDING, lichOfA(w), 'ASC'),
    );
    expect(a).toMatchObject({ total: 5, page: 1, pageSize: 20 });
    expect(idsOf(a)).not.toContain(ids.bPending);

    const b = await service.listForReception(
      w.receptionB.account.taiKhoanId,
      queryOf(),
    );
    expect(idsOf(b)).toStrictEqual([ids.bPending]);
    expect(b.total).toBe(1);
  });

  it('chỉ định rõ ChoDuyet cho kết quả y hệt mặc định', async () => {
    const w = await requestListWorld(db, fx);
    const account = w.receptionA.account.taiKhoanId;
    expect(
      await service.listForReception(account, queryOf({ trangThai: PENDING })),
    ).toStrictEqual(await service.listForReception(account, queryOf()));
  });

  it('tab "Đã xử lý" (DaDuyet + TuChoi): GIẢM dần, gộp hai trạng thái ĐAN XEN, hoà thời điểm xếp theo id giảm', async () => {
    const w = await requestListWorld(db, fx);
    const { ids } = w;
    const page = await service.listForReception(
      w.receptionA.account.taiKhoanId,
      queryOf({ trangThai: HANDLED }),
    );
    // hTuChoi và hDaDuyet cùng 30/10 09:00 (id của hTuChoi lớn hơn), rồi 29/10 TuChoi, 28/10 DaDuyet
    expect(idsOf(page)).toStrictEqual([
      ids.hTuChoi,
      ids.hDaDuyet,
      ids.hTuChoi2,
      ids.hDaDuyet2,
    ]);
    expect(idsOf(page)).toStrictEqual(
      await expectedOrder(HANDLED, lichOfA(w), 'DESC'),
    );
    expect(page.total).toBe(4);
    expect(page.items.map((item) => item.trangThai)).toStrictEqual([
      'TuChoi',
      'DaDuyet',
      'TuChoi',
      'DaDuyet',
    ]);
  });

  it('chỉ MỘT trạng thái đã xử lý: chỉ trạng thái đó, vẫn giảm dần', async () => {
    const w = await requestListWorld(db, fx);
    const account = w.receptionA.account.taiKhoanId;
    const approved = await service.listForReception(
      account,
      queryOf({ trangThai: ['DaDuyet'] }),
    );
    expect(idsOf(approved)).toStrictEqual([w.ids.hDaDuyet, w.ids.hDaDuyet2]);
    const rejected = await service.listForReception(
      account,
      queryOf({ trangThai: ['TuChoi'] }),
    );
    expect(idsOf(rejected)).toStrictEqual([w.ids.hTuChoi, w.ids.hTuChoi2]);
  });

  it('cả ba trạng thái: GIẢM dần theo (thoi_diem_tao, id), khớp đáp án độc lập', async () => {
    const w = await requestListWorld(db, fx);
    const page = await service.listForReception(
      w.receptionA.account.taiKhoanId,
      queryOf({ trangThai: EVERY }),
    );
    expect(page.total).toBe(9);
    expect(idsOf(page)).toStrictEqual(
      await expectedOrder(EVERY, lichOfA(w), 'DESC'),
    );
  });

  it('thứ tự trạng thái khách gửi không đổi kết quả', async () => {
    const w = await requestListWorld(db, fx);
    const account = w.receptionA.account.taiKhoanId;
    expect(
      await service.listForReception(
        account,
        queryOf({ trangThai: ['TuChoi', 'DaDuyet'] }),
      ),
    ).toStrictEqual(
      await service.listForReception(account, queryOf({ trangThai: HANDLED })),
    );
  });
});

describe('XDL-33 phân trang qua ranh giới hai trạng thái', () => {
  it.each([1, 2, 3])(
    'pageSize %i: các trang ghép lại ĐÚNG danh sách đầy đủ, không trùng và không sót',
    async (pageSize) => {
      const w = await requestListWorld(db, fx);
      const account = w.receptionA.account.taiKhoanId;
      const full = idsOf(
        await service.listForReception(
          account,
          queryOf({ trangThai: EVERY, pageSize: 100 }),
        ),
      );
      const collected: string[] = [];
      for (
        let page = 1;
        page <= Math.ceil(full.length / pageSize) + 1;
        page += 1
      ) {
        const result = await service.listForReception(
          account,
          queryOf({ trangThai: EVERY, page, pageSize }),
        );
        expect(result.total).toBe(full.length);
        expect(result.items.length).toBeLessThanOrEqual(pageSize);
        collected.push(...idsOf(result));
      }
      expect(collected).toStrictEqual(full);
      expect(new Set(collected).size).toBe(collected.length);
    },
  );

  it('tab đã xử lý, pageSize 1: mỗi trang một yêu cầu, luân phiên TuChoi và DaDuyet (trang 2 lấy từ nhánh KHÁC trang 1)', async () => {
    const w = await requestListWorld(db, fx);
    const account = w.receptionA.account.taiKhoanId;
    const states: string[] = [];
    for (let page = 1; page <= 4; page += 1) {
      const result = await service.listForReception(
        account,
        queryOf({ trangThai: HANDLED, page, pageSize: 1 }),
      );
      expect(result.items).toHaveLength(1);
      states.push(result.items[0]?.trangThai ?? '?');
    }
    expect(states).toStrictEqual(['TuChoi', 'DaDuyet', 'TuChoi', 'DaDuyet']);
  });
});

describe('XDL-34 total khớp danh sách ở mọi bộ lọc', () => {
  it('phạm vi × trạng thái × bác sĩ: total bằng số hàng đáp án và bằng số mục khi pageSize đủ lớn', async () => {
    const w = await requestListWorld(db, fx);
    const account = w.receptionA.account.taiKhoanId;
    const doctors = [
      w.doctorA1.profile.taiKhoanId,
      w.doctorA2.profile.taiKhoanId,
    ];
    const doctorOfLich = new Map<string, string>(
      (
        await db.query<{ id: string; bacSi: string }[]>(
          'SELECT CAST(lich_hen_id AS CHAR) AS id, CAST(bac_si_id AS CHAR) AS bacSi FROM lich_hen',
        )
      ).map((row) => [row.id, row.bacSi] as const),
    );
    for (const states of [PENDING, HANDLED, EVERY, ['TuChoi']] as const)
      for (const bacSiId of [undefined, ...doctors]) {
        const expected = await expectedOrder(
          states,
          lichOfA(w),
          'DESC',
          (row) =>
            bacSiId === undefined ||
            doctorOfLich.get(row.lichHenId) === bacSiId,
        );
        const result = await service.listForReception(
          account,
          queryOf({
            trangThai: states,
            pageSize: 100,
            ...(bacSiId === undefined ? {} : { bacSiId }),
          }),
        );
        expect(result.total).toBe(expected.length);
        expect(result.items).toHaveLength(expected.length);
        expect([...idsOf(result)].sort()).toStrictEqual([...expected].sort());
      }
  });

  it('con số cụ thể: bác sĩ A1 có 3 chờ duyệt và 3 đã xử lý, bác sĩ A2 có 2 và 1; bác sĩ của chi nhánh khác ⇒ rỗng', async () => {
    const w = await requestListWorld(db, fx);
    const account = w.receptionA.account.taiKhoanId;
    const totalOf = async (
      bacSiId: string,
      trangThai: RescheduleRequestListQuery['trangThai'],
    ) =>
      (await service.listForReception(account, queryOf({ bacSiId, trangThai })))
        .total;
    const a1 = w.doctorA1.profile.taiKhoanId;
    const a2 = w.doctorA2.profile.taiKhoanId;
    expect(await totalOf(a1, PENDING)).toBe(3);
    expect(await totalOf(a1, HANDLED)).toBe(3);
    expect(await totalOf(a2, PENDING)).toBe(2);
    expect(await totalOf(a2, HANDLED)).toBe(1);
    expect(await totalOf(w.doctorB.profile.taiKhoanId, EVERY)).toBe(0);
  });
});

describe('XDL-35 q là mã lịch hẹn đầy đủ', () => {
  it('đúng mã: chỉ yêu cầu của lịch đó (chờ duyệt cũ nhất trước; mọi trạng thái giảm dần)', async () => {
    const w = await requestListWorld(db, fx);
    const account = w.receptionA.account.taiKhoanId;
    const { ids } = w;
    const pending = await service.listForReception(
      account,
      queryOf({ q: CODES.a1 }),
    );
    expect(idsOf(pending)).toStrictEqual([ids.p1, ids.p3]);
    const every = await service.listForReception(
      account,
      queryOf({ q: CODES.a1, trangThai: EVERY }),
    );
    expect(idsOf(every)).toStrictEqual([
      ids.p3,
      ids.p1,
      ids.hTuChoi,
      ids.hDaDuyet,
    ]);
    expect(every.total).toBe(4);
  });

  it('mã của chi nhánh khác, mã không tồn tại, lịch không có yêu cầu ⇒ rỗng với total 0; Lễ tân B thấy mã của B', async () => {
    const w = await requestListWorld(db, fx);
    const account = w.receptionA.account.taiKhoanId;
    for (const q of [CODES.b1, CODES.missing, CODES.a3])
      expect(
        await service.listForReception(
          account,
          queryOf({ q, trangThai: EVERY }),
        ),
      ).toMatchObject({ items: [], total: 0 });
    expect(
      idsOf(
        await service.listForReception(
          w.receptionB.account.taiKhoanId,
          queryOf({ q: CODES.b1 }),
        ),
      ),
    ).toStrictEqual([w.ids.bPending]);
  });

  it('q kết hợp bác sĩ: lọc giao nhau (mã của bác sĩ A1 với bác sĩ A2 ⇒ rỗng)', async () => {
    const w = await requestListWorld(db, fx);
    const account = w.receptionA.account.taiKhoanId;
    expect(
      (
        await service.listForReception(
          account,
          queryOf({ q: CODES.a1, bacSiId: w.doctorA2.profile.taiKhoanId }),
        )
      ).total,
    ).toBe(0);
    expect(
      (
        await service.listForReception(
          account,
          queryOf({ q: CODES.a1, bacSiId: w.doctorA1.profile.taiKhoanId }),
        )
      ).total,
    ).toBe(2);
  });
});

describe('XDL-36 trang cuối và ngoài biên', () => {
  it('trang cuối có ít hơn pageSize; trang sau đó rỗng nhưng total giữ nguyên; page khổng lồ không lỗi', async () => {
    const w = await requestListWorld(db, fx);
    const account = w.receptionA.account.taiKhoanId;
    const last = await service.listForReception(
      account,
      queryOf({ page: 3, pageSize: 2 }),
    );
    expect(idsOf(last)).toStrictEqual([w.ids.p4]);
    expect(last.total).toBe(5);
    const beyond = await service.listForReception(
      account,
      queryOf({ page: 4, pageSize: 2 }),
    );
    expect(beyond).toStrictEqual({ items: [], total: 5, page: 4, pageSize: 2 });
    const huge = await service.listForReception(
      account,
      queryOf({ page: 1_000_000_000, pageSize: 100 }),
    );
    expect(huge).toMatchObject({ items: [], total: 5 });
  });

  it('offset >= total: KHÔNG câu trang nào tới MySQL (chỉ câu đếm)', async () => {
    const w = await requestListWorld(db, fx);
    const seen = recordStatements(db);
    await service.listForReception(
      w.receptionA.account.taiKhoanId,
      queryOf({ page: 9, pageSize: 10 }),
    );
    expect(seen.some((sql) => /\bLIMIT\b|\bOFFSET\b/.test(sql))).toBe(false);
    expect(seen.some((sql) => /COUNT\(\*\)/.test(sql))).toBe(true);
  });
});

describe('XDL-04 danh sách của Quản trị viên', () => {
  it('Toàn hệ thống: mọi chi nhánh, chờ duyệt cũ nhất trước xuyên chi nhánh', async () => {
    const w = await requestListWorld(db, fx);
    const page = await service.list(ALL, queryOf());
    expect(idsOf(page)).toStrictEqual([
      w.ids.bPending,
      w.ids.pOld,
      w.ids.p1,
      w.ids.p2,
      w.ids.p3,
      w.ids.p4,
    ]);
    expect(page.total).toBe(6);
    expect(page.items.map((item) => item.chiNhanh.id)).toStrictEqual([
      w.branchB.chiNhanhId,
      ...Array<string>(5).fill(w.branchA.chiNhanhId),
    ]);
  });

  it('Toàn hệ thống lọc chiNhanhId: đúng chi nhánh đó; chi nhánh không tồn tại ⇒ rỗng', async () => {
    const w = await requestListWorld(db, fx);
    expect(
      (await service.list(ALL, queryOf({ chiNhanhId: w.branchA.chiNhanhId })))
        .total,
    ).toBe(5);
    expect(
      idsOf(
        await service.list(
          ALL,
          queryOf({ chiNhanhId: w.branchB.chiNhanhId, trangThai: EVERY }),
        ),
      ),
    ).toStrictEqual([w.ids.bHandled, w.ids.bPending]);
    expect(
      await service.list(ALL, queryOf({ chiNhanhId: '999999999' })),
    ).toMatchObject({ items: [], total: 0 });
  });

  it('Chi nhánh: chỉ chi nhánh được gán; chiNhanhId đúng dạng NGOÀI phạm vi (chi nhánh khác, không tồn tại) BỊ BỎ QUA (nếp DSV-02)', async () => {
    const w = await requestListWorld(db, fx);
    const scopeA = branchScope(w.branchA.chiNhanhId);
    const scopeB = branchScope(w.branchB.chiNhanhId);
    const own = await service.list(scopeA, queryOf());
    expect(own.total).toBe(5);
    expect(idsOf(own)).not.toContain(w.ids.bPending);
    for (const chiNhanhId of [w.branchB.chiNhanhId, '999999999'])
      expect(await service.list(scopeA, queryOf({ chiNhanhId }))).toStrictEqual(
        own,
      );
    expect(
      idsOf(
        await service.list(
          scopeB,
          queryOf({ chiNhanhId: w.branchA.chiNhanhId }),
        ),
      ),
    ).toStrictEqual([w.ids.bPending]);
  });
});

describe('XDL-40 id BIGINT lớn hơn 2^53', () => {
  it('yeuCauId giữ NGUYÊN chuỗi (có id 9007199254740993, không biểu diễn được bằng Number) và trang đúng thứ tự; lọc chi nhánh vẫn đúng', async () => {
    const w = await requestListWorld(db, fx, { bigIds: true });
    const page = await service.list(
      ALL,
      queryOf({ trangThai: EVERY, pageSize: 100 }),
    );
    // Có yêu cầu mang id 9007199254740993 (không biểu diễn được bằng Number: ép số sẽ ra …992)
    expect(idsOf(page)).toContain('9007199254740993');
    expect(new Set(idsOf(page)).size).toBe(11);
    for (const item of page.items)
      expect(BigInt(item.yeuCauId)).toBeGreaterThanOrEqual(9007199254740990n);
    const onlyB = await service.list(
      ALL,
      queryOf({ trangThai: EVERY, chiNhanhId: w.branchB.chiNhanhId }),
    );
    expect(idsOf(onlyB).sort()).toStrictEqual(
      [w.ids.bPending, w.ids.bHandled].sort(),
    );
    expect(
      onlyB.items.every((i) => i.chiNhanh.id === w.branchB.chiNhanhId),
    ).toBe(true);
  });
});

describe('XDL-15, HDL-31 không rò dữ liệu và CHỈ ĐỌC', () => {
  it('JSON danh sách đúng 10 khoá mỗi dòng, không chứa SĐT, lý do khám, giá, email, lý do yêu cầu hay id lịch', async () => {
    await requestListWorld(db, fx);
    const page = await service.list(
      ALL,
      queryOf({ trangThai: EVERY, pageSize: 100 }),
    );
    for (const item of page.items) expect(Object.keys(item)).toHaveLength(10);
    const json = JSON.stringify(page);
    for (const secret of [
      SENTINELS.visitReason,
      SENTINELS.price,
      SENTINELS.patientPhone,
      '@example.com',
      'ly_do',
      'lichHenId',
      'Tôi có việc đột xuất vào đúng giờ đã đặt',
    ])
      expect(json).not.toContain(secret);
  });

  it('danh sách (đếm + trang) chạy trong ĐÚNG MỘT giao dịch và không câu nào ghi hay khoá hàng', async () => {
    const w = await requestListWorld(db, fx);
    const seen = recordStatements(db);
    await service.list(ALL, queryOf({ trangThai: EVERY }));
    await service.listForReception(
      w.receptionA.account.taiKhoanId,
      queryOf({ trangThai: HANDLED }),
    );
    expect(seen.filter((sql) => /^START TRANSACTION/i.test(sql))).toHaveLength(
      2,
    );
    expect(seen.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toStrictEqual([]);
    // Đọc phạm vi Lễ tân là MỘT câu đọc `le_tan` (ngoài giao dịch chỉ đọc), phần còn lại là SELECT của danh sách
    expect(seen.some((sql) => /\bUNION ALL\b/.test(sql))).toBe(true);
  });

  it('không ghi gì vào DB: số hàng ba bảng yêu cầu, thông báo, hộp thư đi không đổi', async () => {
    const w = await requestListWorld(db, fx);
    const count = () =>
      db.query<{ n: string }[]>(
        `SELECT (SELECT COUNT(*) FROM yeu_cau_doi_lich_ngoai_chinh_sach) + (SELECT COUNT(*) FROM thong_bao) + (SELECT COUNT(*) FROM email_thong_bao) + (SELECT COUNT(*) FROM nhat_ky_hanh_dong) AS n`,
      );
    const before = await count();
    await service.list(ALL, queryOf({ trangThai: EVERY }));
    await service.listForReception(w.receptionA.account.taiKhoanId, queryOf());
    expect(await count()).toStrictEqual(before);
  });
});
