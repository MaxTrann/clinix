import { Clock, MapPin } from 'lucide-react';
import type { DoctorDetail } from '../api/search-types';
import { groupWeeklyHours } from '../format/weekly-hours';
import { SCHEDULE_PLACEHOLDER, NO_RATING_LABEL } from './doctor-card';
import { BOOKING_GUIDE_STEPS } from './doctor-detail-text';

export const NO_DESCRIPTION_MESSAGE = 'Bác sĩ chưa có mô tả chuyên môn.';
export const ILLUSTRATIVE_NOTE = 'Nội dung minh họa, chưa xác thực.';
export const REVIEWS_PLACEHOLDER =
  'Danh sách nhận xét sẽ hiển thị khi chức năng đánh giá được triển khai.';

// Tab "Lịch khám": chỗ chừa cho phần khung giờ `[SAU]` (PLAN search 5.6); K2 thay nội dung tab này.
export function SchedulePanel() {
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900">Chọn ngày khám</h2>
      <p className="mt-4 text-sm text-gray-600">{SCHEDULE_PLACEHOLDER}</p>
    </>
  );
}

export function IntroPanel({ doctor }: { doctor: DoctorDetail }) {
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900">
        Giới thiệu về bác sĩ
      </h2>
      {doctor.moTaChuyenMon ? (
        <>
          <p className="mt-3 whitespace-pre-line text-gray-700">
            {doctor.moTaChuyenMon}
          </p>
          <p className="mt-3 text-xs text-gray-600">{ILLUSTRATIVE_NOTE}</p>
        </>
      ) : (
        <p className="mt-3 text-gray-600">{NO_DESCRIPTION_MESSAGE}</p>
      )}
    </>
  );
}

export function ClinicPanel({ doctor }: { doctor: DoctorDetail }) {
  const hours = groupWeeklyHours(doctor.chiNhanh.lichHoatDong);
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900">
        Thông tin phòng khám
      </h2>
      <div className="mt-4 flex gap-3">
        <MapPin
          className="mt-0.5 size-5 text-brand-strong"
          aria-hidden="true"
        />
        <div>
          <p className="font-medium text-gray-900">{doctor.chiNhanh.ten}</p>
          <p className="text-sm text-gray-700">{doctor.chiNhanh.diaChi}</p>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <Clock className="mt-0.5 size-5 text-brand-strong" aria-hidden="true" />
        <div>
          <p className="font-medium text-gray-900">Giờ làm việc</p>
          <ul className="text-sm text-gray-700">
            {hours.map((group) => (
              <li key={group.label}>
                {group.label}: {group.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

export function GuidePanel() {
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900">
        Hướng dẫn đặt khám
      </h2>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-gray-700">
        {BOOKING_GUIDE_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </>
  );
}

// Tab "Đánh giá": chỉ điểm và số lượt (Q16); danh sách nhận xét và phân bố sao là `[SAU]`.
export function ReviewsPanel({ doctor }: { doctor: DoctorDetail }) {
  const { diemTrungBinh, soDanhGia } = doctor.danhGia;
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900">Đánh giá</h2>
      {diemTrungBinh !== null ? (
        <p className="mt-3 text-gray-700">
          <strong className="text-3xl text-brand-strong">
            {Number(diemTrungBinh).toFixed(1)}
          </strong>{' '}
          / 5 · {soDanhGia} đánh giá
        </p>
      ) : (
        <p className="mt-3 text-gray-700">{NO_RATING_LABEL}</p>
      )}
      <p className="mt-3 text-sm text-gray-600">{REVIEWS_PLACEHOLDER}</p>
    </>
  );
}
