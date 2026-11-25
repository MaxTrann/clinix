import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { vi, type Mock } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import {
  BOOKING_ERROR_CODES,
  RESCHEDULE_NOTIFICATION_EVENTS,
} from '../appointments.constants.js';
import { MAX_CODE_ATTEMPTS } from '../create/create-appointment.service.js';
import type { InsertLichHenOutcome } from '../create/lich-hen-insert.query.js';
import type { SlotHoldService } from '../slots/slot-hold.service.js';
import type { LockedSlot } from '../slots/slot-lock.js';
import type { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import type { LockedAppointment } from '../state/cancel-appointment.query.js';
import { FACTS_SLOT_START } from '../testing/bookability-facts.js';
import {
  FakeAppointmentNotifier,
  FakeWaitlistPort,
} from '../testing/fake-ports.js';
import {
  OLD_APPOINTMENT_CODE,
  OWNER_ID,
  rescheduleSource,
  reschedulabilityFacts,
} from '../testing/reschedulability-facts.js';
import { AppointmentRescheduleService } from './appointment-reschedule.service.js';
import type {
  LockedRescheduleRequest,
  RescheduleChainLocks,
} from './reschedule-locks.js';
import type { RescheduleReader } from './reschedule.reader.js';
import type {
  RescheduleAfterWrite,
  RescheduleInput,
  RescheduleOutcome,
  RescheduleWritten,
} from './reschedule.types.js';

// reschedule B4 — AppointmentRescheduleService với MỌI phụ thuộc GIẢ và `withBookingTransaction` giả (không DB): thứ tự các bước (DLH-38), chọn nhánh `OverQuota` TRƯỚC mọi khoá và biên `toiDa` (DLH-24), ba từ chối
// không khoá, sao chép và bộ đếm (DLH-25), sinh lại mã (DLH-31), ánh xạ lỗi sau ghi (HDL-08 phần B4), sự kiện thông báo đúng hợp đồng B3 (DLH-37 phần đơn vị), điểm cắm `afterWrite` (HDL-17, HDL-18 phần đơn vị),
// `onSlotReleased` sau commit (DLH-13, DLH-35, DLH-36) và thân chạy lại (HDL-23). SQL, khoá và hoàn tác thật trên MySQL: appointment-reschedule.service.int-spec.ts.
const hoisted = vi.hoisted(() => ({
  manager: { id: 'manager-cua-mot-giao-dich' },
  events: [] as string[],
  /** Số lần thân bị chạy lại giả lập (1 = chạy một lần) */
  runs: 1,
}));
vi.mock('../locking/booking-transaction.js', () => ({
  withBookingTransaction: vi.fn(
    async (_db: unknown, work: (manager: unknown) => Promise<unknown>) => {
      hoisted.events.push('tx:mở');
      let result: unknown;
      // Giả lập `withBookingTransaction` chạy lại thân từ đầu sau 1213/1205: chỉ kết quả của lần CUỐI được dùng
      for (let run = 0; run < hoisted.runs; run += 1)
        result = await work(hoisted.manager);
      hoisted.events.push('tx:đóng');
      return result;
    },
  ),
}));
vi.mock('./reschedule-locks.js', () => ({ lockRescheduleChain: vi.fn() }));
vi.mock('../create/lich-hen-insert.query.js', () => ({
  insertLichHen: vi.fn(),
}));
vi.mock('./reschedule-write.query.js', () => ({
  readQuotaFacts: vi.fn(),
  readCopiedColumns: vi.fn(),
  readSlotTime: vi.fn(),
}));
import { insertLichHen } from '../create/lich-hen-insert.query.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { lockRescheduleChain } from './reschedule-locks.js';
import {
  readCopiedColumns,
  readQuotaFacts,
  readSlotTime,
} from './reschedule-write.query.js';

const THUONG = { id: 'manager-doc-thuong' };
const DB = { manager: THUONG } as unknown as DataSource;
const NOW_RAW = '2026-11-02T01:00:00.789Z';
const SLOT_CU = '11';
const SLOT_MOI = '10';

const lockedSlot = (khungGioId: string, ngayGio: Date): LockedSlot =>
  ({
    khungGioId,
    lichLamViecId: '3',
    ngayGio,
    trangThai: 'ConTrong',
    giuChoDen: null,
  }) as unknown as LockedSlot;
const SLOT_CU_LOCKED = lockedSlot(
  SLOT_CU,
  new Date('2026-11-09T08:00:00+07:00'),
);
const SLOT_MOI_LOCKED = lockedSlot(SLOT_MOI, FACTS_SLOT_START);

const CONFIG = {
  soLanTuDoiLichToiDa: 2,
  checkInSauPhut: 15,
  soLichHenToiDaMoiHoSo: 3,
};
const LOCATED = {
  lichHenId: '100',
  benhNhanId: OWNER_ID,
  hoSoNguoiThanId: null,
  bacSiId: '5',
  khungGioCuId: SLOT_CU,
  bacSiCuaKhungGioMoiId: '5',
};
const COPIED = {
  giaSnapshot: '200000.00',
  tienCocSnapshot: '50000.00',
  chinhSachHoan: [{ so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 }],
  lyDoKham: 'Đau đầu',
};

const TU_DOI = {
  maLichHen: OLD_APPOINTMENT_CODE,
  khungGioMoiId: SLOT_MOI,
  actor: { via: 'TuDoi', accountId: OWNER_ID },
} as const satisfies RescheduleInput;

let afterWrite: Mock<RescheduleAfterWrite>;
let doiHo: RescheduleInput;
let duyet: RescheduleInput;

let reader: {
  config: ReturnType<typeof vi.fn>;
  locate: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
};
let hold: ReturnType<typeof vi.fn>;
let markBooked: ReturnType<typeof vi.fn>;
let release: ReturnType<typeof vi.fn>;
let expireLapsedHold: ReturnType<typeof vi.fn>;
let markReplaced: ReturnType<typeof vi.fn>;
let random: ReturnType<typeof vi.fn<(length: number) => string>>;
let notifier: FakeAppointmentNotifier;
let waitlist: FakeWaitlistPort;
let service: AppointmentRescheduleService;

const record = (event: string): void => {
  hoisted.events.push(event);
};

/** Cuộc đọc dưới khoá của `RescheduleReader`: `facts` mặc định "đổi được", ghi đè từng nhóm khoá. */
const readOf = (
  overrides: Parameters<typeof reschedulabilityFacts>[0] = {},
) => ({
  facts: reschedulabilityFacts(overrides),
  locked: SLOT_MOI_LOCKED,
});

const APPOINTMENT_LOCKED: LockedAppointment = {
  benhNhanId: OWNER_ID,
  bacSiId: '31',
  chiNhanhId: '1',
  trangThai: 'DaXacNhan',
  thoiGian: new Date('2026-11-09T08:00:00+07:00'),
  chinhSachHoan: null,
};

const locked = (
  request: LockedRescheduleRequest | null = null,
): RescheduleChainLocks => ({
  kind: 'Locked',
  slotCu: SLOT_CU_LOCKED,
  slotMoi: SLOT_MOI_LOCKED,
  appointment: APPOINTMENT_LOCKED,
  request,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW_RAW));
  hoisted.events.length = 0;
  hoisted.runs = 1;
  vi.mocked(withBookingTransaction).mockClear();
  vi.mocked(lockRescheduleChain)
    .mockReset()
    .mockImplementation(() => {
      record('khoá');
      return Promise.resolve(locked());
    });
  let nextId = 500;
  vi.mocked(insertLichHen)
    .mockReset()
    .mockImplementation((): Promise<InsertLichHenOutcome> => {
      record('insert');
      nextId += 1;
      return Promise.resolve({ kind: 'Inserted', lichHenId: String(nextId) });
    });
  vi.mocked(readQuotaFacts)
    .mockReset()
    .mockResolvedValue({
      soLanTuDoiLich: 0,
      trangThai: 'DaXacNhan',
      thoiGian: new Date('2026-11-09T08:00:00+07:00'),
    });
  vi.mocked(readCopiedColumns).mockReset().mockResolvedValue(COPIED);
  vi.mocked(readSlotTime)
    .mockReset()
    .mockResolvedValue(new Date('2026-11-10T09:00:00+07:00'));

  reader = {
    config: vi.fn().mockResolvedValue(CONFIG),
    locate: vi.fn().mockResolvedValue(LOCATED),
    read: vi.fn().mockImplementation(() => {
      record('đọc');
      return Promise.resolve(readOf());
    }),
  };
  hold = vi.fn().mockImplementation(() => {
    record('hold');
    return Promise.resolve({ kind: 'Done' });
  });
  markBooked = vi.fn().mockImplementation(() => {
    record('markBooked');
    return Promise.resolve({ kind: 'Done' });
  });
  release = vi.fn().mockImplementation(() => {
    record('release');
    return Promise.resolve({ kind: 'Done' });
  });
  expireLapsedHold = vi.fn().mockResolvedValue({ kind: 'Expired' });
  markReplaced = vi.fn().mockImplementation(() => {
    record('markReplaced');
    return Promise.resolve({ kind: 'Replaced' });
  });
  let suffix = 0;
  random = vi.fn<(length: number) => string>().mockImplementation(() => {
    suffix += 1;
    return `AAAA${String(suffix)}`;
  });
  notifier = new FakeAppointmentNotifier();
  notifier.notifyCall.onCall(() => {
    record('notify');
  });
  waitlist = new FakeWaitlistPort();
  waitlist.onSlotReleasedCall.onCall(() => {
    record('onSlotReleased');
  });
  afterWrite = vi.fn<RescheduleAfterWrite>().mockImplementation(() => {
    record('afterWrite');
    return Promise.resolve();
  });
  doiHo = {
    maLichHen: OLD_APPOINTMENT_CODE,
    khungGioMoiId: SLOT_MOI,
    actor: { via: 'DoiHo', chiNhanhId: '1' },
    lyDo: 'Bệnh nhân gọi điện xin dời',
    afterWrite,
  };
  duyet = {
    maLichHen: OLD_APPOINTMENT_CODE,
    khungGioMoiId: SLOT_MOI,
    actor: { via: 'DuyetYeuCau', chiNhanhId: null },
    yeuCauId: '900',
    ghiChu: 'Đồng ý dời',
    afterWrite,
  };

  service = new AppointmentRescheduleService(
    DB,
    reader as unknown as RescheduleReader,
    {
      hold,
      markBooked,
      release,
      expireLapsedHold,
    } as unknown as SlotHoldService,
    { markReplaced } as unknown as AppointmentTransitionService,
    notifier,
    waitlist,
    random,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const rescheduled = (outcome: RescheduleOutcome) => {
  if (outcome.kind !== 'Rescheduled')
    throw new Error(`phải Rescheduled, nhận ${JSON.stringify(outcome)}`);
  return outcome;
};

/** Hàng `insertLichHen` đầu tiên của lượt chạy. */
const firstInsertRow = () => {
  const row = vi.mocked(insertLichHen).mock.calls[0]?.[1];
  if (row === undefined) throw new Error('chưa có lần chèn nào');
  return row;
};

describe('DLH-38 thứ tự các bước của tự đổi (PLAN 5.5)', () => {
  it('khoá, đọc dưới khoá, chèn, giữ, đặt, thả khung giờ cũ, markReplaced, thông báo, ĐÓNG giao dịch, rồi mới onSlotReleased; kết quả đúng ba khoá của PLAN', async () => {
    const outcome = await service.reschedule(TU_DOI);

    expect(hoisted.events).toEqual([
      'tx:mở',
      'khoá',
      'đọc',
      'insert',
      'hold',
      'markBooked',
      'release',
      'markReplaced',
      'notify',
      'tx:đóng',
      'onSlotReleased',
    ]);
    expect(outcome).toStrictEqual({
      kind: 'Rescheduled',
      maLichHenCu: OLD_APPOINTMENT_CODE,
      maLichHenMoi: firstInsertRow().maLichHen,
      thoiGianMoi: FACTS_SLOT_START,
    });
  });

  it('MỘT mốc `now` cắt về giây cho cả luồng: hold, thoiDiemTao, release và onSlotReleased dùng cùng giá trị; `den` của hold là mốc đó (không phải hạn thanh toán)', async () => {
    await service.reschedule(TU_DOI);

    const now = new Date('2026-11-02T01:00:00.000Z');
    expect(hold).toHaveBeenCalledWith(hoisted.manager, SLOT_MOI_LOCKED, {
      den: now,
    });
    expect(firstInsertRow().thoiDiemTao).toStrictEqual(now);
    expect(markBooked).toHaveBeenCalledWith(hoisted.manager, SLOT_MOI_LOCKED);
    expect(release).toHaveBeenCalledWith(hoisted.manager, SLOT_CU_LOCKED, {
      from: 'DaDat',
      den: null,
    });
  });

  it('khoá bằng đúng các id bất biến, khung giờ ĐÍCH là khung giờ của đầu vào, và đọc dưới khoá bằng `em` của giao dịch với chế độ locked và requestReasonGiven true', async () => {
    await service.reschedule(TU_DOI);

    expect(lockRescheduleChain).toHaveBeenCalledWith(hoisted.manager, {
      benhNhanId: OWNER_ID,
      hoSoNguoiThanId: null,
      bacSiId: '5',
      lichHenId: '100',
      khungGioCuId: SLOT_CU,
      khungGioMoiId: SLOT_MOI,
    });
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(reader.read).toHaveBeenCalledWith(
      hoisted.manager,
      {
        actor: TU_DOI.actor,
        maLichHen: OLD_APPOINTMENT_CODE,
        khungGioMoiId: SLOT_MOI,
        now: new Date('2026-11-02T01:00:00.000Z'),
        config: CONFIG,
        requestReasonGiven: true,
      },
      'locked',
    );
  });
});

describe('DLH-24 OverQuota: chọn nhánh NGAY ở lần đọc thường, không khoá, không giao dịch', () => {
  const quota = (soLan: number, toiDa: number) => {
    reader.config.mockResolvedValue({ ...CONFIG, soLanTuDoiLichToiDa: toiDa });
    vi.mocked(readQuotaFacts).mockResolvedValue({
      soLanTuDoiLich: soLan,
      trangThai: 'DaXacNhan',
      thoiGian: new Date('2026-11-09T08:00:00+07:00'),
    });
  };

  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 2],
  ])(
    'số lần đã đổi %i, tối đa %i ⇒ OverQuota đúng hai số, KHÔNG mở giao dịch, KHÔNG khoá, KHÔNG ghi, KHÔNG thông báo, KHÔNG onSlotReleased',
    async (soLan, toiDa) => {
      quota(soLan, toiDa);

      const outcome = await service.reschedule(TU_DOI);

      expect(outcome).toStrictEqual({
        kind: 'OverQuota',
        soLanDaDoi: soLan,
        toiDa,
      });
      expect(withBookingTransaction).not.toHaveBeenCalled();
      expect(lockRescheduleChain).not.toHaveBeenCalled();
      expect(reader.read).not.toHaveBeenCalled();
      expect(insertLichHen).not.toHaveBeenCalled();
      expect(notifier.notifyCall.count).toBe(0);
      expect(waitlist.onSlotReleasedCall.count).toBe(0);
    },
  );

  it.each([
    [0, 1],
    [1, 2],
    [0, 3],
  ])(
    'số lần đã đổi %i, tối đa %i (còn lần) ⇒ đi tiếp vào giao dịch, không OverQuota',
    async (soLan, toiDa) => {
      quota(soLan, toiDa);

      const outcome = await service.reschedule(TU_DOI);

      expect(outcome.kind).toBe('Rescheduled');
      expect(withBookingTransaction).toHaveBeenCalledTimes(1);
    },
  );

  it('hết lần nhưng lịch KHÔNG còn DaXacNhan hoặc đã quá giờ ⇒ không nói "hết lần": đi đường thường để luật từ chối đúng mã (PLAN 5.6: trạng thái và hạn giờ đứng trước hạn mức)', async () => {
    quota(2, 2);
    vi.mocked(readQuotaFacts).mockResolvedValue({
      soLanTuDoiLich: 2,
      trangThai: 'DaHuy',
      thoiGian: new Date('2026-11-09T08:00:00+07:00'),
    });
    const huy = await service.reschedule(TU_DOI);
    vi.mocked(readQuotaFacts).mockResolvedValue({
      soLanTuDoiLich: 2,
      trangThai: 'DaXacNhan',
      thoiGian: new Date('2026-11-02T08:00:00+07:00'),
    });
    const quaGio = await service.reschedule(TU_DOI);

    expect(huy.kind).not.toBe('OverQuota');
    expect(quaGio.kind).not.toBe('OverQuota');
    expect(withBookingTransaction).toHaveBeenCalledTimes(2);
  });

  it('đổi hộ và duyệt KHÔNG BAO GIỜ OverQuota và không cả đọc bộ đếm, kể cả khi số lần đã đổi vượt tối đa', async () => {
    quota(5, 2);
    vi.mocked(lockRescheduleChain).mockResolvedValue(
      locked({
        yeuCauId: '900',
        lichHenId: '100',
        khungGioMongMuonId: SLOT_MOI,
        trangThai: 'ChoDuyet',
      }),
    );
    reader.read.mockImplementation((_em, input: { actor: unknown }) =>
      Promise.resolve(
        readOf({
          actor: input.actor as never,
          source: rescheduleSource({ soLanTuDoiLich: 5 }),
        }),
      ),
    );

    const ho = await service.reschedule(doiHo);
    const duyetOutcome = await service.reschedule(duyet);

    expect(ho.kind).toBe('Rescheduled');
    expect(duyetOutcome.kind).toBe('Rescheduled');
    expect(readQuotaFacts).not.toHaveBeenCalled();
  });

  it('chạy ĐUA: lúc đọc thường còn lần, dưới khoá lịch trở lại đổi được với số lần đã hết ⇒ OverQuota từ thân, commit rỗng, không ghi gì', async () => {
    // Dịch vụ luôn đọc với `requestReasonGiven: true` (hết lần do bước 0 quyết), nên `facts` thật mang giá trị đó
    reader.read.mockResolvedValue(
      readOf({
        source: rescheduleSource({ soLanTuDoiLich: 2 }),
        requestReasonGiven: true,
      }),
    );

    const outcome = await service.reschedule(TU_DOI);

    expect(outcome).toStrictEqual({
      kind: 'OverQuota',
      soLanDaDoi: 2,
      toiDa: 2,
    });
    expect(insertLichHen).not.toHaveBeenCalled();
    expect(hold).not.toHaveBeenCalled();
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });
});

