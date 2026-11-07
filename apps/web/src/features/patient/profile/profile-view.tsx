import type { Ref } from 'react';
import { EditButton, InfoGrid, ProfileCard } from './profile-card';
import { genderLabel, toDisplayDate } from './profile-format';
import type { Profile } from './profile-types';

export interface ProfileViewProps {
  profile: Profile;
  onEdit: () => void;
  // Để trang trả focus về nút sau khi lưu hoặc "Hủy"
  editButtonRef?: Ref<HTMLButtonElement>;
}

// Thẻ "Bản thân" ở chế độ xem (HS-17, frame `416:2`). Lưới ô và nút sửa dùng chung với thẻ người thân (`InfoGrid`, `EditButton`).
export function ProfileView({
  profile,
  onEdit,
  editButtonRef,
}: ProfileViewProps) {
  return (
    <ProfileCard
      name={profile.hoTen}
      badge="Bản thân"
      action={<EditButton onClick={onEdit} buttonRef={editButtonRef} />}
    >
      <InfoGrid
        cells={[
          { label: 'Họ và tên', value: profile.hoTen },
          { label: 'Email', value: profile.email },
          { label: 'Số điện thoại', value: profile.soDienThoai },
          { label: 'Giới tính', value: genderLabel(profile.gioiTinh) },
          { label: 'Ngày sinh', value: toDisplayDate(profile.ngaySinh) },
          { label: 'Địa chỉ', value: profile.diaChi },
        ]}
      />
    </ProfileCard>
  );
}
