import { ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getServiceGroups, getServices } from '../api/search-service';
import type { ServiceItem } from '../api/search-types';
import { formatMoney, isNoDeposit } from '../format/money';
import { BOOKING_PATH, doctorListPath } from '../search-paths';
import { useRemote } from '../../../shared/hooks/use-remote';

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
        className="block h-full rounded-xl border border-gray-200 bg-white p-5 hover:border-brand hover:shadow-md"
      >
        <h2 className="text-lg font-semibold text-gray-900">{item.ten}</h2>
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-sm text-gray-700">
          <span>
            Giá dịch vụ:{' '}
            <strong className="text-gray-900">
              {formatMoney(item.giaMacDinh)}
            </strong>
          </span>
          <span>
            Cọc:{' '}
            {isNoDeposit(item.mucDatCoc) ? (
              <strong className="text-success">Không cần cọc</strong>
            ) : (
              <strong className="text-warning">
                {formatMoney(item.mucDatCoc)}
              </strong>
            )}
          </span>
        </div>
        <p className="mt-2 text-xs text-gray-600">{SURCHARGE_NOTE}</p>
      </Link>
    </li>
  );
}

// Bước 2 "Dịch vụ khám" (Figma 445:2). Tên nhóm lấy từ danh sách nhóm vì API dịch vụ không trả riêng.
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
    <main className="mx-auto max-w-300 px-7.5 py-8">
      <Link
        to={BOOKING_PATH}
        className="inline-flex items-center gap-1 text-sm text-gray-700 hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Chọn lại nhóm dịch vụ
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-gray-900">
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
              <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {services.state.data.items.map((item) => (
                  <ServiceCard
                    key={item.dichVuKhamId}
                    item={item}
                    groupId={groupId}
                  />
                ))}
              </ul>
              <p className="mt-4 text-sm text-gray-600">{DEPOSIT_NOTE}</p>
            </>
          )}
      </div>
    </main>
  );
}
