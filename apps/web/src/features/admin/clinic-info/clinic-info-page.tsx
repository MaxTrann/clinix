import { useRef, useState, type FormEvent } from 'react';
import { Info } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { errorMessageFor } from '../../../shared/api/error-message';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  clinicInfoFieldError,
  validateClinicInfo,
  type ClinicInfoFieldErrors,
} from './clinic-info-validation';
import { updateClinicInfo } from './clinic-info-service';
import type {
  ClinicInfo,
  ClinicInfoField,
  ClinicInfoInput,
} from './clinic-info-types';
import { useFocusFirstInvalid } from '../hooks/use-focus-first-invalid';
import { useClinicInfo } from './use-clinic-info';
import { BranchesTab } from '../branches/branches-tab';
import { useAdminScope } from '../use-admin-scope';
import styles from './clinic-info.module.css';

function toInput(info: ClinicInfo): ClinicInfoInput {
  return {
    tenThuongHieu: info.tenThuongHieu ?? '',
    diaChiTruSo: info.diaChiTruSo ?? '',
    duongDayNong: info.duongDayNong ?? '',
    email: info.email ?? '',
  };
}

const FIELDS: ClinicInfoField[] = [
  'tenThuongHieu',
  'diaChiTruSo',
  'duongDayNong',
  'email',
];

function fieldFromApiName(name: string): ClinicInfoField | undefined {
  if (
    name === 'tenThuongHieu' ||
    name === 'diaChiTruSo' ||
    name === 'duongDayNong' ||
    name === 'email'
  ) {
    return name;
  }
  return undefined;
}

