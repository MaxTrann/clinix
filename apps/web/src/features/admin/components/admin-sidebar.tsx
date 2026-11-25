import { NavLink, useLocation } from 'react-router';
import { ADMIN_NOTIFICATIONS_PATH } from '../../../shared/routes/notification-paths';
import {
  ADMIN_DEPOSIT_POLICY_PATH,
  ADMIN_WITHDRAWALS_PATH,
} from '../../../shared/routes/wallet-paths';
import { unreadBadgeText, unreadLabel } from '../../../shared/ui/unread-badge';
import { ROLE_HOME_PATHS, useAuth } from '../../auth';
import type { AdminMe } from '../admin-me';
import styles from './admin-layout.module.css';

type IconName =
  | 'overview'
  | 'appointments'
  | 'schedule'
  | 'approvals'
  | 'list'
  | 'staff'
  | 'chevron-right'
  | 'doctor'
  | 'specialty'
  | 'clinic'
  | 'wallet'
  | 'posts'
  | 'reviews'
  | 'deposit'
  | 'email'
  | 'audit'
  | 'surcharge'
  | 'settings'
  | 'notification'
  | 'profile';

const ICONS: Record<IconName, string> = {
  overview: '/assets/admin/overview.svg',
  appointments: '/assets/admin/appointments.svg',
  schedule: '/assets/admin/schedule.svg',
  approvals: '/assets/admin/approvals.svg',
  list: '/assets/admin/list.svg',
  staff: '/assets/admin/staff.svg',
  'chevron-right': '/assets/admin/chevron-right.svg',
  doctor: '/assets/admin/doctor.svg',
  specialty: '/assets/admin/specialty.svg',
  clinic: '/assets/admin/clinic.svg',
  wallet: '/assets/admin/wallet.svg',
  posts: '/assets/admin/posts.svg',
  reviews: '/assets/admin/reviews.svg',
  deposit: '/assets/admin/deposit.svg',
  email: '/assets/admin/email.svg',
  audit: '/assets/admin/audit.svg',
  surcharge: '/assets/admin/surcharge.svg',
  settings: '/assets/admin/settings.svg',
  notification: '/assets/admin/notification.svg',
  profile: '/assets/admin/profile.svg',
};

interface MenuItem {
  label: string;
  icon: IconName;
  to?: string;
  // Chỉ Admin Toàn hệ thống thấy mục này (Figma ẩn với Admin Chi nhánh)
  systemOnly?: boolean;
  // Đường dẫn khác `to` mà mục này vẫn sáng (các tab cùng một mục menu)
  alsoActiveFor?: string[];
  // notification F3: mục hiện số chưa đọc (chỉ "Thông báo")
  unreadBadge?: boolean;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    label: 'Vận hành',
    items: [
      {
        label: 'Lịch hẹn',
        icon: 'appointments',
        // booking F10; trang do module `booking` làm, ghi bằng chữ để không import chéo features/
        to: `${ROLE_HOME_PATHS.QuanTriVien}/lich-hen`,
      },
      {
        label: 'Lịch làm việc bác sĩ',
        icon: 'schedule',
        // doctor F6; trang do module `doctor` làm, ghi bằng chữ để không import chéo features/
        to: `${ROLE_HOME_PATHS.QuanTriVien}/lich-lam-viec-bac-si`,
      },
      {
        label: 'Duyệt yêu cầu',
        icon: 'approvals',
        // doctor F8; ghi bằng chữ để không import chéo features/
        to: `${ROLE_HOME_PATHS.QuanTriVien}/duyet-yeu-cau`,
      },
      { label: 'Danh sách chờ', icon: 'list' },
    ],
  },
  {
    label: 'Quản lý',
    items: [
      {
        label: 'Nhân sự & Tài khoản',
        icon: 'staff',
        // admin F8: đích là tab Nhân sự; tab Tài khoản bệnh nhân (admin F9) cũng làm mục này sáng
        to: `${ROLE_HOME_PATHS.QuanTriVien}/nhan-su`,
        alsoActiveFor: [`${ROLE_HOME_PATHS.QuanTriVien}/tai-khoan-benh-nhan`],
      },
      {
        label: 'Bác sĩ',
        icon: 'doctor',
        // admin F7: màn Quản lý hồ sơ bác sĩ
        to: `${ROLE_HOME_PATHS.QuanTriVien}/bac-si`,
      },
      {
        label: 'Chuyên khoa',
        icon: 'specialty',
        to: `${ROLE_HOME_PATHS.QuanTriVien}/chuyen-khoa`,
      },
      {
        label: 'Thông tin phòng khám',
        icon: 'clinic',
        to: `${ROLE_HOME_PATHS.QuanTriVien}/thong-tin-phong-kham`,
      },
      {
        label: 'Loại dịch vụ khám',
        icon: 'list',
        to: `${ROLE_HOME_PATHS.QuanTriVien}/dich-vu-kham`,
      },
    ],
  },
  {
    label: 'Tài chính',
    items: [
      // payment F7: màn Quản lý tài chính ví (chỉ Toàn hệ thống theo Q10: `systemOnly`, route cũng bọc AdminScopeGuard ToanHeThong)
      {
        label: 'Yêu cầu rút tiền',
        icon: 'wallet',
        systemOnly: true,
        to: ADMIN_WITHDRAWALS_PATH,
      },
    ],
  },
  {
    label: 'Nội dung',
    items: [
      { label: 'Bài viết', icon: 'posts' },
      {
        label: 'Kiểm duyệt đánh giá',
        icon: 'reviews',
        to: `${ROLE_HOME_PATHS.QuanTriVien}/kiem-duyet-danh-gia`,
      },
      // payment F5: màn Đặt cọc & Hoàn tiền (chỉ Toàn hệ thống: `systemOnly`, route cũng bọc AdminScopeGuard ToanHeThong)
      {
        label: 'Đặt cọc & Hoàn tiền',
        icon: 'deposit',
        systemOnly: true,
        to: ADMIN_DEPOSIT_POLICY_PATH,
      },
      { label: 'Email Preview', icon: 'email', systemOnly: true },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { label: 'Nhật ký hành động', icon: 'audit' },
      { label: 'Phụ phí bác sĩ', icon: 'surcharge', systemOnly: true },
      {
        label: 'Cài đặt hệ thống',
        icon: 'settings',
        systemOnly: true,
        // admin F5
        to: `${ROLE_HOME_PATHS.QuanTriVien}/cai-dat-he-thong`,
      },
    ],
  },
  {
    label: 'Tài khoản',
    items: [
      // notification F3: trang Thông báo dùng chung với ba khung kia (WTB-15)
      {
        label: 'Thông báo',
        icon: 'notification',
        to: ADMIN_NOTIFICATIONS_PATH,
        unreadBadge: true,
      },
      {
        label: 'Thông tin cá nhân',
        icon: 'profile',
        to: `${ROLE_HOME_PATHS.QuanTriVien}/thong-tin-ca-nhan`,
      },
    ],
  },
];