describe('DLH-07, DLH-08 từ chối KHÔNG khoá: khung giờ đích không có, trùng cũ, của bác sĩ khác (thứ tự lỗi PLAN 5.6)', () => {
  it.each([
    ['không tồn tại', { bacSiCuaKhungGioMoiId: null }, 'SlotNotFound'],
    [
      'của bác sĩ khác',
      { bacSiCuaKhungGioMoiId: '99' },
      'KHUNG_GIO_KHAC_BAC_SI',
    ],
  ])(
    'khung giờ đích %s ⇒ để bộ luật quyết bằng đọc không khoá; không giao dịch, không khoá, không ghi',
    async (_name, located, expected) => {
      reader.locate.mockResolvedValue({ ...LOCATED, ...located });
      const failure =
        expected === 'SlotNotFound'
          ? { facts: reschedulabilityFacts({ bookability: null }) }
          : {
              facts: reschedulabilityFacts({
                bookability: {
                  ...reschedulabilityFacts().bookability!,
                  doctor: {
                    ...reschedulabilityFacts().bookability!.doctor,
                    bacSiId: '99',
                  },
                },
              }),
            };
      reader.read.mockResolvedValue(failure);

      const outcome = await service.reschedule(TU_DOI);

      expect(reader.read).toHaveBeenCalledWith(
        THUONG,
        expect.objectContaining({ khungGioMoiId: SLOT_MOI }),
        'none',
      );
      expect(outcome).toStrictEqual({
        kind: 'Rejected',
        failure:
          expected === 'SlotNotFound'
            ? { kind: 'SlotNotFound' }
            : { kind: 'Rule', code: BOOKING_ERROR_CODES.OTHER_DOCTOR_SLOT },
      });
      expect(withBookingTransaction).not.toHaveBeenCalled();
      expect(lockRescheduleChain).not.toHaveBeenCalled();
      expect(insertLichHen).not.toHaveBeenCalled();
    },
  );

  it('khung giờ đích TRÙNG khung giờ cũ ⇒ KHUNG_GIO_TRUNG_LICH_CU; nhưng lịch đã huỷ thì LICH_HEN_KHONG_CHO_DOI đứng TRƯỚC (đúng thứ tự 5.6, vì đi qua CHÍNH bộ luật)', async () => {
    const same = {
      ...TU_DOI,
      khungGioMoiId: SLOT_CU,
    } as const satisfies RescheduleInput;
    reader.read.mockResolvedValue({
      facts: reschedulabilityFacts({
        bookability: {
          ...reschedulabilityFacts().bookability!,
          slot: {
            ...reschedulabilityFacts().bookability!.slot,
            khungGioId: SLOT_CU,
          },
        },
      }),
    });
    const trung = await service.reschedule(same);
    reader.read.mockResolvedValue({
      facts: reschedulabilityFacts({
        source: rescheduleSource({ trangThai: 'DaHuy' }),
        bookability: {
          ...reschedulabilityFacts().bookability!,
          slot: {
            ...reschedulabilityFacts().bookability!.slot,
            khungGioId: SLOT_CU,
          },
        },
      }),
    });
    const huy = await service.reschedule(same);

    expect(trung).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'Rule', code: BOOKING_ERROR_CODES.SAME_AS_CURRENT_SLOT },
    });
    expect(huy).toStrictEqual({
      kind: 'Rejected',
      failure: {
        kind: 'Rule',
        code: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
        chiTiet: { trangThai: 'DaHuy' },
      },
    });
    expect(lockRescheduleChain).not.toHaveBeenCalled();
  });

  it('hai nơi đọc lệch nhau (luật lại cho đổi một khung giờ không khoá được) ⇒ ném lỗi, không đoán', async () => {
    reader.locate.mockResolvedValue({
      ...LOCATED,
      bacSiCuaKhungGioMoiId: '99',
    });

    await expect(service.reschedule(TU_DOI)).rejects.toThrow(
      'bộ luật vẫn cho đổi',
    );
  });

  it('không có lịch (hay ngoài phạm vi, của người khác) ⇒ NotFound ngay, không đọc thêm gì', async () => {
    reader.locate.mockResolvedValue(null);

    const outcome = await service.reschedule(TU_DOI);

    expect(outcome).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'NotFound' },
    });
    expect(readQuotaFacts).not.toHaveBeenCalled();
    expect(withBookingTransaction).not.toHaveBeenCalled();
  });

  it('thiếu cấu hình ⇒ AppException 409 ném NGAY (chưa có giao dịch, chưa đọc lịch)', async () => {
    reader.config.mockRejectedValue(
      new AppException(409, 'HE_THONG_CHUA_CAU_HINH'),
    );

    await expect(service.reschedule(TU_DOI)).rejects.toBeInstanceOf(
      AppException,
    );
    expect(reader.locate).not.toHaveBeenCalled();
  });
});

