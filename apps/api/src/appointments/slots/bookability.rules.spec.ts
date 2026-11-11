import { vi } from 'vitest';
import { deriveSlotStatus } from '../../scheduling/slots/slot-status.rules.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import {
  FACTS_NOW,
  FACTS_SLOT_START,
  OPEN_ALL_DAY,
  bookabilityFacts,
  deepFreeze,
} from '../testing/bookability-facts.js';
import {
  evaluateBookability,
  isLapsedHold,
  type BookabilityFacts,
} from './bookability.rules.js';

// Task B6a — BKA-01…BKA-11 (PLAN booking 7.23; TRACKING 3.14.5): luật THUẦN `evaluateBookability`, không DB, không đồng hồ. Phần U của HG-14, DL-10, DL-15, DL-16 nằm ở BKA-03, 05, 07, 06.
const CODES = BOOKING_ERROR_CODES;
const at = (iso: string) => new Date(iso);
const secondsFrom = (base: Date, seconds: number) =>
  new Date(base.getTime() + seconds * 1000);

const THEO_NGAY_THU_BA = { thuTrongTuan: 2 }; // 10/11/2026 là thứ Ba (ISO 2)

/** Lỗi đầu tiên (hoặc `ok`) của `facts`, gọn để so. */
const verdictOf = (facts: BookabilityFacts) => {
  const verdict = evaluateBookability(facts);
  return verdict.ok ? 'ok' : verdict.code;
};

describe('BKA-01 thứ tự 5.4 bước 3: mỗi kiểm tra hỏng đứng sau kiểm tra trước nó', () => {
  // `facts` hỏng MỌI kiểm tra; mỗi bước sửa đúng một kiểm tra theo thứ tự, nên lỗi báo ra phải là của kiểm tra còn hỏng ĐẦU TIÊN.
  const allBad = bookabilityFacts({
    noShowLocked: true,
    slot: {
      khungGioId: '10',
      ngayGio: FACTS_NOW, // = now ⇒ đã qua
      trangThai: 'DaDat',
      giuChoDen: null,
    },
    doctor: {
      bacSiId: '5',
      khaDung: false,
      chiNhanhId: '1',
      dichVuKhamId: '7',
    },
    shift: { chiNhanhId: '2', ca: 'CaSang' },
    ngayHoatDong: null,
    blockingLeave: { yeuCauNghiPhepId: '1', trangThai: 'DaDuyet' },
    pendingBranchChange: { yeuCauThayDoiChiNhanhId: '1' },
    activeAppointments: [
      { maLichHen: 'A' },
      { maLichHen: 'B' },
      { maLichHen: 'C' },
    ],
    overlaps: [{ maLichHen: 'A', thoiGian: '2026-11-10T01:00:00.000Z' }],
  });

  const steps: {
    expected: string;
    fix: (f: BookabilityFacts) => BookabilityFacts;
  }[] = [
    {
      expected: CODES.BOOKING_LOCKED_NO_SHOW,
      fix: (f) => ({ ...f, noShowLocked: false }),
    },
    {
      expected: CODES.SLOT_BOOKED,
      fix: (f) => ({ ...f, slot: { ...f.slot, trangThai: 'ConTrong' } }),
    },
    {
      expected: CODES.SLOT_PAST,
      fix: (f) => ({ ...f, slot: { ...f.slot, ngayGio: FACTS_SLOT_START } }),
    },
    {
      expected: CODES.DOCTOR_UNAVAILABLE,
      fix: (f) => ({ ...f, doctor: { ...f.doctor, khaDung: true } }),
    },
    {
      expected: CODES.SLOT_INVALID,
      fix: (f) => ({ ...f, shift: { ...f.shift, chiNhanhId: '1' } }),
    },
    {
      expected: CODES.BRANCH_NOT_DECLARED,
      fix: (f) => ({ ...f, ngayHoatDong: OPEN_ALL_DAY }),
    },
    {
      expected: CODES.DOCTOR_ON_LEAVE,
      fix: (f) => ({ ...f, blockingLeave: null }),
    },
    {
      expected: CODES.SLOT_OUTSIDE_NEW_SCHEDULE,
      fix: (f) => ({ ...f, pendingBranchChange: null }),
    },
    {
      expected: CODES.OVER_MAX_APPOINTMENTS,
      fix: (f) => ({ ...f, activeAppointments: [] }),
    },
    {
      expected: CODES.OVERLAPPING_APPOINTMENT,
      fix: (f) => ({ ...f, overlaps: [] }),
    },
  ];

  it.each(steps.map((step, index) => [index + 1, step.expected] as const))(
    'bước %i: kiểm tra còn hỏng đầu tiên trả %s',
    (index, expected) => {
      const facts = steps
        .slice(0, index - 1)
        .reduce((acc, step) => step.fix(acc), allBad);
      expect(verdictOf(facts)).toBe(expected);
    },
  );

  it('sửa hết mọi kiểm tra thì đạt', () => {
    const facts = steps.reduce((acc, step) => step.fix(acc), allBad);
    expect(verdictOf(facts)).toBe('ok');
  });
});

