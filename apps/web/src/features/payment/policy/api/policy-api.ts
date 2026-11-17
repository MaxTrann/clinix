import { request } from '../../../../shared/api/client';
import { UnexpectedResponseError } from '../../../../shared/api/errors';
import { isDecimalAmount } from '../../../../shared/money/format-vnd';

// Ba API cấu hình chính sách cọc của Quản trị viên toàn hệ thống (payment B10; PLAN 5.11 #14): danh sách theo nhóm, chi tiết một dịch vụ, thay toàn bộ cọc và mốc.
// Phạm vi do backend ép (403 với Admin chi nhánh); web chỉ gọi. Tiền là CHUỖI decimal, id là chuỗi; phản hồi sai hình dạng ⇒ `UnexpectedResponseError` (trang hiện câu lỗi chung).

export const POLICY_SERVICES_PATH = '/admin/payment-policy/services';
export const policyServicePath = (dichVuKhamId: string) =>
  `${POLICY_SERVICES_PATH}/${encodeURIComponent(dichVuKhamId)}`;

export interface PolicyServiceItem {
  dichVuKhamId: string;
  ten: string;
  giaMacDinh: string;
  mucDatCoc: string;
  /** Đã cấu hình cọc hay mốc riêng (khác "Mặc định" của Figma `553:2`) */
  coChinhSachRieng: boolean;
}

export interface PolicyServiceGroup {
  nhomDichVuId: string;
  ten: string;
  dichVu: PolicyServiceItem[];
}

export interface RefundTier {
  soGioTruocToiThieu: number;
  tyLeHoan: number;
}

export interface ServicePolicy {
  dichVuKhamId: string;
  /** Chuỗi decimal của DB (`"100000.00"`) */
  mucDatCoc: string;
  /** Giờ giảm dần (máy chủ sắp) */
  moc: RefundTier[];
}

/** Thân PUT: cọc là CHUỖI số nguyên đồng (`"100000"`), mốc là số nguyên. */
export interface ServicePolicyInput {
  mucDatCoc: string;
  moc: RefundTier[];
}

const invalid = (): never => {
  throw new UnexpectedResponseError(200);
};

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}

const readString = (value: unknown): string =>
  typeof value === 'string' ? value : invalid();

const readAmount = (value: unknown): string =>
  typeof value === 'string' && isDecimalAmount(value) ? value : invalid();

const readArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : invalid();

const readInt = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) ? value : invalid();

function parseItem(raw: unknown): PolicyServiceItem {
  const row = readRecord(raw);
  if (typeof row.coChinhSachRieng !== 'boolean') return invalid();
  return {
    dichVuKhamId: readString(row.dichVuKhamId),
    ten: readString(row.ten),
    giaMacDinh: readAmount(row.giaMacDinh),
    mucDatCoc: readAmount(row.mucDatCoc),
    coChinhSachRieng: row.coChinhSachRieng,
  };
}

export function parsePolicyGroups(raw: unknown): PolicyServiceGroup[] {
  return readArray(readRecord(raw).nhom).map((value) => {
    const group = readRecord(value);
    return {
      nhomDichVuId: readString(group.nhomDichVuId),
      ten: readString(group.ten),
      dichVu: readArray(group.dichVu).map(parseItem),
    };
  });
}

export function parseServicePolicy(raw: unknown): ServicePolicy {
  const body = readRecord(raw);
  return {
    dichVuKhamId: readString(body.dichVuKhamId),
    mucDatCoc: readAmount(body.mucDatCoc),
    moc: readArray(body.moc).map((value) => {
      const tier = readRecord(value);
      return {
        soGioTruocToiThieu: readInt(tier.soGioTruocToiThieu),
        tyLeHoan: readInt(tier.tyLeHoan),
      };
    }),
  };
}

export async function getPolicyGroups(
  signal?: AbortSignal,
): Promise<PolicyServiceGroup[]> {
  return parsePolicyGroups(
    await request<unknown>(POLICY_SERVICES_PATH, { signal }),
  );
}

export async function getServicePolicy(
  dichVuKhamId: string,
  signal?: AbortSignal,
): Promise<ServicePolicy> {
  return parseServicePolicy(
    await request<unknown>(policyServicePath(dichVuKhamId), { signal }),
  );
}

export async function saveServicePolicy(
  dichVuKhamId: string,
  input: ServicePolicyInput,
): Promise<ServicePolicy> {
  return parseServicePolicy(
    await request<unknown>(policyServicePath(dichVuKhamId), {
      method: 'PUT',
      json: input,
    }),
  );
}
