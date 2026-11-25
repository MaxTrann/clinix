import { vi } from 'vitest';
import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { evaluateBookability } from '../slots/bookability.rules.js';
import type { BookabilityFacts } from '../slots/bookability.rules.js';
import {
  FACTS_NOW,
  FACTS_SLOT_START,
  OPEN_ALL_DAY,
  bookabilityFacts,
  deepFreeze,
} from '../testing/bookability-facts.js';
import {
  BRANCH_ID,
  OLD_APPOINTMENT_CODE,
  OWNER_ID,
  reschedulabilityFacts,
  rescheduleSource,
  verdictLabel,
} from '../testing/reschedulability-facts.js';
import {
  evaluateReschedulability,
  isInScope,
  isPastRescheduleDeadline,
} from './reschedulability.rules.js';
import type {
  ReschedulabilityFacts,
  RescheduleActor,
  RescheduleSource,
} from './reschedule.types.js';

// reschedule B2 — KDL-01…KDL-22 phần U (PLAN reschedule 7.1): bộ luật THUẦN `evaluateReschedulability`, không DB, không đồng hồ. Phần I của cùng mã ở `reschedule.reader.int-spec.ts`.
const CODES = BOOKING_ERROR_CODES;
const secondsFrom = (base: Date, seconds: number) =>
  new Date(base.getTime() + seconds * 1000);
const minutesFrom = (base: Date, minutes: number) =>
  secondsFrom(base, minutes * 60);
const at = (iso: string) => new Date(iso);

/** Kết quả gọn để so: `ok:<nhánh>`, mã của `Rule`, hoặc tên `kind` của lỗi có kiểu khác. */
const outcome = (facts: ReschedulabilityFacts) =>
  verdictLabel(evaluateReschedulability(facts));

const withSource = (
  overrides: Partial<RescheduleSource>,
  rest: Partial<ReschedulabilityFacts> = {},
) => reschedulabilityFacts({ source: rescheduleSource(overrides), ...rest });

const withBookability = (
  overrides: Partial<BookabilityFacts>,
  rest: Partial<ReschedulabilityFacts> = {},
) =>
  reschedulabilityFacts({
    bookability: bookabilityFacts({
      thayThe: { maLichHen: OLD_APPOINTMENT_CODE },
      activeAppointments: [{ maLichHen: OLD_APPOINTMENT_CODE }],
      ...overrides,
    }),
    ...rest,
  });

// Mỗi cách đổi lịch cùng một lịch cũ nằm trong phạm vi của người đổi
const ACTORS: [string, RescheduleActor][] = [
  ['TuDoi', { via: 'TuDoi', accountId: OWNER_ID }],
  ['DoiHo', { via: 'DoiHo', chiNhanhId: BRANCH_ID }],
  ['DuyetYeuCau (Chi nhánh)', { via: 'DuyetYeuCau', chiNhanhId: BRANCH_ID }],
  ['DuyetYeuCau (Toàn hệ thống)', { via: 'DuyetYeuCau', chiNhanhId: null }],
];
const NON_SELF_ACTORS = ACTORS.filter(([, actor]) => actor.via !== 'TuDoi');

describe('KDL-01 đường đạt', () => {
  it.each(ACTORS)(
    '%s: mọi điều kiện đủ ⇒ đổi ngay, không cần hết hạn lười',
    (_name, actor) => {
      expect(
        evaluateReschedulability(reschedulabilityFacts({ actor })),
      ).toEqual({ ok: true, branch: 'Reschedule', lapsedHold: null });
    },
  );
});

