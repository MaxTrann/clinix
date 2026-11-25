import type { DataSource } from 'typeorm';
import { KhungGio } from '../../admin/entities/khung-gio.entity.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  BookingFixtures,
  nextAppointmentCode,
} from '../testing/booking-fixtures.js';
import {
  insertLichHen,
  type LichHenInsertRow,
} from './lich-hen-insert.query.js';

// reschedule B1 — HDL-08 (phần I; PLAN reschedule 5.5 bước 5, 7.9; quy tắc DB 2, 3, 27) trên MySQL 8.4 THẬT: `insertLichHen` nối lịch mới vào lịch cũ bằng `lich_hen_truoc_id`, ghi bộ đếm, và 1062 trên
// khoá `lich_hen_truoc_id` thành `DuplicateChain` (đổi lịch hai lần cùng lúc), không 500. Tên khoá THẬT của UNIQUE (`lich_hen.lich_hen_truoc_id`) được kiểm ở đây, không chỉ ở chuỗi giả của test đơn vị.
// Phần đơn vị (thứ tự tham số, mặc định): lich-hen-insert.query.spec.ts. Ô i của thế giới đặt được bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026.
const NOW = new Date('2026-11-02T09:00:00+07:00');

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  const doctor = w.doctor.profile;
  const slots = await Promise.all(
    w.slotIds.map((id) =>
      db.getRepository(KhungGio).findOneByOrFail({ khungGioId: id }),
    ),
  );
  /** Hàng chèn hợp lệ ở khung giờ thứ `slot`, trạng thái `DaXacNhan` (đúng như lịch mới của đổi lịch); `extra` ghi đè */
  const row = (
    slot: number,
    extra: Partial<LichHenInsertRow> = {},
  ): LichHenInsertRow => ({
    maLichHen: nextAppointmentCode(),
    khungGioId: w.slotIds[slot]!,
    benhNhanId: patientId,
    hoSoNguoiThanId: null,
    bacSiId: doctor.taiKhoanId,
    chiNhanhId: doctor.chiNhanhId,
    dichVuKhamId: doctor.dichVuKhamId,
    thoiGian: slots[slot]!.ngayGio,
    giaSnapshot: '100000.00',
    tienCocSnapshot: '0.00',
    chinhSachHoanSnapshot: null,
    trangThai: 'DaXacNhan',
    hanThanhToan: null,
    lyDoKham: null,
    thoiDiemTao: NOW,
    ...extra,
  });
  const parent = (slot: number) =>
    fx.appointmentIn('DaXacNhan', {
      doctor,
      khungGioId: w.slotIds[slot]!,
      patientId,
    });
  const insert = (r: LichHenInsertRow) =>
    db.transaction('READ COMMITTED', (em) => insertLichHen(em, r));
  return { ...w, patientId, row, parent, insert };
}

interface Stored {
  truoc: string | null;
  soLan: number;
  taoLuc: string;
  xacNhanLuc: string | null;
}
async function stored(lichHenId: string): Promise<Stored> {
  const rows: Stored[] = await db.query(
    `SELECT CAST(lich_hen_truoc_id AS CHAR) AS truoc, so_lan_tu_doi_lich AS soLan,
       DATE_FORMAT(thoi_diem_tao, '%Y-%m-%d %H:%i:%s') AS taoLuc, DATE_FORMAT(thoi_diem_xac_nhan, '%Y-%m-%d %H:%i:%s') AS xacNhanLuc
     FROM lich_hen WHERE lich_hen_id = ?`,
    [lichHenId],
  );
  const found = rows[0];
  if (found === undefined) throw new Error(`không có lịch ${lichHenId}`);
  return { ...found, soLan: Number(found.soLan) };
}

const insertedId = (outcome: { kind: string; lichHenId?: string }) => {
  if (outcome.kind !== 'Inserted' || outcome.lichHenId === undefined)
    throw new Error(`lẽ ra phải Inserted: ${outcome.kind}`);
  return outcome.lichHenId;
};

