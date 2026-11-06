import type { Profile, ProfileFormValues } from './profile-types';

// Hàm thuần của trang hồ sơ (patient F3; TRACKING F3-D, F3-E): đổi ngày, ngày hôm nay giờ Việt Nam, chữ viết tắt, nhãn giới tính.
// Ngày luôn đổi bằng chuỗi, KHÔNG qua `Date`: `new Date('1990-05-15')` là nửa đêm UTC, ở múi giờ âm đọc ra ngày 14.

export interface GenderOption {
  code: string;
  label: string;
}

// Mã lưu ở DB (Q3) và nhãn hiển thị
export const GENDER_OPTIONS: readonly GenderOption[] = [
  { code: 'Nam', label: 'Nam' },
  { code: 'Nu', label: 'Nữ' },
  { code: 'Khac', label: 'Khác' },
];

// Mã lạ (DB không có CHECK, có thể do sửa tay) hoặc null ⇒ null: giao diện hiện "Chưa cập nhật"
export function genderLabel(code: string | null): string | null {
  return GENDER_OPTIONS.find((option) => option.code === code)?.label ?? null;
}

const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const DISPLAY_DATE = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/;

// YYYY-MM-DD ⇒ dd/mm/yyyy; null hoặc sai dạng ⇒ null
export function toDisplayDate(iso: string | null): string | null {
  const match = iso === null ? null : ISO_DATE.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

// dd/mm/yyyy (đúng hai, hai, bốn chữ số ASCII) ⇒ YYYY-MM-DD; sai dạng ⇒ null. Chưa kiểm ngày có thật: xem isRealDate.
export function fromDisplayDate(text: string): string | null {
  const match = DISPLAY_DATE.exec(text);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// Ngày YYYY-MM-DD có thật không, tính bằng số học (Date tự lăn 2023-02-29 thành 2023-03-01)
export function isRealDate(iso: string): boolean {
  const match = ISO_DATE.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
}

const VIETNAM_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Ngày hôm nay theo lịch Việt Nam (YYYY-MM-DD), không theo múi giờ của máy (Q7: ngày sinh không sau hôm nay)
export function todayInVietnam(now: Date = new Date()): string {
  const parts: Record<string, string> = {};
  for (const part of VIETNAM_DATE.formatToParts(now)) {
    parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Chữ cái đầu của HAI từ đầu của họ tên, theo Figma ("Nguyễn Văn A" ⇒ "NV"). Chuẩn hoá NFC trước để chữ có dấu tổ hợp không
// rơi dấu; từ bắt đầu bằng dấu câu thì lấy chữ cái đầu tiên của từ; từ không có chữ cái bị bỏ; tên một từ ⇒ một chữ.
export function initialsOf(fullName: string): string {
  const letters = [
    ...fullName.normalize('NFC').matchAll(/(?:^|\s)[^\p{L}\s]*(\p{L})/gu),
  ]
    .slice(0, 2)
    .map((match) => match[1]);
  return letters.join('').toLocaleUpperCase('vi');
}

// Giá trị ban đầu của form sửa. Mã giới tính lạ ⇒ '' (chưa chọn): PUT chỉ nhận Nam, Nu, Khac hoặc null nên không giữ nguyên được
// mã lạ; bấm Lưu sẽ ghi đè nó bằng null, có chủ ý (TRACKING F3-E, câu t).
export function valuesFromProfile(profile: Profile): ProfileFormValues {
  return {
    hoTen: profile.hoTen,
    soDienThoai: profile.soDienThoai,
    gioiTinh:
      GENDER_OPTIONS.find((option) => option.code === profile.gioiTinh)?.code ??
      '',
    ngaySinh: toDisplayDate(profile.ngaySinh) ?? '',
    diaChi: profile.diaChi ?? '',
  };
}
