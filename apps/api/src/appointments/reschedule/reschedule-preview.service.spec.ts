import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';
import { bookabilityFacts, FACTS_NOW } from '../testing/bookability-facts.js';
import { assertPreviewContract } from '../testing/patient-reschedule-contract.js';
import {
  OLD_APPOINTMENT_CODE,
  OWNER_ID,
  reschedulabilityFacts,
  rescheduleSource,
} from '../testing/reschedulability-facts.js';
import { ReschedulePreviewService } from './reschedule-preview.service.js';
import type { RescheduleReader } from './reschedule.reader.js';
import type {
  ReschedulabilityFacts,
  RescheduleConfig,
} from './reschedule.types.js';

// Task reschedule B6 — `ReschedulePreviewService` với `runReadOnly` giả và `RescheduleReader` giả (không DB), bộ luật THẬT: DLH-52 (`loai`), DLH-60 (lỗi của lịch ra 200 `choPhepDoi: false` kèm mã), DLH-61
// (`lichMoi`: `hopLe`, `lyDoKhongHopLe`; khung giờ không tồn tại; DLH-20 khung giờ quá khứ), DLH-09 (404 cùng thân), DLH-23 (MỘT lần `runReadOnly`, chế độ `none`), HDL-26 (hợp đồng web). Không khoá và không ghi
// thật: `reschedule-preview.service.int-spec.ts`. Mã DLH-52, 60, 61 là `[đề xuất]` (TRACKING reschedule 1.10).
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
const CONFIG: RescheduleConfig = {
  soLanTuDoiLichToiDa: 2,
  checkInSauPhut: 15,
  soLichHenToiDaMoiHoSo: 3,
};
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};

// `facts` ĐẦY ĐỦ (dùng khi hỏi kèm khung giờ); `requestReasonGiven: true` đúng như preview truyền cho reader
const full = (overrides: Partial<ReschedulabilityFacts> = {}) =>
  reschedulabilityFacts({ requestReasonGiven: true, ...overrides });
const availabilityOnly = (facts: ReschedulabilityFacts) => {
  const { bookability: _slot, requestReasonGiven: _reason, ...rest } = facts;
  return rest;
};

function setup(facts: ReschedulabilityFacts = full()) {
  const config = vi.fn(() => Promise.resolve(CONFIG));
  const readAvailability = vi.fn(() =>
    Promise.resolve(availabilityOnly(facts)),
  );
  const read = vi.fn(() => Promise.resolve({ facts, locked: null }));
  const reader = {
    config,
    readAvailability,
    read,
  } as unknown as RescheduleReader;
  const service = new ReschedulePreviewService(DB, reader);
  const preview = (khungGioId?: string) =>
    service.preview(OWNER_ID, OLD_APPOINTMENT_CODE, khungGioId);
  return { service, config, readAvailability, read, preview };
}

async function bodyOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    return { status: error.getStatus(), body: error.getResponse() };
  }
  throw new Error('lẽ ra phải ném AppException');
}

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

beforeEach(() => {
  vi.mocked(runReadOnly).mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FACTS_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('DLH-23 preview KHÔNG có khungGioId: chỉ điều kiện đổi', () => {
  it('MỘT lần runReadOnly; chỉ readAvailability (cùng manager, actor TuDoi từ token, mã lịch, config, mốc now đã cắt giây); KHÔNG đọc khung giờ nào; lichMoi null', async () => {
    const { readAvailability, read, config, preview } = setup();
    const result = await preview();
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runReadOnly).mock.calls[0]?.[0]).toBe(DB);
    expect(config).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(readAvailability).toHaveBeenCalledTimes(1);
    expect(readAvailability).toHaveBeenCalledWith(hoisted.manager, {
      actor: { via: 'TuDoi', accountId: OWNER_ID },
      maLichHen: OLD_APPOINTMENT_CODE,
      now: FACTS_NOW,
      config: CONFIG,
    });
    expect(result.lichMoi).toBeNull();
    expect(result.choPhepDoi).toBe(true);
    expect('lyDoKhongDoi' in result).toBe(false);
    assertPreviewContract(wire(result));
  });

  it('lichCu đúng hai khoá lấy từ lịch cũ (bacSiId là CHUỖI, giữ nguyên id lớn hơn 2^53); thoiGianMayChu lấy SAU khi đọc xong', async () => {
    const facts = full({
      source: rescheduleSource({ bacSiId: '9007199254740995' }),
    });
    const { readAvailability, preview } = setup(facts);
    readAvailability.mockImplementationOnce(() => {
      vi.setSystemTime(new Date(FACTS_NOW.getTime() + 2500));
      return Promise.resolve(availabilityOnly(facts));
    });
    const result = await preview();
    expect(result.lichCu).toEqual({
      thoiGian: '2026-11-09T01:00:00.000Z',
      bacSiId: '9007199254740995',
    });
    expect(result.thoiGianMayChu).toBe('2026-11-02T01:00:02.500Z');
  });
});

