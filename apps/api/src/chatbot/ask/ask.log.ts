import type { ProviderName } from '../providers/ai-provider.js';
import type { AskOutcome } from './ask.dto.js';

// Dòng log của MỘT yêu cầu hỏi đáp (chatbot B3; PLAN chatbot 5.9, RTU-06). DANH SÁCH TRẮNG khoá: `ketQua`, `loai`, `lop`, `thoiGianMs`, `luat`.
// KHÔNG BAO GIỜ có câu hỏi, câu trả lời, ngữ cảnh, lịch sử, thân yêu cầu hay thân lỗi của nhà cung cấp, IP hay token. Mỗi giá trị còn bị ép đúng mẫu chữ-số-gạch dưới,
// nên dù một chỗ nào đó vô tình truyền chữ tự do vào, dòng log cũng không mang được nội dung. Không có `soLanThu` vì `FallbackChain` không trả số lần thử (D4).
// Hàm thuần: nơi gọi ghi bằng `Logger` của Nest (đã qua bộ che log của dự án).

export interface AskLogEntry {
  readonly ketQua: AskOutcome;
  /** `loai` của MÔ HÌNH (khi có): `hoiDap`, `goiYDatLich`, `ngoaiPhamVi`, `khanCap`. */
  readonly loai?: string;
  /** Tên lớp đã trả lời (`groq`, `gemini`) hay `khong` khi không lớp nào trả lời được. */
  readonly lop?: ProviderName | 'khong';
  readonly thoiGianMs: number;
  /** Mã luật: nhóm khẩn cấp (`KC_…`), ngoài phạm vi, tài khoản, hay mã đối chiếu V2 đến V9. */
  readonly luat?: string;
}

const SAFE_TOKEN = /^[A-Za-z0-9_]{1,40}$/;

function token(name: string, value: string): string {
  // Giá trị lạ là lỗi lập trình: thà ném (để ca test đỏ) hơn là ghi chữ tự do vào log
  if (!SAFE_TOKEN.test(value)) {
    throw new RangeError(`Giá trị log "${name}" không đúng mẫu an toàn`);
  }
  return `${name}=${value}`;
}

export function formatAskLog(entry: AskLogEntry): string {
  const ms = Number.isFinite(entry.thoiGianMs)
    ? Math.max(0, Math.round(entry.thoiGianMs))
    : 0;
  const pieces = [token('ketQua', entry.ketQua)];
  if (entry.loai !== undefined) pieces.push(token('loai', entry.loai));
  if (entry.lop !== undefined) pieces.push(token('lop', entry.lop));
  pieces.push(`thoiGianMs=${String(ms)}`);
  if (entry.luat !== undefined) pieces.push(token('luat', entry.luat));
  return `Trợ lý AI: ${pieces.join(' ')}`;
}
