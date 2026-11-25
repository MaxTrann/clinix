import { join } from 'node:path';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';
import { ScriptedEntityManager } from '../testing/scripted-entity-manager.js';
import { RescheduleRequestRepository } from './reschedule-request.repository.js';

// reschedule B5 — XDL-29 `[đề xuất]` và SQL của `RescheduleRequestRepository` (không DB; chạy thật ở `reschedule-request.service.int-spec.ts` và `patient-appointment-detail.int-spec.ts`).
// XDL-29 quét mã nguồn: MỘT nơi `INSERT` yêu cầu, vì khoá "một `ChoDuyet` mỗi lịch" chỉ dựa khoá hàng `lich_hen` mà mọi đường tạo phải giữ (không có UNIQUE ở DB).
const SRC_DIR = join(import.meta.dirname, '..', '..');
const repository = new RescheduleRequestRepository();

describe('XDL-29 chỉ MỘT nơi trong mã sản xuất INSERT yêu cầu đổi lịch', () => {
  const INSERT_REQUEST =
    /\b(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?INTO\s+`?yeu_cau_doi_lich_ngoai_chinh_sach`?(?!\w)/i;

  it('đúng file reschedule-request.repository.ts (bỏ qua test, thư mục testing/ và comment)', () => {
    // Lọc rẻ bằng `includes` trước: chỉ vài file nhắc tên bảng mới phải qua `stripComments` (quét cả `src/` bằng regex bỏ comment trên mọi file chậm hơn 5 giây)
    const writers = listSourceFiles(SRC_DIR)
      .map((file) => ({ file, source: readSource(file) }))
      .filter(({ source }) =>
        source.includes('yeu_cau_doi_lich_ngoai_chinh_sach'),
      )
      .filter(({ source }) => INSERT_REQUEST.test(stripComments(source)))
      .map(({ file }) => file)
      .map((file) =>
        file
          .slice(SRC_DIR.length + 1)
          .split('\\')
          .join('/'),
      );
    expect(writers).toStrictEqual([
      'appointments/reschedule/reschedule-request.repository.ts',
    ]);
  });

  it('mẫu quét bắt đúng các dạng viết (hoa thường, có dấu nháy, IGNORE) và không bắt bảng tiền tố giống tên', () => {
    expect(
      INSERT_REQUEST.test('INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach (a)'),
    ).toBe(true);
    expect(
      INSERT_REQUEST.test('insert into `yeu_cau_doi_lich_ngoai_chinh_sach`'),
    ).toBe(true);
    expect(
      INSERT_REQUEST.test(
        'INSERT IGNORE INTO yeu_cau_doi_lich_ngoai_chinh_sach',
      ),
    ).toBe(true);
    expect(
      INSERT_REQUEST.test('SELECT 1 FROM yeu_cau_doi_lich_ngoai_chinh_sach'),
    ).toBe(false);
    expect(
      INSERT_REQUEST.test('INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach_khac'),
    ).toBe(false);
  });
});

describe('XDL-01 insert: SQL và tham số', () => {
  const em = (answer: unknown = { insertId: 501 }) =>
    new ScriptedEntityManager(() => answer);

  it('một câu INSERT, `trang_thai` là hằng ChoDuyet (không tham số), bốn tham số theo thứ tự cột; không NOW()', async () => {
    const scripted = em();
    await repository.insert(scripted.em, {
      lichHenId: '100',
      khungGioMongMuonId: '10',
      lyDoYeuCau: 'Tôi bận việc đột xuất',
      thoiDiemTao: new Date('2026-11-02T01:00:00.789Z'),
    });
    expect(scripted.queries).toHaveLength(1);
    const [{ sql, params }] = scripted.queries as [
      { sql: string; params: unknown[] },
    ];
    expect(sql).toMatch(/^INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach/);
    expect(sql).toContain("'ChoDuyet'");
    expect(sql).not.toMatch(/NOW\(|CURRENT_TIMESTAMP|SYSDATE/i);
    expect(sql.match(/\?/g)).toHaveLength(4);
    expect(params).toStrictEqual([
      '100',
      '10',
      'Tôi bận việc đột xuất',
      new Date('2026-11-02T01:00:00.000Z'),
    ]);
  });

  it('trả id là CHUỖI, kể cả khi driver trả số hay chuỗi lớn hơn 2^53', async () => {
    const small = await repository.insert(em({ insertId: 501 }).em, {
      lichHenId: '1',
      khungGioMongMuonId: '2',
      lyDoYeuCau: 'abcde',
      thoiDiemTao: new Date(),
    });
    expect(small).toBe('501');
    const big = await repository.insert(
      em({ insertId: '9007199254740993' }).em,
      {
        lichHenId: '1',
        khungGioMongMuonId: '2',
        lyDoYeuCau: 'abcde',
        thoiDiemTao: new Date(),
      },
    );
    expect(big).toBe('9007199254740993');
  });

  it('lỗi của câu INSERT (khoá ngoại, CHECK) lan ra nguyên vẹn', async () => {
    const scripted = em();
    const failure = new Error('khoá ngoại');
    scripted.failQuery = () => failure;
    await expect(
      repository.insert(scripted.em, {
        lichHenId: '1',
        khungGioMongMuonId: '2',
        lyDoYeuCau: 'abcde',
        thoiDiemTao: new Date(),
      }),
    ).rejects.toBe(failure);
  });
});

describe('DLH-43 findLatest: SQL và ánh xạ', () => {
  const row = {
    trangThai: 'TuChoi',
    thoiGianMongMuon: '2026-11-20 08:30:00',
    ghiChuXuLy: 'Bác sĩ nghỉ hôm đó',
    thoiDiemTao: '2026-11-10 09:15:30',
  };

  it('chọn yêu cầu MỚI NHẤT: thoi_diem_tao giảm dần rồi id giảm dần, LIMIT 1; không khoá; chỉ bốn cột của danh sách trắng', async () => {
    const scripted = new ScriptedEntityManager(() => [row]);
    await repository.findLatest(scripted.em, '100');
    const [{ sql, params }] = scripted.queries as [
      { sql: string; params: unknown[] },
    ];
    expect(params).toStrictEqual(['100']);
    expect(sql).toMatch(
      /ORDER BY yc\.thoi_diem_tao DESC, yc\.yeu_cau_doi_lich_ngoai_chinh_sach_id DESC\s+LIMIT 1/,
    );
    expect(sql).not.toMatch(/FOR\s+(UPDATE|SHARE)/i);
    expect(sql).not.toContain('ly_do_yeu_cau');
    expect(sql).not.toContain('nguoi_xu_ly');
    expect(sql).not.toContain('yeu_cau_doi_lich_ngoai_chinh_sach_id AS');
    expect(sql).toMatch(/WHERE yc\.lich_hen_id = \?/);
  });

  it('giờ là chuỗi giờ Việt Nam nguyên văn đổi sang Date đúng (+07:00); ghi chú giữ nguyên; trạng thái giữ nguyên', async () => {
    const scripted = new ScriptedEntityManager(() => [row]);
    await expect(
      repository.findLatest(scripted.em, '100'),
    ).resolves.toStrictEqual({
      trangThai: 'TuChoi',
      thoiGianMongMuon: new Date('2026-11-20T01:30:00.000Z'),
      ghiChuXuLy: 'Bác sĩ nghỉ hôm đó',
      thoiDiemTao: new Date('2026-11-10T02:15:30.000Z'),
    });
  });

  it('ChoDuyet có ghiChuXuLy null được giữ null (không đổi thành chuỗi rỗng)', async () => {
    const scripted = new ScriptedEntityManager(() => [
      { ...row, trangThai: 'ChoDuyet', ghiChuXuLy: null },
    ]);
    const latest = await repository.findLatest(scripted.em, '100');
    expect(latest?.ghiChuXuLy).toBeNull();
    expect(latest?.trangThai).toBe('ChoDuyet');
  });

  it('lịch chưa có yêu cầu nào ⇒ null', async () => {
    const scripted = new ScriptedEntityManager(() => []);
    await expect(repository.findLatest(scripted.em, '100')).resolves.toBeNull();
  });
});
