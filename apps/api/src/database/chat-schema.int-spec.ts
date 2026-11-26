import { QueryFailedError, type DataSource } from 'typeorm';
import { AdminFixtures } from '../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';
import { HoiThoai } from '../chat/entities/hoi-thoai.entity.js';
import { TaiKhoanHoiThoai } from '../chat/entities/tai-khoan-hoi-thoai.entity.js';
import { TinNhan } from '../chat/entities/tin-nhan.entity.js';
import { isDuplicateKeyError, isForeignKeyError } from './mysql-errors.js';

// chat P1 (#706) — ba bảng chat trên MySQL 8.4 THẬT: MCH-04 (ghi và đọc qua entity), MCH-05 (chk_hoi_thoai_chi_nhanh), MCH-06 (chk_tin_nhan_tep), MCH-07 (chk_tin_nhan_noi_dung, kể cả
// giả định "nội dung toàn dấu cách bị chặn" PLAN ghi là chưa đo), MCH-08 (UNIQUE mã gửi), MCH-09 (khóa ngoại của mốc đã đọc). MCH-01, MCH-11 ở migration-source.spec.ts; MCH-02 ở migrations.int-spec.ts;
// MCH-03 ở schema-parity.int-spec.ts; MCH-10 ở registry.spec.ts.
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});

const AT = '2026-11-27 08:00:00';
const MAX_BYTES = 10_485_760;

/** Lỗi MySQL mà câu lệnh ném ra; câu lệnh chạy thành công thì làm test đỏ. */
async function rejected(work: Promise<unknown>): Promise<QueryFailedError> {
  const error = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'câu lệnh phải bị MySQL từ chối').toBeInstanceOf(
    QueryFailedError,
  );
  return error as QueryFailedError;
}

/** Một bệnh nhân, một chi nhánh và một hội thoại hộp thư chung để chèn tin. */
async function world() {
  const branch = await fx.branch();
  const patient = await fx.patient();
  const conversation: { insertId: number | string } = await db.query(
    "INSERT INTO hoi_thoai (loai, chi_nhanh_id, nguoi_tao_id, thoi_diem_tao) VALUES ('BenhNhan_LeTan', ?, ?, ?)",
    [branch.chiNhanhId, patient.account.taiKhoanId, AT],
  );
  return {
    branchId: branch.chiNhanhId,
    patientId: patient.account.taiKhoanId,
    hoiThoaiId: String(conversation.insertId),
  };
}

interface MessageRow {
  maGui?: string | null;
  noiDung?: string;
  tep?: {
    khoa: string | null;
    ten: string | null;
    loai: string | null;
    dungLuong: number | null;
  };
}