interface AdminSidebarProps {
  adminMe: AdminMe;
  onLogout: () => void;
  logoutPending: boolean;
  logoutFailed: boolean;
  // notification F3: số chưa đọc cho mục có `unreadBadge`; không truyền ⇒ không số
  unread?: number;
}

function SidebarIcon({ name }: { name: IconName }) {
  return <img className={styles.navIcon} src={ICONS[name]} alt="" />;
}

// `NavLink` chỉ biết `to` của chính nó: mục có nhiều tab sáng thêm ở các đường dẫn `alsoActiveFor` (và trang con của chúng)
const isAlsoActive = (item: MenuItem, pathname: string) =>
  (item.alsoActiveFor ?? []).some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

export function AdminSidebar({
  adminMe,
  onLogout,
  logoutPending,
  logoutFailed,
  unread,
}: AdminSidebarProps) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const subtitle =
    adminMe.phamVi === 'ToanHeThong'
      ? 'Quản trị viên'
      : `Quản trị viên · ${adminMe.chiNhanh.ten}`;
  const visibleGroups = MENU_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.systemOnly || adminMe.phamVi === 'ToanHeThong',
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <aside className={styles.sidebar} aria-label="Điều hướng Admin">
      <div className={styles.brand}>
        <span className={styles.brandMark}>
          <img src="/assets/admin/brand.svg" alt="" />
        </span>
        <span className={styles.brandName}>CLINIX</span>
      </div>

      <div className={styles.profileSection}>
        <div className={styles.profileCard}>
          <span className={styles.profileMark}>
            <img src="/assets/admin/profile-avatar.svg" alt="" />
          </span>
          <span className={styles.profileText}>
            <strong>{user?.hoTen ?? 'Quản trị viên'}</strong>
            <span title={subtitle}>{subtitle}</span>
          </span>
        </div>
      </div>

      <nav className={styles.navigation} aria-label="Điều hướng Admin">
        <NavLink
          to={ROLE_HOME_PATHS.QuanTriVien}
          end
          className={({ isActive }) =>
            `${styles.overviewLink} ${isActive ? styles.activeLink : ''}`
          }
          aria-label="Tổng quan"
        >
          <SidebarIcon name="overview" />
          <span>Tổng quan</span>
          <SidebarIcon name="chevron-right" />
        </NavLink>

        {visibleGroups.map((group) => (
          <section className={styles.menuGroup} key={group.label}>
            <h2 className={styles.groupLabel}>{group.label}</h2>
            <ul className={styles.menuList}>
              {group.items.map((item) => {
                const badge =
                  item.unreadBadge && unread !== undefined
                    ? unreadBadgeText(unread)
                    : null;
                return (
                  <li key={item.label}>
                    {item.to ? (
                      <NavLink
                        to={item.to}
                        // Có số: tên của liên kết là "Thông báo, N chưa đọc" như chuông; số hiển thị ẩn với trình đọc màn hình
                        aria-label={
                          badge !== null ? unreadLabel(unread ?? 0) : undefined
                        }
                        className={({ isActive }) =>
                          `${styles.menuItem} ${styles.menuItemLink} ${isActive || isAlsoActive(item, pathname) ? styles.activeLink : ''}`
                        }
                      >
                        <SidebarIcon name={item.icon} />
                        <span>{item.label}</span>
                        {badge !== null && (
                          <span aria-hidden="true" className={styles.menuBadge}>
                            {badge}
                          </span>
                        )}
                        <SidebarIcon name="chevron-right" />
                      </NavLink>
                    ) : (
                      <button
                        type="button"
                        className={styles.menuItem}
                        disabled
                        aria-disabled="true"
                        title="Chưa được triển khai"
                      >
                        <SidebarIcon name={item.icon} />
                        <span>{item.label}</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      <div className={styles.sidebarFooter}>
        {logoutFailed && (
          <p role="alert" className={styles.logoutError}>
            Không đăng xuất được, vui lòng thử lại.
          </p>
        )}
        <button
          type="button"
          className={styles.logoutButton}
          disabled={logoutPending}
          onClick={onLogout}
        >
          <img src="/assets/admin/logout.svg" alt="" />
          <span>{logoutPending ? 'Đang đăng xuất…' : 'Đăng xuất'}</span>
        </button>
      </div>
    </aside>
  );
}
