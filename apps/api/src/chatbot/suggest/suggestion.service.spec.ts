import 'reflect-metadata';
import type { DataSource, EntityManager } from 'typeorm';
import type { HocViBacSi } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Paged } from '../../common/paging/paged.js';
import type {
  AvailableSlot,
  DoctorDaySlots,
} from '../../scheduling/slots/available-slots.reader.js';
import type {
  PublicDoctorItem,
  PublicDoctorQueryDto,
} from '../../search/doctors/public-doctor.dto.js';
import type { SuggestionQueryDto } from './suggestion.dto.js';
import { SuggestionService } from './suggestion.service.js';

// chatbot B4 — service với mọi phụ thuộc giả (không DB, không Nest): GOI-03, GOI-04, GOI-05, GOI-06, GOI-07, GOI-08, GOI-09 ở mức đơn vị và ca B4-10…B4-26.
// Phần MySQL thật ở suggestion.int-spec.ts, phần HTTP ở test/chatbot-suggestions.e2e-spec.ts.
// `now` ghim ở năm 2031 để khác hẳn đồng hồ máy: service mà quay về `nowVN()` thì cửa sổ ngày lệch.
const NOW = new Date('2031-05-04T10:00:00+07:00'); // hôm nay giờ VN: 2031-05-04 (thứ Hai)
const DAY1 = '2031-05-04';
const DAY2 = '2031-05-05';

/** Bác sĩ công khai ĐẦY ĐỦ trường như `PublicDoctorService` trả, kể cả những trường không được lọt ra thân trả về. */
function item(
  id: string,
  over: {
    hoTen?: string;
    soNam?: number;
    soDanhGia?: number;
    diem?: string | null;
    chiNhanhId?: string;
  } = {},
): PublicDoctorItem {
  return {
    bacSiId: id,
    hoTen: over.hoTen ?? `Bác sĩ ${id}`,
    chucDanh: 'BS_CKI',
    soNamKinhNghiem: over.soNam ?? 0,
    chuyenKhoa: { chuyenKhoaId: '5', ten: 'Nhi khoa' },
    chiNhanh: {
      chiNhanhId: over.chiNhanhId ?? '2',
      ten: 'Chi nhánh Một',
      diaChi: '1 Đường Mẫu',
    },
    dichVu: { dichVuKhamId: '9', ten: 'Khám nhi', thoiLuong: 30 },
    gia: {
      giaMacDinh: '200000.00',
      phuPhi: '50000.00',
      giaKham: '250000.00',
      mucDatCoc: '50000.00',
    },
    danhGia: {
      diemTrungBinh: over.diem === undefined ? '4.0' : over.diem,
      soDanhGia: over.soDanhGia ?? 0,
    },
  };
}

/** Ô giờ với ISO UTC đúng như `AvailableSlotsReader` (giờ Việt Nam trừ 7 giờ). */
function slot(
  id: string,
  ngay: string,
  hhmm: string,
  over: Partial<AvailableSlot> = {},
): AvailableSlot {
  const batDau = new Date(`${ngay}T${hhmm}:00+07:00`);
  return {
    khungGioId: id,
    batDau: batDau.toISOString(),
    ketThuc: new Date(batDau.getTime() + 30 * 60_000).toISOString(),
    ca: 'CaSang',
    trangThai: 'ConTrong',
    ...over,
  };
}

type Schedule = Record<string, Record<string, AvailableSlot[]>>; // ngày ⇒ bác sĩ ⇒ ô

interface Setup {
  doctors?: PublicDoctorItem[];
  schedule?: Schedule;
  weights?: { w1: string; w2: string };
  degrees?: Record<string, HocViBacSi>;
  systemTenths?: number | null;
  specialtyActive?: boolean;
  configError?: AppException;
}

