import { ArrowLeft, type LucideIcon } from 'lucide-react';
import type { MouseEvent, ReactNode, Ref } from 'react';
import { Link, type To } from 'react-router';
import { StatusChip } from './status-chip';

// Khung TRANG chi tiết lịch hẹn dùng chung cho bốn vai trò (booking F12, UI-12, UI-11; Đại 14/11/2026: thống nhất theo kiểu trang Bệnh nhân, Figma `420:2`): cùng khung căn giữa,
// cùng liên kết quay lại, cùng h1, cùng thẻ đầu, cùng lưới hai cột, cùng kiểu thẻ (`detail-card.tsx`). Mỗi vai trò chỉ khác NỘI DUNG và hành động. Chỉ giao diện: không gọi API, không biết vai trò.
// Đặt ở `appointments/common/` (trong `features/booking`): không phải sửa `shared/` hay `router/`. Giá trị theo gốc 15 px của `styles/index.css`: `max-w-[64rem]` = 960 px = khung của Figma `420:2`.

// Khung trang: quay lại, h1, chỗ `headerAside` (module `doctor` cắm nút `Hoàn thành ca khám`, `Ghi hồ sơ khám` ở đây) rồi nội dung `children`.
// Quay lại: `backRef` (trả tiêu điểm khi đóng hộp), `onBackClick` + `backDisabled` (Admin không rời trang khi đang gửi). `headingRef` làm h1 nhận tiêu điểm bằng mã (`tabIndex = -1`).
// Tách `props` thành biến riêng (không dùng `props.xxx`): quy tắc `react-hooks/refs` coi cả `props` là vật chứa ref khi có prop `headingRef`/`backRef` và báo lỗi mọi chỗ đọc `props.*`.
export function DetailPageFrame({
  backTo,
  backLabel,
  title,
  busy,
  headingRef,
  backRef,
  backDisabled,
  onBackClick,
  headerAside,
  children,
}: {
  backTo: To;
  backLabel: string;
  title: string;
  busy?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  backRef?: Ref<HTMLAnchorElement>;
  backDisabled?: boolean;
  onBackClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  headerAside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-busy={busy} className="mx-auto max-w-[64rem]">
      <Link
        ref={backRef}
        to={backTo}
        aria-disabled={backDisabled}
        onClick={onBackClick}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {backLabel}
      </Link>
      <div className="flex items-start justify-between gap-3">
        <h1
          ref={headingRef}
          tabIndex={headingRef === undefined ? undefined : -1}
          className="pt-2 text-2xl font-bold text-gray-900 outline-none"
        >
          {title}
        </h1>
        {headerAside}
      </div>
      {children}
    </section>
  );
}

export interface HeroCellData {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  // Dòng phụ nhỏ dưới giá trị (giờ, quan hệ, chuyên khoa...)
  note?: string;
}

function HeroCell({ icon: Icon, label, value, note }: HeroCellData) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft">
        <Icon aria-hidden="true" className="size-4 text-brand-strong" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-600">{label}</p>
        <p className="text-sm font-semibold break-words text-gray-900">
          {value}
        </p>
        {note !== undefined && (
          <p className="text-xs break-words text-gray-600">{note}</p>
        )}
      </div>
    </div>
  );
}

// Thẻ đầu của trang (Figma `420:2`): mã lịch chữ đơn cách, chip trạng thái, tiêu đề lớn và bốn ô `{ icon, label, value, note? }` (nhãn nhỏ, giá trị đậm). Vùng có tên `ariaLabel` để trình đọc màn hình và test tìm
// được. Bốn ô là bốn điều quan trọng nhất của vai trò đó (Bệnh nhân, Admin: Bác sĩ, Ngày khám, Chi nhánh, Người khám; Bác sĩ: Người khám, Ngày khám, Chuyên khoa, Chi nhánh).
export function DetailHero(props: {
  ariaLabel: string;
  code: string;
  status: string;
  title: string;
  cells: readonly HeroCellData[];
}) {
  return (
    <section
      aria-label={props.ariaLabel}
      className="rounded-2xl border border-gray-200 bg-white p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-mono text-xs tracking-wide text-gray-700">
          {props.code}
        </span>
        <StatusChip status={props.status} />
      </div>
      <h2 className="pt-3 text-2xl font-bold break-words text-gray-900">
        {props.title}
      </h2>
      <div className="mt-5 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        {props.cells.map((cell) => (
          <HeroCell key={cell.label} {...cell} />
        ))}
      </div>
    </section>
  );
}

// Lưới hai cột của thân trang (Figma `420:2`: 551 : 394 ⇒ 1,4 : 1), cột `main` (thẻ thông tin) và `side` (chi phí, trạng thái, hành động); dưới `lg` xếp một cột, `main` trước. `items-start` để hai cột
// không kéo dãn theo nhau.
export function DetailColumns(props: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-4">{props.main}</div>
      <div className="flex flex-col gap-4">{props.side}</div>
    </div>
  );
}
