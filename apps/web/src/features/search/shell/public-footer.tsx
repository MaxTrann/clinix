import { Mail, MapPin, Phone, Stethoscope } from 'lucide-react';
import { Link } from 'react-router';
import type { ClinicInfo, SpecialtySummary } from '../api/search-types';
import type { HoursGroup } from '../format/weekly-hours';
import { PUBLIC_CONTAINER } from '../layout';
import { NOT_IMPLEMENTED_TITLE, type PublicNavItem } from './public-nav-types';

export interface PublicFooterProps {
  links: PublicNavItem[];
  legalLinks: PublicNavItem[];
  // null = chưa có (đang tải hoặc API lỗi): chân trang vẫn hiện phần tĩnh, ẩn khối liên hệ (KC-05)
  clinicInfo: ClinicInfo | null;
  // Giờ nhận khám của chi nhánh đang chọn (Q19e); null = "Toàn quốc" hoặc chưa tải được ⇒ ẩn khối giờ
  hours?: { branchName: string; groups: HoursGroup[] } | null;
  // Cột "Chuyên khoa" (Figma 257:1057, 8 tên); rỗng (đang tải, lỗi, chưa có) ⇒ ẩn cột như khối liên hệ
  specialties?: Pick<SpecialtySummary, 'chuyenKhoaId' | 'ten'>[];
}

// Số chuyên khoa ở cột "Chuyên khoa" của chân trang (Figma 257:1060 có 8 tên)
export const FOOTER_SPECIALTY_COUNT = 8;

// Chữ xám nhạt của Figma (#6a7282 / #99a1af) trên nền #101828 vẫn đạt 4,5:1 trở lên nên giữ nguyên; liên kết dùng gray-300.
const LINK_CLASS = 'text-sm text-gray-300 hover:text-white';
// Các `ul` liên kết cũng đặt `text-sm`: dòng của `li` lấy cỡ chữ gốc 15 px (cao 22,5 px) nếu chỉ `a` nhỏ hơn;
// Figma 257:1038 mỗi dòng cao 19 px, cách nhau 7,5 px (đo 1440 px: dòng 22,5 px làm cột cao hơn 3,75 px mỗi mục).

function FooterLink({ item }: { item: PublicNavItem }) {
  if (!item.to) {
    return (
      <span title={NOT_IMPLEMENTED_TITLE} className="text-sm text-gray-400">
        {item.label}
        <span className="sr-only"> (chưa được triển khai)</span>
      </span>
    );
  }
  return (
    <Link to={item.to} className={LINK_CLASS}>
      {item.label}
    </Link>
  );
}

interface ContactRow {
  icon: typeof Phone;
  text: string;
}

function contactRows(info: ClinicInfo | null): ContactRow[] {
  if (!info) return [];
  // Trường null hoặc rỗng ⇒ ẩn dòng (không hiện chữ giữ chỗ)
  const rows: ContactRow[] = [];
  if (info.diaChiTruSo) rows.push({ icon: MapPin, text: info.diaChiTruSo });
  if (info.duongDayNong) rows.push({ icon: Phone, text: info.duongDayNong });
  if (info.email) rows.push({ icon: Mail, text: info.email });
  return rows;
}

export function PublicFooter({
  links,
  legalLinks,
  clinicInfo,
  hours = null,
  specialties = [],
}: PublicFooterProps) {
  const rows = contactRows(clinicInfo);
  const brandName = clinicInfo?.tenThuongHieu || 'CLINIX';
  return (
    <footer className="bg-gray-900 text-white">
      <div className={`${PUBLIC_CONTAINER} py-12`}>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-[0.625rem] bg-brand">
                <Stethoscope className="size-5 text-white" aria-hidden="true" />
              </span>
              <span className="text-xl font-semibold">{brandName}</span>
            </div>
            <p className="pt-4 text-sm leading-relaxed text-gray-400">
              Phòng khám đa khoa CLINIX — Nơi bạn tin tưởng đặt lịch khám trực
              tuyến nhanh chóng, tiết kiệm thời gian.
            </p>
          </div>

          <nav aria-label="Liên kết nhanh">
            <h2 className="text-base font-medium">Liên kết nhanh</h2>
            <ul className="space-y-2 pt-4 text-sm">
              {links.map((item) => (
                <li key={item.label}>
                  <FooterLink item={item} />
                </li>
              ))}
            </ul>
          </nav>

          {specialties.length > 0 && (
            <section aria-labelledby="footer-specialties">
              <h2 id="footer-specialties" className="text-base font-medium">
                Chuyên khoa
              </h2>
              <ul className="space-y-2 pt-4 text-sm">
                {specialties.map((item) => (
                  <li key={item.chuyenKhoaId}>
                    <Link
                      to={`/chuyen-khoa/${encodeURIComponent(item.chuyenKhoaId)}`}
                      className={LINK_CLASS}
                    >
                      {item.ten}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(rows.length > 0 || hours) && (
            <div className="space-y-6">
              {rows.length > 0 && (
                <section aria-labelledby="footer-contact">
                  <h2 id="footer-contact" className="text-base font-medium">
                    Thông tin liên hệ
                  </h2>
                  <ul className="space-y-3 pt-4">
                    {rows.map(({ icon: Icon, text }) => (
                      <li key={text} className="flex items-start gap-3">
                        <Icon
                          className="mt-0.5 size-4 shrink-0 text-cyan-400"
                          aria-hidden="true"
                        />
                        <span className="text-sm text-gray-300">{text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {hours && (
                <section aria-labelledby="footer-hours">
                  <h2 id="footer-hours" className="text-base font-medium">
                    Giờ nhận khám
                  </h2>
                  <p className="pt-1 text-xs text-gray-400">
                    {hours.branchName}
                  </p>
                  <ul className="space-y-2 pt-3">
                    {hours.groups.map((group) => (
                      <li
                        key={group.label}
                        className="flex justify-between gap-4 text-sm text-gray-300"
                      >
                        <span>{group.label}</span>
                        <span>{group.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-gray-700 pt-6">
          <p className="text-sm text-gray-400">
            © 2026 CLINIX Clinic. Bảo lưu mọi quyền.
          </p>
          <ul className="flex gap-4 text-sm">
            {legalLinks.map((item) => (
              <li key={item.label}>
                <FooterLink item={item} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
