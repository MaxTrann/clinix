import { describe, expect, it } from 'vitest';
import {
  amountProblem,
  digitsOf,
  isAllowedRedirect,
  knownGateways,
  quickAmountsWithin,
} from './topup-form';

// payment F2: luật thuần của tab Nạp tiền. Mã test case theo PLAN payment 7 (WNT).
const LIMITS = { toiThieu: '50000.00', toiDa: '2000000.00' };

describe('topup-form (payment F2)', () => {
  it('WNT-01 chỉ giữ cổng web biết, đúng thứ tự Figma (VNPAY trước MoMo), bỏ tên lạ và trùng', () => {
    expect(knownGateways(['MoMo', 'VNPay'])).toEqual(['VNPay', 'MoMo']);
    expect(knownGateways(['VNPay', 'VNPay', 'Vi', 'vnpay'])).toEqual(['VNPay']);
    expect(knownGateways([])).toEqual([]);
  });

  it('WNT-02 hạn mức: đúng bằng tối thiểu và tối đa được nhận (biên); dưới, trên, rỗng, toàn số 0 bị chặn', () => {
    expect(amountProblem('50000', LIMITS)).toBeNull();
    expect(amountProblem('2000000', LIMITS)).toBeNull();
    expect(amountProblem('49999', LIMITS)).toBe('outOfRange');
    expect(amountProblem('2000001', LIMITS)).toBe('outOfRange');
    expect(amountProblem('9999999999', LIMITS)).toBe('outOfRange');
    expect(amountProblem('', LIMITS)).toBe('required');
    expect(amountProblem('0', LIMITS)).toBe('required');
  });

  it('WNT-02 ô nhập chỉ giữ chữ số, bỏ số 0 đầu, tối đa 10 chữ số; mức nhanh ngoài hạn mức bị ẩn', () => {
    expect(digitsOf('200.000')).toBe('200000');
    expect(digitsOf(' 1 000 000đ ')).toBe('1000000');
    expect(digitsOf('00050000')).toBe('50000');
    expect(digitsOf('-5e3')).toBe('53');
    expect(digitsOf('123456789012')).toBe('1234567890');
    expect(quickAmountsWithin(LIMITS)).toHaveLength(6);
    expect(
      quickAmountsWithin({ toiThieu: '100000.00', toiDa: '500000.00' }),
    ).toEqual(['100000', '200000', '500000']);
  });

  it('WNT-03 ★ chỉ chuyển tới URL https của host cho phép; http, host lạ, host giả mạo đuôi, URL hỏng bị từ chối', () => {
    expect(
      isAllowedRedirect(
        'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?a=1',
      ),
    ).toBe(true);
    for (const bad of [
      'http://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      'https://evil.example/vpcpay.html',
      'https://sandbox.vnpayment.vn.evil.example/x',
      'https://evilsandbox.vnpayment.vn/x',
      'javascript:alert(1)',
      '/benh-nhan/vi-cua-toi',
      'không phải url',
    ])
      expect(isAllowedRedirect(bad)).toBe(false);
  });
});
