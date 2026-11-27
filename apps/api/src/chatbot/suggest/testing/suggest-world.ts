import type { DataSource } from 'typeorm';
import type { BacSi } from '../../../admin/entities/bac-si.entity.js';
import type { ChiNhanh } from '../../../admin/entities/chi-nhanh.entity.js';
import { SystemConfigRepository } from '../../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../../admin/system-config/system-config.service.js';
import { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import type { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import { ExamFixtures } from '../../../doctor/examination/testing/exam-fixtures.js';
import { ExamPriceReader } from '../../../pricing/exam-price.reader.js';
import { BranchHoursReader } from '../../../scheduling/branch-hours/branch-hours.reader.js';
import { LeaveReader } from '../../../scheduling/leave/leave.reader.js';
import { AvailableSlotsReader } from '../../../scheduling/slots/available-slots.reader.js';
import { PublicDoctorRepository } from '../../../search/doctors/public-doctor.repository.js';
import { PublicDoctorService } from '../../../search/doctors/public-doctor.service.js';
import { DoctorRatingReader } from '../../../search/ratings/doctor-rating.reader.js';
import { SlotFixtures } from '../../../search/testing/slot-fixtures.js';
import { DoctorDegreeRepository } from '../doctor-degree.repository.js';
import { SuggestionRepository } from '../suggestion.repository.js';
import { SuggestionService } from '../suggestion.service.js';

// Hạ tầng cho TEST TÍCH HỢP của chatbot B4 (MySQL thật, DB `*_test`): dựng đúng các lớp thật nối với nhau như `ChatbotModule`, cộng các hàm gieo dữ liệu nhỏ.
// Dữ liệu tổng hợp, không dữ liệu thật. Chỉ test dùng; không nằm trong luồng chạy. Mọi giá trị mong đợi do test viết tay (không tính lại công thức ở đây).

/** Ngày đánh giá đã qua: các lịch `HoanThanh` dựng cho đánh giá nằm ở đây, xa cửa sổ 7 ngày của test. */
const PAST_DAY = '2026-09-01';

export interface Catalog {
  chuyenKhoaId: string;
  ten: string;
  dichVuKhamId: string;
}

export function buildSuggestionService(db: DataSource) {
  const prices = new ExamPriceReader(db);
  const slots = new AvailableSlotsReader(
    db,
    new BranchHoursReader(),
    new LeaveReader(),
  );
  const repository = new SuggestionRepository(db);
  const degrees = new DoctorDegreeRepository();
  const service = new SuggestionService(
    db,
    new PublicDoctorService(
      new PublicDoctorRepository(db, prices),
      prices,
      new DoctorRatingReader(db),
    ),
    slots,
    new SystemConfigService(new SystemConfigRepository(db)),
    repository,
    degrees,
  );
  return { service, repository, degrees, slots };
}

export class SuggestFixtures {
  readonly booking: BookingFixtures;
  readonly slots: SlotFixtures;
  readonly exam: ExamFixtures;

  constructor(private readonly db: DataSource) {
    this.booking = new BookingFixtures(db);
    this.slots = new SlotFixtures(db);
    this.exam = new ExamFixtures(db);
  }

  /** Một chuyên khoa và một dịch vụ để nhiều bác sĩ DÙNG CHUNG (mỗi lần `AdminFixtures.doctor` tự tạo một cặp riêng). */
  async catalog(): Promise<Catalog> {
    const { specialty, service } = await this.booking.admin.catalog();
    return {
      chuyenKhoaId: specialty.chuyenKhoaId,
      ten: specialty.ten,
      dichVuKhamId: service.dichVuKhamId,
    };
  }

  /** Chi nhánh có lịch đủ 7 thứ (08–12, 13–17). */
  branch(): Promise<ChiNhanh> {
    return this.slots.branch();
  }

  /** Bác sĩ CÔNG KHAI thuộc `catalog` ở `branch`; thêm liên kết chi nhánh–dịch vụ vì `AdminFixtures.doctor` chỉ liên kết dịch vụ riêng của nó. */
  async doctor(
    branch: ChiNhanh,
    catalog: Catalog,
    over: Partial<BacSi> = {},
    account: Partial<TaiKhoan> = {},
  ) {
    const made = await this.slots.search.publicDoctor(
      branch,
      {
        chuyenKhoaId: catalog.chuyenKhoaId,
        dichVuKhamId: catalog.dichVuKhamId,
        ...over,
      },
      account,
    );
    await this.db.query(
      'INSERT IGNORE INTO chi_nhanh_dich_vu_kham (chi_nhanh_id, dich_vu_kham_id) VALUES (?, ?)',
      [branch.chiNhanhId, catalog.dichVuKhamId],
    );
    return made;
  }

  /** Mở các ca của một bác sĩ trong một ngày (mặc định ca sáng: 8 ô 30 phút từ 08:00); trả id ô theo thứ tự ca rồi giờ. */
  openDay(
    doctor: Awaited<ReturnType<SuggestFixtures['doctor']>>,
    ngay: string,
    cas: readonly ('CaSang' | 'CaChieu')[] = ['CaSang'],
  ): Promise<string[]> {
    return this.slots.addShifts(doctor, ngay, cas);
  }

  /**
   * Gieo đánh giá cho một bác sĩ: mỗi đánh giá là một lịch `HoanThanh` (ngày đã qua) kèm một dòng `danh_gia_bac_si`. `stars` hiển thị, `hiddenStars` đã ẩn.
   * Tối đa 8 đánh giá mỗi bác sĩ (một ca sáng có 8 ô; `UNIQUE (bac_si_id, ngay, ca)`).
   */
  async rate(
    doctor: Awaited<ReturnType<SuggestFixtures['doctor']>>,
    stars: readonly number[],
    hiddenStars: readonly number[] = [],
  ): Promise<void> {
    const total = stars.length + hiddenStars.length;
    if (total === 0) return;
    if (total > 8) throw new Error('Một bác sĩ chỉ gieo tối đa 8 đánh giá');
    // Bệnh nhân MỚI mỗi lần gieo: `resetTables` xoá sạch bệnh nhân giữa hai ca nên không giữ id qua các ca (lần đầu chạy đã vướng khoá ngoại vì giữ id cũ)
    const patientId = (await this.booking.admin.patient()).account.taiKhoanId;
    const { slotIds } = await this.booking.doctor.shiftWithSlots(
      doctor.profile,
      { ngay: PAST_DAY, ca: 'CaSang' },
    );
    const all = [
      ...stars.map((soSao) => ({ soSao, hidden: false })),
      ...hiddenStars.map((soSao) => ({ soSao, hidden: true })),
    ];
    for (const [index, { soSao, hidden }] of all.entries()) {
      const lich = await this.booking.appointmentIn('HoanThanh', {
        doctor: doctor.profile,
        khungGioId: slotIds[index] ?? '',
        patientId,
        hoSoNguoiThanId: null,
      });
      await this.exam.rating(lich.lichHenId, {
        soSao,
        biAn: hidden,
        lyDoAn: hidden ? 'Nội dung không phù hợp' : null,
      });
    }
  }

  /** Đổi trạng thái một ô bằng SQL (đúng hai cột mà booking đổi). `giuChoDen` dạng 'YYYY-MM-DD HH:MM:SS' giờ VN. */
  setSlot(
    khungGioId: string,
    trangThai: string,
    giuChoDen: string | null = null,
  ) {
    return this.db.query(
      'UPDATE khung_gio SET trang_thai = ?, giu_cho_den = ? WHERE khung_gio_id = ?',
      [trangThai, giuChoDen, khungGioId],
    );
  }

  /** Chi nhánh nghỉ MỘT thứ (chk_lich_hoat_dong_ngay: ngày nghỉ thì bốn cột giờ phải trống). */
  closeWeekday(chiNhanhId: string, thu: number) {
    return this.db.query(
      `UPDATE chi_nhanh_lich_hoat_dong
          SET hoat_dong = 0, gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL, gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL
        WHERE chi_nhanh_id = ? AND thu_trong_tuan = ?`,
      [chiNhanhId, thu],
    );
  }

  /** Số dòng của các bảng mà đọc gợi ý KHÔNG được đụng, cộng số ô theo trạng thái (đổi trạng thái ô cũng là ghi). */
  async untouched(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const table of [
      'khung_gio',
      'lich_hen',
      'danh_gia_bac_si',
      'thong_bao',
      'email_thong_bao',
      'nhat_ky_hanh_dong',
      'cau_hinh_he_thong',
      'bac_si',
    ]) {
      const rows = await this.db.query<{ n: string }[]>(
        `SELECT COUNT(*) AS n FROM ${table}`,
      );
      out[table] = String(rows[0]?.n);
    }
    const states = await this.db.query<{ trang_thai: string; n: string }[]>(
      'SELECT trang_thai, COUNT(*) AS n FROM khung_gio GROUP BY trang_thai ORDER BY trang_thai',
    );
    out.khung_gio_theo_trang_thai = states
      .map((row) => `${row.trang_thai}=${row.n}`)
      .join(',');
    return out;
  }
}