describe('DLH-07, DLH-08, HDL-20 từ chối dưới khoá: commit rỗng, không ghi gì', () => {
  it.each([
    ['benh_nhan', { kind: 'NotFound' }],
    ['ho_so_nguoi_than', { kind: 'NotFound' }],
    ['bac_si', { kind: 'NotFound' }],
    ['lich_hen', { kind: 'NotFound' }],
    ['khung_gio', { kind: 'SlotNotFound' }],
    ['yeu_cau_doi_lich_ngoai_chinh_sach', { kind: 'RequestNotFound' }],
  ])('thiếu hàng ở bảng %s khi khoá ⇒ Rejected %o', async (table, failure) => {
    vi.mocked(lockRescheduleChain).mockResolvedValue({
      kind: 'Missing',
      table,
    } as never);

    const outcome = await service.reschedule(TU_DOI);

    expect(outcome).toStrictEqual({ kind: 'Rejected', failure });
    expect(reader.read).not.toHaveBeenCalled();
    expect(insertLichHen).not.toHaveBeenCalled();
  });

  it('luật từ chối dưới khoá (lịch vừa bị huỷ) ⇒ Rejected có kiểu, giao dịch trả bình thường (commit rỗng), không chèn, không giữ, không thông báo', async () => {
    reader.read.mockResolvedValue(
      readOf({ source: rescheduleSource({ trangThai: 'DaHuy' }) }),
    );

    const outcome = await service.reschedule(TU_DOI);

    expect(outcome).toStrictEqual({
      kind: 'Rejected',
      failure: {
        kind: 'Rule',
        code: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
        chiTiet: { trangThai: 'DaHuy' },
      },
    });
    expect(hoisted.events).toEqual(['tx:mở', 'khoá', 'tx:đóng']);
  });

  it('duyệt: yêu cầu của LỊCH KHÁC ⇒ RequestNotFound; yêu cầu đã xử lý ⇒ RequestHandled; cả hai trước khi đọc luật', async () => {
    vi.mocked(lockRescheduleChain).mockResolvedValue(
      locked({
        yeuCauId: '900',
        lichHenId: '101',
        khungGioMongMuonId: SLOT_MOI,
        trangThai: 'ChoDuyet',
      }),
    );
    const khac = await service.reschedule(duyet);
    vi.mocked(lockRescheduleChain).mockResolvedValue(
      locked({
        yeuCauId: '900',
        lichHenId: '100',
        khungGioMongMuonId: SLOT_MOI,
        trangThai: 'DaDuyet',
      }),
    );
    const daXuLy = await service.reschedule(duyet);

    expect(khac).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'RequestNotFound' },
    });
    expect(daXuLy).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'RequestHandled' },
    });
    expect(reader.read).not.toHaveBeenCalled();
    expect(insertLichHen).not.toHaveBeenCalled();
    expect(afterWrite).not.toHaveBeenCalled();
  });
});

