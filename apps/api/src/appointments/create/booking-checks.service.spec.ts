import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { BookabilityReader } from '../slots/bookability.reader.js';
import type { BookabilityRead } from '../slots/bookability.reader.js';
import { bookabilityFacts } from '../testing/bookability-facts.js';
import { FakeWalletBalancePort } from '../testing/fake-ports.js';
import type { BookingSummary } from './booking-checks.dto.js';
import { BookingChecksService } from './booking-checks.service.js';
import type { BookingSummaryReader } from './booking-summary.reader.js';

// Task B7 — BookingChecksService với MỌI phụ thuộc GIẢ và `runReadOnly` giả (không DB): thứ tự đọc và lỗi, MỘT giao dịch và MỘT mốc `now`, lỗi ném SAU khi giao dịch đóng, `soDuVi` chỉ hỏi cổng khi
// cọc > 0 (BCK-06, BCK-08 mức đơn vị, DL-24 phần dịch vụ; TRACKING booking 3.18 B7-D, B7-E). SQL và thứ tự thật trên MySQL: booking-checks.service.int-spec.ts. Mã BCK-nn là [đề xuất].
const hoisted = vi.hoisted(() => ({
  manager: { id: 'manager-cua-mot-giao-dich' },
  events: [] as string[],
  txThrew: false,
}));
vi.mock('../../common/transaction/read-only-tx.js', () => ({
  runReadOnly: vi.fn(
    async (_db: unknown, work: (manager: unknown) => Promise<unknown>) => {
      hoisted.events.push('tx:mở');
      try {
        const result = await work(hoisted.manager);
        hoisted.events.push('tx:đóng');
        return result;
      } catch (error) {
        hoisted.txThrew = true;
        throw error;
      }
    },
  ),
}));
vi.mock('../visit-profile.query.js', () => ({ readVisitProfile: vi.fn() }));
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { readVisitProfile } from '../visit-profile.query.js';

const DB = { id: 'datasource' } as unknown as DataSource;
const ACCOUNT = '77';
const SLOT_ID = '10';

const SUMMARY: Omit<BookingSummary, 'soDuVi'> = {
  dichVu: { ten: 'Khám nội', thoiLuongPhut: 30 },
  chuyenKhoa: 'Nội',
  bacSi: { hoTen: 'Bác sĩ A', chucDanh: 'BS' },
  chiNhanh: { ten: 'Chi nhánh 1', diaChi: '1 Đường Mẫu' },
  thoiGian: '2026-11-10T01:00:00.000Z',
  nguoiKham: { hoTen: 'Bệnh Nhân A', laBanThan: true },
  giaDichVu: '150000.00',
  phuPhi: '0.00',
  giaApDung: '150000.00',
  tienCoc: '0.00',
  chinhSachHoan: null,
};

let config: { soLichHenToiDaMoiHoSo: number };
let getOrThrow: ReturnType<typeof vi.fn>;
let readNoShowLock: ReturnType<typeof vi.fn>;
let read: ReturnType<typeof vi.fn>;
let readSummary: ReturnType<typeof vi.fn>;
let wallet: FakeWalletBalancePort;
let service: BookingChecksService;

const slotRead = (facts = bookabilityFacts()): BookabilityRead => ({
  kind: 'Read',
  facts,
  locked: null,
});

