// Định dạng giờ Việt Nam và tiền cho các trang lịch hẹn của booking (F1; F2, F8, F10, F11 dùng lại). Hàm thuần.
// Bản nhỏ riêng của booking vì `features/` không import chéo (các bản ở patient, doctor, search nằm trong module của họ; gom lại ở TECH_DEBT).

// API trả mốc giờ dạng ISO 8601 UTC (`Date.toISOString()`). `Intl` ném RangeError với chuỗi không phải ngày: bộ đọc phản hồi kiểm bằng
// `isIsoDateTime` TRƯỚC khi dữ liệu tới các hàm format.
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function isIsoDateTime(value: string): boolean {
  return ISO_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}

// `hourCycle: 'h23'` (không dùng `hour12: false`: một số bản ICU ra "24:30" lúc nửa đêm)
const VIETNAM_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function vietnamParts(iso: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of VIETNAM_PARTS.formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  return parts;
}

// Chỉ số theo `Date.getUTCDay()`: 0 = Chủ nhật. Chữ như Figma `411:2` ("Thứ 3, 20/10/2026", "Chủ nhật, 18/10/2026")
const WEEKDAY_LABELS = [
  'Chủ nhật',
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
] as const;

// Thứ theo quy ước ISO của API (A6: `chiTiet.thuTrongTuan`, 1 = Thứ 2 … 7 = Chủ nhật) ⇒ "Thứ 2" … "Chủ nhật"; ngoài 1 đến 7 ⇒ null. Dùng chung bảng nhãn ở trên (booking F4).
export function isoWeekdayLabel(iso: unknown): string | null {
  return typeof iso === 'number' &&
    Number.isInteger(iso) &&
    iso >= 1 &&
    iso <= 7
    ? WEEKDAY_LABELS[iso % 7]
    : null;
}

// ISO UTC ⇒ "Thứ 3, 20/10/2026" theo NGÀY giờ Việt Nam, KHÔNG theo múi giờ của máy và KHÔNG cắt 10 ký tự đầu: 17:30 UTC đã là 00:30 ngày hôm sau
// ở Việt Nam. Thứ trong tuần tính từ ngày Việt Nam (dựng ở UTC trên ba số năm, tháng, ngày) nên cũng không lệch theo múi giờ.
export function formatVietnamWeekdayDate(iso: string): string {
  const { year, month, day } = vietnamParts(iso);
  const weekday = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  ).getUTCDay();
  return `${WEEKDAY_LABELS[weekday]}, ${day}/${month}/${year}`;
}

// ISO UTC ⇒ "18/10" theo NGÀY giờ Việt Nam, không năm (Figma Lễ tân `479:2`: ô "Ngày & Giờ" ghi giờ rồi ngày ngắn). Cùng cách lấy ngày như trên: không cắt chuỗi, không theo múi giờ máy.
export function formatVietnamShortDate(iso: string): string {
  const { month, day } = vietnamParts(iso);
  return `${day}/${month}`;
}

// ISO UTC ⇒ "18/10/2026" theo NGÀY giờ Việt Nam (F9: câu `NGOAI_KHUNG_GIO_TIEP_DON` cần ngày đầy đủ vì hai mốc có thể khác ngày). Cùng cách lấy ngày như trên.
export function formatVietnamDate(iso: string): string {
  const { year, month, day } = vietnamParts(iso);
  return `${day}/${month}/${year}`;
}

// ISO UTC ⇒ "08:00" theo giờ Việt Nam (00:00 đến 23:59)
export function formatVietnamTime(iso: string): string {
  const { hour, minute } = vietnamParts(iso);
  return `${hour}:${minute}`;
}

// Tiền là chuỗi decimal của API (`"300000.00"`, DECIMAL của MySQL): không dấu, không số mũ, phần thập phân tuỳ chọn
const DECIMAL_AMOUNT = /^(\d+)(?:\.\d+)?$/;

export function isDecimalAmount(value: string): boolean {
  return DECIMAL_AMOUNT.test(value);
}

// "300000.00" ⇒ "300.000đ". Chỉ BỎ phần thập phân và chèn dấu chấm ngăn nghìn trên CHUỖI: không đi qua `Number` (số lớn hơn 2^53 và giá
// trị như "0.10" không sai vì làm tròn nhị phân, H4). VND không có đơn vị nhỏ hơn đồng nên không làm tròn. Chuỗi sai dạng ném RangeError.
export function formatVnd(amount: string): string {
  const match = DECIMAL_AMOUNT.exec(amount);
  if (match === null) throw new RangeError(`Số tiền không hợp lệ: ${amount}`);
  const integerPart = match[1].replace(/^0+(?=\d)/, '');
  return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}

// Số tiền decimal có lớn hơn 0 không, kiểm trên CHUỖI (không qua `Number`): chuỗi đã đúng dạng `DECIMAL_AMOUNT` nên chỉ cần có một chữ số khác 0 ("0", "0.00" là
// không còn gì; "0.10" và "200000.00" là còn). Dùng cho "còn phải thu" của Lễ tân: nơi gọi KHÔNG tính tiền, chỉ hỏi còn hay hết.
export function isPositiveAmount(value: string): boolean {
  return DECIMAL_AMOUNT.test(value) && /[1-9]/.test(value);
}
