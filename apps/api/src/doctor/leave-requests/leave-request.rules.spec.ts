import {
  checkLeaveDates,
  countDays,
  isShiftEnded,
  leaveWindowsOverlap,
  normalizeReason,
  todaysShift,
  validateLeaveShape,
  type LeaveRequestInput,
} from './leave-request.rules.js';
import type { LeaveWindow } from '../../scheduling/leave/leave-overlap.rules.js';

// Doctor B11 — luật thuần của tạo yêu cầu nghỉ: YN-03…YN-06, YN-09, YN-10, YN-11, YN-21, YN-23.
const base: LeaveRequestInput = {
  hinhThuc: 'CaNgay',
  tuNgay: '2026-12-01',
  denNgay: '2026-12-03',
  lyDo: 'Việc gia đình',
};
const shape = (patch: Partial<LeaveRequestInput>) =>
  validateLeaveShape({ ...base, ...patch }).map((e) => `${e.truong}:${e.ma}`);

describe('validateLeaveShape', () => {
  it('nhận CaNgay nhiều ngày và TheoCa một ngày', () => {
    expect(shape({})).toEqual([]);
    expect(
      shape({ hinhThuc: 'TheoCa', ca: 'CaSang', denNgay: base.tuNgay }),
    ).toEqual([]);
  });

  // UX7 (đổi YN-04): trước đây `TheoCa` nhiều ngày bị 400 `denNgay: NGHI_THEO_CA_CHI_MOT_NGAY`; nay là hợp lệ (một yêu cầu = khoảng ngày + MỘT ca).
  it('DUX7-01 YN-04 (đổi) TheoCa nhiều ngày + một ca hợp lệ, cả CaSang lẫn CaChieu; một ngày vẫn hợp lệ', () => {
    for (const ca of ['CaSang', 'CaChieu'] as const) {
      expect(shape({ hinhThuc: 'TheoCa', ca })).toEqual([]);
      expect(shape({ hinhThuc: 'TheoCa', ca, denNgay: base.tuNgay })).toEqual(
        [],
      );
    }
  });

  it('DUX7-02 TheoCa có tuNgay sau denNgay ⇒ denNgay: KHOANG_NGAY_KHONG_HOP_LE (như CaNgay); ngày liền nhau (biên) hợp lệ', () => {
    expect(
      shape({
        hinhThuc: 'TheoCa',
        ca: 'CaSang',
        tuNgay: '2026-12-05',
        denNgay: '2026-12-01',
      }),
    ).toEqual(['denNgay:KHOANG_NGAY_KHONG_HOP_LE']);
    expect(
      shape({
        hinhThuc: 'TheoCa',
        ca: 'CaSang',
        tuNgay: '2026-12-01',
        denNgay: '2026-12-02',
      }),
    ).toEqual([]);
  });

  it('DUX7-03 mã lỗi NGHI_THEO_CA_CHI_MOT_NGAY không còn được phát ra ở bất kỳ hình dạng nào', () => {
    const shapes: Partial<LeaveRequestInput>[] = [
      { hinhThuc: 'TheoCa', ca: 'CaSang' },
      { hinhThuc: 'TheoCa', ca: 'CaSang', denNgay: '2027-12-31' },
      { hinhThuc: 'TheoCa', ca: 'CaSang', tuNgay: '2026-12-09' },
      { hinhThuc: 'TheoCa', lyDo: '' },
    ];
    for (const patch of shapes)
      expect(shape(patch).join(' ')).not.toContain('NGHI_THEO_CA_CHI_MOT_NGAY');
  });

  it('YN-05 TheoCa thiếu ca / CaToi / ca lạ; CaNgay có ca', () => {
    const one = { hinhThuc: 'TheoCa', denNgay: base.tuNgay } as const;
    expect(shape({ ...one })).toEqual(['ca:CA_BAT_BUOC']);
    expect(shape({ ...one, ca: null })).toEqual(['ca:CA_BAT_BUOC']);
    expect(shape({ ...one, ca: 'CaToi' })).toEqual(['ca:CA_KHONG_HOP_LE']);
    expect(shape({ ...one, ca: 'ca-sang' })).toEqual(['ca:CA_KHONG_HOP_LE']);
    expect(shape({ ca: 'CaSang' })).toEqual(['ca:CA_KHONG_DUOC_CHON']);
  });

  it('DUX7-04 YN-05 với KHOẢNG nhiều ngày: ca vẫn bắt buộc, CaToi và ca lạ vẫn bị từ chối (ca không phụ thuộc số ngày)', () => {
    const range = { hinhThuc: 'TheoCa' } as const; // base: 01/12 đến 03/12
    expect(shape({ ...range })).toEqual(['ca:CA_BAT_BUOC']);
    expect(shape({ ...range, ca: null })).toEqual(['ca:CA_BAT_BUOC']);
    expect(shape({ ...range, ca: 'CaToi' })).toEqual(['ca:CA_KHONG_HOP_LE']);
    expect(shape({ ...range, ca: 'ca-sang' })).toEqual(['ca:CA_KHONG_HOP_LE']);
  });

  it('CaNgay có tuNgay sau denNgay ⇒ denNgay: KHOANG_NGAY_KHONG_HOP_LE; một ngày thì hợp lệ (biên)', () => {
    expect(shape({ tuNgay: '2026-12-05', denNgay: '2026-12-01' })).toEqual([
      'denNgay:KHOANG_NGAY_KHONG_HOP_LE',
    ]);
    expect(shape({ denNgay: base.tuNgay })).toEqual([]);
  });

  it('YN-06 lý do: thiếu / chỉ khoảng trắng ⇒ LY_DO_BAT_BUOC; 1 ký tự / > 500 ⇒ LY_DO_KHONG_HOP_LE', () => {
    expect(shape({ lyDo: undefined as unknown as string })).toEqual([
      'lyDo:LY_DO_BAT_BUOC',
    ]);
    expect(shape({ lyDo: '   \t\n ' })).toEqual(['lyDo:LY_DO_BAT_BUOC']);
    expect(shape({ lyDo: 'a' })).toEqual(['lyDo:LY_DO_KHONG_HOP_LE']);
    expect(shape({ lyDo: 'a'.repeat(501) })).toEqual([
      'lyDo:LY_DO_KHONG_HOP_LE',
    ]);
  });

  it('gom nhiều lỗi của nhiều trường trong một lần', () => {
    // UX7 (đổi): trước là `denNgay: '2026-12-09'` ⇒ NGHI_THEO_CA_CHI_MOT_NGAY; nay lỗi ngày là đảo ngược khoảng (`tuNgay` sau `denNgay`)
    expect(
      shape({
        hinhThuc: 'TheoCa',
        lyDo: '',
        tuNgay: '2026-12-09',
        denNgay: '2026-12-01',
      }),
    ).toEqual([
      'ca:CA_BAT_BUOC',
      'denNgay:KHOANG_NGAY_KHONG_HOP_LE',
      'lyDo:LY_DO_BAT_BUOC',
    ]);
  });
});

