import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { dayLabel } from '../branch-schedule-format';
import type { Capped } from '../branch-types';
import {
  EMAIL_STATUS_LABELS,
  dayViewText,
  humanDate,
  humanTime,
  impactReasonLabel,
  shiftLabel,
} from './change-request-format';
import type {
  ChangeRequestDetail,
  EmailDeliveryStatus,
  ServiceRef,
} from './change-request-types';
import { useChangeRequestDetail } from './use-change-requests';
import styles from './change-requests.module.css';

// Phần mở rộng "Chi tiết" của một yêu cầu thay đổi chi nhánh (admin F6b; CN b6, b9; Q2, Q9, Q46, Q48).
// Figma 546:2 mới vẽ khối "Hiện tại" cạnh nội dung đề xuất; các mục còn lại (mốc thời gian, lịch hẹn và ca bị ảnh hưởng, trạng thái thư)
// chưa có frame: ghép từ thành phần sẵn có, câu chữ [đề xuất] (D7, đối chiếu ở X1).

const EMAIL_STATUSES: EmailDeliveryStatus[] = [
  'ChoGui',
  'DaGui',
  'ThatBai',
  'BoQua',
];

function more<T>(list: Capped<T>): string | null {
  const rest = list.tong - list.items.length;
  return rest > 0 ? `… và ${rest} mục khác` : null;
}

function serviceNames(services: ServiceRef[]): string {
  return services
    .map((service) => service.ten ?? `Dịch vụ #${service.dichVuKhamId}`)
    .join(', ');
}

function Timeline({ detail }: { detail: ChangeRequestDetail }) {
  return (
    <dl className={styles.timeline}>
      <div>
        <dt>Gửi lúc</dt>
        <dd>{humanTime(detail.thoiDiemTao)}</dd>
      </div>
      {detail.thoiDiemDuyet && (
        <div>
          <dt>{detail.trangThai === 'TuChoi' ? 'Từ chối lúc' : 'Duyệt lúc'}</dt>
          <dd>
            {humanTime(detail.thoiDiemDuyet)}
            {detail.nguoiDuyet && ` bởi ${detail.nguoiDuyet.hoTen}`}
          </dd>
        </div>
      )}
      {detail.lyDoTuChoi && (
        <div>
          <dt>Lý do từ chối</dt>
          <dd>{detail.lyDoTuChoi}</dd>
        </div>
      )}
      {/* Hai nhãn bắt buộc của Q48 (CN-110): thời điểm DỰ KIẾN và lúc THỰC SỰ áp dụng */}
      {detail.hieuLucTu && (
        <div>
          <dt>Dự kiến có hiệu lực</dt>
          <dd>{humanTime(detail.hieuLucTu)}</dd>
        </div>
      )}
      {detail.trangThai === 'DaDuyet' && (
        <div>
          <dt>Đã áp dụng lúc</dt>
          <dd>
            {detail.apDungLuc ? humanTime(detail.apDungLuc) : 'Chưa áp dụng'}
          </dd>
        </div>
      )}
      {detail.quaHanLuc && (
        <div>
          <dt>Quá hạn lúc</dt>
          <dd>{humanTime(detail.quaHanLuc)}</dd>
        </div>
      )}
      {detail.soLanDoiHieuLuc > 0 && (
        <div>
          <dt>Đã dời hiệu lực</dt>
          <dd>{detail.soLanDoiHieuLuc} lần</dd>
        </div>
      )}
      {detail.thoiDiemHuy && (
        <div>
          <dt>Hủy lúc</dt>
          <dd>
            {humanTime(detail.thoiDiemHuy)}
            {detail.nguoiHuy && ` bởi ${detail.nguoiHuy.hoTen}`}
          </dd>
        </div>
      )}
      {detail.lyDoHuy && (
        <div>
          <dt>Lý do hủy</dt>
          <dd>{detail.lyDoHuy}</dd>
        </div>
      )}
      {detail.soNgayBaoTruoc !== null && (
        <div>
          <dt>Số ngày báo trước</dt>
          <dd>{detail.soNgayBaoTruoc} ngày</dd>
        </div>
      )}
    </dl>
  );
}

