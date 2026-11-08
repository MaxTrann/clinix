import { Menu, X } from 'lucide-react';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useMediaQuery } from '../../../shared/hooks/use-media-query';
import { useModalDialog } from '../../../shared/hooks/use-modal-dialog';
import {
  NavEntry,
  PublicActions,
  PublicHeader,
  type PublicHeaderProps,
} from './public-header';

// Q19f/Q25: tái dùng token và hành vi modal của patient F11 cho trạng thái chưa có frame.
export function PublicShell({
  children,
  ...header
}: PublicHeaderProps & { children: ReactNode }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const location = useLocation();
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (openKey !== null && (wide || openKey !== location.key)) setOpenKey(null);
  const open = !wide && openKey === location.key;
  const close = useCallback(() => setOpenKey(null), []);
  const id = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useModalDialog({
    open,
    dialogRef: drawerRef,
    initialFocusRef: closeRef,
    returnFocusRef: triggerRef,
    onClose: close,
  });

  return (
    <>
      <div inert={open}>
        <PublicHeader
          {...header}
          menuButton={
            wide ? undefined : (
              <button
                ref={triggerRef}
                type="button"
                aria-label="Mở menu"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpenKey(location.key)}
                className="flex size-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-50"
              >
                <Menu className="size-5" aria-hidden="true" />
              </button>
            )
          }
        />
      </div>
      {!wide && open && (
        <>
          <div
            aria-hidden="true"
            onClick={close}
            className="fixed inset-0 z-40 bg-black/50"
          />
          <div
            ref={drawerRef}
            id={id}
            role="dialog"
            aria-modal="true"
            aria-label="Điều hướng công khai"
            className="fixed inset-y-0 right-0 z-50 w-80 max-w-[90vw] overflow-y-auto bg-white p-4 shadow-lg [&_#public-branch-picker]:static [&_#public-branch-picker]:w-full [&_#public-account-menu]:static [&_#public-account-menu]:min-w-0 [&_#public-service-menu]:static [&_#public-service-menu]:min-w-0"
            onClick={(event) => {
              // Đóng cả khi chọn lại liên kết của trang hiện tại; các nút chọn chi nhánh vẫn giữ ngăn kéo mở.
              if (
                event.target instanceof Element &&
                event.target.closest('a[href]')
              )
                close();
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="font-semibold text-gray-900">CLINIX</span>
              <button
                ref={closeRef}
                type="button"
                aria-label="Đóng menu"
                onClick={close}
                className="flex size-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-50"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <nav
              aria-label="Điều hướng chính"
              className="mb-4 flex flex-col items-start gap-1"
            >
              {header.navItems.map((item) => (
                <NavEntry
                  key={item.label}
                  item={item}
                  serviceGroups={header.serviceGroups}
                />
              ))}
            </nav>
            <PublicActions {...header} compact />
          </div>
        </>
      )}
      <div inert={open} className="flex flex-1 flex-col">
        {children}
      </div>
    </>
  );
}
