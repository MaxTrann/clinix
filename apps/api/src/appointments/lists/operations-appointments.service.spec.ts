import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  OPERATIONS_DEFAULT_STATES,
  type OperationsAppointmentsQuery,
} from './operations-appointments.dto.js';
import type {
  OperationsAppointmentFilter,
  OperationsAppointmentRow,
  OperationsAppointmentsRepository,
} from './operations-appointments.repository.js';
import { OperationsAppointmentsService } from './operations-appointments.service.js';

// Task B3 — OperationsAppointmentsService với kho GIẢ và `runReadOnly` giả (không DB): phạm vi chi nhánh theo `AdminScope` (DSV-01, DSV-16), tập trạng thái mặc định (DSV-12), cận ngày, chiều sắp xếp,
// hai câu CHUNG một `manager`, chỉ lấy trang khi offset < total, hình dạng không có `demTheoTrangThai`. SQL thật: operations-appointments.int-spec.ts. DSV-nn là PLAN 7.7; DSV-16 là [đề xuất].
const hoisted = vi.hoisted(() => ({
  manager: { id: 'manager-cua-mot-giao-dich' },
}));
vi.mock('../../common/transaction/read-only-tx.js', () => ({
  runReadOnly: vi.fn(
    (_db: unknown, work: (manager: unknown) => Promise<unknown>) =>
      work(hoisted.manager),
  ),
}));
import { runReadOnly } from '../../common/transaction/read-only-tx.js';

const DB = { id: 'datasource' } as unknown as DataSource;
const RECEPTION: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '5' };
const EVERYWHERE: AdminScope = { kind: 'ToanHeThong' };

let repo: {
  count: ReturnType<typeof vi.fn>;
  findPage: ReturnType<typeof vi.fn>;
  findDetail: ReturnType<typeof vi.fn>;
};
let service: OperationsAppointmentsService;

beforeEach(() => {
  vi.mocked(runReadOnly).mockClear();
  repo = {
    count: vi.fn().mockResolvedValue(0),
    findPage: vi.fn().mockResolvedValue([]),
    findDetail: vi.fn().mockResolvedValue(null),
  };
  service = new OperationsAppointmentsService(
    DB,
    repo as unknown as OperationsAppointmentsRepository,
    new BranchAccessPolicy(),
  );
});

const baseQuery: OperationsAppointmentsQuery = {
  page: 1,
  pageSize: 20,
  offset: 0,
};

function row(
  overrides: Partial<OperationsAppointmentRow> = {},
): OperationsAppointmentRow {
  return {
    maLichHen: 'CLX-20261110-ABCDE',
    trangThai: 'DaXacNhan',
    thoiGian: new Date('2026-11-10T01:00:00.000Z'),
    bacSi: 'Bác sĩ A',
    chuyenKhoa: 'Nội',
    chiNhanh: 'Chi nhánh 1',
    dichVu: 'Khám nội',
    laBanThan: 1,
    nguoiKham: 'Người Khám',
    giaSnapshot: '150000.00',
    tienCoc: '50000.00',
    hanThanhToan: null,
    nguoiDatHoTen: 'Người Đặt',
    nguoiDatSoDienThoai: '0901234567',
    ...overrides,
  };
}

const filterOf = (call: ReturnType<typeof vi.fn>) =>
  (call.mock.calls[0] as unknown[])[1] as OperationsAppointmentFilter;

describe('phạm vi chi nhánh theo AdminScope (DSV-01, DSV-16)', () => {
  it('DSV-01 phạm vi ChiNhanh (Lễ tân): SQL của cả câu đếm lẫn câu trang dùng chi nhánh của phạm vi, KHÔNG dùng `chiNhanhId` của query', async () => {
    repo.count.mockResolvedValue(1);
    await service.list(RECEPTION, { ...baseQuery, chiNhanhId: '9' }, 'ASC');
    expect(filterOf(repo.count).chiNhanhId).toBe('5');
    expect(filterOf(repo.findPage).chiNhanhId).toBe('5');
  });

  it('DSV-01 phạm vi ChiNhanh, query không có `chiNhanhId` ⇒ vẫn là chi nhánh của phạm vi', async () => {
    await service.list(RECEPTION, baseQuery, 'ASC');
    expect(filterOf(repo.count).chiNhanhId).toBe('5');
  });

  it('DSV-16 phạm vi ToanHeThong: dùng `chiNhanhId` làm bộ lọc, hoặc không lọc chi nhánh (`undefined`)', async () => {
    await service.list(EVERYWHERE, { ...baseQuery, chiNhanhId: '9' }, 'DESC');
    expect(filterOf(repo.count).chiNhanhId).toBe('9');
    repo.count.mockClear();
    await service.list(EVERYWHERE, baseQuery, 'DESC');
    expect(filterOf(repo.count).chiNhanhId).toBeUndefined();
  });

  it('DSV-09, DSV-16 chi tiết: phạm vi ChiNhanh ép chi nhánh của phạm vi; ToanHeThong không lọc; kết quả của kho trả nguyên và dùng ĐÚNG `manager` của người gọi', async () => {
    const detail = { maLichHen: 'CLX-20261110-ABCDE' };
    repo.findDetail.mockResolvedValue(detail);
    const manager = { id: 'manager-cua-nguoi-goi' };
    expect(
      await service.findDetail(
        manager as never,
        RECEPTION,
        'CLX-20261110-ABCDE',
      ),
    ).toBe(detail);
    expect(repo.findDetail).toHaveBeenLastCalledWith(
      manager,
      '5',
      'CLX-20261110-ABCDE',
    );
    await service.findDetail(
      manager as never,
      EVERYWHERE,
      'CLX-20261110-ABCDE',
    );
    expect(repo.findDetail).toHaveBeenLastCalledWith(
      manager,
      undefined,
      'CLX-20261110-ABCDE',
    );
  });
});

