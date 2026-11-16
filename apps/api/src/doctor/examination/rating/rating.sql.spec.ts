import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { EntityManager } from 'typeorm';
import { stripComments } from '../../testing/architecture-scan.js';
import {
  INSERT_RATING_SQL,
  insertRating,
  READ_OWNED_FOR_RATING_SQL,
  READ_RATING_SQL,
  readOwnedForRating,
  readRating,
} from './rating.repository.js';

// doctor-exam B6 — luật quét câu SQL THẬT của gửi đánh giá (DGB-20 `[đề xuất]`; PLAN 5.3, 5.7; H8, H10, HD-08; mẫu `patient-exam-detail.sql.spec` của B5). Không DB: `EntityManager` giả chỉ ghi câu và tham số
// mà repository THẬT gửi đi (không gõ lại câu ở test). Bài học B4 (M7 lọt AR-05) và B5: đổi thứ tự điều kiện chủ sở hữu nhất quán ở cả câu lẫn tham số cho CÙNG kết quả đúng ở mọi ca hành vi; chỉ luật quét câu này bắt.
const CODE = 'CLX-20261110-7K3QD';
const NOW = new Date('2026-11-10T09:00:00+07:00');
const DIR = fileURLToPath(new URL('.', import.meta.url));

interface Sent {
  sql: string;
  params: unknown[];
}

/** `EntityManager` giả ghi câu và tham số; `answer` là hàng trả về cho mọi câu. */
function recorder(answer: unknown[] = []) {
  const sent: Sent[] = [];
  const em = {
    query: (sql: string, params: unknown[]) => {
      sent.push({ sql, params });
      return Promise.resolve(answer);
    },
  } as unknown as EntityManager;
  return { em, sent };
}

/** Các điều kiện của `WHERE`, theo thứ tự viết, bỏ khoảng trắng thừa. */
const conditionsOf = (sql: string): string[] =>
  (/\bWHERE\b([\s\S]*)$/i.exec(sql)?.[1] ?? '')
    .split(/\bAND\b/i)
    .map((part) => part.replace(/\s+/g, ' ').trim());

const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('DGB-20 câu đọc chủ sở hữu: một câu SELECT, chủ sở hữu ĐẦU TIÊN, không khoá, không trạng thái', () => {
  it('đúng MỘT câu SELECT với đúng hai tham số theo thứ tự (Bệnh nhân rồi mã); không ghi, không khoá', async () => {
    const { em, sent } = recorder([
      { lichHenId: '900', trangThai: 'DaXacNhan' },
    ]);
    const owned = await readOwnedForRating(em, '55', CODE);
    expect(sent).toHaveLength(1);
    const { sql, params } = sent[0] ?? { sql: '', params: [] };
    expect(sql).toMatch(/^\s*SELECT\b/i);
    expect(params).toEqual(['55', CODE]);
    expect(sql.match(/\?/g)).toHaveLength(2);
    expect(sql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|REPLACE|FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE|FOR\s+SHARE)\b/i,
    );
    expect(owned).toEqual({ lichHenId: '900', trangThai: 'DaXacNhan' });
  });

  it('điều kiện: `benh_nhan_id = ?` ĐẦU TIÊN rồi `ma_lich_hen = ?`; KHÔNG điều kiện trạng thái (trạng thái kiểm SAU sở hữu ở service, để lịch người khác không lộ trạng thái)', () => {
    expect(conditionsOf(READ_OWNED_FOR_RATING_SQL)).toEqual([
      'benh_nhan_id = ?',
      'ma_lich_hen = ?',
    ]);
    expect(READ_OWNED_FOR_RATING_SQL).not.toMatch(/trang_thai\s*(=|IN|<>)/i);
  });

  it('không dòng ⇒ null; chỉ đọc đúng hai cột, id qua CAST … AS CHAR (id là bigint)', async () => {
    const { em } = recorder([]);
    expect(await readOwnedForRating(em, '55', CODE)).toBeNull();
    expect(READ_OWNED_FOR_RATING_SQL).toContain(
      'CAST(lich_hen_id AS CHAR) AS lichHenId',
    );
    expect(READ_OWNED_FOR_RATING_SQL).toContain('trang_thai AS trangThai');
    expect(READ_OWNED_FOR_RATING_SQL).not.toMatch(/\*/);
  });
});

describe('DGB-20 INSERT: đúng sáu cột, bi_an = 0 và ly_do_an = NULL là HẰNG trong câu; tham số theo thứ tự', () => {
  it('một câu INSERT vào danh_gia_bac_si; bốn tham số [lichHenId, soSao, nhanXet, now] khớp bốn dấu ?', async () => {
    const { em, sent } = recorder();
    await insertRating(em, '900', { soSao: 4, nhanXet: 'Tốt' }, NOW);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.params).toEqual(['900', 4, 'Tốt', NOW]);
    expect(INSERT_RATING_SQL.match(/\?/g)).toHaveLength(4);
    expect(squash(INSERT_RATING_SQL)).toBe(
      'INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, nhan_xet, bi_an, ly_do_an, thoi_diem_tao) VALUES (?, ?, ?, 0, NULL, ?)',
    );
  });

  it('nhận xét null đi đúng là null (cột NULL), không chuỗi rỗng', async () => {
    const { em, sent } = recorder();
    await insertRating(em, '900', { soSao: 1, nhanXet: null }, NOW);
    expect(sent[0]?.params[2]).toBeNull();
  });
});