describe('HDL-08 insertLichHen nối chuỗi đổi lịch trên MySQL thật', () => {
  it('chèn thường (kiểu create, không truyền hai trường mới) ⇒ lich_hen_truoc_id NULL và so_lan_tu_doi_lich 0 (đúng giá trị mặc định của cột)', async () => {
    const w = await world();

    const id = insertedId(await w.insert(w.row(0)));

    expect(await stored(id)).toMatchObject({ truoc: null, soLan: 0 });
  });

  it('lịch con nối cha: hai cột ghi đúng; DaXacNhan ⇒ thoi_diem_xac_nhan = thoi_diem_tao (một mốc, không thêm tham số)', async () => {
    const w = await world();
    const parent = await w.parent(0);

    const id = insertedId(
      await w.insert(
        w.row(1, { lichHenTruocId: parent.lichHenId, soLanTuDoiLich: 1 }),
      ),
    );

    const child = await stored(id);
    expect(child.truoc).toBe(parent.lichHenId);
    expect(child.soLan).toBe(1);
    expect(child.taoLuc).toBe('2026-11-02 09:00:00');
    expect(child.xacNhanLuc).toBe(child.taoLuc);
  });

  it('lịch cha chưa bị đổi trạng thái: INSERT con KHÔNG ghi gì vào cha (markReplaced là việc riêng, sau INSERT)', async () => {
    const w = await world();
    const parent = await w.parent(0);

    await w.insert(w.row(1, { lichHenTruocId: parent.lichHenId }));

    const rows: { trangThai: string }[] = await db.query(
      'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
      [parent.lichHenId],
    );
    expect(rows[0]?.trangThai).toBe('DaXacNhan');
  });

  it('con THỨ HAI cùng cha (hai tab đổi cùng một lịch) ⇒ DuplicateChain bằng tên khoá THẬT của MySQL, không ném; giao dịch vẫn chèn tiếp được và commit; không có hàng thứ hai', async () => {
    const w = await world();
    const parent = await w.parent(0);
    await w.insert(w.row(1, { lichHenTruocId: parent.lichHenId }));

    const outcomes = await db.transaction('READ COMMITTED', async (em) => {
      const duplicate = await insertLichHen(
        em,
        w.row(2, { lichHenTruocId: parent.lichHenId }),
      );
      // sau 1062 giao dịch vẫn dùng được (X1 M2): chèn tiếp một lịch không liên quan trong CÙNG giao dịch
      const next = await insertLichHen(em, w.row(3));
      return { duplicate, next };
    });

    expect(outcomes.duplicate).toStrictEqual({ kind: 'DuplicateChain' });
    expect(outcomes.next.kind).toBe('Inserted');
    const children: { n: number | string }[] = await db.query(
      'SELECT COUNT(*) AS n FROM lich_hen WHERE lich_hen_truoc_id = ?',
      [parent.lichHenId],
    );
    expect(Number(children[0]?.n)).toBe(1);
  });

  it('ba khoá UNIQUE, ba kết quả: mã trùng ⇒ DuplicateCode; khung giờ đang giữ ⇒ DuplicateSlot; cha đã có con ⇒ DuplicateChain (không nhầm nhau)', async () => {
    const w = await world();
    const parent = await w.parent(0);
    await w.parent(4); // khung giờ 4 đã có lịch đang giữ
    const child = w.row(1, { lichHenTruocId: parent.lichHenId });
    await w.insert(child);

    expect(
      await w.insert(w.row(2, { maLichHen: child.maLichHen })),
    ).toStrictEqual({ kind: 'DuplicateCode' });
    expect(
      await w.insert(w.row(4, { maLichHen: nextAppointmentCode() })),
    ).toStrictEqual({ kind: 'DuplicateSlot' });
    expect(
      await w.insert(w.row(2, { lichHenTruocId: parent.lichHenId })),
    ).toStrictEqual({ kind: 'DuplicateChain' });
  });

  it('lịch cũ không tồn tại ⇒ khoá ngoại 1452 ném NGUYÊN (không bị nuốt thành kết quả có kiểu): người gọi hoàn tác', async () => {
    const w = await world();

    await expect(
      w.insert(w.row(1, { lichHenTruocId: '999999' })),
    ).rejects.toMatchObject({ errno: 1452 });
  });

  it('bộ đếm âm bị CHECK chk_lich_hen_so_lan_tu_doi của DB từ chối (3819), không bị hàm chèn che', async () => {
    const w = await world();

    await expect(
      w.insert(w.row(1, { soLanTuDoiLich: -1 })),
    ).rejects.toMatchObject({ errno: 3819 });
  });
});
