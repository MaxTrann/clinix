import { inspect } from 'node:util';
import { IssuedOtp } from './issued-otp.js';

// Task A2. Mã test case: DK-40 (mọi đáp ứng ở mọi môi trường không trả/hiện OTP), DK-39, SE-04 (mức đối tượng): nếu một controller lỡ đưa
// nguyên IssuedOtp vào phản hồi hay log thì mã rõ vẫn không lộ.
const CODE = '739104';

function make(): IssuedOtp {
  return new IssuedOtp(
    {
      maXacThucId: '15',
      taiKhoanId: '7',
      loai: 'DangKy',
      hetHanLuc: new Date('2026-10-28T01:10:00.000Z'),
    },
    CODE,
  );
}

describe('IssuedOtp — mã rõ không lộ qua bất kỳ cách in/tuần tự hoá nào (OTP-09)', () => {
  it('giữ các trường công khai để người gọi dùng', () => {
    const issued = make();
    expect(issued.maXacThucId).toBe('15');
    expect(issued.taiKhoanId).toBe('7');
    expect(issued.loai).toBe('DangKy');
    expect(issued.hetHanLuc.toISOString()).toBe('2026-10-28T01:10:00.000Z');
  });

  it('JSON.stringify không chứa mã, và không có khoá nào mang mã', () => {
    const issued = make();
    const json = JSON.stringify(issued);
    expect(json).not.toContain(CODE);
    expect(JSON.parse(json)).toEqual({
      maXacThucId: '15',
      taiKhoanId: '7',
      loai: 'DangKy',
      hetHanLuc: '2026-10-28T01:10:00.000Z',
    });
  });

  it('trải đối tượng, liệt kê khoá, chuyển thành chuỗi, inspect/console đều không lộ mã', () => {
    const issued = make();
    const everything = [
      JSON.stringify(Object.assign({}, issued)),
      JSON.stringify(Object.entries(issued)),
      Object.getOwnPropertyNames(issued).join(','),
      Object.prototype.toString.call(issued),
      `${String(JSON.stringify(issued))}`,
      inspect(issued, { showHidden: true, depth: 5 }),
      inspect({ nested: { issued } }, { depth: 10 }),
    ].join('\n');
    expect(everything).not.toContain(CODE);
  });

  it('chỉ revealForDelivery lấy được mã, và chỉ MỘT lần (không gửi trùng một mã)', () => {
    const issued = make();
    expect(IssuedOtp.revealForDelivery(issued)).toBe(CODE);
    expect(() => IssuedOtp.revealForDelivery(issued)).toThrow('đã được lấy');
  });

  it('thông báo lỗi lấy mã lần hai không chứa mã', () => {
    const issued = make();
    IssuedOtp.revealForDelivery(issued);
    try {
      IssuedOtp.revealForDelivery(issued);
      throw new Error('mong đợi bị ném lỗi');
    } catch (error) {
      expect((error as Error).message).not.toContain(CODE);
    }
  });
});