describe('normalizeReason (YN-21, YN-23)', () => {
  it('biên 2 và 500 điểm mã được nhận', () => {
    expect(normalizeReason('ab')).toEqual({ ok: true, value: 'ab' });
    expect(normalizeReason('a'.repeat(500)).ok).toBe(true);
  });

  it('cắt khoảng trắng ASCII hai đầu nhưng giữ khoảng trắng ở giữa', () => {
    expect(normalizeReason('  Đi khám \n')).toEqual({
      ok: true,
      value: 'Đi khám',
    });
  });

  it('chuẩn hoá NFC: "e" + dấu rời thành một ký tự', () => {
    expect(normalizeReason('é ')).toEqual({
      ok: false,
      ma: 'LY_DO_KHONG_HOP_LE', // sau NFC chỉ còn 1 điểm mã nên dưới mức tối thiểu 2
    });
    expect(normalizeReason('ée')).toEqual({ ok: true, value: 'ée' });
  });

  it('đếm theo điểm mã: 500 emoji là hợp lệ, 501 thì không', () => {
    expect(normalizeReason('😀'.repeat(500)).ok).toBe(true);
    expect(normalizeReason('😀'.repeat(501))).toEqual({
      ok: false,
      ma: 'LY_DO_KHONG_HOP_LE',
    });
  });

  it('ký tự điều khiển ở giữa bị từ chối; khoảng trắng Unicode ở đầu không bị cắt', () => {
    for (const bad of ['ab\ncd', 'ab\u0000cd', 'ab\tcd', 'ab\u0085cd'])
      expect(normalizeReason(bad), JSON.stringify(bad)).toEqual({
        ok: false,
        ma: 'LY_DO_KHONG_HOP_LE',
      });
    expect(normalizeReason(' ab')).toEqual({
      ok: true,
      value: ' ab',
    });
  });

  it('không phải chuỗi ⇒ LY_DO_BAT_BUOC', () => {
    for (const bad of [undefined, null, 5, {}])
      expect(normalizeReason(bad)).toEqual({
        ok: false,
        ma: 'LY_DO_BAT_BUOC',
      });
  });
});

