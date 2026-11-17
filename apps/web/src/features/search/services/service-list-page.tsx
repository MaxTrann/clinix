import { ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { BookingStepper } from '../../../shared/ui/booking-stepper';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getServiceGroups, getServices } from '../api/search-service';
import type { ServiceItem } from '../api/search-types';
import { formatMoney, isNoDeposit } from '../format/money';
import { BOOKING_PATH, doctorListPath } from '../search-paths';
import { useRemote } from '../../../shared/hooks/use-remote';
import { PUBLIC_STEP_CONTAINER } from '../layout';

export const SERVICE_EMPTY_MESSAGE = 'Nhóm này chưa có dịch vụ nào.';
export const SURCHARGE_NOTE =
  'Phụ phí bác sĩ (nếu có) sẽ được cộng thêm khi chọn bác sĩ';
export const DEPOSIT_NOTE =
  'Tiền cọc được trừ vào giá khám; phần còn lại thanh toán tại quầy.';

function ServiceCard({
  item,
  groupId,
}: {
  item: ServiceItem;
  groupId: string;
}) {
  return (
    <li>
      <Link
        to={doctorListPath(groupId, item.dichVuKhamId)}
        className="flex h-full flex-col rounded-[15px] border border-gray-200 bg-white p-5 hover:border-brand hover:shadow-md"
      >
        <h2 className="mb-4 text-lg font-semibold leading-snug text-gray-900">
          {item.ten}
        </h2>
        <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-3 text-[14px] leading-[21px] text-gray-700">
          <span>
            Giá dịch vụ:{' '}
            <strong className="text-gray-900">
              {formatMoney(item.giaMacDinh)}
            </strong>
          </span>
          <span>
            Cọc:{' '}
            {isNoDeposit(item.mucDatCoc) ? (
              <strong className="font-semibold text-success">
                Không cần cọc
              </strong>
            ) : (
              <strong className="font-semibold text-warning">
                {formatMoney(item.mucDatCoc)}
              </strong>
            )}
          </span>
        </div>
        <p className="pt-1 text-xs font-medium text-gray-600">
          {SURCHARGE_NOTE}
        </p>
      </Link>
    </li>
  );
}

// Thanh bước chỉ nối được Bước 1 (đường dẫn Bước 2 chỉ mang id nhóm).
const STEPPER_LINKS = { 1: BOOKING_PATH } as const;

// Bước 2 "Dịch vụ khám" (Figma 445:2: thanh bước, liên kết "Chọn lại…", tiêu đề). Tên nhóm lấy từ danh sách nhóm vì API dịch vụ không trả riêng.
export function ServiceListPage() {
  const { groupId = '' } = useParams();
  const { selection } = useSelectedBranch();
  const branchId = selection?.chiNhanhId ?? null;
  const services = useRemote(
    (signal) => getServices(groupId, branchId, signal),
    [groupId, branchId],
  );
  const groups = useRemote(
    (signal) => getServiceGroups(branchId, signal),
    [branchId],
  );
  const groupName =
    groups.state.status === 'ready'
      ? groups.state.data.items.find((g) => g.nhomDichVuId === groupId)?.ten
      : undefined;

  return (
    <main className={PUBLIC_STEP_CONTAINER}>
      <BookingStepper current={2} links={STEPPER_LINKS} />
      <Link
        to={BOOKING_PATH}
        className="mt-8 -ml-2 inline-flex min-h-12 items-center gap-1.5 px-2 text-base font-medium text-gray-700 hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Chọn lại nhóm dịch vụ
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-gray-900">
        {groupName ?? 'Dịch vụ khám'}
      </h1>
      <p className="mt-1 text-gray-600">
        Chọn dịch vụ khám cụ thể bạn muốn đặt
      </p>
      <div className="mt-6">
        {services.state.status === 'loading' && <LoadingState />}
        {services.state.status === 'error' && (
          <ErrorState error={services.state.error} onRetry={services.retry} />
        )}
        {services.state.status === 'ready' &&
          services.state.data.items.length === 0 && (
            <EmptyState message={SERVICE_EMPTY_MESSAGE} />
          )}
        {services.state.status === 'ready' &&
          services.state.data.items.length > 0 && (
            <>
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {services.state.data.items.map((item) => (
                  <ServiceCard
                    key={item.dichVuKhamId}
                    item={item}
                    groupId={groupId}
                  />
                ))}
              </ul>
              <p className="mt-3 text-[13px] leading-[19.5px] text-gray-600">
                {DEPOSIT_NOTE}
              </p>
            </>
          )}
      </div>
    </main>
  );
}
