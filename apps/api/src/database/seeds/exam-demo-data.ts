import { DEMO_DOCTORS } from './search-demo-data.js';
import { DEV_DOCTOR_EMAIL } from './doctor-demo-data.js';

// Dữ liệu mẫu cho phần khám bệnh (doctor-exam B10, Q25). Toàn bộ là minh họa [đề xuất]: tên, email, SĐT, câu chữ và số lượng đều do AI soạn để
// Đại kiểm tay F2 đến F7, KHÔNG phải quyết định nghiệp vụ; câu chữ chỉ là câu mẫu, không có nội dung y tế thật.

/** Tài khoản bệnh nhân của `dev-accounts` (đã có sẵn, seed này không tạo). */
export const DEV_PATIENT_EMAIL = 'patient@example.invalid';

export interface ExamDemoPatient {
  email: string;
  name: string;
  phone: string;
}

// Email dùng miền `example.invalid` như `dev-accounts` (không email thật). Tên có dấu, một tên dài 85 ký tự.
export const EXAM_DEMO_PATIENTS: readonly ExamDemoPatient[] = [
  {
    email: 'benhnhan01@example.invalid',
    name: 'Nguyễn Thị Ánh Tuyết',
    phone: '0900000201',
  },
  {
    email: 'benhnhan02@example.invalid',
    name: 'Trần Đình Quốc Khánh',
    phone: '0900000202',
  },
  {
    email: 'benhnhan03@example.invalid',
    name: 'Lê Hoàng Phương Thảo',
    phone: '0900000203',
  },
  {
    email: 'benhnhan04@example.invalid',
    name: 'Phạm Nguyễn Hoàng Thiên Phúc',
    phone: '0900000204',
  },
  {
    email: 'benhnhan05@example.invalid',
    name: 'Võ Thị Ngọc Diễm Quỳnh',
    phone: '0900000205',
  },
  {
    email: 'benhnhan06@example.invalid',
    name: 'Nguyễn Hoàng Thiên Ân Phương Anh Khôi Nguyên Bảo Trân Minh Châu Gia Huy Trúc Linh Đan',
    phone: '0900000206',
  },
];

export interface ExamDemoRelative {
  hoTen: string;
  moiQuanHe: 'Cha' | 'Me' | 'OngBa';
  gioiTinh: 'Nam' | 'Nu';
  ngaySinh: string;
  /** `false` = hồ sơ ngừng dùng (để thử lọc người khám gồm hồ sơ ngừng: Q18). */
  active: boolean;
}

/** Ba hồ sơ người thân của `patient@example.invalid` (`dev-accounts` không tạo hồ sơ người thân nào). */
export const EXAM_DEMO_RELATIVES: readonly ExamDemoRelative[] = [
  {
    hoTen: 'Nguyễn Văn Bình',
    moiQuanHe: 'Cha',
    gioiTinh: 'Nam',
    ngaySinh: '1958-04-12',
    active: true,
  },
  {
    hoTen: 'Trần Thị Mỹ Hạnh',
    moiQuanHe: 'Me',
    gioiTinh: 'Nu',
    ngaySinh: '1960-09-03',
    active: true,
  },
  {
    hoTen: 'Lê Thị Cúc',
    moiQuanHe: 'OngBa',
    gioiTinh: 'Nu',
    ngaySinh: '1942-01-20',
    active: false,
  },
];

const RELATIVE_FATHER = EXAM_DEMO_RELATIVES[0]!.hoTen;
const RELATIVE_MOTHER = EXAM_DEMO_RELATIVES[1]!.hoTen;
const RELATIVE_STOPPED = EXAM_DEMO_RELATIVES[2]!.hoTen;

export interface ExamDemoRecordText {
  trieuChung: string;
  chanDoanSoBo: string;
  huongXuLy: string;
}

