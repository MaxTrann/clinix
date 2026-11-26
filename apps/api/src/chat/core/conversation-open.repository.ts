import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

// Tìm-hoặc-tạo hội thoại (chat B1; PLAN chat 5.4 quy tắc 1, Q9). Đây là NƠI DUY NHẤT chèn `hoi_thoai` (HCH-01). Mọi câu tham số hoá, liệt kê cột (HCH-02).

/** Khoá hàng `tai_khoan` của Bệnh nhân (tầng 1): hai lần mở cùng cặp chạy tuần tự, bên sau thấy hội thoại bên trước vừa tạo (quy tắc nghiệp vụ 65). */
const LOCK_PATIENT_SQL =
  'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE';

// Đọc THƯỜNG (không khoá): READ COMMITTED thấy hội thoại đã commit; luồng mở không được khoá hội thoại đã có khi đang giữ khoá tài khoản (LOI-18).
const FIND_DOCTOR_CONVERSATION_SQL = `SELECT h.hoi_thoai_id AS hoiThoaiId
  FROM hoi_thoai h
  JOIN tai_khoan_hoi_thoai m ON m.hoi_thoai_id = h.hoi_thoai_id AND m.tai_khoan_id = ?
 WHERE h.nguoi_tao_id = ? AND h.loai = 'BenhNhan_BacSi'
 LIMIT 1`;
const FIND_BRANCH_CONVERSATION_SQL = `SELECT hoi_thoai_id AS hoiThoaiId
  FROM hoi_thoai
 WHERE nguoi_tao_id = ? AND loai = 'BenhNhan_LeTan' AND chi_nhanh_id = ?
 LIMIT 1`;

// Bác sĩ đích: tài khoản loại Bác sĩ CÓ dòng `bac_si` (tài khoản thiếu hồ sơ coi như không có)
const DOCTOR_TARGET_SQL = `SELECT t.trang_thai AS trangThai
  FROM tai_khoan t
  JOIN bac_si b ON b.tai_khoan_id = t.tai_khoan_id
 WHERE t.tai_khoan_id = ? AND t.loai_tai_khoan = 'BacSi'`;
const BRANCH_EXISTS_SQL =
  'SELECT chi_nhanh_id AS chiNhanhId FROM chi_nhanh WHERE chi_nhanh_id = ?';

const INSERT_CONVERSATION_SQL =
  'INSERT INTO hoi_thoai (loai, chi_nhanh_id, nguoi_tao_id, thoi_diem_tao) VALUES (?, ?, ?, ?)';
const INSERT_MEMBER_SQL =
  'INSERT INTO tai_khoan_hoi_thoai (tai_khoan_id, hoi_thoai_id, tin_nhan_cuoi_da_doc_id) VALUES (?, ?, NULL)';

export type OpenTarget = { bacSiId: string } | { chiNhanhId: string };

@Injectable()
export class ConversationOpenRepository {
  async lockPatient(em: EntityManager, benhNhanId: string): Promise<void> {
    await em.query(LOCK_PATIENT_SQL, [benhNhanId]);
  }

  async findExisting(
    em: EntityManager,
    benhNhanId: string,
    target: OpenTarget,
  ): Promise<string | null> {
    const rows =
      'bacSiId' in target
        ? await em.query<{ hoiThoaiId: string }[]>(
            FIND_DOCTOR_CONVERSATION_SQL,
            [target.bacSiId, benhNhanId],
          )
        : await em.query<{ hoiThoaiId: string }[]>(
            FIND_BRANCH_CONVERSATION_SQL,
            [benhNhanId, target.chiNhanhId],
          );
    return rows[0] ? String(rows[0].hoiThoaiId) : null;
  }

  /** Trạng thái tài khoản của bác sĩ đích, `null` nếu không có bác sĩ đó. */
  async doctorStatus(
    em: EntityManager,
    bacSiId: string,
  ): Promise<string | null> {
    const rows = await em.query<{ trangThai: string }[]>(DOCTOR_TARGET_SQL, [
      bacSiId,
    ]);
    return rows[0]?.trangThai ?? null;
  }

  async branchExists(em: EntityManager, chiNhanhId: string): Promise<boolean> {
    const rows = await em.query<unknown[]>(BRANCH_EXISTS_SQL, [chiNhanhId]);
    return rows.length > 0;
  }

  /** Chèn hội thoại và thành viên: Bệnh nhân (người tạo) và, ở hội thoại bác sĩ, bác sĩ. Lễ tân có dòng riêng khi mở hay trả lời lần đầu (B2, lõi gửi). */
  async create(
    em: EntityManager,
    benhNhanId: string,
    target: OpenTarget,
    now: Date,
  ): Promise<string> {
    const isDoctor = 'bacSiId' in target;
    const result = await em.query<{ insertId: number | string }>(
      INSERT_CONVERSATION_SQL,
      [
        isDoctor ? 'BenhNhan_BacSi' : 'BenhNhan_LeTan',
        isDoctor ? null : target.chiNhanhId,
        benhNhanId,
        now,
      ],
    );
    const hoiThoaiId = String(result.insertId);
    await em.query(INSERT_MEMBER_SQL, [benhNhanId, hoiThoaiId]);
    if (isDoctor)
      await em.query(INSERT_MEMBER_SQL, [target.bacSiId, hoiThoaiId]);
    return hoiThoaiId;
  }
}
