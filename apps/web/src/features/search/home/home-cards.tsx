import { Link } from 'react-router';
import type {
  DoctorItem,
  ServiceGroupItem,
  SpecialtySummary,
} from '../api/search-types';
import { doctorInitials, doctorTitleLabel } from '../format/doctor-title';
import { formatMoney } from '../format/money';
import { doctorDetailPath, serviceListPath } from '../search-paths';
import { doctorCountLabel } from '../specialties/doctor-count-label';
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
        <p className="mt-3 text-sm text-gray-600">Sắp triển khai</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-gray-600">
            {item.soDichVu} dịch vụ
            {item.giaTu !== null && (
              <>
                {' '}
                · từ{' '}
                <strong className="text-gray-800">
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
        <div className="h-full rounded-2xl border border-gray-200 bg-gray-50 p-6">
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
          {item.moTa && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-600">
              {item.moTa}
            </p>
          )}
          <p className="mt-3 text-sm font-medium text-brand-strong">
            {doctorCountLabel(item.soBacSi)}
          </p>
        </div>
      </Link>
    </li>
  );
}

// Q14: API không có ảnh bác sĩ; giữ chữ viết tắt như F5/F6, không gán ảnh mẫu cho người thật.
export function HomeDoctorCard({ doctor }: { doctor: DoctorItem }) {
  return (
    <li className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div
        aria-hidden="true"
        className="flex h-48 items-center justify-center bg-brand-soft text-5xl font-semibold text-brand-strong"
      >
        {doctorInitials(doctor.hoTen)}
      </div>
      <div className="p-4">
        <p className="text-xs font-semibold text-brand-strong">
          {doctor.chuyenKhoa.ten}
        </p>
        <h3 className="mt-1 font-bold text-gray-900">
          {doctorTitleLabel(doctor.chucDanh)}. {doctor.hoTen}
        </h3>
        <p className="mt-2 text-xs text-gray-700">
          {doctor.danhGia.diemTrungBinh === null
            ? NO_RATING_LABEL
            : `${Number(doctor.danhGia.diemTrungBinh).toFixed(1)} (${doctor.danhGia.soDanhGia} đánh giá)`}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
          <span>{doctor.soNamKinhNghiem} năm KN</span>
          <span>{doctor.dichVu.thoiLuong} phút/lần</span>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
          <p className="text-xs text-gray-600">
            Giá khám
            <strong className="block text-base text-brand-strong">
              {formatMoney(doctor.gia.giaKham)}
            </strong>
          </p>
          <Link
            to={doctorDetailPath(doctor.bacSiId)}
            className="rounded-lg bg-brand-strong px-3 py-2 text-xs font-medium text-white"
          >
            Xem hồ sơ<span className="sr-only"> {doctor.hoTen}</span>
          </Link>
        </div>
      </div>
    </li>
  );
}
