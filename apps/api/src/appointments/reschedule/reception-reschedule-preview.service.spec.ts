import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';
import type { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { bookabilityFacts, FACTS_NOW } from '../testing/bookability-facts.js';
import { assertReceptionPreviewContract } from '../testing/reception-reschedule-contract.js';
import {
  BRANCH_ID,
  OLD_APPOINTMENT_CODE,
  reschedulabilityFacts,
  rescheduleSource,
} from '../testing/reschedulability-facts.js';
import { ReceptionReschedulePreviewService } from './reception-reschedule-preview.service.js';
import type { RescheduleReader } from './reschedule.reader.js';
import type {
  ReschedulabilityFacts,
  RescheduleActor,
  RescheduleConfig,
} from './reschedule.types.js';

// Task reschedule B7 — `ReceptionReschedulePreviewService` với `runReadOnly` giả, `RescheduleReader` và `ReceptionScopeService` giả (không DB), bộ luật THẬT: DLO-04 (cửa sổ tiếp đón), DLO-09 (hồ sơ ngừng), DLO-10
// (chuỗi dài), DLO-13 (yêu cầu chờ không chặn), HDL-28 (hợp đồng "đọc NGHIÊM"), QDL-02 (404 cùng thân, 403 trước mọi thứ), L-1 (lịch `DaDoiLich` nhân sự thấy được ⇒ 200 `choPhepDoi: false`, không 404). Không khoá và không
// ghi thật: `reception-reschedule-preview.service.int-spec.ts`. Mã DLO-13 và HDL-28 là `[đề xuất]` (TRACKING reschedule 1.11).
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
const ACCOUNT = '77';
const CONFIG: RescheduleConfig = {
  soLanTuDoiLichToiDa: 2,
  checkInSauPhut: 15,
  soLichHenToiDaMoiHoSo: 3,
};
const ACTOR: RescheduleActor = { via: 'DoiHo', chiNhanhId: BRANCH_ID };
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};

// `facts` ĐẦY ĐỦ của ĐỔI HỘ (actor DoiHo, chi nhánh của lịch); `requestReasonGiven: true` đúng như preview truyền cho reader
const full = (overrides: Partial<ReschedulabilityFacts> = {}) =>
  reschedulabilityFacts({
    actor: ACTOR,
    requestReasonGiven: true,
    ...overrides,
  });
const availabilityOnly = (facts: ReschedulabilityFacts) => {
  const { bookability: _slot, requestReasonGiven: _reason, ...rest } = facts;
  return rest;
};

