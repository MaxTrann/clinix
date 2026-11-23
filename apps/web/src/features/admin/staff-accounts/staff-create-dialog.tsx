import { X } from 'lucide-react';
import { useEffect, useId, useRef, type FormEvent } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { LoadingState } from '../../../shared/ui/loading-state';
import { AccountLoadError } from '../account-common/account-load-error';
import {
  DEGREE_LABELS,
  TITLE_LABELS,
} from '../doctor-profiles/doctor-profile-format';
import {
  DOCTOR_DEGREES,
  DOCTOR_TITLES,
  type DoctorDegree,
  type DoctorTitle,
} from '../doctor-profiles/doctor-profile-types';
import type { AdminMe } from '../admin-me';
import { useAdminDialogFocus } from '../hooks/use-admin-dialog-focus';
import { useFocusFirstInvalid } from '../hooks/use-focus-first-invalid';
import {
  FixedField,
  RadioGroupField,
  SelectField,
  TextField,
  type RadioOption,
} from './staff-create-fields';
import {
  QTV_ONLY_SYSTEM_NOTE,
  fieldsOf,
  roleOptions,
  servicesOf,
  withBranch,
  withRole,
  withScope,
  withTitle,
  type CreateOptions,
} from './staff-create-model';
import { StaffCreateResult } from './staff-create-result';
import { loadCreateOptions } from './staff-create-service';
import { StaffNoticeBox } from './staff-notice-box';
import { UNKNOWN_CREATE_MESSAGE } from './staff-create-errors';
import type { AdminScopeName, StaffRole } from './staff-types';
import { useStaffCreate } from './use-staff-create';

// Hộp "Tạo tài khoản nhân sự" (admin F8 PR2; PLAN NS b1 đến b8; Figma 523:2 đến 526:2 chỉ là bản phác thảo). Hộp giữa màn hình, có thanh cuộn TRONG thân để tiêu đề và chân
// (Huỷ, Tạo tài khoản) luôn nằm trong khung nhìn. Chỉ gắn khi mở nên tuỳ chọn được nạp MỘT lần mỗi lần mở. Không đóng khi bấm nền (tránh mất dữ liệu); Esc và Huỷ đóng
// không hỏi lại, trừ khi đang gửi (đóng giữa chừng sẽ làm mất kết quả của lần tạo). Mọi logic nằm ở `useStaffCreate`; file này chỉ vẽ và nối.

const DESCRIPTION = 'Người dùng sẽ nhận email kích hoạt để thiết lập mật khẩu.';
const PASSWORD_NOTE =
  'Mật khẩu do người dùng tự đặt qua liên kết trong email. Admin không nhập hay xem mật khẩu của người khác.';
const BUTTON =
  'min-h-[35px] rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-text-primary disabled:opacity-60';

const SCOPE_OPTIONS: RadioOption[] = [
  { value: 'ToanHeThong', label: 'Toàn hệ thống' },
  { value: 'ChiNhanh', label: 'Chi nhánh' },
];
const TITLE_OPTIONS = DOCTOR_TITLES.map((value) => ({
  value,
  label: TITLE_LABELS[value],
}));
const DEGREE_OPTIONS = DOCTOR_DEGREES.map((value) => ({
  value,
  label: DEGREE_LABELS[value],
}));

interface StaffCreateDialogProps {
  me: AdminMe;
  onClose: () => void;
  /** Có thể đã có tài khoản mới: nơi gọi tải lại danh sách. */
  onCreated: () => void;
  /** "Xem chi tiết": nơi gọi đóng hộp RỒI mở panel chi tiết (không bao giờ hai hộp cùng mở). */
  onViewDetail: (taiKhoanId: string) => void;
}