describe('BKA-02 đường đạt', () => {
  it('mọi kiểm tra qua, khung giờ ConTrong ⇒ ok và không cần hết hạn lười', () => {
    expect(evaluateBookability(bookabilityFacts())).toEqual({
      ok: true,
      lapsedHold: null,
    });
  });
});

describe('BKA-03 trạng thái khung giờ và biên nửa mở của giu_cho_den (HG-14, Q3, H8)', () => {
  const held = (giuChoDen: Date | null) =>
    bookabilityFacts({
      slot: {
        khungGioId: '10',
        ngayGio: FACTS_SLOT_START,
        trangThai: 'DangGiuCho',
        giuChoDen,
      },
    });

  it('DaDat ⇒ SLOT_BOOKED; HetHan đã lưu ⇒ SLOT_PAST (booking không ghi HetHan, Q3)', () => {
    const slot = (trangThai: 'DaDat' | 'HetHan') => ({
      khungGioId: '10',
      ngayGio: FACTS_SLOT_START,
      trangThai,
      giuChoDen: null,
    });
    expect(verdictOf(bookabilityFacts({ slot: slot('DaDat') }))).toBe(
      CODES.SLOT_BOOKED,
    );
    expect(verdictOf(bookabilityFacts({ slot: slot('HetHan') }))).toBe(
      CODES.SLOT_PAST,
    );
  });

  it('HG-14: DangGiuCho, giu_cho_den = now + 1s ⇒ SLOT_HELD (còn hạn)', () => {
    expect(verdictOf(held(secondsFrom(FACTS_NOW, 1)))).toBe(CODES.SLOT_HELD);
  });

  it('HG-14: DangGiuCho, giu_cho_den ĐÚNG BẰNG now ⇒ coi là trống (nửa mở: đúng mốc là hết)', () => {
    expect(evaluateBookability(held(FACTS_NOW))).toEqual({
      ok: true,
      lapsedHold: { lichHenId: null, maLichHen: null },
    });
  });

  it('DangGiuCho, giu_cho_den = now − 1s hoặc NULL ⇒ coi là trống, kèm lịch giữ nếu có', () => {
    const holder = { lichHenId: '77', maLichHen: 'CLX-20261102-AAAAA' };
    expect(
      evaluateBookability({
        ...held(secondsFrom(FACTS_NOW, -1)),
        slotHolder: holder,
      }),
    ).toEqual({ ok: true, lapsedHold: holder });
    expect(evaluateBookability(held(null))).toEqual({
      ok: true,
      lapsedHold: { lichHenId: null, maLichHen: null },
    });
  });

  it('isLapsedHold: chỉ DangGiuCho mới có thể hết hạn', () => {
    const old = secondsFrom(FACTS_NOW, -60);
    expect(
      isLapsedHold({ trangThai: 'ConTrong', giuChoDen: old }, FACTS_NOW),
    ).toBe(false);
    expect(
      isLapsedHold({ trangThai: 'DaDat', giuChoDen: old }, FACTS_NOW),
    ).toBe(false);
    expect(
      isLapsedHold({ trangThai: 'DangGiuCho', giuChoDen: old }, FACTS_NOW),
    ).toBe(true);
  });
});

