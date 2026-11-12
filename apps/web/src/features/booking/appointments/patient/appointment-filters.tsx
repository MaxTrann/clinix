import { useId } from 'react';
import {
  DateRangeFields,
  KeywordSearchBox,
  SelectField,
} from '../common/filter-controls';
import { OWN_PROFILE } from './api/patient-appointment-types';
import { LIST_TEXT } from './list-messages';
import type { AppointmentListController } from './use-appointment-list';
import type { FilterOptionsController } from './use-filter-options';

export interface AppointmentFiltersProps {
  list: AppointmentListController;
  options: FilterOptionsController;
}

// Ô tìm và năm bộ lọc của "Lịch hẹn của tôi" (Figma `411:2`). Các ô (`SelectField`, `KeywordSearchBox`, `DateRangeFields`) dùng chung với trang của Lễ tân nên ở
// `common/filter-controls.tsx` (F8); ở đây chỉ còn cách xếp và nguồn các mục.
export function AppointmentFilters({ list, options }: AppointmentFiltersProps) {
  const ids = {
    profile: useId(),
    doctor: useId(),
    specialty: useId(),
  };
  const relatives = options.relatives.state;
  const specialties = options.specialties.state;
  const doctors = options.doctors.state;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <KeywordSearchBox
        keyword={list.keyword}
        label={LIST_TEXT.searchLabel}
        placeholder={LIST_TEXT.searchPlaceholder}
        rejected={list.view.kind === 'ready' && list.view.keywordRejected}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SelectField
          id={ids.profile}
          label={LIST_TEXT.profileLabel}
          what="người thân"
          value={list.profile}
          onChange={list.setProfile}
          failed={relatives.status === 'error'}
          truncated={false}
          retry={options.relatives.retry}
        >
          <option value={OWN_PROFILE}>{LIST_TEXT.ownOption}</option>
          {relatives.status === 'ready' &&
            relatives.data.map((relative) => (
              <option
                key={relative.hoSoNguoiThanId}
                value={relative.hoSoNguoiThanId}
              >
                {relative.hoTen}
                {relative.trangThaiHieuLuc
                  ? ''
                  : LIST_TEXT.inactiveRelativeSuffix}
              </option>
            ))}
        </SelectField>

        <SelectField
          id={ids.doctor}
          label={LIST_TEXT.doctorLabel}
          what="bác sĩ"
          value={list.doctor}
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
          id={ids.specialty}
          label={LIST_TEXT.specialtyLabel}
          what="chuyên khoa"
          value={list.specialty}
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

        <DateRangeFields
          from={list.fromDate}
          to={list.toDate}
          orderInvalid={list.dateOrderInvalid}
          onFromChange={list.setFromDate}
          onToChange={list.setToDate}
        />
      </div>
    </div>
  );
}
