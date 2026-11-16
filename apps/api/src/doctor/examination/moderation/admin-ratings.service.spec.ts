import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type { AdminRatingsQuery } from './admin-ratings.dto.js';
import type {
  AdminRatingDetailRow,
  AdminRatingRow,
  StatusCountRow,
} from './admin-ratings.mapper.js';
import type { AdminRatingsRepository } from './admin-ratings.repository.js';
import { AdminRatingsService } from './admin-ratings.service.js';

// doctor-exam B7 — AdminRatingsService với DataSource và repository GIẢ (PLAN 5.8; KDD-01, KDD-02, KDD-03, KDD-17; QHK-06, QHK-07, QHK-11). Không DB: SQL thật, ảnh chụp và số câu thật ở admin-ratings.int-spec.ts.
// Repository giả CHỈ có `countByStatus`, `findPage`, `findOne`: service mà gọi một câu `COUNT` thứ ba thì ném lỗi "không phải hàm".
const BASE: AdminRatingsQuery = { page: 1, pageSize: 20, offset: 0 };
const SYSTEM: AdminScope = { kind: 'ToanHeThong' };
const BRANCH_7: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '7' };
const ROW: AdminRatingRow = {
  danhGiaId: '501',
  bacSiId: '31',
  bacSiHoTen: 'Bác sĩ Mẫu',
  chiNhanhId: '7',
  chiNhanhTen: 'Chi nhánh Một',
  nguoiDanhGiaHoTen: 'Người Đặt Mẫu',
  soSao: 5,
  nhanXet: 'x'.repeat(300),
  thoiDiemTao: new Date('2026-11-10T09:00:00+07:00'),
  biAn: 0,
};
const DETAIL_ROW: AdminRatingDetailRow = {
  ...ROW,
  maLichHen: 'CLX-20261110-7K3QD',
  thoiGianKham: new Date('2026-11-09T08:30:00+07:00'),
  lyDoAn: null,
};
const counts = (shown: number, hidden: number): StatusCountRow[] => [
  { biAn: 0, soLuong: String(shown) },
  { biAn: 1, soLuong: String(hidden) },
];

function setup(rows: StatusCountRow[] = counts(3, 2), found = DETAIL_ROW) {
  const manager = { tag: 'manager' } as unknown as EntityManager;
  const calls: string[] = [];
  const runner = {
    manager,
    connect: vi.fn(),
    query: vi.fn((sql: string) => {
      calls.push(`query ${sql}`);
    }),
    startTransaction: vi.fn((level: string) => {
      calls.push(`start ${level}`);
    }),
    commitTransaction: vi.fn(() => {
      calls.push('commit');
    }),
    rollbackTransaction: vi.fn(() => {
      calls.push('rollback');
    }),
    release: vi.fn(() => {
      calls.push('release');
    }),
  };
  const repository = {
    countByStatus: vi.fn((..._args: unknown[]) => {
      calls.push('countByStatus');
      return Promise.resolve(rows);
    }),
    findPage: vi.fn((..._args: unknown[]) => {
      calls.push('findPage');
      return Promise.resolve([ROW]);
    }),
    findOne: vi.fn((..._args: unknown[]) => {
      calls.push('findOne');
      return Promise.resolve<AdminRatingDetailRow | null>(found);
    }),
  };
  const service = new AdminRatingsService(
    { createQueryRunner: () => runner } as unknown as DataSource,
    repository as unknown as AdminRatingsRepository,
    new BranchAccessPolicy(),
  );
  return { service, repository, runner, manager, calls };
}

async function failureOf(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('lẽ ra phải lỗi');
}

describe('KDD-17 danh sách: hai câu trong MỘT giao dịch chỉ đọc', () => {
  it('thứ tự: SET TRANSACTION READ ONLY, bắt đầu REPEATABLE READ, countByStatus, findPage, commit, release; cả hai câu dùng chung MỘT manager', async () => {
    const t = setup();
    await t.service.list(SYSTEM, BASE);
    expect(t.calls).toEqual([
      'query SET TRANSACTION READ ONLY',
      'start REPEATABLE READ',
      'countByStatus',
      'findPage',
      'commit',
      'release',
    ]);
    expect(t.repository.countByStatus.mock.calls[0]?.[0]).toBe(t.manager);
    expect(t.repository.findPage.mock.calls[0]?.[0]).toBe(t.manager);
  });

  it('lỗi của repository: hoàn tác, trả kết nối, lỗi đi tiếp (không nuốt)', async () => {
    const t = setup();
    t.repository.findPage.mockImplementationOnce(() =>
      Promise.reject(new Error('mất kết nối')),
    );
    await expect(t.service.list(SYSTEM, BASE)).rejects.toThrow('mất kết nối');
    expect(t.calls).toContain('rollback');
    expect(t.calls.at(-1)).toBe('release');
    expect(t.calls).not.toContain('commit');
  });
});