function ClinicInfoForm({
  info,
  readOnly,
}: {
  info: ClinicInfo;
  readOnly: boolean;
}) {
  const [values, setValues] = useState<ClinicInfoInput>(() => toInput(info));
  // Bản chụp dữ liệu đã tải/đã lưu: nút Hủy khôi phục về đây, và so với nó để biết ô đã đổi chưa (PR1 mục 7).
  // Đổi sau mỗi lần lưu thành công, nên Hủy không quay về giá trị tải ban đầu.
  const [baseline, setBaseline] = useState<ClinicInfoInput>(() =>
    toInput(info),
  );
  const [fieldErrors, setFieldErrors] = useState<ClinicInfoFieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const brandInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Tăng khi bấm Lưu mà có ô lỗi (phía form hoặc từ máy chủ): đưa focus vào ô lỗi đầu tiên, không cướp focus lúc đang gõ (admin PR2 6.2)
  const [focusTick, setFocusTick] = useState(0);
  useFocusFirstInvalid(formRef, focusTick);
  // So từng ký tự, không cắt khoảng trắng: ô còn dư một dấu cách thì Hủy vẫn bật để đưa nó về như đã tải.
  const isDirty = FIELDS.some((field) => values[field] !== baseline[field]);

  function changeField(field: ClinicInfoField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError('');
    setSaved(false);
  }

  // Dòng "Đã lưu" không cần xóa ở đây: nó chỉ hiện khi chưa đổi gì (changeField đã xóa nó), lúc đó Hủy đang mờ.
  function cancel() {
    setValues(baseline);
    setFieldErrors({});
    setFormError('');
    // Nút Hủy vừa mờ đi nên giữ tiêu điểm trong form, tránh rơi về body với người dùng bàn phím
    brandInput.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    setFormError('');
    setSaved(false);
    const errors = validateClinicInfo(
      values,
      emailInput.current?.validity.typeMismatch ?? false,
    );
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFocusTick((count) => count + 1);
      return;
    }

    setSaving(true);
    try {
      const result = await updateClinicInfo(values);
      const savedValues = toInput(result);
      setValues(savedValues);
      setBaseline(savedValues);
      setFieldErrors({});
      setSaved(true);
    } catch (error) {
      if (error instanceof ApiError && error.maLoi === 'DU_LIEU_KHONG_HOP_LE') {
        const apiErrors: ClinicInfoFieldErrors = {};
        for (const fieldError of error.loi ?? []) {
          const field = fieldFromApiName(fieldError.truong);
          const message = clinicInfoFieldError(fieldError.ma);
          if (field && message) apiErrors[field] = message;
        }
        setFieldErrors(apiErrors);
        if (Object.keys(apiErrors).length === 0) {
          setFormError(
            'Một số thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường.',
          );
        } else {
          setFocusTick((count) => count + 1);
        }
      } else if (error instanceof ApiError && error.status === 403) {
        setFormError('Bạn không có quyền cập nhật thông tin phòng khám.');
      } else {
        setFormError(errorMessageFor(error));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      ref={formRef}
      className={styles.formCard}
      aria-label="Thông tin chung"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="clinic-brand-name">
            Tên thương hiệu <span aria-hidden="true">*</span>
          </label>
          <div className={styles.inputWrap}>
            <img
              className={styles.inputIcon}
              src="/assets/admin/clinic-info/brand.svg"
              alt=""
              aria-hidden="true"
            />
            <input
              ref={brandInput}
              id="clinic-brand-name"
              name="tenThuongHieu"
              className={styles.input}
              type="text"
              autoComplete="organization"
              required
              disabled={saving || readOnly}
              value={values.tenThuongHieu}
              aria-invalid={Boolean(fieldErrors.tenThuongHieu)}
              aria-describedby={
                fieldErrors.tenThuongHieu ? 'clinic-brand-error' : undefined
              }
              onChange={(event) =>
                changeField('tenThuongHieu', event.currentTarget.value)
              }
            />
          </div>
          {fieldErrors.tenThuongHieu && (
            <p
              id="clinic-brand-error"
              className={styles.fieldError}
              role="alert"
            >
              {fieldErrors.tenThuongHieu}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="clinic-address">
            Địa chỉ trụ sở chính <span aria-hidden="true">*</span>
          </label>
          <div className={styles.inputWrap}>
            <img
              className={styles.inputIcon}
              src="/assets/admin/clinic-info/location.svg"
              alt=""
              aria-hidden="true"
            />
            <input
              id="clinic-address"
              name="diaChiTruSo"
              className={styles.input}
              type="text"
              autoComplete="street-address"
              required
              disabled={saving || readOnly}
              value={values.diaChiTruSo}
              aria-invalid={Boolean(fieldErrors.diaChiTruSo)}
              aria-describedby={
                fieldErrors.diaChiTruSo ? 'clinic-address-error' : undefined
              }
              onChange={(event) =>
                changeField('diaChiTruSo', event.currentTarget.value)
              }
            />
          </div>
          {fieldErrors.diaChiTruSo && (
            <p
              id="clinic-address-error"
              className={styles.fieldError}
              role="alert"
            >
              {fieldErrors.diaChiTruSo}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="clinic-hotline">
            Đường dây nóng <span aria-hidden="true">*</span>
          </label>
          <div className={styles.inputWrap}>
            <img
              className={styles.inputIcon}
              src="/assets/admin/clinic-info/phone.svg"
              alt=""
              aria-hidden="true"
            />
            <input
              id="clinic-hotline"
              name="duongDayNong"
              className={styles.input}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              disabled={saving || readOnly}
              value={values.duongDayNong}
              aria-invalid={Boolean(fieldErrors.duongDayNong)}
              aria-describedby={
                fieldErrors.duongDayNong ? 'clinic-hotline-error' : undefined
              }
              onChange={(event) =>
                changeField('duongDayNong', event.currentTarget.value)
              }
            />
          </div>
          {fieldErrors.duongDayNong && (
            <p
              id="clinic-hotline-error"
              className={styles.fieldError}
              role="alert"
            >
              {fieldErrors.duongDayNong}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="clinic-email">
            Email liên hệ chung <span aria-hidden="true">*</span>
          </label>
          <div className={styles.inputWrap}>
            <img
              className={styles.inputIcon}
              src="/assets/admin/clinic-info/email.svg"
              alt=""
              aria-hidden="true"
            />
            <input
              ref={emailInput}
              id="clinic-email"
              name="email"
              className={styles.input}
              type="email"
              autoComplete="email"
              required
              disabled={saving || readOnly}
              value={values.email}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={
                fieldErrors.email ? 'clinic-email-error' : undefined
              }
              onChange={(event) =>
                changeField('email', event.currentTarget.value)
              }
            />
          </div>
          {fieldErrors.email && (
            <p
              id="clinic-email-error"
              className={styles.fieldError}
              role="alert"
            >
              {fieldErrors.email}
            </p>
          )}
        </div>
      </div>

      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}
      {saved && (
        <p className={styles.successMessage} role="status">
          Đã lưu thông tin chung.
        </p>
      )}

      {!readOnly && (
        <div className={styles.actions}>
          {/* Hủy là nút MỚI so với Figma 541:2 (nhóm đã chốt 16/11/2026); cả hai nút mờ khi chưa đổi gì hoặc đang lưu */}
          <button
            className={styles.cancelButton}
            type="button"
            disabled={saving || !isDirty}
            onClick={cancel}
          >
            Hủy
          </button>
          <button
            className={styles.saveButton}
            type="submit"
            disabled={saving || !isDirty}
            aria-busy={saving}
          >
            <img
              src="/assets/admin/clinic-info/save.svg"
              alt=""
              aria-hidden="true"
            />
            {saving ? 'Đang lưu…' : 'Lưu thông tin chung'}
          </button>
        </div>
      )}
    </form>
  );
}

function GeneralInfoPanel() {
  const { state, retry } = useClinicInfo();
  // Figma 629:2: Admin Chi nhánh xem được nhưng không sửa (PUT chỉ Toàn hệ thống)
  const readOnly = useAdminScope().phamVi !== 'ToanHeThong';

  return (
    <>
      {readOnly && (
        <p className={styles.readOnlyBanner} role="note">
          <Info size={13} aria-hidden="true" />
          Thông tin chung toàn hệ thống — chỉ Admin Toàn hệ thống có thể chỉnh
          sửa. Bạn đang xem ở chế độ chỉ đọc.
        </p>
      )}
      {state.status === 'loading' && (
        <LoadingState message="Đang tải thông tin phòng khám…" />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={retry} />
      )}
      {state.status === 'success' && (
        <ClinicInfoForm info={state.data} readOnly={readOnly} />
      )}
    </>
  );
}

export function ClinicInfoPage() {
  // dashboard F1 (T10): `?tab=chi-nhanh` mở thẳng tab Chi nhánh (liên kết "Thay đổi chi nhánh" của trang Tổng quan); không có tham số thì vẫn ở tab chung.
  // Chỉ là GIÁ TRỊ KHỞI TẠO: bấm tab sau đó không ghi lại URL.
  const [searchParams] = useSearchParams();
  const openBranches = searchParams.get('tab') === 'chi-nhanh';
  const [activeTab, setActiveTab] = useState<'general' | 'branches'>(
    openBranches ? 'branches' : 'general',
  );
  const [branchesVisited, setBranchesVisited] = useState(openBranches);

  return (
    <section className={styles.page} aria-labelledby="clinic-info-title">
      <header className={styles.pageHeader}>
        <h1 id="clinic-info-title">Thông tin phòng khám</h1>
        <p>Quản lý thông tin hệ thống và các chi nhánh CLINIX.</p>
      </header>

      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Thông tin phòng khám"
      >
        <button
          type="button"
          className={
            activeTab === 'general' ? styles.activeTab : styles.inactiveTab
          }
          id="clinic-general-tab"
          role="tab"
          aria-selected={activeTab === 'general'}
          aria-controls="clinic-general-panel"
          onClick={() => setActiveTab('general')}
        >
          <img
            src="/assets/admin/clinic-info/tab-general.svg"
            alt=""
            aria-hidden="true"
          />
          Thông tin chung
        </button>
        <button
          type="button"
          className={
            activeTab === 'branches' ? styles.activeTab : styles.inactiveTab
          }
          id="clinic-branches-tab"
          role="tab"
          aria-selected={activeTab === 'branches'}
          aria-controls="clinic-branches-panel"
          onClick={() => {
            setActiveTab('branches');
            setBranchesVisited(true);
          }}
        >
          <img
            src="/assets/admin/clinic-info/tab-branches.svg"
            alt=""
            aria-hidden="true"
          />
          Chi nhánh
        </button>
      </div>

      <div className={styles.content}>
        <div
          id="clinic-general-panel"
          role="tabpanel"
          aria-labelledby="clinic-general-tab"
          hidden={activeTab !== 'general'}
        >
          <GeneralInfoPanel />
        </div>
        <div
          id="clinic-branches-panel"
          role="tabpanel"
          aria-labelledby="clinic-branches-tab"
          hidden={activeTab !== 'branches'}
        >
          {branchesVisited && <BranchesTab />}
        </div>
      </div>
    </section>
  );
}
