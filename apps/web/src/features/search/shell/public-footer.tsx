import { Mail, MapPin, Phone, Stethoscope } from 'lucide-react';
import { Link } from 'react-router';
import type { ClinicInfo } from '../api/search-types';
import type { HoursGroup } from '../format/weekly-hours';
import { NOT_IMPLEMENTED_TITLE, type PublicNavItem } from './public-nav-types';

export interface PublicFooterProps {
  links: PublicNavItem[];
  legalLinks: PublicNavItem[];
  // null = chưa có (đang tải hoặc API lỗi): chân trang vẫn hiện phần tĩnh, ẩn khối liên hệ (KC-05)
  clinicInfo: ClinicInfo | null;
  // Giờ nhận khám của chi nhánh đang chọn (Q19e); null = "Toàn quốc" hoặc chưa tải được ⇒ ẩn khối giờ
  hours?: { branchName: string; groups: HoursGroup[] } | null;
}

// Chữ xám nhạt của Figma (#6a7282 / #99a1af) trên nền #101828 vẫn đạt 4,5:1 trở lên nên giữ nguyên; liên kết dùng gray-300.
const LINK_CLASS = 'text-sm text-gray-300 hover:text-white';

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
}: PublicFooterProps) {
  const rows = contactRows(clinicInfo);
  const brandName = clinicInfo?.tenThuongHieu || 'CLINIX';
  return (
    <footer className="bg-gray-900 text-white">
      <div className="mx-auto max-w-300 px-7.5 py-11">
        <div className="grid gap-7.5 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-7.5 items-center justify-center rounded-[0.625rem] bg-brand">
                <Stethoscope
                  className="size-4.5 text-white"
                  aria-hidden="true"
                />
              </span>
              <span className="text-lg font-semibold">{brandName}</span>
            </div>
            <p className="pt-4 text-sm leading-relaxed text-gray-400">
              Phòng khám đa khoa CLINIX — Nơi bạn tin tưởng đặt lịch khám trực
              tuyến nhanh chóng, tiết kiệm thời gian.
            </p>
          </div>

          <nav aria-label="Liên kết nhanh">
            <h2 className="text-base font-medium">Liên kết nhanh</h2>
            <ul className="space-y-2 pt-4">
              {links.map((item) => (
                <li key={item.label}>
                  <FooterLink item={item} />
                </li>
              ))}
            </ul>
          </nav>

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

        <div className="mt-7.5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-700 pt-5.5">
          <p className="text-sm text-gray-400">
            © 2026 CLINIX Clinic. Bảo lưu mọi quyền.
          </p>
          <ul className="flex gap-4">
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
