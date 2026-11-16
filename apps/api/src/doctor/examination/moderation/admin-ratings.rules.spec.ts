import {
  previewComment,
  totalOf,
  type AdminRatingCounts,
} from './admin-ratings.rules.js';

// doctor-exam B7 — hàm thuần của danh sách đánh giá cho Quản trị viên (PLAN 5.8; KDD-02, KDD-18). Không DB. Mọi giá trị mong đợi do test viết tay.
const SMILE = '😀'; // 2 đơn vị UTF-16 (một cặp thay thế)

/** Không có nửa cặp thay thế nào lẻ loi (tự viết vì `String.prototype.isWellFormed` thuộc ES2024, dự án nhắm ES2023). */
const noLoneSurrogate = (text: string | null): boolean =>
  text !== null &&
  !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(
    text,
  );

describe('KDD-18 previewComment: cắt nhận xét theo đơn vị UTF-16, không cắt giữa cặp thay thế', () => {
  it('null giữ null; chuỗi rỗng giữ rỗng; chuỗi ngắn hơn hay bằng giới hạn giữ nguyên', () => {
    expect(previewComment(null, 200)).toBeNull();
    expect(previewComment('', 200)).toBe('');
    expect(previewComment('a'.repeat(199), 200)).toBe('a'.repeat(199));
    expect(previewComment('a'.repeat(200), 200)).toBe('a'.repeat(200));
  });

  it('biên 201: cắt còn đúng 200; không thêm dấu "…"', () => {
    const cut = previewComment('a'.repeat(201), 200);
    expect(cut).toBe('a'.repeat(200));
    expect(cut).not.toContain('…');
    expect(previewComment('b'.repeat(1000), 200)).toHaveLength(200);
  });

  it('chữ tiếng Việt có dấu (một đơn vị mỗi ký tự): 300 ký tự ⇒ 200', () => {
    const cut = previewComment('ế'.repeat(300), 200);
    expect(cut).toBe('ế'.repeat(200));
  });

  it('emoji vắt qua điểm cắt (nửa đầu ở chỉ số 199): lùi một đơn vị, không để nửa ký tự', () => {
    const text = `${'a'.repeat(199)}${SMILE}`; // dài 201, emoji ở chỉ số 199 và 200
    const cut = previewComment(text, 200);
    expect(cut).toBe('a'.repeat(199));
    expect(noLoneSurrogate(cut)).toBe(true);
  });

  it('emoji nằm trọn trước điểm cắt (chỉ số 198 và 199): giữ nguyên emoji, đủ 200', () => {
    const text = `${'a'.repeat(198)}${SMILE}b`; // dài 201
    const cut = previewComment(text, 200);
    expect(cut).toBe(`${'a'.repeat(198)}${SMILE}`);
    expect(cut).toHaveLength(200);
    expect(noLoneSurrogate(cut)).toBe(true);
  });

  it('toàn emoji: giới hạn chẵn cắt đúng ranh giới, giới hạn lẻ lùi một đơn vị; kết quả luôn well-formed', () => {
    const text = SMILE.repeat(150); // 300 đơn vị
    expect(previewComment(text, 200)).toBe(SMILE.repeat(100));
    expect(previewComment(text, 199)).toBe(SMILE.repeat(99));
    expect(noLoneSurrogate(previewComment(text, 199))).toBe(true);
    // đối chứng: bộ kiểm có bắt được nửa cặp lẻ (cắt thô bằng slice)
    expect(noLoneSurrogate(text.slice(0, 199))).toBe(false);
  });

  it('giới hạn rất nhỏ rơi giữa cặp đầu tiên: ra chuỗi rỗng, không nửa ký tự', () => {
    expect(previewComment(`${SMILE}${SMILE}`, 1)).toBe('');
  });
});

describe('KDD-02 totalOf: total suy từ câu đếm theo trạng thái', () => {
  const counts: AdminRatingCounts = { HienThi: 7, DaAn: 3 };

  it('trangThai vắng ⇒ cộng cả hai; có trangThai ⇒ chỉ trạng thái đó', () => {
    expect(totalOf(counts, undefined)).toBe(10);
    expect(totalOf(counts, 'HienThi')).toBe(7);
    expect(totalOf(counts, 'DaAn')).toBe(3);
  });

  it('một trạng thái không có đánh giá nào ⇒ 0 (không NaN, không âm)', () => {
    expect(totalOf({ HienThi: 4, DaAn: 0 }, 'DaAn')).toBe(0);
    expect(totalOf({ HienThi: 0, DaAn: 0 }, undefined)).toBe(0);
  });
});
