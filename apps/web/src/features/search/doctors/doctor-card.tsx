import {
  ArrowRight,
  Briefcase,
  MapPin,
  MessageSquare,
  Star,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { DoctorItem } from '../api/search-types';
import { doctorDisplayName, doctorInitials } from '../format/doctor-title';
import { formatMoney, isNoDeposit } from '../format/money';
import { doctorDetailPath } from '../search-paths';

export const NO_RATING_LABEL = 'Chưa có đánh giá';
export const SCHEDULE_PLACEHOLDER = 'Lịch khám sẽ hiển thị ở bước đặt lịch';

// Dòng điểm đánh giá của thẻ (Figma 260:172: sao 13,125 + "4.3" đậm + "(7 đánh giá)" nhạt, chữ 11,25) và của đầu chi tiết bác sĩ
// (Figma 653:75: sao 15 + "4.3" đậm + "(7 đánh giá)", chữ 13,125; `large`). Hai phần có kiểu chữ khác nhau nên tách phần tử;
// câu đầy đủ "4.3 (7 đánh giá)" vẫn có một lần cho trình đọc màn hình (`sr-only`). Chưa có điểm ⇒ sao xám + "Chưa có đánh giá" (Figma 259:256).
export function DoctorRating({
  rating,
  count,
  large = false,
}: {
  rating: string | null;
  count: number;
  large?: boolean;
}) {
  const score = rating !== null ? Number(rating).toFixed(1) : null;
  return (
    <span
      className={`flex items-center ${large ? 'gap-1.5 text-sm' : 'gap-1 text-xs'}`}
    >
      <Star
        className={`${large ? 'size-4' : 'size-3.5'} ${
          score !== null ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
        }`}
        aria-hidden="true"
      />
      {score !== null ? (
        <>
          <span
            aria-hidden="true"
            className={
              large ? 'font-bold text-gray-900' : 'font-semibold text-gray-600'
            }
          >
            {score}
          </span>
          <span aria-hidden="true" className="text-gray-500">
            ({count} đánh giá)
          </span>
          <span className="sr-only">
            {score} ({count} đánh giá)
          </span>
        </>
      ) : (
        <span className="text-gray-500">{NO_RATING_LABEL}</span>
      )}
    </span>
  );
}

// Thẻ bác sĩ NGANG (Figma 260:162; search F14, UIS-10): hai cột 517 : 621, cột trái đệm 18,75 chứa ảnh chữ 72 px, tên, điểm, kinh nghiệm, chi nhánh,
// giá + chip cọc và hai nút NẰM NGANG cao 45; cột phải là vùng khung giờ (`schedule`, search PR-C2). Ảnh là chữ viết tắt (Q14).
// Dùng chung cho F5, F6 và chi tiết chuyên khoa. Đệm, khe, cỡ chữ theo lưới 15 px của gốc `html` (`p-5` = 18,75; `gap-4` = 15).
export function DoctorCard({
  doctor,
  schedule,
}: {
  doctor: DoctorItem;
  // Vùng khung giờ của cột phải (search PR-C2); không truyền thì giữ câu chừa chỗ cũ
  schedule?: ReactNode;
}) {
  return (
    <li className="grid overflow-hidden rounded-[15px] border border-gray-200 bg-white md:grid-cols-[517fr_621fr]">
      <div className="p-5 md:border-r md:border-gray-100">
        <div className="flex items-start gap-4">
          <div
            aria-hidden="true"
            className="flex size-[72px] shrink-0 items-center justify-center rounded-[15px] border border-gray-200 bg-brand-soft text-xl font-semibold text-brand-strong"
          >
            {doctorInitials(doctor.hoTen)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium leading-[15px] text-brand-strong">
              {doctor.chuyenKhoa.ten}
            </p>
            <h2 className="text-lg font-semibold leading-snug text-gray-900">
              {doctorDisplayName(doctor.chucDanh, doctor.hoTen)}
            </h2>
            <div className="pt-1">
              <DoctorRating
                rating={doctor.danhGia.diemTrungBinh}
                count={doctor.danhGia.soDanhGia}
              />
            </div>
          </div>
        </div>
        <div className="pt-4 text-sm text-gray-600">
          <p className="flex items-start gap-2">
            <Briefcase
              className="mt-0.5 size-4 shrink-0 text-gray-400"
              aria-hidden="true"
            />
            {doctor.soNamKinhNghiem} năm kinh nghiệm
          </p>
          <p className="flex items-start gap-2 pt-1.5">
            <MapPin
              className="mt-0.5 size-4 shrink-0 text-gray-400"
              aria-hidden="true"
            />
            {doctor.chiNhanh.ten}
          </p>
        </div>
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="text-[11px] leading-[16.5px] text-gray-500">Giá khám</p>
          <p className="flex items-center gap-2 pt-1">
            <strong className="text-base font-semibold text-brand-strong">
              {formatMoney(doctor.gia.giaKham)}
            </strong>
            {isNoDeposit(doctor.gia.mucDatCoc) ? (
              <span className="rounded-full border border-transparent bg-success-soft px-2 py-0.5 text-[11px] font-medium leading-[16.5px] text-success">
                Không cần cọc
              </span>
            ) : (
              <span className="rounded-full border border-amber-200 bg-warning-soft px-2 py-0.5 text-[11px] font-medium leading-[16.5px] text-warning">
                Cọc {formatMoney(doctor.gia.mucDatCoc)}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 pt-4">
          <Link
            to={doctorDetailPath(doctor.bacSiId)}
            className="inline-flex h-12 items-center gap-1.5 rounded-[0.625rem] bg-brand-soft px-4 text-sm font-medium text-brand-strong hover:underline"
          >
            Xem hồ sơ <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          {/* "Nhắn tin" chưa có chức năng nên vô hiệu */}
          <button
            type="button"
            disabled
            title="Chưa được triển khai"
            className="inline-flex h-12 items-center gap-1.5 rounded-[0.625rem] border border-gray-200 px-4 text-sm font-medium text-gray-500"
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            Nhắn tin
          </button>
        </div>
      </div>
      <div className="min-w-0 border-t border-gray-100 bg-gray-50/60 p-5 md:border-t-0">
        {schedule ?? (
          <p className="text-sm text-gray-600">{SCHEDULE_PLACEHOLDER}</p>
        )}
      </div>
    </li>
  );
}
