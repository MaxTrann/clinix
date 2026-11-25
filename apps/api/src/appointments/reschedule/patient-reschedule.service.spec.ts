import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import {
  BOOKING_ERROR_CODES,
  BOOKING_ERRORS,
  type BookingErrorCode,
} from '../appointments.constants.js';
import {
  assertRequestSentContract,
  assertRescheduledContract,
} from '../testing/patient-reschedule-contract.js';
import type { AppointmentRescheduleService } from './appointment-reschedule.service.js';
import { PatientRescheduleService } from './patient-reschedule.service.js';
import type { CreateRescheduleRequestOutcome } from './reschedule-request.types.js';
import type { RescheduleRequestService } from './reschedule-request.service.js';
import type { RescheduleOutcome } from './reschedule.types.js';

// Task reschedule B6 — `PatientRescheduleService` (ghép B4 với B5) với hai dịch vụ GIẢ có kịch bản, đồng hồ giả: DLH-48 (đổi ngay, `thoiGianMayChu` sau B4), DLH-49 (hết lần, không lý do), DLH-50 (hết lần, có lý do),
// DLH-51 (`NotOverQuota`: gọi B4 lại đúng MỘT lần rồi 503), DLH-53 (vét cạn `Rejected` của B4 và B5), DLH-54 (lý do thừa bỏ qua; lỗi ném đi nguyên), DLH-11 (lý do thừa khi còn lần). Không DB: SQL thật ở
// `patient-reschedule.service.int-spec.ts`. Mã DLH-48…54 là `[đề xuất]` (TRACKING reschedule 1.10).
const ACCOUNT = '77';
const CODE = 'CLX-20261110-AAA01';
const NEW_CODE = 'CLX-20261110-AAA02';
const SLOT = '9007199254740993';
const REASON = 'Tôi có việc đột xuất vào đúng giờ đã đặt';
const T0 = new Date('2026-11-02T01:00:00.000Z');
const WANTED = new Date('2026-11-10T03:00:00.000Z');

const RESCHEDULED: RescheduleOutcome = {
  kind: 'Rescheduled',
  maLichHenCu: CODE,
  maLichHenMoi: NEW_CODE,
  thoiGianMoi: new Date('2026-11-10T02:30:00.000Z'),
};
const OVER_QUOTA: RescheduleOutcome = {
  kind: 'OverQuota',
  soLanDaDoi: 2,
  toiDa: 2,
};
const CREATED: CreateRescheduleRequestOutcome = {
  kind: 'RequestCreated',
  yeuCauId: '555',
  thoiGianMongMuon: WANTED,
};
const NOT_OVER_QUOTA: CreateRescheduleRequestOutcome = {
  kind: 'NotOverQuota',
  soLanDaDoi: 1,
  toiDa: 3,
};

type Scripted<T> = (T | Error)[];