describe('BKA-04 nhất quán với deriveSlotStatus của scheduling/ (một định nghĩa "trống", "đang giữ", "đã đặt", Q3)', () => {
  const stored = ['ConTrong', 'DangGiuCho', 'DaDat', 'HetHan'] as const;
  const deadlines = [null, -1, 0, 1].map((offset) =>
    offset === null ? null : secondsFrom(FACTS_NOW, offset),
  );
  const grid = stored.flatMap((trangThai) =>
    deadlines.map((giuChoDen) => [trangThai, giuChoDen] as const),
  );

  it.each(grid)(
    'khung giờ ở tương lai, lưu %s, giu_cho_den %s',
    (trangThai, giuChoDen) => {
      const derived = deriveSlotStatus({
        ngayGio: FACTS_SLOT_START,
        trangThai,
        giuChoDen,
        now: FACTS_NOW,
      });
      const expected = {
        DaDat: CODES.SLOT_BOOKED,
        DangGiuCho: CODES.SLOT_HELD,
        HetHan: CODES.SLOT_PAST,
        ConTrong: 'ok',
      }[derived];
      const facts = bookabilityFacts({
        slot: {
          khungGioId: '10',
          ngayGio: FACTS_SLOT_START,
          trangThai,
          giuChoDen,
        },
      });
      expect(verdictOf(facts)).toBe(expected);
    },
  );
});

describe('BKA-05 giờ bắt đầu phải sau now (Q5, DL-10 phần U)', () => {
  const startingAt = (ngayGio: Date) =>
    bookabilityFacts({
      slot: {
        khungGioId: '10',
        ngayGio,
        trangThai: 'ConTrong',
        giuChoDen: null,
      },
    });

  it('now − 1s và ĐÚNG now ⇒ SLOT_PAST; now + 1s ⇒ đạt', () => {
    expect(verdictOf(startingAt(secondsFrom(FACTS_NOW, -1)))).toBe(
      CODES.SLOT_PAST,
    );
    expect(verdictOf(startingAt(FACTS_NOW))).toBe(CODES.SLOT_PAST);
    expect(verdictOf(startingAt(secondsFrom(FACTS_NOW, 1)))).toBe('ok');
  });
});

describe('BKA-06 bác sĩ khả dụng và chi nhánh của ca (D12, DL-16 phần U)', () => {
  it('bác sĩ không khả dụng ⇒ DOCTOR_UNAVAILABLE', () => {
    const doctor = {
      bacSiId: '5',
      khaDung: false,
      chiNhanhId: '1',
      dichVuKhamId: '7',
    };
    expect(verdictOf(bookabilityFacts({ doctor }))).toBe(
      CODES.DOCTOR_UNAVAILABLE,
    );
  });

  it('chi nhánh ghi trên ca khác chi nhánh hiện tại của bác sĩ ⇒ SLOT_INVALID', () => {
    expect(
      verdictOf(bookabilityFacts({ shift: { chiNhanhId: '2', ca: 'CaSang' } })),
    ).toBe(CODES.SLOT_INVALID);
  });
});