describe('KDL-02 trạng thái nguồn (Q7 (a), A3, Q31)', () => {
  const OTHER_STATES = [
    'ChoThanhToan',
    'DaTiepDon',
    'HoanThanh',
    'DaHuy',
    'VangMat',
  ] as const;

  describe.each(ACTORS)('%s', (_name, actor) => {
    it.each(OTHER_STATES)(
      '%s ⇒ LICH_HEN_KHONG_CHO_DOI kèm chiTiet.trangThai',
      (trangThai) => {
        const verdict = evaluateReschedulability(
          withSource({ trangThai }, { actor }),
        );
        expect(verdict).toEqual({
          ok: false,
          failure: {
            kind: 'Rule',
            code: CODES.NOT_RESCHEDULABLE,
            chiTiet: { trangThai },
          },
        });
      },
    );
  });

  it.each(NON_SELF_ACTORS)(
    '%s: lịch DaDoiLich ⇒ LICH_HEN_KHONG_CHO_DOI (nhân sự thấy được lịch đã đổi)',
    (_name, actor) => {
      expect(outcome(withSource({ trangThai: 'DaDoiLich' }, { actor }))).toBe(
        CODES.NOT_RESCHEDULABLE,
      );
    },
  );

  it('Bệnh nhân với lịch DaDoiLich ⇒ NotFound, GIỐNG HỆT kết quả của "không có lịch" (cùng một thân 404)', () => {
    const replaced = evaluateReschedulability(
      withSource({ trangThai: 'DaDoiLich' }),
    );
    const missing = evaluateReschedulability(
      reschedulabilityFacts({ source: null }),
    );
    expect(replaced).toStrictEqual(missing);
    expect(missing).toEqual({ ok: false, failure: { kind: 'NotFound' } });
  });
});

describe('KDL-03 hạn đổi của Bệnh nhân tự đổi (Q3, H8: nửa mở)', () => {
  const thoiGianOf = (thoiGian: Date, now: Date = FACTS_NOW) =>
    withSource({ thoiGian }, { now });

  it('thoi_gian ĐÚNG BẰNG now ⇒ LICH_HEN_DA_QUA_GIO; now + 1s ⇒ đạt; now − 1s ⇒ đã qua', () => {
    expect(outcome(thoiGianOf(FACTS_NOW))).toBe(CODES.RESCHEDULE_TOO_LATE);
    expect(outcome(thoiGianOf(secondsFrom(FACTS_NOW, 1)))).toBe(
      'ok:Reschedule',
    );
    expect(outcome(thoiGianOf(secondsFrom(FACTS_NOW, -1)))).toBe(
      CODES.RESCHEDULE_TOO_LATE,
    );
  });

  it('check_in_sau_phut lớn KHÔNG nới hạn của TuDoi (cửa sổ tiếp đón chỉ dành cho Lễ tân)', () => {
    const facts = withSource(
      { thoiGian: secondsFrom(FACTS_NOW, -60) },
      { config: { soLanTuDoiLichToiDa: 2, checkInSauPhut: 1000 } },
    );
    expect(outcome(facts)).toBe(CODES.RESCHEDULE_TOO_LATE);
  });

  // So bằng `getTime()`: thứ tự CHUỖI của `Date` (ví dụ `toString()` bắt đầu bằng tên thứ) khác thứ tự thời gian ở các cặp dưới đây
  it.each([
    [
      'Chủ nhật 15/11 sau Thứ ba 10/11 (chuỗi "Sun" < "Tue")',
      '2026-11-10T08:00:00+07:00',
      '2026-11-15T08:00:00+07:00',
      'ok:Reschedule',
    ],
    [
      'Thứ ba 10/11 trước Chủ nhật 15/11 (chuỗi "Tue" > "Sun")',
      '2026-11-15T08:00:00+07:00',
      '2026-11-10T08:00:00+07:00',
      CODES.RESCHEDULE_TOO_LATE,
    ],
    [
      'qua nửa đêm năm mới: 01/01/2027 00:00:00 sau 31/12/2026 23:59:59',
      '2026-12-31T23:59:59+07:00',
      '2027-01-01T00:00:00+07:00',
      'ok:Reschedule',
    ],
  ])('%s', (_name, nowIso, thoiGianIso, expected) => {
    expect(outcome(thoiGianOf(at(thoiGianIso), at(nowIso)))).toBe(expected);
  });

  it('isPastRescheduleDeadline: cùng quy tắc, gọi trực tiếp', () => {
    const base = {
      via: 'TuDoi' as const,
      thoiGian: FACTS_NOW,
      checkInSauPhut: 15,
      now: FACTS_NOW,
    };
    expect(isPastRescheduleDeadline(base)).toBe(true);
    expect(
      isPastRescheduleDeadline({ ...base, now: secondsFrom(FACTS_NOW, -1) }),
    ).toBe(false);
  });
});

