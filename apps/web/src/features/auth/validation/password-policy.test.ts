import { checkPassword } from './password-policy';

// Task F2. Mã ca VL-nn là [đề xuất]. Glob thay cho import: Docker build của web không có apps/api, đọc tĩnh sẽ làm `tsc -b` hỏng; glob chỉ chạy ở vitest.
interface PasswordVector {
  input: string;
  expected: string;
  note: string;
}

const files = import.meta.glob<PasswordVector[]>(
  '../../../../../api/src/auth/password/password-policy.vectors.json',
  { eager: true, import: 'default' },
);
const vectors = Object.values(files)[0] ?? [];

describe('SE-08 cùng bộ vector với API', () => {
  it('VL-01 đọc được đủ 70 vector', () => {
    expect(vectors).toHaveLength(70);
  });

  it('VL-02 mọi vector cho đúng kết quả', () => {
    for (const { input, expected, note } of vectors) {
      expect(checkPassword(input) ?? 'OK', note).toBe(expected);
    }
  });

  it('VL-03 DK-06 không trim: dấu cách đầu và cuối tính vào độ dài', () => {
    expect(checkPassword(' abc1!x ')).toBeNull();
    expect(checkPassword(' abc1!')).toBe('MAT_KHAU_KHONG_HOP_LE');
  });
});
