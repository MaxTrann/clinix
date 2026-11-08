import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { homePathFor, useAuth } from '../../auth';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  getDoctors,
  getOverview,
  getServiceGroups,
  getSpecialties,
} from '../api/search-service';
import { BOOKING_PATH, DOCTOR_TEAM_PATH } from '../search-paths';
import { useRemote } from '../use-remote';
import {
  HomeDoctorCard,
  HomeServiceCard,
  HomeSpecialtyCard,
} from './home-cards';
import { HomeProcess } from './home-process';
import { GlobalSearch } from './global-search';

export const HOME_PREVIEW_SIZE = 8;
const container = 'mx-auto max-w-300 px-7.5';

export function HomePage() {
  const { user } = useAuth();
  const { selection } = useSelectedBranch();
  const branchId = selection?.chiNhanhId ?? null;
  const [sort, setSort] = useState<'kinhNghiem' | 'danhGiaCao'>('kinhNghiem');
  const carousel = useRef<HTMLUListElement>(null);
  const overview = useRemote(getOverview, []);
  const groups = useRemote(
    (signal) => getServiceGroups(branchId, signal),
    [branchId],
  );
  const specialties = useRemote(
    (signal) =>
      getSpecialties(
        { chiNhanhId: branchId, pageSize: HOME_PREVIEW_SIZE },
        signal,
      ),
    [branchId],
  );
  const doctors = useRemote(
    (signal) =>
      getDoctors(
        {
          chiNhanhId: branchId ?? undefined,
          sapXep: sort,
          page: 1,
          pageSize: HOME_PREVIEW_SIZE,
        },
        signal,
      ),
    [branchId, sort],
  );

  return (
    <main>
      {/* Q26: nền brand-strong giữ chữ trắng đủ tương phản; không dùng gradient sáng phía sau chữ. */}
      <section
        aria-labelledby="home-title"
        className="relative bg-brand-strong text-white"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute right-20 top-10 size-72 rounded-full border border-white/20" />
        </div>
        <div className={`${container} relative py-20`}>
          <div className="max-w-168">
            <p className="text-sm">Phòng khám CLINIX</p>
            <h1
              id="home-title"
              className="mt-3 text-4xl font-bold leading-tight md:text-5xl"
            >
              Đặt lịch khám{' '}
              <span className="text-amber-300">đúng bác sĩ, đúng giờ</span>
            </h1>
            <p className="mt-4 max-w-144 text-lg">
              Tìm dịch vụ, chuyên khoa hoặc bác sĩ, rồi đặt lịch khám chỉ trong
              vài bước.
            </p>
            <GlobalSearch />
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
              <span>Gợi ý:</span>
              <Link
                to={BOOKING_PATH}
                className="rounded-full border border-white px-3 py-1.5 hover:underline"
              >
                Chọn dịch vụ khám
              </Link>
              <Link
                to="/chuyen-khoa"
                className="rounded-full border border-white px-3 py-1.5 hover:underline"
              >
                Chuyên khoa
              </Link>
            </div>
            <div className="mt-10" aria-label="Số liệu phòng khám">
              {overview.state.status === 'loading' && (
                <p role="status">Đang tải số liệu...</p>
              )}
              {overview.state.status === 'error' && (
                <ErrorState
                  error={overview.state.error}
                  onRetry={overview.retry}
                />
              )}
              {overview.state.status === 'ready' && (
                <dl className="grid max-w-112 grid-cols-3 gap-4">
                  {[
                    ['Chuyên khoa', overview.state.data.soChuyenKhoa],
                    ['Bác sĩ', overview.state.data.soBacSi],
                    ['Dịch vụ khám', overview.state.data.soDichVu],
                  ].map(([label, count]) => (
                    <div key={label} className="flex flex-col">
                      <dt className="order-2 mt-1 text-sm">{label}</dt>
                      <dd className="order-1 text-3xl font-bold">{count}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {user && (
              <Link
                to={homePathFor(user.vaiTro)}
                className="mt-5 inline-block text-sm underline"
              >
                Về trang của bạn
              </Link>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="home-services" className={`${container} py-14`}>
        <HomeHeading
          id="home-services"
          title="Chọn dịch vụ khám"
          description="Bắt đầu từ nhóm dịch vụ phù hợp với nhu cầu của bạn"
          to={BOOKING_PATH}
        />
        <div className="mt-8">
          {groups.state.status === 'loading' && <LoadingState />}
          {groups.state.status === 'error' && (
            <ErrorState error={groups.state.error} onRetry={groups.retry} />
          )}
          {groups.state.status === 'ready' &&
            (groups.state.data.items.length ? (
              <ul className="grid gap-5 md:grid-cols-3">
                {groups.state.data.items.map((item, index) => (
                  <HomeServiceCard
                    key={item.nhomDichVuId}
                    item={item}
                    index={index}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState message="Chưa có nhóm dịch vụ nào." />
            ))}
        </div>
      </section>

      <section aria-labelledby="home-specialties" className="bg-gray-50 py-14">
        <div className={container}>
          <HomeHeading
            id="home-specialties"
            title="Chuyên khoa"
            description="Tìm bác sĩ theo lĩnh vực bạn cần thăm khám"
            to="/chuyen-khoa"
          />
          <div className="mt-8">
            {specialties.state.status === 'loading' && <LoadingState />}
            {specialties.state.status === 'error' && (
              <ErrorState
                error={specialties.state.error}
                onRetry={specialties.retry}
              />
            )}
            {specialties.state.status === 'ready' &&
              (specialties.state.data.items.length ? (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {specialties.state.data.items
                    .slice(0, HOME_PREVIEW_SIZE)
                    .map((item) => (
                      <HomeSpecialtyCard key={item.chuyenKhoaId} item={item} />
                    ))}
                </ul>
              ) : (
                <EmptyState message="Không tìm thấy chuyên khoa phù hợp." />
              ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="home-doctors" className={`${container} py-14`}>
        <HomeHeading
          id="home-doctors"
          title="Đội ngũ bác sĩ"
          description="Chọn bác sĩ theo kinh nghiệm hoặc đánh giá của bệnh nhân"
          to={DOCTOR_TEAM_PATH}
          linkLabel="Xem tất cả bác sĩ"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Sắp xếp bác sĩ"
            className="mt-8 flex gap-2"
          >
            {(
              [
                ['kinhNghiem', 'Nhiều kinh nghiệm'],
                ['danhGiaCao', 'Được yêu thích'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={sort === value}
                onClick={() => setSort(value)}
                className={`rounded-full border px-4 py-2 text-sm ${sort === value ? 'border-brand-strong bg-brand-strong text-white' : 'border-gray-300 bg-white text-gray-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            role="group"
            aria-label="Cuộn danh sách bác sĩ"
            className="mt-8 flex gap-2"
          >
            <button
              type="button"
              aria-label="Bác sĩ trước"
              onClick={() =>
                carousel.current?.scrollBy({
                  left: -carousel.current.clientWidth,
                  behavior: 'smooth',
                })
              }
              className="rounded-full border border-gray-300 bg-white p-2 text-gray-700"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Bác sĩ tiếp"
              onClick={() =>
                carousel.current?.scrollBy({
                  left: carousel.current.clientWidth,
                  behavior: 'smooth',
                })
              }
              className="rounded-full border border-gray-300 bg-white p-2 text-gray-700"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="mt-5">
          {doctors.state.status === 'loading' && <LoadingState />}
          {doctors.state.status === 'error' && (
            <ErrorState error={doctors.state.error} onRetry={doctors.retry} />
          )}
          {doctors.state.status === 'ready' &&
            (doctors.state.data.items.length ? (
              // Figma 257:407: 4 thẻ trong một hàng; calc trừ đúng 3 khoảng gap-4 trước khi chia chiều rộng.
              <ul
                ref={carousel}
                aria-label="Bác sĩ nổi bật"
                tabIndex={0}
                className="grid grid-flow-col auto-cols-[100%] gap-4 overflow-x-auto pb-3 sm:auto-cols-[calc((100%_-_1rem)/2)] lg:auto-cols-[calc((100%_-_3rem)/4)]"
              >
                {doctors.state.data.items
                  .slice(0, HOME_PREVIEW_SIZE)
                  .map((doctor) => (
                    <HomeDoctorCard key={doctor.bacSiId} doctor={doctor} />
                  ))}
              </ul>
            ) : (
              <EmptyState message="Không tìm thấy bác sĩ phù hợp." />
            ))}
        </div>
      </section>
      <HomeProcess />
    </main>
  );
}

function HomeHeading({
  id,
  title,
  description,
  to,
  linkLabel = 'Xem tất cả',
}: {
  id: string;
  title: string;
  description: string;
  to: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-3xl font-bold text-gray-900">
          {title}
        </h2>
        <p className="mt-1.5 text-gray-600">{description}</p>
      </div>
      <Link
        to={to}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-strong hover:underline"
      >
        {linkLabel}
        <img src="/assets/search/home/arrow.svg" alt="" aria-hidden="true" />
      </Link>
    </div>
  );
}
