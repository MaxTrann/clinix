import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { PATIENT_VISIBLE_STATES } from './patient-appointments.dto.js';
import type {
  PatientAppointmentRow,
  PatientAppointmentsRepository,
} from './patient-appointments.repository.js';
import { PatientAppointmentsService } from './patient-appointments.service.js';

// Task B1 — PatientAppointmentsService với kho GIẢ và `runReadOnly` giả (không DB): tập trạng thái của từng câu, chiều sắp xếp, cận ngày, ba câu CHUNG một `manager`,
// chỉ lấy trang khi offset < total, ánh xạ khoá, `choPhepHuy` từ ma trận. SQL thật: patient-appointments.int-spec.ts. Mã LSH-nn là [đề xuất] (TRACKING 3.13.4).
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
const PATIENT = '77';

let repo: {
  count: ReturnType<typeof vi.fn>;
  countByStatus: ReturnType<typeof vi.fn>;
  findPage: ReturnType<typeof vi.fn>;
};
let service: PatientAppointmentsService;

beforeEach(() => {
  vi.mocked(runReadOnly).mockClear();
  repo = {
    count: vi.fn().mockResolvedValue(0),
    countByStatus: vi.fn().mockResolvedValue([]),
    findPage: vi.fn().mockResolvedValue([]),
  };
  service = new PatientAppointmentsService(
    DB,
    repo as unknown as PatientAppointmentsRepository,
  );
});

const baseQuery = { page: 1, pageSize: 20, offset: 0 };

function row(
  overrides: Partial<PatientAppointmentRow> = {},
): PatientAppointmentRow {
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
    ...overrides,
  };
}

const statesOf = (call: ReturnType<typeof vi.fn>) =>
  (call.mock.calls[0] as unknown[])[2] as { states: TrangThaiLichHen[] };

describe('tập trạng thái của từng câu (LSH-02, LSH-05, LSH-06, LSH-17)', () => {
  it('LSH-06 không nhom, không trangThai: cả ba câu dùng sáu trạng thái hiển thị, KHÔNG có DaDoiLich', async () => {
    await service.list(PATIENT, baseQuery);
    const expected = [...PATIENT_VISIBLE_STATES];
    expect(statesOf(repo.count).states).toStrictEqual(expected);
    expect(statesOf(repo.countByStatus).states).toStrictEqual(expected);
    expect(expected).not.toContain('DaDoiLich');
  });

  it('LSH-05 demTheoTrangThai KHÔNG áp trangThai[]: câu đếm giữ đủ sáu trạng thái khi danh sách chỉ lấy hai', async () => {
    repo.count.mockResolvedValue(1);
    await service.list(PATIENT, {
      ...baseQuery,
      trangThai: ['DaHuy', 'VangMat'],
    });
    expect(statesOf(repo.count).states).toStrictEqual(['DaHuy', 'VangMat']);
    expect(statesOf(repo.findPage).states).toStrictEqual(['DaHuy', 'VangMat']);
    expect(statesOf(repo.countByStatus).states).toStrictEqual([
      ...PATIENT_VISIBLE_STATES,
    ]);
  });

  it('LSH-17 nhom áp cho CẢ danh sách lẫn số đếm; nhom cùng trangThai[] là GIAO của hai', async () => {
    repo.count.mockResolvedValue(1);
    await service.list(PATIENT, {
      ...baseQuery,
      nhom: 'LichSu',
      trangThai: ['DaHuy', 'DaXacNhan'],
    });
    expect(statesOf(repo.count).states).toStrictEqual(['DaHuy']);
    expect(statesOf(repo.findPage).states).toStrictEqual(['DaHuy']);
    expect([...statesOf(repo.countByStatus).states].sort()).toStrictEqual([
      'DaHuy',
      'HoanThanh',
      'VangMat',
    ]);
  });

  it('LSH-17 ca biên: nhom SapToi cùng trangThai HoanThanh ⇒ giao rỗng (danh sách rỗng), số đếm vẫn ba trạng thái của nhóm', async () => {
    await service.list(PATIENT, {
      ...baseQuery,
      nhom: 'SapToi',
      trangThai: ['HoanThanh'],
    });
    expect(statesOf(repo.count).states).toStrictEqual([]);
    expect(statesOf(repo.countByStatus).states).toStrictEqual([
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
    ]);
  });
});