function setup(
  core: Scripted<RescheduleOutcome>,
  create: Scripted<CreateRescheduleRequestOutcome> = [],
) {
  const reschedule = vi.fn();
  for (const step of core)
    if (step instanceof Error) reschedule.mockRejectedValueOnce(step);
    else reschedule.mockResolvedValueOnce(step);
  const createRequest = vi.fn();
  for (const step of create)
    if (step instanceof Error) createRequest.mockRejectedValueOnce(step);
    else createRequest.mockResolvedValueOnce(step);
  const service = new PatientRescheduleService(
    { reschedule } as unknown as AppointmentRescheduleService,
    { create: createRequest } as unknown as RescheduleRequestService,
  );
  const run = (lyDoYeuCau?: string) =>
    service.reschedule(ACCOUNT, CODE, {
      khungGioId: SLOT,
      ...(lyDoYeuCau === undefined ? {} : { lyDoYeuCau }),
    });
  return { reschedule, createRequest, run };
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    return {
      status: error.getStatus(),
      body: error.getResponse() as {
        maLoi: string;
        thongBao: string;
        chiTiet?: unknown;
        loi?: { truong: string; ma: string }[];
      },
    };
  }
  throw new Error('lẽ ra phải ném AppException');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('DLH-48 POST: B4 đổi ngay', () => {
  it('Rescheduled ⇒ 201 DaDoi đúng hợp đồng; B4 gọi ĐÚNG một lần với actor TuDoi (accountId từ token), khung giờ đích đúng chuỗi; B5 KHÔNG gọi', async () => {
    const { reschedule, createRequest, run } = setup([RESCHEDULED]);
    const result = await run();
    assertRescheduledContract(JSON.parse(JSON.stringify(result)));
    expect(result).toEqual({
      ketQua: 'DaDoi',
      lichHenMoi: {
        maLichHen: NEW_CODE,
        thoiGian: '2026-11-10T02:30:00.000Z',
        trangThai: 'DaXacNhan',
      },
      lichHenCu: { maLichHen: CODE },
      thoiGianMayChu: '2026-11-02T01:00:00.000Z',
    });
    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(reschedule).toHaveBeenCalledWith({
      maLichHen: CODE,
      khungGioMoiId: SLOT,
      actor: { via: 'TuDoi', accountId: ACCOUNT },
    });
    expect(createRequest).not.toHaveBeenCalled();
  });

  it('thoiGianMayChu lấy SAU khi B4 trả (sau commit), không phải trước khi gọi', async () => {
    const { reschedule, run } = setup([]);
    reschedule.mockImplementationOnce(() => {
      // B4 mất 5 giây (giao dịch, khoá, thông báo); đồng hồ đi tiếp trong lúc đó
      vi.setSystemTime(new Date(T0.getTime() + 5000));
      return Promise.resolve(RESCHEDULED);
    });
    const result = await run();
    expect(result).toMatchObject({
      thoiGianMayChu: '2026-11-02T01:00:05.000Z',
    });
  });
});

describe('DLH-49 POST: hết lần tự đổi, KHÔNG có lý do', () => {
  it('OverQuota ⇒ 409 VUOT_SO_LAN_TU_DOI chiTiet { soLanDaDoi, toiDa } nguyên số của B4; B5 KHÔNG gọi; B4 đúng một lần', async () => {
    // `create` có kịch bản hợp lệ: nếu dịch vụ lỡ gọi B5 thì ca đỏ bằng khẳng định "không gọi", không phải TypeError của mock
    const { reschedule, createRequest, run } = setup([OVER_QUOTA], [CREATED]);
    const failure = await failureOf(run());
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('VUOT_SO_LAN_TU_DOI');
    expect(failure.body.chiTiet).toEqual({ soLanDaDoi: 2, toiDa: 2 });
    expect(createRequest).not.toHaveBeenCalled();
    expect(reschedule).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['rỗng', ''],
    ['chỉ khoảng trắng', '   '],
    ['xuống dòng và tab', ' \t\r\n '],
  ])(
    'lý do %s truyền THẲNG vào dịch vụ (không qua DTO) cũng là "vắng": 409, B5 không gọi',
    async (_name, blank) => {
      const { createRequest, run } = setup([OVER_QUOTA], [CREATED]);
      const failure = await failureOf(run(blank));
      expect(failure.body.maLoi).toBe('VUOT_SO_LAN_TU_DOI');
      expect(createRequest).not.toHaveBeenCalled();
    },
  );

  it('NBSP (U+00A0) không phải khoảng trắng ASCII: coi là CÓ lý do, chuyển cho B5 (B5 sẽ 400 vì quá ngắn)', async () => {
    const { createRequest, run } = setup([OVER_QUOTA], [CREATED]);
    await run(' ');
    expect(createRequest).toHaveBeenCalledTimes(1);
  });

  it('biên toiDa = 0: chiTiet { soLanDaDoi: 0, toiDa: 0 } chép nguyên', async () => {
    const { run } = setup(
      [{ kind: 'OverQuota', soLanDaDoi: 0, toiDa: 0 }],
      [CREATED],
    );
    expect((await failureOf(run())).body.chiTiet).toEqual({
      soLanDaDoi: 0,
      toiDa: 0,
    });
  });
});

