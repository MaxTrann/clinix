import { ArrowRight, Briefcase, Clock, Star } from 'lucide-react';
import { Link } from 'react-router';
import type {
  DoctorItem,
  ServiceGroupItem,
  SpecialtySummary,
} from '../api/search-types';
import { doctorInitials, doctorTitleLabel } from '../format/doctor-title';
import { formatMoney } from '../format/money';
import { doctorDetailPath, serviceListPath } from '../search-paths';
import { DoctorCountChip } from '../specialties/doctor-count-chip';
import { SpecialtyImage } from '../specialties/specialty-image';
import { NO_RATING_LABEL } from '../doctors/doctor-card';

export function HomeServiceCard({
  item,
  index,
}: {
  item: ServiceGroupItem;
  index: number;
}) {
  const icon = item.sapTrienKhai
    ? 'service-coming'
    : index % 2
      ? 'service-general'
      : 'service-specialty';
  const body = (
    <>
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft">
        <img
          src={`/assets/search/home/${icon}.svg`}
          alt=""
          aria-hidden="true"
        />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-gray-900">{item.ten}</h3>
      {item.sapTrienKhai ? (
        <p className="mt-3">
          <span className="inline-block rounded-full bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600">
            Sắp triển khai
          </span>
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-gray-600">
            {item.soDichVu} dịch vụ
            {item.giaTu !== null && (
              <>
                {' '}
                · từ{' '}
                <strong className="font-medium text-gray-800">
                  {formatMoney(item.giaTu)}
                </strong>
              </>
            )}
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-strong">
            Chọn dịch vụ
            <img
              src="/assets/search/home/arrow.svg"
              alt=""
              aria-hidden="true"
            />
          </span>
        </>
      )}
    </>
  );
  return (
    <li aria-disabled={item.sapTrienKhai || undefined}>
      {item.sapTrienKhai ? (
        <div className="h-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6">
          {body}
        </div>
      ) : (
        <Link
          to={serviceListPath(item.nhomDichVuId)}
          className="block h-full rounded-2xl border border-gray-200 bg-white p-6 hover:shadow-md"
        >
          {body}
        </Link>
      )}
    </li>
  );
}

export function HomeSpecialtyCard({ item }: { item: SpecialtySummary }) {
  return (
    <li>
      <Link
        to={`/chuyen-khoa/${encodeURIComponent(item.chuyenKhoaId)}`}
        className="block h-full overflow-hidden rounded-2xl border border-gray-200 bg-white hover:shadow-md"
      >
        <SpecialtyImage
          src={item.anhDaiDien}
          name={item.ten}
          className="h-40 w-full object-cover"
        />
        <div className="p-4">
          <h3 className="text-lg font-semibold text-gray-900">{item.ten}</h3>
          {/* Figma 257:214: luôn chừa 30 px (hai dòng 11,25 px) để chip "N bác sĩ" không nhảy lên khi mô tả trống */}
          <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-gray-600">
            {item.moTa}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <DoctorCountChip count={item.soBacSi} />
            <ArrowRight className="size-4 text-gray-300" aria-hidden="true" />
          </div>
        </div>
      </Link>
    </li>
  );
}

// Q14: API không có ảnh bác sĩ; giữ chữ viết tắt như F5/F6, không gán ảnh mẫu cho người thật.
// Thẻ này của Figma dùng lưới 4 px (chữ 10/11/13/14 px, đệm 16/14 px, bo 8 px), không nằm trên thang 15 px của gốc `html`:
// nên ghi số px thật bằng `[Npx]` cho khớp Figma (ADR 0004 mục `[...]`; search F14, UIS-06).
export function HomeDoctorCard({ doctor }: { doctor: DoctorItem }) {
  const rating = doctor.danhGia.diemTrungBinh;
  return (
    <li className="relative overflow-hidden rounded-[8px] border border-gray-200 bg-white shadow-sm">
      <div className="relative">
        <div
          aria-hidden="true"
          className="flex h-[192px] items-center justify-center bg-brand-soft text-5xl font-semibold text-brand-strong"
        >
          {doctorInitials(doctor.hoTen)}
        </div>
        {/* Figma 257:412: điểm sao là huy hiệu trắng ở góc trên phải ảnh; chưa có đánh giá thì không có huy hiệu (dòng chữ dưới tên) */}
        {rating !== null && (
          <span className="absolute right-2.5 top-2.5 flex items-center gap-[3px] rounded-full bg-white/90 px-2.5 py-[3px] text-[12px] font-semibold leading-[18px] text-gray-700">
            <Star
              className="size-3 fill-amber-500 text-amber-500"
              aria-hidden="true"
            />
            {Number(rating).toFixed(1)}
            <span className="sr-only">
              {' '}
              ({doctor.danhGia.soDanhGia} đánh giá)
            </span>
          </span>
        )}
      </div>
      <div className="px-[16px] py-[14px]">
        <p className="text-[11px] font-semibold leading-[16.5px] text-brand-strong">
          {doctor.chuyenKhoa.ten}
        </p>
        <h3 className="pt-0.5 text-[14px] font-bold leading-[21px] text-gray-900">
          {doctorTitleLabel(doctor.chucDanh)}. {doctor.hoTen}
        </h3>
        {rating === null && (
          <p className="pt-1 text-[11px] leading-[16.5px] text-gray-700">
            {NO_RATING_LABEL}
          </p>
        )}
        <div className="flex gap-3 pt-1.5 text-[11px] leading-[16.5px] text-gray-600">
          <span className="flex items-center gap-1">
            <Briefcase className="size-[11px]" aria-hidden="true" />
            {doctor.soNamKinhNghiem} năm KN
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-[11px]" aria-hidden="true" />
            {doctor.dichVu.thoiLuong} phút/lần
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2.5">
          <p className="text-[10px] leading-[15px] text-gray-600">
            Giá khám
            <strong className="block text-[13px] font-bold leading-[19.5px] text-brand-strong">
              {formatMoney(doctor.gia.giaKham)}
            </strong>
          </p>
          <Link
            to={doctorDetailPath(doctor.bacSiId)}
            className="rounded-[6px] bg-brand-strong px-[14px] py-[6px] text-[12px] font-semibold leading-[18px] text-white"
          >
            Xem hồ sơ<span className="sr-only"> {doctor.hoTen}</span>
          </Link>
        </div>
      </div>
    </li>
  );
}
