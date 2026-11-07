import { Clock, MapPin, Star } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getClinicInfo, getDoctorDetail } from '../api/search-service';
import type { DoctorDetail } from '../api/search-types';
import { doctorInitials, doctorTitleLabel } from '../format/doctor-title';
import { formatMoney } from '../format/money';
import { DOCTOR_TEAM_PATH } from '../search-paths';
import { useRemote } from '../use-remote';
import { NO_RATING_LABEL } from './doctor-card';
import {
  ClinicPanel,
  GuidePanel,
  IntroPanel,
  ReviewsPanel,
  SchedulePanel,
} from './doctor-detail-panels';

export const DOCTOR_NOT_FOUND_MESSAGE = 'Không tìm thấy bác sĩ này.';
export const DEMO_NOTE =
  'Hồ sơ bác sĩ, điểm đánh giá và nội dung giới thiệu trong bản demo là dữ liệu minh họa, chưa được CLINIX xác thực.';

const TABS = [
  { key: 'lich', label: 'Lịch khám' },
  { key: 'gioi-thieu', label: 'Giới thiệu' },
  { key: 'phong-kham', label: 'Phòng khám' },
  { key: 'huong-dan', label: 'Hướng dẫn' },
  { key: 'danh-gia', label: 'Đánh giá' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function Panel({ tab, doctor }: { tab: TabKey; doctor: DoctorDetail }) {
  if (tab === 'gioi-thieu') return <IntroPanel doctor={doctor} />;
  if (tab === 'phong-kham') return <ClinicPanel doctor={doctor} />;
  if (tab === 'huong-dan') return <GuidePanel />;
  if (tab === 'danh-gia') return <ReviewsPanel doctor={doctor} />;
  return <SchedulePanel />;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function DoctorDetailContent({ doctor }: { doctor: DoctorDetail }) {
  const [tab, setTab] = useState<TabKey>('lich');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const clinic = useRemote((signal) => getClinicInfo(signal), []);
  const hotline =
    clinic.state.status === 'ready' ? clinic.state.data.duongDayNong : null;
  const rating = doctor.danhGia.diemTrungBinh;

  // Phím mũi tên chuyển tab (mẫu tab của ARIA): giữ focus đi theo tab mới
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    setTab(next.key);
    tabRefs.current[next.key]?.focus();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div>
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex gap-5">
            <div
              aria-hidden="true"
              className="flex size-24 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-2xl font-semibold text-brand-strong"
            >
              {doctorInitials(doctor.hoTen)}
            </div>
            <div>
              <p className="text-sm text-brand-strong">
                {doctor.chuyenKhoa.ten}
              </p>
              <h1 className="text-3xl font-semibold text-gray-900">
                {doctorTitleLabel(doctor.chucDanh)}. {doctor.hoTen}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700">
                <span className="flex items-center gap-1">
                  <Star className="size-4 text-amber-500" aria-hidden="true" />
                  {rating !== null
                    ? `${Number(rating).toFixed(1)} (${doctor.danhGia.soDanhGia} đánh giá)`
                    : NO_RATING_LABEL}
                </span>
                <span>{doctor.soNamKinhNghiem} năm kinh nghiệm</span>
                <span className="flex items-center gap-1">
                  <Clock className="size-4" aria-hidden="true" />
                  {doctor.dichVu.thoiLuong} phút/lượt
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="size-4" aria-hidden="true" />
                  {doctor.chiNhanh.ten}
                </span>
              </div>
              <p className="mt-2 flex items-center gap-2">
                <strong className="text-xl text-brand-strong">
                  {formatMoney(doctor.gia.giaKham)}
                </strong>
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">
                  Cọc {formatMoney(doctor.gia.mucDatCoc)}
                </span>
              </p>
            </div>
          </div>
          <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {DEMO_NOTE}
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-gray-200 bg-white">
          <div
            role="tablist"
            aria-label="Thông tin bác sĩ"
            className="flex flex-wrap border-b border-gray-200 px-2"
          >
            {TABS.map((item, index) => (
              <button
                key={item.key}
                ref={(node) => {
                  tabRefs.current[item.key] = node;
                }}
                type="button"
                role="tab"
                id={`doctor-tab-${item.key}`}
                aria-selected={tab === item.key}
                aria-controls="doctor-tabpanel"
                tabIndex={tab === item.key ? 0 : -1}
                onClick={() => setTab(item.key)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={`border-b-2 px-4 py-3 text-sm ${
                  tab === item.key
                    ? 'border-brand font-medium text-brand-strong'
                    : 'border-transparent text-gray-700 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="doctor-tabpanel"
            aria-labelledby={`doctor-tab-${tab}`}
            className="p-6"
          >
            <Panel tab={tab} doctor={doctor} />
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-xl font-semibold text-gray-900">
            Thông tin khám
          </h2>
          {/* Không có "Đặt trước tối đa 7 ngày": DB không giới hạn số ngày đặt trước (L14, quy tắc 38) */}
          <dl className="mt-3">
            <InfoRow label="Dịch vụ" value={doctor.dichVu.ten} />
            <InfoRow label="Giá khám" value={formatMoney(doctor.gia.giaKham)} />
            <InfoRow
              label="Đặt cọc"
              value={formatMoney(doctor.gia.mucDatCoc)}
            />
            <InfoRow
              label="Thời gian/lượt"
              value={`${doctor.dichVu.thoiLuong} phút`}
            />
          </dl>
          <button
            type="button"
            onClick={() => {
              setTab('lich');
              tabRefs.current.lich?.focus();
            }}
            className="mt-4 w-full rounded-lg bg-brand-strong px-4 py-2.5 text-sm font-medium text-white"
          >
            Chọn ngày khám
          </button>
          <button
            type="button"
            disabled
            title="Chưa được triển khai"
            className="mt-3 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-500"
          >
            Nhắn tin với bác sĩ
          </button>
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            Địa chỉ phòng khám
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-900">
            {doctor.chiNhanh.ten}
          </p>
          <p className="text-sm text-gray-700">{doctor.chiNhanh.diaChi}</p>
          {hotline && (
            <>
              <h2 className="mt-4 text-lg font-semibold text-gray-900">
                Hỗ trợ đặt lịch
              </h2>
              <p className="text-sm text-gray-700">{hotline}</p>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}

// Trang "Chi tiết bác sĩ" (Figma 653:2–657:2). Tab Lịch khám chỉ chừa chỗ (`[SAU]`); tab Đánh giá chỉ điểm + số lượt (Q16).
export function DoctorDetailPage() {
  const { id = '' } = useParams();
  const { state, retry } = useRemote(
    (signal) => getDoctorDetail(id, signal),
    [id],
  );
  const notFound =
    state.status === 'error' &&
    state.error instanceof ApiError &&
    state.error.status === 404;

  return (
    <main className="mx-auto max-w-300 px-7.5 py-8">
      <nav aria-label="Đường dẫn" className="text-sm text-gray-600">
        <Link to="/" className="hover:underline">
          Trang chủ
        </Link>
        <span aria-hidden="true"> / </span>
        <Link to={DOCTOR_TEAM_PATH} className="hover:underline">
          Bác sĩ
        </Link>
        {state.status === 'ready' && (
          <>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">
              {doctorTitleLabel(state.data.chucDanh)}. {state.data.hoTen}
            </span>
          </>
        )}
      </nav>
      <div className="mt-6">
        {state.status === 'loading' && <LoadingState />}
        {notFound && (
          <div role="alert" className="rounded-xl border border-gray-200 p-4">
            <p>{DOCTOR_NOT_FOUND_MESSAGE}</p>
            <Link
              to={DOCTOR_TEAM_PATH}
              className="mt-2 inline-block text-sm font-medium underline"
            >
              Xem đội ngũ bác sĩ
            </Link>
          </div>
        )}
        {state.status === 'error' && !notFound && (
          <ErrorState error={state.error} onRetry={retry} />
        )}
        {state.status === 'ready' && (
          <DoctorDetailContent doctor={state.data} />
        )}
      </div>
    </main>
  );
}