describe('KDL-04 hạn đổi của Lễ tân đổi hộ và duyệt yêu cầu (Q3, check_in_sau_phut)', () => {
  const lateBy = (minutes: number, seconds: number, checkInSauPhut: number) =>
    withSource(
      { thoiGian: secondsFrom(minutesFrom(FACTS_NOW, -minutes), -seconds) },
      { config: { soLanTuDoiLichToiDa: 2, checkInSauPhut } },
    );

  describe.each(NON_SELF_ACTORS)('%s', (_name, actor) => {
    const run = (facts: ReschedulabilityFacts) => outcome({ ...facts, actor });

    it('thoi_gian + check_in_sau_phut ĐÚNG BẰNG now ⇒ LICH_HEN_DA_QUA_GIO; sớm hơn 1 giây ⇒ đạt; muộn hơn 1 giây ⇒ đã qua', () => {
      expect(run(lateBy(15, 0, 15))).toBe(CODES.RESCHEDULE_TOO_LATE);
      expect(run(lateBy(15, -1, 15))).toBe('ok:Reschedule');
      expect(run(lateBy(15, 1, 15))).toBe(CODES.RESCHEDULE_TOO_LATE);
    });

    it('check_in_sau_phut = 0 ⇒ biên như TuDoi (đúng mốc là đã qua)', () => {
      expect(run(lateBy(0, 0, 0))).toBe(CODES.RESCHEDULE_TOO_LATE);
      expect(run(lateBy(0, -1, 0))).toBe('ok:Reschedule');
    });

    it('cửa sổ tính bằng PHÚT (1 phút = 60 giây)', () => {
      expect(run(lateBy(1, 0, 1))).toBe(CODES.RESCHEDULE_TOO_LATE);
      expect(run(lateBy(0, 59, 1))).toBe('ok:Reschedule');
    });

    it('muộn 10 phút so với cửa sổ 15 phút: nhân sự vẫn đổi được, Bệnh nhân tự đổi thì không', () => {
      const facts = lateBy(10, 0, 15);
      expect(run(facts)).toBe('ok:Reschedule');
      expect(outcome({ ...facts, actor: ACTORS[0]![1] })).toBe(
        CODES.RESCHEDULE_TOO_LATE,
      );
    });
  });
});

describe('KDL-05 khung giờ đích trùng khung giờ cũ', () => {
  it('cùng khung_gio_id ⇒ KHUNG_GIO_TRUNG_LICH_CU; khung giờ khác thì đạt', () => {
    const same = withBookability({
      slot: { ...bookabilityFacts().slot, khungGioId: '11' },
    });
    expect(outcome(same)).toBe(CODES.SAME_AS_CURRENT_SLOT);
    expect(outcome(reschedulabilityFacts())).toBe('ok:Reschedule');
  });

  it('không có khung giờ đích ⇒ SlotNotFound (404 KHUNG_GIO_KHONG_TON_TAI)', () => {
    expect(
      evaluateReschedulability(reschedulabilityFacts({ bookability: null })),
    ).toEqual({ ok: false, failure: { kind: 'SlotNotFound' } });
  });
});

describe('KDL-06, KDL-07, KDL-08 khung giờ đích phải cùng bác sĩ, dịch vụ, chi nhánh của lịch cũ (Q7 (c))', () => {
  const doctorOf = (patch: Partial<BookabilityFacts['doctor']>) =>
    withBookability({ doctor: { ...bookabilityFacts().doctor, ...patch } });

  it('KDL-06: bác sĩ của khung giờ đích khác ⇒ KHUNG_GIO_KHAC_BAC_SI', () => {
    expect(outcome(doctorOf({ bacSiId: '6' }))).toBe(CODES.OTHER_DOCTOR_SLOT);
  });

  it('KDL-07: bác sĩ đã đổi dịch vụ chính so với lúc đặt ⇒ LICH_HEN_KHAC_DICH_VU_HIEN_TAI', () => {
    expect(outcome(doctorOf({ dichVuKhamId: '8' }))).toBe(
      CODES.SERVICE_CHANGED,
    );
  });

  it('KDL-08: bác sĩ đã đổi chi nhánh so với lúc đặt ⇒ LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI', () => {
    expect(outcome(doctorOf({ chiNhanhId: '2' }))).toBe(CODES.BRANCH_CHANGED);
  });
});

