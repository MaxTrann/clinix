import {
  addMoney,
  compareMoney,
  fromCents,
  subtractMoney,
  toCents,
} from './money.js';

// payment P2 — IVT-08, IVT-09 (PLAN payment mục 7). Hàm cũ (`toCents`, `fromCents`, `addMoney`) giữ nguyên hành vi: các ca "không đổi" ở cuối.
// Biên của cột `decimal(12,2)`: tối đa 9.999.999.999,99 (10 chữ số nguyên) = 999.999.999.999 đơn vị 0,01.
const MAX_DECIMAL_12_2 = '9999999999.99';

describe('IVT-08 subtractMoney', () => {
  it.each([
    ['500000.00', '300000.00', '200000.00'],
    ['500000', '300000', '200000.00'],
    ['100.50', '0.75', '99.75'],
    ['0.10', '0.01', '0.09'],
    // Số bằng nhau ⇒ đúng 0 (số dư về 0 sau khi rút hết)
    ['150000.00', '150000.00', '0.00'],
    ['0.00', '0.00', '0.00'],
    // Biên decimal(12,2)
    [MAX_DECIMAL_12_2, '0.00', MAX_DECIMAL_12_2],
    [MAX_DECIMAL_12_2, MAX_DECIMAL_12_2, '0.00'],
    [MAX_DECIMAL_12_2, '0.01', '9999999999.98'],
  ])('%s − %s = %s', (a, b, expected) => {
    expect(subtractMoney(a, b)).toBe(expected);
  });

  it('kết quả âm ⇒ ném lỗi (ví không được âm), kể cả âm 0,01', () => {
    expect(() => subtractMoney('300000.00', '500000.00')).toThrow();
    expect(() => subtractMoney('0.00', '0.01')).toThrow();
  });

  it('đầu vào không phải số tiền không âm ⇒ ném lỗi (số âm, chữ, ba chữ số thập phân, rỗng)', () => {
    for (const bad of ['-1.00', 'abc', '1.234', '', ' 1.00', '1e3']) {
      expect(() => subtractMoney(bad, '0.00')).toThrow();
      expect(() => subtractMoney('1.00', bad)).toThrow();
    }
  });
});

describe('IVT-08 compareMoney', () => {
  it.each([
    ['200000.00', '300000.00', -1],
    ['300000.00', '200000.00', 1],
    ['300000.00', '300000.00', 0],
    // Khác cách viết nhưng cùng giá trị
    ['300000', '300000.00', 0],
    ['0.5', '0.50', 0],
    ['0.00', '0.01', -1],
    // So số, không so chuỗi: "9" ở đầu lớn hơn "10" nếu so từng ký tự
    ['9.00', '10.00', -1],
    ['100000.00', '99999.99', 1],
    [MAX_DECIMAL_12_2, '9999999999.98', 1],
    [MAX_DECIMAL_12_2, MAX_DECIMAL_12_2, 0],
  ])('so sánh %s với %s = %s', (a, b, expected) => {
    expect(compareMoney(a, b)).toBe(expected);
  });

  it('đầu vào không hợp lệ ⇒ ném lỗi', () => {
    expect(() => compareMoney('-1.00', '0.00')).toThrow();
    expect(() => compareMoney('0.00', 'abc')).toThrow();
  });
});

// IVT-09: "đột biến" thay BigInt bằng Number bị bắt. Dùng giá trị vượt 2^53 đơn vị 0,01 (Number.MAX_SAFE_INTEGER ≈ 9,007e15 ⇒ ≈ 90 nghìn tỷ đồng):
// bản dùng số thực làm tròn sai ở đây, bản BigInt vẫn đúng từng đơn vị. Các giá trị nằm NGOÀI decimal(12,2) có chủ đích: hàm phải đúng với mọi số chuỗi hợp lệ.
describe('IVT-09 độ chính xác BigInt, không dùng số thực', () => {
  const HUGE = '90071992547409.93'; // 9007199254740993 đơn vị 0,01 = MAX_SAFE_INTEGER + 2

  it('trừ 0,01 ở số lớn vẫn chính xác từng đơn vị', () => {
    expect(subtractMoney(HUGE, '0.01')).toBe('90071992547409.92');
    expect(subtractMoney(HUGE, HUGE)).toBe('0.00');
    // Số thực không biểu diễn được 9007199254740995 (làm tròn lên ...996) nên bản Number cho kết quả sai; BigInt luôn đúng
    expect(subtractMoney('90071992547409.95', '0.02')).toBe(
      '90071992547409.93',
    );
  });

  it('so sánh hai số khác nhau 0,01 ở số lớn không bị coi là bằng nhau', () => {
    // Number('9007199254740993') === Number('9007199254740992') là true: bản Number sẽ trả 0
    expect(compareMoney('90071992547409.93', '90071992547409.92')).toBe(1);
    expect(compareMoney('90071992547409.92', '90071992547409.93')).toBe(-1);
  });

  it('cộng rồi trừ lại về đúng số ban đầu (không trôi 0,01 như số thực: 0,1 + 0,2)', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(subtractMoney(addMoney('0.10', '0.20'), '0.20')).toBe('0.10');
    expect(compareMoney(addMoney('0.10', '0.20'), '0.30')).toBe(0);
  });

  it('kết quả luôn là chuỗi đúng hai chữ số thập phân (không phải number)', () => {
    expect(typeof subtractMoney('2.00', '1.00')).toBe('string');
    expect(subtractMoney('2', '1')).toMatch(/^\d+\.\d{2}$/);
  });
});

describe('hàm tiền cũ không đổi (Đóng khi của P2)', () => {
  it('toCents, fromCents, addMoney giữ hành vi cũ', () => {
    expect(toCents('200000.00')).toBe(20000000n);
    expect(toCents('200000.5')).toBe(20000050n);
    expect(fromCents(20000050n)).toBe('200000.50');
    expect(addMoney('200000', '0.5')).toBe('200000.50');
    expect(() => toCents('-1')).toThrow();
  });
});
