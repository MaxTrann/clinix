import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatVnd } from '../../../shared/money/format-vnd';
import {
  DEGREE_LABELS,
  TITLE_LABELS,
  displayName,
  formatDate,
  initialsOf,
  statusLabel,
} from './doctor-profile-format';
import type {
  AccountStatus,
  DoctorDetail,
  DoctorListItem,
} from './doctor-profile-types';

// Phần XEM của panel hồ sơ bác sĩ (admin F7; Figma 536:2). Chỉ vẽ, không gọi API.

const BADGE =
  'inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap';

export function StatusBadge({
  status,
  long = false,
}: {
  status: AccountStatus;
  long?: boolean;
}) {
  const tone =
    status === 'DangHoatDong'
      ? 'bg-success-soft text-success'
      : status === 'ChoKichHoat'
        ? 'bg-warning-soft text-warning'
        : 'bg-gray-100 text-gray-600';
  return (
    <span className={`${BADGE} ${tone}`}>{statusLabel(status, long)}</span>
  );
}

/** Ảnh đại diện; không có ảnh thì hiện chữ cái đầu của họ tên. Ảnh là trang trí: tên đã có ngay cạnh nên `alt` rỗng. */
export function DoctorAvatar({
  doctor,
  size,
}: {
  doctor: Pick<DoctorListItem, 'hoTen' | 'anhDaiDien'>;
  size: 'sm' | 'lg';
}) {
  const box = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-14 w-14 text-base';
  if (doctor.anhDaiDien)
    return (
      <img
        src={doctor.anhDaiDien}
        alt=""
        className={`${box} flex-none rounded-full object-cover`}
      />
    );
  return (
    <span
      aria-hidden="true"
      className={`${box} flex flex-none items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-strong`}
    >
      {initialsOf(doctor.hoTen)}
    </span>
  );
}

/** Thẻ đầu panel (nền xanh nhạt): ảnh, tên kèm chức danh, chuyên khoa, chi nhánh, trạng thái. Dùng chung cho Xem và Chỉnh sửa. */
export function ProfileHeader({ doctor }: { doctor: DoctorDetail }) {
  return (
    <div className="-mx-4 -mt-4 mb-4 flex items-center gap-4 bg-info-surface px-4 py-5">
      <DoctorAvatar doctor={doctor} size="lg" />
      <div className="min-w-0">
        <p className="text-[17px] leading-6 font-semibold break-words text-text-primary">
          {displayName(doctor.chucDanh, doctor.hoTen)}
        </p>
        <p className="text-sm text-brand">{doctor.chuyenKhoa.ten}</p>
        <p className="text-xs text-text-muted">{doctor.chiNhanh.ten}</p>
        <div className="mt-1">
          <StatusBadge status={doctor.trangThaiTaiKhoan} long />
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0">
      <dt className="flex-none text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-right break-words whitespace-pre-line text-text-primary">
        {children}
      </dd>
    </div>
  );
}

export function ProfileView({
  doctor,
  onEdit,
}: {
  doctor: DoctorDetail;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col">
      <ProfileHeader doctor={doctor} />
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-text-muted uppercase">
        Thông tin hồ sơ
      </h3>
      <dl>
        <Row label="Họ tên">{doctor.hoTen}</Row>
        <Row label="Ngày sinh">{formatDate(doctor.ngaySinh)}</Row>
        <Row label="Chuyên khoa">
          {doctor.chuyenKhoa.ten}
          {doctor.chuyenKhoa.trangThaiHoatDong === 'NgungHoatDong' &&
            ' (ngừng hoạt động)'}
        </Row>
        <Row label="Chức danh">{TITLE_LABELS[doctor.chucDanh]}</Row>
        <Row label="Học vị">{DEGREE_LABELS[doctor.hocVi]}</Row>
        <Row label="Kinh nghiệm">{`${doctor.soNamKinhNghiem} năm`}</Row>
        <Row label="Dịch vụ khám chính">{doctor.dichVuKham.ten}</Row>
        <Row label="Giá dịch vụ">{formatVnd(doctor.giaMacDinh)}</Row>
        <Row label="Phụ phí bác sĩ">{formatVnd(doctor.phuPhi)}</Row>
        <Row label="Tổng giá khám">
          <span className="font-semibold text-brand">
            {formatVnd(doctor.giaKham)}
          </span>
        </Row>
        <Row label="Chi nhánh">{doctor.chiNhanh.ten}</Row>
        <Row label="Giới thiệu">{doctor.moTaChuyenMon ?? '—'}</Row>
      </dl>
      <p className="mt-2 text-xs text-text-muted">
        Phụ phí áp dụng cho lịch đặt mới. Lịch cũ giữ nguyên giá đã chốt lúc
        đặt.
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-brand bg-white px-4 py-2.5 text-sm font-medium text-brand hover:bg-brand-soft"
      >
        <Pencil size={14} aria-hidden="true" />
        Chỉnh sửa hồ sơ
      </button>
    </div>
  );
}