describe('KDL-09 khoá no-show không chặn đổi lịch (Q7 (b))', () => {
  it.each(ACTORS)(
    '%s: noShowLocked = true nhét thẳng vào dữ kiện đặt lịch vẫn đạt (luật ép false)',
    (_name, actor) => {
      expect(outcome(withBookability({ noShowLocked: true }, { actor }))).toBe(
        'ok:Reschedule',
      );
    },
  );

  it('cùng dữ kiện đó, luật ĐẶT LỊCH vẫn chặn (đối chứng: chỉ đổi lịch được miễn)', () => {
    const facts = bookabilityFacts({ noShowLocked: true });
    expect(evaluateBookability(facts)).toEqual({
      ok: false,
      code: CODES.BOOKING_LOCKED_NO_SHOW,
    });
  });
});

describe('KDL-10 số lịch tối đa khi đổi lịch (Q7 (e), L13): lịch đang đổi không tính', () => {
  const active = (...codes: string[]) =>
    codes.map((maLichHen) => ({ maLichHen }));
  const replacing = { thayThe: { maLichHen: OLD_APPOINTMENT_CODE } };

  it('đủ toiDa lịch nhưng một là lịch đang đổi ⇒ đạt', () => {
    expect(
      outcome(
        withBookability({
          ...replacing,
          soLichHenToiDa: 3,
          activeAppointments: active(OLD_APPOINTMENT_CODE, 'A', 'B'),
        }),
      ),
    ).toBe('ok:Reschedule');
  });

  it('toiDa lịch KHÁC ⇒ VUOT_SO_LICH_HEN_TOI_DA kèm chiTiet.toiDa', () => {
    const verdict = evaluateReschedulability(
      withBookability({
        ...replacing,
        soLichHenToiDa: 3,
        activeAppointments: active(OLD_APPOINTMENT_CODE, 'A', 'B', 'C'),
      }),
    );
    expect(verdict).toEqual({
      ok: false,
      failure: {
        kind: 'Rule',
        code: CODES.OVER_MAX_APPOINTMENTS,
        chiTiet: { toiDa: 3 },
      },
    });
  });

  it('luật đổi lịch KHÔNG ghi đè thayThe do reader đặt: không có thayThe thì lịch cũ tính như lịch thường', () => {
    expect(
      outcome(
        withBookability({
          thayThe: null,
          soLichHenToiDa: 3,
          activeAppointments: active(OLD_APPOINTMENT_CODE, 'A', 'B'),
        }),
      ),
    ).toBe(CODES.OVER_MAX_APPOINTMENTS);
  });
});

describe('KDL-11 chồng giờ khi đổi lịch (Q7 (e))', () => {
  const overlap = (
    maLichHen: string,
    thoiGian = '2026-11-09T01:00:00.000Z',
  ) => ({ maLichHen, thoiGian });

  it('chồng chính lịch cũ (dịch 15 phút trong dịch vụ 30 phút) ⇒ cho', () => {
    expect(
      outcome(withBookability({ overlaps: [overlap(OLD_APPOINTMENT_CODE)] })),
    ).toBe('ok:Reschedule');
  });

  it('chồng một lịch KHÁC của cùng hồ sơ ⇒ LICH_HEN_TRUNG_THOI_GIAN, kể cả khi danh sách có cả lịch cũ', () => {
    const verdict = evaluateReschedulability(
      withBookability({
        overlaps: [overlap(OLD_APPOINTMENT_CODE), overlap('KHAC')],
      }),
    );
    expect(verdict).toEqual({
      ok: false,
      failure: {
        kind: 'Rule',
        code: CODES.OVERLAPPING_APPOINTMENT,
        chiTiet: { maLichHen: 'KHAC', thoiGian: '2026-11-09T01:00:00.000Z' },
      },
    });
  });
});

