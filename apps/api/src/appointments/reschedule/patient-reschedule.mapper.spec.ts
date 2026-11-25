import type { RescheduleAvailability } from './reschedulability.rules.js';
import {
  toPreviewCandidate,
  toPreviewResult,
  toRequestSentResult,
  toRescheduledResult,
} from './patient-reschedule.mapper.js';
import type { ReschedulabilityVerdict } from './reschedule.types.js';
import {
  assertPreviewContract,
  assertRequestSentContract,
  assertRescheduledContract,
} from '../testing/patient-reschedule-contract.js';
import { collectKeys, FORBIDDEN_KEY } from '../testing/response-keys.js';

// Task reschedule B6 — hàm THUẦN dựng JSON phản hồi: DLH-48, DLH-50 (hình dạng hai kết quả POST), DLH-52 (`loai`), DLH-60, DLH-61 (khoá tuỳ chọn VẮNG chứ không `null`), HDL-26, HDL-27 (hợp đồng web F1),
// BDL-02 (danh sách trắng khoá: không `lich_hen_id`, không `yeuCauId`). Không DB, không đồng hồ.
const SERVER_TIME = new Date('2026-11-02T01:00:00.123Z');
const SLOT = {
  khungGioId: '9007199254740993',
  ngayGio: new Date('2026-11-10T01:00:00.000Z'),
};

// Phản hồi đã đi qua JSON như ở đường dây thật: khoá `undefined` biến mất
const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const availability = (
  overrides: Partial<RescheduleAvailability> = {},
): RescheduleAvailability => ({
  choPhep: true,
  failure: null,
  lyDoKhongDoi: null,
  loai: 'TuDoi',
  soLanDaDoi: 1,
  toiDa: 2,
  coYeuCauChoDuyet: false,
  ...overrides,
});
const SOURCE = {
  thoiGian: new Date('2026-11-09T01:00:00.000Z'),
  bacSiId: '9007199254740995',
};
const preview = (
  overrides: Partial<Parameters<typeof toPreviewResult>[0]> = {},
) =>
  toPreviewResult({
    availability: availability(),
    source: SOURCE,
    candidate: null,
    serverTime: SERVER_TIME,
    ...overrides,
  });

describe('DLH-48, HDL-27, BDL-02 toRescheduledResult: 201 DaDoi', () => {
  const result = toRescheduledResult(
    {
      kind: 'Rescheduled',
      maLichHenCu: 'CLX-20261109-AAAAA',
      maLichHenMoi: 'CLX-20261110-BBBBB',
      thoiGianMoi: new Date('2026-11-10T02:30:00.000Z'),
    },
    SERVER_TIME,
  );

  it('đúng khoá ở cả ba cấp (hợp đồng PLAN 5.8), lịch mới DaXacNhan, mốc ISO UTC giữ mili giây, thoiGianMayChu là mốc người gọi truyền', () => {
    assertRescheduledContract(wire(result));
    expect(result).toEqual({
      ketQua: 'DaDoi',
      lichHenMoi: {
        maLichHen: 'CLX-20261110-BBBBB',
        thoiGian: '2026-11-10T02:30:00.000Z',
        trangThai: 'DaXacNhan',
      },
      lichHenCu: { maLichHen: 'CLX-20261109-AAAAA' },
      thoiGianMayChu: '2026-11-02T01:00:00.123Z',
    });
  });

  it('BDL-02 không khoá nào kết thúc bằng Id (không lich_hen_id) ở bất kỳ độ sâu nào', () => {
    expect(
      collectKeys(result).filter((key) => FORBIDDEN_KEY.test(key)),
    ).toEqual([]);
  });
});

describe('DLH-50, HDL-27, BDL-02 toRequestSentResult: 201 DaGuiYeuCau', () => {
  it('đúng khoá, KHÔNG id yêu cầu, trạng thái ChoDuyet, giờ mong muốn ISO', () => {
    const result = toRequestSentResult(
      new Date('2026-11-10T03:00:00.000Z'),
      SERVER_TIME,
    );
    assertRequestSentContract(wire(result));
    expect(result).toEqual({
      ketQua: 'DaGuiYeuCau',
      yeuCau: {
        trangThai: 'ChoDuyet',
        thoiGianMongMuon: '2026-11-10T03:00:00.000Z',
      },
      thoiGianMayChu: '2026-11-02T01:00:00.123Z',
    });
    expect(
      collectKeys(result).filter((key) => FORBIDDEN_KEY.test(key)),
    ).toEqual([]);
  });
});

