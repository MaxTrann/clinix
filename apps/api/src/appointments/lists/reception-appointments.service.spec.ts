import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { TRANG_THAI_LICH_HEN } from '../../admin/entities/enums.js';
import type { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import type { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import type { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import type { PaymentSummaryPort } from '../ports/payment.port.js';
import type { OperationsAppointmentDetailRow } from './operations-appointments.repository.js';
import type { OperationsAppointmentsService } from './operations-appointments.service.js';
import { ReceptionAppointmentsService } from './reception-appointments.service.js';

// Task B3 — ReceptionAppointmentsService với phụ thuộc GIẢ và `runReadOnly` giả (không DB): giải phạm vi trước mọi thứ (QB-04, QB-10), 404 cùng một nhánh (DSV-09), `conPhaiThu` chỉ ở
// `DaXacNhan` (DSV-10), `chuyenDuoc[]` khớp ma trận theo cửa sổ tiếp đón (CT-11, gồm ca thiếu cấu hình). Chạy thật trên MySQL: reception-appointments.int-spec.ts. DSV-nn, CT-nn là PLAN 7.5, 7.7.
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
const SCOPE: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '5' };
const CODE = 'CLX-20261110-ABCDE';
// Lịch hẹn lúc 09:00 giờ VN ngày 10/11/2026; cửa sổ tiếp đón từ 08:30 đến 09:15 (30 phút trước, 15 phút sau)
const APPOINTMENT_AT = new Date('2026-11-10T02:00:00.000Z');
const MIN = 60_000;

let scopes: { resolve: ReturnType<typeof vi.fn> };
let operations: {
  list: ReturnType<typeof vi.fn>;
  findDetail: ReturnType<typeof vi.fn>;
};
let payments: { remainingToCollect: ReturnType<typeof vi.fn> };
let configs: { get: ReturnType<typeof vi.fn> };
let service: ReceptionAppointmentsService;

function detailRow(
  overrides: Partial<OperationsAppointmentDetailRow> = {},
): OperationsAppointmentDetailRow {
  return {
    maLichHen: CODE,
    trangThai: 'DaXacNhan',
    thoiGian: APPOINTMENT_AT,
    bacSi: 'Bác sĩ A',
    chuyenKhoa: 'Nội',
    chiNhanh: 'Chi nhánh 1',
    dichVu: 'Khám nội',
    laBanThan: 1,
    nguoiKham: 'Người Khám',
    giaSnapshot: '150000.00',
    tienCoc: '0.00',
    hanThanhToan: null,
    nguoiDatHoTen: 'Người Đặt',
    nguoiDatSoDienThoai: '0901234567',
    lichHenId: '4242',
    lyDoKham: null,
    lyDoHuy: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(runReadOnly).mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(APPOINTMENT_AT.getTime() - 60 * MIN));
  scopes = { resolve: vi.fn().mockResolvedValue(SCOPE) };
  operations = {
    list: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    findDetail: vi.fn().mockResolvedValue(detailRow()),
  };
  payments = { remainingToCollect: vi.fn().mockResolvedValue('0.00') };
  configs = {
    get: vi.fn().mockResolvedValue({
      checkInTruocPhut: 30,
      checkInSauPhut: 15,
    } as CauHinhHeThong),
  };
  service = new ReceptionAppointmentsService(
    DB,
    scopes as unknown as ReceptionScopeService,
    operations as unknown as OperationsAppointmentsService,
    payments as unknown as PaymentSummaryPort,
    configs as unknown as SystemConfigService,
  );
});

afterEach(() => {
  vi.useRealTimers();
});

const at = (offsetMinutes: number, extraSeconds = 0) =>
  vi.setSystemTime(
    new Date(
      APPOINTMENT_AT.getTime() + offsetMinutes * MIN + extraSeconds * 1000,
    ),
  );

describe('danh sách (DSV-01, QB-04, QB-10)', () => {
  it('DSV-01 giải phạm vi từ DB theo tài khoản, rồi dùng chung service truy vấn với phạm vi đó, sắp TĂNG dần (Lễ tân)', async () => {
    const query = { page: 1, pageSize: 20, offset: 0, chiNhanhId: '9' };
    await service.list('77', query);
    expect(scopes.resolve).toHaveBeenCalledWith('77');
    expect(operations.list).toHaveBeenCalledWith(SCOPE, query, 'ASC');
  });

  it('QB-10 tài khoản hết hiệu lực ⇒ lỗi của phạm vi lan ra nguyên vẹn và KHÔNG đọc lịch hẹn nào', async () => {
    const error = new AppException(403, 'KHONG_DU_QUYEN');
    scopes.resolve.mockRejectedValue(error);
    await expect(
      service.list('77', { page: 1, pageSize: 20, offset: 0 }),
    ).rejects.toBe(error);
    expect(operations.list).not.toHaveBeenCalled();
    await expect(service.detail('77', CODE)).rejects.toBe(error);
    expect(runReadOnly).not.toHaveBeenCalled();
    expect(operations.findDetail).not.toHaveBeenCalled();
  });

  // Chống lỗi lặng: `chiNhanhId = undefined` ở phần dùng chung là "không lọc chi nhánh" (Toàn hệ thống), nên phạm vi sai kiểu KHÔNG được lọt xuống kho
  it.each([
    ['ToanHeThong (mở toàn hệ thống)', { kind: 'ToanHeThong' }],
    ['ChiNhanh thiếu chiNhanhId', { kind: 'ChiNhanh' }],
    ['ChiNhanh có chiNhanhId là số', { kind: 'ChiNhanh', chiNhanhId: 5 }],
    ['kiểu lạ', { kind: 'LeTan', chiNhanhId: '5' }],
  ])(
    'QB-04 phạm vi sai kiểu: %s ⇒ 403 KHONG_DU_QUYEN ở cả hai route, KHÔNG gọi kho, cổng hay cấu hình',
    async (_name, scope) => {
      scopes.resolve.mockResolvedValue(scope);
      for (const call of [
        () => service.list('77', { page: 1, pageSize: 20, offset: 0 }),
        () => service.detail('77', CODE),
      ]) {
        const error = await call().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).getStatus()).toBe(403);
        expect((error as AppException).getResponse()).toMatchObject({
          maLoi: 'KHONG_DU_QUYEN',
        });
      }
      expect(operations.list).not.toHaveBeenCalled();
      expect(operations.findDetail).not.toHaveBeenCalled();
      expect(runReadOnly).not.toHaveBeenCalled();
      expect(payments.remainingToCollect).not.toHaveBeenCalled();
      expect(configs.get).not.toHaveBeenCalled();
    },
  );
});