describe('BKA-07 giờ nhận khám của chi nhánh (A6, DL-15 phần U)', () => {
  const slotAt = (iso: string) => ({
    khungGioId: '10',
    ngayGio: at(iso),
    trangThai: 'ConTrong' as const,
    giuChoDen: null,
  });

  it('bốn lý do ⇒ bốn mã, kèm thứ và giờ mở, đóng', () => {
    const failure = (facts: BookabilityFacts) => {
      const verdict = evaluateBookability(facts);
      return verdict.ok ? null : [verdict.code, verdict.chiTiet];
    };
    expect(failure(bookabilityFacts({ ngayHoatDong: null }))).toEqual([
      CODES.BRANCH_NOT_DECLARED,
      THEO_NGAY_THU_BA,
    ]);
    expect(
      failure(
        bookabilityFacts({
          ngayHoatDong: { hoatDong: false, sang: null, chieu: null },
        }),
      ),
    ).toEqual([CODES.BRANCH_CLOSED, THEO_NGAY_THU_BA]);
    expect(
      failure(
        bookabilityFacts({
          shift: { chiNhanhId: '1', ca: 'CaChieu' },
          ngayHoatDong: { ...OPEN_ALL_DAY, chieu: null },
        }),
      ),
    ).toEqual([
      CODES.SHIFT_NOT_ACCEPTED,
      { ...THEO_NGAY_THU_BA, gioMo: '08:00', gioDong: '12:00' },
    ]);
    expect(
      failure(
        bookabilityFacts({ slot: slotAt('2026-11-10T11:45:00+07:00') }), // kết thúc 12:15 > 12:00
      ),
    ).toEqual([
      CODES.OUTSIDE_OPENING_HOURS,
      { ...THEO_NGAY_THU_BA, gioMo: '08:00', gioDong: '17:00' },
    ]);
  });

  it('hai biên đạt: bắt đầu đúng giờ bắt đầu khoảng, kết thúc đúng giờ kết thúc khoảng', () => {
    // 08:00 (đúng giờ mở của khoảng sáng) và 11:30 + 30 phút = 12:00 (đúng giờ đóng)
    expect(
      verdictOf(
        bookabilityFacts({ slot: slotAt('2026-11-10T08:00:00+07:00') }),
      ),
    ).toBe('ok');
    expect(
      verdictOf(
        bookabilityFacts({ slot: slotAt('2026-11-10T11:30:00+07:00') }),
      ),
    ).toBe('ok');
    // và một giây trước giờ mở thì ngoài khoảng
    expect(
      verdictOf(
        bookabilityFacts({ slot: slotAt('2026-11-10T07:59:59+07:00') }),
      ),
    ).toBe(CODES.OUTSIDE_OPENING_HOURS);
  });
});

describe('BKA-08 nghỉ phép và vùng bị loại (H5, H6)', () => {
  it.each(['ChoDuyet', 'DaDuyet'] as const)(
    'yêu cầu nghỉ phép %s đều chặn ⇒ DOCTOR_ON_LEAVE',
    (trangThai) => {
      const facts = bookabilityFacts({
        blockingLeave: { yeuCauNghiPhepId: '9', trangThai },
      });
      expect(verdictOf(facts)).toBe(CODES.DOCTOR_ON_LEAVE);
    },
  );

  it('thay đổi chi nhánh đã duyệt loại khung giờ ⇒ SLOT_OUTSIDE_NEW_SCHEDULE', () => {
    const facts = bookabilityFacts({
      pendingBranchChange: { yeuCauThayDoiChiNhanhId: '3' },
    });
    expect(verdictOf(facts)).toBe(CODES.SLOT_OUTSIDE_NEW_SCHEDULE);
  });
});

describe('BKA-09 số lịch đang hoạt động (Q12) và lịch chủ hết hạn (câu (i))', () => {
  const active = (...codes: string[]) =>
    codes.map((maLichHen) => ({ maLichHen }));
  const lapsedSlot = {
    khungGioId: '10',
    ngayGio: FACTS_SLOT_START,
    trangThai: 'DangGiuCho' as const,
    giuChoDen: secondsFrom(FACTS_NOW, -60),
  };
  const holder = { lichHenId: '77', maLichHen: 'HOLDER' };

  it('thiếu một thì đạt; đúng bằng tối đa thì từ chối kèm chiTiet.toiDa', () => {
    expect(
      verdictOf(bookabilityFacts({ activeAppointments: active('A', 'B') })),
    ).toBe('ok');
    const verdict = evaluateBookability(
      bookabilityFacts({ activeAppointments: active('A', 'B', 'C') }),
    );
    expect(verdict).toEqual({
      ok: false,
      code: CODES.OVER_MAX_APPOINTMENTS,
      chiTiet: { toiDa: 3 },
    });
  });

  it('lịch chủ đã hết hạn của CHÍNH khung giờ này không tính (người đặt lại không bị từ chối oan)', () => {
    const facts = bookabilityFacts({
      slot: lapsedSlot,
      slotHolder: holder,
      soLichHenToiDa: 3,
      activeAppointments: active('HOLDER', 'A', 'B'),
    });
    expect(evaluateBookability(facts)).toEqual({
      ok: true,
      lapsedHold: holder,
    });
  });

  it('lịch ChoThanhToan hết hạn của khung giờ KHÁC vẫn tính (Q4)', () => {
    const facts = bookabilityFacts({
      slot: lapsedSlot,
      slotHolder: holder,
      soLichHenToiDa: 1,
      activeAppointments: active('OTHER-SLOT'),
    });
    expect(verdictOf(facts)).toBe(CODES.OVER_MAX_APPOINTMENTS);
  });

  it('khung giờ chưa hết hạn thì không loại lịch nào (không có lịch chủ để loại)', () => {
    const facts = bookabilityFacts({
      slotHolder: holder, // dữ kiện thừa: khung giờ ConTrong nên không có lịch chủ hết hạn
      soLichHenToiDa: 1,
      activeAppointments: active('HOLDER'),
    });
    expect(verdictOf(facts)).toBe(CODES.OVER_MAX_APPOINTMENTS);
  });
});

