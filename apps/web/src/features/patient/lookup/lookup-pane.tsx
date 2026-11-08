import { CircleX, Search, User } from 'lucide-react';
import { LOOKUP_TEXT } from './lookup-messages';

export type LookupPaneKind = 'idle' | 'not-found' | 'select';

// Trạng thái giữa cột của trang tra cứu (patient F8; Figma `483:2`, `505:2`). Số đo Figma (gốc 15 px): cột trái vòng tròn 52,5 và biểu
// tượng 22,5, cách chữ 11,25, đệm 22,5 và 60; cột phải vòng tròn 60 và biểu tượng 26,25, cách chữ 15, đệm 22,5 và 75.
// Màu chữ: Figma `#99a1af` chỉ 2,60:1 trên trắng ⇒ gray-500 (4,84:1 trên trắng, 4,63:1 trên nền trang gray-50).
const CIRCLE =
  'flex shrink-0 items-center justify-center rounded-full bg-gray-100';

export function LookupPane({ kind }: { kind: LookupPaneKind }) {
  if (kind === 'select') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-[1rem] px-[1.5rem] py-[5rem] text-center">
        <span aria-hidden="true" className={`${CIRCLE} size-[4rem]`}>
          <User className="size-[1.75rem] text-gray-500" />
        </span>
        <p className="text-sm text-gray-500">{LOOKUP_TEXT.selectPrompt}</p>
      </div>
    );
  }

  if (kind === 'not-found') {
    // role="status": người dùng đọc màn hình nghe được "không tìm thấy" mà không phải đi tìm
    return (
      <div
        role="status"
        className="flex flex-1 flex-col items-center justify-center gap-[0.75rem] px-[1.5rem] py-[4rem] text-center"
      >
        <span aria-hidden="true" className={`${CIRCLE} size-[3.5rem]`}>
          <CircleX className="size-[1.5rem] text-gray-500" />
        </span>
        <div>
          <p className="text-sm font-medium text-gray-700">
            {LOOKUP_TEXT.notFoundTitle}
          </p>
          <p className="pt-[0.25rem] text-xs text-gray-500">
            {LOOKUP_TEXT.notFoundHint}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[0.75rem] px-[1.5rem] py-[4rem] text-center">
      <span aria-hidden="true" className={`${CIRCLE} size-[3.5rem]`}>
        <Search className="size-[1.5rem] text-gray-500" />
      </span>
      {/* Figma ngắt hai dòng ở "số điện thoại / hoặc email": hộp hẹp và text-balance cho cùng kết quả mà không ép xuống dòng */}
      <p className="max-w-[10.5rem] text-sm leading-relaxed text-balance text-gray-500">
        {LOOKUP_TEXT.idleTitle}
      </p>
    </div>
  );
}
