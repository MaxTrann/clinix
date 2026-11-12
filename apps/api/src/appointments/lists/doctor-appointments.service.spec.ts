import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import {
  DOCTOR_VISIBLE_STATES,
  type DoctorAppointmentsQuery,
} from './doctor-appointments.dto.js';
import type {
  DoctorAppointmentDetailRow,
  DoctorAppointmentFilter,
  DoctorAppointmentRow,
  DoctorAppointmentsRepository,
} from './doctor-appointments.repository.js';
import { DoctorAppointmentsService } from './doctor-appointments.service.js';

// Task B5 — DoctorAppointmentsService với kho GIẢ và `runReadOnly` giả (không DB): `bacSiId` từ token đi vào CẢ ba câu (DSB-01), tập trạng thái (DSB-10), cận ngày, `ca`, `sapXep`, ba câu CHUNG một
// `manager`, chỉ lấy trang khi offset < total, `demTheoTrangThai` bỏ `trangThai[]` (DSB-11), 404 cùng một chỗ (DSB-07). SQL thật: doctor-appointments.int-spec.ts. DSB-nn là PLAN 7.8, TRACKING 3.20.3.
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
const DOCTOR = '7';

let repo: {
  count: ReturnType<typeof vi.fn>;
  countByStatus: ReturnType<typeof vi.fn>;
  findPage: ReturnType<typeof vi.fn>;
  findDetail: ReturnType<typeof vi.fn>;
};
let service: DoctorAppointmentsService;

beforeEach(() => {
  vi.mocked(runReadOnly).mockClear();
  repo = {
    count: vi.fn().mockResolvedValue(0),
    countByStatus: vi.fn().mockResolvedValue([]),
    findPage: vi.fn().mockResolvedValue([]),
    findDetail: vi.fn().mockResolvedValue(null),
  };
  service = new DoctorAppointmentsService(
    DB,
    repo as unknown as DoctorAppointmentsRepository,
  );
});

const baseQuery: DoctorAppointmentsQuery = { page: 1, pageSize: 20, offset: 0 };

function row(
  overrides: Partial<DoctorAppointmentRow> = {},
): DoctorAppointmentRow {
  return {
    maLichHen: 'CLX-20261110-ABCDE',
    trangThai: 'DaXacNhan',
    thoiGian: new Date('2026-11-10T01:00:00.000Z'),
    ca: 'CaSang',
    nguoiKhamHoTen: 'Người Khám',
    quanHe: null,
    gioiTinh: 'Nam',
    ngaySinh: '1990-05-20',
    soDienThoai: '0901234567',
    dichVu: 'Khám nội',
    chuyenKhoa: 'Nội',
    lyDoKham: 'Đau đầu',
    ...overrides,
  };
}

const filterOf = (call: ReturnType<typeof vi.fn>) =>
  (call.mock.calls[0] as unknown[])[2] as DoctorAppointmentFilter;

describe('phạm vi bác sĩ (DSB-01)', () => {
  it('DSB-01 `bacSiId` của token đi vào SQL của CẢ ba câu (đếm, theo trạng thái, trang); một `bacSiId` lạ trong query KHÔNG tới được kho', async () => {
    repo.count.mockResolvedValue(1);
    await service.list(DOCTOR, {
      ...baseQuery,
      ...({ bacSiId: '999' } as object),
    });
    for (const call of [repo.count, repo.countByStatus, repo.findPage])
      expect(call.mock.calls[0]?.[1]).toBe(DOCTOR);
    expect(
      JSON.stringify([repo.count.mock.calls, repo.findPage.mock.calls]),
    ).not.toContain('999');
  });

  it('DSB-07 chi tiết: `bacSiId` của token và mã lịch đi nguyên vào kho, trong MỘT `runReadOnly` với DataSource của service', async () => {
    repo.findDetail.mockResolvedValue({
      ...row(),
      chiNhanh: 'CN 1',
      ngayDat: new Date('2026-11-01T00:00:00.000Z'),
    } satisfies DoctorAppointmentDetailRow);
    await service.detail(DOCTOR, 'CLX-20261110-ABCDE');
    expect(repo.findDetail).toHaveBeenCalledWith(
      hoisted.manager,
      DOCTOR,
      'CLX-20261110-ABCDE',
    );
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(runReadOnly).toHaveBeenCalledWith(DB, expect.any(Function));
  });
});

