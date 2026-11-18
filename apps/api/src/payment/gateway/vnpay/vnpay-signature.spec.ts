import {
  sameHexDigest,
  signVnpay,
  verifyVnpaySignature,
  vnpaySignData,
} from './vnpay-signature.js';

// payment B3: quy tắc ký VNPAY (hàm thuần). Mã test case theo PLAN payment 7 (CGS). KHOÁ GIẢ, không phải khoá sandbox thật.
const FAKE_SECRET = 'KHOA_GIA_CHI_DE_TEST';

// Bộ tham số cố định có khoảng trắng và URL (':' '/') để cách "mã hoá khi ký" và "không mã hoá" cho kết quả KHÁC nhau.
const PARAMS: Record<string, string> = {
  vnp_TxnRef: '42',
  vnp_Amount: '10000000',
  vnp_TmnCode: 'TESTTMN1',
  vnp_OrderInfo: 'Nap tien vao vi CLINIX',
  vnp_ReturnUrl: 'http://localhost:5173/vi/ket-qua',
  vnp_ResponseCode: '00',
  vnp_TransactionStatus: '00',
  vnp_TransactionNo: '15741333',
  vnp_BankCode: 'NCB',
};

// Chuỗi ký và chữ ký VIẾT TAY theo số đo M12 (18/11/2026: sandbox chỉ nhận cách mã hoá URL khi ký), tính độc lập bằng `node:crypto` với khoá giả.
const EXPECTED_SIGN_DATA =
  'vnp_Amount=10000000&vnp_BankCode=NCB&vnp_OrderInfo=Nap+tien+vao+vi+CLINIX&vnp_ResponseCode=00' +
  '&vnp_ReturnUrl=http%3A%2F%2Flocalhost%3A5173%2Fvi%2Fket-qua&vnp_TmnCode=TESTTMN1&vnp_TransactionNo=15741333' +
  '&vnp_TransactionStatus=00&vnp_TxnRef=42';
const EXPECTED_HASH =
  'd116cd43f68e97623d48f643e016a405aa30575d3df3952f6cd6090e74af712f7ed642d2b9fcff1d8b837c793583b981cc57df2f0e091be75415471b21718f67';
// Chữ ký nếu ký trên chuỗi THÔ (cách VNPAY đã từ chối khi đo): mã không được ra giá trị này.
const RAW_RULE_HASH =
  'b2ff8bfc2ad8aa4e3206a328684f2828664b201524fff845e07417069b2e4833a9860a26a17479e74dc17c85a3af19bb2d53b898258a28d054f3810b9704916e';

const signed = (params: Record<string, string>): Record<string, string> => ({
  ...params,
  vnp_SecureHash: signVnpay(params, FAKE_SECRET),
});

describe('vnpay-signature (payment B3)', () => {
  it('CGS-01 ký bộ tham số cố định ⇒ đúng chuỗi ký và đúng chữ ký đã tính tay (mã hoá URL khi ký, hex chữ thường)', () => {
    expect(vnpaySignData(PARAMS)).toBe(EXPECTED_SIGN_DATA);
    expect(signVnpay(PARAMS, FAKE_SECRET)).toBe(EXPECTED_HASH);
    expect(signVnpay(PARAMS, FAKE_SECRET)).not.toBe(RAW_RULE_HASH);
  });

  it('CGS-04 thứ tự tham số đầu vào bất kỳ ⇒ cùng chuỗi ký (luôn sắp tăng dần theo tên)', () => {
    const reversed = Object.fromEntries(Object.entries(PARAMS).reverse());
    expect(vnpaySignData(reversed)).toBe(EXPECTED_SIGN_DATA);
    expect(verifyVnpaySignature(signed(reversed), FAKE_SECRET)).toBe(true);
  });

  it('CGS-03 sửa MỘT tham số mà giữ chữ ký cũ ⇒ không hợp lệ', () => {
    const good = signed(PARAMS);
    for (const [name, value] of [
      ['vnp_Amount', '100'],
      ['vnp_TxnRef', '43'],
      ['vnp_ResponseCode', '24'],
    ] as const) {
      expect(
        verifyVnpaySignature({ ...good, [name]: value }, FAKE_SECRET),
      ).toBe(false);
    }
    expect(verifyVnpaySignature(good, FAKE_SECRET)).toBe(true);
  });

  it('CGS-03 (khoá) chữ ký tính bằng khoá khác ⇒ không hợp lệ', () => {
    const other = {
      ...PARAMS,
      vnp_SecureHash: signVnpay(PARAMS, 'KHOA_GIA_KHAC'),
    };
    expect(verifyVnpaySignature(other, FAKE_SECRET)).toBe(false);
  });

  it('CGS-05 thiếu vnp_SecureHash ⇒ false, không ném lỗi', () => {
    expect(verifyVnpaySignature(PARAMS, FAKE_SECRET)).toBe(false);
  });

  it('CGS-06 chữ ký hex HOA vẫn khớp; độ dài khác, ký tự lạ, rỗng ⇒ false, không ném lỗi', () => {
    expect(
      verifyVnpaySignature(
        { ...PARAMS, vnp_SecureHash: EXPECTED_HASH.toUpperCase() },
        FAKE_SECRET,
      ),
    ).toBe(true);
    for (const bad of [
      '',
      EXPECTED_HASH.slice(0, 64),
      `${EXPECTED_HASH}00`,
      `${EXPECTED_HASH.slice(0, 127)}z`,
    ]) {
      expect(
        verifyVnpaySignature({ ...PARAMS, vnp_SecureHash: bad }, FAKE_SECRET),
      ).toBe(false);
    }
  });

  it('CGS-07 tham số vnp_ lạ vào chuỗi ký; tham số không phải vnp_ và vnp_SecureHashType bị bỏ qua', () => {
    const withExtra = {
      ...PARAMS,
      vnp_Extra: 'x',
      foo: 'bar',
      vnp_SecureHashType: 'HmacSHA512',
    };
    expect(vnpaySignData(withExtra)).toContain('vnp_Extra=x');
    expect(vnpaySignData(withExtra)).not.toContain('foo');
    expect(vnpaySignData(withExtra)).not.toContain('vnp_SecureHashType');
    // Thêm vnp_ lạ sau khi ký ⇒ chữ ký cũ hết khớp; thêm tham số không phải vnp_ ⇒ vẫn khớp.
    expect(
      verifyVnpaySignature({ ...signed(PARAMS), vnp_Extra: 'x' }, FAKE_SECRET),
    ).toBe(false);
    expect(
      verifyVnpaySignature({ ...signed(PARAMS), foo: 'bar' }, FAKE_SECRET),
    ).toBe(true);
  });

  it('CGS-08 sameHexDigest: độ dài khác ⇒ false (không ném), khác hoa thường vẫn bằng nhau', () => {
    expect(sameHexDigest('abcd', 'abcdef')).toBe(false);
    expect(sameHexDigest('', 'ab')).toBe(false);
    expect(sameHexDigest('ABCD', 'abcd')).toBe(true);
    expect(sameHexDigest('abce', 'abcd')).toBe(false);
    expect(sameHexDigest('zzzz', 'abcd')).toBe(false);
  });
});
