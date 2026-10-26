import argon2 from 'argon2';

// Task P1: chứng minh gói argon2 (có phần mã gốc) cài và chạy được, kể cả trong image Docker.
// Bộ băm mật khẩu thật (tham số S6: m=19 MiB, t=2, p=1) do task A1 viết; liên quan SE-01.
describe('argon2 (kiểm cài đặt)', () => {
  const options = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  it('băm Argon2id với tham số S6 và so khớp đúng/sai', async () => {
    const hash = await argon2.hash('Mat-khau-thu-1!', options);
    // Thư viện in tham số theo thứ tự m,p,t nên kiểm từng tham số, không phụ thuộc thứ tự
    const [, algo, , params] = hash.split('$');
    expect(algo).toBe('argon2id');
    expect(params?.split(',').sort()).toEqual(['m=19456', 'p=1', 't=2']);
    expect(await argon2.verify(hash, 'Mat-khau-thu-1!')).toBe(true);
    expect(await argon2.verify(hash, 'Mat-khau-thu-2!')).toBe(false);
  }, 15000);
});
