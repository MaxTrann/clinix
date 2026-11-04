import { describe, expect, it } from 'vitest';
import { haversineKm, nearestBranch, type BranchPoint } from './nearest-branch';

const branch = (
  chiNhanhId: string,
  toaDoLat: string | null,
  toaDoLng: string | null,
): BranchPoint => ({ chiNhanhId, toaDoLat, toaDoLng });

// TP.HCM và Hà Nội (toạ độ minh hoạ)
const HCM = { lat: 10.7769, lng: 106.7009 };
const HANOI = { lat: 21.0285, lng: 105.8542 };

describe('search F2 — nearestBranch (CNC-05)', () => {
  it('chọn chi nhánh gần vị trí nhất', () => {
    const list = [
      branch('1', '10.7769000', '106.7009000'),
      branch('2', '21.0285000', '105.8542000'),
    ];
    expect(nearestBranch(list, { lat: 20.9, lng: 105.9 })).toBe('2');
    expect(nearestBranch(list, { lat: 10.8, lng: 106.6 })).toBe('1');
  });

  it('bỏ qua chi nhánh thiếu hoặc sai toạ độ; không chi nhánh nào có ⇒ null', () => {
    const list = [
      branch('1', null, null),
      branch('2', '10.7', null),
      branch('3', 'abc', '106'),
      branch('4', '95.0', '106'),
    ];
    expect(nearestBranch(list, HCM)).toBeNull();
    expect(nearestBranch([...list, branch('5', '10.7', '106.7')], HCM)).toBe(
      '5',
    );
  });

  it('khoảng cách bằng nhau ⇒ id nhỏ hơn, bất kể thứ tự đầu vào', () => {
    const a = branch('9', '10.7769000', '106.7009000');
    const b = branch('10', '10.7769000', '106.7009000');
    expect(nearestBranch([a, b], HCM)).toBe('9');
    expect(nearestBranch([b, a], HCM)).toBe('9');
  });

  it('id lớn hơn số nguyên an toàn vẫn so đúng', () => {
    const big = branch('9223372036854775806', '10.0', '106.0');
    const bigger = branch('9223372036854775807', '10.0', '106.0');
    expect(nearestBranch([bigger, big], HCM)).toBe('9223372036854775806');
  });

  it('một chi nhánh duy nhất ⇒ chính nó, dù ở xa', () => {
    expect(nearestBranch([branch('7', '21.0', '105.8')], HCM)).toBe('7');
  });

  it('điểm gần kinh tuyến 180: 179,9 và -179,9 chỉ cách nhau khoảng 22 km', () => {
    const distance = haversineKm(
      { lat: 0, lng: 179.9 },
      { lat: 0, lng: -179.9 },
    );
    expect(distance).toBeGreaterThan(20);
    expect(distance).toBeLessThan(25);
    const list = [branch('1', '0', '-179.9'), branch('2', '0', '100')];
    expect(nearestBranch(list, { lat: 0, lng: 179.9 })).toBe('1');
  });

  it('haversineKm: HCM – Hà Nội khoảng 1.140 km', () => {
    const distance = haversineKm(HCM, HANOI);
    expect(distance).toBeGreaterThan(1100);
    expect(distance).toBeLessThan(1200);
  });

  it('danh sách rỗng ⇒ null', () => {
    expect(nearestBranch([], HCM)).toBeNull();
  });
});
