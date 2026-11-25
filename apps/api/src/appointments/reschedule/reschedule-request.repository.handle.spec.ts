import { join } from 'node:path';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';
import { ScriptedEntityManager } from '../testing/scripted-entity-manager.js';
import { RescheduleRequestRepository } from './reschedule-request.repository.js';

// reschedule B9 — HDL-36 (SQL của ba phương thức B9 thêm vào repository: `findForHandling`, `markApproved`, `markRejected`; quét mã nguồn: chỉ repository `UPDATE` bảng yêu cầu, hai dịch vụ B9 không có SQL). Không DB;
// chạy thật ở `reschedule-request-approve.service.int-spec.ts` và `reschedule-request-reject.service.int-spec.ts`. Ca của B5 và B8 ở `reschedule-request.repository.spec.ts` và `.list.spec.ts` không đổi.
const SRC_DIR = join(import.meta.dirname, '..', '..');
const repository = new RescheduleRequestRepository();

type Recorded = { sql: string; params: unknown[] };
const only = (scripted: ScriptedEntityManager): Recorded => {
  expect(scripted.queries).toHaveLength(1);
  return scripted.queries[0] as Recorded;
};

const HANDLING_ROW = {
  yeuCauId: '9007199254740993',
  trangThai: 'ChoDuyet',
  lichHenId: '31',
  maLichHen: 'CLX-20261110-AAA01',
  benhNhanId: '41',
  chiNhanhId: '5',
  khungGioMongMuonId: '61',
  thoiGianMongMuon: '2026-11-20 08:30:00',
};

