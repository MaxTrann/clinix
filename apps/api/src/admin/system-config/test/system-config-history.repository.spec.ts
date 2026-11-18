import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// CHB6-16 (CH-19): kiểm TĨNH nguồn repository lịch sử cấu hình: chỉ ĐỌC, không khoá, không lấy cột riêng tư (admin B6; cùng ý luật AR-08 của appointments).
// Hành vi thật với MySQL được kiểm ở `system-config-history.int-spec.ts`. Chú thích bị bỏ trước khi quét để chữ trong lời giải thích không làm đỏ nhầm.
const SOURCE_PATH = fileURLToPath(
  new URL('../system-config-history.repository.ts', import.meta.url),
);
const source = readFileSync(SOURCE_PATH, 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('B6 CH-19 — SystemConfigHistoryRepository (kiểm tĩnh)', () => {
  it('CHB6-16: không câu ghi, không DDL, không khoá hàng, không gọi ghi của TypeORM', () => {
    for (const pattern of [
      /\b(?:INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|ALTER|DROP|CREATE)\b/i,
      /\bFOR\s+(?:UPDATE|SHARE)\b/i,
      /\bLOCK\s+IN\s+SHARE\s+MODE\b/i,
      /\.\s*(?:insert|update|upsert|save|delete|remove|softDelete|increment|decrement)\s*\(/,
    ])
      expect(code).not.toMatch(pattern);
  });

  it('CHB6-16: bảng nhat_ky_hanh_dong chỉ xuất hiện sau FROM, đúng hai lần (câu đếm và câu danh sách)', () => {
    const mentions = [...code.matchAll(/nhat_ky_hanh_dong(?!_)/g)];
    const reads = [...code.matchAll(/\bFROM\s+nhat_ky_hanh_dong(?!_)\s+n\b/g)];
    expect(mentions).toHaveLength(2);
    expect(reads).toHaveLength(2);
  });

  it('CHB6-16: chỉ lấy họ tên của tài khoản; không đụng email, số điện thoại, băm mật khẩu hay mã tài khoản', () => {
    expect(code).toContain('t.ho_ten AS hoTen');
    for (const column of [
      'email',
      'so_dien_thoai',
      'mat_khau_bam',
      'tai_khoan_id AS',
    ])
      expect(code).not.toContain(column);
  });

  it('CHB6-16: câu đếm và câu danh sách dùng CHUNG một điều kiện lọc (không thể lệch nhau)', () => {
    expect(code.match(/\$\{WHERE_SQL\}/g)).toHaveLength(2);
    expect(code.match(/\bWHERE\b/g)).toHaveLength(1);
  });
});
