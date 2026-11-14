import { useId } from 'react';
import {
  APPOINTMENT_STATE_LABELS,
  APPOINTMENT_STATES,
  isAppointmentState,
} from '../common/appointment-status';
import {
  DateRangeFields,
  Field,
  FIELD_CONTROL,
  KeywordSearchBox,
  SelectBox,
  SelectField,
} from '../common/filter-controls';
import type { AdminFilterOptionsController } from './use-admin-filter-options';
import type { AdminListController } from './use-admin-list';
import { LIST_TEXT } from './list-messages';

export interface AdminFiltersProps {
  list: AdminListController;
  options: AdminFilterOptionsController;
}

// Ô `Chi nhánh` (Figma `511:2`, `621:2`): Quản trị viên Toàn hệ thống có ô chọn (gửi `chiNhanhId` khi chọn); Chi nhánh thấy CHỮ cố định (tên chi nhánh được gán), không phải ô chọn, và không
// bao giờ gửi `chiNhanhId`. Ô chữ chỉ đọc (`readOnly`) nên vẫn có nhãn và đọc được bằng trình đọc màn hình.
function BranchField({ list, options }: AdminFiltersProps) {
  const fixedId = useId();
  const selectId = useId();
  const branches = options.branches.state;
  if (!list.allowBranch) {
    return (
      <Field label={LIST_TEXT.branchLabel} htmlFor={fixedId}>
        <input
          id={fixedId}
          type="text"
          readOnly
          value={list.branchName}
          className={`${FIELD_CONTROL} bg-gray-50`}
        />
      </Field>
    );
  }
  return (
    <SelectField
      id={selectId}
      label={LIST_TEXT.branchLabel}
      what="chi nhánh"
      value={list.filters.branch}
      onChange={list.setBranch}
      failed={branches.status === 'error'}
      truncated={branches.status === 'ready' && branches.data.truncated}
      retry={options.branches.retry}
    >
      {branches.status === 'ready' &&
        branches.data.options.map((branch) => (
          <option key={branch.chiNhanhId} value={branch.chiNhanhId}>
            {branch.ten}
          </option>
        ))}
    </SelectField>
  );
}

