import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { holdRowLock } from '../testing/concurrency-harness.js';
import { lockVisitProfile, readVisitProfile } from '../visit-profile.query.js';

// Task B7 — BCK-07 (TRACKING booking 3.18.3): `readVisitProfile` trên MySQL 8.4 THẬT: bản thân, người thân hiệu lực, đã ngừng, của người khác, không tồn tại, id vượt BIGINT, và ĐỌC THƯỜNG:
// phiên khác `FOR UPDATE NOWAIT` lên đúng hàng hồ sơ THÀNH CÔNG ngay trong lúc ta đọc (đối chứng: `lockVisitProfile` thì làm phiên khác nhận 3572). Dữ liệu giả.
const ER_LOCK_NOWAIT = 3572;

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

/** `true` nếu MỘT KẾT NỐI KHÁC khoá được hàng hồ sơ ngay (không ai giữ), `false` nếu bị giữ (3572); lỗi khác thì ném. */
async function otherSessionCanLock(hoSoNguoiThanId: string): Promise<boolean> {
  try {
    const lock = await holdRowLock(
      db,
      'SELECT ho_so_nguoi_than_id FROM ho_so_nguoi_than WHERE ho_so_nguoi_than_id = ? FOR UPDATE NOWAIT',
      [hoSoNguoiThanId],
    );
    await lock.release();
    return true;
  } catch (error) {
    const errno = (error as { driverError?: { errno?: number } }).driverError
      ?.errno;
    if (errno === ER_LOCK_NOWAIT) return false;
    throw error;
  }
}

async function twoPatients() {
  const [a, b] = await fx.patients(2);
  if (a === undefined || b === undefined) throw new Error('thiếu Bệnh nhân');
  const owner = a.account.taiKhoanId;
  const other = b.account.taiKhoanId;
  return {
    owner,
    other,
    active: await fx.relative(owner),
    stopped: await fx.relative(owner, { active: false }),
    othersRelative: await fx.relative(other),
  };
}

describe('readVisitProfile trên MySQL thật (BCK-07)', () => {
  it('BCK-07 bản thân (null) ⇒ active; người thân hiệu lực ⇒ active; đã ngừng ⇒ inactive', async () => {
    const w = await twoPatients();

    expect(await readVisitProfile(db.manager, w.owner, null)).toBe('active');
    expect(await readVisitProfile(db.manager, w.owner, w.active)).toBe(
      'active',
    );
    expect(await readVisitProfile(db.manager, w.owner, w.stopped)).toBe(
      'inactive',
    );
  });

  it('BCK-07 hồ sơ của NGƯỜI KHÁC và id không tồn tại cho CÙNG kết quả missing (phạm vi chủ sở hữu nằm trong SQL, H3)', async () => {
    const w = await twoPatients();

    expect(await readVisitProfile(db.manager, w.owner, w.othersRelative)).toBe(
      'missing',
    );
    expect(await readVisitProfile(db.manager, w.owner, '999999999')).toBe(
      'missing',
    );
    // đúng chủ thì thấy: không phải hồ sơ nào cũng missing
    expect(await readVisitProfile(db.manager, w.other, w.othersRelative)).toBe(
      'active',
    );
  });

  it('BCK-07 id lớn hơn BIGINT lớn nhất ⇒ missing (không lỗi SQL, không khớp nhầm hồ sơ nào)', async () => {
    const w = await twoPatients();

    expect(
      await readVisitProfile(db.manager, w.owner, '99999999999999999999'),
    ).toBe('missing');
  });

  it('BCK-07 id hồ sơ lớn hơn 2^53 đi bằng CHUỖI: so chính xác, id kề bên không khớp nhầm', async () => {
    const w = await twoPatients();
    // Hồ sơ vừa tạo chưa có lịch nào trỏ tới nên đổi được khoá chính
    await db.query(
      'UPDATE ho_so_nguoi_than SET ho_so_nguoi_than_id = ? WHERE ho_so_nguoi_than_id = ?',
      ['9007199254740993', w.active],
    );

    expect(
      await readVisitProfile(db.manager, w.owner, '9007199254740993'),
    ).toBe('active');
    expect(
      await readVisitProfile(db.manager, w.owner, '9007199254740992'),
    ).toBe('missing');
    expect(
      await readVisitProfile(db.manager, w.owner, '9007199254740994'),
    ).toBe('missing');
  });

  it('BCK-07 ĐỌC THƯỜNG: trong lúc một giao dịch đang đọc hồ sơ, phiên khác FOR UPDATE NOWAIT lên đúng hàng đó THÀNH CÔNG ngay', async () => {
    const w = await twoPatients();

    const canLock = await db.transaction('READ COMMITTED', async (em) => {
      expect(await readVisitProfile(em, w.owner, w.active)).toBe('active');
      // giao dịch của ta còn mở: nếu câu đọc có khoá thì phiên khác sẽ nhận 3572
      return otherSessionCanLock(w.active);
    });

    expect(canLock).toBe(true);
  });

  it('BCK-07 đối chứng: lockVisitProfile (câu khoá của B8) GIỮ hàng, phiên khác nhận 3572, nên ca trên thật sự phân biệt được có khoá và không khoá', async () => {
    const w = await twoPatients();

    const canLock = await db.transaction('READ COMMITTED', async (em) => {
      expect(await lockVisitProfile(em, w.owner, w.active)).toBe('active');
      return otherSessionCanLock(w.active);
    });

    expect(canLock).toBe(false);
  });
});
