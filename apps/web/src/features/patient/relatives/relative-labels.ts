import type { GenderOption } from '../profile/profile-format';

// Mã lưu ở DB (Q15, đúng 8 giá trị của ENUM `ho_so_nguoi_than.moi_quan_he`) và nhãn hiển thị, theo thứ tự của Q15.
// Nhãn giới tính dùng lại `GENDER_OPTIONS` và `genderLabel` của `profile-format.ts`.
export const RELATIONSHIP_OPTIONS: readonly GenderOption[] = [
  { code: 'Cha', label: 'Cha' },
  { code: 'Me', label: 'Mẹ' },
  { code: 'Vo', label: 'Vợ' },
  { code: 'Chong', label: 'Chồng' },
  { code: 'Con', label: 'Con' },
  { code: 'AnhChiEm', label: 'Anh/Chị/Em' },
  { code: 'OngBa', label: 'Ông/Bà' },
  { code: 'Khac', label: 'Khác' },
];

// Mã lạ ⇒ null: giao diện hiện "Chưa cập nhật"
export function relationshipLabel(code: string): string | null {
  return (
    RELATIONSHIP_OPTIONS.find((option) => option.code === code)?.label ?? null
  );
}