describe('DLH-52 preview: loai TuDoi hay GuiYeuCau (đúng cả khi chưa có khungGioId)', () => {
  it.each([
    [0, 2, 'TuDoi', true],
    [1, 2, 'TuDoi', true],
    [2, 2, 'GuiYeuCau', true],
    [3, 2, 'GuiYeuCau', true],
    [0, 0, 'GuiYeuCau', true],
  ] as const)(
    'đã đổi %i, tối đa %i ⇒ loai %s, choPhepDoi %s (không và có khungGioId)',
    async (soLan, toiDa, loai, choPhep) => {
      const facts = full({
        source: rescheduleSource({ soLanTuDoiLich: soLan }),
        config: { soLanTuDoiLichToiDa: toiDa, checkInSauPhut: 15 },
      });
      for (const khungGioId of [undefined, '10']) {
        const result = await setup(facts).preview(khungGioId);
        expect(result.loai).toBe(loai);
        expect(result.choPhepDoi).toBe(choPhep);
        expect(result.soLanDaDoi).toBe(soLan);
        expect(result.soLanToiDa).toBe(toiDa);
        assertPreviewContract(wire(result));
      }
    },
  );

  it('đã hết lần VÀ đã có yêu cầu chờ ⇒ loai vẫn GuiYeuCau, choPhepDoi false, lyDoKhongDoi DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET, coYeuCauChoDuyet true', async () => {
    const result = await setup(
      full({
        source: rescheduleSource({ soLanTuDoiLich: 2 }),
        pendingRequest: true,
      }),
    ).preview();
    expect(result).toMatchObject({
      choPhepDoi: false,
      lyDoKhongDoi: 'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET',
      loai: 'GuiYeuCau',
      coYeuCauChoDuyet: true,
    });
    assertPreviewContract(wire(result));
  });
});

describe('DLH-60 preview: lỗi của LỊCH ra 200 choPhepDoi=false kèm lyDoKhongDoi (không 409)', () => {
  const CASES: [string, Partial<ReschedulabilityFacts>, string][] = [
    [
      'ChoThanhToan',
      { source: rescheduleSource({ trangThai: 'ChoThanhToan' }) },
      'LICH_HEN_KHONG_CHO_DOI',
    ],
    ...(
      ['DaTiepDon', 'HoanThanh', 'DaHuy', 'VangMat'] as TrangThaiLichHen[]
    ).map((trangThai): [string, Partial<ReschedulabilityFacts>, string] => [
      trangThai,
      { source: rescheduleSource({ trangThai }) },
      'LICH_HEN_KHONG_CHO_DOI',
    ]),
    [
      'quá giờ (thoiGian đúng mốc now: nửa mở)',
      { source: rescheduleSource({ thoiGian: FACTS_NOW }) },
      'LICH_HEN_DA_QUA_GIO',
    ],
    [
      'hồ sơ người thân đã ngừng',
      { profileActive: false },
      'HO_SO_NGUOI_THAN_DA_NGUNG',
    ],
    [
      'chuỗi đổi lịch quá dài',
      { chainLength: MAX_CHAIN_DEPTH - 1 },
      'CHUOI_DOI_LICH_QUA_DAI',
    ],
    [
      'hết lần và đã có yêu cầu chờ',
      {
        source: rescheduleSource({ soLanTuDoiLich: 2 }),
        pendingRequest: true,
      },
      'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET',
    ],
  ];

  it.each(CASES)(
    '%s ⇒ 200 choPhepDoi false, lyDoKhongDoi %s (cả không và có khungGioId)',
    async (_name, overrides, code) => {
      for (const khungGioId of [undefined, '10']) {
        const result = await setup(full(overrides)).preview(khungGioId);
        expect(result.choPhepDoi).toBe(false);
        expect(result.lyDoKhongDoi).toBe(code);
        assertPreviewContract(wire(result));
      }
    },
  );

  it('chỉ hai khoá lichCu và lichMoi thay đổi theo khungGioId: các khoá còn lại giống hệt nhau (không có bộ luật thứ hai)', async () => {
    const facts = full({ source: rescheduleSource({ trangThai: 'DaHuy' }) });
    const without = await setup(facts).preview();
    const withSlot = await setup(facts).preview('10');
    const { lichMoi: _a, ...restWithout } = without;
    const { lichMoi: _b, ...restWith } = withSlot;
    expect(restWith).toEqual(restWithout);
  });
});