describe('tập trạng thái và bộ lọc (DSV-04, DSV-12, DSV-15)', () => {
  it('DSV-12 không `trangThai`: sáu trạng thái mặc định, KHÔNG có DaDoiLich; có `trangThai=DaDoiLich` thì đúng tập đó', async () => {
    await service.list(RECEPTION, baseQuery, 'ASC');
    expect(filterOf(repo.count).states).toStrictEqual([
      ...OPERATIONS_DEFAULT_STATES,
    ]);
    expect(filterOf(repo.count).states).not.toContain('DaDoiLich');
    repo.count.mockClear();
    await service.list(
      RECEPTION,
      { ...baseQuery, trangThai: ['DaDoiLich', 'DaHuy'] },
      'ASC',
    );
    expect(filterOf(repo.count).states).toStrictEqual(['DaDoiLich', 'DaHuy']);
  });

  it('DSV-04, DSV-15 chuyển từng bộ lọc, giá trị thiếu là `null`; `q` thành `keyword`', async () => {
    await service.list(RECEPTION, baseQuery, 'ASC');
    expect(filterOf(repo.count)).toMatchObject({
      bacSiId: null,
      chuyenKhoaId: null,
      dichVuKhamId: null,
      from: null,
      to: null,
      keyword: null,
    });
    repo.count.mockClear();
    await service.list(
      RECEPTION,
      {
        ...baseQuery,
        bacSiId: '1',
        chuyenKhoaId: '2',
        dichVuKhamId: '3',
        q: 'dang',
      },
      'ASC',
    );
    expect(filterOf(repo.count)).toMatchObject({
      bacSiId: '1',
      chuyenKhoaId: '2',
      dichVuKhamId: '3',
      keyword: 'dang',
    });
  });

  it('DSV-04 ngày: `tuNgay` ⇒ 00:00:00 cùng ngày, `denNgay` ⇒ 00:00:00 NGÀY KẾ (nửa mở, giờ VN, chuỗi); `9999-12-31` bỏ cận trên', async () => {
    await service.list(
      RECEPTION,
      { ...baseQuery, tuNgay: '2026-11-30', denNgay: '2026-11-30' },
      'ASC',
    );
    expect(filterOf(repo.count)).toMatchObject({
      from: '2026-11-30 00:00:00',
      to: '2026-12-01 00:00:00',
    });
    repo.count.mockClear();
    await service.list(
      RECEPTION,
      { ...baseQuery, denNgay: '9999-12-31' },
      'ASC',
    );
    expect(filterOf(repo.count).to).toBeNull();
  });
});

describe('sắp xếp, phân trang, hình dạng (DSV-05, DSV-06)', () => {
  it('DSV-06 chiều sắp xếp do service của vai trò truyền vào và đi nguyên tới câu trang cùng `limit` và `offset`', async () => {
    repo.count.mockResolvedValue(100);
    await service.list(RECEPTION, { page: 3, pageSize: 25, offset: 50 }, 'ASC');
    expect(repo.findPage).toHaveBeenLastCalledWith(
      hoisted.manager,
      expect.anything(),
      'ASC',
      25,
      50,
    );
    await service.list(EVERYWHERE, baseQuery, 'DESC');
    expect(repo.findPage.mock.calls.at(-1)?.[2]).toBe('DESC');
  });

  it('DSV-06 hai câu CHUNG một `runReadOnly` và một `manager` (cùng ảnh chụp)', async () => {
    repo.count.mockResolvedValue(1);
    await service.list(RECEPTION, baseQuery, 'ASC');
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(runReadOnly).toHaveBeenCalledWith(DB, expect.any(Function));
    expect(repo.count.mock.calls[0]?.[0]).toBe(hoisted.manager);
    expect(repo.findPage.mock.calls[0]?.[0]).toBe(hoisted.manager);
  });

  it.each([
    ['không lịch nào (total 0)', 0, 0],
    ['trang vượt cuối', 20, 20],
    ['page cực lớn: offset vượt số nguyên an toàn', 5, 9007199254740991 * 100],
  ])(
    'DSV-05, DSV-06 %s: KHÔNG gửi câu trang, `items` rỗng, `total` đúng',
    async (_name, total, offset) => {
      repo.count.mockResolvedValue(total);
      const page = await service.list(
        RECEPTION,
        { page: 2, pageSize: 20, offset },
        'ASC',
      );
      expect(repo.findPage).not.toHaveBeenCalled();
      expect(page).toStrictEqual({ items: [], total, page: 2, pageSize: 20 });
    },
  );

  it('DSV-13 kết quả đúng BỐN khoá (không `demTheoTrangThai`), `items` qua mapper của nhân sự: mười một khoá, `lichHenId` không lọt', async () => {
    repo.count.mockResolvedValue(1);
    repo.findPage.mockResolvedValue([
      row({ ...({ lichHenId: '42' } as object) }),
    ]);
    const page = await service.list(RECEPTION, baseQuery, 'ASC');
    expect(Object.keys(page).sort()).toStrictEqual([
      'items',
      'page',
      'pageSize',
      'total',
    ]);
    expect(Object.keys(page.items[0] ?? {})).toHaveLength(11);
    expect(page.items[0]?.nguoiDat).toStrictEqual({
      hoTen: 'Người Đặt',
      soDienThoai: '0901234567',
    });
    expect(JSON.stringify(page)).not.toContain('42');
  });
});
