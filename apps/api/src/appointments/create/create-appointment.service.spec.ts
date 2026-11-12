import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import type { BookabilityRead } from '../slots/bookability.reader.js';
import type { BookabilityReader } from '../slots/bookability.reader.js';
import type { SlotHoldService } from '../slots/slot-hold.service.js';
import type { LockedSlot } from '../slots/slot-lock.js';
import { bookabilityFacts } from '../testing/bookability-facts.js';
import {
  FakeAppointmentNotifier,
  FakePaymentPort,
} from '../testing/fake-ports.js';
import type { BookingSummaryReader } from './booking-summary.reader.js';
import {
  CreateAppointmentService,
  MAX_CODE_ATTEMPTS,
} from './create-appointment.service.js';
import type { InsertLichHenOutcome } from './lich-hen-insert.query.js';

// Task B8 — CreateAppointmentService với MỌI phụ thuộc GIẢ và `withBookingTransaction` giả (không DB): thứ tự các bước, MỘT mốc `now`, ánh xạ từ chối sang lỗi API, đường cọc > 0 và cọc 0đ, sinh lại mã
// khi 1062, hoàn tác trọn khi lỗi sau lần ghi, cổng chạy TRONG giao dịch với `em` của giao dịch (TAO-04, TAO-09, TAO-10 phần đơn vị, DL-01, DL-02, DL-03, DL-04, DL-13, DL-14, DL-22, DL-26, DL-27, DL-28 mức
// đơn vị; TRACKING booking 3.21 B8-C). SQL, khoá và hoàn tác thật trên MySQL: create-appointment.service.int-spec.ts. Mã TAO-nn là [đề xuất].
const hoisted = vi.hoisted(() => ({
  manager: { id: 'manager-cua-mot-giao-dich' },
  events: [] as string[],
  txThrew: false,
  /** Số lần thân bị chạy lại giả lập (1 = chạy một lần) */
  runs: 1,
}));
vi.mock('../locking/booking-transaction.js', () => ({
  withBookingTransaction: vi.fn(
    async (_db: unknown, work: (manager: unknown) => Promise<unknown>) => {
      hoisted.events.push('tx:mở');
      try {
        let result: unknown;
        // Giả lập `withBookingTransaction` chạy lại thân từ đầu sau 1213/1205: chỉ kết quả của lần CUỐI được dùng
        for (let run = 0; run < hoisted.runs; run += 1)
          result = await work(hoisted.manager);
        hoisted.events.push('tx:đóng');
        return result;
      } catch (error) {
        hoisted.txThrew = true;
        throw error;
      }
    },
  ),
}));
vi.mock('../visit-profile.query.js', () => ({ lockVisitProfile: vi.fn() }));
vi.mock('./lich-hen-insert.query.js', () => ({ insertLichHen: vi.fn() }));
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { lockVisitProfile } from '../visit-profile.query.js';
import { insertLichHen } from './lich-hen-insert.query.js';

const DB = { id: 'datasource' } as unknown as DataSource;
const ACCOUNT = '77';
const SLOT_ID = '10';
const NOW_RAW = '2026-11-02T01:00:00.789Z';
const NOW_SECOND = new Date('2026-11-02T01:00:00.000Z');
const SLOT_START = new Date('2026-11-10T01:00:00.000Z');

const LOCKED = {
  khungGioId: SLOT_ID,
  lichLamViecId: '3',
  ngayGio: SLOT_START,
  trangThai: 'ConTrong',
  giuChoDen: null,
} as unknown as LockedSlot;

let config: { soLichHenToiDaMoiHoSo: number; thoiGianGiuCho: number };
let getOrThrow: ReturnType<typeof vi.fn>;
let readNoShowLock: ReturnType<typeof vi.fn>;
let read: ReturnType<typeof vi.fn>;
let expireLapsedHold: ReturnType<typeof vi.fn>;
let hold: ReturnType<typeof vi.fn>;
let markBooked: ReturnType<typeof vi.fn>;
let readPricing: ReturnType<typeof vi.fn>;
let random: ReturnType<typeof vi.fn<(length: number) => string>>;
let payment: FakePaymentPort;
let notifier: FakeAppointmentNotifier;
let service: CreateAppointmentService;

