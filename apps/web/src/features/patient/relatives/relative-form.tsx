import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  BirthDateField,
  FormActions,
  FormAlert,
  GenderField,
  SelectField,
  TextField,
} from '../profile/profile-field';
import { todayInVietnam } from '../profile/profile-format';
import { useMounted } from '../profile/use-mounted';
import { RELATIONSHIP_OPTIONS } from './relative-labels';
import {
  buildRelativePayload,
  describeRelativeSaveError,
  firstInvalidRelativeField,
  validateRelativeForm,
  type RelativeField,
  type RelativeFieldErrors,
} from './relative-errors';
import { EMPTY_VALUES, valuesFromRelative } from './relative-rules';
import { createRelative, updateRelative } from './relatives-service';
import type { Relative, RelativeFormValues } from './relatives-types';

export interface RelativeFormProps {
  // null ⇒ thêm (POST); có ⇒ sửa (PUT /patient/relatives/:id)
  relative: Relative | null;
  // Gọi khi POST trả 201 hoặc PUT trả 200, với hồ sơ ĐỌC LẠI từ máy chủ (không phải ô đã nhập)
  onSaved: (saved: Relative) => void;
  onCancel: () => void;
  // Nơi gọi tải lại danh sách nền: nút "Tải lại danh sách" sau POST không rõ kết quả, và PUT gặp 404 hoặc 409 (kèm câu `notice`)
  onReload: (notice?: string) => void;
  // Nút phụ ở đầu hàng nút cuối (thẻ truyền nút "Ngừng sử dụng" cho form SỬA, patient F7); form không biết gì về ngừng sử dụng
  leadingAction?: ReactNode;
}

interface Failure {
  fields: RelativeFieldErrors;
  // Hộp cảnh báo chung ở đầu form
  alert: string | null;
  // POST không rõ kết quả: hộp cảnh báo kèm nút "Tải lại danh sách"
  reload: boolean;
}

// Form thêm và sửa hồ sơ người thân (NT-21, NT-22; frame `433:2`, `434:2`), chỉ là phần `<form>`: thẻ và đầu thẻ do nơi dùng đặt.
// Một form cho cả hai vì năm ô, luật kiểm và chống gửi đúp giống nhau (TRACKING F6-B). Mẫu: ProfileForm của F3.
// Họ tên, SĐT, ngày sinh của người thân là dữ liệu cá nhân: chỉ nằm trong state (không console, kho trình duyệt, URL, location.state).
export function RelativeForm({
  relative,
  onSaved,
  onCancel,
  onReload,
  leadingAction,
}: RelativeFormProps) {
  const creating = relative === null;
  const [values, setValues] = useState<RelativeFormValues>(() =>
    relative === null ? EMPTY_VALUES : valuesFromRelative(relative),
  );
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const hoTenRef = useRef<HTMLInputElement>(null);
  const relationshipRef = useRef<HTMLSelectElement>(null);
  const genderRef = useRef<HTMLSelectElement>(null);
  const birthDateRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  // State chưa kịp render giữa hai lần gửi liên tiếp, nên chống gửi đúp bằng ref (như ProfileForm)
  const submitting = useRef(false);
  // Form đã bị gỡ (rời trang) thì phản hồi về sau không được gọi onSaved hay đổi state
  const mounted = useMounted();

  // Vào form thì focus ô đầu
  useEffect(() => {
    hoTenRef.current?.focus();
  }, []);

  // Lỗi: focus ô lỗi ĐẦU theo thứ tự ô của form (không theo thứ tự `loi[]`), không có ô thì focus hộp cảnh báo
  useEffect(() => {
    if (failure === null) return;
    const refs: Record<RelativeField, { current: HTMLElement | null }> = {
      hoTen: hoTenRef,
      moiQuanHe: relationshipRef,
      gioiTinh: genderRef,
      ngaySinh: birthDateRef,
      soDienThoai: phoneRef,
    };
    const first = firstInvalidRelativeField(failure.fields);
    if (first !== null) refs[first].current?.focus();
    else alertRef.current?.focus();
  }, [failure]);

  function update(name: keyof RelativeFormValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setFailure(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const errors = validateRelativeForm(values, todayInVietnam());
    if (firstInvalidRelativeField(errors) !== null) {
      setFailure({ fields: errors, alert: null, reload: false });
      return;
    }

    submitting.current = true;
    setPending(true);
    setFailure(null);
    try {
      const payload = buildRelativePayload(values);
      const saved = creating
        ? await createRelative(payload)
        : await updateRelative(relative.hoSoNguoiThanId, payload);
      if (mounted.current) onSaved(saved);
    } catch (error) {
      if (!mounted.current) return;
      const next = describeRelativeSaveError(
        error,
        creating ? 'create' : 'update',
      );
      if (next.kind === 'fields') {
        setFailure({ fields: next.fields, alert: next.alert, reload: false });
      } else if (next.kind === 'message') {
        setFailure({ fields: {}, alert: next.message, reload: false });
      } else if (next.kind === 'uncertain') {
        setFailure({ fields: {}, alert: next.message, reload: true });
      } else if (next.kind === 'stale') {
        onReload(next.notice);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  }

  const fields = failure?.fields ?? {};

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      aria-label={
        creating ? 'Thêm người thân mới' : `Chỉnh sửa hồ sơ ${relative.hoTen}`
      }
      aria-busy={pending}
    >
      {failure?.alert && (
        <FormAlert alertRef={alertRef}>
          {failure.alert}
          {failure.reload && (
            <>
              {' '}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => onReload()}
              >
                Tải lại danh sách
              </button>
            </>
          )}
        </FormAlert>
      )}
      <div className="grid grid-cols-1 gap-x-[1.8667rem] gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        <TextField
          label="Họ và tên"
          required
          autoComplete="off"
          placeholder="Nhập họ và tên"
          value={values.hoTen}
          error={fields.hoTen}
          inputRef={hoTenRef}
          onChange={(event) => update('hoTen', event.target.value)}
        />
        <SelectField
          label="Quan hệ"
          required
          emptyLabel="Chọn mối quan hệ"
          options={RELATIONSHIP_OPTIONS}
          value={values.moiQuanHe}
          error={fields.moiQuanHe}
          selectRef={relationshipRef}
          onChange={(value) => update('moiQuanHe', value)}
        />
        <GenderField
          required
          value={values.gioiTinh}
          error={fields.gioiTinh}
          selectRef={genderRef}
          onChange={(value) => update('gioiTinh', value)}
        />
        <BirthDateField
          required
          value={values.ngaySinh}
          error={fields.ngaySinh}
          inputRef={birthDateRef}
          onChange={(value) => update('ngaySinh', value)}
        />
        <TextField
          label="Số điện thoại"
          labelHint="(Tùy chọn)"
          inputMode="tel"
          autoComplete="off"
          value={values.soDienThoai}
          error={fields.soDienThoai}
          inputRef={phoneRef}
          onChange={(event) => update('soDienThoai', event.target.value)}
        />
      </div>

      <FormActions
        pending={pending}
        submitLabel={creating ? 'Thêm hồ sơ' : 'Lưu thay đổi'}
        pendingLabel={creating ? 'Đang thêm…' : 'Đang lưu…'}
        onCancel={onCancel}
        leadingAction={leadingAction}
      />
    </form>
  );
}
