import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../../auth/entities/enums.js';
import type { MaXacThuc } from '../../auth/entities/ma-xac-thuc.entity.js';
import { deriveActivationLinkState } from './activation-link-rules.js';
import { activationTokenMatches } from './activation-link-token.js';
import { ACTIVATION_TOKEN_PATTERN } from './staff-activation.constants.js';

// Một liên kết kích hoạt có DÙNG ĐƯỢC không (task B16; PLAN admin 5.5 "Kích hoạt công khai"), dưới dạng HÀM THUẦN: dùng cho `validate`, cho bước
// kiểm sơ bộ của `complete` và cho lần kiểm LẠI dưới khoá của `complete`, nên ba nơi không thể lệch nhau.

export type LinkFacts = Pick<
  MaXacThuc,
  'maBam' | 'hetHanLuc' | 'daGuiLuc' | 'thuHoiLuc' | 'daDungLuc'
>;

export interface AccountFacts {
  trangThai: TrangThaiTaiKhoan;
  loaiTaiKhoan: LoaiTaiKhoan;
}

// Băm lưu GIẢ (64 số 0, đúng dạng hex) dùng khi không có hàng: để nhánh "không có liên kết" vẫn chạy đúng một lần băm và so khớp hằng định
// như nhánh "có liên kết, sai token". Không token ngẫu nhiên nào băm ra giá trị này.
const ABSENT_STORED_HASH = '0'.repeat(64);
// Token MỐC (43 ký tự, đúng dạng) thay cho token sai dạng, cùng mục đích: mọi nhánh làm cùng một việc. Kết quả vẫn bị ép `false` bằng `tokenWellFormed`.
const PLACEHOLDER_TOKEN = 'A'.repeat(43);

/**
 * `true` chỉ khi ĐỦ cả ba: (1) token đúng dạng VÀ khớp băm đã lưu (so hằng định), (2) trạng thái liên kết là HOP_LE (bảng PLAN 5.5: đã gửi, chưa thu hồi,
 * chưa dùng, còn hạn), (3) tài khoản là nhân sự đang `ChoKichHoat`.
 *
 * KHÔNG ngắn mạch (NS-35): mọi giá trị đều được TÍNH trước khi gộp, nên mọi nhánh thất bại (không có hàng, token sai dạng, token sai, đã dùng, thu hồi,
 * hết hạn, tài khoản không còn chờ) làm cùng một việc và tốn gần như cùng thời gian. `link` là `null` khi không có hàng.
 */
export function isActivationLinkUsable(
  link: LinkFacts | null,
  account: AccountFacts | null,
  presentedToken: string | null,
  now: Date,
): boolean {
  const tokenWellFormed =
    presentedToken !== null && ACTIVATION_TOKEN_PATTERN.test(presentedToken);
  const tokenMatches = activationTokenMatches(
    link?.maBam ?? ABSENT_STORED_HASH,
    tokenWellFormed ? presentedToken : PLACEHOLDER_TOKEN,
  );
  const linkValid =
    link !== null && deriveActivationLinkState(link, now) === 'HOP_LE';
  const accountPending =
    account !== null &&
    account.trangThai === 'ChoKichHoat' &&
    account.loaiTaiKhoan !== 'BenhNhan';
  return [tokenWellFormed, tokenMatches, linkValid, accountPending].every(
    Boolean,
  );
}