describe('KDD-02 total và demTheoTrangThai suy từ MỘT câu đếm', () => {
  it('trangThai vắng ⇒ total = cộng cả hai; HienThi ⇒ số hiển thị; DaAn ⇒ số đã ẩn; demTheoTrangThai KHÔNG đổi theo trangThai', async () => {
    const results = await Promise.all(
      [undefined, 'HienThi', 'DaAn'].map(async (trangThai) =>
        setup(counts(3, 2)).service.list(SYSTEM, {
          ...BASE,
          trangThai: trangThai as 'HienThi' | 'DaAn' | undefined,
        }),
      ),
    );
    expect(results.map((page) => page.total)).toEqual([5, 3, 2]);
    for (const page of results)
      expect(page.demTheoTrangThai).toEqual({ HienThi: 3, DaAn: 2 });
  });

  it('chỉ MỘT câu đếm mỗi lần gọi (không COUNT thứ hai), và repository nhận trangThai ở câu trang, KHÔNG ở câu đếm', async () => {
    const t = setup();
    await t.service.list(SYSTEM, { ...BASE, trangThai: 'DaAn' });
    expect(t.repository.countByStatus).toHaveBeenCalledTimes(1);
    expect(t.repository.countByStatus.mock.calls[0]).toHaveLength(2); // (manager, filter): không trạng thái
    expect(t.repository.findPage.mock.calls[0]?.[2]).toBe('DaAn');
  });

  it('thiếu hàng của một trạng thái ⇒ trạng thái đó là 0 (không lỗi)', async () => {
    const t = setup([{ biAn: 0, soLuong: '4' }]);
    const page = await t.service.list(SYSTEM, BASE);
    expect(page.demTheoTrangThai).toEqual({ HienThi: 4, DaAn: 0 });
    expect(page.total).toBe(4);
  });
});

describe('KDD-17, KDD-22 offset ≥ total ⇒ KHÔNG gửi câu trang', () => {
  it.each([
    ['không có dòng nào (total 0)', counts(0, 0), 0, false],
    ['offset đúng bằng total', counts(20, 0), 20, false],
    ['offset vượt total', counts(5, 0), 100, false],
    ['offset ngay trước total', counts(20, 0), 19, true],
    ['offset 0 và có dòng', counts(1, 0), 0, true],
  ])('%s', async (_ten, rows, offset, expected) => {
    const t = setup(rows);
    const page = await t.service.list(SYSTEM, { ...BASE, offset });
    expect(t.repository.findPage.mock.calls.length > 0).toBe(expected);
    if (!expected) expect(page.items).toEqual([]);
  });

  it('trang vượt cuối vẫn trả total và demTheoTrangThai đúng; offset khổng lồ không bị gửi đi', async () => {
    const t = setup(counts(5, 1));
    const page = await t.service.list(SYSTEM, {
      ...BASE,
      page: 1e300,
      offset: 1e300,
    });
    expect(page).toMatchObject({
      items: [],
      total: 6,
      demTheoTrangThai: { HienThi: 5, DaAn: 1 },
    });
    expect(t.repository.findPage).not.toHaveBeenCalled();
  });
});

describe('KDD-01, QHK-07, QHK-11 phạm vi chi nhánh: ép ở CẢ HAI câu', () => {
  it('Admin Chi nhánh bị ÉP chi nhánh của mình ở cả câu đếm lẫn câu trang, dù query gửi chi nhánh khác', async () => {
    const t = setup();
    await t.service.list(BRANCH_7, { ...BASE, chiNhanhId: '9' });
    expect(t.repository.countByStatus.mock.calls[0]?.[1]).toMatchObject({
      chiNhanhId: '7',
    });
    expect(t.repository.findPage.mock.calls[0]?.[1]).toMatchObject({
      chiNhanhId: '7',
    });
  });

  it('Admin Chi nhánh không gửi chiNhanhId: vẫn bị ép chi nhánh của mình', async () => {
    const t = setup();
    await t.service.list(BRANCH_7, BASE);
    expect(t.repository.countByStatus.mock.calls[0]?.[1]).toMatchObject({
      chiNhanhId: '7',
    });
  });

  it('Toàn hệ thống: dùng chiNhanhId của query; không gửi ⇒ không lọc chi nhánh', async () => {
    const withBranch = setup();
    await withBranch.service.list(SYSTEM, { ...BASE, chiNhanhId: '9' });
    expect(
      withBranch.repository.countByStatus.mock.calls[0]?.[1],
    ).toMatchObject({ chiNhanhId: '9' });
    const without = setup();
    await without.service.list(SYSTEM, BASE);
    // `toEqual` coi khoá `undefined` như vắng: không một bộ lọc nào (chi nhánh, bác sĩ, số sao, q)
    expect(without.repository.countByStatus.mock.calls[0]?.[1]).toEqual({});
  });

  it('MỘT bộ lọc dùng chung: câu đếm và câu trang nhận CÙNG đối tượng, mang đủ bacSiId, soSao, q', async () => {
    const t = setup();
    await t.service.list(SYSTEM, {
      ...BASE,
      bacSiId: '31',
      soSao: 2,
      q: 'khám',
    });
    const forCount = t.repository.countByStatus.mock.calls[0]?.[1];
    expect(t.repository.findPage.mock.calls[0]?.[1]).toBe(forCount);
    expect(forCount).toEqual({
      chiNhanhId: undefined,
      bacSiId: '31',
      soSao: 2,
      q: 'khám',
    });
  });

  it('KDD-02: câu trang nhận trangThai, pageSize và offset đúng thứ tự', async () => {
    const t = setup();
    await t.service.list(SYSTEM, {
      ...BASE,
      trangThai: 'HienThi',
      page: 2,
      pageSize: 2,
      offset: 2,
    });
    const args = t.repository.findPage.mock.calls[0] ?? [];
    expect(args.slice(2)).toEqual(['HienThi', 2, 2]);
  });
});

