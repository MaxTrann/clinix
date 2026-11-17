import { readConfiguredGateways } from './configured-gateways.js';

// payment B1 — SDV-04: chỉ cổng có ĐỦ biến cấu hình mới được liệt kê. Không DB, không đọc môi trường thật (truyền `env` vào).
describe('SDV-04 readConfiguredGateways', () => {
  it('không biến nào ⇒ rỗng', () => {
    expect(readConfiguredGateways({})).toEqual([]);
  });

  it('đủ biến của VNPay ⇒ chỉ VNPay; đủ cả hai ⇒ theo thứ tự VNPay, MoMo', () => {
    const vnpay = { VNPAY_TMN_CODE: 'a', VNPAY_HASH_SECRET: 'b' };
    const momo = { MOMO_PARTNER_CODE: 'c', MOMO_SECRET_KEY: 'd' };
    expect(readConfiguredGateways(vnpay)).toEqual(['VNPay']);
    expect(readConfiguredGateways({ ...momo, ...vnpay })).toEqual([
      'VNPay',
      'MoMo',
    ]);
  });

  it('thiếu một biến, biến rỗng hoặc chỉ có khoảng trắng ⇒ cổng đó không được liệt kê', () => {
    expect(
      readConfiguredGateways({ VNPAY_TMN_CODE: 'a', VNPAY_HASH_SECRET: '' }),
    ).toEqual([]);
    expect(
      readConfiguredGateways({ VNPAY_TMN_CODE: 'a', VNPAY_HASH_SECRET: '  ' }),
    ).toEqual([]);
    expect(readConfiguredGateways({ MOMO_PARTNER_CODE: 'c' })).toEqual([]);
  });
});