describe('DLH-09 preview: lịch không xem được ⇒ 404 KHONG_TIM_THAY CÙNG thân', () => {
  const HIDDEN: [string, Partial<ReschedulabilityFacts>][] = [
    ['không có lịch (source null)', { source: null }],
    [
      'lịch của người khác',
      { source: rescheduleSource({ benhNhanId: '1234' }) },
    ],
    [
      'lịch DaDoiLich (Q31, R7)',
      { source: rescheduleSource({ trangThai: 'DaDoiLich' }) },
    ],
  ];

  it.each(HIDDEN)(
    '%s (cả không và có khungGioId)',
    async (_name, overrides) => {
      for (const khungGioId of [undefined, '10']) {
        const failure = await bodyOf(
          setup(full(overrides)).preview(khungGioId),
        );
        expect(failure.status).toBe(404);
        expect(failure.body).toEqual(NOT_FOUND_BODY);
      }
    },
  );

  it('khung giờ không tồn tại mà lịch cũng không xem được ⇒ vẫn 404 KHONG_TIM_THAY (lịch đứng trước khung giờ)', async () => {
    const failure = await bodyOf(
      setup(full({ source: null, bookability: null })).preview('10'),
    );
    expect(failure.body).toEqual(NOT_FOUND_BODY);
  });
});