describe('tập trạng thái và bộ lọc (DSB-02, DSB-03, DSB-10, DSB-11)', () => {
  it('DSB-10 không `trangThai`: đúng sáu trạng thái hiển thị, KHÔNG có DaDoiLich', async () => {
    await service.list(DOCTOR, baseQuery);
    expect(filterOf(repo.count).states).toStrictEqual([
      ...DOCTOR_VISIBLE_STATES,
    ]);
    expect(filterOf(repo.count).states).not.toContain('DaDoiLich');
  });

  it('DSB-03, DSB-11 `trangThai[]` thu hẹp câu ĐẾM và câu TRANG nhưng KHÔNG câu theo trạng thái (số đếm áp mọi bộ lọc TRỪ `trangThai[]`)', async () => {
    repo.count.mockResolvedValue(2); // có hàng thì câu trang mới được gửi
    await service.list(DOCTOR, {
      ...baseQuery,
      trangThai: ['DaHuy', 'VangMat'],
    });
    expect(filterOf(repo.count).states).toStrictEqual(['DaHuy', 'VangMat']);
    expect(filterOf(repo.findPage).states).toStrictEqual(['DaHuy', 'VangMat']);
    expect(filterOf(repo.countByStatus).states).toStrictEqual([
      ...DOCTOR_VISIBLE_STATES,
    ]);
  });

  it('DSB-02, DSB-03 chuyển `ca`, `q` thành `keyword`; thiếu là `null`; cả ba câu cùng `ca`, ngày, từ khoá', async () => {
    await service.list(DOCTOR, baseQuery);
    expect(filterOf(repo.count)).toMatchObject({
      ca: null,
      from: null,
      to: null,
      keyword: null,
    });
    repo.count.mockClear();
    repo.countByStatus.mockClear();
    await service.list(DOCTOR, {
      ...baseQuery,
      ca: 'CaChieu',
      q: 'dang',
      tuNgay: '2026-11-30',
      denNgay: '2026-11-30',
    });
    for (const call of [repo.count, repo.countByStatus])
      expect(filterOf(call)).toMatchObject({
        ca: 'CaChieu',
        keyword: 'dang',
        from: '2026-11-30 00:00:00',
        to: '2026-12-01 00:00:00',
      });
  });

  it('DSB-02 `denNgay` = `9999-12-31` bỏ cận trên', async () => {
    await service.list(DOCTOR, { ...baseQuery, denNgay: '9999-12-31' });
    expect(filterOf(repo.count).to).toBeNull();
  });
});