describe('checkLeaveDates (YN-03, YN-10, YN-21)', () => {
  const today = '2026-12-01';
  const check = (tuNgay: string, denNgay: string) =>
    checkLeaveDates({ tuNgay, denNgay, today });

  it('hôm nay được nhận, hôm qua thì NGAY_NGHI_DA_QUA', () => {
    expect(check('2026-12-01', '2026-12-01')).toBeNull();
    expect(check('2026-11-30', '2026-12-02')).toBe('NGAY_NGHI_DA_QUA');
  });

  it('biên 31 ngày được nhận, 32 ngày thì KHOANG_NGHI_QUA_DAI', () => {
    expect(countDays('2026-12-01', '2026-12-31')).toBe(31);
    expect(check('2026-12-01', '2026-12-31')).toBeNull();
    expect(check('2026-12-01', '2027-01-01')).toBe('KHOANG_NGHI_QUA_DAI');
  });

  it('biên ngày thứ 90 được nhận (2027-03-01), ngày 91 thì NGHI_QUA_XA', () => {
    expect(check('2027-03-01', '2027-03-01')).toBeNull();
    expect(check('2027-03-02', '2027-03-02')).toBe('NGHI_QUA_XA');
  });

  it('khoảng bắt đầu gần nhưng kết thúc quá xa ⇒ NGHI_QUA_XA', () => {
    expect(check('2027-02-20', '2027-03-02')).toBe('NGHI_QUA_XA');
  });

  it('quá khứ được báo trước lỗi dài/xa', () => {
    expect(check('2026-11-01', '2027-12-31')).toBe('NGAY_NGHI_DA_QUA');
  });
});

describe('leaveWindowsOverlap (YN-09, Q21)', () => {
  const caNgay = (a: string, b: string): LeaveWindow => ({
    hinhThucNghi: 'CaNgay',
    ngayBatDau: a,
    ngayKetThuc: b,
    ca: null,
  });
  const theoCa = (ngay: string, ca: 'CaSang' | 'CaChieu'): LeaveWindow => ({
    hinhThucNghi: 'TheoCa',
    ngayBatDau: ngay,
    ngayKetThuc: ngay,
    ca,
  });

  it('CaNgay × CaNgay: giao ngày (kể cả chạm một ngày) ⇒ trùng; không giao ⇒ không', () => {
    expect(leaveWindowsOverlap(caNgay('01', '05'), caNgay('05', '09'))).toBe(
      true,
    );
    expect(leaveWindowsOverlap(caNgay('01', '04'), caNgay('05', '09'))).toBe(
      false,
    );
  });

  it('TheoCa × CaNgay phủ ngày đó ⇒ trùng (cả hai chiều); CaNgay không phủ ⇒ không', () => {
    expect(
      leaveWindowsOverlap(theoCa('03', 'CaSang'), caNgay('01', '05')),
    ).toBe(true);
    expect(
      leaveWindowsOverlap(caNgay('01', '05'), theoCa('03', 'CaChieu')),
    ).toBe(true);
    expect(
      leaveWindowsOverlap(theoCa('07', 'CaSang'), caNgay('01', '05')),
    ).toBe(false);
  });

  it('TheoCa × TheoCa: cùng ngày cùng ca ⇒ trùng; cùng ngày khác ca ⇒ KHÔNG trùng', () => {
    expect(
      leaveWindowsOverlap(theoCa('03', 'CaSang'), theoCa('03', 'CaSang')),
    ).toBe(true);
    expect(
      leaveWindowsOverlap(theoCa('03', 'CaSang'), theoCa('03', 'CaChieu')),
    ).toBe(false);
  });
});

