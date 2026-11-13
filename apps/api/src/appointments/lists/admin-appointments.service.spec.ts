import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { TRANG_THAI_LICH_HEN } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import type { PaymentSummaryPort } from '../ports/payment.port.js';
import type { StatusHistoryEntry } from './admin-appointments.dto.js';
import { AdminAppointmentsService } from './admin-appointments.service.js';
import type { AppointmentHistoryReader } from './appointment-history.reader.js';
import type { OperationsAppointmentDetailRow } from './operations-appointments.repository.js';
import type { OperationsAppointmentsService } from './operations-appointments.service.js';

// Task B4 — AdminAppointmentsService với phụ thuộc GIẢ và `runReadOnly` giả (không DB): thứ tự giảm dần (ADL-01), phạm vi đi nguyên vào dịch vụ dùng chung (DSV-02, DSV-03), kiểm hình dạng phạm vi
// lúc chạy (ADL-08), 404 cùng một nhánh (DSV-09, QB-05), `chuyenDuoc[]` theo ma trận Q24 (ADL-03), `conPhaiThu` chỉ ở `DaXacNhan` (ADL-04), hình dạng 17 khoá (ADL-02). Chạy thật trên MySQL:
// admin-appointments.int-spec.ts. Mã ADL-nn là PLAN 7.39 `[đề xuất]`; DSV-nn, QB-nn là PLAN 7.7, 7.9.
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
const BRANCH_SCOPE: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '5' };
const ALL_SCOPE: AdminScope = { kind: 'ToanHeThong' };
const CODE = 'CLX-20261110-ABCDE';
const QUERY = { page: 1, pageSize: 20, offset: 0, chiNhanhId: '9' };
const HISTORY: StatusHistoryEntry[] = [
  { thoiDiem: '2026-11-01T01:00:00.000Z', loai: 'TaoLich' },
];

let operations: {
  list: ReturnType<typeof vi.fn>;
  findDetail: ReturnType<typeof vi.fn>;
};
let payments: { remainingToCollect: ReturnType<typeof vi.fn> };
let history: { read: ReturnType<typeof vi.fn> };
let service: AdminAppointmentsService;

function detailRow(
  overrides: Partial<OperationsAppointmentDetailRow> = {},
): OperationsAppointmentDetailRow {
  return {
    maLichHen: CODE,
    trangThai: 'DaXacNhan',
    thoiGian: new Date('2026-11-10T02:00:00.000Z'),
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
    lyDoKham: 'Đau đầu',
    lyDoHuy: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(runReadOnly).mockClear();
  operations = {
    list: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    findDetail: vi.fn().mockResolvedValue(detailRow()),
  };
  payments = { remainingToCollect: vi.fn().mockResolvedValue('150000.00') };
  history = { read: vi.fn().mockResolvedValue(HISTORY) };
  service = new AdminAppointmentsService(
    DB,
    operations as unknown as OperationsAppointmentsService,
    payments as unknown as PaymentSummaryPort,
    history as unknown as AppointmentHistoryReader,
  );
});

describe('danh sách (ADL-01, DSV-02, DSV-03)', () => {
  it.each([
    ['Chi nhánh', BRANCH_SCOPE],
    ['Toàn hệ thống', ALL_SCOPE],
  ])(
    'ADL-01 phạm vi %s: dùng chung dịch vụ truy vấn và sắp GIẢM dần (khác Lễ tân: tăng); kết quả trả nguyên',
    async (_name, scope) => {
      const page = { items: [], total: 0, page: 1, pageSize: 20 };
      operations.list.mockResolvedValue(page);
      const result = await service.list(scope, QUERY);
      expect(operations.list).toHaveBeenCalledTimes(1);
      expect(operations.list).toHaveBeenCalledWith(scope, QUERY, 'DESC');
      expect(result).toBe(page);
    },
  );

  it('DSV-02 phạm vi Chi nhánh đi NGUYÊN vào dịch vụ dùng chung, `chiNhanhId` của query không thay chi nhánh của phạm vi (việc bỏ qua do `branchFilter`)', async () => {
    await service.list(BRANCH_SCOPE, { ...QUERY, chiNhanhId: '9' });
    const [scope, query] = operations.list.mock.calls[0] as [
      AdminScope,
      typeof QUERY,
    ];
    expect(scope).toStrictEqual({ kind: 'ChiNhanh', chiNhanhId: '5' });
    expect(query.chiNhanhId).toBe('9');
  });

  it('DSV-03 phạm vi Toàn hệ thống đi nguyên (không biến thành phạm vi chi nhánh); có và không `chiNhanhId`', async () => {
    await service.list(ALL_SCOPE, QUERY);
    await service.list(ALL_SCOPE, { page: 1, pageSize: 20, offset: 0 });
    expect(operations.list.mock.calls.map((call) => call[0])).toStrictEqual([
      { kind: 'ToanHeThong' },
      { kind: 'ToanHeThong' },
    ]);
  });
});