describe('sắp xếp, phân trang, hình dạng (DSB-04, DSB-05, DSB-11)', () => {
  it.each([
    ['mặc định', undefined, 'DESC'],
    ['MoiNhat', 'MoiNhat', 'DESC'],
    ['CuNhat', 'CuNhat', 'ASC'],
  ] as const)(
    'DSB-04 `sapXep` %s ⇒ chiều %s tới câu trang cùng `limit` và `offset`',
    async (_name, sapXep, order) => {
      repo.count.mockResolvedValue(100);
      await service.list(DOCTOR, { page: 3, pageSize: 25, offset: 50, sapXep });
      expect(repo.findPage).toHaveBeenLastCalledWith(
        hoisted.manager,
        DOCTOR,
        expect.anything(),
        order,
        25,
        50,
      );
    },
  );

  it('DSB-11 ba câu CHUNG một `runReadOnly` và một `manager` (cùng ảnh chụp)', async () => {
    repo.count.mockResolvedValue(1);
    await service.list(DOCTOR, baseQuery);
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(runReadOnly).toHaveBeenCalledWith(DB, expect.any(Function));
    for (const call of [repo.count, repo.countByStatus, repo.findPage])
      expect(call.mock.calls[0]?.[0]).toBe(hoisted.manager);
  });

  it.each([
    ['không lịch nào (total 0)', 0, 0],
    ['trang vượt cuối', 20, 20],
    ['page cực lớn: offset vượt số nguyên an toàn', 5, 9007199254740991 * 100],
  ])(
    'DSB-05 %s: KHÔNG gửi câu trang, `items` rỗng, `total` đúng, số đếm vẫn đủ sáu khoá',
    async (_name, total, offset) => {
      repo.count.mockResolvedValue(total);
      const page = await service.list(DOCTOR, {
        page: 2,
        pageSize: 20,
        offset,
      });
      expect(repo.findPage).not.toHaveBeenCalled();
      expect(page).toMatchObject({ items: [], total, page: 2, pageSize: 20 });
      expect(Object.keys(page.demTheoTrangThai).sort()).toStrictEqual(
        [...DOCTOR_VISIBLE_STATES].sort(),
      );
    },
  );

  it('DSB-11 kết quả đúng NĂM khoá; `demTheoTrangThai` đủ sáu khoá (0 cho trạng thái không có dòng), không `DaDoiLich`', async () => {
    repo.count.mockResolvedValue(3);
    repo.countByStatus.mockResolvedValue([
      { trangThai: 'DaXacNhan', soLuong: 2 },
      { trangThai: 'HoanThanh', soLuong: 1 },
    ]);
    const page = await service.list(DOCTOR, baseQuery);
    expect(Object.keys(page).sort()).toStrictEqual([
      'demTheoTrangThai',
      'items',
      'page',
      'pageSize',
      'total',
    ]);
    expect(page.demTheoTrangThai).toStrictEqual({
      ChoThanhToan: 0,
      DaXacNhan: 2,
      DaTiepDon: 0,
      HoanThanh: 1,
      DaHuy: 0,
      VangMat: 0,
    });
  });

  it('DSB-06 `items` qua mapper của Bác sĩ: tám khoá, hàng thô thừa (`lichHenId`, giá) không lọt', async () => {
    repo.count.mockResolvedValue(1);
    repo.findPage.mockResolvedValue([
      row({
        ...({ lichHenId: '4242', giaSnapshot: '150000.00' } as object),
      }),
    ]);
    const page = await service.list(DOCTOR, baseQuery);
    expect(Object.keys(page.items[0] ?? {})).toHaveLength(8);
    expect(JSON.stringify(page)).not.toMatch(/4242|150000/);
  });
});

describe('chi tiết: 404 cùng một chỗ (DSB-07)', () => {
  it('DSB-07 kho trả `null` (của bác sĩ khác, không tồn tại, DaDoiLich) ⇒ MỘT 404 `KHONG_TIM_THAY`, ném sau khi giao dịch đã đóng', async () => {
    const failure = await service
      .detail(DOCTOR, 'CLX-20261110-ABCDE')
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AppException);
    expect((failure as AppException).getStatus()).toBe(404);
    expect((failure as AppException).getResponse()).toMatchObject({
      maLoi: 'KHONG_TIM_THAY',
    });
  });

  it('DSB-06, DSB-08 có hàng ⇒ chi tiết mười một khoá, `ghiChuKham` là `null`', async () => {
    repo.findDetail.mockResolvedValue({
      ...row(),
      chiNhanh: 'CN 1',
      ngayDat: new Date('2026-11-01T00:00:00.000Z'),
    });
    const detail = await service.detail(DOCTOR, 'CLX-20261110-ABCDE');
    expect(Object.keys(detail)).toHaveLength(11);
    expect(detail.ghiChuKham).toBeNull();
  });
});
