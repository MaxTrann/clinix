import { useId } from 'react';
import { SelectField } from '../filter-controls';
import type { RemoteState } from '../../../../../shared/hooks/use-remote';
import type { OptionList, DoctorOption } from '../filter-option-types';
import { RequestSearch } from './request-search';
import { REQUEST_TEXT } from './request-text';

// Hàng lọc của trang yêu cầu đổi lịch (reschedule F4): ô tìm theo mã lịch, ô chọn bác sĩ và `Xóa lọc`. Ô chọn bác sĩ lấy danh sách công khai (tối đa 100 bác sĩ đầu): lỗi tải chỉ làm ô còn `Tất cả` kèm `Thử lại`;
// bác sĩ đang lọc (trên URL) mà không có trong danh sách (rút gọn, đã ngừng hoạt động) vẫn hiện thành một lựa chọn "Bác sĩ đã chọn" để ô chọn không nói dối về bộ lọc đang áp dụng.
export function RequestFilters(props: {
  code: string;
  codeRejected: boolean;
  doctor: string;
  doctors: RemoteState<OptionList<DoctorOption>>;
  retryDoctors: () => void;
  filtersActive: boolean;
  onCode: (code: string) => void;
  onDoctor: (bacSiId: string) => void;
  onClear: () => void;
}) {
  const doctorId = useId();
  const { doctors } = props;
  const options = doctors.status === 'ready' ? doctors.data.options : [];
  const known = options.some((option) => option.bacSiId === props.doctor);

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <RequestSearch
        key={props.code}
        applied={props.code}
        rejected={props.codeRejected}
        onApply={props.onCode}
      />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1 sm:max-w-xs">
          <SelectField
            id={doctorId}
            label={REQUEST_TEXT.doctorLabel}
            what={REQUEST_TEXT.doctorsWhat}
            value={props.doctor}
            onChange={props.onDoctor}
            failed={doctors.status === 'error'}
            truncated={doctors.status === 'ready' && doctors.data.truncated}
            retry={props.retryDoctors}
          >
            {options.map((option) => (
              <option key={option.bacSiId} value={option.bacSiId}>
                {option.hoTen}
              </option>
            ))}
            {props.doctor !== '' && !known && (
              <option value={props.doctor}>
                {REQUEST_TEXT.selectedDoctor}
              </option>
            )}
          </SelectField>
        </div>
        {props.filtersActive && (
          <button
            type="button"
            onClick={props.onClear}
            className="inline-flex min-h-[2.4rem] items-center rounded-lg border border-danger bg-white px-3 text-sm font-medium text-danger-strong hover:bg-danger-soft"
          >
            {REQUEST_TEXT.clearFilters}
          </button>
        )}
      </div>
    </div>
  );
}
