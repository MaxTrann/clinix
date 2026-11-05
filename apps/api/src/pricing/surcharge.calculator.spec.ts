import { addMoney } from './money.js';
import {
  computeExamPrice,
  computeSurcharge,
  type SurchargeRule,
} from './surcharge.calculator.js';

// admin B12 (phần SOẠN TRƯỚC) — BS-01: phụ phí hiện hành theo bảng ca. Dữ liệu là số minh hoạ, không phải giá thật của nhóm.
const rule = (
  chucDanh: SurchargeRule['chucDanh'],
  soNamKinhNghiemTu: number,
  phuPhi: string,
  apDung = true,
): SurchargeRule => ({ chucDanh, soNamKinhNghiemTu, phuPhi, apDung });

const doctor = (
  soNamKinhNghiem: number,
  chucDanh: SurchargeRule['chucDanh'] = 'BS_CKI',
) => ({
  chucDanh,
  soNamKinhNghiem,
});

describe('BS-01 — computeSurcharge', () => {
  it('không có quy tắc nào ⇒ 0.00', () => {
    expect(computeSurcharge([], doctor(10))).toBe('0.00');
  });

  it('một quy tắc mốc 0 ⇒ áp dụng cho mọi số năm, kể cả 0 năm', () => {
    const rules = [rule('BS_CKI', 0, '50000.00')];
    expect(computeSurcharge(rules, doctor(0))).toBe('50000.00');
    expect(computeSurcharge(rules, doctor(20))).toBe('50000.00');
  });

  it('0 năm: khớp mốc 0 nhưng KHÔNG khớp mốc >= 1', () => {
    const onlyFive = [rule('BS_CKI', 5, '80000.00')];
    expect(computeSurcharge(onlyFive, doctor(0))).toBe('0.00');
    const both = [rule('BS_CKI', 0, '50000.00'), rule('BS_CKI', 5, '80000.00')];
    expect(computeSurcharge(both, doctor(0))).toBe('50000.00');
  });

  it('nhiều mốc: chọn mốc lớn nhất không vượt quá số năm (không phụ thuộc thứ tự dòng)', () => {
    const rules = [
      rule('BS_CKI', 10, '120000.00'),
      rule('BS_CKI', 0, '50000.00'),
      rule('BS_CKI', 5, '80000.00'),
    ];
    expect(computeSurcharge(rules, doctor(4))).toBe('50000.00');
    expect(computeSurcharge(rules, doctor(7))).toBe('80000.00');
    expect(computeSurcharge(rules, doctor(30))).toBe('120000.00');
  });

  it('số năm đúng bằng mốc ⇒ tính mốc đó (<=, không phải <)', () => {
    const rules = [
      rule('BS_CKI', 0, '50000.00'),
      rule('BS_CKI', 5, '80000.00'),
    ];
    expect(computeSurcharge(rules, doctor(5))).toBe('80000.00');
    expect(computeSurcharge(rules, doctor(4))).toBe('50000.00');
  });

  it('QUY TẮC NHÓM: tắt mốc cao ⇒ rơi xuống mốc thấp hơn còn hiệu lực, không về 0', () => {
    const rules = [
      rule('BS_CKI', 0, '50000.00'),
      rule('BS_CKI', 5, '80000.00'),
      rule('BS_CKI', 10, '120000.00', false),
    ];
    expect(computeSurcharge(rules, doctor(12))).toBe('80000.00');
  });

  it('tất cả quy tắc đều tắt ⇒ 0.00', () => {
    const rules = [
      rule('BS_CKI', 0, '50000.00', false),
      rule('BS_CKI', 5, '80000.00', false),
    ];
    expect(computeSurcharge(rules, doctor(12))).toBe('0.00');
  });

  it('khác chức danh ⇒ không áp dụng; mỗi chức danh dùng bảng riêng', () => {
    const rules = [rule('BS', 0, '10000.00'), rule('BS_CKII', 0, '90000.00')];
    expect(computeSurcharge(rules, doctor(8, 'BS_CKI'))).toBe('0.00');
    expect(computeSurcharge(rules, doctor(8, 'BS'))).toBe('10000.00');
    expect(computeSurcharge(rules, doctor(8, 'BS_CKII'))).toBe('90000.00');
  });

  it('phụ phí bằng 0 là quy tắc hợp lệ (mốc cao hơn đặt phụ phí 0 thì về 0 chứ không rơi xuống mốc thấp)', () => {
    const rules = [rule('BS_CKI', 0, '50000.00'), rule('BS_CKI', 5, '0.00')];
    expect(computeSurcharge(rules, doctor(6))).toBe('0.00');
  });

  it('không sửa mảng quy tắc đầu vào', () => {
    const rules = Object.freeze([
      rule('BS_CKI', 5, '80000.00'),
      rule('BS_CKI', 0, '50000.00'),
    ]);
    computeSurcharge(rules, doctor(7));
    expect(rules.map((r) => r.soNamKinhNghiemTu)).toEqual([5, 0]);
  });
});

describe('addMoney / computeExamPrice (Q15, H4)', () => {
  it('cộng chuỗi decimal không sai số, luôn 2 chữ số thập phân', () => {
    expect(addMoney('200000.00', '50000.00')).toBe('250000.00');
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(addMoney('199999.99', '0.01')).toBe('200000.00');
    expect(addMoney('200000', '0')).toBe('200000.00');
    expect(addMoney('1.5', '0.5')).toBe('2.00');
    expect(addMoney('0', '0')).toBe('0.00');
  });

  it('giá lớn của decimal(12,2) vẫn chính xác', () => {
    expect(addMoney('9999999999.99', '0.01')).toBe('10000000000.00');
  });

  it.each(['', 'abc', '-1', '1,5', '1.234', ' 1', '1e3', '1.'])(
    'chuỗi tiền không hợp lệ %j ⇒ ném lỗi',
    (bad) => {
      expect(() => addMoney(bad, '0')).toThrow();
      expect(() => addMoney('0', bad)).toThrow();
    },
  );

  it('computeExamPrice = giá mặc định + phụ phí hiện hành', () => {
    const rules = [
      rule('BS_CKI', 0, '50000.00'),
      rule('BS_CKI', 5, '80000.00'),
    ];
    expect(computeExamPrice('200000.00', rules, doctor(6))).toBe('280000.00');
    expect(computeExamPrice('200000.00', rules, doctor(1))).toBe('250000.00');
    expect(computeExamPrice('200000.00', [], doctor(6))).toBe('200000.00');
  });
});
