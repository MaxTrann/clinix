import { Pencil } from 'lucide-react';
import type { Ref } from 'react';
import { ProfileCard } from './profile-card';
import { genderLabel, toDisplayDate } from './profile-format';
import type { Profile } from './profile-types';

export interface ProfileViewProps {
  profile: Profile;
  onEdit: () => void;
  // Để trang trả focus về nút sau khi lưu hoặc "Hủy"
  editButtonRef?: Ref<HTMLButtonElement>;
}

// Thẻ "Bản thân" ở chế độ xem (HS-17, frame `416:2`). Trường trống hiện "Chưa cập nhật" (gray-500 nghiêng: 4,84:1, Figma #bbb chỉ 1,92:1).
export function ProfileView({
  profile,
  onEdit,
  editButtonRef,
}: ProfileViewProps) {
  const cells: [string, string | null][] = [
    ['Họ và tên', profile.hoTen],
    ['Email', profile.email],
    ['Số điện thoại', profile.soDienThoai],
    ['Giới tính', genderLabel(profile.gioiTinh)],
    ['Ngày sinh', toDisplayDate(profile.ngaySinh)],
    ['Địa chỉ', profile.diaChi],
  ];
  return (
    <ProfileCard
      name={profile.hoTen}
      badge="Bản thân"
      action={
        <button
          ref={editButtonRef}
          type="button"
          onClick={onEdit}
          className="flex min-h-[2.4rem] items-center justify-center gap-[0.4rem] rounded-lg border border-gray-200 bg-white px-[0.9333rem] text-sm leading-normal font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          Chỉnh sửa
        </button>
      }
    >
      <dl className="grid grid-cols-1 gap-x-[1.8667rem] gap-y-4 px-[1.6rem] py-[1.3333rem] sm:grid-cols-2 xl:grid-cols-3">
        {cells.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs leading-normal font-semibold tracking-[0.04em] text-gray-500 uppercase">
              {label}
            </dt>
            <dd className="mt-1 text-[0.9333rem] leading-normal font-medium break-words text-gray-900">
              {value ?? (
                <span className="text-gray-500 italic">Chưa cập nhật</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </ProfileCard>
  );
}