describe('DLH-61, DLH-20 preview CÓ khungGioId: lichMoi từ bộ luật ĐẦY ĐỦ', () => {
  it('đọc bằng read(…, none) với requestReasonGiven true và khung giờ đích; KHÔNG dùng readAvailability; MỘT lần runReadOnly', async () => {
    const { read, readAvailability, preview } = setup();
    await preview('10');
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(readAvailability).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
    const calls = read.mock.calls as unknown as [unknown, unknown, unknown][];
    expect(calls[0]).toEqual([
      hoisted.manager,
      {
        actor: { via: 'TuDoi', accountId: OWNER_ID },
        maLichHen: OLD_APPOINTMENT_CODE,
        khungGioMoiId: '10',
        now: FACTS_NOW,
        config: CONFIG,
        requestReasonGiven: true,
      },
      'none',
    ]);
  });

  it('khung giờ trống, cùng bác sĩ: hopLe true, thoiGian ISO, khungGioId là chuỗi của khung giờ đọc ra (id lớn hơn 2^53 giữ nguyên), KHÔNG có lyDoKhongHopLe', async () => {
    const result = await setup(
      full({
        bookability: bookabilityFacts({
          thayThe: { maLichHen: OLD_APPOINTMENT_CODE },
          activeAppointments: [{ maLichHen: OLD_APPOINTMENT_CODE }],
          slot: {
            khungGioId: '9007199254740993',
            ngayGio: new Date('2026-11-10T08:00:00+07:00'),
            trangThai: 'ConTrong',
            giuChoDen: null,
          },
        }),
      }),
    ).preview('9007199254740993');
    expect(result.lichMoi).toEqual({
      khungGioId: '9007199254740993',
      thoiGian: '2026-11-10T01:00:00.000Z',
      hopLe: true,
    });
    assertPreviewContract(wire(result));
  });

  const slotOf = (overrides: Record<string, unknown>) =>
    bookabilityFacts({
      thayThe: { maLichHen: OLD_APPOINTMENT_CODE },
      activeAppointments: [{ maLichHen: OLD_APPOINTMENT_CODE }],
      ...overrides,
    });
  const SLOT_FAILURES: [string, ReturnType<typeof slotOf>, string][] = [
    [
      'khung giờ đã có người đặt',
      slotOf({
        slot: {
          khungGioId: '10',
          ngayGio: new Date('2026-11-10T08:00:00+07:00'),
          trangThai: 'DaDat',
          giuChoDen: null,
        },
      }),
      'KHUNG_GIO_DA_DAT',
    ],
    [
      'DLH-20 khung giờ ở quá khứ',
      slotOf({
        slot: {
          khungGioId: '10',
          ngayGio: new Date(FACTS_NOW.getTime() - 3_600_000),
          trangThai: 'ConTrong',
          giuChoDen: null,
        },
      }),
      'KHUNG_GIO_DA_QUA',
    ],
    [
      'khung giờ của bác sĩ KHÁC',
      slotOf({
        doctor: {
          bacSiId: '6',
          khaDung: true,
          chiNhanhId: '1',
          dichVuKhamId: '7',
        },
      }),
      'KHUNG_GIO_KHAC_BAC_SI',
    ],
    [
      'trùng khung giờ cũ',
      slotOf({
        slot: {
          khungGioId: '11',
          ngayGio: new Date('2026-11-10T08:00:00+07:00'),
          trangThai: 'ConTrong',
          giuChoDen: null,
        },
      }),
      'KHUNG_GIO_TRUNG_LICH_CU',
    ],
    [
      'bác sĩ đã đổi dịch vụ',
      slotOf({
        doctor: {
          bacSiId: '5',
          khaDung: true,
          chiNhanhId: '1',
          dichVuKhamId: '99',
        },
      }),
      'LICH_HEN_KHAC_DICH_VU_HIEN_TAI',
    ],
    [
      'bác sĩ đã đổi chi nhánh',
      slotOf({
        doctor: {
          bacSiId: '5',
          khaDung: true,
          chiNhanhId: '2',
          dichVuKhamId: '7',
        },
      }),
      'LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI',
    ],
    [
      'bác sĩ không còn khả dụng',
      slotOf({
        doctor: {
          bacSiId: '5',
          khaDung: false,
          chiNhanhId: '1',
          dichVuKhamId: '7',
        },
      }),
      'BAC_SI_KHONG_KHA_DUNG',
    ],
  ];

  it.each(SLOT_FAILURES)(
    '%s ⇒ 200, lichMoi.hopLe false, lyDoKhongHopLe %s; choPhepDoi vẫn true (lỗi RIÊNG của khung giờ)',
    async (_name, bookability, code) => {
      const result = await setup(full({ bookability })).preview('10');
      expect(result.choPhepDoi).toBe(true);
      expect(result.lichMoi).toMatchObject({
        hopLe: false,
        lyDoKhongHopLe: code,
      });
      assertPreviewContract(wire(result));
    },
  );

  it('đã hết lần tự đổi + khung giờ trống ⇒ lichMoi.hopLe TRUE (hỏi "gửi yêu cầu được không": không báo VUOT_SO_LAN_TU_DOI); đã có yêu cầu chờ ⇒ hopLe false cùng mã với lyDoKhongDoi', async () => {
    const over = rescheduleSource({ soLanTuDoiLich: 2 });
    const ok = await setup(full({ source: over })).preview('10');
    expect(ok.loai).toBe('GuiYeuCau');
    expect(ok.lichMoi?.hopLe).toBe(true);
    const pending = await setup(
      full({ source: over, pendingRequest: true }),
    ).preview('10');
    expect(pending.lichMoi).toMatchObject({
      hopLe: false,
      lyDoKhongHopLe: 'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET',
    });
    expect(pending.lyDoKhongDoi).toBe('DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET');
  });

  it('khung giờ KHÔNG tồn tại (bookability null) ⇒ 404 KHUNG_GIO_KHONG_TON_TAI, kể cả khi lịch cũng không đổi được (đứng TRƯỚC lỗi của lịch; không có giờ để vẽ lichMoi)', async () => {
    for (const overrides of [
      {},
      { source: rescheduleSource({ trangThai: 'DaHuy' }) },
    ]) {
      const failure = await bodyOf(
        setup(full({ ...overrides, bookability: null })).preview('10'),
      );
      expect(failure.status).toBe(404);
      expect(failure.body).toMatchObject({ maLoi: 'KHUNG_GIO_KHONG_TON_TAI' });
    }
  });
});

describe('DLH-55 preview: thiếu cấu hình ⇒ 409 HE_THONG_CHUA_CAU_HINH, không đọc DB', () => {
  it('config() ném ⇒ lỗi đi nguyên, runReadOnly KHÔNG được gọi', async () => {
    const { config, preview } = setup();
    const thrown = new AppException(409, 'HE_THONG_CHUA_CAU_HINH');
    config.mockRejectedValueOnce(thrown);
    await expect(preview()).rejects.toBe(thrown);
    expect(runReadOnly).not.toHaveBeenCalled();
  });
});