describe('sắp xếp, cận ngày, bộ lọc (LSH-02, LSH-12, LSH-04, LSH-08)', () => {
  const orderOf = async (nhom?: 'SapToi' | 'LichSu') => {
    repo.count.mockResolvedValue(1);
    repo.findPage.mockClear();
    await service.list(PATIENT, { ...baseQuery, nhom });
    return (repo.findPage.mock.calls[0] as unknown[])[3];
  };

  it('LSH-02 SapToi tăng dần; LichSu và không nhom giảm dần', async () => {
    expect(await orderOf('SapToi')).toBe('ASC');
    expect(await orderOf('LichSu')).toBe('DESC');
    expect(await orderOf(undefined)).toBe('DESC');
  });

  it('LSH-12 tuNgay và denNgay thành cận nửa mở dạng CHUỖI (không Date): từ 00:00:00 của tuNgay đến 00:00:00 của ngày sau denNgay', async () => {
    await service.list(PATIENT, {
      ...baseQuery,
      tuNgay: '2026-11-10',
      denNgay: '2026-11-12',
    });
    for (const call of [repo.count, repo.countByStatus])
      expect(call.mock.calls[0]?.[2]).toMatchObject({
        from: '2026-11-10 00:00:00',
        to: '2026-11-13 00:00:00',
      });
  });

  it('LSH-12 không có ngày thì không chặn; LSH-04 và LSH-08 bộ lọc đi nguyên giá trị chuỗi, thiếu thì null', async () => {
    await service.list(PATIENT, baseQuery);
    expect(repo.count.mock.calls[0]?.[2]).toStrictEqual({
      states: [...PATIENT_VISIBLE_STATES],
      hoSoNguoiThanId: null,
      bacSiId: null,
      chuyenKhoaId: null,
      from: null,
      to: null,
      keyword: null,
    });
    repo.count.mockClear();
    await service.list(PATIENT, {
      ...baseQuery,
      hoSoNguoiThanId: 'BanThan',
      bacSiId: '9223372036854775807',
      chuyenKhoaId: '5',
      q: 'dang',
    });
    expect(repo.count.mock.calls[0]?.[2]).toMatchObject({
      hoSoNguoiThanId: 'BanThan',
      bacSiId: '9223372036854775807',
      chuyenKhoaId: '5',
      keyword: 'dang',
    });
  });
});

describe('một giao dịch chỉ đọc, phạm vi và phân trang (LSH-01, LSH-07, LSH-18)', () => {
  it('LSH-07 ba câu chạy trong MỘT lần gọi runReadOnly và dùng CHUNG một manager', async () => {
    repo.count.mockResolvedValue(5);
    await service.list(PATIENT, baseQuery);
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runReadOnly).mock.calls[0]?.[0]).toBe(DB);
    for (const call of [repo.count, repo.countByStatus, repo.findPage])
      expect(call.mock.calls[0]?.[0], 'manager').toBe(hoisted.manager);
  });

  it('LSH-01 accountId của người gọi là đối số THỨ HAI của cả ba câu (phạm vi benh_nhan_id nằm trong SQL)', async () => {
    repo.count.mockResolvedValue(5);
    await service.list(PATIENT, baseQuery);
    for (const call of [repo.count, repo.countByStatus, repo.findPage])
      expect(call.mock.calls[0]?.[1]).toBe(PATIENT);
  });

  it('LSH-07 chỉ lấy trang khi offset < total, đúng limit và offset; trang vượt cuối và total 0 ⇒ items rỗng, total vẫn đúng', async () => {
    repo.count.mockResolvedValue(45);
    repo.findPage.mockResolvedValue([row()]);
    const page3 = await service.list(PATIENT, {
      page: 3,
      pageSize: 20,
      offset: 40,
    });
    expect(repo.findPage).toHaveBeenCalledTimes(1);
    expect(repo.findPage.mock.calls[0]?.slice(4)).toStrictEqual([20, 40]);
    expect(page3).toMatchObject({ total: 45, page: 3, pageSize: 20 });
    expect(page3.items).toHaveLength(1);

    repo.findPage.mockClear();
    const beyond = await service.list(PATIENT, {
      page: 4,
      pageSize: 20,
      offset: 60,
    });
    const exactEnd = await service.list(PATIENT, {
      page: 3,
      pageSize: 15,
      offset: 45,
    });
    expect(repo.findPage).not.toHaveBeenCalled();
    expect(beyond).toMatchObject({ items: [], total: 45, page: 4 });
    expect(exactEnd.items).toStrictEqual([]);

    repo.count.mockResolvedValue(0);
    expect((await service.list(PATIENT, baseQuery)).items).toStrictEqual([]);
    expect(repo.findPage).not.toHaveBeenCalled();
  });

  it('LSH-18 page cực lớn (offset vượt số nguyên an toàn) không bao giờ tới câu trang', async () => {
    repo.count.mockResolvedValue(45);
    const page = Number.MAX_SAFE_INTEGER;
    const result = await service.list(PATIENT, {
      page,
      pageSize: 100,
      offset: (page - 1) * 100,
    });
    expect(repo.findPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ items: [], total: 45, page });
  });

  it('ca âm: lỗi của kho ra nguyên, không bị nuốt thành kết quả rỗng', async () => {
    const failure = new Error('lỗi MySQL giả');
    repo.countByStatus.mockRejectedValue(failure);
    await expect(service.list(PATIENT, baseQuery)).rejects.toBe(failure);
  });
});

