import { caretAfterDigits, onlyDigits } from '../digit-caret';

// Ô giờ 24h gõ tay (thay `<input type="time">` hiện AM/PM theo cài đặt Windows), admin PR2 mục 6.4. Hàm thuần để test không cần
// trình duyệt. Chỉ định dạng; giờ có HỢP LỆ hay không do `isTime` (cùng quy tắc API) quyết định, nên "24:00" hay "12:60" vẫn để
// nguyên và bị báo ở lần Lưu, không đoán.

export interface TimeEdit {
  text: string;
  caret: number;
}

const countColons = (text: string): number => text.split(':').length - 1;

// Mặt nạ khi gõ. `deleting` = người dùng đang xóa: không tự chèn lại dấu hai chấm sau 2 chữ số, không tự thêm số 0.
export function maskTime(raw: string, deleting: boolean): string {
  const cleaned = raw.replace(/[^\d:]/gu, '');
  const colon = cleaned.indexOf(':');
  // Dấu hai chấm người dùng tự gõ (sau ít nhất 1 chữ số) được giữ: "8:00" chờ chuẩn hóa khi rời ô
  if (colon > 0) {
    const hours = onlyDigits(cleaned.slice(0, colon)).slice(0, 2);
    const minutes = onlyDigits(cleaned.slice(colon + 1)).slice(0, 2);
    return `${hours}:${minutes}`;
  }

  const digits = onlyDigits(cleaned).slice(0, 4);
  const first = digits.charAt(0);
  if (digits.length === 0) return '';
  if (deleting && digits.length === 1) return digits;
  // Chữ số giờ đầu 3–9 không thể mở đầu giờ hai chữ số (≤ 23): thêm số 0 và dấu hai chấm, nên gõ "800" ra "08:00"
  if (first >= '3') return `0${first}:${digits.slice(1, 3)}`;
  if (digits.length === 1) return digits;
  if (digits.length === 2) return deleting ? digits : `${digits}:`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// Chuẩn hóa khi rời ô: "800" và "8:00" ⇒ "08:00", "1:30" ⇒ "01:30". Dạng khác để nguyên (không đoán).
export function normalizeTime(text: string): string {
  const withColon = /^(\d):([0-5]\d)$/u.exec(text);
  if (withColon) return `0${withColon[1]}:${withColon[2]}`;
  const threeDigits = /^(\d)([0-5]\d)$/u.exec(text);
  if (threeDigits) return `0${threeDigits[1]}:${threeDigits[2]}`;
  const fourDigits = /^(\d\d)([0-5]\d)$/u.exec(text);
  if (fourDigits) return `${fourDigits[1]}:${fourDigits[2]}`;
  return text;
}

// Người dùng gõ/xóa trong ô. `previousText` là chuỗi đang hiển thị, `nextText` là chuỗi trình duyệt vừa tạo ra.
export function applyTimeChange(
  previousText: string,
  nextText: string,
  caret: number,
  direction: 'backward' | 'forward',
): TimeEdit {
  const deleting = nextText.length < previousText.length;

  // Gõ một ký tự lạ (không phải chữ số, không thêm dấu hai chấm mới): bỏ qua, giữ nguyên ô
  if (
    !deleting &&
    onlyDigits(nextText) === onlyDigits(previousText) &&
    countColons(nextText) <= countColons(previousText)
  ) {
    return {
      text: previousText,
      caret: Math.max(0, caret - (nextText.length - previousText.length)),
    };
  }

  const masked = maskTime(nextText, deleting);

  // Chỉ mất dấu hai chấm ở GIỮA ("08:|30" bấm Backspace ra "08|30") thì mặt nạ dựng lại đúng chuỗi cũ và ô đứng yên (bàn phím ảo/IME
  // không gửi keydown Backspace nhận ra được): xóa thêm chữ số kề con trỏ. Mất dấu hai chấm ở CUỐI ("08:" ⇒ "08") thì chuỗi đã
  // đổi nên không xóa thêm.
  if (deleting && masked === previousText) {
    const stream = onlyDigits(nextText);
    let index = onlyDigits(nextText.slice(0, caret)).length;
    let kept = stream;
    if (direction === 'backward') {
      if (index > 0) {
        kept = stream.slice(0, index - 1) + stream.slice(index);
        index -= 1;
      }
    } else {
      kept = stream.slice(0, index) + stream.slice(index + 1);
    }
    const text = maskTime(kept, true);
    return { text, caret: caretAfterDigits(text, index) };
  }

  // Gõ ở cuối thì con trỏ ở cuối (kể cả sau dấu hai chấm vừa tự chèn); sửa giữa chuỗi thì đếm theo chữ số
  const position =
    caret >= nextText.length
      ? masked.length
      : caretAfterDigits(masked, onlyDigits(nextText.slice(0, caret)).length);
  return { text: masked, caret: position };
}
