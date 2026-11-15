import type { AffectedAppointments } from '../../api/admin-leave-api';
import { formatAppointmentTime, formatDeposit } from './approvals-format';

const STATE_LABELS = {
  ChoThanhToan: 'Chờ thanh toán',
  DaXacNhan: 'Đã xác nhận',
} as const;

// Mục "Lịch hẹn bị ảnh hưởng (N)" của ngăn kéo (Q32; Figma `583:2` chỉ vẽ N = 0). Server trả tối đa 20 lịch đầu theo giờ hẹn; `tong` là số thật,
// `conNua` báo còn lịch chưa liệt kê. Không in SĐT/email/lý do khám vì server không trả (PD-20).
export function AffectedAppointmentsList({
  data,
}: {
  data: AffectedAppointments;
}) {
  return (
    <section
      aria-label="Lịch hẹn bị ảnh hưởng"
      className="flex flex-col gap-2 border-t border-gray-100 pt-4"
    >
      <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
        Lịch hẹn bị ảnh hưởng ({data.tong})
      </h3>
      {data.tong === 0 ? (
        <p className="text-sm text-gray-500">Không có lịch hẹn bị ảnh hưởng.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-gray-100 rounded-lg border border-gray-100">
            {data.items.map((appointment) => (
              <li
                key={appointment.maLichHen}
                className="flex flex-col gap-0.5 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-900">
                    {appointment.maLichHen}
                  </span>
                  <span className="text-xs text-gray-500">
                    {STATE_LABELS[appointment.trangThai]}
                  </span>
                </div>
                <span className="text-gray-700">
                  {appointment.nguoiKham.hoTen}
                </span>
                <span className="text-xs text-gray-500">
                  {formatAppointmentTime(appointment.thoiGian)} · Cọc:{' '}
                  {formatDeposit(appointment.tienCocSnapshot)}
                </span>
              </li>
            ))}
          </ul>
          {data.conNua && (
            <p className="text-xs text-gray-500">
              Còn {data.tong - data.items.length} lịch hẹn khác chưa hiển thị.
            </p>
          )}
        </>
      )}
    </section>
  );
}