describe('chi tiết: 404 và phạm vi (DSV-09, QB-04)', () => {
  it('DSV-09 không có hàng (ngoài chi nhánh hoặc không tồn tại) ⇒ 404 KHONG_TIM_THAY; không đọc cổng thanh toán, không đọc cấu hình', async () => {
    operations.findDetail.mockResolvedValue(null);
    const error = await service.detail('77', CODE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect((error as AppException).getResponse()).toMatchObject({
      maLoi: 'KHONG_TIM_THAY',
    });
    expect(payments.remainingToCollect).not.toHaveBeenCalled();
    expect(configs.get).not.toHaveBeenCalled();
  });

  it('QB-04 tìm trong ĐÚNG phạm vi đã giải và trong `manager` của một lần `runReadOnly`', async () => {
    await service.detail('77', CODE);
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(operations.findDetail).toHaveBeenCalledWith(
      hoisted.manager,
      SCOPE,
      CODE,
    );
  });
});

describe('chi tiết: hình dạng và conPhaiThu (DSV-10, DSV-13)', () => {
  it('DSV-13 đúng 16 khoá; `lichHenId` (dùng gọi cổng) không lọt ra JSON', async () => {
    const detail = await service.detail('77', CODE);
    expect(Object.keys(detail)).toHaveLength(16);
    expect(Object.keys(detail).slice(-2)).toStrictEqual([
      'chuyenDuoc',
      'conPhaiThu',
    ]);
    expect(JSON.stringify(detail)).not.toContain('4242');
  });

  it('DSV-10 `DaXacNhan`: `conPhaiThu` lấy từ cổng, truyền ĐÚNG `manager` của giao dịch và `lichHenId`', async () => {
    payments.remainingToCollect.mockResolvedValue('150000.00');
    const detail = await service.detail('77', CODE);
    expect(detail.conPhaiThu).toBe('150000.00');
    expect(payments.remainingToCollect).toHaveBeenCalledWith(
      hoisted.manager,
      '4242',
    );
  });

  it.each(TRANG_THAI_LICH_HEN.filter((state) => state !== 'DaXacNhan'))(
    'DSV-10 trạng thái %s: `conPhaiThu` là null và KHÔNG gọi cổng thanh toán',
    async (state) => {
      operations.findDetail.mockResolvedValue(detailRow({ trangThai: state }));
      const detail = await service.detail('77', CODE);
      expect(detail.conPhaiThu).toBeNull();
      expect(payments.remainingToCollect).not.toHaveBeenCalled();
    },
  );
});

describe('chi tiết: chuyenDuoc[] theo ma trận (CT-11)', () => {
  const targets = async (
    state: TrangThaiLichHen = 'DaXacNhan',
    conPhaiThu = '0.00',
  ) => {
    operations.findDetail.mockResolvedValue(detailRow({ trangThai: state }));
    payments.remainingToCollect.mockResolvedValue(conPhaiThu);
    return (await service.detail('77', CODE)).chuyenDuoc;
  };

  it('CT-11 `DaXacNhan`, đã thu đủ: trước cửa sổ 1 giây chỉ `DaHuy`; đúng mốc đầu và đúng mốc cuối có thêm `DaTiepDon`', async () => {
    at(-30, -1);
    expect(await targets()).toStrictEqual(['DaHuy']);
    at(-30);
    expect(await targets()).toStrictEqual(['DaTiepDon', 'DaHuy']);
    at(0);
    expect(await targets()).toStrictEqual(['DaTiepDon', 'DaHuy']);
    at(15);
    expect(await targets()).toStrictEqual(['DaTiepDon', 'DaHuy']);
  });

  it('CT-11 sau cửa sổ 1 giây: hết `DaTiepDon`, được `VangMat` (Lễ tân chỉ đánh Vắng mặt SAU hết cửa sổ)', async () => {
    at(15, 1);
    expect(await targets()).toStrictEqual(['DaHuy', 'VangMat']);
  });

  it('CT-11, DSV-10 còn phải thu (> 0): trong cửa sổ KHÔNG có `DaTiepDon` (hệ quả của bản `Noop`: `conPhaiThu` = giá)', async () => {
    at(0);
    expect(await targets('DaXacNhan', '150000.00')).toStrictEqual(['DaHuy']);
    expect(await targets('DaXacNhan', '0.01')).toStrictEqual(['DaHuy']);
  });

  it('CT-11 (thiếu cấu hình) thiếu `cau_hinh_he_thong`: KHÔNG 409; bỏ `DaTiepDon` và `VangMat`, còn `DaHuy`', async () => {
    configs.get.mockResolvedValue(null);
    at(0);
    expect(await targets()).toStrictEqual(['DaHuy']);
    at(15, 1);
    expect(await targets()).toStrictEqual(['DaHuy']);
  });

  it.each([
    ['ChoThanhToan', ['DaHuy']],
    ['DaTiepDon', []],
    ['HoanThanh', []],
    ['DaHuy', []],
    ['DaDoiLich', []],
    ['VangMat', []],
  ] as const)(
    'CT-11 trạng thái %s: %j (ma trận của Lễ tân: `DaTiepDon` không huỷ được, Q21; không có `HoanThanh` cho Lễ tân)',
    async (state, expected) => {
      at(0);
      expect(await targets(state)).toStrictEqual([...expected]);
    },
  );

  it('CT-11 cấu hình đổi thì cửa sổ đổi theo: trước 10 phút, sau 0 phút', async () => {
    configs.get.mockResolvedValue({ checkInTruocPhut: 10, checkInSauPhut: 0 });
    at(-11);
    expect(await targets()).toStrictEqual(['DaHuy']);
    at(-10);
    expect(await targets()).toStrictEqual(['DaTiepDon', 'DaHuy']);
    at(0, 1);
    expect(await targets()).toStrictEqual(['DaHuy', 'VangMat']);
  });
});
