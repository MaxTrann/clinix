import type { ReactNode } from 'react';
import { CircleCheck, CircleX, Clock, FileText } from 'lucide-react';
import type { AdminLeaveStats } from '../../api/admin-leave-api';

interface CardProps {
  label: string;
  value: number;
  icon: ReactNode;
  tone: string;
}

function StatCard({ label, value, icon, tone }: CardProps) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <span
        aria-hidden="true"
        className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full ${tone}`}
      >
        {icon}
      </span>
      <p className="flex flex-col">
        <span className="text-xs text-gray-600">{label}</span>
        <span className="text-xl leading-tight font-bold text-gray-900">
          {value}
        </span>
        <span className="text-xs text-gray-500">yêu cầu</span>
      </p>
    </li>
  );
}

// Bốn thẻ thống kê (Figma `582:2`, `517:2`). Số lấy từ `thongKe` của server: cùng bộ lọc trừ trạng thái, nên không đổi khi bấm đổi trạng thái (PD-21).
export function LeaveStats({ stats }: { stats: AdminLeaveStats }) {
  return (
    <ul
      aria-label="Thống kê yêu cầu nghỉ phép"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <StatCard
        label="Chờ duyệt"
        value={stats.choDuyet}
        tone="bg-warning-soft text-warning"
        icon={<Clock className="size-5" />}
      />
      <StatCard
        label="Đã duyệt"
        value={stats.daDuyet}
        tone="bg-success-soft text-success"
        icon={<CircleCheck className="size-5" />}
      />
      <StatCard
        label="Từ chối"
        value={stats.tuChoi}
        tone="bg-danger-soft text-danger"
        icon={<CircleX className="size-5" />}
      />
      <StatCard
        label="Tổng yêu cầu"
        value={stats.tong}
        tone="bg-brand-soft text-brand-strong"
        icon={<FileText className="size-5" />}
      />
    </ul>
  );
}
