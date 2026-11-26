import { formatDoctorName } from '../../appointments/notifications/mail-format.js';
import {
  counterpartToCheck,
  type ChatActor,
} from '../core/chat-access.policy.js';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import type { LoaiHoiThoai } from '../entities/enums.js';
import type {
  HeaderRow,
  MessageRow,
} from '../read/conversation-read.repository.js';

// Dựng thân phản hồi THEO VAI TRÒ người xem (chat B2; PLAN chat 5.6, Q15, Q16, Q18, Q23; QCH-11). Hàm thuần, chọn từng khoá một (danh sách trắng):
// không bao giờ trả `tai_khoan_id`, email, ngày sinh, địa chỉ. B3 (gửi qua REST) và B5 (đẩy qua socket) dùng lại `toMessageItem` để thân giống nhau.
//  - Bệnh nhân thấy Lễ tân là "Lễ tân · {tên chi nhánh}", KHÔNG có họ tên hay id Lễ tân (Q18).
//  - Lễ tân thấy họ tên và SĐT Bệnh nhân (Q23); Bác sĩ chỉ thấy họ tên.

export type ChatRole = 'BenhNhan' | 'BacSi' | 'LeTan';

export interface ChatPartner {
  vaiTro: ChatRole;
  tenHienThi: string;
  /** Chỉ có khi người xem là Lễ tân (Q23). */
  soDienThoai?: string;
}

export interface MessageItem {
  id: string;
  laCuaToi: boolean;
  nguoiGui: { vaiTro: ChatRole; tenHienThi: string };
  noiDung: string;
  tep: { ten: string; loai: string; dungLuong: number } | null;
  /** ISO 8601 UTC; web đổi sang giờ Việt Nam. */
  thoiDiemGui: string;
  /** Chỉ trả cho chính người gửi (để gửi lại cùng mã); tin của người khác là `null`. */
  maGui: string | null;
}

export type ReplyStatus = 'ChoTraLoi' | 'DaTraLoi';
export type Relationship = 'DaTungKham' | 'ChuaTungKham';

export interface ConversationListItem {
  id: string;
  loai: LoaiHoiThoai;
  doiTac: ChatPartner;
  tinCuoi: {
    id: string;
    trichDan: string;
    nguoiGuiHienThi: string;
    thoiDiemGui: string;
  };
  /** Trần 100 (web hiện "99+"). */
  soTinChuaDoc: number;
  /** Chỉ cho Lễ tân (Q15); vai trò khác là `null`. */
  trangThaiTraLoi: ReplyStatus | null;
  /** Lễ tân trả lời cuối: "Bạn" nếu là chính mình, không thì họ tên đồng nghiệp. */
  traLoiBoi: string | null;
  /** Chỉ hội thoại bác sĩ (Q16); hộp thư chung là `null`. */
  quanHe: Relationship | null;
}

export interface ConversationDetail {
  id: string;
  loai: LoaiHoiThoai;
  doiTac: ChatPartner;
  quanHe: Relationship | null;
  /** Hội thoại bác sĩ hiện banner "tư vấn sơ bộ" ở CẢ hai phía (2.4.20 b3, T12). */
  banner: boolean;
  /** Q3: bên kia ngưng hoạt động thì đọc được, không gửi được. */
  coTheGui: boolean;
  lyDoKhongGui: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG' | null;
}

/** Trích dẫn tin cuối ở danh sách: tối đa 100 điểm mã; tin chỉ có tệp là "[Ảnh]" hay "[Tệp PDF]" (MH8, không lộ tên tệp). */
export const EXCERPT_MAX_CODE_POINTS = 100;
const SELF_LABEL = 'Bạn';
const ACTIVE = 'DangHoatDong';

const roleOf = (loaiTaiKhoan: string): ChatRole =>
  loaiTaiKhoan === 'BacSi' || loaiTaiKhoan === 'LeTan'
    ? loaiTaiKhoan
    : 'BenhNhan';

/** "{chức danh} {họ tên}" của bác sĩ; thiếu chức danh (dữ liệu hỏng) thì chỉ họ tên. */
export const doctorLabel = (
  chucDanh: ChucDanhBacSi | null,
  hoTen: string,
): string => (chucDanh === null ? hoTen : formatDoctorName(chucDanh, hoTen));

