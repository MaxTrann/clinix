import {
  ChevronRight,
  ClipboardList,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { Link } from 'react-router';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getServiceGroups } from '../api/search-service';
import type { ServiceGroupItem } from '../api/search-types';
import { formatMoney } from '../format/money';
import { serviceListPath } from '../search-paths';
import { useRemote } from '../../../shared/hooks/use-remote';
import { PUBLIC_STEP_CONTAINER } from '../layout';

export const SERVICE_GROUP_EMPTY_MESSAGE = 'Chưa có nhóm dịch vụ nào.';
export const COMING_SOON_LABEL = 'Sắp triển khai';
export const COMING_SOON_NOTE = 'Chưa thể đặt lịch online cho nhóm này.';

const ICONS = [Stethoscope, ClipboardList, ShieldCheck];

function GroupCard({
  item,
  Icon,
}: {
  item: ServiceGroupItem;
  Icon: typeof Stethoscope;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-[13.375px] bg-brand-soft text-brand-strong"
      >
        <Icon className="size-6" />
      </span>
      <h2
        className={`mt-3 text-lg font-semibold ${
          item.sapTrienKhai ? 'text-gray-600' : 'text-gray-900'
        }`}
      >
        {item.ten}
      </h2>
      {item.sapTrienKhai ? (
        <>
          <span className="mt-2 inline-block self-start rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
            {COMING_SOON_LABEL}
          </span>
          <p className="mt-auto pt-4 text-sm font-medium text-gray-600">
            {COMING_SOON_NOTE}
          </p>
        </>
      ) : (
        <div className="mt-auto flex items-center justify-between pt-4 text-sm font-medium text-gray-700">
          <span>
            {item.soDichVu} dịch vụ
            {item.giaTu !== null && (
              <>
                {' '}
                · từ{' '}
                <strong className="font-bold text-brand-strong">
                  {formatMoney(item.giaTu)}
                </strong>
              </>
            )}
          </span>
          <span className="flex items-center gap-1 font-semibold text-brand-strong">
            Chọn <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      )}
    </>
  );

  // Nhóm "Sắp triển khai" không bấm được (TBS-16): không phải liên kết, chỉ là thẻ mờ.
  if (item.sapTrienKhai) {
    return (
      <li
        aria-disabled="true"
        className="flex flex-col rounded-[15px] border border-gray-200 bg-gray-50 p-5"
      >
        {body}
      </li>
    );
  }
  return (
    <li>
      <Link
        to={serviceListPath(item.nhomDichVuId)}
        className="flex h-full flex-col rounded-[15px] border border-gray-200 bg-white p-5 hover:shadow-md"
      >
        {body}
      </Link>
    </li>
  );
}

// Bước 1 "Nhóm dịch vụ" (Figma 444:2, không có thanh bước). Lọc theo chi nhánh đang chọn.
export function ServiceGroupPage() {
  const { selection } = useSelectedBranch();
  const branchId = selection?.chiNhanhId ?? null;
  const { state, retry } = useRemote(
    (signal) => getServiceGroups(branchId, signal),
    [branchId],
  );

  return (
    <main className={PUBLIC_STEP_CONTAINER}>
      <h1 className="text-2xl font-bold text-gray-900">Đặt lịch khám bệnh</h1>
      <p className="mt-1 text-gray-600">
        Chọn nhóm dịch vụ phù hợp với nhu cầu của bạn
      </p>
      <div className="mt-6">
        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && (
          <ErrorState error={state.error} onRetry={retry} />
        )}
        {state.status === 'ready' && state.data.items.length === 0 && (
          <EmptyState message={SERVICE_GROUP_EMPTY_MESSAGE} />
        )}
        {state.status === 'ready' && state.data.items.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {state.data.items.map((item, index) => (
              <GroupCard
                key={item.nhomDichVuId}
                item={item}
                Icon={ICONS[index % ICONS.length]}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