function build(setup: Setup = {}) {
  const manager = { tag: 'em-của-giao-dịch' } as unknown as EntityManager;
  const runner = {
    manager,
    connect: vi.fn(() => Promise.resolve()),
    query: vi.fn((_sql: string) => Promise.resolve()),
    startTransaction: vi.fn(() => Promise.resolve()),
    commitTransaction: vi.fn(() => Promise.resolve()),
    rollbackTransaction: vi.fn(() => Promise.resolve()),
    release: vi.fn(() => Promise.resolve()),
  };
  const createQueryRunner = vi.fn(() => runner);
  const db = { createQueryRunner } as unknown as DataSource;

  const items = setup.doctors ?? [];
  const list = vi.fn(
    (_query: PublicDoctorQueryDto): Promise<Paged<PublicDoctorItem>> =>
      Promise.resolve({ items, total: items.length, page: 1, pageSize: 100 }),
  );
  const listMany = vi.fn(
    (input: {
      bacSiIds: readonly string[];
      ngay: string;
      now?: Date;
    }): Promise<DoctorDaySlots[]> =>
      Promise.resolve(
        input.bacSiIds.map((bacSiId): DoctorDaySlots => ({
          bacSiId,
          ngay: input.ngay,
          trangThaiNgay: 'CoLich',
          khungGio: setup.schedule?.[input.ngay]?.[bacSiId] ?? [],
        })),
      ),
  );
  const getOrThrow = vi.fn(() =>
    setup.configError
      ? Promise.reject(setup.configError)
      : Promise.resolve({
          trongSoW1: setup.weights?.w1 ?? '0.60',
          trongSoW2: setup.weights?.w2 ?? '0.40',
        } as never),
  );
  const findActiveSpecialty = vi.fn(() =>
    Promise.resolve(
      setup.specialtyActive === false
        ? null
        : { chuyenKhoaId: '5', ten: 'Nhi khoa' },
    ),
  );
  const readSystemAverageTenths = vi.fn(() =>
    Promise.resolve(setup.systemTenths === undefined ? 40 : setup.systemTenths),
  );
  const readDegrees = vi.fn((_manager: EntityManager, ids: readonly string[]) =>
    Promise.resolve(
      new Map(
        ids.flatMap((id) => {
          const degree = setup.degrees?.[id];
          return degree ? [[id, degree] as const] : [];
        }),
      ),
    ),
  );
  const service = new SuggestionService(
    db,
    { list },
    { listMany },
    { getOrThrow },
    { findActiveSpecialty, readSystemAverageTenths },
    { readDegrees },
  );
  return {
    service,
    manager,
    runner,
    createQueryRunner,
    list,
    listMany,
    getOrThrow,
    findActiveSpecialty,
    readSystemAverageTenths,
    readDegrees,
  };
}

const q = (over: Partial<SuggestionQueryDto> = {}): SuggestionQueryDto =>
  Object.assign({ chuyenKhoaId: '5' }, over);

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppException);
  return error as AppException;
}

const idsOf = (out: { bacSi: { bacSiId: string }[] }) =>
  out.bacSi.map((d) => d.bacSiId);