export const receptionLabel = (tenChiNhanh: string | null): string =>
  `Lễ tân · ${tenChiNhanh ?? ''}`;

/** Tên người gửi nhìn từ người xem. Lễ tân hiện với Bệnh nhân bằng tên chi nhánh của hội thoại (Q18). */
export function senderName(
  viewer: ChatActor,
  message: Pick<MessageRow, 'hoTen' | 'loaiTaiKhoan' | 'chucDanh'>,
  tenChiNhanh: string | null,
): string {
  const role = roleOf(message.loaiTaiKhoan);
  if (role === 'BacSi') return doctorLabel(message.chucDanh, message.hoTen);
  if (role === 'LeTan' && viewer.vaiTro === 'BenhNhan')
    return receptionLabel(tenChiNhanh);
  return message.hoTen;
}

export function toMessageItem(
  viewer: ChatActor,
  message: MessageRow,
  tenChiNhanh: string | null,
): MessageItem {
  const laCuaToi = message.nguoiGuiId === viewer.taiKhoanId;
  return {
    id: message.tinNhanId,
    laCuaToi,
    nguoiGui: {
      vaiTro: roleOf(message.loaiTaiKhoan),
      tenHienThi: senderName(viewer, message, tenChiNhanh),
    },
    noiDung: message.noiDung,
    tep:
      message.tepTenGoc !== null &&
      message.tepLoai !== null &&
      message.tepDungLuong !== null
        ? {
            ten: message.tepTenGoc,
            loai: message.tepLoai,
            dungLuong: message.tepDungLuong,
          }
        : null,
    thoiDiemGui: message.thoiDiemGui.toISOString(),
    maGui: laCuaToi ? message.maGui : null,
  };
}

export function excerptOf(
  message: Pick<MessageRow, 'noiDung' | 'tepLoai'>,
): string {
  if (message.noiDung === '') {
    if (message.tepLoai?.startsWith('image/')) return '[Ảnh]';
    if (message.tepLoai === 'application/pdf') return '[Tệp PDF]';
    return '[Tệp]';
  }
  // Một dòng: xuống dòng, tab thành dấu cách; cắt theo ĐIỂM MÃ (không cắt đôi emoji)
  const points = Array.from(message.noiDung.replace(/\s+/g, ' '));
  if (points.length <= EXCERPT_MAX_CODE_POINTS) return points.join('');
  return `${points.slice(0, EXCERPT_MAX_CODE_POINTS - 1).join('')}…`;
}

export function partnerOf(viewer: ChatActor, header: HeaderRow): ChatPartner {
  if (viewer.vaiTro === 'BenhNhan') {
    if (header.loai === 'BenhNhan_LeTan')
      return {
        vaiTro: 'LeTan',
        tenHienThi: receptionLabel(header.tenChiNhanh),
      };
    return {
      vaiTro: 'BacSi',
      tenHienThi: doctorLabel(header.bacSiChucDanh, header.bacSiHoTen ?? ''),
    };
  }
  if (viewer.vaiTro === 'LeTan')
    return {
      vaiTro: 'BenhNhan',
      tenHienThi: header.benhNhanHoTen,
      soDienThoai: header.benhNhanSoDienThoai,
    };
  return { vaiTro: 'BenhNhan', tenHienThi: header.benhNhanHoTen };
}

export function relationshipOf(header: HeaderRow): Relationship | null {
  if (header.loai !== 'BenhNhan_BacSi') return null;
  return header.daTungKham ? 'DaTungKham' : 'ChuaTungKham';
}

