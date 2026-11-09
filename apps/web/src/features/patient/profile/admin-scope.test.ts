import { ROLE_LABELS } from '../../auth';
import {
  BRANCH_ROW_LABEL,
  SCOPE_ROW_LABEL,
  adminExtraRows,
  adminSubtitle,
  scopeLabel,
} from './admin-scope';
import { parseProfile } from './profile-service';
import type { Profile } from './profile-types';
import { SAMPLE_ADMIN, SAMPLE_ADMIN_BRANCH } from '../testing/fake-profile-api';

// patient F5 (TRACKING F5-D, F5-E): hàm thuần của phạm vi quản trị. Mã ca AS-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1.
const system = parseProfile(SAMPLE_ADMIN);
const branch = parseProfile(SAMPLE_ADMIN_BRANCH);
const BRANCH_NAME = 'CLINIX Chi nhánh Quận 3';

describe('scopeLabel', () => {
  it('AS-20 HS-21 hai mã ⇒ "Toàn hệ thống" và "Chi nhánh"; thiếu ⇒ null (giao diện hiện "Chưa cập nhật")', () => {
    expect(scopeLabel('ToanHeThong')).toBe('Toàn hệ thống');
    expect(scopeLabel('ChiNhanh')).toBe('Chi nhánh');
    expect(scopeLabel(undefined)).toBeNull();
  });
});

describe('adminSubtitle', () => {
  it('AS-22 HS-21 Toàn hệ thống ⇒ "Quản trị viên toàn hệ thống" (đúng Figma 510:2)', () => {
    expect(adminSubtitle(system)).toBe('Quản trị viên toàn hệ thống');
  });

  it('AS-23 HS-21 Chi nhánh ⇒ "Quản trị viên chi nhánh" (đúng Figma 620:2), KHÔNG kèm tên chi nhánh', () => {
    const subtitle = adminSubtitle(branch);
    expect(subtitle).toBe('Quản trị viên chi nhánh');
    expect(subtitle).not.toContain(BRANCH_NAME);
    expect(subtitle).not.toContain('·');
  });

  it('AS-24 HS-21 Chi nhánh mà chiNhanh thiếu ⇒ cùng một câu (không "undefined", không vỡ)', () => {
    const withoutBranch: Profile = { ...branch };
    delete withoutBranch.chiNhanh;
    expect(adminSubtitle(withoutBranch)).toBe('Quản trị viên chi nhánh');
  });

  it('AS-25 HS-21 phạm vi thiếu hay lạ ⇒ chỉ "Quản trị viên" (nhãn vai trò của auth)', () => {
    const withoutScope: Profile = { ...system };
    delete withoutScope.phamViQuanTri;
    expect(adminSubtitle(withoutScope)).toBe(ROLE_LABELS.QuanTriVien);
    expect(ROLE_LABELS.QuanTriVien).toBe('Quản trị viên');
  });
});

describe('adminExtraRows', () => {
  it('AS-27 HS-21 Toàn hệ thống ⇒ đúng MỘT hàng "Phạm vi quản trị" = "Toàn hệ thống"', () => {
    expect(adminExtraRows(system)).toEqual([
      { label: SCOPE_ROW_LABEL, value: 'Toàn hệ thống' },
    ]);
    expect(SCOPE_ROW_LABEL).toBe('Phạm vi quản trị');
  });

  it('AS-28 HS-21 Chi nhánh ⇒ hai hàng theo thứ tự: phạm vi "Chi nhánh", rồi "Chi nhánh quản trị" = tên chi nhánh', () => {
    expect(adminExtraRows(branch)).toEqual([
      { label: SCOPE_ROW_LABEL, value: 'Chi nhánh' },
      { label: BRANCH_ROW_LABEL, value: BRANCH_NAME },
    ]);
    expect(BRANCH_ROW_LABEL).toBe('Chi nhánh quản trị');
  });

  it('AS-29 HS-21 Toàn hệ thống mà API THỪA chiNhanh ⇒ KHÔNG có hàng chi nhánh (đột biến "hiện chi nhánh khi Toàn hệ thống")', () => {
    const rows = adminExtraRows({
      ...system,
      chiNhanh: { chiNhanhId: '3', ten: BRANCH_NAME },
    });
    expect(rows).toHaveLength(1);
    expect(rows.map((row) => row.label)).not.toContain(BRANCH_ROW_LABEL);
  });

  it('AS-30 HS-21 Chi nhánh mà chiNhanh thiếu ⇒ vẫn có hàng chi nhánh, giá trị trống (giao diện hiện "Chưa cập nhật")', () => {
    const withoutBranch: Profile = { ...branch };
    delete withoutBranch.chiNhanh;
    const rows = adminExtraRows(withoutBranch);
    expect(rows).toHaveLength(2);
    expect(rows[1].label).toBe(BRANCH_ROW_LABEL);
    expect(rows[1].value ?? null).toBeNull();
  });

  it('AS-31 HS-21 phạm vi thiếu ⇒ một hàng phạm vi trống và KHÔNG có hàng chi nhánh dù có chiNhanh', () => {
    const odd: Profile = {
      ...branch,
      chiNhanh: { chiNhanhId: '3', ten: BRANCH_NAME },
    };
    delete odd.phamViQuanTri;
    const rows = adminExtraRows(odd);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe(SCOPE_ROW_LABEL);
    expect(rows[0].value ?? null).toBeNull();
  });
});
