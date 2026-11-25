import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import {
  bookabilityFacts,
  FACTS_SLOT_START,
} from '../testing/bookability-facts.js';
import { FakeAppointmentNotifier } from '../testing/fake-ports.js';
import {
  OWNER_ID,
  reschedulabilityFacts,
  rescheduleSource,
} from '../testing/reschedulability-facts.js';
import { RescheduleRequestService } from './reschedule-request.service.js';
import type { RescheduleRequestRepository } from './reschedule-request.repository.js';
import type {
  RescheduleLocated,
  RescheduleReader,
} from './reschedule.reader.js';
import type { ReschedulabilityFacts } from './reschedule.types.js';

// reschedule B5 — XDL-01, XDL-02, XDL-21, XDL-23, XDL-26, XDL-30, DLH-04, DLH-05 phần U: `RescheduleRequestService.create` với MỌI phụ thuộc GIẢ (không DB). Bộ luật `evaluateReschedulability` là
// hàm THẬT (facts do reader giả trả), nên kết luận "đã có chờ", "còn lần", thứ tự lỗi đều do luật B2 quyết, không do mock. `withBookingTransaction` và `lockRequestCreation` giả để ghi thứ tự.
// SQL, khoá, hoàn tác và đồng thời thật trên MySQL: `reschedule-request.service.int-spec.ts` và `reschedule-request.concurrency.int-spec.ts`.
const hoisted = vi.hoisted(() => ({
  manager: { id: 'manager-cua-mot-giao-dich' },
  events: [] as string[],
  /** Số lần thân bị chạy lại giả lập (1 = một lần) */
  runs: 1,
}));
vi.mock('../locking/booking-transaction.js', () => ({
  withBookingTransaction: vi.fn(
    async (_db: unknown, work: (manager: unknown) => Promise<unknown>) => {
      hoisted.events.push('tx:mở');
      let result: unknown;
      for (let run = 0; run < hoisted.runs; run += 1)
        result = await work(hoisted.manager);
      hoisted.events.push('tx:đóng');
      return result;
    },
  ),
}));
vi.mock('./reschedule-locks.js', () => ({ lockRequestCreation: vi.fn() }));
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { lockRequestCreation } from './reschedule-locks.js';

const CODES = BOOKING_ERROR_CODES;
const DB_MANAGER = { id: 'manager-doc-thuong-cua-datasource' };
const DB = { manager: DB_MANAGER } as unknown as DataSource;
const MA_LICH_HEN = 'CLX-20261109-OLDAP';
const TARGET_SLOT = '10';
const NOW_RAW = '2026-11-02T01:00:00.789Z';
const NOW_SECOND = new Date('2026-11-02T01:00:00.000Z');
const CONFIG = {
  soLanTuDoiLichToiDa: 2,
  checkInSauPhut: 15,
  soLichHenToiDaMoiHoSo: 3,
};
const LOCATED: RescheduleLocated = {
  lichHenId: '100',
  benhNhanId: OWNER_ID,
  hoSoNguoiThanId: null,
  bacSiId: '5',
  khungGioCuId: '11',
  bacSiCuaKhungGioMoiId: '5',
};

let reader: {
  config: ReturnType<typeof vi.fn>;
  locate: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
};
let repository: { insert: ReturnType<typeof vi.fn> };
let notifier: FakeAppointmentNotifier;
let service: RescheduleRequestService;

/** Hết lần tự đổi (2 trên tối đa 2), khung giờ đích đạt: luật cho nhánh `Request`. */
const exhaustedFacts = (overrides: Partial<ReschedulabilityFacts> = {}) =>
  reschedulabilityFacts({
    source: rescheduleSource({ soLanTuDoiLich: 2 }),
    requestReasonGiven: true,
    ...overrides,
  });

const create = (
  extra: Partial<{
    lyDoYeuCau: string;
    khungGioMongMuonId: string;
    accountId: string;
  }> = {},
) =>
  service.create({
    maLichHen: MA_LICH_HEN,
    khungGioMongMuonId: TARGET_SLOT,
    lyDoYeuCau: 'Tôi bận việc đột xuất hôm đó',
    accountId: OWNER_ID,
    ...extra,
  });

