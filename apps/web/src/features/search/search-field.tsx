import { Search } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

// Ô tìm của các trang tra cứu theo Figma 217:67 (search F14, UIS-09): cao 45 px, bo 13,375 px, chữ 15 px,
// kính lúp 18,75 px cách mép trái 13,125 px (đệm trái 41,25 px). Nhãn do nơi dùng tự vẽ (ẩn hoặc hiện).
export function SearchField({
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3.5 top-3.5 size-5 text-gray-400"
        aria-hidden="true"
      />
      <input
        {...props}
        type="search"
        className={`h-12 w-full rounded-[13.375px] border border-gray-200 bg-white pl-[41.25px] pr-[15px] text-base ${className}`}
      />
    </div>
  );
}