describe('DLH-25 bộ đếm và sao chép nguyên', () => {
  it.each([
    ['TuDoi', TU_DOI, 1],
    ['DoiHo', undefined, 1],
    ['DuyetYeuCau', undefined, 1],
  ])(
    '%s: lịch cũ đã tự đổi 1 lần, tối đa 2 ⇒ lịch mới cộng thêm CHỈ khi Bệnh nhân tự đổi',
    async (via, tuDoiInput, soLanCu) => {
      const input =
        via === 'TuDoi'
          ? (tuDoiInput as RescheduleInput)
          : via === 'DoiHo'
            ? doiHo
            : duyet;
      reader.read.mockResolvedValue(
        readOf({
          actor:
            via === 'TuDoi'
              ? { via: 'TuDoi', accountId: OWNER_ID }
              : via === 'DoiHo'
                ? { via: 'DoiHo', chiNhanhId: '1' }
                : { via: 'DuyetYeuCau', chiNhanhId: null },
          source: rescheduleSource({ soLanTuDoiLich: soLanCu }),
        }),
      );
      if (via === 'DuyetYeuCau')
        vi.mocked(lockRescheduleChain).mockResolvedValue(
          locked({
            yeuCauId: '900',
            lichHenId: '100',
            khungGioMongMuonId: SLOT_MOI,
            trangThai: 'ChoDuyet',
          }),
        );

      await service.reschedule(input);

      expect(firstInsertRow().soLanTuDoiLich).toBe(
        via === 'TuDoi' ? soLanCu + 1 : soLanCu,
      );
    },
  );

  it('hàng chèn: ba bản chụp và lý do khám SAO CHÉP nguyên, các khoá bất biến từ lịch cũ, giờ từ khung giờ MỚI, DaXacNhan, không hạn thanh toán, nối chuỗi tới lịch cũ', async () => {
    await service.reschedule(TU_DOI);

    expect(firstInsertRow()).toStrictEqual({
      maLichHen: expect.stringMatching(/^CLX-20261102-/) as string,
      khungGioId: SLOT_MOI,
      benhNhanId: OWNER_ID,
      hoSoNguoiThanId: null,
      bacSiId: '5',
      chiNhanhId: '1',
      dichVuKhamId: '7',
      thoiGian: FACTS_SLOT_START,
      giaSnapshot: COPIED.giaSnapshot,
      tienCocSnapshot: COPIED.tienCocSnapshot,
      chinhSachHoanSnapshot: COPIED.chinhSachHoan,
      trangThai: 'DaXacNhan',
      hanThanhToan: null,
      lyDoKham: COPIED.lyDoKham,
      thoiDiemTao: new Date('2026-11-02T01:00:00.000Z'),
      lichHenTruocId: '100',
      soLanTuDoiLich: 1,
    });
    expect(readCopiedColumns).toHaveBeenCalledWith(hoisted.manager, '100');
  });
});