beforeEach(() => {
  hoisted.events.length = 0;
  hoisted.runs = 1;
  vi.mocked(withBookingTransaction).mockClear();
  vi.mocked(lockRequestCreation)
    .mockReset()
    .mockImplementation(() => {
      hoisted.events.push('lock');
      return Promise.resolve({
        kind: 'Locked',
      } as unknown as Awaited<ReturnType<typeof lockRequestCreation>>);
    });
  reader = {
    config: vi.fn().mockImplementation(() => {
      hoisted.events.push('config');
      return Promise.resolve(CONFIG);
    }),
    locate: vi.fn().mockImplementation(() => {
      hoisted.events.push('locate');
      return Promise.resolve(LOCATED);
    }),
    read: vi
      .fn()
      .mockImplementation((_em: unknown, _input: unknown, mode: string) => {
        hoisted.events.push(`read:${mode}`);
        return Promise.resolve({ facts: exhaustedFacts(), locked: null });
      }),
  };
  repository = {
    insert: vi.fn().mockImplementation(() => {
      hoisted.events.push('insert');
      return Promise.resolve('501');
    }),
  };
  notifier = new FakeAppointmentNotifier();
  notifier.notifyCall.onCall(() => {
    hoisted.events.push('notify');
  });
  service = new RescheduleRequestService(
    DB,
    reader as unknown as RescheduleReader,
    repository as unknown as RescheduleRequestRepository,
    notifier,
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW_RAW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('XDL-01 luồng thành công: thứ tự, đối số, kết quả', () => {
  it('thứ tự: cấu hình và đọc thường NGOÀI giao dịch, rồi khoá, đọc lại dưới khoá, INSERT, thông báo; kết quả RequestCreated', async () => {
    const outcome = await create();
    expect(hoisted.events).toStrictEqual([
      'config',
      'locate',
      'tx:mở',
      'lock',
      'read:locked',
      'insert',
      'notify',
      'tx:đóng',
    ]);
    expect(outcome).toStrictEqual({
      kind: 'RequestCreated',
      yeuCauId: '501',
      thoiGianMongMuon: FACTS_SLOT_START,
    });
  });

  it('khoá nhận đúng năm khoá bất biến của lịch cũ và khung giờ MONG MUỐN (không phải khung giờ cũ); giao dịch có nhãn riêng', async () => {
    await create();
    expect(lockRequestCreation).toHaveBeenCalledWith(hoisted.manager, {
      benhNhanId: OWNER_ID,
      hoSoNguoiThanId: null,
      bacSiId: '5',
      lichHenId: '100',
      khungGioMongMuonId: TARGET_SLOT,
    });
    expect(withBookingTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(withBookingTransaction).mock.calls[0]?.[0]).toBe(DB);
    expect(vi.mocked(withBookingTransaction).mock.calls[0]?.[2]).toStrictEqual({
      label: 'reschedule-request',
    });
  });

  it('đọc lại dưới khoá bằng manager của GIAO DỊCH, vai TuDoi của chủ lịch, requestReasonGiven true, chế độ locked', async () => {
    await create();
    const [em, input, mode] = reader.read.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      string,
    ];
    expect(em).toBe(hoisted.manager);
    expect(mode).toBe('locked');
    expect(input).toMatchObject({
      actor: { via: 'TuDoi', accountId: OWNER_ID },
      maLichHen: MA_LICH_HEN,
      khungGioMoiId: TARGET_SLOT,
      requestReasonGiven: true,
      config: CONFIG,
    });
  });

  it('INSERT nhận lịch cũ, khung giờ mong muốn, lý do đã chuẩn hoá, mốc `now` cắt giây, bằng manager của giao dịch', async () => {
    await create({ lyDoYeuCau: ' \n  Tôi bận việc đột xuất  \t ' });
    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(repository.insert).toHaveBeenCalledWith(hoisted.manager, {
      lichHenId: '100',
      khungGioMongMuonId: TARGET_SLOT,
      lyDoYeuCau: 'Tôi bận việc đột xuất',
      thoiDiemTao: NOW_SECOND,
    });
  });

  it('thông báo YeuCauDoiLichDangCho: gửi cho tài khoản ĐẶT, lịch CŨ, kèm yeuCau (id và giờ mong muốn), KHÔNG mang lý do và KHÔNG doiLich; bằng manager của giao dịch', async () => {
    await create();
    expect(notifier.notifyCall.calls).toHaveLength(1);
    const [em, event] = notifier.notifyCall.calls[0] ?? [];
    expect(em).toBe(hoisted.manager);
    expect(event).toStrictEqual({
      loaiSuKien: 'YeuCauDoiLichDangCho',
      lichHenId: '100',
      taiKhoanId: OWNER_ID,
      yeuCau: { yeuCauId: '501', thoiGianMongMuon: FACTS_SLOT_START },
    });
    expect(JSON.stringify(event)).not.toContain('bận việc');
  });
});

describe('XDL-26 một mốc thời gian', () => {
  it('`now` cắt giây, truyền cho cả đọc thường lẫn INSERT; chạy lại thân (1213 giả lập) dùng CÙNG mốc, cấu hình và đọc thường chỉ MỘT lần', async () => {
    hoisted.runs = 2;
    await create();
    expect(reader.config).toHaveBeenCalledTimes(1);
    expect(reader.locate).toHaveBeenCalledTimes(1);
    expect(reader.read).toHaveBeenCalledTimes(2);
    const nows = reader.read.mock.calls.map(
      (call) => (call[1] as { now: Date }).now,
    );
    expect(nows[0]).toStrictEqual(NOW_SECOND);
    expect(nows[1]).toBe(nows[0]);
    const inserted = repository.insert.mock.calls.map(
      (call) => (call[1] as { thoiDiemTao: Date }).thoiDiemTao,
    );
    expect(inserted).toStrictEqual([NOW_SECOND, NOW_SECOND]);
  });

  it('đồng hồ nhích giữa chừng (đọc dưới khoá mất thời gian) không đổi mốc: INSERT vẫn dùng mốc lấy ở đầu, không đọc đồng hồ lần nữa', async () => {
    reader.read.mockImplementation(() => {
      vi.setSystemTime(new Date('2026-11-02T01:05:00.000Z'));
      return Promise.resolve({ facts: exhaustedFacts(), locked: null });
    });
    await create();
    expect(repository.insert.mock.calls[0]?.[1]).toMatchObject({
      thoiDiemTao: NOW_SECOND,
    });
  });
});

describe('DLH-04, DLH-05 nhánh theo hạn mức, kết quả có kiểu', () => {
  it('còn lần tự đổi (1 trên tối đa 2) ⇒ NotOverQuota kèm số, KHÔNG ghi gì, KHÔNG thông báo', async () => {
    reader.read.mockResolvedValue({
      facts: exhaustedFacts({
        source: rescheduleSource({ soLanTuDoiLich: 1 }),
      }),
      locked: null,
    });
    await expect(create()).resolves.toStrictEqual({
      kind: 'NotOverQuota',
      soLanDaDoi: 1,
      toiDa: 2,
    });
    expect(repository.insert).not.toHaveBeenCalled();
    expect(notifier.notifyCall.count).toBe(0);
  });

  it('toiDa = 0: lịch chưa đổi lần nào vẫn đi nhánh yêu cầu', async () => {
    reader.config.mockResolvedValue({ ...CONFIG, soLanTuDoiLichToiDa: 0 });
    reader.read.mockResolvedValue({
      facts: exhaustedFacts({
        source: rescheduleSource({ soLanTuDoiLich: 0 }),
        config: { soLanTuDoiLichToiDa: 0, checkInSauPhut: 15 },
      }),
      locked: null,
    });
    await expect(create()).resolves.toMatchObject({ kind: 'RequestCreated' });
  });

  it.each([
    [1, 'NotOverQuota'],
    [2, 'RequestCreated'],
    [3, 'RequestCreated'],
  ])(
    'biên: đã đổi %i lần, tối đa 2 ⇒ %s (đúng bằng tối đa là HẾT lần)',
    async (soLanTuDoiLich, kind) => {
      reader.read.mockResolvedValue({
        facts: exhaustedFacts({ source: rescheduleSource({ soLanTuDoiLich }) }),
        locked: null,
      });
      await expect(create()).resolves.toMatchObject({ kind });
    },
  );
});

describe('XDL-02 đã có yêu cầu chờ và các từ chối của luật: Rejected, không ghi gì', () => {
  it('đã có ChoDuyet ⇒ Rejected DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET, không INSERT, không thông báo', async () => {
    reader.read.mockResolvedValue({
      facts: exhaustedFacts({ pendingRequest: true }),
      locked: null,
    });
    await expect(create()).resolves.toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'Rule', code: CODES.RESCHEDULE_REQUEST_PENDING },
    });
    expect(repository.insert).not.toHaveBeenCalled();
    expect(notifier.notifyCall.count).toBe(0);
  });

  it.each([
    ['ChoThanhToan', CODES.NOT_RESCHEDULABLE],
    ['DaTiepDon', CODES.NOT_RESCHEDULABLE],
    ['DaHuy', CODES.NOT_RESCHEDULABLE],
  ] as const)(
    'lịch ở trạng thái %s ⇒ Rejected %s (kiểm lại dưới khoá, không ghi)',
    async (trangThai, code) => {
      reader.read.mockResolvedValue({
        facts: exhaustedFacts({
          source: rescheduleSource({ soLanTuDoiLich: 2, trangThai }),
        }),
        locked: null,
      });
      const outcome = await create();
      expect(outcome).toMatchObject({
        kind: 'Rejected',
        failure: { kind: 'Rule', code },
      });
      expect(repository.insert).not.toHaveBeenCalled();
    },
  );

  it('lịch ngoài phạm vi dưới khoá (đổi chủ giữa chừng) ⇒ Rejected NotFound', async () => {
    reader.read.mockResolvedValue({
      facts: exhaustedFacts({ source: null }),
      locked: null,
    });
    await expect(create()).resolves.toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'NotFound' },
    });
  });

  it('khung giờ mong muốn đã DaDat dưới khoá ⇒ Rejected KHUNG_GIO_DA_DAT, không ghi', async () => {
    reader.read.mockResolvedValue({
      facts: exhaustedFacts({
        bookability: bookabilityFacts({
          slot: {
            khungGioId: TARGET_SLOT,
            ngayGio: FACTS_SLOT_START,
            trangThai: 'DaDat',
            giuChoDen: null,
          },
          thayThe: { maLichHen: MA_LICH_HEN },
          activeAppointments: [{ maLichHen: MA_LICH_HEN }],
        }),
      }),
      locked: null,
    });
    await expect(create()).resolves.toMatchObject({
      kind: 'Rejected',
      failure: { code: CODES.SLOT_BOOKED },
    });
    expect(repository.insert).not.toHaveBeenCalled();
  });
});