describe('GOI-03 cấu hình hệ thống và thứ tự lỗi', () => {
  it('chưa có cấu hình ⇒ lỗi 409 HE_THONG_CHUA_CAU_HINH của SystemConfigService được trả nguyên; chưa đọc bác sĩ nào', async () => {
    const t = build({
      doctors: [item('1')],
      configError: new AppException(409, 'HE_THONG_CHUA_CAU_HINH'),
    });
    const error = await failureOf(t.service.suggest(q(), NOW));
    expect(error.getStatus()).toBe(409);
    expect(error.maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    expect(t.list).not.toHaveBeenCalled();
    expect(t.listMany).not.toHaveBeenCalled();
  });

  it('B4-10 chuyên khoa không hoạt động VÀ chưa cấu hình ⇒ 404 trước (PLAN 5.11: bước 1 rồi mới bước 2); cấu hình chưa được đọc', async () => {
    const t = build({
      specialtyActive: false,
      configError: new AppException(409, 'HE_THONG_CHUA_CAU_HINH'),
    });
    const error = await failureOf(t.service.suggest(q(), NOW));
    expect(error.getStatus()).toBe(404);
    expect(error.maLoi).toBe('KHONG_TIM_THAY');
    expect(t.getOrThrow).not.toHaveBeenCalled();
  });

  it('B4-11 trọng số trong cấu hình sai dạng ⇒ RangeError, KHÔNG âm thầm cho điểm 0', async () => {
    const t = build({
      doctors: [item('1')],
      weights: { w1: 'abc', w2: '0.40' },
    });
    await expect(t.service.suggest(q(), NOW)).rejects.toBeInstanceOf(
      RangeError,
    );
  });
});

describe('GOI-08 chuyên khoa và chi nhánh', () => {
  it('chuyên khoa không có hay đã ngừng ⇒ 404 KHONG_TIM_THAY; không đọc bác sĩ, không mở giao dịch', async () => {
    const t = build({ specialtyActive: false });
    const error = await failureOf(t.service.suggest(q(), NOW));
    expect(error.getStatus()).toBe(404);
    expect(error.maLoi).toBe('KHONG_TIM_THAY');
    expect(t.findActiveSpecialty).toHaveBeenCalledWith('5');
    expect(t.list).not.toHaveBeenCalled();
    expect(t.createQueryRunner).not.toHaveBeenCalled();
  });

  it('B4-12 gọi PublicDoctorService.list với chuyên khoa, trang 1, pageSize 100; không truyền chi nhánh khi không lọc', async () => {
    const t = build({ doctors: [item('1')] });
    await t.service.suggest(q(), NOW);
    const arg = t.list.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(arg.chuyenKhoaId).toBe('5');
    expect(arg.chiNhanhId).toBeUndefined();
    expect(arg.page).toBe(1);
    expect(arg.pageSize).toBe(100);
  });

  it('có chiNhanhId ⇒ truyền xuống danh sách bác sĩ đúng nguyên chuỗi', async () => {
    const t = build({ doctors: [item('1')] });
    await t.service.suggest(q({ chiNhanhId: '9223372036854775807' }), NOW);
    const arg = t.list.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(arg.chiNhanhId).toBe('9223372036854775807');
  });
});

describe('GOI-07 danh sách rỗng và lý do', () => {
  it('chuyên khoa chưa có bác sĩ (hay chi nhánh không có ai) ⇒ bacSi rỗng, lyDoRong KhongCoBacSi, ngay null; không mở giao dịch, không gọi bộ đọc khung giờ', async () => {
    const t = build({ doctors: [] });
    const out = await t.service.suggest(q(), NOW);
    expect(out).toEqual({
      chuyenKhoa: { chuyenKhoaId: '5', ten: 'Nhi khoa' },
      ngay: null,
      bacSi: [],
      lyDoRong: 'KhongCoBacSi',
    });
    expect(t.createQueryRunner).not.toHaveBeenCalled();
    expect(t.listMany).not.toHaveBeenCalled();
  });

  it('có truyền ngày mà không có bác sĩ ⇒ ngay là ngày đã hỏi (echo)', async () => {
    const t = build({ doctors: [] });
    const out = await t.service.suggest(q({ ngay: DAY2 }), NOW);
    expect(out.ngay).toBe(DAY2);
    expect(out.lyDoRong).toBe('KhongCoBacSi');
  });

  it('có bác sĩ nhưng 7 ngày không ô nào ⇒ KhongCoKhungGio, ngay null, ĐÚNG 7 lần gọi bộ đọc (mỗi ngày một lần)', async () => {
    const t = build({ doctors: [item('1'), item('2')], schedule: {} });
    const out = await t.service.suggest(q(), NOW);
    expect(out.bacSi).toEqual([]);
    expect(out.lyDoRong).toBe('KhongCoKhungGio');
    expect(out.ngay).toBeNull();
    expect(t.listMany).toHaveBeenCalledTimes(7);
    expect(t.readDegrees).not.toHaveBeenCalled();
  });

  it('có ngày cụ thể mà ngày đó không ô ⇒ KhongCoKhungGio, ngay giữ nguyên ngày đã hỏi, đúng MỘT lần gọi', async () => {
    const t = build({
      doctors: [item('1')],
      schedule: { [DAY1]: { '1': [slot('10', DAY1, '15:00')] } },
    });
    const out = await t.service.suggest(q({ ngay: DAY2 }), NOW);
    expect(out.ngay).toBe(DAY2);
    expect(out.lyDoRong).toBe('KhongCoKhungGio');
    expect(t.listMany).toHaveBeenCalledTimes(1);
  });

  it('chỉ có ô của ca khác ca đã chọn ⇒ KhongCoKhungGio; CaToi luôn rỗng vì không ca tối nào có ô', async () => {
    const t = build({
      doctors: [item('1')],
      schedule: { [DAY1]: { '1': [slot('10', DAY1, '15:00')] } }, // CaSang
    });
    expect(
      (await t.service.suggest(q({ ca: 'CaChieu', ngay: DAY1 }), NOW)).lyDoRong,
    ).toBe('KhongCoKhungGio');
    expect(
      (await t.service.suggest(q({ ca: 'CaToi', ngay: DAY1 }), NOW)).lyDoRong,
    ).toBe('KhongCoKhungGio');
  });

  it('thân rỗng có đúng bốn khoá; không rỗng thì KHÔNG có lyDoRong', async () => {
    const empty = await build({ doctors: [] }).service.suggest(q(), NOW);
    expect(Object.keys(empty).sort()).toEqual([
      'bacSi',
      'chuyenKhoa',
      'lyDoRong',
      'ngay',
    ]);
    const full = await build({
      doctors: [item('1')],
      schedule: { [DAY1]: { '1': [slot('10', DAY1, '09:00')] } },
    }).service.suggest(q(), NOW);
    expect(Object.keys(full).sort()).toEqual(['bacSi', 'chuyenKhoa', 'ngay']);
  });
});

describe('GOI-04 ngày sớm nhất, một mốc now, một giao dịch chỉ đọc', () => {
  it('không truyền ngày, hôm nay kín: dừng ở ngày đầu có ô (ngày thứ 3), gọi đúng 3 lần, đúng thứ tự ngày', async () => {
    const t = build({
      doctors: [item('1')],
      schedule: {
        '2031-05-06': { '1': [slot('30', '2031-05-06', '08:00')] },
        '2031-05-08': { '1': [slot('50', '2031-05-08', '08:00')] },
      },
    });
    const out = await t.service.suggest(q(), NOW);
    expect(out.ngay).toBe('2031-05-06');
    expect(idsOf(out)).toEqual(['1']);
    expect(t.listMany.mock.calls.map(([input]) => input.ngay)).toEqual([
      '2031-05-04',
      '2031-05-05',
      '2031-05-06',
    ]);
  });

  it('mọi lần gọi dùng CÙNG đối tượng `now` và CÙNG `manager` của giao dịch chỉ đọc; học vị và điểm hệ thống cũng đọc bằng manager đó', async () => {
    const t = build({
      doctors: [item('1')],
      schedule: { '2031-05-06': { '1': [slot('30', '2031-05-06', '08:00')] } },
    });
    await t.service.suggest(q(), NOW);
    for (const [input, manager] of t.listMany.mock.calls as unknown as [
      { now: Date },
      EntityManager,
    ][]) {
      expect(input.now).toBe(NOW);
      expect(manager).toBe(t.manager);
    }
    expect(t.readDegrees.mock.calls[0]?.[0]).toBe(t.manager);
    expect(t.readSystemAverageTenths.mock.calls[0]).toEqual([t.manager]);
    // một giao dịch: SET TRANSACTION READ ONLY, bắt đầu REPEATABLE READ, cam kết đúng một lần, không rollback
    expect(t.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(t.runner.query).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
    expect(t.runner.startTransaction).toHaveBeenCalledWith('REPEATABLE READ');
    expect(t.runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(t.runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(t.runner.release).toHaveBeenCalledTimes(1);
  });

  it('bộ đọc nhận mọi bác sĩ ứng viên mỗi lần (chưa lọc theo ô), theo thứ tự danh sách', async () => {
    const t = build({
      doctors: [item('7'), item('3'), item('9')],
      schedule: { [DAY1]: { '3': [slot('1', DAY1, '16:00')] } },
    });
    await t.service.suggest(q(), NOW);
    expect(t.listMany.mock.calls[0]?.[0].bacSiIds).toEqual(['7', '3', '9']);
  });

  it('cửa sổ 7 ngày qua ranh giới tháng: hôm nay 2031-05-30 ⇒ 05-30, 05-31, 06-01 … 06-05', async () => {
    const t = build({ doctors: [item('1')] });
    await t.service.suggest(q(), new Date('2031-05-30T10:00:00+07:00'));
    expect(t.listMany.mock.calls.map(([input]) => input.ngay)).toEqual([
      '2031-05-30',
      '2031-05-31',
      '2031-06-01',
      '2031-06-02',
      '2031-06-03',
      '2031-06-04',
      '2031-06-05',
    ]);
  });

  it('hai múi giờ: 16:59:59Z là 23:59:59 giờ VN (hôm nay 05-04) còn 17:00:00Z là 00:00 giờ VN (hôm nay 05-05); không phụ thuộc TZ của máy', async () => {
    const before = build({ doctors: [item('1')] });
    await before.service.suggest(q(), new Date('2031-05-04T16:59:59Z'));
    expect(before.listMany.mock.calls[0]?.[0].ngay).toBe('2031-05-04');
    const after = build({ doctors: [item('1')] });
    await after.service.suggest(q(), new Date('2031-05-04T17:00:00Z'));
    expect(after.listMany.mock.calls[0]?.[0].ngay).toBe('2031-05-05');
  });

  it('B4-13 không truyền now thì lấy đồng hồ ứng dụng (nowVN) và dùng ĐÚNG mốc đó cho cả cửa sổ lẫn bộ đọc', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(NOW);
      const t = build({ doctors: [item('1')] });
      await t.service.suggest(q());
      const first = t.listMany.mock.calls[0]?.[0];
      expect(first?.ngay).toBe(DAY1);
      expect(first?.now?.getTime()).toBe(NOW.getTime());
    } finally {
      vi.useRealTimers();
    }
  });

  it('B4-14 giao dịch hỏng giữa chừng ⇒ rollback, nhả kết nối, lỗi đi tiếp (không trả kết quả nửa vời)', async () => {
    const t = build({ doctors: [item('1')] });
    t.listMany.mockRejectedValueOnce(new Error('MySQL gãy'));
    await expect(t.service.suggest(q(), NOW)).rejects.toThrow('MySQL gãy');
    expect(t.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(t.runner.commitTransaction).not.toHaveBeenCalled();
    expect(t.runner.release).toHaveBeenCalledTimes(1);
  });
});

describe('GOI-05 ngày và ca', () => {
  const both = {
    [DAY2]: {
      '1': [
        slot('11', DAY2, '08:00', { ca: 'CaSang' }),
        slot('12', DAY2, '14:00', { ca: 'CaChieu' }),
      ],
      '2': [slot('21', DAY2, '15:00', { ca: 'CaChieu' })],
    },
  };

  it('có ngày: chỉ MỘT lần gọi bộ đọc, đúng ngày đó, dù hôm nay có ô', async () => {
    const t = build({
      doctors: [item('1')],
      schedule: { [DAY1]: { '1': [slot('10', DAY1, '16:00')] }, ...both },
    });
    const out = await t.service.suggest(q({ ngay: DAY2 }), NOW);
    expect(out.ngay).toBe(DAY2);
    expect(t.listMany).toHaveBeenCalledTimes(1);
    expect(t.listMany.mock.calls[0]?.[0].ngay).toBe(DAY2);
  });

  it('có ca: chỉ ô đúng ca; bác sĩ chỉ còn ô ca khác bị loại', async () => {
    const t = build({
      doctors: [item('1'), item('2'), item('3')],
      schedule: both,
    });
    const out = await t.service.suggest(q({ ngay: DAY2, ca: 'CaChieu' }), NOW);
    expect(idsOf(out).sort()).toEqual(['1', '2']);
    const slotsOf = (id: string) =>
      out.bacSi
        .find((d) => d.bacSiId === id)
        ?.khungGio.map((s) => s.khungGioId);
    expect(slotsOf('1')).toEqual(['12']); // ô ca sáng 11 không có mặt
    expect(slotsOf('2')).toEqual(['21']);
    expect(
      out.bacSi.every((d) => d.khungGio.every((s) => s.ca === 'CaChieu')),
    ).toBe(true);
  });

  it('không truyền ngày nhưng có ca: ngày sớm nhất là ngày đầu có ô ĐÚNG ca (ngày hôm nay chỉ có ca sáng bị bỏ qua)', async () => {
    const t = build({
      doctors: [item('1')],
      schedule: {
        [DAY1]: { '1': [slot('10', DAY1, '08:00', { ca: 'CaSang' })] },
        [DAY2]: { '1': [slot('11', DAY2, '14:00', { ca: 'CaChieu' })] },
      },
    });
    const out = await t.service.suggest(q({ ca: 'CaChieu' }), NOW);
    expect(out.ngay).toBe(DAY2);
    expect(t.listMany).toHaveBeenCalledTimes(2);
  });
});

describe('GOI-06 chỉ ô ConTrong', () => {
  it('ô DaDat, DangGiuCho, HetHan do bộ đọc trả kèm trạng thái đều bị loại; ô ConTrong bên cạnh vẫn có', async () => {
    const t = build({
      doctors: [item('1'), item('2')],
      schedule: {
        [DAY1]: {
          '1': [
            slot('1', DAY1, '09:00', { trangThai: 'DaDat' }),
            slot('2', DAY1, '09:30', { trangThai: 'DangGiuCho' }),
            slot('3', DAY1, '10:00', { trangThai: 'HetHan' }),
            slot('4', DAY1, '10:30'),
          ],
          // bác sĩ 2 chỉ còn ô không trống ⇒ không xuất hiện
          '2': [slot('5', DAY1, '09:00', { trangThai: 'DaDat' })],
        },
      },
    });
    const out = await t.service.suggest(q(), NOW);
    expect(idsOf(out)).toEqual(['1']);
    expect(out.bacSi[0]?.khungGio.map((s) => s.khungGioId)).toEqual(['4']);
  });

  it('ngày hôm nay chỉ toàn ô không trống ⇒ sang ngày kế (không dừng ở ngày chỉ có ô DaDat)', async () => {
    const t = build({
      doctors: [item('1')],
      schedule: {
        [DAY1]: { '1': [slot('1', DAY1, '09:00', { trangThai: 'DaDat' })] },
        [DAY2]: { '1': [slot('2', DAY2, '09:00')] },
      },
    });
    const out = await t.service.suggest(q(), NOW);
    expect(out.ngay).toBe(DAY2);
    expect(t.listMany).toHaveBeenCalledTimes(2);
  });
});

describe('Xếp hạng trong service (nối GOI-01, GOI-02)', () => {
  // w = 0,60 / 0,40, điểm hệ thống 4,0 (80%): A 8.400, B 6.800, C 8.800 (số viết tay, xem ranking.rules.spec.ts)
  const A = item('1', { soDanhGia: 10, diem: '4.5', soNam: 10 });
  const B = item('2', { soDanhGia: 3, diem: '5.0', soNam: 10 });
  const C = item('3', { soDanhGia: 0, diem: null, soNam: 20 });
  const day = (id: string) => ({ [id]: [slot(`s${id}`, DAY1, '09:00')] });
  const schedule = { [DAY1]: { ...day('1'), ...day('2'), ...day('3') } };
  const degrees = { '1': 'TS', '2': 'BS', '3': 'GS' } as const;

  it('thứ tự theo điểm: C (8.800), A (8.400), B (6.800), dùng học vị đọc ở máy chủ và điểm hệ thống', async () => {
    const t = build({
      doctors: [A, B, C],
      schedule,
      degrees,
      systemTenths: 40,
    });
    expect(idsOf(await t.service.suggest(q(), NOW))).toEqual(['3', '1', '2']);
    expect(t.readDegrees.mock.calls[0]?.[1]).toEqual(['1', '2', '3']);
  });

  it('đổi trọng số trong cấu hình thì thứ tự đổi theo (không cache): w(0,60; 0,40) ⇒ E trước D; w(1,00; 0,00) ⇒ D trước E', async () => {
    // D: 5 lượt 5,0 sao, 0 năm ⇒ w(60,40): 6.000; E: 0 lượt, 20 năm, hệ thống 4,0 ⇒ 8.800 ⇒ E trước.
    // w(100,0): D 10.000, E 8.000 ⇒ D trước.
    const D = item('4', { soDanhGia: 5, diem: '5.0', soNam: 0 });
    const E = item('5', { soDanhGia: 0, diem: null, soNam: 20 });
    const sched = { [DAY1]: { ...day('4'), ...day('5') } };
    const first = build({
      doctors: [D, E],
      schedule: sched,
      weights: { w1: '0.60', w2: '0.40' },
    });
    expect(idsOf(await first.service.suggest(q(), NOW))).toEqual(['5', '4']);
    const second = build({
      doctors: [D, E],
      schedule: sched,
      weights: { w1: '1.00', w2: '0.00' },
    });
    expect(idsOf(await second.service.suggest(q(), NOW))).toEqual(['4', '5']);
  });

  it('chỉ đọc học vị của bác sĩ còn ô (bác sĩ không có ô không bị đọc)', async () => {
    const t = build({
      doctors: [A, B, C],
      schedule: { [DAY1]: day('1') },
      degrees,
    });
    await t.service.suggest(q(), NOW);
    expect(t.readDegrees.mock.calls[0]?.[1]).toEqual(['1']);
  });

  it('hoà điểm: nhiều năm hơn trước, rồi họ tên, rồi id (đầu vào xáo trộn vẫn ra cùng một thứ tự)', async () => {
    const x = item('30', {
      hoTen: 'Minh',
      soNam: 5,
      soDanhGia: 5,
      diem: '4.0',
    });
    const y = item('20', {
      hoTen: 'Minh',
      soNam: 5,
      soDanhGia: 5,
      diem: '4.0',
    });
    const z = item('10', { hoTen: 'An', soNam: 5, soDanhGia: 5, diem: '4.0' });
    const sched = { [DAY1]: { ...day('30'), ...day('20'), ...day('10') } };
    const weights = { w1: '1.00', w2: '0.00' };
    const one = build({ doctors: [x, y, z], schedule: sched, weights });
    const two = build({ doctors: [z, x, y], schedule: sched, weights });
    expect(idsOf(await one.service.suggest(q(), NOW))).toEqual([
      '10',
      '20',
      '30',
    ]);
    expect(idsOf(await two.service.suggest(q(), NOW))).toEqual([
      '10',
      '20',
      '30',
    ]);
  });
});

describe('GOI-09 thân trả về: trần, danh sách trắng', () => {
  it('7 bác sĩ đều có ô ⇒ đúng 5 bác sĩ có điểm cao nhất; mỗi người nhiều ô ⇒ đúng 6 ô SỚM NHẤT theo giờ tăng dần (đầu vào xáo trộn)', async () => {
    // Điểm tăng theo số năm (w1 = 0, w2 = 1): bác sĩ 1 thấp nhất … bác sĩ 7 cao nhất
    const doctors = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      item(String(n), { soNam: n }),
    );
    const times = [
      '16:00',
      '09:00',
      '15:00',
      '08:00',
      '14:30',
      '13:00',
      '10:00',
      '11:00',
      '12:00',
    ];
    const schedule = {
      [DAY1]: Object.fromEntries(
        doctors.map((d) => [
          d.bacSiId,
          times.map((hhmm, index) => slot(`${d.bacSiId}0${index}`, DAY1, hhmm)),
        ]),
      ),
    };
    const t = build({ doctors, schedule, weights: { w1: '0.00', w2: '1.00' } });
    const out = await t.service.suggest(q(), NOW);
    expect(idsOf(out)).toEqual(['7', '6', '5', '4', '3']);
    for (const doctor of out.bacSi) {
      expect(doctor.khungGio).toHaveLength(6);
      const starts = doctor.khungGio.map((s) => s.batDau);
      expect(starts).toEqual([...starts].sort());
      // 6 giờ sớm nhất trong 08:00, 09:00, 10:00, 11:00, 12:00, 13:00 (UTC = giờ VN trừ 7)
      expect(starts[0]).toBe('2031-05-04T01:00:00.000Z');
      expect(starts[5]).toBe('2031-05-04T06:00:00.000Z');
    }
  });

  it('tập khoá CHÍNH XÁC ở từng tầng; không học vị, số năm, điểm xếp hạng, dịch vụ, email, SĐT, ngày sinh', async () => {
    const t = build({
      doctors: [item('1', { soDanhGia: 6, diem: '4.5', soNam: 12 })],
      schedule: {
        [DAY1]: { '1': [slot('10', DAY1, '09:00', { ca: 'CaSang' })] },
      },
      degrees: { '1': 'GS' },
    });
    const out = await t.service.suggest(q(), NOW);
    expect(Object.keys(out).sort()).toEqual(['bacSi', 'chuyenKhoa', 'ngay']);
    expect(Object.keys(out.chuyenKhoa).sort()).toEqual(['chuyenKhoaId', 'ten']);
    const doctor = out.bacSi[0];
    expect(Object.keys(doctor ?? {}).sort()).toEqual([
      'bacSiId',
      'chiNhanh',
      'chucDanh',
      'danhGia',
      'giaKham',
      'hoTen',
      'khungGio',
    ]);
    expect(Object.keys(doctor?.chiNhanh ?? {}).sort()).toEqual([
      'chiNhanhId',
      'diaChi',
      'ten',
    ]);
    expect(Object.keys(doctor?.danhGia ?? {}).sort()).toEqual([
      'diemTrungBinh',
      'soDanhGia',
    ]);
    expect(Object.keys(doctor?.khungGio[0] ?? {}).sort()).toEqual([
      'batDau',
      'ca',
      'khungGioId',
    ]);
    expect(doctor).toMatchObject({
      bacSiId: '1',
      hoTen: 'Bác sĩ 1',
      chucDanh: 'BS_CKI',
      giaKham: '250000.00',
      danhGia: { diemTrungBinh: '4.5', soDanhGia: 6 },
    });
    const text = JSON.stringify(out);
    for (const forbidden of [
      'hocVi',
      'GS',
      'soNamKinhNghiem',
      'diem_',
      'score',
      'email',
      'soDienThoai',
      'ngaySinh',
      'dichVu',
      'giaMacDinh',
      'phuPhi',
      'mucDatCoc',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('B4-15 mọi id trong thân trả về là CHUỖI (bacSiId, khungGioId, chuyenKhoaId, chiNhanhId)', async () => {
    const t = build({
      doctors: [item('9007199254740993')],
      schedule: {
        [DAY1]: {
          '9007199254740993': [slot('9007199254740995', DAY1, '09:00')],
        },
      },
    });
    const out = await t.service.suggest(q(), NOW);
    expect(typeof out.chuyenKhoa.chuyenKhoaId).toBe('string');
    expect(out.bacSi[0]?.bacSiId).toBe('9007199254740993');
    expect(out.bacSi[0]?.khungGio[0]?.khungGioId).toBe('9007199254740995');
    expect(typeof out.bacSi[0]?.chiNhanh.chiNhanhId).toBe('string');
  });

  it('B4-16 hai ô cùng giờ xếp theo id số (9 trước 10), không theo chuỗi', async () => {
    const t = build({
      doctors: [item('1')],
      schedule: {
        [DAY1]: { '1': [slot('10', DAY1, '09:00'), slot('9', DAY1, '09:00')] },
      },
    });
    const out = await t.service.suggest(q(), NOW);
    expect(out.bacSi[0]?.khungGio.map((s) => s.khungGioId)).toEqual([
      '9',
      '10',
    ]);
  });

  it('B4-17 chỉ đọc: giao dịch đặt READ ONLY và service không gọi hàm ghi nào (các phụ thuộc giả chỉ có hàm đọc)', async () => {
    const t = build({
      doctors: [item('1')],
      schedule: { [DAY1]: { '1': [slot('10', DAY1, '09:00')] } },
    });
    await t.service.suggest(q(), NOW);
    expect(t.runner.query.mock.calls.map(([sql]) => String(sql))).toEqual([
      'SET TRANSACTION READ ONLY',
    ]);
  });
});
