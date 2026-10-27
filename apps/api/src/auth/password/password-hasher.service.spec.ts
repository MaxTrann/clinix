import { Logger } from '@nestjs/common';
import argon2 from 'argon2';
import { ARGON2_OPTIONS } from '../auth.constants.js';
import { PasswordHasher } from './password-hasher.service.js';

// Task A1. Test case: SE-01 (định dạng băm; phần lưu trong DB ở password-hasher.int-spec.ts),
// DN-05 và DN-06 (mức hàm so giả; phần đăng nhập qua endpoint làm ở A8), H6/H7/H10 trong PLAN.md mục 3.5.
const PASSWORD = 'Mat-khau-thu-1!';

// Thư viện in tham số theo thứ tự m,p,t nên kiểm từng tham số, không phụ thuộc thứ tự
function paramsOf(hash: string): string[] {
  const [, algo, , params] = hash.split('$');
  expect(algo).toBe('argon2id');
  return (params ?? '').split(',').sort();
}

async function median(
  samples: number,
  run: () => Promise<unknown>,
): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    await run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] as number;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PasswordHasher.hash / verify (SE-01)', () => {
  const hasher = new PasswordHasher();

  it('băm Argon2id với đúng tham số S6: m=19456, t=2, p=1', async () => {
    const hash = await hasher.hash(PASSWORD);
    expect(hash.startsWith('$argon2id$v=19$')).toBe(true);
    expect(paramsOf(hash)).toEqual(['m=19456', 'p=1', 't=2']);
    expect(ARGON2_OPTIONS).toMatchObject({
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }, 15000);

  it('không lưu bản rõ và hai lần băm cùng mật khẩu cho hai chuỗi khác nhau (muối ngẫu nhiên)', async () => {
    const [a, b] = await Promise.all([
      hasher.hash(PASSWORD),
      hasher.hash(PASSWORD),
    ]);
    expect(a).not.toBe(b);
    expect(a).not.toContain(PASSWORD);
  }, 15000);

  it('so khớp đúng mật khẩu, từ chối sai mật khẩu kể cả sai dấu cách / hoa thường / rỗng', async () => {
    const hash = await hasher.hash(PASSWORD);
    expect(await hasher.verify(hash, PASSWORD)).toBe(true);
    for (const wrong of [
      'Mat-khau-thu-2!',
      'mat-khau-thu-1!',
      `${PASSWORD} `,
      ` ${PASSWORD}`,
      '',
    ]) {
      expect(await hasher.verify(hash, wrong), JSON.stringify(wrong)).toBe(
        false,
      );
    }
  }, 15000);

  it('hash vẫn dùng được với mật khẩu dài đúng 64 ký tự và với dấu cách đầu/cuối (không trim)', async () => {
    const padded = ` ${'a'.repeat(60)}1! `;
    expect(padded).toHaveLength(64);
    const hash = await hasher.hash(padded);
    expect(await hasher.verify(hash, padded)).toBe(true);
    expect(await hasher.verify(hash, padded.trim())).toBe(false);
  }, 15000);

  it('chuỗi băm hỏng hoặc rỗng → false, không ném lỗi, log không chứa chuỗi băm', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    for (const broken of [
      '',
      'khong-phai-bam',
      '$argon2id$',
      '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
    ]) {
      expect(await hasher.verify(broken, PASSWORD), broken).toBe(false);
    }
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('khong-phai-bam');
  });

  it('verify dùng tham số lưu trong chuỗi băm, nên băm tạo với tham số khác vẫn so khớp được', async () => {
    const legacy = await argon2.hash(PASSWORD, {
      ...ARGON2_OPTIONS,
      memoryCost: 8192,
      timeCost: 3,
    });
    expect(await hasher.verify(legacy, PASSWORD)).toBe(true);
    expect(await hasher.verify(legacy, 'sai')).toBe(false);
  }, 15000);
});

describe('PasswordHasher.verifyDummy (DN-05, DN-06, H7)', () => {
  it('luôn trả false, kể cả khi đưa vào đúng một mật khẩu "thật"', async () => {
    const hasher = new PasswordHasher();
    expect(await hasher.verifyDummy(PASSWORD)).toBe(false);
    expect(await hasher.verifyDummy('')).toBe(false);
  }, 15000);

  it('làm đúng một lần so Argon2id đầy đủ trên băm giả có cùng tham số S6 với băm thật', async () => {
    const hasher = new PasswordHasher();
    await hasher.onModuleInit(); // tạo băm giả sẵn từ lúc khởi động
    const verify = vi.spyOn(argon2, 'verify');
    await hasher.verifyDummy(PASSWORD);
    expect(verify).toHaveBeenCalledTimes(1);
    const dummyHash = verify.mock.calls[0]?.[0] as string;
    expect(paramsOf(dummyHash)).toEqual(['m=19456', 'p=1', 't=2']);
    expect(verify.mock.calls[0]?.[1]).toBe(PASSWORD);
  }, 15000);

  it('chỉ tạo băm giả một lần dù gọi nhiều lần, kể cả khi gọi đồng thời trước khi khởi tạo xong', async () => {
    const hasher = new PasswordHasher();
    const hash = vi.spyOn(argon2, 'hash');
    await Promise.all([
      hasher.verifyDummy('a'),
      hasher.verifyDummy('b'),
      hasher.verifyDummy('c'),
    ]);
    await hasher.verifyDummy('d');
    expect(hash).toHaveBeenCalledTimes(1);
  }, 15000);

  it('băm giả hỏng lúc khởi động thì lần gọi sau thử lại, không nhớ lỗi mãi', async () => {
    const hasher = new PasswordHasher();
    vi.spyOn(argon2, 'hash').mockRejectedValueOnce(
      new Error('hết bộ nhớ giả lập'),
    );
    await expect(hasher.onModuleInit()).rejects.toThrow('hết bộ nhớ giả lập');
    expect(await hasher.verifyDummy(PASSWORD)).toBe(false);
  }, 15000);

  it('thời gian gần bằng một lần verify thật với mật khẩu sai (kiểm lỏng, thước đo chính thức ở A8/DN-06)', async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash(PASSWORD);
    await hasher.onModuleInit();
    await median(3, () => hasher.verify(hash, 'khoi-dong-nong-1!')); // khởi động nóng
    const real = await median(7, () => hasher.verify(hash, 'Sai-mat-khau-9!'));
    const dummy = await median(7, () => hasher.verifyDummy('Sai-mat-khau-9!'));
    // Chỉ chặn trường hợp hàm giả trả ngay (không làm việc) hoặc nặng gấp bội; máy CI nhiễu nên để biên rộng
    expect(dummy).toBeGreaterThan(real * 0.5);
    expect(dummy).toBeLessThan(real * 2);
  }, 30000);
});