describe('DLH-31 sinh lại mã khi 1062 trên ma_lich_hen', () => {
  const duplicateCode = (times: number) => {
    let call = 0;
    vi.mocked(insertLichHen).mockImplementation(
      (): Promise<InsertLichHenOutcome> => {
        call += 1;
        return Promise.resolve(
          call <= times
            ? { kind: 'DuplicateCode' }
            : { kind: 'Inserted', lichHenId: '777' },
        );
      },
    );
  };

  it(`bốn lần trùng rồi thành công (đúng ${String(MAX_CODE_ATTEMPTS)} lần chèn, mỗi lần một mã khác); kết quả mang mã của lần chèn thành công`, async () => {
    duplicateCode(MAX_CODE_ATTEMPTS - 1);

    const outcome = rescheduled(await service.reschedule(TU_DOI));

    const codes = vi
      .mocked(insertLichHen)
      .mock.calls.map(([, row]) => row.maLichHen);
    expect(codes).toHaveLength(MAX_CODE_ATTEMPTS);
    expect(new Set(codes).size).toBe(MAX_CODE_ATTEMPTS);
    expect(outcome.maLichHenMoi).toBe(codes[MAX_CODE_ATTEMPTS - 1]);
  });

  it('năm lần trùng liền ⇒ ném Error (không thành lỗi có kiểu), không giữ khung giờ, không markReplaced, không thông báo, không onSlotReleased', async () => {
    duplicateCode(MAX_CODE_ATTEMPTS);

    await expect(service.reschedule(TU_DOI)).rejects.toThrow(
      /không sinh được mã/,
    );

    expect(insertLichHen).toHaveBeenCalledTimes(MAX_CODE_ATTEMPTS);
    expect(hold).not.toHaveBeenCalled();
    expect(markReplaced).not.toHaveBeenCalled();
    expect(notifier.notifyCall.count).toBe(0);
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });
});