describe('KDL-12 các mã còn lại của chín bước đặt lịch đi qua nguyên vẹn (mã và chiTiet)', () => {
  const slotOf = (patch: Partial<BookabilityFacts['slot']>) => ({
    ...bookabilityFacts().slot,
    ...patch,
  });
  const cases: [string, Partial<BookabilityFacts>, string][] = [
    [
      'khung giờ đã đặt',
      { slot: slotOf({ trangThai: 'DaDat' }) },
      CODES.SLOT_BOOKED,
    ],
    [
      'khung giờ đang giữ còn hạn',
      {
        slot: slotOf({
          trangThai: 'DangGiuCho',
          giuChoDen: secondsFrom(FACTS_NOW, 3600),
        }),
      },
      CODES.SLOT_HELD,
    ],
    [
      'khung giờ đã hết hạn lưu',
      { slot: slotOf({ trangThai: 'HetHan' }) },
      CODES.SLOT_PAST,
    ],
    [
      'giờ bắt đầu = now',
      { slot: slotOf({ ngayGio: FACTS_NOW }) },
      CODES.SLOT_PAST,
    ],
    [
      'bác sĩ không khả dụng',
      { doctor: { ...bookabilityFacts().doctor, khaDung: false } },
      CODES.DOCTOR_UNAVAILABLE,
    ],
    [
      'ca ghi chi nhánh khác chi nhánh bác sĩ',
      { shift: { chiNhanhId: '2', ca: 'CaSang' } },
      CODES.SLOT_INVALID,
    ],
    [
      'chi nhánh chưa khai báo giờ',
      { ngayHoatDong: null },
      CODES.BRANCH_NOT_DECLARED,
    ],
    [
      'chi nhánh nghỉ',
      { ngayHoatDong: { hoatDong: false, sang: null, chieu: null } },
      CODES.BRANCH_CLOSED,
    ],
    [
      'chi nhánh không nhận khám buổi chiều',
      {
        shift: { chiNhanhId: '1', ca: 'CaChieu' },
        ngayHoatDong: { ...OPEN_ALL_DAY, chieu: null },
      },
      CODES.SHIFT_NOT_ACCEPTED,
    ],
    [
      'ngoài giờ hoạt động',
      { slot: slotOf({ ngayGio: at('2026-11-10T11:45:00+07:00') }) },
      CODES.OUTSIDE_OPENING_HOURS,
    ],
    [
      'bác sĩ nghỉ phép',
      { blockingLeave: { yeuCauNghiPhepId: '1', trangThai: 'DaDuyet' } },
      CODES.DOCTOR_ON_LEAVE,
    ],
    [
      'vùng bị loại bởi thay đổi chi nhánh đã duyệt',
      { pendingBranchChange: { yeuCauThayDoiChiNhanhId: '1' } },
      CODES.SLOT_OUTSIDE_NEW_SCHEDULE,
    ],
  ];

  it.each(cases)('%s ⇒ đúng mã của luật đặt lịch', (_name, patch, code) => {
    const facts = withBookability(patch);
    const direct = evaluateBookability({
      ...facts.bookability!,
      noShowLocked: false,
    });
    if (direct.ok) throw new Error('ca này phải bị luật đặt lịch từ chối');
    expect(direct.code).toBe(code);
    expect(evaluateReschedulability(facts)).toEqual({
      ok: false,
      failure: {
        kind: 'Rule',
        code,
        ...(direct.chiTiet === undefined ? {} : { chiTiet: direct.chiTiet }),
      },
    });
  });

  // Thứ tự lỗi riêng của đổi lịch (PLAN 5.6): `facts` hỏng MỌI điều kiện, mỗi bước sửa đúng một điều kiện theo thứ tự, nên lỗi báo ra phải là của điều kiện còn hỏng ĐẦU TIÊN.
  type Mutate = (facts: ReschedulabilityFacts) => ReschedulabilityFacts;
  const patchSource =
    (patch: Partial<RescheduleSource>): Mutate =>
    (facts) => ({
      ...facts,
      source: facts.source === null ? null : { ...facts.source, ...patch },
    });
  const patchBookability =
    (patch: (b: BookabilityFacts) => BookabilityFacts): Mutate =>
    (facts) => ({
      ...facts,
      bookability: facts.bookability === null ? null : patch(facts.bookability),
    });
  const STEPS: { expected: string; breakIt: Mutate }[] = [
    { expected: 'NotFound', breakIt: patchSource({ benhNhanId: '999' }) },
    {
      expected: CODES.NOT_RESCHEDULABLE,
      breakIt: patchSource({ trangThai: 'DaTiepDon' }),
    },
    {
      expected: CODES.RESCHEDULE_TOO_LATE,
      breakIt: (f) => patchSource({ thoiGian: f.now })(f),
    },
    {
      expected: 'ProfileInactive',
      breakIt: (f) => ({ ...f, profileActive: false }),
    },
    { expected: 'SlotNotFound', breakIt: (f) => ({ ...f, bookability: null }) },
    {
      expected: CODES.SAME_AS_CURRENT_SLOT,
      breakIt: patchBookability((b) => ({
        ...b,
        slot: { ...b.slot, khungGioId: rescheduleSource().khungGioId },
      })),
    },
    {
      expected: CODES.OTHER_DOCTOR_SLOT,
      breakIt: patchBookability((b) => ({
        ...b,
        doctor: { ...b.doctor, bacSiId: '6' },
      })),
    },
    {
      expected: CODES.SERVICE_CHANGED,
      breakIt: patchBookability((b) => ({
        ...b,
        doctor: { ...b.doctor, dichVuKhamId: '8' },
      })),
    },
    {
      expected: CODES.BRANCH_CHANGED,
      breakIt: patchBookability((b) => ({
        ...b,
        doctor: { ...b.doctor, chiNhanhId: '2' },
      })),
    },
    {
      expected: CODES.RESCHEDULE_CHAIN_TOO_LONG,
      breakIt: (f) => ({ ...f, chainLength: MAX_CHAIN_DEPTH - 1 }),
    },
    {
      expected: CODES.SLOT_BOOKED,
      breakIt: patchBookability((b) => ({
        ...b,
        slot: { ...b.slot, trangThai: 'DaDat' },
      })),
    },
    {
      expected: CODES.OVER_SELF_RESCHEDULE_LIMIT,
      breakIt: patchSource({ soLanTuDoiLich: 2 }),
    },
  ];

  it.each(STEPS.map((step, index) => [index, step.expected] as const))(
    'thứ tự: điều kiện hỏng #%i đứng trước mọi điều kiện sau nó ⇒ %s',
    (index, expected) => {
      // áp dụng từ điều kiện CUỐI về điều kiện thứ `index` (điều kiện làm mất `bookability` đứng giữa nên phải áp SAU các điều kiện đụng `bookability`)
      const broken = STEPS.slice(index).reduceRight(
        (facts, step) => step.breakIt(facts),
        reschedulabilityFacts(),
      );
      expect(outcome(broken)).toBe(expected);
    },
  );

  it('sửa hết mọi điều kiện thì đạt', () => {
    expect(outcome(reschedulabilityFacts())).toBe('ok:Reschedule');
  });
});

