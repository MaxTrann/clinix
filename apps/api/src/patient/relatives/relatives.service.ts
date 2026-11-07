import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { ActiveAppointment } from '../../appointments/active-appointment.query.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { isForeignKeyError } from '../../database/mysql-errors.js';
import {
  PATIENT_ERROR_CODES,
  PATIENT_ERROR_MESSAGES,
} from '../patient.constants.js';
import type {
  DeactivateRelativeResponse,
  RelativeResponse,
  RelativesListResponse,
} from './relatives.dto.js';
import {
  RelativesRepository,
  type NewRelative,
} from './relatives.repository.js';

// Kết quả của giao dịch ngừng sử dụng. Giao dịch TRẢ kết quả, KHÔNG ném lỗi nghiệp vụ; lỗi API chỉ được ném SAU khi giao dịch đã commit (nếp `LoginService`, A8).
type DeactivateOutcome =
  | { kind: 'not-found' } // không có dòng benh_nhan, không có hồ sơ, hoặc hồ sơ của người khác: cùng một 404 (H3)
  | { kind: 'already' } // hồ sơ của mình đã ngừng từ trước: 200, không ghi gì (Q10)
  | { kind: 'blocked'; appointments: ActiveAppointment[] } // còn lịch hẹn đang hoạt động: 409 sau khi commit
  | { kind: 'deactivated' };

/**
 * Hồ sơ người thân của Bệnh nhân đang đăng nhập (task B3 `list`, `create`; task B4 `update`; task B5 `deactivate`; PLAN patient 5.3; TRACKING B3-C…B3-E, B4-D, B5-C). Tài khoản luôn là
 * tham số hàm (từ access token ở controller), không bao giờ từ thân hay đường dẫn. Không log gì: họ tên, SĐT, ngày sinh của người thân là dữ liệu cá nhân.
 */