function ContentComparison({ detail }: { detail: ChangeRequestDetail }) {
  const { lichHoatDong, dichVu } = detail.noiDung;
  return (
    <div className={styles.comparison}>
      {lichHoatDong.length > 0 && (
        <table className={styles.compareTable}>
          <caption>Lịch hoạt động thay đổi</caption>
          <thead>
            <tr>
              <th scope="col">Thứ</th>
              <th scope="col">Hiện tại</th>
              <th scope="col">Đề xuất</th>
            </tr>
          </thead>
          <tbody>
            {lichHoatDong.map((day) => (
              <tr key={day.thuTrongTuan}>
                <th scope="row">{dayLabel(day.thuTrongTuan)}</th>
                <td>{dayViewText(day.truoc)}</td>
                <td className={styles.proposed}>{dayViewText(day.sau)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dichVu && (
        <div className={styles.serviceChanges}>
          {dichVu.them.length > 0 && (
            <p>
              <b>Thêm dịch vụ:</b> {serviceNames(dichVu.them)}
            </p>
          )}
          {dichVu.bo.length > 0 && (
            <p>
              <b>Bỏ dịch vụ:</b> {serviceNames(dichVu.bo)}
            </p>
          )}
        </div>
      )}
      {/* Q2: tên, địa chỉ, tọa độ không nằm trong yêu cầu vì đã lưu ngay lúc gửi */}
      <p className={styles.note}>
        Tên, địa chỉ và tọa độ (nếu có sửa) đã được lưu ngay khi gửi, không nằm
        trong yêu cầu này.
      </p>
    </div>
  );
}

function ImpactSection({ detail }: { detail: ChangeRequestDetail }) {
  const impact = detail.anhHuong;
  if (impact.nguon === 'KhongCo') return null;
  if (impact.nguon === 'KhongTinhDuoc')
    return (
      <p className={styles.note}>
        Yêu cầu lưu ở dạng cũ nên không tính được danh sách bị ảnh hưởng.
      </p>
    );
  const source =
    impact.nguon === 'BanChup'
      ? 'Danh sách chụp lúc duyệt.'
      : `Tính lại tại ${impact.moc ? humanTime(impact.moc) : 'thời điểm xem'}.`;
  const appointments = impact.lichHen;
  const shifts = impact.ca;
  // Quá hạn (Q48, CN-111): danh sách này là việc PHẢI xử lý trước khi dời hiệu lực, không chỉ để xem
  const heading =
    detail.quaHanLuc !== null && detail.apDungLuc === null
      ? 'Cần xử lý trước khi dời hiệu lực'
      : 'Bị ảnh hưởng';
  return (
    <section className={styles.impact} aria-label={heading}>
      <h4>{heading}</h4>
      <p className={styles.note}>{source}</p>
      {appointments && (
        <div>
          <h5>Lịch hẹn ({appointments.tong})</h5>
          {appointments.tong === 0 ? (
            <p className={styles.note}>Không có lịch hẹn bị ảnh hưởng.</p>
          ) : (
            <ul className={styles.impactList}>
              {appointments.items.map((item) => (
                <li key={item.lichHenId}>
                  <b>{item.maLichHen}</b> · {humanTime(item.thoiGian)} ·{' '}
                  {impactReasonLabel(item.lyDoAnhHuong)}
                </li>
              ))}
              {more(appointments) && <li>{more(appointments)}</li>}
            </ul>
          )}
        </div>
      )}
      {shifts && (
        <div>
          <h5>Ca làm việc ({shifts.tong})</h5>
          {shifts.tong === 0 ? (
            <p className={styles.note}>Không có ca làm việc bị ảnh hưởng.</p>
          ) : (
            <ul className={styles.impactList}>
              {shifts.items.map((item) => (
                <li key={item.lichLamViecId}>
                  {humanDate(item.ngay)} · {shiftLabel(item.ca)}
                </li>
              ))}
              {more(shifts) && <li>{more(shifts)}</li>}
            </ul>
          )}
        </div>
      )}
      {impact.khungGioTrong && impact.khungGioTrong.tong > 0 && (
        <p className={styles.note}>
          {impact.khungGioTrong.tong} khung giờ còn trống nằm ngoài lịch mới
          (bệnh nhân không đặt được, không cần xử lý).
        </p>
      )}
    </section>
  );
}

function NotificationSection({ detail }: { detail: ChangeRequestDetail }) {
  const { tongHop } = detail.thongBao;
  const total = EMAIL_STATUSES.reduce((sum, key) => sum + tongHop[key], 0);
  if (total === 0) return null;
  return (
    <section className={styles.mailStatus} aria-label="Thư thông báo">
      <h4>Thư thông báo</h4>
      <p>
        {EMAIL_STATUSES.filter((key) => tongHop[key] > 0)
          .map((key) => `${EMAIL_STATUS_LABELS[key]}: ${tongHop[key]}`)
          .join(' · ')}
      </p>
      {/* "Đã gửi" nghĩa là máy chủ thư đã nhận, không bảo đảm người nhận đã đọc (PLAN 5.4) */}
      {tongHop.ThatBai > 0 && (
        <p className={styles.mailFailed} role="alert">
          Có {tongHop.ThatBai} thư gửi thất bại. Hệ thống tự thử lại tối đa 3
          lần; nếu vẫn lỗi, hãy liên hệ bệnh nhân qua kênh khác.
        </p>
      )}
    </section>
  );
}

export function RequestDetail({
  id,
  refreshKey,
}: {
  id: string;
  refreshKey: number;
}) {
  const { state, retry } = useChangeRequestDetail(id, refreshKey);
  if (state.status === 'loading')
    return <LoadingState message="Đang tải chi tiết yêu cầu…" />;
  if (state.status === 'error')
    return <ErrorState error={state.error} onRetry={retry} />;
  const detail = state.data;
  return (
    <div className={styles.detail}>
      <Timeline detail={detail} />
      <ContentComparison detail={detail} />
      <ImpactSection detail={detail} />
      <NotificationSection detail={detail} />
    </div>
  );
}