describe('KDL-13 khung giờ đích giữ chỗ đã quá hạn: coi là trống, kèm người giữ để người ghi hết hạn lười (phần ghi thuộc B4)', () => {
  it('verdict đạt mang nguyên lapsedHold của luật đặt lịch', () => {
    const holder = { lichHenId: '77', maLichHen: 'NGUOI-KIA' };
    const facts = withBookability({
      slot: {
        khungGioId: '10',
        ngayGio: FACTS_SLOT_START,
        trangThai: 'DangGiuCho',
        giuChoDen: secondsFrom(FACTS_NOW, -60),
      },
      slotHolder: holder,
    });
    expect(evaluateReschedulability(facts)).toEqual({
      ok: true,
      branch: 'Reschedule',
      lapsedHold: holder,
    });
  });
});

describe('KDL-14 hồ sơ người thân đã ngừng (Q7 (e))', () => {
  it.each(ACTORS)(
    '%s: ngừng ⇒ ProfileInactive (409 HO_SO_NGUOI_THAN_DA_NGUNG)',
    (_n, actor) => {
      expect(
        evaluateReschedulability(
          reschedulabilityFacts({ actor, profileActive: false }),
        ),
      ).toEqual({ ok: false, failure: { kind: 'ProfileInactive' } });
    },
  );
});

describe('KDL-16 chuỗi đổi lịch quá dài (R4, quy tắc DB 64)', () => {
  const chain = (chainLength: number) => reschedulabilityFacts({ chainLength });

  it('MAX_CHAIN_DEPTH − 2 lịch ⇒ đổi tiếp được; MAX_CHAIN_DEPTH − 1 ⇒ CHUOI_DOI_LICH_QUA_DAI', () => {
    expect(outcome(chain(MAX_CHAIN_DEPTH - 2))).toBe('ok:Reschedule');
    expect(outcome(chain(MAX_CHAIN_DEPTH - 1))).toBe(
      CODES.RESCHEDULE_CHAIN_TOO_LONG,
    );
  });

  it('chuỗi dài hơn nữa (kể cả đúng MAX_CHAIN_DEPTH, số lớn nhất mà câu đọc trả) vẫn bị từ chối', () => {
    expect(outcome(chain(MAX_CHAIN_DEPTH))).toBe(
      CODES.RESCHEDULE_CHAIN_TOO_LONG,
    );
    expect(outcome(chain(MAX_CHAIN_DEPTH + 5))).toBe(
      CODES.RESCHEDULE_CHAIN_TOO_LONG,
    );
  });

  it.each(NON_SELF_ACTORS)(
    '%s cũng bị trần chuỗi (Lễ tân không bị hạn mức nên chuỗi mới dài được)',
    (_name, actor) => {
      expect(
        outcome(
          reschedulabilityFacts({ actor, chainLength: MAX_CHAIN_DEPTH - 1 }),
        ),
      ).toBe(CODES.RESCHEDULE_CHAIN_TOO_LONG);
    },
  );
});