@Injectable()
export class RelativesService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(RelativesRepository)
    private readonly relatives: RelativesRepository,
  ) {}

  /** GET: chỉ ĐỌC, một câu SELECT thường (không giao dịch, không khoá). Không phân trang (Q14). */
  async list(accountId: string): Promise<RelativesListResponse> {
    return {
      items: await this.relatives.findRelatives(
        this.dataSource.manager,
        accountId,
      ),
    };
  }

  /**
   * POST: INSERT rồi ĐỌC LẠI trong CÙNG MỘT giao dịch (TRACKING B3-D):
   *  - cần MỘT kết nối để `LAST_INSERT_ID()` đúng (hai lệnh trên `dataSource.manager` có thể rơi vào hai kết nối khác nhau);
   *  - đọc lại lỗi ⇒ hoàn tác, không để lại "đã ghi nhưng báo 500"; phản hồi là bản đọc lại từ DB, không phản chiếu thân gửi lên.
   * Không giới hạn số lượng, không chặn trùng họ tên + ngày sinh (Q14), nên không khoá hàng nào và không đếm.
   */
  async create(
    accountId: string,
    input: NewRelative,
  ): Promise<RelativeResponse> {
    return this.dataSource.transaction(async (em) => {
      const id = await this.insert(em, accountId, input);
      const created = await this.relatives.findRelativeById(em, accountId, id);
      if (created === null) {
        // Phòng thủ: vừa chèn trong cùng giao dịch mà không đọc lại được. Lỗi nội bộ (500), thông điệp không có dữ liệu cá nhân.
        throw new Error(
          `Không đọc lại được hồ sơ người thân vừa tạo của tài khoản ${accountId}`,
        );
      }
      return created;
    });
  }

  /**
   * PUT: sửa năm cột rồi ĐỌC LẠI trong CÙNG MỘT giao dịch (task B4; PLAN 5.3; TRACKING B4-D):
   *  - `UPDATE … WHERE id AND benh_nhan_id AND trang_thai_hieu_luc = TRUE`: một câu vừa kiểm chủ sở hữu vừa kiểm hiệu lực. ≥ 1 hàng khớp ⇒ trả bản đọc lại
   *    từ DB (không phản chiếu thân gửi lên); đọc lại ném lỗi ⇒ hoàn tác, không để lại "đã ghi nhưng báo 500".
   *  - 0 hàng khớp ⇒ đọc lại (luôn kèm chủ sở hữu) để phân biệt: không có hoặc của người khác ⇒ 404 cùng thân với `Pipe` id sai dạng (H3, Q27); của MÌNH
   *    nhưng đã ngừng ⇒ 409 (Q9). Hồ sơ đã ngừng của người khác đọc ra `null` nên luôn 404, không lộ sự tồn tại.
   *  - Ném `AppException` ngay trong giao dịch (hoàn tác): mọi nhánh lỗi đều chưa ghi gì.
   * `READ COMMITTED` (không khoá khoảng): ở `REPEATABLE READ` một `UPDATE` không khớp hàng nào vẫn giữ khoá khoảng/khoá hàng tới cuối giao dịch, làm chặn `POST`
   * hay `PUT` của chủ thật (đã đo, TRACKING B4-D). Mức này chỉ của B4: B5 (ngừng sử dụng) vẫn `REPEATABLE READ` theo quyết định 03/11/2026.
   * Không log gì: họ tên, SĐT, ngày sinh của người thân là dữ liệu cá nhân. Không đọc, không ghi `lich_hen` (Q9: được sửa khi có lịch hẹn).
   */
  async update(
    accountId: string,
    id: string,
    input: NewRelative,
  ): Promise<RelativeResponse> {
    return this.dataSource.transaction('READ COMMITTED', async (em) => {
      const matched = await this.relatives.updateRelative(
        em,
        accountId,
        id,
        input,
      );
      const current = await this.relatives.findRelativeById(em, accountId, id);
      if (matched > 0) {
        if (current === null) {
          // Phòng thủ: vừa sửa trong cùng giao dịch mà không đọc lại được. Lỗi nội bộ (500), thông điệp không có dữ liệu cá nhân
          throw new Error(
            `Không đọc lại được hồ sơ người thân ${id} vừa sửa của tài khoản ${accountId}`,
          );
        }
        return current;
      }
      if (current === null) {
        throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
      }
      if (!current.trangThaiHieuLuc) {
        throw new AppException(409, PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED, {
          thongBao:
            PATIENT_ERROR_MESSAGES[PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED],
        });
      }
      // Không thể xảy ra: hồ sơ của chính mình, đang hiệu lực mà UPDATE vẫn khớp 0 hàng. Chỉ có thể là hồ sơ vừa được TẠO giữa câu UPDATE và câu đọc lại
      // (người gọi đoán đúng id kế tiếp của AUTO_INCREMENT trong vài mili giây); không ghi gì, báo 500 chứ không che thành 404 (TRACKING B4-D, bẫy 5)
      throw new Error(
        `Sửa hồ sơ người thân ${id} của tài khoản ${accountId} khớp 0 hàng dù hồ sơ đang hiệu lực`,
      );
    });
  }

  /**
   * POST …/:id/deactivate: ngừng sử dụng MỘT hồ sơ của người gọi (task B5; PLAN 5.3; TRACKING B5-C). Một giao dịch, năm câu theo THỨ TỰ CỐ ĐỊNH:
   *  1. `lockPatient`: `benh_nhan` `FOR UPDATE`, khoá chung với `booking` (quy tắc 37). Không có dòng ⇒ 404.
   *  2. `lockRelative`: hàng hồ sơ `FOR UPDATE` kèm `benh_nhan_id` (H3). Không có hoặc của người khác ⇒ 404; đã ngừng ⇒ 200, KHÔNG đọc lịch, KHÔNG ghi (Q10).
   *     Hiệu lực được kiểm DƯỚI khoá nên tin được.
   *  3. `findBlockingAppointments`: lịch hẹn ChoThanhToan/DaXacNhan/DaTiepDon của đúng hồ sơ đó. Có ⇒ giao dịch trả kết quả `blocked` và commit (không ghi gì).
   *  4. Ném 409 kèm danh sách SAU khi giao dịch xong (nếp `LoginService`/A8: ném bên trong làm lần ghi đã làm bị hoàn tác theo; ở đây chưa ghi gì nên vô hại,
   *     nhưng giữ đúng nếp để ai thêm bước ghi sau này không dính bẫy đó).
   *  5. `deactivateRelative`: đặt `trang_thai_hieu_luc = FALSE`. Đang giữ khoá nên phải khớp đúng 1 hàng; khác 1 là lỗi nội bộ (500, hoàn tác).
   * Không log gì: họ tên, SĐT, ngày sinh của người thân là dữ liệu cá nhân; không đọc lại hồ sơ, phản hồi là hằng `{ trangThaiHieuLuc: false }`.
   * Deadlock hay hết giờ chờ khoá đi nguyên thành 500, không thử lại (TRACKING B5-F): thứ tự khoá cố định nên thấy chúng nghĩa là có người phá thứ tự.
   */
  async deactivate(
    accountId: string,
    id: string,
  ): Promise<DeactivateRelativeResponse> {
    // BẤT BIẾN (quyết định 03/11/2026; PLAN patient 5.3, H1): KHÔNG câu đọc thường nào (SELECT không khoá, kể cả findOne, find, findRelativeById, em.query)
    // được chạy TRÊN KẾT NỐI CỦA GIAO DỊCH này trước hai câu đọc có khoá `lockPatient` và `lockRelative`. Dưới REPEATABLE READ, câu đọc thường ĐẦU TIÊN chốt
    // ảnh chụp nhất quán; nếu nó chạy trước khoá thì lịch hẹn mà `booking` commit trong lúc ta chờ khoá sẽ KHÔNG thấy được và hồ sơ bị ngừng dù vừa có lịch mới.
    // Mức cô lập ghi TƯỜNG MINH vì lý do trên phụ thuộc đúng mức này; không mở giao dịch bằng START TRANSACTION WITH CONSISTENT SNAPSHOT.
    // (Guard, pipe, @CurrentUser chạy NGOÀI giao dịch, trên kết nối khác nên không vi phạm.) Giữ bởi RDS-09 (đơn vị) và NT-24 / RDR-02 (MySQL thật).
    const outcome = await this.dataSource.transaction('REPEATABLE READ', (em) =>
      this.deactivateInTransaction(em, accountId, id),
    );
    if (outcome.kind === 'not-found') {
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    }
    if (outcome.kind === 'blocked') {
      throw new AppException(
        409,
        PATIENT_ERROR_CODES.RELATIVE_HAS_ACTIVE_APPOINTMENTS,
        {
          thongBao:
            PATIENT_ERROR_MESSAGES[
              PATIENT_ERROR_CODES.RELATIVE_HAS_ACTIVE_APPOINTMENTS
            ],
          chiTiet: outcome.appointments,
        },
      );
    }
    return { trangThaiHieuLuc: false };
  }

  private async deactivateInTransaction(
    em: EntityManager,
    accountId: string,
    id: string,
  ): Promise<DeactivateOutcome> {
    if (!(await this.relatives.lockPatient(em, accountId))) {
      return { kind: 'not-found' };
    }
    const state = await this.relatives.lockRelative(em, accountId, id);
    if (state === 'missing') return { kind: 'not-found' };
    if (state === 'inactive') return { kind: 'already' };
    const appointments = await this.relatives.findBlockingAppointments(
      em,
      accountId,
      id,
    );
    if (appointments.length > 0) return { kind: 'blocked', appointments };
    const matched = await this.relatives.deactivateRelative(em, accountId, id);
    if (matched !== 1) {
      // Không thể xảy ra: đang giữ khoá `benh_nhan` và hàng hồ sơ, hồ sơ của mình và đang hiệu lực mà UPDATE vẫn không khớp đúng 1 hàng.
      // Lỗi nội bộ (500, hoàn tác); thông điệp không có dữ liệu cá nhân.
      throw new Error(
        `Ngừng hồ sơ người thân ${id} của tài khoản ${accountId} khớp ${String(matched)} hàng thay vì 1`,
      );
    }
    return { kind: 'deactivated' };
  }

  // Lỗi khoá ngoại (H13): tài khoản không có dòng `benh_nhan` (không xảy ra với Bệnh nhân đăng nhập được, giữ phòng thủ) ⇒ 403,
  // không 500. Chỉ bắt quanh đúng câu INSERT; mọi lỗi DB khác đi nguyên thành 500 LOI_HE_THONG.
  private async insert(
    em: EntityManager,
    accountId: string,
    input: NewRelative,
  ): Promise<string> {
    try {
      return await this.relatives.insertRelative(em, accountId, input);
    } catch (error) {
      if (isForeignKeyError(error)) {
        throw new AppException(403, COMMON_ERROR_CODES.FORBIDDEN);
      }
      throw error;
    }
  }
}
