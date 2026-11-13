import { Check, Plus, RefreshCw, UserRound, Users, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import type { RemoteState } from '../../../../shared/hooks/use-remote';
import { PATIENT_PROFILE_PATH } from '../../../../shared/routes/booking-paths';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ListFailure } from '../../appointments/common/list-failure';
import { relationshipLabel } from '../../api/booking-labels';
import type { VisitRelative } from '../../api/booking-types';

interface VisitProfileCardProps {
  // Họ tên của chính Bệnh nhân (từ phiên); chỉ để hiện thẻ "Bản thân"
  selfName: string;
  // null = bản thân
  selectedId: string | null;
  relatives: RemoteState<VisitRelative[]>;
  // Đang tải LẠI danh sách (danh sách cũ vẫn hiện): nút "Làm mới danh sách" tắt, hộp `aria-busy`
  refreshing?: boolean;
  onRetryRelatives: () => void;
  onSelect: (hoSoNguoiThanId: string | null) => void;
  // Thông báo ngay dưới thẻ đang chọn (lỗi A3 của hồ sơ, hồ sơ đã bị bỏ)
  children?: ReactNode;
}

interface ProfileRow {
  // null = bản thân
  id: string | null;
  name: string;
  label: string;
}

const SELF_LABEL = 'Bản thân';

// Thẻ "Người đi khám" (Figma `449:2`, `450:2`): thẻ hồ sơ `Đang chọn` (mặc định là bản thân) và nút `Chọn người thân khác` mở HỘP CHỌN. Figma vẽ hộp là nhóm radio
// (vòng tròn) nên dùng `<input type="radio">` gốc: Tab vào nhóm, mũi tên đổi lựa chọn, bàn phím và trình đọc màn hình tự có. Chọn là ÁP DỤNG NGAY (thẻ phía trên đổi);
// hộp ở yên cho tới khi đóng (nút "Đóng, giữ lựa chọn hiện tại", nút ✕ hay `Esc`) để mũi tên không đóng hộp giữa lúc duyệt danh sách. Đóng thì tiêu điểm về nút mở.
// Hồ sơ người thân do `relatives` cấp (đã lọc hồ sơ ngừng sử dụng ở bộ đọc). Lỗi tải chỉ ảnh hưởng hộp: bản thân luôn chọn được.
export function VisitProfileCard({
  selfName,
  selectedId,
  relatives,
  refreshing = false,
  onRetryRelatives,
  onSelect,
  children,
}: VisitProfileCardProps) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);
  const groupName = useId();
  const titleId = useId();

  // Mở ⇒ tiêu điểm vào lựa chọn đang chọn (hay chính hộp khi lựa chọn chưa có trong danh sách); đóng ⇒ về nút mở
  useEffect(() => {
    if (open) {
      const checked =
        panelRef.current?.querySelector<HTMLInputElement>('input:checked');
      (checked ?? panelRef.current)?.focus();
    } else if (wasOpen.current) {
      toggleRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  const relativeRows: ProfileRow[] =
    relatives.status === 'ready'
      ? relatives.data.map((relative) => ({
          id: relative.hoSoNguoiThanId,
          name: relative.hoTen,
          label: relationshipLabel(relative.moiQuanHe),
        }))
      : [];
  const rows: ProfileRow[] = [
    { id: null, name: selfName, label: SELF_LABEL },
    ...relativeRows,
  ];
  // Lựa chọn khôi phục từ bản nháp mà danh sách chưa tải xong thì chưa có tên để hiện
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <section
      aria-labelledby="visit-profile-title"
      className="rounded-2xl border border-gray-200 bg-white p-5"
    >
      <h2 id="visit-profile-title" className="font-semibold text-gray-900">
        Người đi khám
      </h2>

      <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-brand-strong bg-brand-soft p-4">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-strong text-white"
        >
          <UserRound className="size-5" />
        </span>
        {selected === null ? (
          <p className="text-sm text-gray-700">Đang tải hồ sơ...</p>
        ) : (
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-gray-900">
              {selected.name}
            </p>
            <p className="text-sm text-gray-800">{selected.label}</p>
          </div>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-sm font-medium text-brand-strong">
          <Check aria-hidden="true" className="size-4" />
          Đang chọn
        </span>
      </div>

      {children}

      {open ? (
        <div
          ref={panelRef}
          tabIndex={-1}
          onKeyDown={closeOnEscape}
          className="mt-3 overflow-hidden rounded-xl border border-gray-200"
        >
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 pl-4">
            <p id={titleId} className="font-semibold text-gray-900">
              Chọn người đi khám
            </p>
            <button
              type="button"
              aria-label="Đóng danh sách"
              onClick={() => setOpen(false)}
              className="flex size-11 items-center justify-center text-gray-700"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div
            role="radiogroup"
            aria-labelledby={titleId}
            aria-busy={refreshing}
          >
            {rows.map((row) => (
              <label
                key={row.id ?? 'self'}
                className="flex min-h-13 cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-2 has-[:checked]:bg-brand-soft"
              >
                <input
                  type="radio"
                  name={groupName}
                  checked={row.id === selectedId}
                  onChange={() => onSelect(row.id)}
                  className="size-5 shrink-0 accent-brand-strong"
                />
                <span>
                  <span className="block font-semibold text-gray-900">
                    {row.name}
                  </span>
                  <span className="block text-sm font-medium text-gray-700">
                    {row.label}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {relatives.status === 'loading' && (
            <LoadingState message="Đang tải danh sách người thân..." />
          )}
          {relatives.status === 'error' && (
            <ListFailure error={relatives.error} onRetry={onRetryRelatives} />
          )}
          {relatives.status === 'ready' && relatives.data.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-700">
              Bạn chưa có hồ sơ người thân.
            </p>
          )}
          {/* Thêm hồ sơ ở TAB MỚI (Đại duyệt 13/11/2026): bản nháp nằm trong bộ nhớ của trang này nên rời trang cùng tab sẽ mất lý do đã gõ. Quay lại tab này rồi bấm "Làm mới danh sách" */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-4">
            <Link
              to={PATIENT_PROFILE_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-13 items-center gap-2 font-semibold text-brand-strong"
            >
              <Plus aria-hidden="true" className="size-4" />
              Thêm hồ sơ người thân mới
              <span className="sr-only"> (mở trong tab mới)</span>
            </Link>
            <button
              type="button"
              onClick={onRetryRelatives}
              disabled={refreshing}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-500 px-3 text-sm font-medium text-gray-800 disabled:border-gray-300 disabled:text-gray-600"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Làm mới danh sách
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="block min-h-11 w-full border-t border-gray-200 px-4 py-2 font-medium text-gray-800"
          >
            Đóng, giữ lựa chọn hiện tại
          </button>
        </div>
      ) : (
        <button
          type="button"
          ref={toggleRef}
          aria-expanded="false"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-500 bg-white px-5 font-semibold text-gray-800"
        >
          <Users aria-hidden="true" className="size-4" />
          Chọn người thân khác
        </button>
      )}
    </section>
  );
}