beforeEach(() => {
  hoisted.events.length = 0;
  hoisted.txThrew = false;
  vi.mocked(runReadOnly).mockClear();
  vi.mocked(readVisitProfile).mockReset().mockResolvedValue('active');
  config = { soLichHenToiDaMoiHoSo: 3 };
  getOrThrow = vi.fn(() => {
    hoisted.events.push('cấu hình');
    return Promise.resolve(config);
  });
  readNoShowLock = vi.fn(() => {
    hoisted.events.push('no-show');
    return Promise.resolve(false);
  });
  read = vi.fn(() => {
    hoisted.events.push('khung giờ');
    return Promise.resolve(slotRead());
  });
  readSummary = vi.fn(() => {
    hoisted.events.push('tóm tắt');
    return Promise.resolve(SUMMARY);
  });
  wallet = new FakeWalletBalancePort();
  service = new BookingChecksService(
    DB,
    { getOrThrow } as unknown as SystemConfigService,
    { readNoShowLock, read } as unknown as BookabilityReader,
    { read: readSummary } as unknown as BookingSummaryReader,
    wallet,
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T01:00:00.789Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const input = (hoSoNguoiThanId: string | null = null) => ({
  khungGioId: SLOT_ID,
  hoSoNguoiThanId,
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

describe('BookingChecksService: đường thành công (DL-24)', () => {
  it('BCK-06 trả đúng hai khoá gốc; tomTat đủ 12 khoá (11 của reader cộng soDuVi, luôn có mặt)', async () => {
    const result = await service.check(ACCOUNT, input());

    expect(Object.keys(result).sort()).toStrictEqual([
      'thoiGianMayChu',
      'tomTat',
    ]);
    expect(Object.keys(result.tomTat)).toHaveLength(12);
    expect(result.tomTat).toStrictEqual({ ...SUMMARY, soDuVi: null });
  });

  it('BCK-08 thứ tự: cấu hình (ngoài giao dịch) → mở giao dịch → no-show → khung giờ → tóm tắt → đóng giao dịch', async () => {
    await service.check(ACCOUNT, input());

    expect(hoisted.events).toStrictEqual([
      'cấu hình',
      'tx:mở',
      'no-show',
      'khung giờ',
      'tóm tắt',
      'tx:đóng',
    ]);
  });

  it('BCK-09 MỘT giao dịch cho mọi câu đọc; cùng một `manager` đi vào mọi bộ đọc; mọi chế độ đọc là "none" (không khoá)', async () => {
    await service.check(ACCOUNT, input('9'));

    expect(runReadOnly).toHaveBeenCalledTimes(1);
    expect(readNoShowLock).toHaveBeenCalledWith(
      hoisted.manager,
      ACCOUNT,
      'none',
    );
    expect(vi.mocked(readVisitProfile)).toHaveBeenCalledWith(
      hoisted.manager,
      ACCOUNT,
      '9',
    );
    expect(read).toHaveBeenCalledWith(
      hoisted.manager,
      expect.anything(),
      'none',
    );
    expect(readSummary).toHaveBeenCalledWith(
      hoisted.manager,
      expect.anything(),
    );
  });

  it('BCK-08 đầu vào của bộ đọc khung giờ: chủ sở hữu CHỈ từ tham số accountId (token), cờ no-show vừa đọc, số lịch tối đa từ cấu hình, hồ sơ người thân của thân', async () => {
    readNoShowLock.mockResolvedValue(true);
    config.soLichHenToiDaMoiHoSo = 5;
    // no-show khoá nhưng luật vẫn nhận cờ để tự trả lỗi: đổi `read` để trả facts đạt
    await service.check(ACCOUNT, input('9')).catch(() => undefined);

    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[1]).toMatchObject({
      khungGioId: SLOT_ID,
      benhNhanId: ACCOUNT,
      hoSoNguoiThanId: '9',
      noShowLocked: true,
      soLichHenToiDa: 5,
    });
  });

  it('BCK-08 MỘT mốc now (đã cắt mili giây, H8) cho cả lần gọi; thoiGianMayChu lấy SAU cùng và giữ mili giây', async () => {
    const result = await service.check(ACCOUNT, input());

    const sent = read.mock.calls[0]?.[1] as { now: Date };
    expect(sent.now.toISOString()).toBe('2026-11-02T01:00:00.000Z');
    expect(result.thoiGianMayChu).toBe('2026-11-02T01:00:00.789Z');
  });

  it('BCK-08 đồng hồ chạy giữa chừng không đổi mốc now đã đưa cho luật', async () => {
    read.mockImplementation(() => {
      vi.setSystemTime(new Date('2026-11-02T01:00:30.100Z'));
      return Promise.resolve(slotRead());
    });

    const result = await service.check(ACCOUNT, input());

    const sent = read.mock.calls[0]?.[1] as { now: Date };
    expect(sent.now.toISOString()).toBe('2026-11-02T01:00:00.000Z');
    // thoiGianMayChu lấy SAU cùng nên phản ánh lúc gửi
    expect(result.thoiGianMayChu).toBe('2026-11-02T01:00:30.100Z');
  });
});

describe('BookingChecksService: thứ tự lỗi (B7-D, 3.18.2 mục 4)', () => {
  it('BCK-08 chưa có cấu hình hệ thống ⇒ 409 HE_THONG_CHUA_CAU_HINH TRƯỚC mọi truy vấn khác', async () => {
    getOrThrow.mockRejectedValue(
      new AppException(409, 'HE_THONG_CHUA_CAU_HINH'),
    );

    const error = await failureOf(service.check(ACCOUNT, input()));

    expect(error.getStatus()).toBe(409);
    expect(codeOf(error)).toBe('HE_THONG_CHUA_CAU_HINH');
    expect(runReadOnly).not.toHaveBeenCalled();
    expect(readNoShowLock).not.toHaveBeenCalled();
  });

  it('BCK-08 không có hàng benh_nhan ⇒ 403 KHONG_DU_QUYEN, không đọc gì thêm', async () => {
    readNoShowLock.mockResolvedValue(null);

    const error = await failureOf(service.check(ACCOUNT, input()));

    expect(error.getStatus()).toBe(403);
    expect(codeOf(error)).toBe('KHONG_DU_QUYEN');
    expect(vi.mocked(readVisitProfile)).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('BCK-08 hồ sơ người thân của người khác hoặc không tồn tại ⇒ 404 KHONG_TIM_THAY, không đọc khung giờ', async () => {
    vi.mocked(readVisitProfile).mockResolvedValue('missing');

    const error = await failureOf(service.check(ACCOUNT, input('9')));

    expect(error.getStatus()).toBe(404);
    expect(codeOf(error)).toBe('KHONG_TIM_THAY');
    expect(read).not.toHaveBeenCalled();
  });

  it('BCK-08 hồ sơ của mình đã ngừng ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG', async () => {
    vi.mocked(readVisitProfile).mockResolvedValue('inactive');

    const error = await failureOf(service.check(ACCOUNT, input('9')));

    expect(error.getStatus()).toBe(409);
    expect(codeOf(error)).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    expect(read).not.toHaveBeenCalled();
  });

  it('BCK-08 khung giờ không có ⇒ 404 KHUNG_GIO_KHONG_TON_TAI (sau hồ sơ, trước luật)', async () => {
    read.mockResolvedValue({ kind: 'SlotNotFound' });

    const error = await failureOf(service.check(ACCOUNT, input()));

    expect(error.getStatus()).toBe(404);
    expect(codeOf(error)).toBe('KHUNG_GIO_KHONG_TON_TAI');
    expect(readSummary).not.toHaveBeenCalled();
  });

  it('BCK-08 hồ sơ hỏng THẮNG no-show: người bị khoá gửi hồ sơ người khác nhận 404, không phải 403 no-show', async () => {
    readNoShowLock.mockResolvedValue(true);
    vi.mocked(readVisitProfile).mockResolvedValue('missing');

    const error = await failureOf(service.check(ACCOUNT, input('9')));

    expect(codeOf(error)).toBe('KHONG_TIM_THAY');
  });

  it('BCK-08 khoá no-show ⇒ 403 DAT_LICH_BI_KHOA_NO_SHOW (kiểm tra ĐẦU của luật, Q14), không đọc tóm tắt, không hỏi ví', async () => {
    readNoShowLock.mockResolvedValue(true);
    read.mockResolvedValue(slotRead(bookabilityFacts({ noShowLocked: true })));

    const error = await failureOf(service.check(ACCOUNT, input()));

    expect(error.getStatus()).toBe(403);
    expect(codeOf(error)).toBe('DAT_LICH_BI_KHOA_NO_SHOW');
    expect(readSummary).not.toHaveBeenCalled();
    expect(wallet.availableCall.calls).toHaveLength(0);
  });

  it('BCK-08 lỗi của luật mang chiTiet đúng khoá (toiDa) và không đọc tóm tắt', async () => {
    read.mockResolvedValue(
      slotRead(
        bookabilityFacts({
          soLichHenToiDa: 1,
          activeAppointments: [{ maLichHen: 'CLX-20261110-AAAAA' }],
        }),
      ),
    );

    const error = await failureOf(service.check(ACCOUNT, input()));

    expect(error.getStatus()).toBe(409);
    expect(codeOf(error)).toBe('VUOT_SO_LICH_HEN_TOI_DA');
    expect((error.getResponse() as { chiTiet: unknown }).chiTiet).toStrictEqual(
      {
        toiDa: 1,
      },
    );
    expect(readSummary).not.toHaveBeenCalled();
  });

  it('BCK-08 mọi lỗi nghiệp vụ được ném SAU khi giao dịch đã đóng (nếp B1, B2): runReadOnly KHÔNG bao giờ thấy ngoại lệ', async () => {
    const setups: (() => void)[] = [
      () => readNoShowLock.mockResolvedValue(null),
      () => vi.mocked(readVisitProfile).mockResolvedValue('missing'),
      () => vi.mocked(readVisitProfile).mockResolvedValue('inactive'),
      () => read.mockResolvedValue({ kind: 'SlotNotFound' }),
      () =>
        read.mockResolvedValue(
          slotRead(bookabilityFacts({ noShowLocked: true })),
        ),
    ];
    for (const setup of setups) {
      hoisted.txThrew = false;
      readNoShowLock.mockResolvedValue(false);
      vi.mocked(readVisitProfile).mockResolvedValue('active');
      read.mockResolvedValue(slotRead());
      setup();

      await failureOf(service.check(ACCOUNT, input('9')));

      expect(hoisted.txThrew).toBe(false);
    }
  });
});

describe('BookingChecksService: soDuVi qua cổng ví (BCK-06)', () => {
  const withDeposit = (tienCoc: string) =>
    readSummary.mockImplementation(() =>
      Promise.resolve({ ...SUMMARY, tienCoc }),
    );

  it('BCK-06 cọc > 0 ⇒ hỏi cổng ĐÚNG MỘT lần với accountId từ token, trả nguyên văn', async () => {
    withDeposit('50000.00');
    wallet.availableCall.returns('120000.00');

    const result = await service.check(ACCOUNT, input());

    expect(wallet.availableCall.calls).toStrictEqual([[ACCOUNT]]);
    expect(result.tomTat.soDuVi).toBe('120000.00');
  });

  it('BCK-06 cọc 0 ⇒ KHÔNG gọi cổng, soDuVi là null (khoá vẫn có mặt)', async () => {
    withDeposit('0.00');
    wallet.availableCall.returns('999.00');

    const result = await service.check(ACCOUNT, input());

    expect(wallet.availableCall.calls).toHaveLength(0);
    expect('soDuVi' in result.tomTat).toBe(true);
    expect(result.tomTat.soDuVi).toBeNull();
  });

  it.each([
    { tienCoc: '0', goiCong: false },
    { tienCoc: '0.00', goiCong: false },
    { tienCoc: '0.0', goiCong: false },
    { tienCoc: '0.01', goiCong: true },
    { tienCoc: '1', goiCong: true },
  ])(
    'BCK-06 biên cọc "$tienCoc" (so bằng toCents) ⇒ gọi cổng: $goiCong',
    async ({ tienCoc, goiCong }) => {
      withDeposit(tienCoc);

      await service.check(ACCOUNT, input());

      expect(wallet.availableCall.calls).toHaveLength(goiCong ? 1 : 0);
    },
  );

  it('BCK-06 bản Noop (chưa có ví thật) trả null ⇒ soDuVi null dù cọc > 0; khoá vẫn có mặt', async () => {
    withDeposit('50000.00');
    wallet.availableCall.returns(null);

    const result = await service.check(ACCOUNT, input());

    expect('soDuVi' in result.tomTat).toBe(true);
    expect(result.tomTat.soDuVi).toBeNull();
  });

  it('BCK-06 cổng ví ném lỗi khi cọc > 0 ⇒ check() reject ĐÚNG lỗi đó, KHÔNG trả kết quả (không hạ xuống soDuVi null: null đã nghĩa "cọc 0" hoặc "chưa có ví thật")', async () => {
    withDeposit('50000.00');
    const failure = new Error('ví tạm lỗi');
    wallet.availableCall.throwsAlways(failure);

    await expect(service.check(ACCOUNT, input())).rejects.toBe(failure);
    expect(wallet.availableCall.calls).toHaveLength(1);
  });

  it('BCK-06 cổng ví chạy NGOÀI giao dịch (cổng không nhận em): sau khi giao dịch đóng', async () => {
    withDeposit('50000.00');
    wallet.availableCall.returns('1.00');
    const original = wallet.available.bind(wallet);
    vi.spyOn(wallet, 'available').mockImplementation((...args) => {
      hoisted.events.push('ví');
      return original(...args);
    });

    await service.check(ACCOUNT, input());

    expect(hoisted.events.indexOf('ví')).toBeGreaterThan(
      hoisted.events.indexOf('tx:đóng'),
    );
  });
});
