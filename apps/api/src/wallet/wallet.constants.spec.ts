import { compareMoney } from '../pricing/money.js';
import {
  REFUND_MAX_ATTEMPTS,
  REFUND_RETRY_GAP_MINUTES,
  TOPUP_MAX,
  TOPUP_MIN,
  TOPUP_RECONCILE_MAX_RETRIES,
  WALLET_ERROR_CODES,
  WITHDRAW_MIN,
} from './wallet.constants.js';
import { isErrorCode } from '../common/errors/error-codes.js';

// payment P3 — mã `WLG-nn` là `[đề xuất]`: PLAN payment chưa gán mã cho hằng của ví (chỉ IVT-01…IVT-07 cho bất biến). Hạn mức: Q20 (số Figma làm hằng, không cột cấu hình).
describe('WLG-01 hằng của ví', () => {
  it('hạn mức nạp 50.000đ đến 2.000.000đ, rút tối thiểu 10.000đ (Q20); là chuỗi decimal hai chữ số và đúng thứ tự', () => {
    expect(TOPUP_MIN).toBe('50000.00');
    expect(TOPUP_MAX).toBe('2000000.00');
    expect(WITHDRAW_MIN).toBe('10000.00');
    expect(compareMoney(TOPUP_MIN, TOPUP_MAX)).toBe(-1);
    expect(compareMoney(WITHDRAW_MIN, TOPUP_MIN)).toBe(-1);
  });

  it('số lần thử: hoàn tự động tối đa 4 lần (một lần đầu cộng ba lần job), đối soát nạp ví ba lần thử lại, cách nhau 5 phút', () => {
    expect(REFUND_MAX_ATTEMPTS).toBe(4);
    expect(TOPUP_RECONCILE_MAX_RETRIES).toBe(3);
    expect(REFUND_RETRY_GAP_MINUTES).toBe(5);
  });

  it('mã lỗi đúng mẫu mã ổn định, không trùng nhau, có đủ mã của ví ở PLAN 5.14', () => {
    const codes = Object.values(WALLET_ERROR_CODES);
    expect(codes.every((code) => isErrorCode(code))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(
      expect.arrayContaining([
        'SO_DU_KHONG_DU',
        'SO_TIEN_KHONG_HOP_LE',
        'SO_TIEN_NGOAI_HAN_MUC',
        'DA_CO_YEU_CAU_CHO_DUYET',
        'YEU_CAU_DA_XU_LY',
        'DA_HOAN_DAC_BIET',
        'SO_TIEN_HOAN_VUOT_QUA_DA_THANH_TOAN',
      ]),
    );
  });
});
