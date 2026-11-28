// Slug trang trí của đường dẫn chi tiết `/cam-nang/12-sot-xuat-huyet` (PLAN article T3, MH20, Q3): sinh ở web từ tiêu đề, máy chủ chỉ nhận mã bài.
// Hàm thuần. Kết quả chỉ gồm a-z, 0-9 và dấu gạch ngang; rỗng khi tiêu đề không có chữ Latinh hay chữ số nào (đường dẫn khi đó chỉ còn mã bài).
export const SLUG_MAX_LENGTH = 80;

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    // NFD tách dấu thanh, mũ, móc thành dấu kết hợp rồi bỏ đi; riêng `đ` KHÔNG tách được nên đổi tay (đã hạ chữ thường nên `Đ` đã thành `đ`)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  // Cắt rồi bỏ dấu gạch ngang thừa ở cuối (cắt giữa hai từ); chạy lại trên kết quả thì không đổi
  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/u, '');
}
