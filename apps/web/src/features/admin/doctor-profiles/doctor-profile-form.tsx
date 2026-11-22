import { useId, useState, type ReactNode } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { formatVnd } from '../../../shared/money/format-vnd';
import { LoadingState } from '../../../shared/ui/loading-state';
import { AccountLoadError } from '../account-common/account-load-error';
import {
  describeSaveFailure,
  type ProfileField,
  type SaveFailure,
} from './doctor-profile-errors';
import {
  APPOINTMENT_STATUS_LABELS,
  DEGREE_LABELS,
  SHIFT_LABELS,
  TITLE_LABELS,
  formatDate,
  formatDateTime,
} from './doctor-profile-format';
import {
  initialValues,
  servicesOf,
  specialtyChoices,
  validate,
  withBranch,
  withTitle,
  type ProfileFormValues,
} from './doctor-profile-form-model';
import { loadEditOptions, updateDoctor } from './doctor-profile-service';
import {
  DOCTOR_DEGREES,
  DOCTOR_TITLES,
  type BlockingList,
  type DoctorDegree,
  type DoctorDetail,
  type DoctorTitle,
  type EditOptions,
} from './doctor-profile-types';
import { ProfileHeader } from './doctor-profile-view';

// Panel CHỈNH SỬA hồ sơ bác sĩ (admin F7; Figma 537:2; PLAN BS b3–b5, A1–A3). Lỗi nào cũng GIỮ NGUYÊN dữ liệu đã nhập (BS-41).
// Quản trị viên Chi nhánh: ô chi nhánh bị khoá (BS-42, A3); API vẫn kiểm lại (403).
// Bị chặn đổi chi nhánh hay dịch vụ chính (409) thì hiện hộp danh sách lịch hẹn và ca đang chặn ngay trên nút Lưu [đề xuất] (Figma chưa có).

const INPUT =
  'w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary disabled:bg-surface-muted disabled:text-text-muted aria-[invalid=true]:border-danger';

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (describedBy: string | undefined) => ReactNode;
}

function Field({ id, label, hint, error, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-[11px] text-text-muted">
          {hint}
        </p>
      )}
      {children(describedBy)}
      {error && (
        <p id={errorId} className="text-xs text-danger-strong">
          {error}
        </p>
      )}
    </div>
  );
}

function BlockingBox({ list }: { list: BlockingList }) {
  const moreAppointments = list.lichHen.tong - list.lichHen.items.length;
  const moreShifts = list.ca.tong - list.ca.items.length;
  return (
    <div className="mt-2 space-y-2 text-xs">
      {list.lichHen.tong > 0 && (
        <div>
          <p className="font-semibold">{`Lịch hẹn đang hoạt động (${list.lichHen.tong})`}</p>
          <ul className="list-disc pl-5">
            {list.lichHen.items.map((item) => (
              <li key={item.lichHenId}>
                {`${item.maLichHen} · ${formatDateTime(item.thoiGian)} · ${APPOINTMENT_STATUS_LABELS[item.trangThai] ?? item.trangThai}`}
              </li>
            ))}
          </ul>
          {moreAppointments > 0 && (
            <p>{`… và ${moreAppointments} lịch hẹn khác`}</p>
          )}
        </div>
      )}
      {list.ca.tong > 0 && (
        <div>
          <p className="font-semibold">{`Ca làm việc từ hôm nay (${list.ca.tong})`}</p>
          <ul className="list-disc pl-5">
            {list.ca.items.map((item) => (
              <li key={item.lichLamViecId}>
                {`${formatDate(item.ngay)} · ${SHIFT_LABELS[item.ca] ?? item.ca}`}
              </li>
            ))}
          </ul>
          {moreShifts > 0 && <p>{`… và ${moreShifts} ca khác`}</p>}
        </div>
      )}
      <p>Hãy xử lý các lịch hẹn và ca này trước, rồi lưu lại.</p>
    </div>
  );
}

interface FormProps {
  doctor: DoctorDetail;
  canChangeBranch: boolean;
  onCancel: () => void;
  onSaved: (doctor: DoctorDetail) => void;
  onNotFound: () => void;
  onReload: () => void;
}

export function DoctorProfileForm(props: FormProps) {
  const options = useRemote<EditOptions>(
    (signal) => loadEditOptions(signal),
    [],
  );
  if (options.state.status === 'loading')
    return <LoadingState message="Đang tải dữ liệu chỉnh sửa…" />;
  if (options.state.status === 'error')
    return (
      <AccountLoadError error={options.state.error} onRetry={options.retry} />
    );
  return <FormBody {...props} options={options.state.data} />;
}

