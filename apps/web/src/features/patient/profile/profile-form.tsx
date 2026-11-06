import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { refreshCurrentUser } from '../../auth';
import {
  buildProfileUpdate,
  describeSaveError,
  firstInvalidField,
  validateProfileForm,
  type ProfileField,
  type ProfileFieldErrors,
} from './profile-errors';
import {
  FormAlert,
  ReadOnlyField,
  SelectField,
  TextField,
} from './profile-field';
import {
  GENDER_OPTIONS,
  todayInVietnam,
  valuesFromProfile,
} from './profile-format';
import { updateProfile } from './profile-service';
import type { Profile, ProfileFormValues } from './profile-types';

export interface ProfileFormProps {
  profile: Profile;
  // Gọi khi PUT trả 200, với hồ sơ ĐỌC LẠI từ máy chủ (không phải ô đã nhập)
  onSaved: (saved: Profile) => void;
  onCancel: () => void;
}

interface Failure {
  fields: ProfileFieldErrors;
  // Hộp cảnh báo chung ở đầu form
  alert: string | null;
}

const EMAIL_NOTE = 'Email dùng để đăng nhập, không thể thay đổi.';

// Form sửa hồ sơ bản thân (HS-18, HS-19, HS-20; frame `432:2`), chỉ là phần `<form>`: thẻ và đầu thẻ do nơi dùng đặt (TRACKING F3-B).
// Họ tên, SĐT, ngày sinh, địa chỉ là dữ liệu cá nhân: chỉ nằm trong state của form (không console, kho trình duyệt, URL, location.state).
export function ProfileForm({ profile, onSaved, onCancel }: ProfileFormProps) {
  const [values, setValues] = useState<ProfileFormValues>(() =>
    valuesFromProfile(profile),
  );
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const hoTenRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const genderRef = useRef<HTMLSelectElement>(null);
  const birthDateRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  // State chưa kịp render giữa hai lần gửi liên tiếp, nên chống gửi đúp bằng ref (như ChangePasswordForm)
  const submitting = useRef(false);
  // Form đã bị gỡ (rời trang) thì phản hồi về sau không được gọi onSaved hay đổi state. `usePageActive` của auth không xuất qua
  // index.ts. StrictMode chạy effect, dọn, rồi chạy lại: lần chạy lại đặt true trở lại.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Vào form thì focus ô đầu
  useEffect(() => {
    hoTenRef.current?.focus();
  }, []);

  // Lỗi: focus ô lỗi ĐẦU theo thứ tự ô của form (không theo thứ tự `loi[]`), không có ô thì focus hộp cảnh báo
  useEffect(() => {
    if (failure === null) return;
    const refs: Record<ProfileField, { current: HTMLElement | null }> = {
      hoTen: hoTenRef,
      soDienThoai: phoneRef,
      gioiTinh: genderRef,
      ngaySinh: birthDateRef,
      diaChi: addressRef,
    };
    const first = firstInvalidField(failure.fields);
    if (first !== null) refs[first].current?.focus();
    else alertRef.current?.focus();
  }, [failure]);

  function update(name: keyof ProfileFormValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setFailure(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const errors = validateProfileForm(values, todayInVietnam());
    if (firstInvalidField(errors) !== null) {
      setFailure({ fields: errors, alert: null });
      return;
    }

    submitting.current = true;
    setPending(true);
    setFailure(null);
    try {
      const saved = await updateProfile(buildProfileUpdate(values));
      // Về chế độ xem NGAY với dữ liệu của phản hồi, rồi mới chờ /auth/me để giao diện không đứng chờ tới 15 giây
      if (mounted.current) onSaved(saved);
      // PUT đã ghi: dù form còn hay không, thanh bên phải đổi tên. Không bao giờ ném; `false` KHÔNG phải lưu thất bại.
      await refreshCurrentUser();
    } catch (error) {
      if (!mounted.current) return;
      const next = describeSaveError(error);
      if (next.kind === 'fields') {
        setFailure({ fields: next.fields, alert: next.alert });
      } else if (next.kind === 'message') {
        setFailure({ fields: {}, alert: next.message });
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
      aria-label="Chỉnh sửa thông tin bản thân"
      aria-busy={pending}
      className="px-[1.6rem] py-[1.3333rem]"
    >
      {failure?.alert && (
        <FormAlert alertRef={alertRef}>{failure.alert}</FormAlert>
      )}
      <div className="grid grid-cols-1 gap-x-[1.8667rem] gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        <TextField
          label="Họ và tên"
          required
          autoComplete="name"
          value={values.hoTen}
          error={fields.hoTen}
          inputRef={hoTenRef}
          onChange={(event) => update('hoTen', event.target.value)}
        />
        <ReadOnlyField label="Email" value={profile.email} note={EMAIL_NOTE} />
        <TextField
          label="Số điện thoại"
          required
          inputMode="tel"
          autoComplete="tel"
          value={values.soDienThoai}
          error={fields.soDienThoai}
          inputRef={phoneRef}
          onChange={(event) => update('soDienThoai', event.target.value)}
        />
        <SelectField
          label="Giới tính"
          emptyLabel="Chọn giới tính"
          options={GENDER_OPTIONS}
          value={values.gioiTinh}
          error={fields.gioiTinh}
          selectRef={genderRef}
          onChange={(value) => update('gioiTinh', value)}
        />
        <TextField
          label="Ngày sinh"
          labelHint="(dd/mm/yyyy)"
          maxLength={10}
          autoComplete="off"
          value={values.ngaySinh}
          error={fields.ngaySinh}
          inputRef={birthDateRef}
          onChange={(event) => update('ngaySinh', event.target.value)}
        />
        <TextField
          label="Địa chỉ"
          placeholder="Nhập địa chỉ"
          value={values.diaChi}
          error={fields.diaChi}
          inputRef={addressRef}
          onChange={(event) => update('diaChi', event.target.value)}
        />
      </div>

      <div className="mt-[1.2rem] flex flex-wrap justify-end gap-2.5">
        {/* Không huỷ được yêu cầu đang bay (huỷ giữa chừng thì không biết hiện dữ liệu nào), nên khoá khi đang lưu */}
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="min-h-[2.6667rem] rounded-lg border border-gray-200 bg-white px-[1.2rem] text-sm leading-normal font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={pending}
          className="min-h-[2.6667rem] rounded-lg border border-transparent bg-brand-strong px-[1.2rem] text-sm leading-normal font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong"
        >
          {pending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  );
}
