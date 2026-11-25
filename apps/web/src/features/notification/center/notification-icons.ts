import {
  Bell,
  Building2,
  Calendar,
  CalendarOff,
  RefreshCw,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationGroup } from '../api/notification-types';

// Biểu tượng theo nhóm sự kiện (notification F2, PLAN 5.10); mã lạ (`nhom: null`) dùng chuông.
export const GROUP_ICONS: Record<NotificationGroup | 'Khac', LucideIcon> = {
  LichHen: Calendar,
  DoiLich: RefreshCw,
  NghiPhep: CalendarOff,
  Vi: Wallet,
  ChiNhanh: Building2,
  Khac: Bell,
};