// Bộ lọc của "Lịch hẹn" của Quản trị viên (Figma `511:2`, `621:2`; F12, UI-08 dựng lại theo hình học `511:299`): HÀNG 1 là ô tìm (rộng gấp đôi), `Từ ngày`, `Đến ngày` (luôn hiện, mặc định trống);
// HÀNG 2 là sáu ô bằng nhau: `Chi nhánh`, `Chuyên khoa`, `Bác sĩ`, `Loại dịch vụ`, `Trạng thái lịch`, `Thanh toán`. KHÔNG có chip ngày (khác Lễ tân). Ô `Thanh toán` VÔ HIỆU kèm "Chưa được triển
// khai" (nếp LTN-05): B4 không có tham số này (Đại duyệt 14/11/2026). Ô tìm bo vừa (`soft`), không hình viên thuốc như Bệnh nhân. Các ô dùng chung với ba trang danh sách khác ở `common/filter-controls.tsx`.
export function AdminFilters({ list, options }: AdminFiltersProps) {
  const specialtyId = useId();
  const doctorId = useId();
  const serviceId = useId();
  const statusId = useId();
  const paymentId = useId();
  const paymentNoteId = useId();
  const specialties = options.specialties.state;
  const doctors = options.doctors.state;
  const services = options.services.state;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      {/* Hàng 1 (Figma: 563,6 + 276,2 + 276,2 ⇒ 2,04 : 1 : 1) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2.04fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="sm:col-span-2 lg:col-span-1">
          <p
            aria-hidden="true"
            className="mb-1 text-xs font-medium text-gray-700"
          >
            {LIST_TEXT.searchCaption}
          </p>
          <KeywordSearchBox
            shape="soft"
            keyword={list.keyword}
            label={LIST_TEXT.searchLabel}
            placeholder={LIST_TEXT.searchPlaceholder}
            rejected={list.view.kind === 'ready' && list.view.keywordRejected}
          />
        </div>
        <DateRangeFields
          from={list.fromDate}
          to={list.toDate}
          orderInvalid={list.dateOrderInvalid}
          onFromChange={list.setFromDate}
          onToChange={list.setToDate}
        />
      </div>

      {/* Hàng 2: sáu ô bằng nhau, đúng thứ tự Figma */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <BranchField list={list} options={options} />

        <SelectField
          id={specialtyId}
          label={LIST_TEXT.specialtyLabel}
          what="chuyên khoa"
          value={list.filters.specialty}
          onChange={list.setSpecialty}
          failed={specialties.status === 'error'}
          truncated={
            specialties.status === 'ready' && specialties.data.truncated
          }
          retry={options.specialties.retry}
        >
          {specialties.status === 'ready' &&
            specialties.data.options.map((specialty) => (
              <option
                key={specialty.chuyenKhoaId}
                value={specialty.chuyenKhoaId}
              >
                {specialty.ten}
              </option>
            ))}
        </SelectField>

        <SelectField
          id={doctorId}
          label={LIST_TEXT.doctorLabel}
          what="bác sĩ"
          value={list.filters.doctor}
          onChange={list.setDoctor}
          failed={doctors.status === 'error'}
          truncated={doctors.status === 'ready' && doctors.data.truncated}
          retry={options.doctors.retry}
        >
          {doctors.status === 'ready' &&
            doctors.data.options.map((doctor) => (
              <option key={doctor.bacSiId} value={doctor.bacSiId}>
                {doctor.hoTen}
              </option>
            ))}
        </SelectField>

        <SelectField
          id={serviceId}
          label={LIST_TEXT.serviceLabel}
          what="loại dịch vụ"
          value={list.filters.service}
          onChange={list.setService}
          failed={services.status === 'error'}
          truncated={services.status === 'ready' && services.data.truncated}
          retry={options.services.retry}
        >
          {services.status === 'ready' &&
            services.data.options.map((service) => (
              <option key={service.dichVuKhamId} value={service.dichVuKhamId}>
                {service.ten}
              </option>
            ))}
        </SelectField>

        {/* Sáu trạng thái như F8; không có `Đã đổi lịch` (đổi lịch ngoài phạm vi module) */}
        <Field label={LIST_TEXT.statusLabel} htmlFor={statusId}>
          <SelectBox
            id={statusId}
            value={list.filters.status ?? ''}
            onChange={(event) =>
              list.setStatus(
                isAppointmentState(event.target.value)
                  ? event.target.value
                  : null,
              )
            }
          >
            <option value="">{LIST_TEXT.allStatuses}</option>
            {APPOINTMENT_STATES.map((state) => (
              <option key={state} value={state}>
                {APPOINTMENT_STATE_LABELS[state]}
              </option>
            ))}
          </SelectBox>
        </Field>

        {/* `Thanh toán` (Figma `511:2`): B4 không nhận tham số này nên ô VÔ HIỆU, không gửi gì. Câu giải thích hiện dưới ô và gắn bằng `aria-describedby` */}
        <Field
          label={LIST_TEXT.paymentLabel}
          htmlFor={paymentId}
          note={
            <p id={paymentNoteId} className="mt-1 text-xs text-gray-600">
              {LIST_TEXT.paymentFilterNotReady}
            </p>
          }
        >
          <SelectBox
            id={paymentId}
            disabled
            aria-describedby={paymentNoteId}
            className={`${FIELD_CONTROL} bg-gray-50`}
          >
            <option value="">{LIST_TEXT.allStatuses}</option>
          </SelectBox>
        </Field>
      </div>

      {/* Figma `#fb2c36` chữ đỏ trên trắng chỉ 3,81:1: dùng `danger-strong` 6,42:1 (ADR 0004) */}
      {list.filtersActive && (
        <button
          type="button"
          onClick={list.clearFilters}
          className="mt-3 inline-flex min-h-7 items-center rounded-lg border border-danger bg-white px-3 text-xs font-medium text-danger-strong hover:bg-danger-soft"
        >
          {LIST_TEXT.clearFilters}
        </button>
      )}
    </div>
  );
}