describe('DLH-30 hết hạn lười khung giờ mới', () => {
  it('luật báo khung giờ đích `DangGiuCho` đã quá hạn ⇒ freeLapsedHold TRƯỚC khi chèn; chưa quá hạn (StillHeld) ⇒ KHUNG_GIO_DANG_GIU, không chèn', async () => {
    reader.read.mockResolvedValue({
      facts: reschedulabilityFacts({
        bookability: {
          ...reschedulabilityFacts().bookability!,
          slot: {
            ...reschedulabilityFacts().bookability!.slot,
            trangThai: 'DangGiuCho',
            giuChoDen: new Date('2026-11-02T07:55:00+07:00'),
          },
          slotHolder: { maLichHen: 'CLX-20261102-HOLD1', lichHenId: '55' },
        } as never,
      }),
      locked: SLOT_MOI_LOCKED,
    });
    expireLapsedHold.mockImplementation(() => {
      record('hết hạn lười');
      return Promise.resolve({ kind: 'Expired', lichHenId: '55' });
    });

    const free = await service.reschedule(TU_DOI);

    expect(free.kind).toBe('Rescheduled');
    expect(hoisted.events.indexOf('hết hạn lười')).toBeLessThan(
      hoisted.events.indexOf('insert'),
    );
    expect(expireLapsedHold).toHaveBeenCalledWith(
      hoisted.manager,
      SLOT_MOI_LOCKED,
      { now: new Date('2026-11-02T01:00:00.000Z') },
    );

    hoisted.events.length = 0;
    vi.mocked(insertLichHen).mockClear();
    expireLapsedHold.mockResolvedValue({ kind: 'NotLapsed' });

    const held = await service.reschedule(TU_DOI);

    expect(held).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'Rule', code: BOOKING_ERROR_CODES.SLOT_HELD },
    });
    expect(insertLichHen).not.toHaveBeenCalled();
  });

  it('khung giờ trống (luật không báo lapsedHold) ⇒ KHÔNG gọi expireLapsedHold', async () => {
    await service.reschedule(TU_DOI);

    expect(expireLapsedHold).not.toHaveBeenCalled();
  });
});