describe('KDD-18 hình dạng trả về', () => {
  it('items là kết quả của mapper (nhận xét bị cắt 200), page và pageSize lặp lại đúng giá trị của query', async () => {
    const t = setup();
    const page = await t.service.list(SYSTEM, {
      ...BASE,
      page: 1,
      pageSize: 20,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.nhanXet).toBe('x'.repeat(200));
    expect(page).toMatchObject({ page: 1, pageSize: 20 });
    expect(Object.keys(page).sort()).toEqual(
      ['demTheoTrangThai', 'items', 'page', 'pageSize', 'total'].sort(),
    );
  });
});

describe('KDD-03, QHK-06 chi tiết', () => {
  it('trong phạm vi ⇒ chi tiết đầy đủ (nhận xét KHÔNG bị cắt), một câu trong giao dịch READ ONLY', async () => {
    const t = setup();
    const detail = await t.service.get(SYSTEM, '501');
    expect(detail.nhanXet).toBe('x'.repeat(300));
    expect(detail.maLichHen).toBe('CLX-20261110-7K3QD');
    expect(t.calls).toEqual([
      'query SET TRANSACTION READ ONLY',
      'start REPEATABLE READ',
      'findOne',
      'commit',
      'release',
    ]);
    expect(t.repository.findOne.mock.calls[0]?.slice(1)).toEqual(['501']);
  });

  it('không có dòng ⇒ 404 KHONG_TIM_THAY', async () => {
    const t = setup();
    t.repository.findOne.mockImplementationOnce(() => Promise.resolve(null));
    const error = await failureOf(t.service.get(SYSTEM, '999'));
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ maLoi: 'KHONG_TIM_THAY' }),
    );
  });

  it('Admin Chi nhánh 7 xem đánh giá của chi nhánh 8 ⇒ 404 CÙNG thân với "không có"; chi nhánh mình thì xem được', async () => {
    const missing = setup();
    missing.repository.findOne.mockImplementationOnce(() =>
      Promise.resolve(null),
    );
    const notFound = await failureOf(missing.service.get(BRANCH_7, '999'));
    const other = setup(counts(1, 0), { ...DETAIL_ROW, chiNhanhId: '8' });
    const outOfScope = await failureOf(other.service.get(BRANCH_7, '501'));
    expect(outOfScope.getStatus()).toBe(404);
    expect(outOfScope.getResponse()).toEqual(notFound.getResponse());
    const own = setup(counts(1, 0), { ...DETAIL_ROW, chiNhanhId: '7' });
    expect((await own.service.get(BRANCH_7, '501')).danhGiaId).toBe('501');
  });

  it('Toàn hệ thống xem được đánh giá của mọi chi nhánh', async () => {
    const t = setup(counts(1, 0), { ...DETAIL_ROW, chiNhanhId: '8' });
    expect((await t.service.get(SYSTEM, '501')).chiNhanh.chiNhanhId).toBe('8');
  });

  it('chi nhánh của dòng đọc ra là số (driver): vẫn so đúng với chi nhánh của Admin dạng chuỗi', async () => {
    const t = setup(counts(1, 0), {
      ...DETAIL_ROW,
      chiNhanhId: 7 as unknown as string,
    });
    expect((await t.service.get(BRANCH_7, '501')).danhGiaId).toBe('501');
  });
});