// Năm bộ chữ hồ sơ xoay vòng; hai bộ nhiều dòng. Mỗi trường 1 đến 2.000 đơn vị UTF-16 (quy tắc 5.2).
export const EXAM_DEMO_RECORDS: readonly ExamDemoRecordText[] = [
  {
    trieuChung: 'Ho khan và sốt nhẹ trong hai ngày (dữ liệu minh họa).',
    chanDoanSoBo: 'Viêm họng cấp (mẫu).',
    huongXuLy: 'Uống đủ nước, nghỉ ngơi và theo dõi nhiệt độ.',
  },
  {
    trieuChung:
      'Đau đầu âm ỉ vùng trán.\nMất ngủ ba đêm liên tiếp (dữ liệu minh họa).',
    chanDoanSoBo: 'Rối loạn giấc ngủ (mẫu).',
    huongXuLy:
      '1. Giữ giờ ngủ cố định.\n2. Hạn chế đồ uống có caffeine buổi chiều.\n3. Tái khám nếu chưa cải thiện.',
  },
  {
    trieuChung: 'Đau thượng vị sau bữa ăn, ợ chua (dữ liệu minh họa).',
    chanDoanSoBo: 'Rối loạn tiêu hóa chức năng (mẫu).',
    huongXuLy: 'Chia nhỏ bữa ăn, tránh đồ cay; tái khám sau hai tuần.',
  },
  {
    trieuChung:
      'Đau mỏi cột sống thắt lưng khi ngồi lâu.\nTê nhẹ hai chân buổi sáng (dữ liệu minh họa).',
    chanDoanSoBo: 'Thoái hóa cột sống thắt lưng (mẫu).',
    huongXuLy:
      'Vận động nhẹ mỗi ngày.\nTránh mang vác nặng.\nTheo dõi triệu chứng và tái khám khi cần.',
  },
  {
    trieuChung: 'Chóng mặt thoáng qua khi đứng dậy nhanh (dữ liệu minh họa).',
    chanDoanSoBo: 'Hạ huyết áp tư thế (mẫu).',
    huongXuLy: 'Đứng dậy từ từ, uống đủ nước, đo huyết áp tại nhà.',
  },
];

/** Ngày tái khám dự kiến = ngày khám + 14 ngày (nằm trong khoảng 5.2: từ ngày khám đến ngày khám + 365). */
export const FOLLOW_UP_DAYS = 14;

/** Nối lặp `unit` rồi cắt đúng `length` đơn vị UTF-16, kết thúc bằng dấu chấm (không để khoảng trắng cuối). */
function fit(unit: string, length: number): string {
  const body = unit.repeat(Math.ceil(length / unit.length) + 1);
  return body
    .slice(0, length - 1)
    .trimEnd()
    .padEnd(length, '.');
}

const SENTENCE =
  'Bác sĩ tư vấn tận tình, giải thích rõ ràng và kiên nhẫn trả lời mọi câu hỏi. ';

/** Nhận xét dài ĐÚNG 1.000 đơn vị UTF-16 (trần của B6) để thử biên độ dài. */
export const COMMENT_LONGEST: string = fit(SENTENCE, 1000);
/** Cặp thay thế (emoji) nằm đúng ở vị trí 199 và 200: cắt 200 đơn vị ở danh sách phải lùi một đơn vị (PLAN 5.8). */
export const COMMENT_EMOJI_AT_CUT: string = `${SENTENCE.repeat(4).slice(0, 199)}😀 Rất hài lòng với buổi khám.`;
export const COMMENT_MULTILINE =
  'Bác sĩ khám rất kỹ.\nGiải thích dễ hiểu, không bị vội.\nSẽ quay lại tái khám.';
/** Chữ thuần giống spam/HTML: giao diện phải hiện nguyên văn, không chạy (WKD-10). KHÔNG phải mã thật. */
export const COMMENT_SPAM_TEXT =
  '<script>alert(1)</script> Click vào đây để nhận quà: http://example.invalid/qua-tang';
/** Có `%` và `_` để thử ô tìm (ký tự đặc biệt của LIKE phải được thoát). */
export const COMMENT_LIKE_CHARS =
  'Đỡ khoảng 70% sau tuần đầu; mã_theo_dõi 12_34 (thử ký tự đặc biệt của ô tìm).';

export type ExamDemoRecordKind = 'none' | 'basic' | 'followUp';

export interface ExamDemoRating {
  stars: number;
  comment: string | null;
  /** Có = đánh giá đã bị ẩn, kèm lý do 10 đến 255 ký tự (khớp `chk_danh_gia_an` và B8). */
  hiddenReason?: string;
}

