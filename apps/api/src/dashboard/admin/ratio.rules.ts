// Tỉ lệ của thẻ số (PLAN dashboard T5): máy chủ trả tử số, mẫu số và phần trăm; web chỉ hiện, không tự tính lại.

export interface Ratio {
  tuSo: number;
  mauSo: number;
  /** Một chữ số thập phân, làm tròn nửa lên; `null` khi mẫu số là 0 ("Chưa đủ dữ liệu") */
  phanTram: number | null;
}

/**
 * Phần trăm làm tròn tới 0,1 bằng phép tính SỐ NGUYÊN: số phần nghìn = floor((2 × tử × 1000 + mẫu) / (2 × mẫu)), tức tử × 1000 / mẫu làm tròn nửa lên.
 * Không dùng `Math.round(x * 10) / 10` trên số thực vì sai ở số như 1/16 = 6,25 (số thực có thể là 6,2499…).
 */
export function toRatio(tuSo: number, mauSo: number): Ratio {
  if (mauSo === 0) return { tuSo, mauSo, phanTram: null };
  const tenths = Math.floor((2 * tuSo * 1000 + mauSo) / (2 * mauSo));
  return { tuSo, mauSo, phanTram: tenths / 10 };
}
