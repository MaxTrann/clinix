import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import type { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import {
  rescheduleSource,
  reschedulabilityFacts,
} from '../testing/reschedulability-facts.js';
import type {
  RescheduleRequestDetailRow,
  RescheduleRequestItemRow,
  RescheduleRequestListQuery,
} from './reschedule-request-list.types.js';
import { RescheduleRequestListService } from './reschedule-request-list.service.js';
import type { RescheduleRequestRepository } from './reschedule-request.repository.js';
import type { RescheduleReader } from './reschedule.reader.js';
import type { RescheduleConfig } from './reschedule.types.js';

// reschedule B8 — RescheduleRequestListService với phụ thuộc GIẢ và `runReadOnly` giả (không DB): giải phạm vi TRƯỚC mọi thứ và TRƯỚC khi phân tích id (QDL-02), phạm vi luôn từ server (XDL-03, XDL-04),
// một giao dịch chỉ đọc cho đếm và trang (HDL-31 phần đơn vị), `coTheDuyet` đi qua luật THẬT của B2 một lần (HDL-33, XDL-37), 404 cùng một nhánh (XDL-05), không log (BDL-10).
// Chạy thật trên MySQL: reschedule-request-list.int-spec.ts.
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
const BRANCH: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '5' };
const ALL: AdminScope = { kind: 'ToanHeThong' };
const CODE = 'CLX-20261110-ABCDE';
// Lịch gốc 08:00 thứ Hai 09/11/2026 giờ VN; "bây giờ" là 07:00 cùng ngày, `check_in_sau_phut` 15
const APPOINTMENT_AT = new Date('2026-11-09T08:00:00+07:00');
const NOW = new Date(APPOINTMENT_AT.getTime() - 60 * 60_000);
const CONFIG: RescheduleConfig = {
  soLanTuDoiLichToiDa: 2,
  checkInSauPhut: 15,
  soLichHenToiDaMoiHoSo: 3,
};

const itemRow = (
  overrides: Partial<RescheduleRequestItemRow> = {},
): RescheduleRequestItemRow => ({
  yeuCauId: '11',
  trangThai: 'ChoDuyet',
  thoiDiemTao: '2026-11-05 09:30:15',
  maLichHen: CODE,
  nguoiKhamHoTen: 'Người Khám',
  laNguoiThan: 0,
  bacSiHoTen: 'Bác sĩ Một',
  chiNhanhId: '5',
  chiNhanhTen: 'Chi nhánh 5',
  thoiGianCu: '2026-11-09 08:00:00',
  thoiGianMongMuon: '2026-11-12 09:00:00',
  soLanDaTuDoi: 2,
  ...overrides,
});
const detailRow = (
  overrides: Partial<RescheduleRequestDetailRow> = {},
): RescheduleRequestDetailRow => ({
  ...itemRow(),
  lichHenId: '100',
  khungGioMongMuonId: '31',
  khungGioTrangThai: 'ConTrong',
  khungGioGiuChoDen: null,
  lyDoYeuCau: 'Tôi có việc đột xuất',
  trangThaiLichGoc: 'DaXacNhan',
  ghiChuXuLy: null,
  thoiDiemXuLy: null,
  nguoiXuLyHoTen: null,
  ...overrides,
});
const queryOf = (
  overrides: Partial<RescheduleRequestListQuery> = {},
): RescheduleRequestListQuery => ({
  page: 1,
  pageSize: 20,
  offset: 0,
  ...overrides,
});

let scopes: { resolve: ReturnType<typeof vi.fn> };
let requests: {
  countByStates: ReturnType<typeof vi.fn>;
  findPage: ReturnType<typeof vi.fn>;
  findDetail: ReturnType<typeof vi.fn>;
};
let reader: {
  tryConfig: ReturnType<typeof vi.fn>;
  readAvailability: ReturnType<typeof vi.fn>;
};
let service: RescheduleRequestListService;

// Dữ kiện đọc được mà luật THẬT chấm: vai `DuyetYeuCau`, lịch `DaXacNhan`, trước hạn
function availabilityFacts(overrides: Record<string, unknown> = {}) {
  const {
    bookability: _slot,
    requestReasonGiven: _reason,
    ...facts
  } = reschedulabilityFacts({
    actor: { via: 'DuyetYeuCau', chiNhanhId: '5' },
    now: NOW,
    source: rescheduleSource({ chiNhanhId: '5' }),
  });
  return { ...facts, ...overrides };
}

