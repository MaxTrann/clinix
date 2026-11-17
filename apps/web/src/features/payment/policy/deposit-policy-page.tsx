import { Info } from 'lucide-react';
import { useState } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  getPolicyGroups,
  type PolicyServiceItem,
  type ServicePolicy,
} from './api/policy-api';
import { isZeroAmount } from './policy-form';
import { DefaultPolicyPanel } from './default-policy-panel';
import { PolicyEditor } from './policy-editor';
import { POLICY_TEXT } from './policy-text';
import { ServiceList } from './service-list';

// Màn "Đặt cọc & Hoàn tiền" của Quản trị viên toàn hệ thống (payment F5; Figma `553:2`). Ba vùng: bảng mặc định CHỈ ĐỌC (Q7), danh sách dịch vụ theo nhóm, khung phải sửa chính sách riêng của
// dịch vụ đang chọn. Lưu xong thì tải lại danh sách để nhãn "Riêng" và mức cọc đúng; dịch vụ đang chọn giữ nguyên. Không lưu gì vào URL hay kho trình duyệt.
// Cổng: route bọc `AdminScopeGuard policy="ToanHeThong"` (Admin chi nhánh thấy trang "không có quyền"); máy chủ vẫn trả 403 nếu bị gọi thẳng (B10).
export function DepositPolicyPage() {
  const { state, retry } = useRemote((signal) => getPolicyGroups(signal), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Kết quả lưu của từng dịch vụ, áp đè lên danh sách đã tải: KHÔNG tải lại cả danh sách sau khi lưu (tải lại thì danh sách về "đang tải" một nhịp, dịch vụ đang chọn
  // biến mất và khung sửa bị gỡ, mất thông báo "Đã lưu"). Cờ "Riêng" tính như B10: có cọc hoặc có ít nhất một mốc.
  const [savedById, setSavedById] = useState<
    Record<string, Pick<PolicyServiceItem, 'mucDatCoc' | 'coChinhSachRieng'>>
  >({});
  const onSaved = (policy: ServicePolicy) =>
    setSavedById((current) => ({
      ...current,
      [policy.dichVuKhamId]: {
        mucDatCoc: policy.mucDatCoc,
        coChinhSachRieng:
          !isZeroAmount(policy.mucDatCoc) || policy.moc.length > 0,
      },
    }));

  const groups =
    state.status === 'ready'
      ? state.data.map((group) => ({
          ...group,
          dichVu: group.dichVu.map((service) => ({
            ...service,
            ...savedById[service.dichVuKhamId],
          })),
        }))
      : [];
  const selected =
    groups
      .flatMap((group) => group.dichVu)
      .find((service) => service.dichVuKhamId === selectedId) ?? null;

  return (
    <section className="flex flex-col gap-6">
      <h1 className="sr-only">{POLICY_TEXT.pageTitle}</h1>
      <DefaultPolicyPanel />

      <div className="grid items-start gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
        <section
          aria-labelledby="policy-services-title"
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <h2
              id="policy-services-title"
              className="text-sm font-semibold text-gray-800"
            >
              {POLICY_TEXT.servicesTitle}
            </h2>
            <p className="pt-0.5 text-xs text-gray-500">
              {POLICY_TEXT.servicesSubtitle}
            </p>
          </div>
          {state.status === 'loading' && (
            <div className="p-3">
              <LoadingState message={POLICY_TEXT.listLoading} />
            </div>
          )}
          {state.status === 'error' && (
            <div className="p-3">
              <ErrorState error={state.error} onRetry={retry} />
            </div>
          )}
          {state.status === 'ready' && (
            <ServiceList
              groups={groups}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </section>

        <section
          aria-label={selected?.ten ?? POLICY_TEXT.tiersTitle}
          className="min-h-[180px] rounded-2xl border border-gray-200 bg-white"
        >
          {selected === null ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <Info
                aria-hidden="true"
                className="size-[37.5px] text-gray-300"
              />
              <p className="pt-3 text-sm text-gray-500">
                {POLICY_TEXT.emptyPanel}
              </p>
            </div>
          ) : (
            // `key` theo dịch vụ: đổi dịch vụ thì dựng lại khung sửa từ đầu (không mang bản nháp của dịch vụ trước)
            <PolicyEditor
              key={selected.dichVuKhamId}
              service={selected}
              onSaved={onSaved}
            />
          )}
        </section>
      </div>
    </section>
  );
}
