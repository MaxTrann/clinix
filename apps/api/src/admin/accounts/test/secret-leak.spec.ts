import { assertNoSecretLeak, findSecretLeaks } from '../testing/secret-leak.js';

// Một bộ quét chỉ đáng tin khi chính nó được chứng minh là BẮT được thứ nó tìm.
describe('TKB17-07 (SE-A12) — bộ quét assertNoSecretLeak tự chứng minh', () => {
  it.each([
    'matKhauBam',
    'mat_khau_bam',
    'maBam',
    'ma_bam',
    'refreshTokenBam',
    'accessToken',
    'otp',
    'passwordHash',
    'secret',
    'salt',
  ])('bắt tên khoá cấm "%s" ở mọi độ sâu', (key) => {
    expect(findSecretLeaks({ [key]: 1 })).toHaveLength(1);
    expect(findSecretLeaks({ a: { b: [{ [key]: 1 }] } })).toHaveLength(1);
  });

  it('bắt giá trị băm Argon2, SHA-256 hex nguyên giá trị, token base64url 43 ký tự', () => {
    expect(
      findSecretLeaks({ x: '$argon2id$v=19$m=19456,t=2,p=1$aaa$bbb' }),
    ).toHaveLength(1);
    expect(findSecretLeaks({ x: 'ab'.repeat(32) })).toHaveLength(1);
    expect(findSecretLeaks({ x: 'A'.repeat(43) })).toHaveLength(1);
    expect(
      findSecretLeaks({ x: `${'A'.repeat(21)}-_${'b'.repeat(20)}` }),
    ).toHaveLength(1);
  });

  it('bắt chuỗi mồi nằm giữa một chuỗi dài hơn, trong mảng, và không in lại giá trị mồi', () => {
    const sentinel = 'moi-bi-mat-xyz-123';
    const leaks = findSecretLeaks({ ghiChu: [`đầu ${sentinel} cuối`] }, [
      sentinel,
    ]);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).not.toContain(sentinel);
    expect(leaks[0]).toContain('$.ghiChu[0]');
  });

  it('chuỗi mồi rỗng không bao giờ khớp (tránh báo sai)', () => {
    expect(findSecretLeaks({ a: 'bất kỳ' }, [''])).toEqual([]);
  });

  it('KHÔNG báo sai trên dữ liệu hợp lệ của API tài khoản', () => {
    expect(
      findSecretLeaks({
        items: [
          {
            taiKhoanId: '10',
            loaiTaiKhoan: 'BenhNhan',
            hoTen: 'Nguyễn Văn A',
            email: 'nguoi.dung.12@example.com',
            soDienThoai: '0901234567',
            ngaySinh: '1990-05-17',
            gioiTinh: 'Nam',
            trangThai: 'DangHoatDong',
            thoiDiemTao: '2026-11-01T03:00:00.000Z',
            chiNhanh: { chiNhanhId: '7', ten: 'Chi nhánh Quận 7' },
            lienKetKichHoat: {
              trangThai: 'HOP_LE',
              hetHanLuc: '2026-11-19T01:00:00.000Z',
            },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toEqual([]);
  });

  it('assertNoSecretLeak ném lỗi nêu đường dẫn khi có vi phạm, và im lặng khi sạch', () => {
    expect(() => assertNoSecretLeak({ a: { matKhauBam: 'x' } })).toThrow(
      /\$\.a\.matKhauBam/,
    );
    expect(() => assertNoSecretLeak({ a: 'b' })).not.toThrow();
  });
});