describe('BKA-10 chồng lấn (Q10, H10)', () => {
  const overlap = (
    maLichHen: string,
    thoiGian = '2026-11-10T01:00:00.000Z',
  ) => ({
    maLichHen,
    thoiGian,
  });

  it('chiTiet chỉ có mã và giờ của lịch trùng (đầu tiên), không trường riêng tư', () => {
    const verdict = evaluateBookability(
      bookabilityFacts({
        overlaps: [
          overlap('FIRST'),
          overlap('SECOND', '2026-11-10T02:00:00.000Z'),
        ],
      }),
    );
    expect(verdict).toEqual({
      ok: false,
      code: CODES.OVERLAPPING_APPOINTMENT,
      chiTiet: { maLichHen: 'FIRST', thoiGian: '2026-11-10T01:00:00.000Z' },
    });
  });

  it('lịch chủ hết hạn của chính khung giờ này bị bỏ qua, lịch trùng khác thì vẫn báo', () => {
    const slot = {
      khungGioId: '10',
      ngayGio: FACTS_SLOT_START,
      trangThai: 'DangGiuCho' as const,
      giuChoDen: secondsFrom(FACTS_NOW, -1),
    };
    const holder = { lichHenId: '77', maLichHen: 'HOLDER' };
    expect(
      verdictOf(
        bookabilityFacts({
          slot,
          slotHolder: holder,
          overlaps: [overlap('HOLDER')],
        }),
      ),
    ).toBe('ok');
    const verdict = evaluateBookability(
      bookabilityFacts({
        slot,
        slotHolder: holder,
        overlaps: [overlap('HOLDER'), overlap('OTHER')],
      }),
    );
    expect(verdict).toMatchObject({
      ok: false,
      code: CODES.OVERLAPPING_APPOINTMENT,
      chiTiet: { maLichHen: 'OTHER' },
    });
  });
});

describe('BKA-11 tính thuần (H8)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('không đổi facts (đóng băng sâu) và cùng facts thì cùng kết quả', () => {
    const facts = deepFreeze(
      bookabilityFacts({
        activeAppointments: [{ maLichHen: 'A' }],
        overlaps: [{ maLichHen: 'B', thoiGian: '2026-11-10T01:00:00.000Z' }],
      }),
    );
    const before = JSON.stringify(facts);
    const first = evaluateBookability(facts);
    const second = evaluateBookability(facts);
    expect(second).toEqual(first);
    expect(JSON.stringify(facts)).toBe(before);
  });

  it('không đọc đồng hồ: đổi đồng hồ hệ thống thì kết quả không đổi', () => {
    const facts = bookabilityFacts();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('1999-01-01T00:00:00Z'));
    const early = evaluateBookability(facts);
    vi.setSystemTime(new Date('2099-01-01T00:00:00Z'));
    const late = evaluateBookability(facts);
    expect(early).toEqual(late);
    expect(early).toEqual({ ok: true, lapsedHold: null });
  });
});
