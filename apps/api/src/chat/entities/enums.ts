// Enum của scope "Nhắn tin" (chat P1). Thứ tự giá trị đúng ENUM `hoi_thoai.loai` ở docs/database/clinix_mysql.sql.

/** `BenhNhan_BacSi`: Bệnh nhân với một bác sĩ (không chi nhánh); `BenhNhan_LeTan`: hộp thư chung của một chi nhánh (mọi Lễ tân chi nhánh đó cùng thấy). */
export const LOAI_HOI_THOAI = ['BenhNhan_BacSi', 'BenhNhan_LeTan'] as const;
export type LoaiHoiThoai = (typeof LOAI_HOI_THOAI)[number];