describe('DLH-50 POST: hết lần tự đổi, CÓ lý do', () => {
  it('OverQuota rồi RequestCreated ⇒ 201 DaGuiYeuCau (không yeuCauId); B5 gọi ĐÚNG một lần với lý do đã chuẩn hoá, khung giờ mong muốn, tài khoản; B4 một lần', async () => {
    const { reschedule, createRequest, run } = setup([OVER_QUOTA], [CREATED]);
    const result = await run(`  ${REASON}  `);
    assertRequestSentContract(JSON.parse(JSON.stringify(result)));
    expect(result).toEqual({
      ketQua: 'DaGuiYeuCau',
      yeuCau: {
        trangThai: 'ChoDuyet',
        thoiGianMongMuon: '2026-11-10T03:00:00.000Z',
      },
      thoiGianMayChu: '2026-11-02T01:00:00.000Z',
    });
    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(createRequest).toHaveBeenCalledWith({
      maLichHen: CODE,
      khungGioMongMuonId: SLOT,
      lyDoYeuCau: REASON,
      accountId: ACCOUNT,
    });
    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('555');
  });

  it('thoiGianMayChu của DaGuiYeuCau lấy SAU khi B5 trả', async () => {
    const { createRequest, run } = setup([OVER_QUOTA]);
    createRequest.mockImplementationOnce(() => {
      vi.setSystemTime(new Date(T0.getTime() + 3000));
      return Promise.resolve(CREATED);
    });
    expect(await run(REASON)).toMatchObject({
      thoiGianMayChu: '2026-11-02T01:00:03.000Z',
    });
  });
});

describe('DLH-51 POST: B5 trả NotOverQuota (cấu hình đổi giữa hai lần đọc)', () => {
  it('gọi B4 lại ĐÚNG MỘT lần (tổng hai); lần hai Rescheduled ⇒ 201 DaDoi; B5 chỉ một lần', async () => {
    const { reschedule, createRequest, run } = setup(
      [OVER_QUOTA, RESCHEDULED],
      [NOT_OVER_QUOTA],
    );
    const result = await run(REASON);
    expect(result).toMatchObject({ ketQua: 'DaDoi' });
    expect(reschedule).toHaveBeenCalledTimes(2);
    expect(reschedule.mock.calls[1]).toEqual(reschedule.mock.calls[0]);
    expect(createRequest).toHaveBeenCalledTimes(1);
  });

  it('lần hai Rejected ⇒ đúng mã (không gọi B5 lần hai)', async () => {
    const { createRequest, run } = setup(
      [
        OVER_QUOTA,
        {
          kind: 'Rejected',
          failure: { kind: 'Rule', code: 'KHUNG_GIO_DA_DAT' },
        },
      ],
      [NOT_OVER_QUOTA],
    );
    const failure = await failureOf(run(REASON));
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('KHUNG_GIO_DA_DAT');
    expect(createRequest).toHaveBeenCalledTimes(1);
  });

  it('lần hai vẫn OverQuota ⇒ 503 HE_THONG_DANG_BAN; KHÔNG vòng lặp: B4 đúng hai lần, B5 đúng một lần', async () => {
    const { reschedule, createRequest, run } = setup(
      [OVER_QUOTA, OVER_QUOTA, RESCHEDULED],
      [NOT_OVER_QUOTA, CREATED],
    );
    const failure = await failureOf(run(REASON));
    expect(failure.status).toBe(503);
    expect(failure.body.maLoi).toBe('HE_THONG_DANG_BAN');
    expect(reschedule).toHaveBeenCalledTimes(2);
    expect(createRequest).toHaveBeenCalledTimes(1);
  });
});

