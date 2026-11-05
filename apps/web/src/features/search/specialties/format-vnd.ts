// 350000 -> "350.000đ" (vi-VN dùng dấu chấm ngăn nghìn)
export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)}đ`;
}