describe('HDL-36 findForHandling: SQL, phạm vi trong SQL, ánh xạ', () => {
  it('có chi nhánh: MỘT câu SELECT theo khoá chính kèm `AND lh.chi_nhanh_id = ?` (phạm vi TRONG SQL), tham số [id yêu cầu, chi nhánh]; không khoá', async () => {
    const scripted = new ScriptedEntityManager(() => [HANDLING_ROW]);
    await repository.findForHandling(scripted.em, '5', '9007199254740993');
    const { sql, params } = only(scripted);
    expect(params).toStrictEqual(['9007199254740993', '5']);
    expect(sql).toMatch(
      /WHERE yc\.yeu_cau_doi_lich_ngoai_chinh_sach_id = \?\s+AND lh\.chi_nhanh_id = \?$/,
    );
    expect(sql.match(/\?/g)).toHaveLength(2);
    expect(sql).not.toMatch(/FOR\s+(UPDATE|SHARE)/i);
    expect(sql).toMatch(/^SELECT /);
  });

  it('chi nhánh undefined (Toàn hệ thống): KHÔNG điều kiện chi nhánh, một tham số', async () => {
    const scripted = new ScriptedEntityManager(() => [HANDLING_ROW]);
    await repository.findForHandling(scripted.em, undefined, '12');
    const { sql, params } = only(scripted);
    expect(params).toStrictEqual(['12']);
    expect(sql).not.toMatch(/AND lh\.chi_nhanh_id = \?/);
    expect(sql.match(/\?/g)).toHaveLength(1);
  });

  it('đọc đủ các cột đường ghi cần (benh_nhan_id cho thông báo từ chối, chi_nhanh_id cho Audit) bằng CAST … AS CHAR; giờ bằng DATE_FORMAT (chuỗi giờ Việt Nam nguyên văn)', async () => {
    const scripted = new ScriptedEntityManager(() => [HANDLING_ROW]);
    await repository.findForHandling(scripted.em, '5', '12');
    const { sql } = only(scripted);
    for (const column of [
      'CAST(yc.yeu_cau_doi_lich_ngoai_chinh_sach_id AS CHAR) AS yeuCauId',
      'yc.trang_thai AS trangThai',
      'CAST(lh.lich_hen_id AS CHAR) AS lichHenId',
      'lh.ma_lich_hen AS maLichHen',
      'CAST(lh.benh_nhan_id AS CHAR) AS benhNhanId',
      'CAST(lh.chi_nhanh_id AS CHAR) AS chiNhanhId',
      'CAST(yc.khung_gio_mong_muon_id AS CHAR) AS khungGioMongMuonId',
      "DATE_FORMAT(kg.ngay_gio, '%Y-%m-%d %H:%i:%s') AS thoiGianMongMuon",
    ])
      expect(sql, column).toContain(column);
    expect(sql).not.toContain('ly_do_yeu_cau');
    expect(sql).not.toContain('ho_ten');
    expect(sql).not.toMatch(/NOW\(|CURRENT_TIMESTAMP/i);
  });

  it('ánh xạ: id giữ là chuỗi (kể cả lớn hơn 2^53), trạng thái nguyên, giờ mong muốn thành Date đúng (+07:00)', async () => {
    const scripted = new ScriptedEntityManager(() => [HANDLING_ROW]);
    await expect(
      repository.findForHandling(scripted.em, '5', '9007199254740993'),
    ).resolves.toStrictEqual({
      yeuCauId: '9007199254740993',
      trangThai: 'ChoDuyet',
      lichHenId: '31',
      maLichHen: 'CLX-20261110-AAA01',
      benhNhanId: '41',
      chiNhanhId: '5',
      khungGioMongMuonId: '61',
      thoiGianMongMuon: new Date('2026-11-20T01:30:00.000Z'),
    });
  });

  it('không có hàng ⇒ null (không tồn tại và ngoài phạm vi cùng ra null)', async () => {
    const scripted = new ScriptedEntityManager(() => []);
    await expect(
      repository.findForHandling(scripted.em, '5', '12'),
    ).resolves.toBeNull();
  });

  it('lỗi của câu SELECT lan ra nguyên vẹn', async () => {
    const scripted = new ScriptedEntityManager(() => []);
    const failure = new Error('mất kết nối');
    scripted.failQuery = () => failure;
    await expect(
      repository.findForHandling(scripted.em, '5', '12'),
    ).rejects.toBe(failure);
  });
});

describe('HDL-36 markApproved và markRejected: UPDATE có điều kiện ChoDuyet, tham số theo thứ tự', () => {
  const mark = {
    yeuCauId: '9007199254740993',
    ghiChu: 'Đã xếp sang khung giờ chiều',
    nguoiXuLyId: '77',
    thoiDiemXuLy: new Date('2026-11-02T01:00:00.789Z'),
  };
  const ok = () => new ScriptedEntityManager(() => ({ affectedRows: 1 }));

  it.each([
    ['markApproved', 'DaDuyet'],
    ['markRejected', 'TuChoi'],
  ] as const)(
    "%s: MỘT câu UPDATE, trạng thái đích là tham số đầu (%s), `WHERE … AND trang_thai = 'ChoDuyet'`, thời điểm xử lý cắt xuống giây, không NOW()",
    async (method, state) => {
      const scripted = ok();
      await repository[method](scripted.em, mark);
      const { sql, params } = only(scripted);
      expect(sql).toMatch(/^UPDATE yeu_cau_doi_lich_ngoai_chinh_sach\b/);
      expect(sql).toMatch(
        /WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = \? AND trang_thai = 'ChoDuyet'$/,
      );
      expect(sql).toMatch(
        /SET trang_thai = \?, ghi_chu_xu_ly = \?, nguoi_xu_ly_id = \?, thoi_diem_xu_ly = \?/,
      );
      expect(sql).not.toMatch(/NOW\(|CURRENT_TIMESTAMP|SYSDATE/i);
      expect(sql.match(/\?/g)).toHaveLength(5);
      expect(params).toStrictEqual([
        state,
        'Đã xếp sang khung giờ chiều',
        '77',
        new Date('2026-11-02T01:00:00.000Z'),
        '9007199254740993',
      ]);
    },
  );

  it.each(['markApproved', 'markRejected'] as const)(
    '%s: không còn đúng một hàng ChoDuyet (0 hàng) ⇒ ném Error (hoàn tác giao dịch của người gọi); thông điệp KHÔNG mang ghi chú hay id',
    async (method) => {
      const scripted = new ScriptedEntityManager(() => ({ affectedRows: 0 }));
      const error = await repository[method](scripted.em, mark).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).not.toContain(mark.ghiChu);
      expect(message).not.toContain(mark.yeuCauId);
      expect(message).not.toContain(mark.nguoiXuLyId);
    },
  );

  it.each([undefined, 2])(
    'affectedRows %s (khác đúng 1) cũng ném',
    async (affectedRows) => {
      const scripted = new ScriptedEntityManager(() => ({ affectedRows }));
      await expect(
        repository.markApproved(scripted.em, mark),
      ).rejects.toThrow();
    },
  );

  it('lỗi của câu UPDATE (CHECK, khoá ngoại) lan ra nguyên vẹn', async () => {
    const scripted = ok();
    const failure = new Error('CHECK');
    scripted.failQuery = () => failure;
    await expect(repository.markRejected(scripted.em, mark)).rejects.toBe(
      failure,
    );
  });
});

describe('HDL-36 quét mã nguồn: chỉ repository UPDATE bảng yêu cầu; dịch vụ B9 không có SQL', () => {
  const UPDATE_REQUEST =
    /\bUPDATE\s+`?yeu_cau_doi_lich_ngoai_chinh_sach`?(?!\w)/i;
  const rel = (file: string) =>
    file
      .slice(SRC_DIR.length + 1)
      .split('\\')
      .join('/');

  it('đúng file reschedule-request.repository.ts (bỏ qua test, thư mục testing/ và comment)', () => {
    const writers = listSourceFiles(SRC_DIR)
      .map((file) => ({ file, source: readSource(file) }))
      .filter(({ source }) =>
        source.includes('yeu_cau_doi_lich_ngoai_chinh_sach'),
      )
      .filter(({ source }) => UPDATE_REQUEST.test(stripComments(source)))
      .map(({ file }) => rel(file));
    expect(writers).toStrictEqual([
      'appointments/reschedule/reschedule-request.repository.ts',
    ]);
  });

  it('mẫu quét bắt đúng các dạng viết và không bắt bảng tiền tố giống tên', () => {
    expect(
      UPDATE_REQUEST.test('UPDATE yeu_cau_doi_lich_ngoai_chinh_sach SET a = 1'),
    ).toBe(true);
    expect(
      UPDATE_REQUEST.test('update `yeu_cau_doi_lich_ngoai_chinh_sach`'),
    ).toBe(true);
    expect(
      UPDATE_REQUEST.test('UPDATE yeu_cau_doi_lich_ngoai_chinh_sach_khac'),
    ).toBe(false);
    expect(
      UPDATE_REQUEST.test('SELECT 1 FROM yeu_cau_doi_lich_ngoai_chinh_sach'),
    ).toBe(false);
  });

  it('hai dịch vụ B9, scope, mapper, DTO và failure KHÔNG có SQL, `.query(`, `.transaction(` hay QueryBuilder (SQL chỉ ở repository và ở khoá của B1)', () => {
    const files = [
      'reschedule-request-approve.service.ts',
      'reschedule-request-reject.service.ts',
      'reschedule-request-handle.scope.ts',
      'reschedule-request-handle.mapper.ts',
      'reschedule-request-handle.dto.ts',
      'reschedule-request-failure.ts',
    ].map((name) => join(SRC_DIR, 'appointments', 'reschedule', name));
    for (const file of files) {
      const source = stripComments(readSource(file));
      expect(source, file).not.toMatch(
        /\.query\(|\.transaction\(|createQueryBuilder|\bSELECT\b[\s\S]{0,80}\bFROM\b|\b(?:INSERT|UPDATE|DELETE)\b\s+(?:INTO\s+)?\w+_\w+/,
      );
    }
  });
});
