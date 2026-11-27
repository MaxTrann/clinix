import {
  Briefcase,
  CalendarDays,
  Clock,
  Info,
  MapPin,
  Phone,
  Stethoscope,
  Wallet,
} from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { ErrorState } from '../../../shared/ui/error-state';
import { DoctorMessageAction } from './doctor-message-action';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getClinicInfo, getDoctorDetail } from '../api/search-service';
import type { DoctorDetail } from '../api/search-types';
import { Breadcrumb } from '../breadcrumb';
import { doctorDisplayName, doctorInitials } from '../format/doctor-title';
import { formatMoney } from '../format/money';
import { DOCTOR_TEAM_PATH } from '../search-paths';
import { useRemote } from '../../../shared/hooks/use-remote';
import { DoctorRating } from './doctor-card';
import { PUBLIC_CONTAINER } from '../layout';
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

// Hàng "nhãn ... giá trị" của khối "Thông tin khám" (Figma 653:221): nhãn 13,125 xám có biểu tượng 15 px (chỉ Dịch vụ, Đặt cọc), giá trị bên phải.
function InfoRow({
  label,
  value,
  icon: Icon,
  valueClass = 'text-gray-800',
}: {
  label: string;
  value: string;
  icon?: typeof Stethoscope;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="flex items-center gap-1.5 text-gray-600">
        {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
        {label}
      </dt>
      <dd className={`text-right ${valueClass}`}>{value}</dd>
    </div>
  );
}

function DoctorDetailContent({ doctor }: { doctor: DoctorDetail }) {
  const [tab, setTab] = useState<TabKey>('lich');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const clinic = useRemote((signal) => getClinicInfo(signal), []);
  const hotline =
    clinic.state.status === 'ready' ? clinic.state.data.duongDayNong : null;

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

  // Cột phải 365 px, khe 22,5 px (Figma 653:216); thẻ đầu, tab, nút theo Figma 653:65, 653:118, 653:216 (search F14, UIS-10, B4).
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_365px]">
      <div>
        <section className="rounded-[15px] border border-gray-200 bg-white p-6">
          <div className="flex gap-5">
            <div
              aria-hidden="true"
              className="flex size-24 shrink-0 items-center justify-center rounded-[15px] border border-gray-200 bg-brand-soft text-2xl font-semibold text-brand-strong"
            >
              {doctorInitials(doctor.hoTen)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-brand-strong">
                {doctor.chuyenKhoa.ten}
              </p>
              <h1 className="text-2xl font-bold leading-tight text-gray-900">
                {doctorDisplayName(doctor.chucDanh, doctor.hoTen)}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-600">
                <DoctorRating
                  rating={doctor.danhGia.diemTrungBinh}
                  count={doctor.danhGia.soDanhGia}
                  large
                />
                <span className="flex items-center gap-1.5">
                  <Briefcase
                    className="size-4 text-gray-400"
                    aria-hidden="true"
                  />
                  {doctor.soNamKinhNghiem} năm kinh nghiệm
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-gray-400" aria-hidden="true" />
                  {doctor.dichVu.thoiLuong} phút/lượt
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-gray-400" aria-hidden="true" />
                  {doctor.chiNhanh.ten}
                </span>
              </div>
              <p className="mt-3 flex items-center gap-2">
                <strong className="text-base font-semibold text-brand-strong">
                  {formatMoney(doctor.gia.giaKham)}
                </strong>
                <span className="rounded-full border border-amber-200 bg-warning-soft px-2 py-0.5 text-[11px] font-medium leading-[16.5px] text-warning">
                  Cọc {formatMoney(doctor.gia.mucDatCoc)}
                </span>
              </p>
            </div>
          </div>
          <p className="mt-5 flex gap-2 rounded-[13.375px] border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
            <Info className="mt-px size-4 shrink-0" aria-hidden="true" />
            {DEMO_NOTE}
          </p>
        </section>

        <section className="mt-6 rounded-[15px] border border-gray-200 bg-white">
          <div
            role="tablist"
            aria-label="Thông tin bác sĩ"
            className="flex flex-wrap border-b border-gray-100"
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
                className={`h-12 border-b-2 px-5 text-sm font-medium ${
                  tab === item.key
                    ? 'border-brand text-brand-strong'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
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

      <aside className="flex flex-col gap-4">
        <section className="rounded-[15px] border border-gray-200 bg-white p-5">
          <h2 className="text-xl font-semibold leading-normal text-gray-900">
            Thông tin khám
          </h2>
          {/* Không có "Đặt trước tối đa 7 ngày": DB không giới hạn số ngày đặt trước (L14, quy tắc 38) */}
          <dl className="mt-4 flex flex-col gap-3">
            <InfoRow
              label="Dịch vụ"
              value={doctor.dichVu.ten}
              icon={Stethoscope}
            />
            <InfoRow
              label="Giá khám"
              value={formatMoney(doctor.gia.giaKham)}
              valueClass="font-semibold text-brand-strong"
            />
            <InfoRow
              label="Đặt cọc"
              value={formatMoney(doctor.gia.mucDatCoc)}
              icon={Wallet}
              valueClass="font-medium text-warning"
            />
            <InfoRow
              label="Thời gian/lượt"
              value={`${doctor.dichVu.thoiLuong} phút`}
              valueClass="text-gray-700"
            />
          </dl>
          {/* Cam của Figma (nút "Chọn ngày khám"): nền token `cta` với chữ gray-900 (10,30:1), thay quyết định xanh của F14-N (f) (search UI PR-A, G1) */}
          <button
            type="button"
            onClick={() => {
              setTab('lich');
              tabRefs.current.lich?.focus();
            }}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[13.375px] bg-cta text-sm font-medium text-gray-900 hover:bg-cta-hover"
          >
            <CalendarDays className="size-4" aria-hidden="true" />
            Chọn ngày khám
          </button>
          {/* chat F4: Bệnh nhân và khách mở trang Tin nhắn; vai trò khác thấy nút vô hiệu kèm chú thích */}
          <DoctorMessageAction
            bacSiId={doctor.bacSiId}
            label="Nhắn tin với bác sĩ"
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[13.375px] border border-gray-200 text-sm font-medium"
          />
        </section>
        <section className="rounded-[15px] border border-gray-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-xl font-semibold leading-normal text-gray-900">
            <MapPin
              className="size-4 shrink-0 text-brand-strong"
              aria-hidden="true"
            />
            Địa chỉ phòng khám
          </h2>
          <p className="pt-2 text-sm font-medium text-gray-800">
            {doctor.chiNhanh.ten}
          </p>
          <p className="pt-0.5 text-sm text-gray-600">
            {doctor.chiNhanh.diaChi}
          </p>
          {hotline && (
            <>
              <h2 className="flex items-center gap-2 text-xl font-semibold leading-normal text-gray-900">
                <Phone
                  className="size-4 shrink-0 text-brand-strong"
                  aria-hidden="true"
                />
                Hỗ trợ đặt lịch
              </h2>
              <p className="pt-1 text-sm text-gray-700">{hotline}</p>
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
    <main className={`${PUBLIC_CONTAINER} py-8`}>
      <Breadcrumb
        items={[
          { label: 'Trang chủ', to: '/' },
          { label: 'Bác sĩ', to: DOCTOR_TEAM_PATH },
          ...(state.status === 'ready'
            ? [
                {
                  label: doctorDisplayName(
                    state.data.chucDanh,
                    state.data.hoTen,
                  ),
                },
              ]
            : []),
        ]}
      />
      <div className="mt-5">
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