describe('XDL-23 từ chối SỚM: không giao dịch, không khoá, thứ tự lỗi vẫn là 5.6', () => {
  const early = (overrides: Partial<ReschedulabilityFacts>) => {
    reader.read.mockImplementation(
      (_em: unknown, _input: unknown, mode: string) => {
        hoisted.events.push(`read:${mode}`);
        return Promise.resolve({
          facts: exhaustedFacts(overrides),
          locked: null,
        });
      },
    );
  };

  it('khung giờ mong muốn của BÁC SĨ KHÁC ⇒ KHUNG_GIO_KHAC_BAC_SI; đọc thường bằng manager của DataSource, KHÔNG mở giao dịch, KHÔNG khoá', async () => {
    reader.locate.mockResolvedValue({
      ...LOCATED,
      bacSiCuaKhungGioMoiId: '6',
    });
    early({
      bookability: bookabilityFacts({
        doctor: {
          bacSiId: '6',
          khaDung: true,
          chiNhanhId: '1',
          dichVuKhamId: '7',
        },
      }),
    });
    await expect(create()).resolves.toMatchObject({
      kind: 'Rejected',
      failure: { kind: 'Rule', code: CODES.OTHER_DOCTOR_SLOT },
    });
    expect(withBookingTransaction).not.toHaveBeenCalled();
    expect(lockRequestCreation).not.toHaveBeenCalled();
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(reader.read.mock.calls[0]?.[0]).toBe(DB_MANAGER);
    expect(reader.read.mock.calls[0]?.[2]).toBe('none');
    expect(repository.insert).not.toHaveBeenCalled();
    // Không `tx:mở`, không `lock`: cấu hình, đọc thường (locate ghi đè bằng mockResolvedValue nên không vào `events`), rồi đọc thường để chọn lỗi
    expect(reader.locate).toHaveBeenCalledTimes(1);
    expect(hoisted.events).toStrictEqual(['config', 'read:none']);
  });

  it('khung giờ mong muốn TRÙNG khung giờ cũ ⇒ KHUNG_GIO_TRUNG_LICH_CU, không khoá', async () => {
    reader.locate.mockResolvedValue({ ...LOCATED, khungGioCuId: TARGET_SLOT });
    early({
      source: rescheduleSource({ soLanTuDoiLich: 2, khungGioId: TARGET_SLOT }),
    });
    await expect(create()).resolves.toMatchObject({
      failure: { code: CODES.SAME_AS_CURRENT_SLOT },
    });
    expect(lockRequestCreation).not.toHaveBeenCalled();
  });

  it('khung giờ mong muốn KHÔNG TỒN TẠI ⇒ SlotNotFound, không khoá', async () => {
    reader.locate.mockResolvedValue({
      ...LOCATED,
      bacSiCuaKhungGioMoiId: null,
    });
    early({ bookability: null });
    await expect(create()).resolves.toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'SlotNotFound' },
    });
    expect(lockRequestCreation).not.toHaveBeenCalled();
  });

  it('thứ tự lỗi 5.6: lịch ChoThanhToan MÀ khung giờ của bác sĩ khác ⇒ LICH_HEN_KHONG_CHO_DOI (trạng thái đứng trước khung giờ)', async () => {
    reader.locate.mockResolvedValue({
      ...LOCATED,
      bacSiCuaKhungGioMoiId: '6',
    });
    early({
      source: rescheduleSource({
        soLanTuDoiLich: 2,
        trangThai: 'ChoThanhToan',
      }),
      bookability: bookabilityFacts({
        doctor: {
          bacSiId: '6',
          khaDung: true,
          chiNhanhId: '1',
          dichVuKhamId: '7',
        },
      }),
    });
    await expect(create()).resolves.toMatchObject({
      failure: { code: CODES.NOT_RESCHEDULABLE },
    });
  });

  it('không có lịch (locate trả null) ⇒ Rejected NotFound, KHÔNG đọc thêm, KHÔNG giao dịch', async () => {
    reader.locate.mockResolvedValue(null);
    await expect(create()).resolves.toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'NotFound' },
    });
    expect(reader.read).not.toHaveBeenCalled();
    expect(withBookingTransaction).not.toHaveBeenCalled();
  });

  it('locate dùng manager của DataSource với vai TuDoi của tài khoản và khung giờ mong muốn', async () => {
    await create();
    expect(reader.locate).toHaveBeenCalledWith(DB_MANAGER, {
      actor: { via: 'TuDoi', accountId: OWNER_ID },
      maLichHen: MA_LICH_HEN,
      khungGioMoiId: TARGET_SLOT,
    });
  });
});

