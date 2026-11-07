import { useEffect, useRef, useState } from 'react';
import { EditButton, InfoGrid, ProfileCard } from '../profile/profile-card';
import { genderLabel, toDisplayDate } from '../profile/profile-format';
import { DeactivateRelativeDialog } from './deactivate-relative-dialog';
import { relationshipLabel } from './relative-labels';
import { RelativeForm } from './relative-form';
import type { Relative } from './relatives-types';

export interface RelativeCardProps {
  relative: Relative;
  // Gọi khi PUT trả 200, với hồ sơ ĐỌC LẠI từ máy chủ
  onSaved: (saved: Relative) => void;
  // Gọi khi POST …/deactivate trả 200, với hồ sơ ở trạng thái đã ngừng (bản trong state web, không phải bản máy chủ)
  onDeactivated: (deactivated: Relative) => void;
  // Tải lại danh sách nền (PUT gặp 404 hoặc 409 kèm câu thông báo; ngừng sử dụng gặp 404)
  onReload: (notice?: string) => void;
}

// Nút phụ trong form sửa: viền danger-line, chữ danger trên nền trắng (hover: nền danger-soft, chữ danger-strong theo ADR 0004).
// Không phải hành động chính của form nên không đặc; nút đặc nằm ở hộp xác nhận.
const DEACTIVATE_BUTTON =
  'min-h-[2.6667rem] rounded-lg border border-danger-line bg-white px-[1.2rem] text-sm leading-normal font-medium text-danger transition-colors hover:bg-danger-soft hover:text-danger-strong';

// Thẻ một hồ sơ người thân (NT-20, NT-22, NT-23; frame `416:2`, `434:2`): xem, rồi sửa tại chỗ, rồi (F7) ngừng sử dụng.
// Trạng thái sửa và trạng thái hộp xác nhận là của riêng từng thẻ (TRACKING F6-G, F7-B).
// Hồ sơ đã ngừng không có nút sửa (Q9, Q10). Màu "Đang sử dụng" `success` (Figma #16a34a chỉ 3,30:1), "Ngừng sử dụng" `gray-600`.
export function RelativeCard({
  relative,
  onSaved,
  onDeactivated,
  onReload,
}: RelativeCardProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const deactivateButton = useRef<HTMLButtonElement>(null);
  // Sau khi lưu hoặc "Hủy" nút "Chỉnh sửa" được dựng lại, rồi mới focus được
  const refocusEdit = useRef(false);

  useEffect(() => {
    if (!editing && refocusEdit.current) {
      refocusEdit.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  // Hồ sơ vừa chuyển sang đã ngừng (409 rồi tải lại, hoặc 200 của ngừng sử dụng) thì form tự biến mất dù `editing` còn true
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

  // 200: hồ sơ đã ngừng nên `showForm` thành false và form (kể cả chữ đang sửa dở) biến mất; focus do khối đặt (nút của thẻ không còn)
  function handleDeactivated() {
    setConfirming(false);
    onDeactivated({ ...relative, trangThaiHieuLuc: false });
  }

  // 404: hồ sơ không còn là của mình ⇒ đóng hộp thoại, khối báo và tải lại danh sách
  function handleMissing(notice: string) {
    setConfirming(false);
    onReload(notice);
  }

  return (
    <>
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
              leadingAction={
                // Tên truy cập có họ tên: nhiều form có thể mở cùng lúc, và khác nút "Ngừng sử dụng" trong hộp thoại
                <button
                  ref={deactivateButton}
                  type="button"
                  aria-label={`Ngừng sử dụng hồ sơ ${relative.hoTen}`}
                  onClick={() => setConfirming(true)}
                  className={DEACTIVATE_BUTTON}
                >
                  Ngừng sử dụng
                </button>
              }
            />
          </div>
        ) : (
          <InfoGrid
            cells={[
              { label: 'Họ và tên', value: relative.hoTen },
              {
                label: 'Quan hệ',
                value: relationshipLabel(relative.moiQuanHe),
              },
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
      {/* Cổng ra `body`: DOM của thẻ không đổi */}
      {confirming && (
        <DeactivateRelativeDialog
          relative={relative}
          returnFocusRef={deactivateButton}
          onClose={() => setConfirming(false)}
          onDeactivated={handleDeactivated}
          onReload={handleMissing}
        />
      )}
    </>
  );
}
