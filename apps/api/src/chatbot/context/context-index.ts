import type { ContextIndex } from './context.types.js';
import {
  placeholderKey,
  type ParsedPlaceholders,
  type PlaceholderRef,
} from './placeholder.js';

// Chỉ mục chỗ giữ của một ngữ cảnh đã dựng (chatbot B2). Lập bằng cách đọc LẠI chữ cuối cùng gửi cho mô hình, nên chỗ giữ của bác sĩ bị cắt vì trần
// ký tự cũng rời chỉ mục, và chỉ mục luôn khớp đúng điều mô hình đã thấy.

export function createContextIndex(
  refs: Iterable<PlaceholderRef>,
  activeSpecialties: ReadonlyMap<string, string>,
): ContextIndex {
  const keys = new Set<string>();
  for (const ref of refs) keys.add(placeholderKey(ref));
  return {
    has: (ref) => keys.has(placeholderKey(ref)),
    activeSpecialties,
  };
}

/** Chữ ngữ cảnh do chính B2 dựng mà không phân tích được là lỗi lập trình (chữ từ DB đã bị làm sạch), nên ném lỗi thay vì đoán. */
export function refsOfBuiltText(parsed: ParsedPlaceholders): PlaceholderRef[] {
  if (!parsed.ok) {
    throw new Error('ngữ cảnh dựng ra có chỗ giữ sai dạng');
  }
  return parsed.refs;
}
