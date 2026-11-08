import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  genderLabel,
  initialsOf,
  toDisplayDate,
} from '../profile/profile-format';
import { NOT_UPDATED_LABEL } from '../profile/profile-rows-card';
import {
  absencesLabel,
  accountStatusLabel,
  formatVietnamDate,
} from './lookup-labels';
import { LookupError } from './lookup-error';
import { LOOKUP_TEXT } from './lookup-messages';
import { LookupPane } from './lookup-pane';
import { LookupRelatives } from './lookup-relatives';
import type { PatientDetail } from './lookup-types';
import type { DetailState } from './use-patient-detail';

export interface LookupDetailPanelProps {
  state: DetailState;
  onRetry: () => void;
  // Có ⇒ màn hẹp: hiện nút "Quay lại danh sách" ở đầu bảng
  onBack?: () => void;
}

interface Row {
  label: string;
  value: ReactNode;
  // Hàng chiếm cả hai cột (Địa chỉ)
  wide?: boolean;
}

// Chuỗi rỗng hay null ⇒ null: hiện "Chưa cập nhật" (Figma vẽ "—")
const orNull = (value: string | null): string | null =>
  value === null || value === '' ? null : value;

function rowsOf(patient: PatientDetail): Row[] {
  return [
    { label: 'Số điện thoại', value: orNull(patient.soDienThoai) },
    { label: 'Email', value: orNull(patient.email) },
    { label: 'Giới tính', value: genderLabel(patient.gioiTinh) },
    { label: 'Ngày sinh', value: toDisplayDate(patient.ngaySinh) },
    { label: 'Địa chỉ', value: orNull(patient.diaChi), wide: true },
    // NGÀY giờ Việt Nam của một thời điểm UTC (F8-G), không cắt chuỗi
    {
      label: 'Ngày tạo tài khoản',
      value: formatVietnamDate(patient.thoiDiemTao),
    },
    { label: 'Số lần vắng khám', value: absencesLabel(patient.soLanVangMat) },
  ];
}

// Thẻ thông tin (Figma `485:2`, gốc 15 px): đệm 18,75, bo 13,375, avatar 45, tên 15 đậm; lưới 2 cột cách 22,5 và 11,25. Lưới chỉ thành 2 cột
// khi VÙNG chứa rộng từ 32rem (container query `@lg`, không theo màn hình): ở 1024 px cột hồ sơ chỉ còn khoảng 334 px, 2 cột sẽ vỡ email.
// Màu: nhãn gray-500 (Figma `#99a1af` chỉ 2,60:1), giá trị gray-800 như Figma, avatar brand-strong trên cyan-100 (4,71:1).
// Không có: mã nội bộ "u1" và khối "Lịch sử lịch hẹn" của Figma (Q18).
function PatientCard({ patient }: { patient: PatientDetail }) {
  const status = accountStatusLabel(patient.trangThai);
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-[1.25rem]">
      <div className="flex items-center gap-[1rem]">
        <span
          aria-hidden="true"
          className="flex size-[3rem] shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xl font-bold text-brand-strong"
        >
          {initialsOf(patient.hoTen)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-[1.375] font-bold break-words text-gray-900">
            {patient.hoTen}
          </h2>
          {status && (
            <p className="pt-[0.25rem]">
              <span className="rounded-full border border-danger-line bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger-strong">
                {status}
              </span>
            </p>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-[1.5rem] gap-y-[0.75rem] pt-[1.25rem] @lg:grid-cols-2">
        {rowsOf(patient).map(({ label, value, wide }) => (
          <div
            key={label}
            className={`min-w-0 ${wide ? '@lg:col-span-2' : ''}`}
          >
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="pt-[0.125rem] text-sm font-medium break-words text-gray-800">
              {value ?? (
                <span className="text-gray-500">{NOT_UPDATED_LABEL}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Nội dung cột phải của trang tra cứu (patient F8; Figma `483:2`, `485:2`): chưa chọn ⇒ lời mời chọn; đang tải; lỗi (404 không có "Thử lại");
// hồ sơ. Khối nội dung rộng tối đa 630 px (42rem, `max-w-[630px]` của Figma) và co giãn khi cột hẹp.
export function LookupDetailPanel({
  state,
  onRetry,
  onBack,
}: LookupDetailPanelProps) {
  if (state.status === 'idle') return <LookupPane kind="select" />;

  // Đệm 1,5rem như Figma; màn hẹp (có nút quay lại) đệm 1rem cho khỏi lãng phí chỗ

  return (
    <div
      className={`@container w-full max-w-[42rem] ${onBack ? 'p-[1rem]' : 'p-[1.5rem]'}`}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-[0.75rem] inline-flex min-h-[2.4rem] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand-strong hover:bg-brand-soft"
        >
          <ArrowLeft aria-hidden="true" className="size-[1rem]" />
          {LOOKUP_TEXT.backToList}
        </button>
      )}
      {state.status === 'loading' && (
        <LoadingState message={LOOKUP_TEXT.loadingDetail} />
      )}
      {state.status === 'error' && (
        <LookupError error={state.error} onRetry={onRetry} />
      )}
      {state.status === 'ready' && (
        <div className="flex flex-col gap-[1rem]">
          <PatientCard patient={state.data} />
          <LookupRelatives items={state.data.nguoiThan} />
        </div>
      )}
    </div>
  );
}
