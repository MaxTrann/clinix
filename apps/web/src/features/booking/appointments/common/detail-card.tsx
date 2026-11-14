import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// Khung thẻ và hàng "nhãn, giá trị" dùng chung cho các thẻ của trang chi tiết (booking F2; Figma `420:2`: thẻ trắng viền xám, đầu thẻ có biểu tượng và tiêu
// đề). MỘT chỗ để ba thẻ (thông tin, chi phí, hồ sơ khám) không lặp cấu trúc. Màu theo thang chuẩn của ADR 0004, không chép màu Figma lệch tương phản.
export function DetailCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <h2 className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-900">
        <Icon aria-hidden="true" className="size-4 text-gray-600" />
        {title}
      </h2>
      {children}
    </section>
  );
}

// Một dòng của danh sách định nghĩa: nhãn bên trái, giá trị căn phải (`note` là dòng phụ nhỏ dưới giá trị). Dòng cuối không kẻ chân.
export function DetailRow({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-gray-100 py-2.5 last:border-b-0">
      <dt className="shrink-0 text-sm text-gray-600">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium break-words text-gray-900">
        {children}
        {note !== undefined && (
          <span className="block text-xs font-normal text-gray-600">
            {note}
          </span>
        )}
      </dd>
    </div>
  );
}

// Một cặp "nhãn, giá trị" của thẻ chi tiết kiểu Figma `512:2`, `458:2` (nhãn nhỏ xám ở trên, giá trị đậm vừa ở dưới, hai cột): booking F10 viết trong `admin/detail/detail-sections.tsx`, chuyển lên `common/` ở F11
// (Quản trị viên và Bác sĩ cùng dùng). Màu chữ phụ theo thang chuẩn của ADR 0004 (`gray-600`), không chép `#6a7282` của Figma. `wide` chiếm cả hai cột (câu dài như lý do khám).
export function DetailFact(props: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  note?: string;
}) {
  return (
    <div className={props.wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs text-gray-600">{props.label}</dt>
      <dd className="pt-0.5 text-sm font-medium break-words text-gray-900">
        {props.children}
        {props.note !== undefined && (
          <span className="block text-xs font-normal text-gray-600">
            {props.note}
          </span>
        )}
      </dd>
    </div>
  );
}

export function DetailFacts({ children }: { children: ReactNode }) {
  return (
    <dl className="grid gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-2">
      {children}
    </dl>
  );
}