describe('hình dạng kết quả (LSH-05, LSH-13, LSH-19)', () => {
  it('LSH-05 demTheoTrangThai có ĐỦ sáu khoá, thiếu dòng là 0, không có khoá DaDoiLich', async () => {
    repo.countByStatus.mockResolvedValue([
      { trangThai: 'DaHuy', soLuong: 2 },
      { trangThai: 'DaXacNhan', soLuong: 5 },
    ]);
    const { demTheoTrangThai } = await service.list(PATIENT, baseQuery);
    expect(demTheoTrangThai).toStrictEqual({
      ChoThanhToan: 0,
      DaXacNhan: 5,
      DaTiepDon: 0,
      HoanThanh: 0,
      DaHuy: 2,
      VangMat: 0,
    });
    expect(Object.keys(demTheoTrangThai)).toHaveLength(6);
  });

  it('LSH-19 phản hồi đúng năm khoá; mỗi item đúng MƯỜI HAI khoá và không lộ cột thừa của hàng thô (lich_hen_id, benh_nhan_id, email, SĐT bác sĩ)', async () => {
    repo.count.mockResolvedValue(1);
    repo.findPage.mockResolvedValue([
      {
        ...row(),
        lichHenId: '9',
        benhNhanId: '1',
        email: 'bs@mail.invalid',
        soDienThoaiBacSi: '0900000000',
      } as PatientAppointmentRow,
    ]);
    const result = await service.list(PATIENT, baseQuery);
    expect(Object.keys(result).sort()).toStrictEqual([
      'demTheoTrangThai',
      'items',
      'page',
      'pageSize',
      'total',
    ]);
    const item = result.items[0];
    expect(Object.keys(item ?? {}).sort()).toStrictEqual([
      'bacSi',
      'chiNhanh',
      'choPhepHuy',
      'chuyenKhoa',
      'dichVu',
      'giaSnapshot',
      'hanThanhToan',
      'maLichHen',
      'nguoiKham',
      'thoiGian',
      'tienCoc',
      'trangThai',
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /lichHenId|benhNhanId|mail\.invalid|0900000000/,
    );
  });

  it('LSH-19 kiểu từng khoá: thoiGian và hanThanhToan là ISO UTC (null giữ null), tiền là chuỗi decimal, laBanThan nhận cả số lẫn chuỗi của driver', async () => {
    repo.count.mockResolvedValue(3);
    repo.findPage.mockResolvedValue([
      row({
        trangThai: 'ChoThanhToan',
        hanThanhToan: new Date('2026-11-10T00:15:00.000Z'),
        laBanThan: '1',
      }),
      row({ laBanThan: 0, nguoiKham: 'Con của tôi' }),
      row({ laBanThan: '0', nguoiKham: 'Mẹ' }),
    ]);
    const { items } = await service.list(PATIENT, baseQuery);
    expect(items[0]).toMatchObject({
      thoiGian: '2026-11-10T01:00:00.000Z',
      hanThanhToan: '2026-11-10T00:15:00.000Z',
      giaSnapshot: '150000.00',
      tienCoc: '50000.00',
      nguoiKham: { hoTen: 'Người Khám', laBanThan: true },
    });
    expect(items[1]).toMatchObject({
      hanThanhToan: null,
      nguoiKham: { hoTen: 'Con của tôi', laBanThan: false },
    });
    expect(items[2]?.nguoiKham.laBanThan).toBe(false);
  });

  it('LSH-13 choPhepHuy đúng ở ChoThanhToan và DaXacNhan, sai ở DaTiepDon, HoanThanh, DaHuy, VangMat (lấy từ ma trận, không viết cứng)', async () => {
    repo.count.mockResolvedValue(6);
    repo.findPage.mockResolvedValue(
      PATIENT_VISIBLE_STATES.map((trangThai) => row({ trangThai })),
    );
    const { items } = await service.list(PATIENT, {
      ...baseQuery,
      pageSize: 6,
    });
    expect(
      Object.fromEntries(items.map((i) => [i.trangThai, i.choPhepHuy])),
    ).toStrictEqual({
      ChoThanhToan: true,
      DaXacNhan: true,
      DaTiepDon: false,
      HoanThanh: false,
      DaHuy: false,
      VangMat: false,
    });
  });
});