export function toListItem(
  viewer: ChatActor,
  header: HeaderRow,
  last: MessageRow,
): ConversationListItem {
  const mine = last.nguoiGuiId === viewer.taiKhoanId;
  let trangThaiTraLoi: ReplyStatus | null = null;
  let traLoiBoi: string | null = null;
  // Q15: nhãn theo người gửi tin CUỐI; chỉ Lễ tân nhìn thấy
  if (viewer.vaiTro === 'LeTan') {
    if (roleOf(last.loaiTaiKhoan) === 'LeTan') {
      trangThaiTraLoi = 'DaTraLoi';
      traLoiBoi = mine ? SELF_LABEL : last.hoTen;
    } else trangThaiTraLoi = 'ChoTraLoi';
  }
  return {
    id: header.hoiThoaiId,
    loai: header.loai,
    doiTac: partnerOf(viewer, header),
    tinCuoi: {
      id: last.tinNhanId,
      trichDan: excerptOf(last),
      nguoiGuiHienThi: mine
        ? SELF_LABEL
        : senderName(viewer, last, header.tenChiNhanh),
      thoiDiemGui: last.thoiDiemGui.toISOString(),
    },
    soTinChuaDoc: header.soTinChuaDoc,
    trangThaiTraLoi,
    traLoiBoi,
    quanHe: relationshipOf(header),
  };
}

/** `coTheGui` dùng ĐÚNG luật "bên kia" của lõi gửi (`counterpartToCheck`, 5.3), không chép lại: Bệnh nhân ở hộp thư chung luôn gửi được. */
export function toDetail(
  viewer: ChatActor,
  header: HeaderRow,
): ConversationDetail {
  const counterpart = counterpartToCheck(
    viewer,
    {
      hoiThoaiId: header.hoiThoaiId,
      loai: header.loai,
      chiNhanhId: header.chiNhanhId,
      nguoiTaoId: header.benhNhanId,
      actorIsMember: header.laThanhVien,
    },
    header.bacSiId,
  );
  const counterpartStatus =
    counterpart === null
      ? ACTIVE
      : counterpart === header.bacSiId
        ? header.bacSiTrangThai
        : header.benhNhanTrangThai;
  const coTheGui = counterpartStatus === ACTIVE;
  return {
    id: header.hoiThoaiId,
    loai: header.loai,
    doiTac: partnerOf(viewer, header),
    quanHe: relationshipOf(header),
    banner: header.loai === 'BenhNhan_BacSi',
    coTheGui,
    lyDoKhongGui: coTheGui ? null : 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
  };
}

/** Đầu khung TRƯỚC tin đầu (chat B3; `GET /chat/doctors/:id`, `GET /chat/branches/:id`): cùng khoá với `ConversationDetail`, `hoiThoaiId` là `null` khi chưa có hội thoại. */
export interface StartHeader {
  hoiThoaiId: string | null;
  loai: LoaiHoiThoai;
  doiTac: ChatPartner;
  quanHe: Relationship | null;
  banner: boolean;
  coTheGui: boolean;
  lyDoKhongGui: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG' | null;
}

/** Bác sĩ ngưng hoạt động hay chờ kích hoạt ⇒ xem được, không gửi được (Q3; cùng luật lõi gửi, NBS-09). */
export function toDoctorStart(
  doctor: { hoTen: string; trangThai: string; chucDanh: ChucDanhBacSi | null },
  hoiThoaiId: string | null,
  daTungKham: boolean,
): StartHeader {
  const coTheGui = doctor.trangThai === ACTIVE;
  return {
    hoiThoaiId,
    loai: 'BenhNhan_BacSi',
    doiTac: {
      vaiTro: 'BacSi',
      tenHienThi: doctorLabel(doctor.chucDanh, doctor.hoTen),
    },
    quanHe: daTungKham ? 'DaTungKham' : 'ChuaTungKham',
    banner: true,
    coTheGui,
    lyDoKhongGui: coTheGui ? null : 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
  };
}

/** Hộp thư chung: Bệnh nhân luôn gửi được (chi nhánh không có trạng thái, 5.3); Bệnh nhân thấy "Lễ tân · {chi nhánh}" (Q18). */
export function toBranchStart(
  tenChiNhanh: string,
  hoiThoaiId: string | null,
): StartHeader {
  return {
    hoiThoaiId,
    loai: 'BenhNhan_LeTan',
    doiTac: { vaiTro: 'LeTan', tenHienThi: receptionLabel(tenChiNhanh) },
    quanHe: null,
    banner: false,
    coTheGui: true,
    lyDoKhongGui: null,
  };
}
