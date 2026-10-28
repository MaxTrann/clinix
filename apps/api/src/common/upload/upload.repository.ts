import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../errors/app.exception.js';
import { toSecond } from '../time/time.js';
import { SPECIALTY_IMAGE_POLICY as P } from './upload-policy.js';

export interface CleanupItem {
  id: string;
  publicId: string;
  token: string;
}
interface UploadRow {
  anh_tai_len_id: string;
  public_id: string;
  secure_url: string | null;
  nguoi_tai_len_id: string;
  muc_dich: string;
  trang_thai: string;
  upload_xac_nhan_luc: Date | null;
  het_han_gan_luc: Date;
}

@Injectable()
export class UploadRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async isSystemAdmin(accountId: string): Promise<boolean> {
    const rows: { tai_khoan_id: string }[] = await this.db.query(
      `SELECT q.tai_khoan_id FROM quan_tri_vien q JOIN tai_khoan t ON t.tai_khoan_id=q.tai_khoan_id
       WHERE q.tai_khoan_id=? AND q.pham_vi_quan_tri='ToanHeThong' AND t.loai_tai_khoan='QuanTriVien' AND t.trang_thai='DangHoatDong'`,
      [accountId],
    );
    return rows.length === 1;
  }

  async createPending(
    id: string,
    publicId: string,
    accountId: string,
    now: Date,
    expires: Date,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO anh_tai_len (anh_tai_len_id,public_id,nguoi_tai_len_id,tao_luc,het_han_gan_luc) VALUES (?,?,?,?,?)`,
      [id, publicId, accountId, toSecond(now), toSecond(expires)],
    );
  }

  async confirm(id: string, url: string, now: Date): Promise<void> {
    const result: { affectedRows: number } = await this.db.query(
      `UPDATE anh_tai_len SET secure_url=?,upload_xac_nhan_luc=?,ma_loi_cuoi=NULL WHERE anh_tai_len_id=? AND trang_thai='ChuaGan' AND upload_xac_nhan_luc IS NULL`,
      [url, toSecond(now), id],
    );
    if (result.affectedRows !== 1) throw new Error('UPLOAD_CONFIRM_CONFLICT');
  }

  async markUnknown(id: string): Promise<void> {
    await this.db.query(
      `UPDATE anh_tai_len SET ma_loi_cuoi='UPLOAD_CAN_KIEM_TRA' WHERE anh_tai_len_id=? AND upload_xac_nhan_luc IS NULL`,
      [id],
    );
  }

  // B1 gọi TRONG giao dịch lưu chuyên khoa, dùng cùng manager; không có network ở đây.
  async assignSpecialty(
    manager: EntityManager,
    specialtyId: string,
    accountId: string,
    imageId: string | null | undefined,
    now: Date,
  ): Promise<void> {
    if (imageId === undefined) return;
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('UPLOAD_ASSIGN_REQUIRES_TRANSACTION');
    const rows: { anh_tai_len_id: string | null }[] = await manager.query(
      `SELECT anh_tai_len_id FROM chuyen_khoa WHERE chuyen_khoa_id=? FOR UPDATE`,
      [specialtyId],
    );
    const current = rows[0];
    if (!current) throw new AppException(404, 'KHONG_TIM_THAY');
    if (imageId !== null && current.anh_tai_len_id === imageId) return;
    // Khóa theo thứ tự cố định khi thay ảnh, tránh hai lần thay khóa ngược nhau.
    const ids = [
      ...new Set(
        [current.anh_tai_len_id, imageId].filter(
          (id): id is string => id !== null,
        ),
      ),
    ].sort();
    for (const id of ids)
      await manager.query(
        'SELECT anh_tai_len_id FROM anh_tai_len WHERE anh_tai_len_id=? FOR UPDATE',
        [id],
      );
    if (imageId !== null) {
      const images: UploadRow[] = await manager.query(
        'SELECT * FROM anh_tai_len WHERE anh_tai_len_id=?',
        [imageId],
      );
      const image = images[0];
      if (
        !image ||
        String(image.nguoi_tai_len_id) !== accountId ||
        image.muc_dich !== 'ChuyenKhoa' ||
        image.trang_thai !== 'ChuaGan' ||
        !image.upload_xac_nhan_luc ||
        !image.secure_url ||
        image.het_han_gan_luc.getTime() <= now.getTime()
      ) {
        throw new AppException(400, 'ANH_TAI_LEN_KHONG_HOP_LE');
      }
      await manager.query(
        `UPDATE anh_tai_len SET trang_thai='DaGan' WHERE anh_tai_len_id=?`,
        [imageId],
      );
    }
    // Bỏ đường dẫn cũ khi chủ động thay/gỡ, tránh fallback làm ảnh đã gỡ xuất hiện lại.
    await manager.query(
      'UPDATE chuyen_khoa SET anh_tai_len_id=?,anh_dai_dien=NULL WHERE chuyen_khoa_id=?',
      [imageId, specialtyId],
    );
    if (current.anh_tai_len_id)
      await manager.query(
        `UPDATE anh_tai_len SET trang_thai='ChoXoa',thu_xoa_lai_luc=? WHERE anh_tai_len_id=?`,
        [toSecond(now), current.anh_tai_len_id],
      );
  }

  async claimCleanup(now: Date): Promise<CleanupItem[]> {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const rows: { anh_tai_len_id: string; public_id: string }[] =
        await manager.query(
          `SELECT anh_tai_len_id,public_id FROM anh_tai_len
         WHERE upload_xac_nhan_luc IS NOT NULL AND so_lan_thu_xoa < ?
         AND (trang_thai='ChoXoa' OR (trang_thai='ChuaGan' AND het_han_gan_luc<=?))
         AND (thu_xoa_lai_luc IS NULL OR thu_xoa_lai_luc<=?)
         AND (khoa_don_den_luc IS NULL OR khoa_don_den_luc<=?)
         ORDER BY tao_luc LIMIT 50 FOR UPDATE SKIP LOCKED`,
          [P.maxDeleteAttempts, now, now, now],
        );
      const claimed: CleanupItem[] = [];
      for (const row of rows) {
        const refs: { chuyen_khoa_id: string }[] = await manager.query(
          'SELECT chuyen_khoa_id FROM chuyen_khoa WHERE anh_tai_len_id=?',
          [row.anh_tai_len_id],
        );
        if (refs.length) continue;
        const token = randomUUID();
        await manager.query(
          `UPDATE anh_tai_len SET trang_thai='ChoXoa',khoa_don_token=?,khoa_don_den_luc=? WHERE anh_tai_len_id=?`,
          [
            token,
            toSecond(new Date(now.getTime() + P.cleanupLeaseMs)),
            row.anh_tai_len_id,
          ],
        );
        claimed.push({
          id: row.anh_tai_len_id,
          publicId: row.public_id,
          token,
        });
      }
      return claimed;
    });
  }

  async cleanupOwned(item: CleanupItem, now: Date): Promise<boolean> {
    const rows: { anh_tai_len_id: string }[] = await this.db.query(
      `SELECT a.anh_tai_len_id FROM anh_tai_len a WHERE a.anh_tai_len_id=? AND a.khoa_don_token=? AND a.khoa_don_den_luc>? AND a.trang_thai='ChoXoa' AND NOT EXISTS (SELECT 1 FROM chuyen_khoa c WHERE c.anh_tai_len_id=a.anh_tai_len_id)`,
      [item.id, item.token, now],
    );
    return rows.length === 1;
  }

  async cleanupDone(item: CleanupItem): Promise<void> {
    await this.db.query(
      `DELETE FROM anh_tai_len WHERE anh_tai_len_id=? AND khoa_don_token=? AND trang_thai='ChoXoa'`,
      [item.id, item.token],
    );
  }

  async cleanupFailed(item: CleanupItem, now: Date): Promise<void> {
    await this.db.query(
      `UPDATE anh_tai_len SET so_lan_thu_xoa=so_lan_thu_xoa+1,thu_xoa_lai_luc=?,khoa_don_token=NULL,khoa_don_den_luc=NULL,ma_loi_cuoi='XOA_ANH_THAT_BAI' WHERE anh_tai_len_id=? AND khoa_don_token=? AND so_lan_thu_xoa<?`,
      [
        toSecond(new Date(now.getTime() + 3_600_000)),
        item.id,
        item.token,
        P.maxDeleteAttempts,
      ],
    );
  }
}
