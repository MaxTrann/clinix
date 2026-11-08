import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Profile } from './profile-types';

export interface ProfileEditing {
  editing: boolean;
  // Vừa lưu thành công: ở lại tới khi sửa lại (hoặc rời trang)
  saved: boolean;
  // Gắn vào nút "Chỉnh sửa" để trả focus về sau khi lưu hoặc "Hủy"
  editButton: RefObject<HTMLButtonElement | null>;
  startEditing: () => void;
  handleSaved: (profile: Profile) => void;
  handleCancel: () => void;
}

// Máy trạng thái xem, sửa, lưu của trang hồ sơ cá nhân, rút nguyên văn từ trang Bản thân (patient F3) để trang Lễ tân (F4) dùng chung
// (TRACKING F4-C). Không có DOM, không `useId`: hai trang giữ nguyên id của mình.
// `replace` ghi hồ sơ đọc lại từ phản hồi PUT vào trạng thái của `useProfile`.
export function useProfileEditing(
  replace: (profile: Profile) => void,
): ProfileEditing {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  // Sau khi lưu hoặc "Hủy" nút "Chỉnh sửa" được dựng lại, rồi mới focus được
  const refocusEdit = useRef(false);

  useEffect(() => {
    if (!editing && refocusEdit.current) {
      refocusEdit.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  function startEditing() {
    setSaved(false);
    setEditing(true);
  }

  function handleSaved(profile: Profile) {
    replace(profile);
    refocusEdit.current = true;
    setSaved(true);
    setEditing(false);
  }

  function handleCancel() {
    refocusEdit.current = true;
    setEditing(false);
  }

  return {
    editing,
    saved,
    editButton,
    startEditing,
    handleSaved,
    handleCancel,
  };
}
