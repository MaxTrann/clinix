import { isBigintId } from '../../appointments/lists/list-query.rules.js';
import type { ContextIndex } from '../context/context.types.js';
import { SPECIALTY_SUGGESTION_MAX } from './answer.constants.js';
import type { SuggestedSpecialty } from './answer.types.js';
import type { AnswerKind } from './output.schema.js';

// Ánh xạ nhu cầu sang chuyên khoa (chatbot B2; 2.4.77 b3, b4, A1; PLAN chatbot 5.7, T1). Mô hình chọn id trong danh sách chuyên khoa ĐÃ GỬI;
// máy chủ bỏ id lạ, id đã ngừng, id trùng, id không phải số rồi giữ tối đa 3 theo thứ tự mô hình đưa. Id BIGINT luôn là CHUỖI.

/** Đọc lại chuyên khoa ĐANG HOẠT ĐỘNG (id → tên) ở DB: chuyên khoa có thể bị ngừng giữa lúc dựng ngữ cảnh và lúc trả lời (ANX-02). */
export interface ActiveSpecialtySource {
  findActiveSpecialties(
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
}

export interface SpecialtyMapping {
  readonly chuyenKhoaGoiY: SuggestedSpecialty[];
  /** `goiYDatLich` mà không còn id nào: chatbot B3 chọn `KhongCoChuyenKhoa` (2.4.7 A4, ANX-03). */
  readonly khongCoChuyenKhoa: boolean;
}

const NONE: SpecialtyMapping = { chuyenKhoaGoiY: [], khongCoChuyenKhoa: false };

export async function mapSpecialties(input: {
  readonly loai: AnswerKind;
  readonly rawIds: readonly string[];
  /** Ngữ cảnh đã gửi cho lượt này: id nào không có trong đó là id lạ. */
  readonly index: ContextIndex;
  readonly source: ActiveSpecialtySource;
}): Promise<SpecialtyMapping> {
  // Chỉ `goiYDatLich` dùng danh sách này; loại khác thì bỏ qua và không báo A4
  if (input.loai !== 'goiYDatLich') return NONE;

  const sent = [...new Set(input.rawIds.filter(isBigintId))].filter((id) =>
    input.index.activeSpecialties.has(id),
  );
  const active =
    sent.length === 0
      ? new Map<string, string>()
      : await input.source.findActiveSpecialties(sent);

  // Lọc TRƯỚC rồi mới cắt ba: [id lạ, a, b, c] giữ a, b, c
  const kept: SuggestedSpecialty[] = [];
  for (const id of sent) {
    const ten = active.get(id);
    if (ten !== undefined) kept.push({ chuyenKhoaId: id, ten });
  }
  const chuyenKhoaGoiY = kept.slice(0, SPECIALTY_SUGGESTION_MAX);
  return { chuyenKhoaGoiY, khongCoChuyenKhoa: chuyenKhoaGoiY.length === 0 };
}
