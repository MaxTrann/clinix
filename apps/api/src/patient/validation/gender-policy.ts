// Giới tính (patient P1, quyết định Q3; TRACKING patient P1-C): lưu mã ASCII ở `tai_khoan.gioi_tinh` và `ho_so_nguoi_than.gioi_tinh`.
// Nhãn "Nam", "Nữ", "Khác" do giao diện (web, trang admin) tự ánh xạ. DB không có CHECK cho cột này nên API là chốt chặn duy nhất.
// Hàm thuần, không import gì để frontend sao chép được.

export const GIOI_TINH = ['Nam', 'Nu', 'Khac'] as const;
export type GioiTinh = (typeof GIOI_TINH)[number];

// So đúng từng ký tự, không chuẩn hoá: "nam", "Nữ", " Nam" đều sai
export function isGender(value: unknown): value is GioiTinh {
  return (
    typeof value === 'string' &&
    (GIOI_TINH as readonly string[]).includes(value)
  );
}
