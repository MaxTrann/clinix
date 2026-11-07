import { ArrowRight, MapPin, Star } from 'lucide-react';
import { Link } from 'react-router';
import type { DoctorItem } from '../api/search-types';
import { doctorInitials, doctorTitleLabel } from '../format/doctor-title';
import { formatMoney, isNoDeposit } from '../format/money';
import { doctorDetailPath } from '../search-paths';

export const NO_RATING_LABEL = 'Chưa có đánh giá';
export const SCHEDULE_PLACEHOLDER = 'Lịch khám sẽ hiển thị ở bước đặt lịch';

// Thẻ bác sĩ (Figma 446:2 phần thông tin; không khung giờ — đợt này chỉ chừa vùng, K2 thay sau). Ảnh là chữ viết tắt (Q14).
// Dùng chung cho F5, F6 và chi tiết chuyên khoa.
export function DoctorCard({ doctor }: { doctor: DoctorItem }) {
  const rating = doctor.danhGia.diemTrungBinh;
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 md:flex-row md:justify-between">
        <div className="flex gap-4">
          <div
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg font-semibold text-brand-strong"
          >
            {doctorInitials(doctor.hoTen)}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {doctorTitleLabel(doctor.chucDanh)}. {doctor.hoTen}
            </h2>
            <p className="text-sm text-gray-700">{doctor.chuyenKhoa.ten}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700">
              <span className="flex items-center gap-1">
                <Star className="size-4 text-amber-500" aria-hidden="true" />
                {rating !== null
                  ? `${Number(rating).toFixed(1)} (${doctor.danhGia.soDanhGia} đánh giá)`
                  : NO_RATING_LABEL}
              </span>
              <span>{doctor.soNamKinhNghiem} năm kinh nghiệm</span>
              <span className="flex items-center gap-1">
                <MapPin className="size-4" aria-hidden="true" />
                {doctor.chiNhanh.ten}
              </span>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <strong className="text-brand-strong">
                {formatMoney(doctor.gia.giaKham)}
              </strong>
              {isNoDeposit(doctor.gia.mucDatCoc) ? (
                <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">
                  Không cần cọc
                </span>
              ) : (
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">
                  Cọc {formatMoney(doctor.gia.mucDatCoc)}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link
            to={doctorDetailPath(doctor.bacSiId)}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-3 py-1.5 text-sm font-medium text-brand-strong hover:underline"
          >
            Xem hồ sơ <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          {/* "Nhắn tin" chưa có chức năng nên vô hiệu */}
          <button
            type="button"
            disabled
            title="Chưa được triển khai"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500"
          >
            Nhắn tin
          </button>
          <p className="max-w-56 text-sm text-gray-600 md:text-right">
            {SCHEDULE_PLACEHOLDER}
          </p>
        </div>
      </div>
    </li>
  );
}