export interface ExamDemoSample {
  /** `ma_lich_hen` cố định: khoá nhận diện (có mã rồi thì bỏ qua cả nhóm). */
  code: string;
  /** 0 = `doctor@example.invalid`; 1 đến 8 = `bacsi01` đến `bacsi08` của `search-demo`. */
  doctorKey: number;
  /** 0 = `patient@example.invalid`; 1 đến 6 = bệnh nhân mẫu. */
  bookerKey: number;
  /** Họ tên hồ sơ người thân của `patient@example.invalid` khi khám cho người thân. */
  relative?: string;
  state: 'DaTiepDon' | 'HoanThanh';
  /** Ngày khám mong muốn = ngày chạy trừ số này; lùi tiếp nếu ngày hay ca đã có ca của bác sĩ (seed không được UPDATE khung_gio). */
  daysAgo: number;
  record: ExamDemoRecordKind;
  rating?: ExamDemoRating;
}

/** Đầu mã lịch hẹn mẫu: đúng mẫu Q13 nhưng phần ngày `00000000` không bao giờ trùng mã thật. */
export const EXAM_DEMO_CODE_PREFIX = 'CLX-00000000-E';

export const examDemoCode = (n: number): string =>
  `${EXAM_DEMO_CODE_PREFIX}${String(n).padStart(4, '0')}`;

export const HIDDEN_REASONS = {
  abuse:
    'Nội dung xúc phạm cá nhân bác sĩ, vi phạm quy tắc cộng đồng (dữ liệu minh họa).',
  spam: 'Đánh giá không liên quan đến buổi khám, có dấu hiệu spam (dữ liệu minh họa).',
  privacy: 'Chứa thông tin cá nhân của người khác (dữ liệu minh họa).',
  advert:
    'Nhận xét lặp lại nhiều lần, có đường dẫn quảng cáo (dữ liệu minh họa).',
} as const;

type SampleRow = Omit<ExamDemoSample, 'code'>;

const done = (
  doctorKey: number,
  bookerKey: number,
  daysAgo: number,
  record: ExamDemoRecordKind,
  rating?: ExamDemoRating,
  relative?: string,
): SampleRow => ({
  doctorKey,
  bookerKey,
  state: 'HoanThanh',
  daysAgo,
  record,
  ...(rating ? { rating } : {}),
  ...(relative ? { relative } : {}),
});

const received = (
  doctorKey: number,
  bookerKey: number,
  record: ExamDemoRecordKind,
  relative?: string,
): SampleRow => ({
  doctorKey,
  bookerKey,
  state: 'DaTiepDon',
  daysAgo: 0,
  record,
  ...(relative ? { relative } : {}),
});

const stars = (
  value: number,
  comment: string | null = null,
  hiddenReason?: string,
): ExamDemoRating => ({
  stars: value,
  comment,
  ...(hiddenReason ? { hiddenReason } : {}),
});