function FormBody({
  doctor,
  canChangeBranch,
  options,
  onCancel,
  onSaved,
  onNotFound,
  onReload,
}: FormProps & { options: EditOptions }) {
  const idBase = useId();
  const id = (field: ProfileField) => `${idBase}-${field}`;
  const [values, setValues] = useState<ProfileFormValues>(() =>
    initialValues(doctor),
  );
  const [fieldErrors, setFieldErrors] = useState<SaveFailure['fields']>({});
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [pending, setPending] = useState(false);

  const specialties = specialtyChoices(doctor, options.specialties);
  // Chi nhánh hiện tại luôn có trong ô chọn (Chi nhánh chỉ thấy chi nhánh mình; danh sách lấy tối đa 100 dòng)
  const branches = options.branches.some(
    (b) => b.chiNhanhId === doctor.chiNhanh.chiNhanhId,
  )
    ? options.branches
    : [
        {
          chiNhanhId: doctor.chiNhanh.chiNhanhId,
          ten: doctor.chiNhanh.ten,
          dichVuKham: [{ ...doctor.dichVuKham, giaMacDinh: doctor.giaMacDinh }],
        },
        ...options.branches,
      ];
  const services = servicesOf(values.chiNhanhId, branches);

  function update(next: ProfileFormValues) {
    setValues(next);
    setFailure(null);
  }

  async function submit() {
    const result = validate(values);
    if (!result.ok) {
      setFieldErrors(result.fields);
      setFailure(null);
      return;
    }
    setFieldErrors({});
    setFailure(null);
    setPending(true);
    try {
      onSaved(await updateDoctor(doctor.taiKhoanId, result.input));
    } catch (error) {
      const described = describeSaveFailure(error);
      if (described.notFound) {
        onNotFound();
        return;
      }
      setFailure(described);
      setFieldErrors(described.fields);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending) void submit();
      }}
    >
      <ProfileHeader doctor={doctor} />
      <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">
        Thông tin hồ sơ
      </h3>

      <Field
        id={id('chucDanh')}
        label="Chức danh"
        hint="7 mã — hiển thị hồ sơ và tra phụ phí."
        error={fieldErrors.chucDanh}
      >
        {(describedBy) => (
          <select
            id={id('chucDanh')}
            className={INPUT}
            value={values.chucDanh}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.chucDanh !== undefined}
            onChange={(e) =>
              update(withTitle(values, e.target.value as DoctorTitle))
            }
          >
            {DOCTOR_TITLES.map((title) => (
              <option key={title} value={title}>
                {TITLE_LABELS[title]}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        id={id('hocVi')}
        label="Học vị"
        hint="5 mức — dùng tính điểm gợi ý bác sĩ (w₂), không ảnh hưởng phụ phí."
        error={fieldErrors.hocVi}
      >
        {(describedBy) => (
          <select
            id={id('hocVi')}
            className={INPUT}
            value={values.hocVi}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.hocVi !== undefined}
            onChange={(e) =>
              update({ ...values, hocVi: e.target.value as DoctorDegree | '' })
            }
          >
            <option value="">Chọn học vị</option>
            {DOCTOR_DEGREES.map((degree) => (
              <option key={degree} value={degree}>
                {DEGREE_LABELS[degree]}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        id={id('chuyenKhoaId')}
        label="Chuyên khoa"
        error={fieldErrors.chuyenKhoaId}
      >
        {(describedBy) => (
          <select
            id={id('chuyenKhoaId')}
            className={INPUT}
            value={values.chuyenKhoaId}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.chuyenKhoaId !== undefined}
            onChange={(e) =>
              update({ ...values, chuyenKhoaId: e.target.value })
            }
          >
            {specialties.map((s) => (
              <option key={s.chuyenKhoaId} value={s.chuyenKhoaId}>
                {s.ngungHoatDong ? `${s.ten} (ngừng hoạt động)` : s.ten}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        id={id('dichVuKhamId')}
        label="Dịch vụ khám chính"
        error={fieldErrors.dichVuKhamId}
      >
        {(describedBy) => (
          <select
            id={id('dichVuKhamId')}
            className={INPUT}
            value={values.dichVuKhamId}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.dichVuKhamId !== undefined}
            onChange={(e) =>
              update({ ...values, dichVuKhamId: e.target.value })
            }
          >
            <option value="">Chọn dịch vụ khám chính</option>
            {services.map((s) => (
              <option key={s.dichVuKhamId} value={s.dichVuKhamId}>
                {s.giaMacDinh === null
                  ? s.ten
                  : `${s.ten} – ${formatVnd(s.giaMacDinh)}`}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        id={id('soNamKinhNghiem')}
        label="Kinh nghiệm (năm)"
        error={fieldErrors.soNamKinhNghiem}
      >
        {(describedBy) => (
          <input
            id={id('soNamKinhNghiem')}
            className={INPUT}
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            step={1}
            value={values.soNamKinhNghiem}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.soNamKinhNghiem !== undefined}
            onChange={(e) =>
              update({ ...values, soNamKinhNghiem: e.target.value })
            }
          />
        )}
      </Field>

      <Field
        id={id('moTaChuyenMon')}
        label="Giới thiệu"
        error={fieldErrors.moTaChuyenMon}
      >
        {(describedBy) => (
          <textarea
            id={id('moTaChuyenMon')}
            className={`${INPUT} min-h-[120px]`}
            value={values.moTaChuyenMon}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.moTaChuyenMon !== undefined}
            onChange={(e) =>
              update({ ...values, moTaChuyenMon: e.target.value })
            }
          />
        )}
      </Field>

      <Field
        id={id('chiNhanhId')}
        label="Chi nhánh công tác"
        hint={
          canChangeBranch
            ? undefined
            : 'Chỉ Quản trị viên toàn hệ thống được đổi chi nhánh của bác sĩ.'
        }
        error={fieldErrors.chiNhanhId}
      >
        {(describedBy) => (
          <select
            id={id('chiNhanhId')}
            className={INPUT}
            value={values.chiNhanhId}
            disabled={!canChangeBranch}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.chiNhanhId !== undefined}
            onChange={(e) =>
              update(withBranch(values, e.target.value, branches))
            }
          >
            {branches.map((b) => (
              <option key={b.chiNhanhId} value={b.chiNhanhId}>
                {b.ten}
              </option>
            ))}
          </select>
        )}
      </Field>

      {failure !== null && (
        <div
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
        >
          <p>{failure.message}</p>
          {failure.blocking !== null && <BlockingBox list={failure.blocking} />}
          {failure.unknownResult && (
            <button
              type="button"
              className="mt-2 block font-medium underline"
              onClick={onReload}
            >
              Tải lại hồ sơ
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-text-primary disabled:opacity-60"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  );
}