// UX7: `TheoCa` giờ có khoảng ngày + MỘT ca (cột `ca` quyết định phần "ca"). Luật chồng giữ Q21: khoảng phải giao, và hai `TheoCa` phải CÙNG ca.
describe('DUX7-10 leaveWindowsOverlap với TheoCa nhiều ngày (Q21)', () => {
  const range = (
    a: string,
    b: string,
    ca: 'CaSang' | 'CaChieu',
  ): LeaveWindow => ({
    hinhThucNghi: 'TheoCa',
    ngayBatDau: a,
    ngayKetThuc: b,
    ca,
  });
  const wholeDays = (a: string, b: string): LeaveWindow => ({
    hinhThucNghi: 'CaNgay',
    ngayBatDau: a,
    ngayKetThuc: b,
    ca: null,
  });

  it('cùng ca và khoảng giao nhau (kể cả chạm đúng một ngày ở biên) ⇒ trùng', () => {
    expect(
      leaveWindowsOverlap(
        range('2026-12-24', '2026-12-28', 'CaSang'),
        range('2026-12-26', '2026-12-30', 'CaSang'),
      ),
    ).toBe(true);
    expect(
      leaveWindowsOverlap(
        range('2026-12-24', '2026-12-28', 'CaSang'),
        range('2026-12-28', '2026-12-30', 'CaSang'),
      ),
    ).toBe(true);
    expect(
      leaveWindowsOverlap(
        range('2026-12-28', '2026-12-30', 'CaSang'),
        range('2026-12-24', '2026-12-28', 'CaSang'),
      ),
    ).toBe(true);
  });

  it('khác ca dù khoảng giao nhau ⇒ KHÔNG trùng (Ca sáng 24 đến 28 và Ca chiều 26 đến 30)', () => {
    expect(
      leaveWindowsOverlap(
        range('2026-12-24', '2026-12-28', 'CaSang'),
        range('2026-12-26', '2026-12-30', 'CaChieu'),
      ),
    ).toBe(false);
  });

  it('cùng ca nhưng khoảng không giao (liền kề, cách một ngày) ⇒ không trùng', () => {
    expect(
      leaveWindowsOverlap(
        range('2026-12-24', '2026-12-28', 'CaSang'),
        range('2026-12-29', '2026-12-30', 'CaSang'),
      ),
    ).toBe(false);
    expect(
      leaveWindowsOverlap(
        range('2026-12-24', '2026-12-28', 'CaSang'),
        range('2026-12-20', '2026-12-23', 'CaSang'),
      ),
    ).toBe(false);
  });

  it('giao một yêu cầu CaNgay (phủ cả hai ca) ⇒ trùng ở cả hai chiều, miễn là khoảng giao nhau', () => {
    const ts = range('2026-12-24', '2026-12-28', 'CaChieu');
    expect(leaveWindowsOverlap(ts, wholeDays('2026-12-28', '2026-12-31'))).toBe(
      true,
    );
    expect(leaveWindowsOverlap(wholeDays('2026-12-20', '2026-12-24'), ts)).toBe(
      true,
    );
    expect(leaveWindowsOverlap(ts, wholeDays('2026-12-29', '2026-12-31'))).toBe(
      false,
    );
  });
});

// UX7: `isShiftEnded` chỉ so GIỜ trong ngày, nên chỉ được hỏi cho ca của HÔM NAY; ca của ngày sau trong khoảng không bao giờ là "đã kết thúc".
describe('DUX7-16 todaysShift (Q24 với khoảng nhiều ngày)', () => {
  const shift = (ngay: string, ca: 'CaSang' | 'CaChieu', id: string) => ({
    lichLamViecId: id,
    ngay,
    ca,
  });

  it('hôm nay có ca trong các ca bị phủ ⇒ trả đúng ca đó, bất kể thứ tự', () => {
    const today = shift('2026-12-01', 'CaSang', '1');
    expect(
      todaysShift([today, shift('2026-12-02', 'CaSang', '2')], '2026-12-01'),
    ).toBe(today);
    expect(
      todaysShift([shift('2026-12-02', 'CaSang', '2'), today], '2026-12-01'),
    ).toBe(today);
  });

  it('khoảng bắt đầu hôm nay nhưng hôm nay KHÔNG có ca đó (ca đầu tiên là ngày mai) ⇒ null: không kiểm ca đã kết thúc', () => {
    expect(
      todaysShift(
        [
          shift('2026-12-02', 'CaSang', '2'),
          shift('2026-12-03', 'CaSang', '3'),
        ],
        '2026-12-01',
      ),
    ).toBeNull();
  });

  it('khoảng bắt đầu ngày mai, rỗng, hoặc chỉ có ngày đã qua ⇒ null', () => {
    expect(
      todaysShift([shift('2026-12-02', 'CaChieu', '2')], '2026-12-01'),
    ).toBeNull();
    expect(todaysShift([], '2026-12-01')).toBeNull();
    expect(
      todaysShift([shift('2026-11-30', 'CaSang', '0')], '2026-12-01'),
    ).toBeNull();
  });
});

describe('isShiftEnded (YN-11, Q24)', () => {
  const window = {
    ok: true,
    khoang: { tuGiay: 8 * 3600, denGiay: 12 * 3600 },
  } as const;
  const at = (hhmm: string) => new Date(`2026-12-01T${hhmm}:00+07:00`);

  it('trước giờ kết thúc thì chưa kết thúc, đúng giờ kết thúc thì đã kết thúc (biên)', () => {
    expect(isShiftEnded(window, at('10:00'))).toBe(false);
    expect(isShiftEnded(window, at('11:59'))).toBe(false);
    expect(isShiftEnded(window, at('12:00'))).toBe(true);
    expect(isShiftEnded(window, at('15:00'))).toBe(true);
  });

  it('không xác định được giờ ca ⇒ coi là chưa kết thúc', () => {
    expect(isShiftEnded({ ok: false, lyDo: 'ChuaKhaiBao' }, at('23:00'))).toBe(
      false,
    );
  });
});