// Thứ tự = số mã (E0001 đến E0034). Chi nhánh: bác sĩ 0, 1, 2 ở CN1; 3, 4 ở CN2; 5, 6 ở CN3; 7, 8 ở CN4.
const ROWS: readonly SampleRow[] = [
  // doctor@example.invalid (CN1): hai ca đã tiếp đón và các ca của patient@example.invalid để kiểm F1 đến F6
  received(0, 0, 'none'), // E0001: chưa hồ sơ ⇒ "Ghi hồ sơ khám", "Hoàn thành ca khám"
  received(0, 0, 'followUp', RELATIVE_FATHER), // E0002: đã có hồ sơ (người thân)
  done(0, 0, 3, 'followUp', stars(5, COMMENT_MULTILINE)), // E0003
  done(0, 0, 8, 'basic', undefined, RELATIVE_MOTHER), // E0004: chưa đánh giá ⇒ "Đánh giá ngay"
  done(0, 0, 15, 'none'), // E0005: "Chưa có hồ sơ khám", chưa đánh giá
  done(
    0,
    0,
    22,
    'basic',
    stars(1, 'Chờ lâu, tư vấn qua loa.', HIDDEN_REASONS.abuse),
  ), // E0006: đã ẩn
  done(0, 0, 40, 'basic', stars(4), RELATIVE_STOPPED), // E0007: hồ sơ người thân ngừng dùng
  done(0, 1, 1, 'basic', stars(5, 'Khám nhanh gọn, bác sĩ nhiệt tình.')), // E0008
  done(0, 2, 5, 'none', stars(3, 'Phòng chờ hơi đông, bác sĩ khám ổn.')), // E0009: đánh giá không cần hồ sơ
  done(0, 3, 10, 'basic', stars(2, COMMENT_LIKE_CHARS)), // E0010
  done(0, 4, 18, 'basic', stars(4, COMMENT_LONGEST)), // E0011: nhận xét 1.000
  done(0, 5, 27, 'basic', stars(5)), // E0012
  // bacsi01 và bacsi02 (CN1)
  received(1, 6, 'none'), // E0013: người đặt có tên dài 85 ký tự
  done(1, 1, 2, 'basic', stars(5, COMMENT_SPAM_TEXT)), // E0014
  done(1, 2, 4, 'basic', stars(4, COMMENT_EMOJI_AT_CUT)), // E0015
  done(1, 3, 6, 'none', stars(3)), // E0016
  done(2, 4, 7, 'basic', stars(5, 'Giải thích kỹ, đặt lịch dễ dàng.')), // E0017
  done(
    2,
    5,
    12,
    'basic',
    stars(2, 'Không đúng như mong đợi.', HIDDEN_REASONS.spam),
  ), // E0018: đã ẩn
  done(2, 6, 20, 'basic', stars(4, 'Bác sĩ thân thiện, sẽ quay lại.')), // E0019
  // bacsi03 và bacsi04 (CN2)
  done(3, 1, 9, 'basic', stars(1, 'Rất thất vọng.', HIDDEN_REASONS.privacy)), // E0020: đã ẩn
  done(3, 2, 14, 'basic', stars(5, 'Tận tâm, giải đáp mọi thắc mắc.')), // E0021
  done(3, 3, 25, 'basic', stars(3)), // E0022
  done(4, 4, 11, 'basic', stars(4, 'Ổn, thời gian khám hợp lý.')), // E0023
  done(4, 5, 30, 'basic', stars(5, 'Chuyên môn tốt.')), // E0024
  // bacsi05 và bacsi06 (CN3)
  done(5, 6, 13, 'basic', stars(3, 'Tạm được.', HIDDEN_REASONS.advert)), // E0025: đã ẩn
  done(5, 1, 19, 'basic', stars(5, 'Khám kỹ, giải thích rõ.')), // E0026
  done(5, 2, 33, 'basic', stars(4)), // E0027
  done(6, 3, 16, 'basic', stars(2, 'Hơi vội, chưa kịp hỏi hết.')), // E0028
  done(6, 4, 38, 'basic', stars(5, 'Rất hài lòng.')), // E0029
  // bacsi07 và bacsi08 (CN4)
  done(7, 5, 17, 'basic', stars(4, 'Bác sĩ chu đáo.')), // E0030
  done(7, 6, 24, 'basic', stars(5)), // E0031
  done(7, 1, 42, 'basic', stars(1, 'Không hài lòng về thời gian chờ.')), // E0032
  done(8, 2, 21, 'basic', stars(3, 'Bình thường.')), // E0033
  done(8, 3, 35, 'basic', stars(4, 'Tư vấn rõ ràng.')), // E0034
];

export const EXAM_DEMO_SAMPLES: readonly ExamDemoSample[] = ROWS.map(
  (row, index) => ({ code: examDemoCode(index + 1), ...row }),
);

const searchDoctorEmails = DEMO_DOCTORS.filter((d) => d.active).map(
  (d) => d.email,
);

/** Email bác sĩ theo `doctorKey` (0 = bác sĩ của `dev-accounts`, 1 đến 8 = `search-demo` đang hoạt động). */
export function doctorEmail(key: number): string {
  const email = key === 0 ? DEV_DOCTOR_EMAIL : searchDoctorEmails[key - 1];
  if (!email) throw new Error(`doctorKey không hợp lệ: ${key}`);
  return email;
}

/** Email người đặt theo `bookerKey` (0 = `patient@example.invalid`, 1 đến 6 = bệnh nhân mẫu). */
export function bookerEmail(key: number): string {
  const email =
    key === 0 ? DEV_PATIENT_EMAIL : EXAM_DEMO_PATIENTS[key - 1]?.email;
  if (!email) throw new Error(`bookerKey không hợp lệ: ${key}`);
  return email;
}

/** Số hàng mà một mẫu thêm vào các bảng (ca, lịch, hồ sơ, đánh giá, nhật ký): đếm đối xứng cho `created` và `skipped`. */
export function sampleRowCount(sample: ExamDemoSample): number {
  return (
    2 +
    (sample.record === 'none' ? 0 : 1) +
    (sample.rating ? 1 : 0) +
    (sample.rating?.hiddenReason ? 1 : 0)
  );
}