describe('HDL-26, DLH-60 toPreviewResult: hợp đồng web F1', () => {
  it('được phép đổi, chưa có khung giờ: lyDoKhongDoi VẮNG (không null), lichMoi null, lichCu đúng hai khoá, bacSiId giữ nguyên chuỗi lớn hơn 2^53', () => {
    const result = preview();
    expect('lyDoKhongDoi' in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain('lyDoKhongDoi');
    assertPreviewContract(wire(result));
    expect(result).toEqual({
      choPhepDoi: true,
      loai: 'TuDoi',
      soLanDaDoi: 1,
      soLanToiDa: 2,
      coYeuCauChoDuyet: false,
      lichCu: {
        thoiGian: '2026-11-09T01:00:00.000Z',
        bacSiId: '9007199254740995',
      },
      lichMoi: null,
      thoiGianMayChu: '2026-11-02T01:00:00.123Z',
    });
  });

  it('không đổi được: lyDoKhongDoi là chuỗi maLoi, các khoá còn lại vẫn đủ', () => {
    const result = preview({
      availability: availability({
        choPhep: false,
        lyDoKhongDoi: 'LICH_HEN_DA_QUA_GIO',
        failure: { kind: 'Rule', code: 'LICH_HEN_DA_QUA_GIO' },
      }),
    });
    expect(result.choPhepDoi).toBe(false);
    expect(result.lyDoKhongDoi).toBe('LICH_HEN_DA_QUA_GIO');
    assertPreviewContract(wire(result));
  });

  it('DLH-52 loai GuiYeuCau và số liệu hết lần được chép nguyên (kể cả toiDa = 0); coYeuCauChoDuyet true', () => {
    const result = preview({
      availability: availability({
        loai: 'GuiYeuCau',
        soLanDaDoi: 0,
        toiDa: 0,
        coYeuCauChoDuyet: true,
      }),
    });
    expect(result.loai).toBe('GuiYeuCau');
    expect(result.soLanDaDoi).toBe(0);
    expect(result.soLanToiDa).toBe(0);
    expect(result.coYeuCauChoDuyet).toBe(true);
    assertPreviewContract(wire(result));
  });

  it('có khung giờ: lichMoi chép nguyên (hợp lệ không có lyDoKhongHopLe; không hợp lệ có mã)', () => {
    const ok = preview({
      candidate: toPreviewCandidate(SLOT, {
        ok: true,
        branch: 'Reschedule',
        lapsedHold: null,
      }),
    });
    assertPreviewContract(wire(ok));
    expect(ok.lichMoi).toEqual({
      khungGioId: '9007199254740993',
      thoiGian: '2026-11-10T01:00:00.000Z',
      hopLe: true,
    });
    const bad = preview({
      candidate: toPreviewCandidate(SLOT, {
        ok: false,
        failure: { kind: 'Rule', code: 'KHUNG_GIO_DA_DAT' },
      }),
    });
    assertPreviewContract(wire(bad));
    expect(bad.lichMoi?.lyDoKhongHopLe).toBe('KHUNG_GIO_DA_DAT');
  });

  it('BDL-02 chỉ hai khoá kết thúc bằng Id (bacSiId, khungGioId) có mặt ở preview; không lich_hen_id', () => {
    const result = preview({
      candidate: toPreviewCandidate(SLOT, {
        ok: true,
        branch: 'Reschedule',
        lapsedHold: null,
      }),
    });
    expect(
      collectKeys(result)
        .filter((key) => FORBIDDEN_KEY.test(key))
        .sort(),
    ).toEqual(['bacSiId', 'khungGioId']);
  });

  it('thiếu loai (không có lịch) hoặc thiếu soLanDaDoi ⇒ ném Error (lỗi lập trình: người gọi lẽ ra đã trả 404), không trả preview dở', () => {
    expect(() =>
      preview({ availability: availability({ loai: null }) }),
    ).toThrow(Error);
    expect(() =>
      preview({ availability: availability({ soLanDaDoi: null }) }),
    ).toThrow(Error);
  });
});

describe('DLH-61 toPreviewCandidate: hopLe và lyDoKhongHopLe từ phán quyết của bộ luật đầy đủ', () => {
  const verdictOf = (verdict: ReschedulabilityVerdict) =>
    toPreviewCandidate(SLOT, verdict);

  it('hợp lệ (cả nhánh yêu cầu): hopLe true, KHÔNG có khoá lyDoKhongHopLe', () => {
    for (const branch of ['Reschedule', 'Request'] as const) {
      const candidate = verdictOf({ ok: true, branch, lapsedHold: null });
      expect(candidate.hopLe).toBe(true);
      expect('lyDoKhongHopLe' in candidate).toBe(false);
    }
  });

  it.each([
    [
      'Rule',
      { kind: 'Rule', code: 'KHUNG_GIO_TRUNG_LICH_CU' } as const,
      'KHUNG_GIO_TRUNG_LICH_CU',
    ],
    [
      'ProfileInactive',
      { kind: 'ProfileInactive' } as const,
      'HO_SO_NGUOI_THAN_DA_NGUNG',
    ],
    [
      'SlotNotFound',
      { kind: 'SlotNotFound' } as const,
      'KHUNG_GIO_KHONG_TON_TAI',
    ],
  ])('không hợp lệ (%s) ⇒ hopLe false kèm mã', (_name, failure, code) => {
    expect(verdictOf({ ok: false, failure })).toEqual({
      khungGioId: '9007199254740993',
      thoiGian: '2026-11-10T01:00:00.000Z',
      hopLe: false,
      lyDoKhongHopLe: code,
    });
  });

  it('NotFound không có mã (đã trả 404 ở nơi gọi) ⇒ ném Error, không trả hopLe false không lý do', () => {
    expect(() =>
      verdictOf({ ok: false, failure: { kind: 'NotFound' } }),
    ).toThrow(Error);
  });
});