beforeEach(() => {
  vi.mocked(runReadOnly).mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  scopes = { resolve: vi.fn().mockResolvedValue(BRANCH) };
  requests = {
    countByStates: vi.fn().mockResolvedValue(0),
    findPage: vi.fn().mockResolvedValue([]),
    findDetail: vi.fn().mockResolvedValue(detailRow()),
  };
  reader = {
    tryConfig: vi.fn().mockResolvedValue(CONFIG),
    readAvailability: vi.fn().mockResolvedValue(availabilityFacts()),
  };
  service = new RescheduleRequestListService(
    DB,
    scopes as unknown as ReceptionScopeService,
    new BranchAccessPolicy(),
    requests as unknown as RescheduleRequestRepository,
    reader as unknown as RescheduleReader,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Đối số thứ `arg` của lần gọi thứ `call` của một mock (không dùng chuỗi `?.` rồi ép kiểu: oxlint `no-unsafe-optional-chaining`)
function argOf<T>(
  mock: { mock: { calls: unknown[][] } },
  call: number,
  arg: number,
): T {
  return (mock.mock.calls[call] ?? [])[arg] as T;
}

const expectRejected = async (
  promise: Promise<unknown>,
  status: number,
  maLoi: string,
) => {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).getStatus()).toBe(status);
  expect((error as AppException).maLoi).toBe(maLoi);
};

describe('QDL-02 phạm vi giải TRƯỚC mọi thứ', () => {
  it('Lễ tân bị khoá: danh sách 403 và KHÔNG mở giao dịch hay đọc gì', async () => {
    scopes.resolve.mockRejectedValue(new AppException(403, 'KHONG_DU_QUYEN'));
    await expectRejected(
      service.listForReception('7', queryOf()),
      403,
      'KHONG_DU_QUYEN',
    );
    expect(runReadOnly).not.toHaveBeenCalled();
    expect(requests.countByStates).not.toHaveBeenCalled();
  });

  it.each(['11', 'abc', '', '0', 'CLX-20261110-ABCDE', '1; DROP TABLE x'])(
    'Lễ tân bị khoá + :yeuCauId %j ⇒ 403 (phạm vi TRƯỚC thân), không 404',
    async (id) => {
      scopes.resolve.mockRejectedValue(new AppException(403, 'KHONG_DU_QUYEN'));
      await expectRejected(
        service.detailForReception('7', id),
        403,
        'KHONG_DU_QUYEN',
      );
      expect(runReadOnly).not.toHaveBeenCalled();
    },
  );

  it('phạm vi hỏng (ScopeService trả ToanHeThong hay thiếu chiNhanhId) ⇒ 403, không mở toàn hệ thống cho Lễ tân', async () => {
    for (const bad of [
      { kind: 'ToanHeThong' },
      { kind: 'ChiNhanh' },
      { kind: 'ChiNhanh', chiNhanhId: 5 },
    ]) {
      scopes.resolve.mockResolvedValue(bad);
      await expectRejected(
        service.listForReception('7', queryOf()),
        403,
        'KHONG_DU_QUYEN',
      );
      await expectRejected(
        service.detailForReception('7', '11'),
        403,
        'KHONG_DU_QUYEN',
      );
    }
    expect(runReadOnly).not.toHaveBeenCalled();
  });

  it('Quản trị viên: phạm vi hỏng (kind lạ, ChiNhanh thiếu chiNhanhId, chiNhanhId không phải chuỗi) ⇒ 403 ở cả danh sách và chi tiết', async () => {
    for (const bad of [
      { kind: 'Lạ' },
      { kind: 'ChiNhanh' },
      { kind: 'ChiNhanh', chiNhanhId: 5 },
    ] as unknown as AdminScope[]) {
      await expectRejected(service.list(bad, queryOf()), 403, 'KHONG_DU_QUYEN');
      await expectRejected(service.detail(bad, '11'), 403, 'KHONG_DU_QUYEN');
    }
    expect(runReadOnly).not.toHaveBeenCalled();
  });
});

describe('XDL-03, XDL-04 phạm vi và bộ lọc của danh sách', () => {
  it('Lễ tân: chi nhánh từ ReceptionScopeService (đọc theo accountId) vào MỌI câu; chiNhanhId lọt vào query (giả định DTO hỏng) bị bỏ qua', async () => {
    requests.countByStates.mockResolvedValue(1);
    requests.findPage.mockResolvedValue([itemRow()]);
    await service.listForReception('7', queryOf({ chiNhanhId: '999' }));
    expect(scopes.resolve).toHaveBeenCalledWith('7');
    const filter = requests.countByStates.mock.calls[0]?.[1] as {
      chiNhanhId: string;
    };
    expect(filter.chiNhanhId).toBe('5');
    expect(requests.findPage.mock.calls[0]?.[1]).toBe(filter);
  });

  it('Quản trị viên Chi nhánh: luôn chi nhánh được gán, BỎ QUA chiNhanhId của query (nếp DSV-02)', async () => {
    await service.list(BRANCH, queryOf({ chiNhanhId: '999' }));
    expect(
      argOf<{ chiNhanhId: string }>(requests.countByStates, 0, 1).chiNhanhId,
    ).toBe('5');
  });

  it('Quản trị viên Toàn hệ thống: dùng chiNhanhId của query làm bộ lọc, hoặc không lọc', async () => {
    await service.list(ALL, queryOf({ chiNhanhId: '8' }));
    await service.list(ALL, queryOf());
    expect(
      argOf<{ chiNhanhId?: string }>(requests.countByStates, 0, 1).chiNhanhId,
    ).toBe('8');
    expect(
      argOf<{ chiNhanhId?: string }>(requests.countByStates, 1, 1).chiNhanhId,
    ).toBeUndefined();
  });

  it('mặc định ChoDuyet và sắp TĂNG; tab Đã xử lý (hai trạng thái) sắp GIẢM; thứ tự khách gửi không đổi thứ tự nhánh', async () => {
    requests.countByStates.mockResolvedValue(1);
    await service.list(ALL, queryOf());
    await service.list(ALL, queryOf({ trangThai: ['TuChoi', 'DaDuyet'] }));
    const [first = [], second = []] = requests.findPage.mock.calls;
    expect((first[1] as { states: string[] }).states).toStrictEqual([
      'ChoDuyet',
    ]);
    expect(first[2]).toBe('ASC');
    expect((second[1] as { states: string[] }).states).toStrictEqual([
      'DaDuyet',
      'TuChoi',
    ]);
    expect(second[2]).toBe('DESC');
  });

  it('bacSiId và q (mã đã chuẩn hoá ở DTO) vào bộ lọc; không có thì null', async () => {
    requests.countByStates.mockResolvedValue(1);
    await service.list(ALL, queryOf({ bacSiId: '31', q: CODE }));
    await service.list(ALL, queryOf());
    const filters = requests.countByStates.mock.calls.map(
      (call) => call[1] as { bacSiId: string | null; maLichHen: string | null },
    );
    expect(filters[0]).toMatchObject({ bacSiId: '31', maLichHen: CODE });
    expect(filters[1]).toMatchObject({ bacSiId: null, maLichHen: null });
  });

  it('HDL-31 đếm và trang trong ĐÚNG MỘT giao dịch chỉ đọc, cùng manager; trang nhận pageSize và offset', async () => {
    requests.countByStates.mockResolvedValue(45);
    requests.findPage.mockResolvedValue([itemRow()]);
    const page = await service.list(
      ALL,
      queryOf({ page: 3, pageSize: 20, offset: 40 }),
    );
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(requests.countByStates.mock.calls[0]?.[0]).toBe(hoisted.manager);
    expect(requests.findPage.mock.calls[0]?.[0]).toBe(hoisted.manager);
    expect(requests.findPage.mock.calls[0]?.slice(3)).toStrictEqual([20, 40]);
    expect(page).toMatchObject({ total: 45, page: 3, pageSize: 20 });
    expect(page.items).toHaveLength(1);
    expect(Object.keys(page.items[0] ?? {})).toHaveLength(10);
  });

  it('XDL-36 offset >= total ⇒ items rỗng, total giữ nguyên và KHÔNG gửi câu trang (OFFSET khổng lồ không tới MySQL)', async () => {
    requests.countByStates.mockResolvedValue(5);
    const page = await service.list(
      ALL,
      queryOf({ page: 1_000_000_000, pageSize: 100, offset: 99_999_999_900 }),
    );
    expect(page).toStrictEqual({
      items: [],
      total: 5,
      page: 1_000_000_000,
      pageSize: 100,
    });
    expect(requests.findPage).not.toHaveBeenCalled();
    // đúng biên: offset = total cũng rỗng; offset = total - 1 thì có trang
    await service.list(ALL, queryOf({ offset: 5 }));
    expect(requests.findPage).not.toHaveBeenCalled();
    await service.list(ALL, queryOf({ offset: 4 }));
    expect(requests.findPage).toHaveBeenCalledTimes(1);
  });
});

describe('XDL-05, QDL-02 chi tiết: id và 404 cùng một nhánh', () => {
  it.each(['abc', '', '0', '01', '-5', '1.5', ' 7', 'CLX-20261110-ABCDE'])(
    'id sai dạng %j ⇒ 404 KHONG_TIM_THAY, không đọc DB',
    async (id) => {
      await expectRejected(
        service.detailForReception('7', id),
        404,
        'KHONG_TIM_THAY',
      );
      await expectRejected(service.detail(BRANCH, id), 404, 'KHONG_TIM_THAY');
      expect(runReadOnly).not.toHaveBeenCalled();
    },
  );

  it('không có hoặc ngoài phạm vi (repository trả null) ⇒ CÙNG 404; ném SAU khi giao dịch đóng, không đọc cấu hình hay lịch', async () => {
    requests.findDetail.mockResolvedValue(null);
    await expectRejected(
      service.detailForReception('7', '11'),
      404,
      'KHONG_TIM_THAY',
    );
    await expectRejected(service.detail(ALL, '11'), 404, 'KHONG_TIM_THAY');
    expect(reader.tryConfig).not.toHaveBeenCalled();
    expect(reader.readAvailability).not.toHaveBeenCalled();
  });

  it('điều kiện chi nhánh đi vào findDetail: Lễ tân và Chi nhánh dùng chi nhánh của phạm vi, Toàn hệ thống không lọc; id giữ nguyên chuỗi lớn', async () => {
    await service.detailForReception('7', '9007199254740993');
    await service.detail(BRANCH, '12');
    await service.detail(ALL, '13');
    const calls = requests.findDetail.mock.calls.map((call) => call.slice(1));
    expect(calls).toStrictEqual([
      ['5', '9007199254740993'],
      ['5', '12'],
      [undefined, '13'],
    ]);
  });

  it('XDL-40 chiNhanhId và bacSiId lớn hơn 2^53 đi vào bộ lọc nguyên chuỗi (Toàn hệ thống), yeuCauId lớn đi nguyên vào findDetail', async () => {
    const big = '9007199254740993';
    await service.list(ALL, queryOf({ chiNhanhId: big, bacSiId: big }));
    const filter = requests.countByStates.mock.calls[0]?.[1] as {
      chiNhanhId: unknown;
      bacSiId: unknown;
    };
    expect(filter.chiNhanhId).toBe(big);
    expect(filter.bacSiId).toBe(big);
    await service.detail(ALL, big);
    expect(requests.findDetail.mock.calls[0]?.[2]).toBe(big);
  });

  it('chi tiết đủ 19 khoá, không id lịch', async () => {
    const detail = await service.detail(BRANCH, '11');
    expect(Object.keys(detail)).toHaveLength(19);
    expect(JSON.stringify(detail)).not.toContain('"lichHenId"');
  });
});

describe('HDL-33, XDL-37 coTheDuyet đi qua luật THẬT của B2', () => {
  it('ChoDuyet + có cấu hình: readAvailability gọi ĐÚNG MỘT lần với vai DuyetYeuCau theo phạm vi, mã lịch của hàng, mốc `now` và cấu hình; coTheDuyet true', async () => {
    const detail = await service.detail(BRANCH, '11');
    expect(reader.readAvailability).toHaveBeenCalledTimes(1);
    expect(reader.readAvailability.mock.calls[0]).toStrictEqual([
      hoisted.manager,
      {
        actor: { via: 'DuyetYeuCau', chiNhanhId: '5' },
        maLichHen: CODE,
        now: NOW,
        config: CONFIG,
      },
    ]);
    expect(detail).toMatchObject({
      coTheDuyet: true,
      lyDoKhongDuyet: null,
      soLanToiDa: 2,
    });
  });

  it('Toàn hệ thống đọc với chiNhanhId null (mọi chi nhánh)', async () => {
    await service.detail(ALL, '11');
    expect(
      argOf<{ actor: unknown }>(reader.readAvailability, 0, 1).actor,
    ).toStrictEqual({ via: 'DuyetYeuCau', chiNhanhId: null });
  });

  it.each([
    ['DaHuy', 'LICH_HEN_KHONG_CHO_DOI'],
    ['DaTiepDon', 'LICH_HEN_KHONG_CHO_DOI'],
    ['VangMat', 'LICH_HEN_KHONG_CHO_DOI'],
    ['DaDoiLich', 'LICH_HEN_KHONG_CHO_DOI'],
  ] as const)(
    'lịch gốc %s ⇒ coTheDuyet false, %s (từ chối vẫn xem được chi tiết)',
    async (trangThai, code) => {
      reader.readAvailability.mockResolvedValue(
        availabilityFacts({
          source: rescheduleSource({ chiNhanhId: '5', trangThai }),
        }),
      );
      const detail = await service.detail(BRANCH, '11');
      expect(detail.coTheDuyet).toBe(false);
      expect(detail.lyDoKhongDuyet).toBe(code);
    },
  );

  it('quá thoi_gian + check_in_sau_phut ⇒ LICH_HEN_DA_QUA_GIO', async () => {
    vi.setSystemTime(new Date(APPOINTMENT_AT.getTime() + 15 * 60_000));
    reader.readAvailability.mockImplementation(
      (_m: unknown, input: { now: Date }) =>
        Promise.resolve(availabilityFacts({ now: input.now })),
    );
    const detail = await service.detail(BRANCH, '11');
    expect(detail).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'LICH_HEN_DA_QUA_GIO',
    });
  });

  it.each(['DaDuyet', 'TuChoi'] as const)(
    'yêu cầu %s: KHÔNG đọc lịch gốc, YEU_CAU_DA_XU_LY; vẫn đọc cấu hình cho soLanToiDa',
    async (trangThai) => {
      requests.findDetail.mockResolvedValue(detailRow({ trangThai }));
      const detail = await service.detail(ALL, '11');
      expect(reader.readAvailability).not.toHaveBeenCalled();
      expect(detail).toMatchObject({
        coTheDuyet: false,
        lyDoKhongDuyet: 'YEU_CAU_DA_XU_LY',
        soLanToiDa: 2,
      });
    },
  );

  it('thiếu cấu hình: 200, KHÔNG đọc lịch gốc, coTheDuyet false, HE_THONG_CHUA_CAU_HINH, soLanToiDa null (không 409)', async () => {
    reader.tryConfig.mockResolvedValue(null);
    const detail = await service.detail(BRANCH, '11');
    expect(reader.readAvailability).not.toHaveBeenCalled();
    expect(detail).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'HE_THONG_CHUA_CAU_HINH',
      soLanToiDa: null,
    });
  });

  it('lịch gốc không đọc lại được (dữ liệu lệch ⇒ source null) ⇒ coTheDuyet false, KHONG_TIM_THAY, không 500', async () => {
    reader.readAvailability.mockResolvedValue(
      availabilityFacts({ source: null }),
    );
    const detail = await service.detail(BRANCH, '11');
    expect(detail).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'KHONG_TIM_THAY',
    });
  });

  it('lỗi hạ tầng của reader lan ra nguyên vẹn (không nuốt thành coTheDuyet giả)', async () => {
    const failure = new Error('mất kết nối');
    reader.readAvailability.mockRejectedValue(failure);
    await expect(service.detail(BRANCH, '11')).rejects.toBe(failure);
  });
});

describe('BDL-10 không log', () => {
  it('danh sách và chi tiết (kể cả lỗi) không gọi Logger hay console', async () => {
    const spies = [
      vi.spyOn(Logger.prototype, 'log'),
      vi.spyOn(Logger.prototype, 'warn'),
      vi.spyOn(Logger.prototype, 'error'),
      vi.spyOn(Logger.prototype, 'debug'),
      vi.spyOn(Logger.prototype, 'verbose'),
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ];
    requests.countByStates.mockResolvedValue(1);
    requests.findPage.mockResolvedValue([itemRow()]);
    await service.list(BRANCH, queryOf({ q: CODE }));
    await service.detail(BRANCH, '11');
    requests.findDetail.mockResolvedValue(null);
    await service.detail(BRANCH, '11').catch(() => undefined);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