describe('HDL-08 (B4), DLH-12 lỗi SAU lần ghi: hoàn tác trọn rồi đổi sang kết quả có kiểu', () => {
  it('DuplicateSlot ⇒ Rejected KHUNG_GIO_DA_DAT; không giữ khung giờ, không markReplaced, không thông báo, không onSlotReleased', async () => {
    vi.mocked(insertLichHen).mockResolvedValue({ kind: 'DuplicateSlot' });

    const outcome = await service.reschedule(TU_DOI);

    expect(outcome).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'Rule', code: BOOKING_ERROR_CODES.SLOT_BOOKED },
    });
    expect(hold).not.toHaveBeenCalled();
    expect(notifier.notifyCall.count).toBe(0);
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('DuplicateChain: Bệnh nhân tự đổi ⇒ NotFound (không thấy DaDoiLich, Q31); đổi hộ và duyệt ⇒ LICH_HEN_KHONG_CHO_DOI kèm trangThai DaDoiLich', async () => {
    vi.mocked(insertLichHen).mockResolvedValue({ kind: 'DuplicateChain' });
    reader.read.mockImplementation((_em, input: { actor: { via: string } }) =>
      Promise.resolve(
        readOf({
          actor: input.actor as never,
        }),
      ),
    );

    // `resolves`: một lỗi ném thô (500) phải thành khẳng định đỏ "promise rejected", không phải lỗi của chính ca
    await expect(service.reschedule(TU_DOI)).resolves.toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'NotFound' },
    });
    await expect(service.reschedule(doiHo)).resolves.toStrictEqual({
      kind: 'Rejected',
      failure: {
        kind: 'Rule',
        code: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
        chiTiet: { trangThai: 'DaDoiLich' },
      },
    });
  });

  it('markReplaced InvalidState (lưới an toàn) ⇒ Rejected LICH_HEN_KHONG_CHO_DOI; afterWrite và thông báo KHÔNG chạy; onSlotReleased không gọi', async () => {
    markReplaced.mockResolvedValue({ kind: 'InvalidState' });

    const outcome = await service.reschedule(doiHo);

    expect(outcome).toStrictEqual({
      kind: 'Rejected',
      failure: { kind: 'Rule', code: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE },
    });
    expect(afterWrite).not.toHaveBeenCalled();
    expect(notifier.notifyCall.count).toBe(0);
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it.each([
    ['hold', () => hold.mockResolvedValue({ kind: 'Stale' }), /hold/],
    [
      'markBooked',
      () => markBooked.mockResolvedValue({ kind: 'Stale' }),
      /markBooked/,
    ],
    [
      'release',
      () => release.mockResolvedValue({ kind: 'Stale' }),
      /khung giờ cũ/,
    ],
  ])(
    '%s không Done dưới khoá ⇒ NÉM Error (dữ liệu lệch, hoàn tác trọn, không thành kết quả có kiểu); không thông báo, không onSlotReleased',
    async (_step, script, message) => {
      script();

      await expect(service.reschedule(TU_DOI)).rejects.toThrow(message);

      expect(markReplaced).not.toHaveBeenCalled();
      expect(notifier.notifyCall.count).toBe(0);
      expect(waitlist.onSlotReleasedCall.count).toBe(0);
    },
  );

  it('thông báo ném ⇒ lỗi đi nguyên ra ngoài (hoàn tác trọn); không onSlotReleased', async () => {
    notifier.notifyCall.throwsOnce(new Error('ghi thông báo lỗi'));

    await expect(service.reschedule(TU_DOI)).rejects.toThrow(
      'ghi thông báo lỗi',
    );

    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });
});

describe('DLH-37 sự kiện thông báo đúng hợp đồng B3', () => {
  it('tự đổi: LichHenDaDoiLich gắn lịch MỚI, người nhận là tài khoản ĐẶT, via TuDoi, không có lyDo', async () => {
    const outcome = rescheduled(await service.reschedule(TU_DOI));

    expect(notifier.events).toStrictEqual([
      {
        loaiSuKien: RESCHEDULE_NOTIFICATION_EVENTS.RESCHEDULED,
        lichHenId: '501',
        taiKhoanId: OWNER_ID,
        doiLich: {
          maLichHenCu: OLD_APPOINTMENT_CODE,
          thoiGianCu: new Date('2026-11-09T08:00:00+07:00'),
          thoiGianMoi: FACTS_SLOT_START,
          via: 'TuDoi',
        },
      },
    ]);
    expect(outcome.thoiGianMoi).toStrictEqual(FACTS_SLOT_START);
  });

  it('đổi hộ: cùng sự kiện, via DoiHo kèm lyDo; người nhận vẫn là tài khoản ĐẶT (không phải người thao tác)', async () => {
    reader.read.mockResolvedValue(
      readOf({ actor: { via: 'DoiHo', chiNhanhId: '1' } }),
    );

    await service.reschedule(doiHo);

    expect(notifier.events).toHaveLength(1);
    expect(notifier.events[0]).toMatchObject({
      loaiSuKien: RESCHEDULE_NOTIFICATION_EVENTS.RESCHEDULED,
      taiKhoanId: OWNER_ID,
      doiLich: { via: 'DoiHo', lyDo: 'Bệnh nhân gọi điện xin dời' },
    });
  });

  it('duyệt: CHỈ YeuCauDoiLichDaDuyet, gắn yêu cầu, lichHenId là lịch CŨ; giờ mong muốn lấy từ khung giờ của yêu cầu khi khác khung giờ đích; không LichHenDaDoiLich', async () => {
    reader.read.mockResolvedValue(
      readOf({ actor: { via: 'DuyetYeuCau', chiNhanhId: null } }),
    );
    vi.mocked(lockRescheduleChain).mockResolvedValue(
      locked({
        yeuCauId: '900',
        lichHenId: '100',
        khungGioMongMuonId: '42',
        trangThai: 'ChoDuyet',
      }),
    );

    await service.reschedule(duyet);

    expect(readSlotTime).toHaveBeenCalledWith(hoisted.manager, '42');
    expect(notifier.events).toStrictEqual([
      {
        loaiSuKien: RESCHEDULE_NOTIFICATION_EVENTS.REQUEST_APPROVED,
        lichHenId: '100',
        taiKhoanId: OWNER_ID,
        yeuCau: {
          yeuCauId: '900',
          ghiChu: 'Đồng ý dời',
          maLichHenMoi: expect.any(String) as string,
          thoiGianMongMuon: new Date('2026-11-10T09:00:00+07:00'),
          thoiGianMoi: FACTS_SLOT_START,
        },
      },
    ]);
  });

  it('duyệt đúng khung giờ mong muốn: dùng giờ của khung giờ đích đã khoá, KHÔNG đọc thêm', async () => {
    reader.read.mockResolvedValue(
      readOf({ actor: { via: 'DuyetYeuCau', chiNhanhId: null } }),
    );
    vi.mocked(lockRescheduleChain).mockResolvedValue(
      locked({
        yeuCauId: '900',
        lichHenId: '100',
        khungGioMongMuonId: SLOT_MOI,
        trangThai: 'ChoDuyet',
      }),
    );

    await service.reschedule(duyet);

    expect(readSlotTime).not.toHaveBeenCalled();
    expect(notifier.events[0]).toMatchObject({
      yeuCau: { thoiGianMongMuon: FACTS_SLOT_START },
    });
  });
});