async function insertMessage(
  w: Awaited<ReturnType<typeof world>>,
  row: MessageRow = {},
  senderId: string = w.patientId,
): Promise<string> {
  const tep = row.tep ?? { khoa: null, ten: null, loai: null, dungLuong: null };
  const result: { insertId: number | string } = await db.query(
    `INSERT INTO tin_nhan (hoi_thoai_id, nguoi_gui_id, ma_gui, noi_dung, tep_dinh_kem, tep_ten_goc, tep_loai, tep_dung_luong, thoi_diem_gui)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      w.hoiThoaiId,
      senderId,
      row.maGui ?? null,
      row.noiDung ?? 'Xin chào',
      tep.khoa,
      tep.ten,
      tep.loai,
      tep.dungLuong,
      AT,
    ],
  );
  return String(result.insertId);
}

const FULL_FILE = {
  khoa: 'chat/2026/11/abc.pdf',
  ten: 'ket-qua.pdf',
  loai: 'application/pdf',
  dungLuong: 2048,
};

describe('ba bảng chat trên MySQL thật', () => {
  it('MCH-05: chk_hoi_thoai_chi_nhanh: hộp thư Lễ tân thiếu chi nhánh và hội thoại Bác sĩ có chi nhánh bị từ chối; hai dạng đúng được nhận', async () => {
    const branch = await fx.branch();
    const patient = await fx.patient();
    const insert = (loai: string, chiNhanhId: string | null) =>
      db.query(
        'INSERT INTO hoi_thoai (loai, chi_nhanh_id, nguoi_tao_id, thoi_diem_tao) VALUES (?, ?, ?, ?)',
        [loai, chiNhanhId, patient.account.taiKhoanId, AT],
      );
    for (const [loai, chiNhanhId] of [
      ['BenhNhan_LeTan', null],
      ['BenhNhan_BacSi', branch.chiNhanhId],
    ] as const) {
      const error = await rejected(insert(loai, chiNhanhId));
      expect(error.message, loai).toContain('chk_hoi_thoai_chi_nhanh');
    }
    await insert('BenhNhan_LeTan', branch.chiNhanhId);
    await insert('BenhNhan_BacSi', null);
  });

  it('MCH-06: chk_tin_nhan_tep: thiếu một trong bốn cột tệp (kể cả chỉ thiếu tep_dung_luong), 0 byte, 10.485.761 byte bị từ chối; đủ bốn cột với 10.485.760 byte được nhận', async () => {
    const w = await world();
    const partials = [
      { ...FULL_FILE, khoa: null },
      { ...FULL_FILE, ten: null },
      { ...FULL_FILE, loai: null },
      // NULL BETWEEN … cho UNKNOWN mà CHECK chấp nhận UNKNOWN: phải bị chặn nhờ vế `tep_dung_luong IS NOT NULL` viết riêng
      { ...FULL_FILE, dungLuong: null },
      { khoa: null, ten: null, loai: null, dungLuong: 2048 },
      { ...FULL_FILE, dungLuong: 0 },
      { ...FULL_FILE, dungLuong: MAX_BYTES + 1 },
    ];
    for (const tep of partials) {
      const error = await rejected(insertMessage(w, { tep }));
      expect(error.message, JSON.stringify(tep)).toContain('chk_tin_nhan_tep');
    }
    await insertMessage(w, { tep: { ...FULL_FILE, dungLuong: MAX_BYTES } });
    await insertMessage(w, { tep: { ...FULL_FILE, dungLuong: 1 } });
  });

  it("MCH-07: chk_tin_nhan_noi_dung: '' không tệp bị từ chối; '   ' (toàn dấu cách) không tệp CŨNG bị từ chối (so chuỗi có đệm khoảng trắng); '' có tệp được nhận", async () => {
    const w = await world();
    for (const noiDung of ['', '   ']) {
      const error = await rejected(insertMessage(w, { noiDung }));
      expect(error.message, JSON.stringify(noiDung)).toContain(
        'chk_tin_nhan_noi_dung',
      );
    }
    await insertMessage(w, { noiDung: '', tep: FULL_FILE });
  });

  it('MCH-08: trùng (nguoi_gui_id, ma_gui) bị UNIQUE chặn (1062, đúng tên chỉ mục); nhiều ma_gui NULL và cùng ma_gui của người gửi khác được nhận', async () => {
    const w = await world();
    const ma = '6f1c2a4e-1b7d-4c2a-9a55-0c2f0f3d9e01';
    await insertMessage(w, { maGui: ma });
    const duplicate = await rejected(insertMessage(w, { maGui: ma }));
    expect(isDuplicateKeyError(duplicate)).toBe(true);
    expect(duplicate.message).toContain('tin_nhan_index_nguoi_gui_ma_gui');

    await insertMessage(w, { maGui: null });
    await insertMessage(w, { maGui: null });
    const other = await fx.patient();
    await insertMessage(w, { maGui: ma }, other.account.taiKhoanId);
    const [{ total }] = (await db.query(
      'SELECT COUNT(*) AS total FROM tin_nhan',
    )) as [{ total: string | number }];
    expect(Number(total)).toBe(4);
  });

  it('MCH-09: mốc đã đọc trỏ tới tin không tồn tại bị khóa ngoại chặn; trỏ tin có thật được nhận', async () => {
    const w = await world();
    const error = await rejected(
      db.query(
        'INSERT INTO tai_khoan_hoi_thoai (tai_khoan_id, hoi_thoai_id, tin_nhan_cuoi_da_doc_id) VALUES (?, ?, ?)',
        [w.patientId, w.hoiThoaiId, '999999999'],
      ),
    );
    expect(isForeignKeyError(error)).toBe(true);
    const tinNhanId = await insertMessage(w);
    await db.query(
      'INSERT INTO tai_khoan_hoi_thoai (tai_khoan_id, hoi_thoai_id, tin_nhan_cuoi_da_doc_id) VALUES (?, ?, ?)',
      [w.patientId, w.hoiThoaiId, tinNhanId],
    );
  });

  it('MCH-04: ghi và đọc qua ba entity: đúng tên cột, kiểu (bigint là chuỗi, int là số, NULL giữ NULL)', async () => {
    const branch = await fx.branch();
    const patient = await fx.patient();
    const conversation = await db.getRepository(HoiThoai).save({
      loai: 'BenhNhan_LeTan',
      chiNhanhId: branch.chiNhanhId,
      nguoiTaoId: patient.account.taiKhoanId,
      thoiDiemTao: new Date('2026-11-27T08:00:00+07:00'),
    });
    const message = await db.getRepository(TinNhan).save({
      hoiThoaiId: conversation.hoiThoaiId,
      nguoiGuiId: patient.account.taiKhoanId,
      maGui: '0b6c1f7a-5a9e-4f7e-8d1c-2a3b4c5d6e7f',
      noiDung: '',
      tepDinhKem: FULL_FILE.khoa,
      tepTenGoc: FULL_FILE.ten,
      tepLoai: FULL_FILE.loai,
      tepDungLuong: FULL_FILE.dungLuong,
      thoiDiemGui: new Date('2026-11-27T08:01:00+07:00'),
    });
    await db.getRepository(TaiKhoanHoiThoai).save({
      taiKhoanId: patient.account.taiKhoanId,
      hoiThoaiId: conversation.hoiThoaiId,
      tinNhanCuoiDaDocId: null,
    });

    const read = await db
      .getRepository(TinNhan)
      .findOneByOrFail({ tinNhanId: message.tinNhanId });
    expect(read).toMatchObject({
      hoiThoaiId: String(conversation.hoiThoaiId),
      maGui: '0b6c1f7a-5a9e-4f7e-8d1c-2a3b4c5d6e7f',
      noiDung: '',
      tepDungLuong: 2048,
    });
    expect(typeof read.tinNhanId).toBe('string');
    const member = await db.getRepository(TaiKhoanHoiThoai).findOneByOrFail({
      taiKhoanId: patient.account.taiKhoanId,
      hoiThoaiId: conversation.hoiThoaiId,
    });
    expect(member.tinNhanCuoiDaDocId).toBeNull();
    const savedConversation = await db
      .getRepository(HoiThoai)
      .findOneByOrFail({ hoiThoaiId: conversation.hoiThoaiId });
    expect(savedConversation.loai).toBe('BenhNhan_LeTan');
  });
});