describe('DGB-20 câu đọc lại: UNIQUE lich_hen_id, KHÔNG lấy bi_an, ly_do_an (Q19); ánh xạ đúng hình dạng 201', () => {
  it('một tham số lich_hen_id; SELECT ba cột; không nhắc cột ẩn', async () => {
    const { em, sent } = recorder([
      { soSao: 4, nhanXet: null, thoiDiemTao: NOW },
    ]);
    await readRating(em, '900');
    expect(sent).toEqual([{ sql: READ_RATING_SQL, params: ['900'] }]);
    expect(conditionsOf(READ_RATING_SQL)).toEqual(['lich_hen_id = ?']);
    expect(READ_RATING_SQL).not.toMatch(/bi_an|ly_do_an/i);
  });

  it('so_sao (tinyint, driver có thể trả chuỗi) ⇒ số; thoi_diem_tao ⇒ ISO UTC; nhận xét NULL giữ null; không dòng ⇒ null', async () => {
    const view = await readRating(
      recorder([{ soSao: '5', nhanXet: 'Rất tốt', thoiDiemTao: NOW }]).em,
      '900',
    );
    expect(view).toEqual({
      soSao: 5,
      nhanXet: 'Rất tốt',
      thoiDiemTao: '2026-11-10T02:00:00.000Z',
    });
    expect(
      (
        await readRating(
          recorder([{ soSao: 1, nhanXet: null, thoiDiemTao: NOW }]).em,
          '900',
        )
      )?.nhanXet,
    ).toBeNull();
    expect(await readRating(recorder([]).em, '900')).toBeNull();
  });
});

// Quét VĂN BẢN mọi file mã (không phải spec) của rating/: file MỚI thêm sau này cũng bị quét. Comment được bỏ trước khi quét.
const codeOf = readdirSync(DIR)
  .filter(
    (name) => name.endsWith('.ts') && !/\.(spec|int-spec)\.ts$/.test(name),
  )
  .map((name) => ({
    name,
    code: stripComments(readFileSync(`${DIR}${name}`, 'utf8')),
  }));

describe('DGB-20 quét văn bản mọi file mã của rating/ (không phải spec)', () => {
  it('quét ĐÚNG các file mong đợi (nếu không thì luật vô nghĩa)', () => {
    expect(codeOf.map((file) => file.name).toSorted()).toEqual([
      'rating.controller.ts',
      'rating.dto.ts',
      'rating.failure.ts',
      'rating.repository.ts',
      'rating.rules.ts',
      'rating.service.ts',
    ]);
  });

  it('SQL chỉ nằm ở rating.repository.ts: file khác không có từ khoá SQL', () => {
    for (const { name, code } of codeOf)
      if (name !== 'rating.repository.ts')
        expect(code, name).not.toMatch(
          /\b(?:SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/,
        );
  });

  it('không FOR UPDATE, LOCK IN SHARE MODE, SELECT *, UPDATE, DELETE, REPLACE, giờ hệ thống, hàm ngày trên thoi_gian; thời gian chỉ đi vào qua tham số', () => {
    for (const { name, code } of codeOf)
      expect(code, name).not.toMatch(
        /FOR\s+UPDATE|LOCK\s+IN\s+SHARE|FOR\s+SHARE|SELECT\s+\*|\bUPDATE\s+\w|\bDELETE\b|\bREPLACE\b|\bNOW\s*\(|CURDATE\s*\(|CURRENT_TIMESTAMP|SYSDATE\s*\(|\b(?:DATE|MONTH|YEAR|DATE_FORMAT)\s*\(/i,
      );
  });

  it('chỉ chạm hai bảng lich_hen (chỉ ĐỌC) và danh_gia_bac_si (INSERT và đọc); không nhật ký, thông báo, thư, hồ sơ khám', () => {
    for (const { name, code } of codeOf) {
      const tables = [
        ...code.matchAll(/\b(?:FROM|JOIN|INTO)\s+`?(\w+)`?/gi),
      ].map((match) => match[1]);
      for (const table of tables)
        expect(
          ['lich_hen', 'danh_gia_bac_si'],
          `${name}: ${String(table)}`,
        ).toContain(table);
      expect(code, name).not.toMatch(
        /nhat_ky|thong_bao|email_thong_bao|ho_so_kham|AuditService|ExamNotifier|AppointmentTransitionService/,
      );
    }
    expect(squash(READ_OWNED_FOR_RATING_SQL)).toMatch(/FROM lich_hen WHERE/);
    expect(READ_OWNED_FOR_RATING_SQL).not.toMatch(/\bJOIN\b/i);
  });

  it('cột ẩn bi_an, ly_do_an chỉ xuất hiện trong câu INSERT (hằng 0 và NULL); không file nào khác, không dạng biAn, lyDoAn', () => {
    for (const { name, code } of codeOf) {
      if (name === 'rating.repository.ts') continue;
      expect(code, name).not.toMatch(/bi_an|ly_do_an|biAn|lyDoAn/);
    }
    const select =
      codeOf.find((f) => f.name === 'rating.repository.ts')?.code ?? '';
    const withoutInsert = select.replace(
      /INSERT INTO danh_gia_bac_si[\s\S]*?VALUES \([^)]*\)/,
      '',
    );
    expect(withoutInsert).not.toMatch(/bi_an|ly_do_an/);
  });

  it('không ghi log (không Logger, không console): nhận xét và mã lịch không bao giờ vào log (BDK-01)', () => {
    for (const { name, code } of codeOf)
      expect(code, name).not.toMatch(/\bLogger\b|\bconsole\./);
  });
});
