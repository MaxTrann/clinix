import type { BuiltContext } from '../context/context.types.js';
import { parsePlaceholders } from '../context/placeholder.js';
import type { ReconcileResult } from './answer.types.js';
import { renderAnswer } from './answer-renderer.js';
import type { EntityResolver } from './entity-resolver.js';
import { verifyAnswer, type VerifierContext } from './output-verifier.js';
import type { ModelAnswer } from './output.schema.js';
import {
  mapSpecialties,
  type ActiveSpecialtySource,
} from './specialty-mapper.js';

// Cầu nối cho chatbot B3 (PLAN chatbot 5.4 bước 12 đến 14; 2.4.7 b5, A2, A4; 2.4.77 b3, b4, A1). Nhận câu trả lời ĐÃ ĐÚNG LƯỢC ĐỒ (V1 xong ở chuỗi dự phòng):
//  12. lọc id chuyên khoa; `goiYDatLich` mà rỗng thì `KhongCoChuyenKhoa` (không đối chiếu tiếp);
//  13. đối chiếu V2 đến V9; sai thì `KhongKhopDuLieu` kèm MÃ LUẬT, GIỮ thẻ chuyên khoa đã lọc (do máy chủ dựng), bỏ toàn bộ chữ của mô hình;
//  14. đọc lại thực thể được nhắc rồi dựng đoạn; thực thể không còn hiệu lực thì cũng `KhongKhopDuLieu` (V2).
// Bước 11 (mô hình gắn `khanCap`, `ngoaiPhamVi`) là của B3: ở đây chỉ chuyển nguyên loại để B3 dùng câu dựng sẵn và bỏ chữ của mô hình.
// KHÔNG log (không có gì để log ngoài `ruleId`, việc của B3), KHÔNG gọi mô hình khác để chấm.

export interface ReconcileInput {
  readonly answer: ModelAnswer;
  /** Ngữ cảnh ĐÃ GỬI cho đúng lượt này (V2 chỉ cho dùng chỗ giữ trong đó). */
  readonly context: BuiltContext;
  /** Mã chim mồi và lời nhắc cần bảo vệ (V9): do chatbot B3 truyền, B2 không tự viết lời nhắc. */
  readonly guard: Pick<VerifierContext, 'canary' | 'protectedPrompt'>;
}

export interface AnswerReconcilerDeps {
  readonly resolver: Pick<EntityResolver, 'resolve'>;
  readonly specialties: ActiveSpecialtySource;
}

export class AnswerReconciler {
  constructor(private readonly deps: AnswerReconcilerDeps) {}

  async reconcile(input: ReconcileInput): Promise<ReconcileResult> {
    const { answer, context, guard } = input;
    if (answer.loai === 'khanCap') return { ketQua: 'KhanCap' };
    if (answer.loai === 'ngoaiPhamVi') return { ketQua: 'NgoaiPhamVi' };

    const mapping = await mapSpecialties({
      loai: answer.loai,
      rawIds: answer.chuyenKhoaGoiY,
      index: context.index,
      source: this.deps.specialties,
    });
    if (mapping.khongCoChuyenKhoa) {
      return { ketQua: 'KhongCoChuyenKhoa', chuyenKhoaGoiY: [] };
    }
    const { chuyenKhoaGoiY } = mapping;
    // Thực thể không còn hiệu lực khi đọc lại cũng là V2 (PLAN 5.7)
    const gone = (): ReconcileResult => ({
      ketQua: 'KhongKhopDuLieu',
      ruleId: 'V2',
      chuyenKhoaGoiY,
    });

    const verdict = verifyAnswer(answer.traLoi, {
      index: context.index,
      canary: guard.canary,
      protectedPrompt: guard.protectedPrompt,
    });
    if (!verdict.ok) {
      return {
        ketQua: 'KhongKhopDuLieu',
        ruleId: verdict.ruleId,
        chuyenKhoaGoiY,
      };
    }

    const parsed = parsePlaceholders(answer.traLoi);
    if (!parsed.ok) return gone();
    const resolved = await this.deps.resolver.resolve(parsed.refs);
    if (!resolved.ok) return gone();
    const doan = renderAnswer(answer.traLoi, resolved.values);
    if (doan === null) return gone();

    return {
      ketQua: answer.loai === 'goiYDatLich' ? 'GoiY' : 'TraLoi',
      doan,
      chuyenKhoaGoiY,
    };
  }
}
