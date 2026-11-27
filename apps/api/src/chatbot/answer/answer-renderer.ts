import {
  PLACEHOLDER_STAND_IN,
  parsePlaceholders,
  placeholderKey,
} from '../context/placeholder.js';
import type { Doan, ResolvedValue } from './answer.types.js';

// Dựng đoạn trả lời (chatbot B2; PLAN chatbot 5.7 "Dựng đoạn", DCR-01, DCR-12). Chữ của mô hình và giá trị máy chủ đã đọc lại xen kẽ thành mảng đoạn:
// `{ kieu: 'chu', chu }` hay `{ kieu: 'thucThe', doiTuong, id, chu }` (web tự dựng liên kết từ `doiTuong` và `id`). KHÔNG HTML, KHÔNG markdown, KHÔNG thoát ký tự:
// chữ có `<` hay `&` hợp lệ giữ nguyên là chữ, web in bằng văn bản thường. Hàm thuần.

/** Trả `null` khi chỗ giữ sai dạng hay thiếu giá trị (không bao giờ xảy ra sau V2 và `EntityResolver`, nhưng không đoán). */
export function renderAnswer(
  traLoi: string,
  values: ReadonlyMap<string, ResolvedValue>,
): Doan[] | null {
  const parsed = parsePlaceholders(traLoi);
  if (!parsed.ok) return null;
  // `stripped` đã thay MỖI chỗ giữ bằng đúng một ký tự giữ chỗ: n chỗ giữ cắt chữ thành n + 1 đoạn
  const texts = parsed.stripped.split(PLACEHOLDER_STAND_IN);
  const doan: Doan[] = [];

  const pushText = (chu: string): void => {
    if (chu === '') return;
    const last = doan[doan.length - 1];
    if (last?.kieu === 'chu')
      doan[doan.length - 1] = { kieu: 'chu', chu: last.chu + chu };
    else doan.push({ kieu: 'chu', chu });
  };

  for (const [position, text] of texts.entries()) {
    pushText(text);
    const ref = parsed.refs[position];
    if (ref === undefined) continue;
    const value = values.get(placeholderKey(ref));
    if (value === undefined) return null;
    if (value.entity) {
      doan.push({ kieu: 'thucThe', ...value.entity, chu: value.chu });
    } else {
      pushText(value.chu);
    }
  }
  return trimEnds(doan);
}

// Bỏ khoảng trắng đầu và cuối cả câu (chỉ ở đoạn chữ), bỏ đoạn chữ rỗng còn lại
function trimEnds(doan: Doan[]): Doan[] {
  const first = doan[0];
  if (first?.kieu === 'chu')
    doan[0] = { kieu: 'chu', chu: first.chu.trimStart() };
  const last = doan[doan.length - 1];
  if (last?.kieu === 'chu') {
    doan[doan.length - 1] = { kieu: 'chu', chu: last.chu.trimEnd() };
  }
  return doan.filter((piece) => piece.kieu !== 'chu' || piece.chu !== '');
}