const ZERO_PRICE = {
  giaApDung: '150000.00',
  tienCoc: '0.00',
  chinhSachHoan: null,
};
const DEPOSIT_PRICE = {
  giaApDung: '200000.00',
  tienCoc: '50000.00',
  chinhSachHoan: [
    { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
    { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
  ],
};

const slotRead = (
  facts = bookabilityFacts({ now: NOW_SECOND }),
): BookabilityRead => ({
  kind: 'Read',
  facts,
  locked: LOCKED,
});

const input = (
  extra: Partial<{
    hoSoNguoiThanId: string | null;
    lyDoKham: string | null;
  }> = {},
) => ({
  khungGioId: SLOT_ID,
  hoSoNguoiThanId: null,
  lyDoKham: null,
  ...extra,
});

const record = (event: string): void => {
  hoisted.events.push(event);
};

beforeEach(() => {
  hoisted.events.length = 0;
  hoisted.txThrew = false;
  hoisted.runs = 1;
  vi.mocked(withBookingTransaction).mockClear();
  vi.mocked(lockVisitProfile)
    .mockReset()
    .mockImplementation(() => {
      record('hồ sơ');
      return Promise.resolve('active');
    });
  let nextId = 100;
  vi.mocked(insertLichHen)
    .mockReset()
    .mockImplementation((): Promise<InsertLichHenOutcome> => {
      record('insert');
      nextId += 1;
      return Promise.resolve({ kind: 'Inserted', lichHenId: String(nextId) });
    });
  config = { soLichHenToiDaMoiHoSo: 3, thoiGianGiuCho: 15 };
  getOrThrow = vi.fn(() => {
    record('cấu hình');
    return Promise.resolve(config);
  });
  readNoShowLock = vi.fn(() => {
    record('no-show');
    return Promise.resolve(false);
  });
  read = vi.fn(() => {
    record('khung giờ');
    return Promise.resolve(slotRead());
  });
  expireLapsedHold = vi.fn(() => {
    record('hết hạn lười');
    return Promise.resolve({ kind: 'Expired', lichHenId: '5' });
  });
  hold = vi.fn(() => {
    record('hold');
    return Promise.resolve({ kind: 'Done' });
  });
  markBooked = vi.fn(() => {
    record('markBooked');
    return Promise.resolve({ kind: 'Done' });
  });
  readPricing = vi.fn(() => {
    record('giá');
    return Promise.resolve(ZERO_PRICE);
  });
  let codeCounter = 0;
  random = vi.fn<(length: number) => string>(() => {
    codeCounter += 1;
    return `A000${String(codeCounter)}`;
  });
  payment = new FakePaymentPort();
  payment.recordZeroPaymentCall.onCall(() => record('recordZeroPayment'));
  notifier = new FakeAppointmentNotifier();
  notifier.notifyCall.onCall(() => record('notify'));
  service = new CreateAppointmentService(
    DB,
    { getOrThrow } as unknown as SystemConfigService,
    { readNoShowLock, read } as unknown as BookabilityReader,
    { expireLapsedHold, hold, markBooked } as unknown as SlotHoldService,
    { readPricing } as unknown as BookingSummaryReader,
    payment,
    notifier,
    random,
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW_RAW));
});

afterEach(() => {
  vi.useRealTimers();
});

async function failureOf(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('lẽ ra phải bị từ chối');
}
const codeOf = (error: AppException) =>
  (error.getResponse() as { maLoi: string }).maLoi;
const insertedRow = (call = 0) =>
  vi.mocked(insertLichHen).mock.calls[call]?.[1];

describe('CreateAppointmentService: cọc > 0 dừng ở ChoThanhToan (DL-02)', () => {
  beforeEach(() => {
    readPricing.mockImplementation(() => {
      record('giá');
      return Promise.resolve(DEPOSIT_PRICE);
    });
  });

  it('DL-02 trả đúng 7 khoá, ChoThanhToan, hạn = now + thoi_gian_giu_cho, canThanhToan = true, không lich_hen_id', async () => {
    const result = await service.create(ACCOUNT, input());

    expect(Object.keys(result).sort()).toStrictEqual([
      'canThanhToan',
      'giaApDung',
      'hanThanhToan',
      'maLichHen',
      'thoiGianMayChu',
      'tienCoc',
      'trangThai',
    ]);
    expect(result).toStrictEqual({
      maLichHen: expect.stringMatching(/^CLX-20261102-A0001$/) as string,
      trangThai: 'ChoThanhToan',
      hanThanhToan: '2026-11-02T01:15:00.000Z',
      giaApDung: '200000.00',
      tienCoc: '50000.00',
      canThanhToan: true,
      thoiGianMayChu: NOW_RAW,
    });
  });

  it('DL-02 hold với đúng hạn đã ghi vào lịch (INV-02: han_thanh_toan = giu_cho_den), KHÔNG markBooked, KHÔNG recordZeroPayment, KHÔNG notify', async () => {
    await service.create(ACCOUNT, input());

    const han = new Date('2026-11-02T01:15:00.000Z');
    expect(insertedRow()?.hanThanhToan).toStrictEqual(han);
    expect(hold).toHaveBeenCalledExactlyOnceWith(hoisted.manager, LOCKED, {
      den: han,
    });
    expect(markBooked).not.toHaveBeenCalled();
    expect(payment.recordZeroPaymentCall.count).toBe(0);
    expect(notifier.notifyCall.count).toBe(0);
  });

  it('DL-02, DL-21, DL-25 hàng INSERT: trạng thái, giá, snapshot đã chốt, và bác sĩ, chi nhánh, dịch vụ, giờ lấy từ facts và khung giờ (KHÔNG từ client)', async () => {
    await service.create(ACCOUNT, input({ lyDoKham: 'Đau đầu' }));

    expect(insertedRow()).toStrictEqual({
      maLichHen: 'CLX-20261102-A0001',
      khungGioId: SLOT_ID,
      benhNhanId: ACCOUNT,
      hoSoNguoiThanId: null,
      bacSiId: '5',
      chiNhanhId: '1',
      dichVuKhamId: '7',
      thoiGian: SLOT_START,
      giaSnapshot: '200000.00',
      tienCocSnapshot: '50000.00',
      chinhSachHoanSnapshot: DEPOSIT_PRICE.chinhSachHoan,
      trangThai: 'ChoThanhToan',
      hanThanhToan: new Date('2026-11-02T01:15:00.000Z'),
      lyDoKham: 'Đau đầu',
      thoiDiemTao: NOW_SECOND,
    });
  });

  it('thoi_gian_giu_cho lấy từ cấu hình (30 phút ⇒ hạn 01:30), không số cứng', async () => {
    config.thoiGianGiuCho = 30;

    const result = await service.create(ACCOUNT, input());

    expect(result.hanThanhToan).toBe('2026-11-02T01:30:00.000Z');
  });

  it('cọc nhỏ nhất "0.01" vẫn là cọc > 0 (so bằng toCents, không bằng số thực)', async () => {
    readPricing.mockResolvedValue({ ...DEPOSIT_PRICE, tienCoc: '0.01' });

    const result = await service.create(ACCOUNT, input());

    expect(result.trangThai).toBe('ChoThanhToan');
    expect(result.canThanhToan).toBe(true);
  });
});

describe('CreateAppointmentService: cọc 0đ xác nhận ngay (DL-01, câu (a) phương án A)', () => {
  it.each(['0.00', '0', '0.0'])(
    'DL-01 cọc "%s": INSERT thẳng DaXacNhan, han_thanh_toan null, hanThanhToan null, canThanhToan = false',
    async (tienCoc) => {
      readPricing.mockResolvedValue({ ...ZERO_PRICE, tienCoc });

      const result = await service.create(ACCOUNT, input());

      expect(result).toStrictEqual({
        maLichHen: 'CLX-20261102-A0001',
        trangThai: 'DaXacNhan',
        hanThanhToan: null,
        giaApDung: '150000.00',
        tienCoc,
        canThanhToan: false,
        thoiGianMayChu: NOW_RAW,
      });
      expect(insertedRow()?.trangThai).toBe('DaXacNhan');
      expect(insertedRow()?.hanThanhToan).toBeNull();
      expect(insertedRow()?.chinhSachHoanSnapshot).toBeNull();
    },
  );

  it('DL-01 khung giờ: hold rồi markBooked với CÙNG khoá đã giữ (hai UPDATE khung_gio có sẵn, không phương thức mới)', async () => {
    await service.create(ACCOUNT, input());

    expect(hold).toHaveBeenCalledExactlyOnceWith(hoisted.manager, LOCKED, {
      den: new Date('2026-11-02T01:15:00.000Z'),
    });
    expect(markBooked).toHaveBeenCalledExactlyOnceWith(hoisted.manager, LOCKED);
  });

  it('DL-01, DL-27 cổng chạy TRONG giao dịch với em của giao dịch: recordZeroPayment rồi notify, đúng một lần, đúng tham số và đúng sự kiện', async () => {
    await service.create(ACCOUNT, input());

    expect(payment.recordZeroPaymentCall.calls).toStrictEqual([
      [hoisted.manager, { lichHenId: '101', benhNhanId: ACCOUNT }],
    ]);
    expect(notifier.notifyCall.calls).toStrictEqual([
      [
        hoisted.manager,
        {
          loaiSuKien: 'LichHenDaXacNhan',
          lichHenId: '101',
          taiKhoanId: ACCOUNT,
        },
      ],
    ]);
  });

  it('TAO-04 thứ tự: cấu hình (ngoài giao dịch) → mở giao dịch → no-show → hồ sơ → khung giờ → giá → insert → hold → markBooked → recordZeroPayment → notify → đóng giao dịch', async () => {
    await service.create(ACCOUNT, input());

    expect(hoisted.events).toStrictEqual([
      'cấu hình',
      'tx:mở',
      'no-show',
      'hồ sơ',
      'khung giờ',
      'giá',
      'insert',
      'hold',
      'markBooked',
      'recordZeroPayment',
      'notify',
      'tx:đóng',
    ]);
  });

  it('DL-27 recordZeroPayment ném ⇒ cả giao dịch hoàn tác (txThrew), notify KHÔNG chạy, lỗi đi nguyên ra', async () => {
    const boom = new Error('payment hỏng');
    payment.recordZeroPaymentCall.throwsOnce(boom);

    await expect(service.create(ACCOUNT, input())).rejects.toBe(boom);

    expect(hoisted.txThrew).toBe(true);
    expect(notifier.notifyCall.count).toBe(0);
  });

  it('DL-27 notify ném ⇒ cả giao dịch hoàn tác (txThrew), lỗi đi nguyên ra (không thành AppException, không commit lịch mồ côi)', async () => {
    const boom = new Error('thông báo hỏng');
    notifier.notifyCall.throwsOnce(boom);

    await expect(service.create(ACCOUNT, input())).rejects.toBe(boom);

    expect(hoisted.txThrew).toBe(true);
    expect(hoisted.events).not.toContain('tx:đóng');
  });

  it('DL-27 markBooked không Done dưới khoá (bất biến vỡ) ⇒ ném để hoàn tác cả INSERT, không gọi cổng', async () => {
    markBooked.mockResolvedValue({ kind: 'Stale' });

    await expect(service.create(ACCOUNT, input())).rejects.toThrow(
      /markBooked/,
    );

    expect(hoisted.txThrew).toBe(true);
    expect(payment.recordZeroPaymentCall.count).toBe(0);
    expect(notifier.notifyCall.count).toBe(0);
  });
});

describe('CreateAppointmentService: MỘT mốc now cắt mili giây (H8, M4, TAO-09)', () => {
  it('now = toSecond(nowVN()): ghi vào thoi_diem_tao, han_thanh_toan, và đưa cho read, expireLapsedHold; thoiGianMayChu giữ mili giây', async () => {
    readPricing.mockResolvedValue({ ...DEPOSIT_PRICE });
    const facts = bookabilityFacts({
      now: NOW_SECOND,
      slot: {
        khungGioId: SLOT_ID,
        ngayGio: SLOT_START,
        trangThai: 'DangGiuCho',
        giuChoDen: new Date('2026-11-02T00:59:00.000Z'),
      },
      slotHolder: { lichHenId: '5', maLichHen: 'CLX-20261101-OLD01' },
    });
    read.mockResolvedValue(slotRead(facts));

    const result = await service.create(ACCOUNT, input());

    expect(read.mock.calls[0]?.[1]).toMatchObject({ now: NOW_SECOND });
    expect(expireLapsedHold.mock.calls[0]?.[2]).toStrictEqual({
      now: NOW_SECOND,
    });
    expect(insertedRow()?.thoiDiemTao.getTime()).toBe(NOW_SECOND.getTime());
    expect(insertedRow()?.hanThanhToan?.getTime()).toBe(
      NOW_SECOND.getTime() + 15 * 60_000,
    );
    expect(result.thoiGianMayChu).toBe(NOW_RAW);
  });

  it('TAO-10 thân chạy lại (1213/1205): MỖI lần chạy sinh mã MỚI trong thân và dùng CÙNG now; kết quả là của lần cuối', async () => {
    hoisted.runs = 2;

    const result = await service.create(ACCOUNT, input());

    expect(vi.mocked(insertLichHen)).toHaveBeenCalledTimes(2);
    expect(insertedRow(0)?.maLichHen).toBe('CLX-20261102-A0001');
    expect(insertedRow(1)?.maLichHen).toBe('CLX-20261102-A0002');
    expect(insertedRow(0)?.thoiDiemTao).toStrictEqual(
      insertedRow(1)?.thoiDiemTao,
    );
    expect(result.maLichHen).toBe('CLX-20261102-A0002');
    // cấu hình đọc MỘT lần ngoài giao dịch, không đọc lại theo lần chạy
    expect(getOrThrow).toHaveBeenCalledTimes(1);
  });
});

describe('CreateAppointmentService: từ chối trước lần ghi đầu tiên (DL-03, DL-04, DL-11…DL-14)', () => {
  const noWrites = () => {
    expect(vi.mocked(insertLichHen)).not.toHaveBeenCalled();
    expect(hold).not.toHaveBeenCalled();
    expect(markBooked).not.toHaveBeenCalled();
    expect(expireLapsedHold).not.toHaveBeenCalled();
    expect(readPricing).not.toHaveBeenCalled();
    expect(payment.recordZeroPaymentCall.count).toBe(0);
    expect(notifier.notifyCall.count).toBe(0);
  };

  it('không có hàng benh_nhan ⇒ 403 KHONG_DU_QUYEN; chưa khoá hồ sơ, chưa đọc khung giờ', async () => {
    readNoShowLock.mockResolvedValue(null);

    const error = await failureOf(service.create(ACCOUNT, input()));

    expect(error.getStatus()).toBe(403);
    expect(codeOf(error)).toBe('KHONG_DU_QUYEN');
    expect(vi.mocked(lockVisitProfile)).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    noWrites();
  });

  it('DL-12 hồ sơ người thân của người khác hoặc không tồn tại ⇒ 404 KHONG_TIM_THAY; chưa đọc khung giờ', async () => {
    vi.mocked(lockVisitProfile).mockResolvedValue('missing');

    const error = await failureOf(
      service.create(ACCOUNT, input({ hoSoNguoiThanId: '9' })),
    );

    expect(error.getStatus()).toBe(404);
    expect(codeOf(error)).toBe('KHONG_TIM_THAY');
    expect(read).not.toHaveBeenCalled();
    noWrites();
  });

  it('DL-11 hồ sơ của chính mình đã ngừng ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG', async () => {
    vi.mocked(lockVisitProfile).mockResolvedValue('inactive');

    const error = await failureOf(
      service.create(ACCOUNT, input({ hoSoNguoiThanId: '9' })),
    );

    expect(error.getStatus()).toBe(409);
    expect(codeOf(error)).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    noWrites();
  });

  it('hồ sơ khoá bằng lockVisitProfile (FOR UPDATE) với id chủ từ TOKEN, không phải id từ thân', async () => {
    await service.create(ACCOUNT, input({ hoSoNguoiThanId: '9' }));

    expect(vi.mocked(lockVisitProfile)).toHaveBeenCalledExactlyOnceWith(
      hoisted.manager,
      ACCOUNT,
      '9',
    );
  });

  it('khung giờ không có ⇒ 404 KHUNG_GIO_KHONG_TON_TAI (sau hồ sơ, như checks)', async () => {
    read.mockResolvedValue({ kind: 'SlotNotFound' });

    const error = await failureOf(service.create(ACCOUNT, input()));

    expect(error.getStatus()).toBe(404);
    expect(codeOf(error)).toBe(BOOKING_ERROR_CODES.SLOT_NOT_FOUND);
    noWrites();
  });

  it('DL-14 cờ no-show đọc DƯỚI khoá benh_nhan (chế độ locked) rồi đưa cho luật ⇒ 403 DAT_LICH_BI_KHOA_NO_SHOW, không ghi gì', async () => {
    readNoShowLock.mockResolvedValue(true);
    read.mockImplementation(
      (_em: unknown, readInput: { noShowLocked: boolean }) =>
        Promise.resolve(
          slotRead(
            bookabilityFacts({
              now: NOW_SECOND,
              noShowLocked: readInput.noShowLocked,
            }),
          ),
        ),
    );

    const error = await failureOf(service.create(ACCOUNT, input()));

    expect(error.getStatus()).toBe(403);
    expect(codeOf(error)).toBe('DAT_LICH_BI_KHOA_NO_SHOW');
    expect(readNoShowLock).toHaveBeenCalledExactlyOnceWith(
      hoisted.manager,
      ACCOUNT,
      'locked',
    );
    noWrites();
  });

  it.each([
    [
      'DL-03 khung giờ DaDat ⇒ 409 KHUNG_GIO_DA_DAT',
      { trangThai: 'DaDat', giuChoDen: null },
      'KHUNG_GIO_DA_DAT',
    ],
    [
      'DL-04 khung giờ DangGiuCho còn hạn ⇒ 409 KHUNG_GIO_DANG_GIU',
      {
        trangThai: 'DangGiuCho',
        giuChoDen: new Date('2026-11-02T01:10:00.000Z'),
      },
      'KHUNG_GIO_DANG_GIU',
    ],
  ])('%s; không ghi gì', async (_name, slotState, code) => {
    read.mockResolvedValue(
      slotRead(
        bookabilityFacts({
          now: NOW_SECOND,
          slot: {
            khungGioId: SLOT_ID,
            ngayGio: SLOT_START,
            ...(slotState as { trangThai: 'DaDat'; giuChoDen: null }),
          },
        }),
      ),
    );

    const error = await failureOf(service.create(ACCOUNT, input()));

    expect(error.getStatus()).toBe(409);
    expect(codeOf(error)).toBe(code);
    noWrites();
  });

  it('DL-26 ca lệch chi nhánh bác sĩ ⇒ 409 KHUNG_GIO_KHONG_HOP_LE; chi tiết của luật đi nguyên (VUOT_SO_LICH_HEN_TOI_DA có toiDa)', async () => {
    read.mockResolvedValue(
      slotRead(
        bookabilityFacts({
          now: NOW_SECOND,
          shift: { chiNhanhId: '2', ca: 'CaSang' },
        }),
      ),
    );
    const mismatch = await failureOf(service.create(ACCOUNT, input()));
    expect(codeOf(mismatch)).toBe('KHUNG_GIO_KHONG_HOP_LE');

    read.mockResolvedValue(
      slotRead(
        bookabilityFacts({
          now: NOW_SECOND,
          soLichHenToiDa: 1,
          activeAppointments: [{ maLichHen: 'CLX-20261101-AAAAA' }],
        }),
      ),
    );
    const over = await failureOf(service.create(ACCOUNT, input()));
    expect(codeOf(over)).toBe('VUOT_SO_LICH_HEN_TOI_DA');
    expect((over.getResponse() as { chiTiet?: unknown }).chiTiet).toStrictEqual(
      {
        toiDa: 1,
      },
    );
    noWrites();
  });

  it('read nhận ĐÚNG đầu vào: khung giờ của thân, chủ từ token, hồ sơ, cờ no-show đã khoá, số lịch tối đa của cấu hình, và chế độ locked', async () => {
    config.soLichHenToiDaMoiHoSo = 4;

    await service.create(ACCOUNT, input({ hoSoNguoiThanId: '9' }));

    expect(read).toHaveBeenCalledExactlyOnceWith(
      hoisted.manager,
      {
        khungGioId: SLOT_ID,
        benhNhanId: ACCOUNT,
        hoSoNguoiThanId: '9',
        noShowLocked: false,
        soLichHenToiDa: 4,
        now: NOW_SECOND,
      },
      'locked',
    );
  });

  it('chưa cấu hình hệ thống ⇒ lỗi của SystemConfigService đi nguyên; KHÔNG mở giao dịch', async () => {
    const error = new AppException(409, 'HE_THONG_CHUA_CAU_HINH');
    getOrThrow.mockRejectedValue(error);

    await expect(service.create(ACCOUNT, input())).rejects.toBe(error);

    expect(vi.mocked(withBookingTransaction)).not.toHaveBeenCalled();
  });

  it('hết lượt thử lại 1213/1205 (503 HE_THONG_DANG_BAN của withBookingTransaction) đi nguyên ra ngoài', async () => {
    const busy = new AppException(503, 'HE_THONG_DANG_BAN');
    vi.mocked(withBookingTransaction).mockRejectedValueOnce(busy);

    await expect(service.create(ACCOUNT, input())).rejects.toBe(busy);
  });
});

describe('CreateAppointmentService: hết hạn lười (DL-05)', () => {
  const lapsedFacts = () =>
    bookabilityFacts({
      now: NOW_SECOND,
      slot: {
        khungGioId: SLOT_ID,
        ngayGio: SLOT_START,
        trangThai: 'DangGiuCho',
        giuChoDen: new Date('2026-11-02T00:59:00.000Z'),
      },
      slotHolder: { lichHenId: '5', maLichHen: 'CLX-20261101-OLD01' },
    });

  it('khung giờ không hết hạn ⇒ KHÔNG gọi expireLapsedHold', async () => {
    await service.create(ACCOUNT, input());

    expect(expireLapsedHold).not.toHaveBeenCalled();
  });

  it.each([
    ['Expired', { kind: 'Expired', lichHenId: '5' }],
    ['NoHolder (lời mời danh sách chờ hết hạn)', { kind: 'NoHolder' }],
  ])('%s ⇒ hết hạn lười TRƯỚC insert, rồi tạo được', async (_name, outcome) => {
    read.mockResolvedValue(slotRead(lapsedFacts()));
    expireLapsedHold.mockResolvedValue(outcome);

    const result = await service.create(ACCOUNT, input());

    expect(result.trangThai).toBe('DaXacNhan');
    expect(hoisted.events.indexOf('hết hạn lười')).toBeLessThan(
      hoisted.events.indexOf('insert'),
    );
    expect(expireLapsedHold).toHaveBeenCalledExactlyOnceWith(
      hoisted.manager,
      LOCKED,
      { now: NOW_SECOND },
    );
  });

  it.each([
    ['NotLapsed', { kind: 'NotLapsed' }],
    ['HolderChanged', { kind: 'HolderChanged' }],
  ])(
    '%s (không ghi gì) ⇒ 409 KHUNG_GIO_DANG_GIU, không insert',
    async (_name, outcome) => {
      read.mockResolvedValue(slotRead(lapsedFacts()));
      expireLapsedHold.mockResolvedValue(outcome);

      const error = await failureOf(service.create(ACCOUNT, input()));

      expect(error.getStatus()).toBe(409);
      expect(codeOf(error)).toBe('KHUNG_GIO_DANG_GIU');
      expect(vi.mocked(insertLichHen)).not.toHaveBeenCalled();
      expect(hold).not.toHaveBeenCalled();
    },
  );
});

describe('CreateAppointmentService: mã lịch và 1062 (DL-22, DL-28)', () => {
  const duplicateCode = (): Promise<InsertLichHenOutcome> => {
    record('insert');
    return Promise.resolve({ kind: 'DuplicateCode' });
  };

  it('DL-22 mã trùng (1062 trên ma_lich_hen) ⇒ sinh LẠI mã khác rồi chèn tiếp trong CÙNG giao dịch', async () => {
    vi.mocked(insertLichHen)
      .mockReset()
      .mockImplementationOnce(duplicateCode)
      .mockImplementationOnce(duplicateCode)
      .mockResolvedValue({ kind: 'Inserted', lichHenId: '900' });

    const result = await service.create(ACCOUNT, input());

    expect(vi.mocked(insertLichHen)).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((call) => insertedRow(call)?.maLichHen)).toStrictEqual(
      ['CLX-20261102-A0001', 'CLX-20261102-A0002', 'CLX-20261102-A0003'],
    );
    expect(result.maLichHen).toBe('CLX-20261102-A0003');
    // một giao dịch duy nhất, không mở giao dịch mới cho lần chèn lại
    expect(vi.mocked(withBookingTransaction)).toHaveBeenCalledTimes(1);
  });

  it(`DL-22 lần chèn thứ ${String(MAX_CODE_ATTEMPTS)} (cuối) thành công thì vẫn tạo được`, async () => {
    const attempts: unknown[] = [];
    vi.mocked(insertLichHen)
      .mockReset()
      .mockImplementation((): Promise<InsertLichHenOutcome> => {
        attempts.push(1);
        return Promise.resolve(
          attempts.length < MAX_CODE_ATTEMPTS
            ? { kind: 'DuplicateCode' }
            : { kind: 'Inserted', lichHenId: '900' },
        );
      });

    const result = await service.create(ACCOUNT, input());

    expect(attempts).toHaveLength(MAX_CODE_ATTEMPTS);
    expect(result.maLichHen).toBe(
      `CLX-20261102-A000${String(MAX_CODE_ATTEMPTS)}`,
    );
  });

  it(`DL-22 hết ${String(MAX_CODE_ATTEMPTS)} lần chèn vẫn trùng ⇒ Error thường (500 LOI_HE_THONG, KHÔNG AppException), hoàn tác, không hold, không cổng`, async () => {
    vi.mocked(insertLichHen).mockReset().mockImplementation(duplicateCode);

    const error: unknown = await service
      .create(ACCOUNT, input())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    expect(vi.mocked(insertLichHen)).toHaveBeenCalledTimes(MAX_CODE_ATTEMPTS);
    expect(hoisted.txThrew).toBe(true);
    expect(hold).not.toHaveBeenCalled();
    expect(payment.recordZeroPaymentCall.count).toBe(0);
    expect(notifier.notifyCall.count).toBe(0);
  });

  it('DL-28 1062 trên khung_gio_dang_giu (lưới an toàn cuối) ⇒ 409 KHUNG_GIO_DA_DAT, không 500; giao dịch HOÀN TÁC (kể cả hết hạn lười trước đó), không hold, không cổng; KHÔNG sinh lại mã', async () => {
    vi.mocked(insertLichHen)
      .mockReset()
      .mockResolvedValue({ kind: 'DuplicateSlot' });

    const error = await failureOf(service.create(ACCOUNT, input()));

    expect(error.getStatus()).toBe(409);
    expect(codeOf(error)).toBe('KHUNG_GIO_DA_DAT');
    expect(vi.mocked(insertLichHen)).toHaveBeenCalledTimes(1);
    expect(hoisted.txThrew).toBe(true);
    expect(hold).not.toHaveBeenCalled();
    expect(payment.recordZeroPaymentCall.count).toBe(0);
    expect(notifier.notifyCall.count).toBe(0);
  });

  it('DL-28 khi trùng cả hai khoá MySQL báo ma_lich_hen trước: sinh lại mã rồi lần chèn kế báo khung giờ ⇒ vẫn KHUNG_GIO_DA_DAT', async () => {
    vi.mocked(insertLichHen)
      .mockReset()
      .mockResolvedValueOnce({ kind: 'DuplicateCode' })
      .mockResolvedValueOnce({ kind: 'DuplicateSlot' });

    const error = await failureOf(service.create(ACCOUNT, input()));

    expect(codeOf(error)).toBe('KHUNG_GIO_DA_DAT');
    expect(vi.mocked(insertLichHen)).toHaveBeenCalledTimes(2);
  });

  it('DL-27 hold không Done dưới khoá sau INSERT (bất biến vỡ) ⇒ ném để hoàn tác cả INSERT, không commit lịch mồ côi', async () => {
    hold.mockResolvedValue({ kind: 'Stale' });

    await expect(service.create(ACCOUNT, input())).rejects.toThrow(/hold/);

    expect(hoisted.txThrew).toBe(true);
    expect(markBooked).not.toHaveBeenCalled();
  });

  it('DL-27 lỗi ở INSERT lich_hen (ví dụ khoá ngoại) đi nguyên ra, hoàn tác, không hold', async () => {
    const fk = new Error('1452');
    vi.mocked(insertLichHen).mockReset().mockRejectedValue(fk);

    await expect(service.create(ACCOUNT, input())).rejects.toBe(fk);

    expect(hoisted.txThrew).toBe(true);
    expect(hold).not.toHaveBeenCalled();
  });

  it('DL-27 lỗi ở hold (UPDATE khung_gio) đi nguyên ra và hoàn tác', async () => {
    const boom = new Error('update hỏng');
    hold.mockRejectedValue(boom);

    await expect(service.create(ACCOUNT, input())).rejects.toBe(boom);

    expect(hoisted.txThrew).toBe(true);
  });
});