describe('ADL-08 kiểm hình dạng phạm vi lúc chạy', () => {
  it.each([
    ['kind lạ', { kind: 'Khac' }],
    ['ChiNhanh thiếu chiNhanhId', { kind: 'ChiNhanh' }],
    ['ChiNhanh có chiNhanhId là số', { kind: 'ChiNhanh', chiNhanhId: 5 }],
    ['đối tượng rỗng', {}],
    ['không có kind', { chiNhanhId: '5' }],
  ])(
    'ADL-08 phạm vi sai kiểu: %s ⇒ 403 KHONG_DU_QUYEN ở cả hai route, KHÔNG gọi kho, cổng hay nhật ký',
    async (_name, scope) => {
      for (const call of [
        () => service.list(scope as AdminScope, QUERY),
        () => service.detail(scope as AdminScope, CODE),
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
      expect(payments.remainingToCollect).not.toHaveBeenCalled();
      expect(history.read).not.toHaveBeenCalled();
      expect(runReadOnly).not.toHaveBeenCalled();
    },
  );
});

describe('chi tiết: 404 và phạm vi (DSV-09, QB-05)', () => {
  it.each([
    ['Chi nhánh', BRANCH_SCOPE],
    ['Toàn hệ thống', ALL_SCOPE],
  ])(
    'DSV-09 phạm vi %s: không có hàng (ngoài phạm vi hoặc không tồn tại) ⇒ 404 KHONG_TIM_THAY, thân KHÔNG chứa mã lịch; không đọc cổng thanh toán, không đọc nhật ký',
    async (_name, scope) => {
      operations.findDetail.mockResolvedValue(null);
      const error = await service.detail(scope, CODE).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(404);
      const body = (error as AppException).getResponse();
      expect(body).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
      expect(JSON.stringify(body)).not.toContain(CODE);
      expect(payments.remainingToCollect).not.toHaveBeenCalled();
      expect(history.read).not.toHaveBeenCalled();
    },
  );

  it('QB-05 phạm vi đi nguyên vào `findDetail` (điều kiện chi nhánh nằm trong SQL), cùng manager của MỘT lần runReadOnly', async () => {
    await service.detail(BRANCH_SCOPE, CODE);
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(operations.findDetail).toHaveBeenCalledWith(
      hoisted.manager,
      BRANCH_SCOPE,
      CODE,
    );
  });
});

describe('chi tiết: chuyenDuoc[] và conPhaiThu (ADL-03, ADL-04)', () => {
  // Ma trận Q24 (PLAN 5.2): nguồn ChoThanhToan chỉ tới DaHuy; DaXacNhan, DaTiepDon, VangMat tới hai trạng thái còn lại của nhóm và DaHuy; không từ HoanThanh, DaHuy, DaDoiLich
  const EXPECTED: Record<TrangThaiLichHen, TrangThaiLichHen[]> = {
    ChoThanhToan: ['DaHuy'],
    DaXacNhan: ['DaTiepDon', 'DaHuy', 'VangMat'],
    DaTiepDon: ['DaXacNhan', 'DaHuy', 'VangMat'],
    HoanThanh: [],
    DaHuy: [],
    DaDoiLich: [],
    VangMat: ['DaXacNhan', 'DaTiepDon', 'DaHuy'],
  };

  it.each(TRANG_THAI_LICH_HEN.map((state) => [state] as const))(
    'ADL-03 nguồn %s ⇒ chuyenDuoc đúng ma trận Q24 của Quản trị viên, theo thứ tự TRANG_THAI_LICH_HEN, không cần cấu hình hay cổng',
    async (state) => {
      operations.findDetail.mockResolvedValue(detailRow({ trangThai: state }));
      const detail = await service.detail(ALL_SCOPE, CODE);
      expect(detail.chuyenDuoc).toStrictEqual(EXPECTED[state]);
    },
  );

  it('ADL-03 mỗi đích đứng đúng thứ tự TRANG_THAI_LICH_HEN (không sắp theo bảng chữ cái)', () => {
    for (const targets of Object.values(EXPECTED)) {
      const indexes = targets.map((t) => TRANG_THAI_LICH_HEN.indexOf(t));
      expect(indexes).toStrictEqual([...indexes].sort((a, b) => a - b));
    }
  });

  it.each(TRANG_THAI_LICH_HEN.map((state) => [state] as const))(
    'ADL-04 nguồn %s: `conPhaiThu` chỉ ở DaXacNhan (qua cổng, cùng manager với hàng lịch); trạng thái khác là null và KHÔNG gọi cổng',
    async (state) => {
      operations.findDetail.mockResolvedValue(detailRow({ trangThai: state }));
      const detail = await service.detail(ALL_SCOPE, CODE);
      if (state === 'DaXacNhan') {
        expect(detail.conPhaiThu).toBe('150000.00');
        expect(payments.remainingToCollect).toHaveBeenCalledTimes(1);
        expect(payments.remainingToCollect).toHaveBeenCalledWith(
          hoisted.manager,
          '4242',
        );
      } else {
        expect(detail.conPhaiThu).toBeNull();
        expect(payments.remainingToCollect).not.toHaveBeenCalled();
      }
    },
  );
});

describe('chi tiết: hình dạng và panel (ADL-02, LSD-01)', () => {
  it('ADL-02 đúng 17 khoá, không `lichHenId`, không `thanhToan`, `hoanTien`, `thoiGianMayChu`, email, ngày sinh; giá trị ánh xạ đúng', async () => {
    const detail = await service.detail(ALL_SCOPE, CODE);
    expect(Object.keys(detail).sort()).toStrictEqual([
      'bacSi',
      'chiNhanh',
      'chuyenDuoc',
      'chuyenKhoa',
      'conPhaiThu',
      'dichVu',
      'giaSnapshot',
      'hanThanhToan',
      'lichSuTrangThai',
      'lyDoHuy',
      'lyDoKham',
      'maLichHen',
      'nguoiDat',
      'nguoiKham',
      'thoiGian',
      'tienCoc',
      'trangThai',
    ]);
    expect(detail.nguoiDat).toStrictEqual({
      hoTen: 'Người Đặt',
      soDienThoai: '0901234567',
    });
    expect(detail.nguoiKham).toStrictEqual({
      hoTen: 'Người Khám',
      laBanThan: true,
    });
    expect(detail.lyDoKham).toBe('Đau đầu');
    expect(JSON.stringify(detail)).not.toContain('4242');
  });

  it('LSD-01 panel đọc bằng `AppointmentHistoryReader` với CÙNG manager và `lich_hen_id` của hàng chi tiết, SAU `findDetail`, và đi nguyên vào `lichSuTrangThai`', async () => {
    const detail = await service.detail(BRANCH_SCOPE, CODE);
    expect(history.read).toHaveBeenCalledTimes(1);
    expect(history.read).toHaveBeenCalledWith(hoisted.manager, '4242');
    expect(detail.lichSuTrangThai).toBe(HISTORY);
    expect(operations.findDetail.mock.invocationCallOrder[0]).toBeLessThan(
      history.read.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('lỗi của bộ đọc nhật ký lan ra nguyên vẹn (không nuốt, không thành 404)', async () => {
    const error = new Error('lỗi giả của nhật ký');
    history.read.mockRejectedValue(error);
    await expect(service.detail(ALL_SCOPE, CODE)).rejects.toBe(error);
  });
});
