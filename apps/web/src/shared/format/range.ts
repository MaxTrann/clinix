// Khoảng số hay giờ in có khoảng trắng hai bên dấu gạch giữa ("1 – 4", "08:00 – 12:00"), không dính sát số (doctor UX1, G6).
// Một đầu vắng (`null`, `undefined`, chuỗi rỗng) ⇒ `null` để nơi gọi tự chọn chữ thay thế; số 0 là giá trị hợp lệ.
type RangeEnd = string | number | null | undefined;

const present = (end: RangeEnd): end is string | number =>
  end !== null && end !== undefined && end !== '';

// Hai đầu chắc chắn có thì kết quả chắc chắn là chuỗi (không phải xử lý `null`)
export function formatRange(from: string | number, to: string | number): string;
export function formatRange(from: RangeEnd, to: RangeEnd): string | null;
export function formatRange(from: RangeEnd, to: RangeEnd): string | null {
  return present(from) && present(to) ? `${from} – ${to}` : null;
}
