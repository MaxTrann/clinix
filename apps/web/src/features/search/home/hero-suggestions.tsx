import { Link } from 'react-router';
import type { ServiceGroupItem } from '../api/search-types';
import { serviceListPath } from '../search-paths';

// Figma 257:81, 257:83, 257:85: ba chip "Khám theo chuyên khoa", "Khám tổng quát", "Chuyên khoa". Hai chip đầu trùng tên hai thẻ nhóm dịch vụ
// ngay dưới hero nên lấy từ HAI nhóm đầu đang cung cấp (chữ chip là tên nhóm trong DB, có thể khác Figma); chip thứ ba là tĩnh.
// Chip giữ viền trắng đặc, không dùng nền trắng 15% của Figma: chữ trên nền đó chỉ đạt 3,85:1 (TRACKING search 6.3 CL-04).
export const HERO_GROUP_CHIPS = 2;
const CHIP_CLASS =
  'rounded-full border border-white px-3 py-1.5 hover:underline';

export function HeroSuggestions({ groups }: { groups: ServiceGroupItem[] }) {
  const offered = groups
    .filter((group) => !group.sapTrienKhai)
    .slice(0, HERO_GROUP_CHIPS);
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
      <span>Gợi ý:</span>
      {offered.map((group) => (
        <Link
          key={group.nhomDichVuId}
          to={serviceListPath(group.nhomDichVuId)}
          className={CHIP_CLASS}
        >
          {group.ten}
        </Link>
      ))}
      <Link to="/chuyen-khoa" className={CHIP_CLASS}>
        Chuyên khoa
      </Link>
    </div>
  );
}
