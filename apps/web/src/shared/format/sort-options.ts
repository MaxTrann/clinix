// Sắp lựa chọn lấy từ API theo bảng chữ cái tiếng Việt (doctor UX1, G12): `vi` để Ă, Â, Đ đứng đúng chỗ, `numeric` để "Mẫu 2" đứng
// trước "Mẫu 10", `base` để bỏ qua hoa thường và dấu thanh. KHÔNG dùng cho lựa chọn cố định có thứ tự nghiệp vụ (ca, trạng thái,
// nhóm dịch vụ có `thuTuHienThi`). Mục "Tất cả" do nơi gọi đặt ở đầu, ngoài mảng này.
const COLLATOR = new Intl.Collator('vi', {
  numeric: true,
  sensitivity: 'base',
});

// Trả mảng MỚI; mảng gốc giữ nguyên. `Array.prototype.sort` ổn định nên nhãn trùng giữ thứ tự gốc.
export function sortByLabel<T>(
  items: readonly T[],
  label: (item: T) => string,
): T[] {
  return [...items].sort((left, right) =>
    COLLATOR.compare(label(left), label(right)),
  );
}