export function StaffCreateDialog({
  me,
  onClose,
  onCreated,
  onViewDetail,
}: StaffCreateDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const baseId = useId();
  const id = (name: string) => `${baseId}-${name}`;

  const form = useStaffCreate({ me, onCreated });
  const options = useRemote<CreateOptions>(
    (signal) => loadCreateOptions(signal),
    [],
  );
  const { values, errors, phase, pending } = form;
  const isSystem = me.phamVi === 'ToanHeThong';

  useAdminDialogFocus(true, dialogRef, () => {
    if (!pending) onClose();
  });
  useFocusFirstInvalid(formRef, form.focusTick);

  // Nút "Tạo tài khoản" tắt lúc chờ nên mất focus. Xong mà vẫn ở biểu mẫu và lỗi không gắn với ô nào (mạng, hết hạn chờ, 403, 500): trả focus về nút để bàn phím
  // không rơi ra ngoài hộp (phát hiện khi đo trình duyệt). Lỗi gắn với ô thì `useFocusFirstInvalid` đã đưa focus vào ô lỗi đầu, không giành lại.
  const submitRef = useRef<HTMLButtonElement>(null);
  const wasPending = useRef(false);
  const hasFieldErrors = Object.keys(errors).length > 0;
  useEffect(() => {
    if (
      wasPending.current &&
      !pending &&
      phase.kind === 'form' &&
      !hasFieldErrors
    )
      submitRef.current?.focus();
    wasPending.current = pending;
  }, [pending, phase.kind, hasFieldErrors]);

  const fields = fieldsOf(values);
  const showBranch = fields.includes('chiNhanhId');
  // Chỉ Bác sĩ (chuyên khoa, dịch vụ) và ô chọn chi nhánh của Toàn hệ thống cần tuỳ chọn từ API; Lễ tân của Admin Chi nhánh gõ ngay được
  const needsOptions = values.vaiTro === 'BacSi' || (isSystem && showBranch);
  const optionsReady =
    options.state.status === 'ready' ? options.state.data : null;
  const branches = optionsReady?.branches ?? [];

  function checkList() {
    onCreated();
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.submit();
  }

  const branchField =
    showBranch &&
    (isSystem ? (
      optionsReady !== null && (
        <SelectField
          id={id('chiNhanhId')}
          label="Chi nhánh"
          placeholder="Chọn chi nhánh"
          value={values.chiNhanhId}
          options={branches.map((b) => ({ value: b.chiNhanhId, label: b.ten }))}
          error={errors.chiNhanhId}
          onChange={(value) => form.update(withBranch(values, value, branches))}
        />
      )
    ) : (
      <FixedField
        label="Chi nhánh"
        value={me.phamVi === 'ChiNhanh' ? me.chiNhanh.ten : ''}
      />
    ));

  const roles: RadioOption[] = roleOptions(me.phamVi).map((role) => ({
    value: role.value,
    label: role.label,
    disabled: role.disabled,
    note: role.disabled ? QTV_ONLY_SYSTEM_NOTE : undefined,
  }));

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-3 sm:p-5">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[560px] flex-col rounded-[15px] bg-white text-text-secondary shadow-xl sm:max-h-[calc(100dvh-2.5rem)]"
      >
        <header className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-lg font-semibold text-text-primary"
            >
              Tạo tài khoản nhân sự
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-text-secondary">
              {DESCRIPTION}
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng hộp thoại"
            className="grid h-[35px] w-[35px] flex-none place-items-center rounded-xl border border-border bg-white text-text-primary disabled:opacity-60"
            disabled={pending}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {phase.kind !== 'form' ? (
          <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-5">
            <StaffCreateResult
              phase={phase}
              onViewDetail={onViewDetail}
              onCreateAnother={form.createAnother}
              onCheckList={checkList}
              onClose={onClose}
            />
          </div>
        ) : (
          <form
            ref={formRef}
            noValidate
            aria-busy={pending}
            className="flex min-h-0 flex-col"
            onSubmit={handleSubmit}
          >
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 pt-4 pb-4">
              <RadioGroupField
                id={id('vaiTro')}
                label="Vai trò"
                value={values.vaiTro}
                options={roles}
                onChange={(value) =>
                  form.update(withRole(values, value as StaffRole))
                }
              />
              <TextField
                id={id('hoTen')}
                label="Họ tên"
                value={values.hoTen}
                maxLength={120}
                error={errors.hoTen}
                onChange={(value) => form.update({ ...values, hoTen: value })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  id={id('email')}
                  label="Email"
                  value={values.email}
                  inputMode="email"
                  maxLength={300}
                  error={errors.email}
                  onChange={(value) => form.update({ ...values, email: value })}
                />
                <TextField
                  id={id('soDienThoai')}
                  label="Số điện thoại"
                  value={values.soDienThoai}
                  inputMode="tel"
                  maxLength={20}
                  error={errors.soDienThoai}
                  onChange={(value) =>
                    form.update({ ...values, soDienThoai: value })
                  }
                />
              </div>

              {values.vaiTro === 'QuanTriVien' && (
                <RadioGroupField
                  id={id('phamVi')}
                  label="Phạm vi"
                  value={values.phamVi}
                  options={SCOPE_OPTIONS}
                  error={errors.phamVi}
                  onChange={(value) =>
                    form.update(withScope(values, value as AdminScopeName))
                  }
                />
              )}

              {needsOptions && options.state.status === 'loading' && (
                <LoadingState message="Đang tải chi nhánh và chuyên khoa…" />
              )}
              {needsOptions && options.state.status === 'error' && (
                <AccountLoadError
                  error={options.state.error}
                  onRetry={options.retry}
                />
              )}

              {branchField}

              {values.vaiTro === 'BacSi' && optionsReady !== null && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      id={id('chucDanh')}
                      label="Chức danh"
                      placeholder="Chọn chức danh"
                      value={values.chucDanh}
                      options={TITLE_OPTIONS}
                      error={errors.chucDanh}
                      onChange={(value) =>
                        form.update(
                          withTitle(values, value as DoctorTitle | ''),
                        )
                      }
                    />
                    <SelectField
                      id={id('hocVi')}
                      label="Học vị"
                      placeholder="Chọn học vị"
                      value={values.hocVi}
                      options={DEGREE_OPTIONS}
                      error={errors.hocVi}
                      onChange={(value) =>
                        form.update({
                          ...values,
                          hocVi: value as DoctorDegree | '',
                        })
                      }
                    />
                  </div>
                  <SelectField
                    id={id('chuyenKhoaId')}
                    label="Chuyên khoa"
                    placeholder="Chọn chuyên khoa"
                    value={values.chuyenKhoaId}
                    options={optionsReady.specialties.map((s) => ({
                      value: s.chuyenKhoaId,
                      label: s.ten,
                    }))}
                    error={errors.chuyenKhoaId}
                    onChange={(value) =>
                      form.update({ ...values, chuyenKhoaId: value })
                    }
                  />
                  <SelectField
                    id={id('dichVuKhamId')}
                    label="Dịch vụ khám chính"
                    placeholder="Chọn dịch vụ khám chính"
                    value={values.dichVuKhamId}
                    options={servicesOf(values.chiNhanhId, branches).map(
                      (s) => ({
                        value: s.dichVuKhamId,
                        label: s.ten,
                      }),
                    )}
                    disabled={values.chiNhanhId === ''}
                    hint={
                      values.chiNhanhId === ''
                        ? 'Chọn chi nhánh trước.'
                        : undefined
                    }
                    error={errors.dichVuKhamId}
                    onChange={(value) =>
                      form.update({ ...values, dichVuKhamId: value })
                    }
                  />
                  <TextField
                    id={id('soNamKinhNghiem')}
                    label="Số năm kinh nghiệm"
                    value={values.soNamKinhNghiem}
                    inputMode="numeric"
                    maxLength={3}
                    error={errors.soNamKinhNghiem}
                    onChange={(value) =>
                      form.update({ ...values, soNamKinhNghiem: value })
                    }
                  />
                </>
              )}

              <p
                role="note"
                className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-text-secondary"
              >
                {PASSWORD_NOTE}
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
              {form.message !== null && (
                <StaffNoticeBox
                  notice={{ kind: 'error', text: form.message }}
                />
              )}
              {form.unknown && (
                <div className="flex flex-col items-start gap-2">
                  <StaffNoticeBox
                    notice={{ kind: 'warning', text: UNKNOWN_CREATE_MESSAGE }}
                  />
                  <button type="button" className={BUTTON} onClick={checkList}>
                    Kiểm tra danh sách
                  </button>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={BUTTON}
                  disabled={pending}
                  onClick={onClose}
                >
                  Huỷ
                </button>
                <button
                  ref={submitRef}
                  type="submit"
                  className="min-h-[35px] rounded-xl bg-brand-strong px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  disabled={pending || (needsOptions && optionsReady === null)}
                >
                  {pending ? 'Đang tạo…' : 'Tạo tài khoản'}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
