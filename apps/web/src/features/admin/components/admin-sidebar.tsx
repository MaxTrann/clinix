import { NavLink } from 'react-router';
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
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    label: 'Vận hành',
    items: [
      { label: 'Lịch hẹn', icon: 'appointments' },
      { label: 'Lịch làm việc bác sĩ', icon: 'schedule' },
      { label: 'Duyệt yêu cầu', icon: 'approvals' },
      { label: 'Danh sách chờ', icon: 'list' },
    ],
  },
  {
    label: 'Quản lý',
    items: [
      { label: 'Nhân sự & Tài khoản', icon: 'staff' },
      { label: 'Bác sĩ', icon: 'doctor' },
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
    items: [{ label: 'Yêu cầu rút tiền', icon: 'wallet' }],
  },
  {
    label: 'Nội dung',
    items: [
      { label: 'Bài viết', icon: 'posts' },
      { label: 'Kiểm duyệt đánh giá', icon: 'reviews' },
      { label: 'Đặt cọc & Hoàn tiền', icon: 'deposit', systemOnly: true },
      { label: 'Email Preview', icon: 'email', systemOnly: true },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { label: 'Nhật ký hành động', icon: 'audit' },
      { label: 'Phụ phí bác sĩ', icon: 'surcharge', systemOnly: true },
      { label: 'Cài đặt hệ thống', icon: 'settings', systemOnly: true },
    ],
  },
  {
    label: 'Tài khoản',
    items: [
      { label: 'Thông báo', icon: 'notification' },
      { label: 'Thông tin cá nhân', icon: 'profile' },
    ],
  },
];

interface AdminSidebarProps {
  adminMe: AdminMe;
  onLogout: () => void;
  logoutPending: boolean;
  logoutFailed: boolean;
}

function SidebarIcon({ name }: { name: IconName }) {
  return <img className={styles.navIcon} src={ICONS[name]} alt="" />;
}

export function AdminSidebar({
  adminMe,
  onLogout,
  logoutPending,
  logoutFailed,
}: AdminSidebarProps) {
  const { user } = useAuth();
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
              {group.items.map((item) => (
                <li key={item.label}>
                  {item.to ? (
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `${styles.menuItem} ${styles.menuItemLink} ${isActive ? styles.activeLink : ''}`
                      }
                    >
                      <SidebarIcon name={item.icon} />
                      <span>{item.label}</span>
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
              ))}
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
