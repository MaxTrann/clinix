import { useEffect, useRef, useState } from 'react';
import { EditButton, InfoGrid, ProfileCard } from '../profile/profile-card';
import { genderLabel, toDisplayDate } from '../profile/profile-format';
import { relationshipLabel } from './relative-labels';
import { RelativeForm } from './relative-form';
import type { Relative } from './relatives-types';

export interface RelativeCardProps {
  relative: Relative;
  // Gọi khi PUT trả 200, với hồ sơ ĐỌC LẠI từ máy chủ
  onSaved: (saved: Relative) => void;
  // Tải lại danh sách nền (PUT gặp 404 hoặc 409 kèm câu thông báo)
  onReload: (notice?: string) => void;
}

// Thẻ một hồ sơ người thân (NT-20, NT-22; frame `416:2`, `434:2`): xem, rồi sửa tại chỗ. Trạng thái sửa là của riêng từng thẻ (TRACKING F6-G).
// Hồ sơ đã ngừng không có nút sửa (Q9, Q10). Màu "Đang sử dụng" `success` (Figma #16a34a chỉ 3,30:1), "Ngừng sử dụng" `gray-600`.
export function RelativeCard({
  relative,
  onSaved,
  onReload,
}: RelativeCardProps) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  // Sau khi lưu hoặc "Hủy" nút "Chỉnh sửa" được dựng lại, rồi mới focus được
  const refocusEdit = useRef(false);

  useEffect(() => {
    if (!editing && refocusEdit.current) {
      refocusEdit.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  // Hồ sơ vừa chuyển sang đã ngừng (409 rồi tải lại) thì form tự biến mất dù `editing` còn true
  const showForm = editing && relative.trangThaiHieuLuc;

  function handleSaved(saved: Relative) {
    refocusEdit.current = true;
    setEditing(false);
    onSaved(saved);
  }

  function handleCancel() {
    refocusEdit.current = true;
    setEditing(false);
  }

  return (
    <ProfileCard
      name={relative.hoTen}
      badge={relationshipLabel(relative.moiQuanHe) ?? 'Chưa cập nhật'}
      action={
        relative.trangThaiHieuLuc && !showForm ? (
          <EditButton
            buttonRef={editButton}
            accessibleName={`Chỉnh sửa hồ sơ ${relative.hoTen}`}
            onClick={() => setEditing(true)}
          />
        ) : undefined
      }
    >
      {showForm ? (
        <div className="px-[1.6rem] py-[1.3333rem]">
          <RelativeForm
            relative={relative}
            onSaved={handleSaved}
            onCancel={handleCancel}
            onReload={onReload}
          />
        </div>
      ) : (
        <InfoGrid
          cells={[
            { label: 'Họ và tên', value: relative.hoTen },
            { label: 'Quan hệ', value: relationshipLabel(relative.moiQuanHe) },
            { label: 'Giới tính', value: genderLabel(relative.gioiTinh) },
            { label: 'Ngày sinh', value: toDisplayDate(relative.ngaySinh) },
            { label: 'Số điện thoại', value: relative.soDienThoai },
            {
              label: 'Trạng thái hồ sơ',
              value: relative.trangThaiHieuLuc ? (
                <span className="text-success">Đang sử dụng</span>
              ) : (
                <span className="text-gray-600">Ngừng sử dụng</span>
              ),
            },
          ]}
        />
      )}
    </ProfileCard>
  );
}
