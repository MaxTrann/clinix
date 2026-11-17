import { ChevronRight } from 'lucide-react';
import { formatVnd } from '../../../shared/money/format-vnd';
import type { PolicyServiceGroup } from './api/policy-api';
import { POLICY_TEXT } from './policy-text';

// Danh sách dịch vụ theo nhóm (payment F5; Figma `553:350`). Dịch vụ chưa cấu hình gắn nhãn xám "Mặc định" như Figma; đã có chính sách riêng thì nhãn "Riêng" và dòng phụ thêm mức cọc
// (Trung chọn 18/11/2026). Mỗi dịch vụ là một nút; nút đang chọn có `aria-pressed`.
export function ServiceList({
  groups,
  selectedId,
  onSelect,
}: {
  groups: PolicyServiceGroup[];
  selectedId: string | null;
  onSelect: (dichVuKhamId: string) => void;
}) {
  if (groups.every((group) => group.dichVu.length === 0))
    return (
      <p className="px-4 py-6 text-center text-sm text-gray-500">
        {POLICY_TEXT.listEmpty}
      </p>
    );

  return (
    <div>
      {groups
        .filter((group) => group.dichVu.length > 0)
        .map((group) => (
          <section
            key={group.nhomDichVuId}
            aria-label={group.ten}
            className="border-b border-gray-50 last:border-b-0"
          >
            <h3 className="bg-gray-50 px-4 py-2 text-xs font-semibold tracking-[0.28px] text-gray-500 uppercase">
              {group.ten}
            </h3>
            <ul>
              {group.dichVu.map((service) => {
                const selected = service.dichVuKhamId === selectedId;
                return (
                  <li key={service.dichVuKhamId}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelect(service.dichVuKhamId)}
                      className={`flex w-full items-center gap-2 px-4 py-3 text-left ${
                        selected ? 'bg-brand-soft' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-700">
                          {service.ten}
                        </span>
                        <span className="block text-xs font-medium text-gray-500">
                          {formatVnd(service.giaMacDinh)}
                          {service.coChinhSachRieng &&
                            ` · ${POLICY_TEXT.depositShort} ${formatVnd(service.mucDatCoc)}`}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-[3.75px] px-1.5 py-0.5 text-[10px] leading-[15px] font-medium ${
                          service.coChinhSachRieng
                            ? 'bg-brand-soft text-brand-strong'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {service.coChinhSachRieng
                          ? POLICY_TEXT.customBadge
                          : POLICY_TEXT.defaultBadge}
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-gray-400"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