describe('KDL-19 đổi hộ và duyệt khi lịch đang có yêu cầu chờ duyệt (5.6)', () => {
  it.each(NON_SELF_ACTORS)(
    '%s: được phép, kể cả khi đã vượt số lần tự đổi và không có lý do',
    (_name, actor) => {
      expect(
        evaluateReschedulability(
          reschedulabilityFacts({
            actor,
            pendingRequest: true,
            source: rescheduleSource({ soLanTuDoiLich: 5 }),
          }),
        ),
      ).toEqual({ ok: true, branch: 'Reschedule', lapsedHold: null });
    },
  );
});

describe('KDL-20 hạn mức tự đổi và nhánh yêu cầu (2.4.9 A2)', () => {
  const selfFacts = (
    soLanTuDoiLich: number,
    rest: Partial<ReschedulabilityFacts> = {},
  ) =>
    withSource(
      { soLanTuDoiLich },
      { config: { soLanTuDoiLichToiDa: 2, checkInSauPhut: 15 }, ...rest },
    );

  it('còn lần (đã đổi toiDa − 1) ⇒ đổi ngay, kể cả khi đã có lý do hay yêu cầu chờ', () => {
    expect(outcome(selfFacts(1))).toBe('ok:Reschedule');
    expect(
      outcome(selfFacts(1, { requestReasonGiven: true, pendingRequest: true })),
    ).toBe('ok:Reschedule');
  });

  it('hết lần (đã đổi toiDa) và THIẾU lý do ⇒ VUOT_SO_LAN_TU_DOI kèm chiTiet { soLanDaDoi, toiDa }', () => {
    expect(evaluateReschedulability(selfFacts(2))).toEqual({
      ok: false,
      failure: {
        kind: 'Rule',
        code: CODES.OVER_SELF_RESCHEDULE_LIMIT,
        chiTiet: { soLanDaDoi: 2, toiDa: 2 },
      },
    });
    expect(outcome(selfFacts(3))).toBe(CODES.OVER_SELF_RESCHEDULE_LIMIT);
  });

  it('hết lần và CÓ lý do ⇒ nhánh Request, mang theo lapsedHold của luật đặt lịch', () => {
    expect(outcome(selfFacts(2, { requestReasonGiven: true }))).toBe(
      'ok:Request',
    );
    const holder = { lichHenId: '77', maLichHen: 'NGUOI-KIA' };
    const facts = selfFacts(2, {
      requestReasonGiven: true,
      bookability: bookabilityFacts({
        thayThe: { maLichHen: OLD_APPOINTMENT_CODE },
        slot: {
          khungGioId: '10',
          ngayGio: FACTS_SLOT_START,
          trangThai: 'DangGiuCho',
          giuChoDen: secondsFrom(FACTS_NOW, -1),
        },
        slotHolder: holder,
      }),
    });
    expect(evaluateReschedulability(facts)).toEqual({
      ok: true,
      branch: 'Request',
      lapsedHold: holder,
    });
  });

  it('toiDa = 0: lần đầu tiên đã là yêu cầu (có lý do) hoặc VUOT_SO_LAN_TU_DOI (thiếu lý do)', () => {
    const zero = (rest: Partial<ReschedulabilityFacts>) =>
      withSource(
        { soLanTuDoiLich: 0 },
        { config: { soLanTuDoiLichToiDa: 0, checkInSauPhut: 15 }, ...rest },
      );
    expect(outcome(zero({}))).toBe(CODES.OVER_SELF_RESCHEDULE_LIMIT);
    expect(outcome(zero({ requestReasonGiven: true }))).toBe('ok:Request');
  });

  it('nhánh Request mà đã có yêu cầu ChoDuyet ⇒ DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET; thiếu lý do thì VUOT_SO_LAN_TU_DOI đứng trước', () => {
    expect(
      outcome(selfFacts(2, { requestReasonGiven: true, pendingRequest: true })),
    ).toBe(CODES.RESCHEDULE_REQUEST_PENDING);
    expect(outcome(selfFacts(2, { pendingRequest: true }))).toBe(
      CODES.OVER_SELF_RESCHEDULE_LIMIT,
    );
  });

  it('một lỗi của khung giờ đích đứng TRƯỚC hạn mức: hết lần mà khung giờ đã đặt ⇒ KHUNG_GIO_DA_DAT, không phải VUOT_SO_LAN_TU_DOI', () => {
    const facts = selfFacts(2, {
      requestReasonGiven: true,
      bookability: bookabilityFacts({
        thayThe: { maLichHen: OLD_APPOINTMENT_CODE },
        slot: { ...bookabilityFacts().slot, trangThai: 'DaDat' },
      }),
    });
    expect(outcome(facts)).toBe(CODES.SLOT_BOOKED);
  });
});

