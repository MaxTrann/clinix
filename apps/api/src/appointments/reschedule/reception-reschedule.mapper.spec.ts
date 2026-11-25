import { toReceptionPreviewResult } from './reception-reschedule.mapper.js';
import type { RescheduleAvailability } from './reschedulability.rules.js';
import { assertReceptionPreviewContract } from '../testing/reception-reschedule-contract.js';

// Task reschedule B7 — `toReceptionPreviewResult` (hàm THUẦN, MỘT chỗ liệt kê khoá của preview Lễ tân): BDL-07 (đúng sáu khoá, không `lich_hen_id`, không tên, khoá tuỳ chọn VẮNG chứ không `null`) và HDL-28 (hợp đồng "đọc
// NGHIÊM" của web F3, không `loai`, `soLanDaDoi`, `soLanToiDa`). Mã BDL-07 và HDL-28 là `[đề xuất]` (TRACKING reschedule 1.11). Không DB.
const SERVER_TIME = new Date('2026-11-02T01:00:02.500Z');
const SOURCE = {
  thoiGian: new Date('2026-11-09T01:00:00.000Z'),
  bacSiId: '9007199254740995',
};

const available = (
  overrides: Partial<RescheduleAvailability> = {},
): RescheduleAvailability => ({
  choPhep: true,
  failure: null,
  lyDoKhongDoi: null,
  loai: null,
  soLanDaDoi: 4,
  toiDa: 2,
  coYeuCauChoDuyet: false,
  ...overrides,
});
const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('BDL-07, HDL-28 toReceptionPreviewResult: danh sách trắng sáu khoá', () => {
  it('đổi được, chưa hỏi khung giờ: đúng 5 khoá cấp 1 (KHÔNG lyDoKhongDoi), lichMoi null, lichCu đúng hai khoá, thoiGianMayChu giữ mili giây', () => {
    const result = toReceptionPreviewResult({
      availability: available(),
      source: SOURCE,
      candidate: null,
      serverTime: SERVER_TIME,
    });
    expect(Object.keys(result).sort()).toEqual([
      'choPhepDoi',
      'coYeuCauChoDuyet',
      'lichCu',
      'lichMoi',
      'thoiGianMayChu',
    ]);
    expect(result).toEqual({
      choPhepDoi: true,
      coYeuCauChoDuyet: false,
      lichCu: {
        thoiGian: '2026-11-09T01:00:00.000Z',
        bacSiId: '9007199254740995',
      },
      lichMoi: null,
      thoiGianMayChu: '2026-11-02T01:00:02.500Z',
    });
    assertReceptionPreviewContract(wire(result));
  });

  it('KHÔNG đưa loai, soLanDaDoi, soLanToiDa ra dù availability có số (Lễ tân không có hạn mức): chặn cả khi availability.loai là GuiYeuCau', () => {
    const result = toReceptionPreviewResult({
      availability: available({ loai: 'GuiYeuCau', soLanDaDoi: 9, toiDa: 2 }),
      source: SOURCE,
      candidate: null,
      serverTime: SERVER_TIME,
    });
    for (const key of ['loai', 'soLanDaDoi', 'soLanToiDa'])
      expect(key in result).toBe(false);
    assertReceptionPreviewContract(wire(result));
  });

  it('không đổi được: lyDoKhongDoi là CHUỖI maLoi; đổi được: khoá VẮNG, không bao giờ null', () => {
    const blocked = toReceptionPreviewResult({
      availability: available({
        choPhep: false,
        lyDoKhongDoi: 'LICH_HEN_DA_QUA_GIO',
      }),
      source: SOURCE,
      candidate: null,
      serverTime: SERVER_TIME,
    });
    expect(blocked.choPhepDoi).toBe(false);
    expect(blocked.lyDoKhongDoi).toBe('LICH_HEN_DA_QUA_GIO');
    assertReceptionPreviewContract(wire(blocked));
    const ok = toReceptionPreviewResult({
      availability: available(),
      source: SOURCE,
      candidate: null,
      serverTime: SERVER_TIME,
    });
    expect(Object.hasOwn(ok, 'lyDoKhongDoi')).toBe(false);
    expect(JSON.stringify(ok)).not.toContain('null,"lichCu"');
  });

  it('coYeuCauChoDuyet đi nguyên từ availability (yêu cầu chờ KHÔNG chặn đổi hộ: choPhepDoi vẫn true)', () => {
    const result = toReceptionPreviewResult({
      availability: available({ coYeuCauChoDuyet: true }),
      source: SOURCE,
      candidate: null,
      serverTime: SERVER_TIME,
    });
    expect(result.coYeuCauChoDuyet).toBe(true);
    expect(result.choPhepDoi).toBe(true);
  });

  it('lichMoi đi nguyên từ ứng viên: hợp lệ không có lyDoKhongHopLe, không hợp lệ có mã; khungGioId giữ nguyên chuỗi lớn hơn 2^53', () => {
    const valid = toReceptionPreviewResult({
      availability: available(),
      source: SOURCE,
      candidate: {
        khungGioId: '9007199254740993',
        thoiGian: '2026-11-10T01:00:00.000Z',
        hopLe: true,
      },
      serverTime: SERVER_TIME,
    });
    expect(valid.lichMoi).toEqual({
      khungGioId: '9007199254740993',
      thoiGian: '2026-11-10T01:00:00.000Z',
      hopLe: true,
    });
    assertReceptionPreviewContract(wire(valid));
    const invalid = toReceptionPreviewResult({
      availability: available(),
      source: SOURCE,
      candidate: {
        khungGioId: '12',
        thoiGian: '2026-11-10T01:00:00.000Z',
        hopLe: false,
        lyDoKhongHopLe: 'KHUNG_GIO_DA_DAT',
      },
      serverTime: SERVER_TIME,
    });
    assertReceptionPreviewContract(wire(invalid));
    expect(invalid.lichMoi?.lyDoKhongHopLe).toBe('KHUNG_GIO_DA_DAT');
  });

  it('BDL-07 không rò: nguồn có thêm trường (lichHenId, benhNhanId, maLichHen) KHÔNG xuất hiện ở đầu ra', () => {
    const result = toReceptionPreviewResult({
      availability: available(),
      source: {
        ...SOURCE,
        lichHenId: '100',
        benhNhanId: '9',
        maLichHen: 'CLX-20261109-OLDAP',
      } as typeof SOURCE,
      candidate: null,
      serverTime: SERVER_TIME,
    });
    const text = JSON.stringify(result);
    for (const leaked of ['lichHenId', 'benhNhanId', 'maLichHen', 'OLDAP'])
      expect(text).not.toContain(leaked);
  });
});
