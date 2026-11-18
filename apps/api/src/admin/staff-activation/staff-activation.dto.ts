import { Allow } from 'class-validator';
import {
  IsAccountPassword,
  MatchesField,
} from '../../auth/dto/account-field.decorators.js';
import { ID_PATTERN } from './activation-link-token.js';
import { ACTIVATION_TOKEN_PATTERN } from './staff-activation.constants.js';

/** Liên kết người dùng gửi lên: id (chuỗi số, dạng của `buildActivationUrl`) và token (43 ký tự base64url). */
export interface LinkReference {
  id: string;
  token: string;
}

/**
 * Đọc `{id, token}` từ thân request MÀ KHÔNG BAO GIỜ ném lỗi: bất kỳ điều gì sai (không phải object, thiếu, sai kiểu, sai dạng) trả `null`, và người gọi
 * coi đó là "liên kết không hợp lệ" CÙNG MÃ với mọi lý do khác (NS-35). Cố ý không dùng lớp DTO của class-validator cho `validate`: ValidationPipe
 * toàn cục sẽ trả `DU_LIEU_KHONG_HOP_LE` (một thân khác) cho lỗi định dạng, làm lộ ra "dạng sai" so với "liên kết sai".
 * Chỉ nhận `id` là CHUỖI: id bigint là chuỗi ở cả repo (số JSON mất độ chính xác quá 2^53); số 0 đứng đầu bị loại (MySQL so '0001' = 1, một liên kết
 * sẽ có hai cách viết).
 */
export function parseLinkReference(body: unknown): LinkReference | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const { id, token } = body as Record<string, unknown>;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
  if (typeof token !== 'string' || !ACTIVATION_TOKEN_PATTERN.test(token)) {
    return null;
  }
  return { id, token };
}

// Thân của POST /staff-activation/complete (task B16; PLAN admin 5.3): CHỈ bốn trường, trường lạ bị ValidationPipe từ chối (SE-A2).
// `id` và `token` chỉ được đánh dấu cho phép (`@Allow`, KHÔNG kiểm ở đây): sai dạng thì dịch vụ trả `LIEN_KET_KHONG_HOP_LE` như mọi lý do khác.
// Mật khẩu mới sai dạng hoặc xác nhận không khớp ⇒ 400 DU_LIEU_KHONG_HOP_LE ngay ở biên, TRƯỚC mọi truy cập DB, nên liên kết KHÔNG bị đốt (A6)
// và kết quả không phụ thuộc liên kết nên không lộ gì.
export class CompleteStaffActivationDto {
  @Allow()
  id?: unknown;

  @Allow()
  token?: unknown;

  @IsAccountPassword()
  matKhauMoi!: string;

  // Chỉ để đối chiếu với matKhauMoi, không bao giờ được lưu hay chuyển đi
  @MatchesField('matKhauMoi')
  xacNhan!: string;
}
