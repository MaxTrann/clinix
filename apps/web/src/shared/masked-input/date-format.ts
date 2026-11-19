import { caretAfterDigits, onlyDigits } from './digit-caret';

// Phần thuần của ô ngày dd/mm/yyyy (doctor UX1, G5). Giá trị trong state và gửi API luôn là `YYYY-MM-DD`; ô chỉ đổi cách GÕ và HIỂN THỊ.
// Khuôn như ô giờ 24h (`admin/branches/time-format.ts`): mặt nạ khi gõ, con trỏ đếm theo CHỮ SỐ đứng trước (dấu / thêm hay bớt không làm lệch).
// Hàm thuần để test không cần trình duyệt. Mặt nạ chỉ định dạng; ngày có THẬT hay không do `isRealIsoDate` quyết (31/02 vẫn hiện nguyên và bị báo).

export interface DateEdit {
  text: string;
  caret: number;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
// Dấu phân cách gõ tay: / . - và khoảng trắng đều coi như "sang ô kế"
const SEPARATOR = /[/.\-\s]/;
const MAX_LENGTH = [2, 2, 4] as const;
// Số đầu lớn hơn mốc này không thể mở đầu số hai chữ số (ngày ≤ 31, tháng ≤ 12): tự thêm 0 phía trước
const PAD_ABOVE = ['3', '1'] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// Ngày YYYY-MM-DD có thật không, tính bằng số học (`Date` tự lăn 2023-02-29 thành 2023-03-01)
export function isRealIsoDate(iso: string): boolean {
  const match = ISO.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

// YYYY-MM-DD ⇒ dd/mm/yyyy; rỗng, sai dạng hay ngày không có thật ⇒ ''
export function isoToDisplay(iso: string): string {
  return isRealIsoDate(iso)
    ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
    : '';
}

// dd/mm/yyyy (đúng hai, hai, bốn chữ số) ⇒ YYYY-MM-DD; sai dạng hay ngày không có thật ⇒ null
export function parseDisplayDate(text: string): string | null {
  const match = DISPLAY.exec(text);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return isRealIsoDate(iso) ? iso : null;
}

// Đủ 10 ký tự dd/mm/yyyy mà ngày không tồn tại (31/02, 29/02 năm không nhuận): dở dang không tính là "sai"
export function isCompleteInvalidDate(text: string): boolean {
  return DISPLAY.test(text) && parseDisplayDate(text) === null;
}

// Mặt nạ khi gõ. `deleting` = người dùng đang xoá: không tự chèn lại dấu / sau chữ số cuối, không bù 0 cho số đơn.
export function maskDate(raw: string, deleting: boolean): string {
  const parts = ['', '', ''];
  let stage = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw.charAt(index);
    if (/\d/.test(char)) {
      // Ô hiện tại đã đủ chữ số: chữ số kế tiếp sang ô sau (ô năm đầy thì bỏ phần dư)
      if ((parts[stage] ?? '').length === MAX_LENGTH[stage]) {
        if (stage === 2) continue;
        stage += 1;
      }
      const padAbove = PAD_ABOVE[stage];
      // Ô đã có dấu / ngay sau hai chữ số ("24/21/2026" do sửa giữa chừng) thì ranh giới đã rõ: giữ nguyên, không bù 0 rồi đẩy chữ số sau sang ô kế
      const bounded =
        /\d/.test(raw.charAt(index + 1)) &&
        SEPARATOR.test(raw.charAt(index + 2));
      if (
        parts[stage] === '' &&
        padAbove !== undefined &&
        !deleting &&
        !bounded &&
        char > padAbove
      ) {
        parts[stage] = `0${char}`;
      } else {
        parts[stage] += char;
      }
    } else if (SEPARATOR.test(char)) {
      // Dấu phân cách khi ô còn trống (đứng đầu, gõ đôi) bỏ qua; sau 1 chữ số thì bù 0 ("1/" ⇒ "01/"), trừ khi đang xoá
      // (xoá một chữ số của "11" ra "1/" thì giữ nguyên, không tự đổi thành "01")
      if (parts[stage] === '' || stage === 2) continue;
      if (!deleting && (parts[stage] ?? '').length === 1) {
        parts[stage] = `0${parts[stage]}`;
      }
      stage += 1;
    }
  }

  const [day, month, year] = parts;
  const dayDone = stage >= 1 || ((day ?? '').length === 2 && !deleting);
  if (!dayDone) return day ?? '';
  const monthDone = stage >= 2 || ((month ?? '').length === 2 && !deleting);
  if (!monthDone) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

// Dán hoặc tự điền CẢ ngày một lần: nhận `dd/mm/yyyy`, `d/m/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy`, `ddmmyyyy` và `yyyy-mm-dd`
// (đường này cũng là cách test và trình duyệt tự điền gửi giá trị ISO vào ô). Trả chuỗi `dd/mm/yyyy` hoặc null khi không phải ngày;
// CHƯA kiểm ngày có thật (30/02 vẫn trả về để nơi dùng báo riêng).
export function parsePastedDate(text: string): string | null {
  const trimmed = text.trim();
  const iso = ISO.exec(trimmed);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const separated = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (separated) {
    return `${(separated[1] ?? '').padStart(2, '0')}/${(separated[2] ?? '').padStart(2, '0')}/${separated[3]}`;
  }
  const digits = /^(\d{2})(\d{2})(\d{4})$/.exec(trimmed);
  if (digits) return `${digits[1]}/${digits[2]}/${digits[3]}`;
  return null;
}

const countSeparators = (text: string): number =>
  (text.match(/[/.\-\s]/g) ?? []).length;

// Chữ mới chỉ khác chữ cũ tối đa MỘT ký tự (chèn một, xoá một hay thay một)? So phần đầu và phần cuối giống nhau của hai chuỗi: phần còn
// lại ở giữa của mỗi chuỗi dài không quá 1. Gõ phím luôn là sửa một ký tự; tự điền hay dán cả ngày thì khác hẳn chữ cũ.
function isSingleEdit(previous: string, next: string): boolean {
  const limit = Math.min(previous.length, next.length);
  let prefix = 0;
  while (prefix < limit && previous.charAt(prefix) === next.charAt(prefix)) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < limit - prefix &&
    previous.charAt(previous.length - 1 - suffix) ===
      next.charAt(next.length - 1 - suffix)
  ) {
    suffix += 1;
  }
  return (
    previous.length - prefix - suffix <= 1 && next.length - prefix - suffix <= 1
  );
}

// Người dùng gõ/xoá trong ô. `previous` là chuỗi đang hiển thị, `next` là chuỗi trình duyệt vừa tạo ra, `caret` là vị trí con trỏ trong `next`.
export function applyDateChange(
  previous: string,
  next: string,
  caret: number,
  direction: 'backward' | 'forward',
): DateEdit {
  const deleting = next.length < previous.length;

  // Tự điền hay dán CẢ ngày qua `change` (không phải xoá): thay hết. Hai trường hợp KHÔNG phải dán dù chữ mới trông giống một ngày:
  // chuỗi NGẮN hơn chữ cũ là xoá ("24/11/2026" xoá một chữ số ra "24/1/2026" không được bù thành "24/01/2026"), và sửa đúng một ký tự là gõ
  // phím ("24/1/2026" gõ "1" giữa chừng ra "24/11/2026": con trỏ ở lại sau chữ số vừa gõ, không nhảy về cuối; lỗi F1 ở trình duyệt thật).
  const pasted =
    deleting || isSingleEdit(previous, next) ? null : parsePastedDate(next);
  if (pasted !== null) return { text: pasted, caret: pasted.length };

  // Gõ một ký tự lạ (không phải chữ số, không thêm dấu phân cách mới): bỏ qua, giữ nguyên ô
  if (
    !deleting &&
    onlyDigits(next) === onlyDigits(previous) &&
    countSeparators(next) <= countSeparators(previous)
  ) {
    return {
      text: previous,
      caret: Math.max(0, caret - (next.length - previous.length)),
    };
  }

  const masked = maskDate(next, deleting);

  // Chỉ mất dấu / ở GIỮA ("24/|11" bấm Backspace ra "24|11") thì mặt nạ dựng lại đúng chuỗi cũ và ô đứng yên (bàn phím ảo hay IME không
  // gửi keydown Backspace nhận ra được): xoá thêm chữ số kề con trỏ. Mất dấu / ở CUỐI ("24/" ⇒ "24") thì chuỗi đã đổi nên không xoá thêm.
  if (deleting && masked === previous) {
    const stream = onlyDigits(next);
    let index = onlyDigits(next.slice(0, caret)).length;
    let kept = stream;
    if (direction === 'backward') {
      if (index > 0) {
        kept = stream.slice(0, index - 1) + stream.slice(index);
        index -= 1;
      }
    } else {
      kept = stream.slice(0, index) + stream.slice(index + 1);
    }
    const text = maskDate(kept, true);
    return { text, caret: caretAfterDigits(text, index) };
  }

  // Gõ ở cuối thì con trỏ ở cuối (kể cả sau dấu / vừa tự chèn); sửa giữa chuỗi thì đếm theo chữ số
  const position =
    caret >= next.length
      ? masked.length
      : caretAfterDigits(masked, onlyDigits(next.slice(0, caret)).length);
  return { text: masked, caret: position };
}