function setup(
  facts: ReschedulabilityFacts = full(),
  scope: unknown = { kind: 'ChiNhanh', chiNhanhId: BRANCH_ID },
) {
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
  const resolve = vi.fn(() =>
    scope instanceof Error ? Promise.reject(scope) : Promise.resolve(scope),
  );
  const service = new ReceptionReschedulePreviewService(
    DB,
    { resolve } as unknown as ReceptionScopeService,
    reader,
  );
  const preview = (khungGioId?: string) =>
    service.preview(ACCOUNT, OLD_APPOINTMENT_CODE, khungGioId);
  return { service, config, readAvailability, read, resolve, preview };
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

describe('preview Lễ tân KHÔNG có khungGioId: chỉ điều kiện đổi', () => {
  it('MỘT lần runReadOnly; chỉ readAvailability với actor DoiHo (chi nhánh từ phạm vi, không từ tài khoản), mã lịch, config, mốc now đã cắt giây; KHÔNG đọc khung giờ; lichMoi null; hợp đồng đúng', async () => {
    const { readAvailability, read, config, resolve, preview } = setup();
    const result = await preview();
    expect(resolve).toHaveBeenCalledWith(ACCOUNT);
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runReadOnly).mock.calls[0]?.[0]).toBe(DB);
    expect(config).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(readAvailability).toHaveBeenCalledTimes(1);
    expect(readAvailability).toHaveBeenCalledWith(hoisted.manager, {
      actor: ACTOR,
      maLichHen: OLD_APPOINTMENT_CODE,
      now: FACTS_NOW,
      config: CONFIG,
    });
    expect(result.lichMoi).toBeNull();
    expect(result.choPhepDoi).toBe(true);
    expect('lyDoKhongDoi' in result).toBe(false);
    assertReceptionPreviewContract(wire(result));
  });

  it('lichCu đúng hai khoá (bacSiId là CHUỖI, giữ nguyên id lớn hơn 2^53); thoiGianMayChu lấy SAU khi đọc xong', async () => {
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

  it('QDL-02 phạm vi: không phải ChiNhanh ⇒ 403 KHONG_DU_QUYEN TRƯỚC mọi thứ (không đọc cấu hình, không mở giao dịch)', async () => {
    for (const scope of [
      { kind: 'ToanHeThong' },
      { kind: 'ChiNhanh' },
      new AppException(403, 'KHONG_DU_QUYEN'),
    ]) {
      const { preview, config, readAvailability } = setup(full(), scope);
      const failure = await bodyOf(preview());
      expect(failure.status).toBe(403);
      expect(config).not.toHaveBeenCalled();
      expect(readAvailability).not.toHaveBeenCalled();
    }
    expect(runReadOnly).not.toHaveBeenCalled();
  });
});

describe('DLO-04, DLO-09, DLO-10, DLO-13, L-1 preview: lỗi của lịch ra 200 choPhepDoi false kèm mã', () => {
  const minutes = (n: number) => n * 60_000;
  const sourceAt = (offsetMs: number, patch = {}) =>
    rescheduleSource({
      thoiGian: new Date(FACTS_NOW.getTime() + offsetMs),
      ...patch,
    });

  it.each([
    ['trước giờ hẹn', minutes(60), true],
    ['đúng giờ hẹn (đã qua giờ nhưng trong cửa sổ tiếp đón)', 0, true],
    [
      'quá 14 phút 59 giây (còn trong cửa sổ 15 phút)',
      -minutes(15) + 1000,
      true,
    ],
    ['đúng giờ hẹn cộng cửa sổ (nửa mở: đã qua)', -minutes(15), false],
    ['quá cửa sổ', -minutes(16), false],
  ])(
    'DLO-04 %s ⇒ choPhepDoi %s (hạn là giờ hẹn + check_in_sau_phut, khác Bệnh nhân)',
    async (_name, offsetMs, allowed) => {
      const { preview } = setup(full({ source: sourceAt(offsetMs) }));
      const result = await preview();
      expect(result.choPhepDoi).toBe(allowed);
      if (allowed) expect('lyDoKhongDoi' in result).toBe(false);
      else expect(result.lyDoKhongDoi).toBe('LICH_HEN_DA_QUA_GIO');
      assertReceptionPreviewContract(wire(result));
    },
  );

  it.each([
    'ChoThanhToan',
    'DaTiepDon',
    'HoanThanh',
    'DaHuy',
    'VangMat',
    'DaDoiLich',
  ] as TrangThaiLichHen[])(
    'trạng thái %s ⇒ 200 choPhepDoi false, LICH_HEN_KHONG_CHO_DOI (kể cả DaDoiLich: nhân sự THẤY được lịch này, không 404)',
    async (trangThai) => {
      const { preview } = setup(
        full({ source: rescheduleSource({ trangThai }) }),
      );
      const result = await preview();
      expect(result.choPhepDoi).toBe(false);
      expect(result.lyDoKhongDoi).toBe('LICH_HEN_KHONG_CHO_DOI');
      assertReceptionPreviewContract(wire(result));
    },
  );

  it('DLO-09 hồ sơ người thân đã ngừng ⇒ HO_SO_NGUOI_THAN_DA_NGUNG; DLO-10 chuỗi đã dài (MAX_CHAIN_DEPTH - 1 lịch) ⇒ CHUOI_DOI_LICH_QUA_DAI, 18 lịch vẫn đổi được', async () => {
    const stopped = await setup(full({ profileActive: false })).preview();
    expect(stopped.lyDoKhongDoi).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    const long = await setup(
      full({ chainLength: MAX_CHAIN_DEPTH - 1 }),
    ).preview();
    expect(long.lyDoKhongDoi).toBe('CHUOI_DOI_LICH_QUA_DAI');
    const ok = await setup(
      full({ chainLength: MAX_CHAIN_DEPTH - 2 }),
    ).preview();
    expect(ok.choPhepDoi).toBe(true);
  });

  it('DLO-13 lịch đang có yêu cầu ChoDuyet VẪN đổi hộ được: choPhepDoi true, coYeuCauChoDuyet true (KDL-19); hạn mức không áp (soLanDaDoi vượt toiDa vẫn true)', async () => {
    const { preview } = setup(
      full({
        pendingRequest: true,
        source: rescheduleSource({ soLanTuDoiLich: 9 }),
      }),
    );
    const result = await preview();
    expect(result.choPhepDoi).toBe(true);
    expect(result.coYeuCauChoDuyet).toBe(true);
    for (const key of ['loai', 'soLanDaDoi', 'soLanToiDa'])
      expect(key in result).toBe(false);
    assertReceptionPreviewContract(wire(result));
  });
});

describe('QDL-02 preview: không có lịch hay ngoài chi nhánh ⇒ 404 cùng thân', () => {
  it('source null (không có, ngoài chi nhánh, hồ sơ lệch) ⇒ 404 KHONG_TIM_THAY nguyên văn, cả khi không và có khungGioId', async () => {
    const facts = full({ source: null });
    for (const slot of [undefined, '10']) {
      const failure = await bodyOf(setup(facts).preview(slot));
      expect(failure).toEqual({ status: 404, body: NOT_FOUND_BODY });
    }
  });

  it('source nằm NGOÀI chi nhánh của Lễ tân (reader trả nhầm) vẫn 404 nhờ bộ luật kiểm lại phạm vi', async () => {
    const facts = full({ source: rescheduleSource({ chiNhanhId: '999' }) });
    expect(await bodyOf(setup(facts).preview())).toEqual({
      status: 404,
      body: NOT_FOUND_BODY,
    });
  });
});

describe('preview KÈM khungGioId: lichMoi theo bộ luật ĐẦY ĐỦ', () => {
  it('đọc `none` một lần với actor DoiHo, mã lịch, khung giờ, config, mốc now, requestReasonGiven true; khung giờ trống cùng bác sĩ ⇒ hopLe true, KHÔNG có lyDoKhongHopLe, id lớn hơn 2^53 giữ chuỗi', async () => {
    const slotId = '9007199254740993';
    const facts = full({
      bookability: bookabilityFacts({
        thayThe: { maLichHen: OLD_APPOINTMENT_CODE },
        activeAppointments: [{ maLichHen: OLD_APPOINTMENT_CODE }],
        slot: {
          khungGioId: slotId,
          ngayGio: new Date('2026-11-10T08:00:00+07:00'),
          trangThai: 'ConTrong',
          giuChoDen: null,
        },
      }),
    });
    const { read, readAvailability, preview } = setup(facts);
    const result = await preview(slotId);
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(readAvailability).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(
      hoisted.manager,
      {
        actor: ACTOR,
        maLichHen: OLD_APPOINTMENT_CODE,
        khungGioMoiId: slotId,
        now: FACTS_NOW,
        config: CONFIG,
        requestReasonGiven: true,
      },
      'none',
    );
    expect(result.lichMoi).toEqual({
      khungGioId: slotId,
      thoiGian: '2026-11-10T01:00:00.000Z',
      hopLe: true,
    });
    assertReceptionPreviewContract(wire(result));
  });

  it.each([
    [
      'khung giờ đã đặt',
      bookabilityFacts({
        thayThe: { maLichHen: OLD_APPOINTMENT_CODE },
        activeAppointments: [{ maLichHen: OLD_APPOINTMENT_CODE }],
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
      'khung giờ của bác sĩ khác',
      bookabilityFacts({
        thayThe: { maLichHen: OLD_APPOINTMENT_CODE },
        activeAppointments: [{ maLichHen: OLD_APPOINTMENT_CODE }],
        doctor: {
          bacSiId: '6',
          khaDung: true,
          chiNhanhId: '1',
          dichVuKhamId: '7',
        },
      }),
      'KHUNG_GIO_KHAC_BAC_SI',
    ],
  ])(
    '%s ⇒ 200, lichMoi.hopLe false, lyDoKhongHopLe %s; choPhepDoi vẫn true (lỗi RIÊNG của khung giờ)',
    async (_name, bookability, code) => {
      const result = await setup(full({ bookability })).preview('10');
      expect(result.choPhepDoi).toBe(true);
      expect(result.lichMoi).toMatchObject({
        hopLe: false,
        lyDoKhongHopLe: code,
      });
      assertReceptionPreviewContract(wire(result));
    },
  );

  it('khung giờ không tồn tại (bookability null) ⇒ 404 KHUNG_GIO_KHONG_TON_TAI, không trả lichMoi bịa', async () => {
    const failure = await bodyOf(
      setup(full({ bookability: null })).preview('77'),
    );
    expect(failure.status).toBe(404);
    expect(failure.body).toMatchObject({ maLoi: 'KHUNG_GIO_KHONG_TON_TAI' });
  });
});
