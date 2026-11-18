import { GatewayNotConfiguredError } from '../gateway.port.js';
import { readConfiguredGateways } from '../../../wallet/balance/configured-gateways.js';
import {
  readVnpayConfig,
  VNPAY_ENV_NAMES,
  type VnpayConfig,
} from './vnpay-config.js';
import { signVnpay, verifyVnpaySignature } from './vnpay-signature.js';
import {
  formatVnpayDate,
  VNPAY_ORDER_INFO,
  VnpayGateway,
} from './vnpay.gateway.js';

// payment B3: bộ điều hợp VNPAY. Mã test case theo PLAN payment 7 (CGS). Cấu hình GIẢ, không mạng, không DB.
const CONFIG: VnpayConfig = {
  tmnCode: 'TESTTMN1',
  hashSecret: 'KHOA_GIA_CHI_DE_TEST',
  payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  returnUrl: 'http://localhost:5173/vi/vi-cua-toi/nap-tien/ket-qua',
};
const gateway = new VnpayGateway(CONFIG);

/** Tham số IPN đã ký bằng khoá giả; `patch` sửa TRƯỚC khi ký (giá trị `undefined` = bỏ tham số). Mặc định = số đo M12 của giao dịch thành công. */
function ipn(
  patch: Record<string, string | undefined> = {},
): Record<string, string> {
  const merged: Record<string, string | undefined> = {
    vnp_TmnCode: CONFIG.tmnCode,
    vnp_Amount: '10000000',
    vnp_BankCode: 'NCB',
    vnp_BankTranNo: 'VNP15741333',
    vnp_CardType: 'ATM',
    vnp_PayDate: '20261118142100',
    vnp_OrderInfo: VNPAY_ORDER_INFO,
    vnp_TransactionNo: '15741333',
    vnp_ResponseCode: '00',
    vnp_TransactionStatus: '00',
    vnp_TxnRef: '42',
    ...patch,
  };
  const params = Object.fromEntries(
    Object.entries(merged).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  return { ...params, vnp_SecureHash: signVnpay(params, CONFIG.hashSecret) };
}

describe('VnpayGateway (payment B3)', () => {
  describe('verifyIpn', () => {
    it('CGS-02 chữ ký đúng ⇒ Verified với txnRef, amountCents (đơn vị 0,01 đồng = vnp_Amount), mã giao dịch cổng', () => {
      expect(gateway.verifyIpn(ipn())).toEqual({
        kind: 'Verified',
        txnRef: '42',
        amountCents: 10_000_000n,
        result: 'ThanhCong',
        gatewayCode: '15741333',
      });
    });

    it('CGS-09 chỉ ResponseCode 00 VÀ TransactionStatus 00 ⇒ ThanhCong; mọi tổ hợp khác ⇒ ThatBai', () => {
      const cases: Array<[string, string, 'ThanhCong' | 'ThatBai']> = [
        ['00', '00', 'ThanhCong'],
        ['24', '02', 'ThatBai'], // số đo M12: khách huỷ
        ['00', '02', 'ThatBai'],
        ['24', '00', 'ThatBai'],
        ['07', '01', 'ThatBai'],
        ['', '', 'ThatBai'],
      ];
      for (const [responseCode, status, expected] of cases) {
        const signal = gateway.verifyIpn(
          ipn({
            vnp_ResponseCode: responseCode,
            vnp_TransactionStatus: status,
          }),
        );
        expect(signal).toMatchObject({ kind: 'Verified', result: expected });
      }
    });

    it('CGS-09 (số đo M12) giao dịch huỷ có vnp_TransactionNo "0" ⇒ gatewayCode null (không làm trùng UNIQUE ma_giao_dich_cong)', () => {
      // Đúng bộ tham số đo được khi huỷ: không có vnp_BankTranNo, BankCode "VNPAY".
      const cancelled = ipn({
        vnp_ResponseCode: '24',
        vnp_TransactionStatus: '02',
        vnp_TransactionNo: '0',
        vnp_BankCode: 'VNPAY',
        vnp_BankTranNo: undefined,
      });
      expect(gateway.verifyIpn(cancelled)).toEqual({
        kind: 'Verified',
        txnRef: '42',
        amountCents: 10_000_000n,
        result: 'ThatBai',
        gatewayCode: null,
      });
      expect(
        gateway.verifyIpn(ipn({ vnp_TransactionNo: '000' })),
      ).toMatchObject({ gatewayCode: null });
      expect(gateway.verifyIpn(ipn({ vnp_TransactionNo: '' }))).toMatchObject({
        gatewayCode: null,
      });
    });

    it('CGS-03 sửa vnp_Amount, vnp_TxnRef hay vnp_ResponseCode sau khi ký ⇒ InvalidSignature', () => {
      for (const [name, value] of [
        ['vnp_Amount', '1'],
        ['vnp_TxnRef', '43'],
        ['vnp_ResponseCode', '00'],
      ] as const) {
        const tampered = { ...ipn({ vnp_ResponseCode: '24' }), [name]: value };
        expect(gateway.verifyIpn(tampered)).toEqual({
          kind: 'InvalidSignature',
        });
      }
    });

    it('CGS-05 thiếu vnp_SecureHash ⇒ InvalidSignature, không ném lỗi', () => {
      const { vnp_SecureHash: _omit, ...unsigned } = ipn();
      expect(gateway.verifyIpn(unsigned)).toEqual({ kind: 'InvalidSignature' });
      expect(gateway.verifyIpn({})).toEqual({ kind: 'InvalidSignature' });
    });

    it('CGS-04 IPN đến với thứ tự tham số bất kỳ ⇒ vẫn xác minh đúng', () => {
      const reversed = Object.fromEntries(Object.entries(ipn()).reverse());
      expect(gateway.verifyIpn(reversed)).toMatchObject({ kind: 'Verified' });
    });

    it('CGS-07 tham số không phải vnp_ thêm vào ⇒ bỏ qua; tham số lặp tên (mảng) hay kiểu lạ ⇒ InvalidSignature, không ném', () => {
      expect(gateway.verifyIpn({ ...ipn(), utm_source: 'x' })).toMatchObject({
        kind: 'Verified',
      });
      expect(gateway.verifyIpn({ ...ipn(), vnp_TxnRef: ['42', '43'] })).toEqual(
        { kind: 'InvalidSignature' },
      );
      expect(gateway.verifyIpn({ ...ipn(), vnp_Amount: 10_000_000 })).toEqual({
        kind: 'InvalidSignature',
      });
    });

    it('chữ ký đúng nhưng của mã merchant khác, thiếu txnRef hay số tiền sai dạng ⇒ InvalidSignature', () => {
      expect(gateway.verifyIpn(ipn({ vnp_TmnCode: 'MERCHANT2' }))).toEqual({
        kind: 'InvalidSignature',
      });
      expect(gateway.verifyIpn(ipn({ vnp_TxnRef: '' }))).toEqual({
        kind: 'InvalidSignature',
      });
      expect(gateway.verifyIpn(ipn({ vnp_Amount: '-100' }))).toEqual({
        kind: 'InvalidSignature',
      });
      expect(gateway.verifyIpn(ipn({ vnp_Amount: '1234567890123' }))).toEqual({
        kind: 'InvalidSignature',
      });
    });
  });

  it('CGS-10 ackFor: mỗi kết quả xử lý ⇒ đúng RspCode của VNPAY', () => {
    expect(gateway.ackFor('Processed')).toEqual({
      RspCode: '00',
      Message: 'Confirm Success',
    });
    expect(gateway.ackFor('NotFound').RspCode).toBe('01');
    expect(gateway.ackFor('AlreadyHandled').RspCode).toBe('02');
    expect(gateway.ackFor('InvalidAmount').RspCode).toBe('04');
    expect(gateway.ackFor('InvalidSignature').RspCode).toBe('97');
    expect(gateway.ackFor('Error').RspCode).toBe('99');
  });

  describe('createPayment', () => {
    // 18/11/2026 07:20:37 UTC = 14:20:37 giờ Việt Nam.
    const NOW = new Date('2026-11-18T07:20:37.900Z');

    it('CGS-11 đủ tham số, vnp_Amount = đồng × 100, ngày giờ Việt Nam, OrderInfo cố định không dấu, chữ ký khớp', async () => {
      const { redirectUrl } = await gateway.createPayment({
        giaoDichId: '42',
        soTien: '100000.00',
        clientIp: '203.0.113.7',
        now: NOW,
      });
      expect(redirectUrl.startsWith(`${CONFIG.payUrl}?`)).toBe(true);
      const params = Object.fromEntries(new URL(redirectUrl).searchParams);
      expect(params).toMatchObject({
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: CONFIG.tmnCode,
        vnp_Amount: '10000000',
        vnp_CurrCode: 'VND',
        vnp_IpAddr: '203.0.113.7',
        vnp_Locale: 'vn',
        vnp_OrderType: 'other',
        vnp_ReturnUrl: CONFIG.returnUrl,
        vnp_TxnRef: '42',
        vnp_CreateDate: '20261118142037',
        vnp_ExpireDate: '20261118143537', // + 15 phút
      });
      // OrderInfo: ASCII không dấu, không chứa dữ liệu người dùng (chỉ câu cố định).
      expect(params.vnp_OrderInfo).toBe(VNPAY_ORDER_INFO);
      expect(/^[\x20-\x7e]+$/.test(params.vnp_OrderInfo ?? '')).toBe(true);
      // Phía nhận (VNPAY) đọc URL rồi tính lại chữ ký ⇒ phải khớp; không có khoá trong URL.
      expect(verifyVnpaySignature(params, CONFIG.hashSecret)).toBe(true);
      expect(redirectUrl).not.toContain(CONFIG.hashSecret);
    });

    it('CGS-11 (biên) đổi ngày theo giờ Việt Nam: 17:30 UTC ⇒ 00:30 hôm sau; số tiền lẻ hào làm đúng đơn vị', async () => {
      expect(formatVnpayDate(new Date('2026-12-31T17:30:05Z'))).toBe(
        '20270101003005',
      );
      const { redirectUrl } = await gateway.createPayment({
        giaoDichId: '7',
        soTien: '10000.50',
        clientIp: '127.0.0.1',
        now: NOW,
      });
      expect(new URL(redirectUrl).searchParams.get('vnp_Amount')).toBe(
        '1000050',
      );
    });

    it('số tiền 0 hay vượt 12 chữ số ⇒ ném lỗi (lỗi lập trình: DTO của B4 đã chặn trước)', async () => {
      const input = { giaoDichId: '1', clientIp: '127.0.0.1', now: NOW };
      await expect(
        gateway.createPayment({ ...input, soTien: '0' }),
      ).rejects.toThrow();
      await expect(
        gateway.createPayment({ ...input, soTien: '10000000000.00' }),
      ).rejects.toThrow();
    });
  });

  describe('CGS-12 thiếu biến môi trường', () => {
    const FULL = {
      VNPAY_TMN_CODE: 'TESTTMN1',
      VNPAY_HASH_SECRET: 'KHOA_GIA_CHI_DE_TEST',
      VNPAY_PAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      VNPAY_RETURN_URL: 'http://localhost:5173/ket-qua',
    };

    it('đủ bốn biến ⇒ có cấu hình; thiếu một, rỗng hay chỉ khoảng trắng ⇒ null', () => {
      expect(readVnpayConfig(FULL)).toEqual({
        tmnCode: 'TESTTMN1',
        hashSecret: 'KHOA_GIA_CHI_DE_TEST',
        payUrl: FULL.VNPAY_PAY_URL,
        returnUrl: FULL.VNPAY_RETURN_URL,
      });
      for (const name of Object.keys(FULL)) {
        expect(readVnpayConfig({ ...FULL, [name]: undefined })).toBeNull();
        expect(readVnpayConfig({ ...FULL, [name]: '   ' })).toBeNull();
      }
    });

    it('tên biến khớp danh sách cổng của ví (GET /patient/wallet): đủ bốn biến ⇒ liệt kê VNPay, thiếu một ⇒ không', () => {
      expect(readConfiguredGateways(FULL)).toEqual(['VNPay']);
      for (const name of VNPAY_ENV_NAMES) {
        expect(readConfiguredGateways({ ...FULL, [name]: '' })).toEqual([]);
      }
    });

    it('URL sai dạng hay trang thanh toán không HTTPS ⇒ ném lỗi chỉ nêu TÊN biến, không lộ khoá', () => {
      expect(() =>
        readVnpayConfig({ ...FULL, VNPAY_PAY_URL: 'khong-phai-url' }),
      ).toThrow(/VNPAY_PAY_URL/);
      expect(() =>
        readVnpayConfig({
          ...FULL,
          VNPAY_PAY_URL: 'http://sandbox.vnpayment.vn/x',
        }),
      ).toThrow(/https/);
      expect(() =>
        readVnpayConfig({ ...FULL, VNPAY_RETURN_URL: 'ftp://x' }),
      ).toThrow(/VNPAY_RETURN_URL/);
      try {
        readVnpayConfig({ ...FULL, VNPAY_PAY_URL: 'khong-phai-url' });
      } catch (error) {
        expect(String(error)).not.toContain(FULL.VNPAY_HASH_SECRET);
      }
    });

    it('cổng chưa cấu hình: createPayment ⇒ NOT_CONFIGURED (không lộ giá trị nào); verifyIpn ⇒ InvalidSignature', async () => {
      const unconfigured = new VnpayGateway(
        readVnpayConfig({ ...FULL, VNPAY_TMN_CODE: '' }),
      );
      const error: unknown = await unconfigured
        .createPayment({
          giaoDichId: '1',
          soTien: '10000',
          clientIp: '127.0.0.1',
          now: new Date(),
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GatewayNotConfiguredError);
      expect((error as GatewayNotConfiguredError).code).toBe('NOT_CONFIGURED');
      expect(String(error)).not.toContain(FULL.VNPAY_HASH_SECRET);
      expect(unconfigured.verifyIpn(ipn())).toEqual({
        kind: 'InvalidSignature',
      });
    });
  });
});