describe('HDL-17, HDL-18 điểm cắm afterWrite', () => {
  it('đổi hộ và duyệt: chạy SAU markReplaced, TRƯỚC thông báo, bằng `em` của giao dịch, nhận `written` đủ id, mã, giờ, chi nhánh', async () => {
    reader.read.mockResolvedValue(
      readOf({ actor: { via: 'DoiHo', chiNhanhId: '1' } }),
    );

    await service.reschedule(doiHo);

    const events = hoisted.events;
    expect(events.indexOf('markReplaced')).toBeLessThan(
      events.indexOf('afterWrite'),
    );
    expect(events.indexOf('afterWrite')).toBeLessThan(events.indexOf('notify'));
    const written: RescheduleWritten = {
      lichHenCuId: '100',
      lichHenMoiId: '501',
      maLichHenCu: OLD_APPOINTMENT_CODE,
      maLichHenMoi: vi.mocked(insertLichHen).mock.calls[0]![1].maLichHen,
      khungGioCuId: '11',
      khungGioMoiId: SLOT_MOI,
      chiNhanhId: '1',
      thoiGianCu: new Date('2026-11-09T08:00:00+07:00'),
      thoiGianMoi: FACTS_SLOT_START,
    };
    expect(afterWrite).toHaveBeenCalledTimes(1);
    expect(afterWrite).toHaveBeenCalledWith(hoisted.manager, written);
  });

  it('tự đổi không có điểm cắm: không gọi gì thêm', async () => {
    await service.reschedule(TU_DOI);

    expect(afterWrite).not.toHaveBeenCalled();
  });

  it('afterWrite ném ⇒ lỗi đi nguyên ra ngoài (hoàn tác trọn): KHÔNG thông báo, KHÔNG onSlotReleased', async () => {
    afterWrite.mockRejectedValue(new Error('ghi audit lỗi'));
    reader.read.mockResolvedValue(
      readOf({ actor: { via: 'DoiHo', chiNhanhId: '1' } }),
    );

    await expect(service.reschedule(doiHo)).rejects.toThrow('ghi audit lỗi');

    expect(notifier.notifyCall.count).toBe(0);
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });
});

describe('DLH-13, DLH-35, DLH-36 onSlotReleased sau commit', () => {
  it('gọi đúng MỘT lần với khung giờ CŨ, sau khi giao dịch đã đóng', async () => {
    await service.reschedule(TU_DOI);

    expect(waitlist.releasedSlotIds).toEqual([SLOT_CU]);
    expect(hoisted.events.at(-1)).toBe('onSlotReleased');
    expect(hoisted.events.indexOf('tx:đóng')).toBeLessThan(
      hoisted.events.indexOf('onSlotReleased'),
    );
  });

  it('đổi hộ trong khoảng tiếp đón (giờ cũ ≤ now): vẫn đổi được nhưng KHÔNG mời danh sách chờ', async () => {
    reader.read.mockResolvedValue(
      readOf({
        actor: { via: 'DoiHo', chiNhanhId: '1' },
        source: rescheduleSource({
          thoiGian: new Date('2026-11-02T07:50:00+07:00'),
        }),
      }),
    );

    const outcome = await service.reschedule(doiHo);

    expect(outcome.kind).toBe('Rescheduled');
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it.each([
    [
      'từ chối của luật',
      () =>
        reader.read.mockResolvedValue(
          readOf({ source: rescheduleSource({ trangThai: 'DaHuy' }) }),
        ),
    ],
    [
      'DuplicateSlot',
      () =>
        vi.mocked(insertLichHen).mockResolvedValue({ kind: 'DuplicateSlot' }),
    ],
    [
      'markReplaced InvalidState',
      () => markReplaced.mockResolvedValue({ kind: 'InvalidState' }),
    ],
  ])('%s ⇒ KHÔNG gọi onSlotReleased', async (_name, script) => {
    script();

    await service.reschedule(TU_DOI);

    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('cổng ném ⇒ vẫn Rescheduled; log CHỈ có id nội bộ và TÊN lớp lỗi (không message, không mã lịch hẹn)', async () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    waitlist.onSlotReleasedCall.throwsOnce(
      new TypeError('chi tiết riêng tư của cổng: Nguyễn Văn A'),
    );

    const outcome = await service.reschedule(TU_DOI);

    expect(outcome.kind).toBe('Rescheduled');
    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0]?.[0]);
    expect(line).toContain(SLOT_CU);
    expect(line).toContain('TypeError');
    expect(line).not.toContain('Nguyễn');
    expect(line).not.toContain('chi tiết riêng tư');
    expect(line).not.toContain(OLD_APPOINTMENT_CODE);
  });
});

describe('HDL-23 thân chạy lại sau 1213/1205', () => {
  it('thân chạy hai lần: lần nào cũng cùng `now`, kết quả của lần cuối, onSlotReleased đúng MỘT lần (sau cả hai lần chạy)', async () => {
    hoisted.runs = 2;

    const outcome = await service.reschedule(TU_DOI);

    expect(outcome.kind).toBe('Rescheduled');
    expect(insertLichHen).toHaveBeenCalledTimes(2);
    const nows = vi
      .mocked(insertLichHen)
      .mock.calls.map(([, row]) => row.thoiDiemTao.getTime());
    expect(new Set(nows).size).toBe(1);
    expect(waitlist.onSlotReleasedCall.count).toBe(1);
    expect(hoisted.events.filter((e) => e === 'tx:mở')).toHaveLength(1);
  });
});