describe('XDL-21 lỗi sau lần ghi đầu tiên: ném nguyên, không nuốt', () => {
  it('thông báo ném ⇒ lỗi đi ra NGUYÊN (giao dịch thật hoàn tác trọn: ca int XDL-21); INSERT đã chạy TRƯỚC nên hoàn tác là việc của giao dịch', async () => {
    const failure = new Error('ghi thông báo hỏng');
    notifier.notifyCall.throwsOnce(failure);
    await expect(create()).rejects.toBe(failure);
    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(hoisted.events).not.toContain('tx:đóng');
  });

  it('INSERT ném ⇒ lỗi đi ra nguyên, thông báo KHÔNG được gọi', async () => {
    const failure = new Error('INSERT hỏng');
    repository.insert.mockRejectedValue(failure);
    await expect(create()).rejects.toBe(failure);
    expect(notifier.notifyCall.count).toBe(0);
  });

  it('khoá ném (1213 ở tầng dưới) ⇒ lỗi đi ra nguyên, không đọc, không ghi', async () => {
    const failure = new Error('khoá hỏng');
    vi.mocked(lockRequestCreation).mockRejectedValue(failure);
    await expect(create()).rejects.toBe(failure);
    expect(reader.read).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });
});

describe('XDL-30 khoá thiếu hàng, cấu hình, dữ liệu vào sai', () => {
  it.each([
    ['khung_gio', { kind: 'SlotNotFound' }],
    ['lich_hen', { kind: 'NotFound' }],
    ['benh_nhan', { kind: 'NotFound' }],
    ['ho_so_nguoi_than', { kind: 'NotFound' }],
    ['bac_si', { kind: 'NotFound' }],
  ])(
    'thiếu hàng %s dưới khoá ⇒ Rejected %j, không đọc lại, không ghi',
    async (table, failure) => {
      vi.mocked(lockRequestCreation).mockResolvedValue({
        kind: 'Missing',
        table,
      } as unknown as Awaited<ReturnType<typeof lockRequestCreation>>);
      await expect(create()).resolves.toStrictEqual({
        kind: 'Rejected',
        failure,
      });
      expect(reader.read).not.toHaveBeenCalled();
      expect(repository.insert).not.toHaveBeenCalled();
      expect(notifier.notifyCall.count).toBe(0);
    },
  );

  it('thiếu cấu hình ⇒ lỗi 409 của reader lan ra NGUYÊN, chưa đọc lịch nào', async () => {
    const failure = new AppException(409, 'HE_THONG_CHUA_CAU_HINH');
    reader.config.mockRejectedValue(failure);
    await expect(create()).rejects.toBe(failure);
    expect(reader.locate).not.toHaveBeenCalled();
    expect(withBookingTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['rỗng', ''],
    ['chỉ khoảng trắng', ' \t\n '],
    ['4 ký tự', 'abcd'],
    ['501 ký tự', 'a'.repeat(501)],
    ['có tab', 'cần\tđổi lịch'],
  ])(
    'lý do %s ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm lỗi trường lyDoYeuCau, TRƯỚC khi đọc bất cứ gì',
    async (_name, lyDoYeuCau) => {
      const error: unknown = await create({ lyDoYeuCau }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(400);
      expect((error as AppException).getResponse()).toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        loi: [{ truong: 'lyDoYeuCau', ma: 'LY_DO_YEU_CAU_KHONG_HOP_LE' }],
      });
      expect(reader.config).not.toHaveBeenCalled();
      expect(reader.locate).not.toHaveBeenCalled();
      expect(hoisted.events).toStrictEqual([]);
    },
  );

  it('lý do biên 5 và 500 ký tự được chấp nhận và INSERT nhận đúng chuỗi', async () => {
    await create({ lyDoYeuCau: 'abcde' });
    await create({ lyDoYeuCau: 'b'.repeat(500) });
    const reasons = repository.insert.mock.calls.map(
      (call) => (call[1] as { lyDoYeuCau: string }).lyDoYeuCau,
    );
    expect(reasons).toStrictEqual(['abcde', 'b'.repeat(500)]);
  });
});