describe('DLH-53 POST: vét cạn Rejected của B4 và của B5 (một ánh xạ duy nhất, không bảng thứ hai)', () => {
  const RULE_CODES = Object.values(BOOKING_ERROR_CODES);
  const sources = [
    [
      'B4',
      (failure: object) =>
        setup([{ kind: 'Rejected', failure } as RescheduleOutcome]),
    ],
    [
      'B5',
      (failure: object) =>
        setup(
          [OVER_QUOTA],
          [{ kind: 'Rejected', failure } as CreateRescheduleRequestOutcome],
        ),
    ],
  ] as const;

  it.each(sources)(
    '%s: NotFound ⇒ 404 KHONG_TIM_THAY',
    async (_name, build) => {
      const failure = await failureOf(build({ kind: 'NotFound' }).run(REASON));
      expect(failure.status).toBe(404);
      expect(failure.body.maLoi).toBe('KHONG_TIM_THAY');
    },
  );

  it.each(sources)(
    '%s: ProfileInactive ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG',
    async (_name, build) => {
      const failure = await failureOf(
        build({ kind: 'ProfileInactive' }).run(REASON),
      );
      expect(failure.status).toBe(409);
      expect(failure.body.maLoi).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    },
  );

  it.each(sources)(
    '%s: SlotNotFound ⇒ 404 KHUNG_GIO_KHONG_TON_TAI',
    async (_name, build) => {
      const failure = await failureOf(
        build({ kind: 'SlotNotFound' }).run(REASON),
      );
      expect(failure.status).toBe(404);
      expect(failure.body.maLoi).toBe('KHUNG_GIO_KHONG_TON_TAI');
    },
  );

  describe.each(sources)('%s: mọi mã Rule', (_name, build) => {
    it.each(RULE_CODES)(
      'Rule %s ⇒ HTTP của BOOKING_ERRORS, maLoi đúng, chiTiet nguyên',
      async (code: BookingErrorCode) => {
        const chiTiet = { trangThai: 'DaHuy' };
        const failure = await failureOf(
          build({ kind: 'Rule', code, chiTiet }).run(REASON),
        );
        expect(failure.status).toBe(BOOKING_ERRORS[code].status);
        expect(failure.body.maLoi).toBe(code);
        expect(failure.body.chiTiet).toEqual(chiTiet);
      },
    );
  });

  it.each(sources)(
    '%s: RequestNotFound và RequestHandled (chỉ có ở đường duyệt) KHÔNG thể xảy ra ở TuDoi ⇒ ném Error thường (500), không đoán sang 404',
    async (_name, build) => {
      for (const kind of ['RequestNotFound', 'RequestHandled'] as const) {
        const promise = build({ kind }).run(REASON);
        await expect(promise).rejects.toThrow(Error);
        await expect(promise).rejects.not.toBeInstanceOf(AppException);
      }
    },
  );
});

describe('DLH-54, DLH-11 POST: lý do thừa bị bỏ qua; lỗi B4 và B5 ném ra đi nguyên', () => {
  it.each(['abc', REASON, 'a'.repeat(600)])(
    'còn lần tự đổi (B4 đổi ngay) ⇒ lyDoYeuCau %s bị bỏ qua: 201 DaDoi, B5 không gọi',
    async (reason) => {
      const { createRequest, run } = setup([RESCHEDULED]);
      expect(await run(reason)).toMatchObject({ ketQua: 'DaDoi' });
      expect(createRequest).not.toHaveBeenCalled();
    },
  );

  it('lỗi B4 ném ra (409 HE_THONG_CHUA_CAU_HINH, 503, lỗi lạ) đi nguyên: cùng đối tượng, không nuốt, không gọi B5', async () => {
    const config = new AppException(409, 'HE_THONG_CHUA_CAU_HINH', {
      thongBao: 'Hệ thống chưa được cấu hình.',
    });
    const busy = new AppException(503, 'HE_THONG_DANG_BAN');
    const unknown = new Error('lỗi lạ');
    for (const thrown of [config, busy, unknown]) {
      const { createRequest, run } = setup([thrown]);
      await expect(run(REASON)).rejects.toBe(thrown);
      expect(createRequest).not.toHaveBeenCalled();
    }
  });

  it('lỗi B5 ném ra (400 lyDoYeuCau, 409 cấu hình, 503) đi nguyên; B4 không bị gọi lại', async () => {
    const invalidReason = new AppException(400, 'DU_LIEU_KHONG_HOP_LE', {
      loi: [{ truong: 'lyDoYeuCau', ma: 'LY_DO_YEU_CAU_KHONG_HOP_LE' }],
    });
    const busy = new AppException(503, 'HE_THONG_DANG_BAN');
    for (const thrown of [invalidReason, busy]) {
      const { reschedule, run } = setup([OVER_QUOTA], [thrown]);
      await expect(run('abc')).rejects.toBe(thrown);
      expect(reschedule).toHaveBeenCalledTimes(1);
    }
  });
});
