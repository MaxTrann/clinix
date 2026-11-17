import type {
  DoctorDaySlots,
  DoctorSlotsById,
  PublicSlot,
  SlotDayStatus,
  SlotShift,
  SlotStatus,
} from '../../api/slot-types';

// Dữ liệu mẫu cho test khung giờ (search PR-C2), dựng đúng hình dạng JSON thật của `GET /public/doctor-slots` (e2e KGC-43 của PR-C1).
// Giờ viết theo GIỜ VIỆT NAM (`gio` = "09:30"), đổi sang ISO UTC như máy chủ trả (`...Z`).

export const NGAY = '2026-11-18';

export function vnIso(ngay: string, gio: string): string {
  return new Date(`${ngay}T${gio}:00+07:00`).toISOString();
}

export function slot(
  khungGioId: string,
  gio: string,
  trangThai: SlotStatus = 'ConTrong',
  ca: SlotShift = 'CaSang',
  ngay: string = NGAY,
): PublicSlot {
  const [hour, minute] = gio.split(':').map(Number);
  const end = `${String(hour + Math.floor((minute + 30) / 60)).padStart(2, '0')}:${String((minute + 30) % 60).padStart(2, '0')}`;
  return {
    khungGioId,
    batDau: vnIso(ngay, gio),
    ketThuc: vnIso(ngay, end),
    ca,
    trangThai,
  };
}

export function day(
  bacSiId: string,
  khungGio: PublicSlot[] = [],
  trangThaiNgay: SlotDayStatus = 'CoLich',
  thuNghi?: number,
): DoctorDaySlots {
  return {
    bacSiId,
    trangThaiNgay,
    ...(thuNghi !== undefined && { thuNghi }),
    khungGio,
  };
}

// Thân 200 thô (`unknown` ở nơi bộ đọc nhận)
export function rawResponse(ngay: string, days: DoctorDaySlots[]) {
  return { ngay, items: days };
}

export function slotsById(days: DoctorDaySlots[]): DoctorSlotsById {
  return new Map(days.map((item) => [item.bacSiId, item]));
}
