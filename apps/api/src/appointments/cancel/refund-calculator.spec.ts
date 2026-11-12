import { CANCEL_REASONS } from './cancel.types.js';
import {
  calculateRefund,
  refundPolicyOf,
  type RefundInput,
} from './refund-calculator.js';

// Task B10 — RefundCalculator (hàm thuần; không DB, không đồng hồ). Mã HL-07 (phần đơn vị), HL-09 là của PLAN booking 7.3; TTH-01…TTH-04 là mã MỚI `[đề xuất]` (PLAN 7.29; TRACKING 3.23 B10-I).
// Phần HL-07 chạy trên MySQL thật (`cancel-preview`): appointment-cancellation.service.int-spec.ts và e2e.
const THOI_GIAN = new Date('2026-11-10T08:00:00+07:00');
const HOUR = 3_600_000;
const SECOND = 1_000;
const TIERS = [
  { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
  { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
  { so_gio_truoc_toi_thieu: 0, ty_le_hoan: 0 },
];

/** Còn `remainingMs` mili giây tới giờ hẹn. */
const at = (remainingMs: number): Date =>
  new Date(THOI_GIAN.getTime() - remainingMs);

function refund(overrides: Partial<RefundInput> & Pick<RefundInput, 'now'>) {
  return calculateRefund({
    policy: 'TheoBac',
    snapshot: TIERS,
    thoiGian: THOI_GIAN,
    daThu: '100000.00',
    ...overrides,
  });
}

describe('HL-07 biên của từng mốc (nửa đóng ≥), snapshot 24→100, 2→50, 0→0, đã thu 100.000', () => {
  it.each([
    ['đúng 24 giờ', 24 * HOUR, '100000.00', 100, 24],
    ['24 giờ trừ 1 giây', 24 * HOUR - SECOND, '50000.00', 50, 2],
    ['đúng 2 giờ', 2 * HOUR, '50000.00', 50, 2],
    ['2 giờ trừ 1 giây', 2 * HOUR - SECOND, '0.00', 0, 0],
    ['còn đúng 0 giây (đúng giờ hẹn)', 0, '0.00', 0, 0],
    ['đã quá giờ hẹn 1 giây', -SECOND, '0.00', 0, null],
    ['đã quá giờ hẹn nhiều ngày', -5 * 24 * HOUR, '0.00', 0, null],
    ['còn 10 ngày (vượt mốc lớn nhất)', 240 * HOUR, '100000.00', 100, 24],
  ])('%s', (_name, remainingMs, soTien, tyLe, mocApDung) => {
    expect(refund({ now: at(remainingMs) })).toEqual({
      tyLe,
      soTien,
      mocApDung,
    });
  });

  it('thời gian còn lại tính bằng MILI GIÂY: thiếu 1 ms so với 24 giờ thì rơi xuống mốc 2', () => {
    expect(refund({ now: at(24 * HOUR - 1) })).toMatchObject({ tyLe: 50 });
    expect(refund({ now: at(24 * HOUR + 1) })).toMatchObject({ tyLe: 100 });
  });
});

describe('HL-09 RefundCalculator thuần: snapshot, tỷ lệ, tiền lẻ, đã thu 0', () => {
  const now = at(30 * HOUR);

  it('snapshot NULL, [] hoặc không có mốc nào áp dụng ⇒ 0% (tyLe 0, soTien "0.00"), KHÔNG phải null (đã thu mà không hoàn)', () => {
    for (const snapshot of [null, undefined, []]) {
      expect(refund({ now, snapshot })).toEqual({
        tyLe: 0,
        soTien: '0.00',
        mocApDung: null,
      });
    }
    // chỉ có mốc 48 giờ mà còn 30 giờ: không mốc nào áp dụng
    expect(
      refund({
        now,
        snapshot: [{ so_gio_truoc_toi_thieu: 48, ty_le_hoan: 100 }],
      }),
    ).toEqual({ tyLe: 0, soTien: '0.00', mocApDung: null });
  });

  it('nhiều mốc KHÔNG sắp sẵn cho cùng kết quả với mốc sắp giảm dần (hàm tự sắp, không đổi mảng đầu vào)', () => {
    const shuffled = [TIERS[2], TIERS[0], TIERS[1]];
    const copy = JSON.parse(JSON.stringify(shuffled)) as unknown;
    for (const remaining of [30 * HOUR, 5 * HOUR, 1 * HOUR]) {
      expect(refund({ now: at(remaining), snapshot: shuffled })).toEqual(
        refund({ now: at(remaining) }),
      );
    }
    expect(shuffled).toEqual(copy);
  });

  it('tỷ lệ 0 và 100 ở mốc giữa; một mốc duy nhất', () => {
    expect(
      refund({
        now: at(3 * HOUR),
        snapshot: [
          { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 0 },
          { so_gio_truoc_toi_thieu: 1, ty_le_hoan: 100 },
        ],
      }),
    ).toEqual({ tyLe: 100, soTien: '100000.00', mocApDung: 1 });
    expect(
      refund({
        now: at(3 * HOUR),
        snapshot: [{ so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 }],
      }),
    ).toEqual({ tyLe: 0, soTien: '0.00', mocApDung: null });
  });

  it.each([
    ['100000.01', 50, '50000.00'], // 50000,005 làm tròn XUỐNG, không lên
    ['0.01', 50, '0.00'],
    ['0.03', 33, '0.00'], // 0,0099
    ['333.33', 33, '109.99'], // 109,9989
    ['19.99', 7, '1.39'], // 1,3993
    ['0.07', 50, '0.03'], // 0,035
    ['100000', 100, '100000.00'], // chuỗi không có phần thập phân, ra đúng 2 chữ số
    ['100000.5', 100, '100000.50'],
  ])(
    'tiền lẻ làm tròn XUỐNG 0,01: đã thu %s nhân tỷ lệ %i phần trăm ra %s',
    (daThu, tyLe, soTien) => {
      const snapshot = [{ so_gio_truoc_toi_thieu: 0, ty_le_hoan: tyLe }];
      expect(refund({ now: at(HOUR), snapshot, daThu })).toEqual({
        tyLe,
        soTien,
        mocApDung: 0,
      });
    },
  );

  it.each(['0', '0.0', '0.00', '000.00'])(
    'đã thu "%s" (bằng 0) ⇒ null, cả theo bậc lẫn toàn bộ',
    (daThu) => {
      expect(refund({ now, daThu })).toBeNull();
      expect(refund({ now, daThu, policy: 'ToanBo' })).toBeNull();
    },
  );

  it('số tiền không hợp lệ ném lỗi (không đoán): âm, chữ, quá 2 chữ số thập phân, rỗng', () => {
    for (const daThu of ['-1', 'abc', '1.234', '', '1,5'])
      expect(() => refund({ now, daThu })).toThrow('Số tiền không hợp lệ');
  });
});

describe('TTH-01 refundPolicyOf: Q17, ai hoàn bao nhiêu nằm MỘT chỗ', () => {
  it.each([
    ['BenhNhanHuy', 'TheoBac'],
    ['LeTanHuy', 'TheoBac'],
    ['QtvOverride', 'ToanBo'],
    ['BacSiNghiPhep', 'ToanBo'],
  ] as const)('%s ⇒ %s', (reason, policy) => {
    expect(refundPolicyOf(reason)).toBe(policy);
  });

  it('phủ đủ mọi lý do huỷ của hợp đồng (thêm lý do mới mà quên chính sách thì ca này đỏ)', () => {
    expect(CANCEL_REASONS.map((reason) => refundPolicyOf(reason))).toHaveLength(
      4,
    );
  });
});

describe('TTH-02 snapshot hỏng ném lỗi (không đoán, không hoàn sai tiền)', () => {
  const now = at(30 * HOUR);

  it.each([
    ['không phải mảng (đối tượng)', { so_gio_truoc_toi_thieu: 24 }],
    ['không phải mảng (chuỗi JSON)', '[]'],
    ['không phải mảng (số)', 5],
    ['phần tử null', [null]],
    ['phần tử là chuỗi', ['24']],
    ['phần tử rỗng', [{}]],
    ['số giờ âm', [{ so_gio_truoc_toi_thieu: -1, ty_le_hoan: 50 }]],
    ['số giờ không nguyên', [{ so_gio_truoc_toi_thieu: 2.5, ty_le_hoan: 50 }]],
    ['số giờ là chuỗi', [{ so_gio_truoc_toi_thieu: '24', ty_le_hoan: 50 }]],
    ['tỷ lệ 101', [{ so_gio_truoc_toi_thieu: 24, ty_le_hoan: 101 }]],
    ['tỷ lệ âm', [{ so_gio_truoc_toi_thieu: 24, ty_le_hoan: -1 }]],
    ['tỷ lệ không nguyên', [{ so_gio_truoc_toi_thieu: 24, ty_le_hoan: 50.5 }]],
    ['tỷ lệ là chuỗi', [{ so_gio_truoc_toi_thieu: 24, ty_le_hoan: '50' }]],
    ['một mốc hỏng trong nhiều mốc', [TIERS[0], { so_gio_truoc_toi_thieu: 2 }]],
  ])('%s', (_name, snapshot) => {
    expect(() => refund({ now, snapshot })).toThrow(/hoàn/);
  });

  it('thông điệp lỗi chỉ nói CẤU TRÚC, không chứa giá trị của snapshot (an toàn khi bị ghi log)', () => {
    try {
      refund({
        now,
        snapshot: [{ so_gio_truoc_toi_thieu: 24, ty_le_hoan: 987654 }],
      });
      throw new Error('lẽ ra phải ném');
    } catch (error) {
      expect((error as Error).message).not.toContain('987654');
    }
  });

  it('ngày giờ hỏng (NaN) ném RangeError thay vì âm thầm hoàn 0%', () => {
    expect(() => refund({ now: new Date(Number.NaN) })).toThrow(RangeError);
    expect(() =>
      refund({ now, thoiGian: new Date('không phải ngày') }),
    ).toThrow(RangeError);
  });
});

describe('TTH-03 ToanBo và tiền lớn bằng BigInt', () => {
  it('ToanBo hoàn 100% số đã thu bất kể bậc, kể cả đã quá giờ hẹn; mocApDung null', () => {
    for (const remaining of [48 * HOUR, HOUR, 0, -3 * HOUR]) {
      expect(
        refund({ now: at(remaining), policy: 'ToanBo', daThu: '75000.50' }),
      ).toEqual({ tyLe: 100, soTien: '75000.50', mocApDung: null });
    }
  });

  it('ToanBo không đọc snapshot: snapshot hỏng không chặn việc hoàn 100% (QTV override, nghỉ phép)', () => {
    expect(
      refund({
        now: at(HOUR),
        policy: 'ToanBo',
        snapshot: 'hỏng',
        daThu: '100000.00',
      }),
    ).toEqual({ tyLe: 100, soTien: '100000.00', mocApDung: null });
  });

  it('số lớn hơn 2^53 đơn vị 0,01 vẫn đúng từng chữ số (BigInt, không số thực)', () => {
    const snapshot = [{ so_gio_truoc_toi_thieu: 0, ty_le_hoan: 50 }];
    expect(
      refund({
        now: at(HOUR),
        snapshot,
        daThu: '12345678901234567.89',
      }),
    ).toEqual({ tyLe: 50, soTien: '6172839450617283.94', mocApDung: 0 });
    expect(
      refund({
        now: at(HOUR),
        policy: 'ToanBo',
        daThu: '9007199254740993.01',
      }),
    ).toMatchObject({ soTien: '9007199254740993.01' });
  });
});

describe('TTH-04 hình dạng kết quả và THỨ TỰ kiểm (đã thu 0 trước snapshot)', () => {
  const now = at(30 * HOUR);

  it('đã thu 0 ⇒ null TRƯỚC khi đọc snapshot: snapshot hỏng không làm lịch cọc 0đ hay ChoThanhToan chưa thanh toán không huỷ được', () => {
    expect(refund({ now, snapshot: 'hỏng', daThu: '0.00' })).toBeNull();
    expect(refund({ now, snapshot: [{ sai: 1 }], daThu: '0' })).toBeNull();
    // đối chứng: cùng snapshot hỏng nhưng đã thu > 0 thì NÉM (không hoàn sai tiền)
    expect(() => refund({ now, snapshot: 'hỏng', daThu: '0.01' })).toThrow();
  });

  it('đã thu 0 ⇒ null kể cả khi ngày giờ hỏng (kiểm đã thu đứng đầu mọi kiểm khác)', () => {
    expect(refund({ now: new Date(Number.NaN), daThu: '0.00' })).toBeNull();
  });

  it('mocApDung là số giờ của MỐC đã áp dụng (không phải số giờ còn lại); null khi không mốc hay đã quá giờ', () => {
    expect(refund({ now: at(30 * HOUR) })?.mocApDung).toBe(24);
    expect(refund({ now: at(5 * HOUR) })?.mocApDung).toBe(2);
    expect(refund({ now: at(HOUR) })?.mocApDung).toBe(0);
    expect(refund({ now: at(-HOUR) })?.mocApDung).toBeNull();
  });

  it('kết quả luôn đủ ba khoá, tyLe là số nguyên, soTien là chuỗi đúng 2 chữ số thập phân', () => {
    const result = refund({ now: at(5 * HOUR) });
    expect(Object.keys(result ?? {}).sort()).toEqual([
      'mocApDung',
      'soTien',
      'tyLe',
    ]);
    expect(Number.isInteger(result?.tyLe)).toBe(true);
    expect(result?.soTien).toMatch(/^\d+\.\d{2}$/);
  });
});