describe('KDL-21 tính thuần (H8)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('không đổi facts (đóng băng sâu) và cùng facts thì cùng kết quả', () => {
    const facts = deepFreeze(reschedulabilityFacts());
    const before = JSON.stringify(facts);
    const first = evaluateReschedulability(facts);
    expect(evaluateReschedulability(facts)).toEqual(first);
    expect(JSON.stringify(facts)).toBe(before);
  });

  it('không đọc đồng hồ: đổi đồng hồ hệ thống thì kết quả không đổi', () => {
    const facts = reschedulabilityFacts();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('1999-01-01T00:00:00Z'));
    const early = evaluateReschedulability(facts);
    vi.setSystemTime(new Date('2099-01-01T00:00:00Z'));
    const late = evaluateReschedulability(facts);
    expect(early).toEqual(late);
    expect(early).toEqual({ ok: true, branch: 'Reschedule', lapsedHold: null });
  });
});

describe('KDL-22 phạm vi của người đổi (404 cùng thân, kiểm lại dưới khoá)', () => {
  const source = { benhNhanId: OWNER_ID, chiNhanhId: BRANCH_ID };

  it.each<[string, RescheduleActor, boolean]>([
    ['TuDoi, đúng chủ', { via: 'TuDoi', accountId: OWNER_ID }, true],
    ['TuDoi, chủ khác', { via: 'TuDoi', accountId: '10' }, false],
    ['DoiHo, đúng chi nhánh', { via: 'DoiHo', chiNhanhId: BRANCH_ID }, true],
    ['DoiHo, chi nhánh khác', { via: 'DoiHo', chiNhanhId: '2' }, false],
    [
      'DuyetYeuCau Chi nhánh, đúng chi nhánh',
      { via: 'DuyetYeuCau', chiNhanhId: BRANCH_ID },
      true,
    ],
    [
      'DuyetYeuCau Chi nhánh, chi nhánh khác',
      { via: 'DuyetYeuCau', chiNhanhId: '2' },
      false,
    ],
    [
      'DuyetYeuCau Toàn hệ thống, chi nhánh bất kỳ',
      { via: 'DuyetYeuCau', chiNhanhId: null },
      true,
    ],
  ])('isInScope: %s ⇒ %s', (_name, actor, expected) => {
    expect(isInScope(actor, source)).toBe(expected);
  });

  it.each<[string, RescheduleActor]>([
    ['TuDoi, lịch của người khác', { via: 'TuDoi', accountId: '10' }],
    ['DoiHo, lịch của chi nhánh khác', { via: 'DoiHo', chiNhanhId: '2' }],
    [
      'DuyetYeuCau Chi nhánh, lịch chi nhánh khác',
      { via: 'DuyetYeuCau', chiNhanhId: '2' },
    ],
  ])(
    '%s: luật kiểm LẠI ngay cả khi người gọi lỡ đưa lịch ngoài phạm vi vào facts ⇒ NotFound',
    (_name, actor) => {
      expect(
        evaluateReschedulability(reschedulabilityFacts({ actor })),
      ).toEqual({ ok: false, failure: { kind: 'NotFound' } });
    },
  );
});
