import { isBigintId } from '../../appointments/lists/list-query.rules.js';

// Chỗ giữ `[[LOẠI:id]]` (chatbot B2; PLAN chatbot 5.7). MỘT nơi định nghĩa dạng, loại và cách phân tích: ngữ cảnh (context/) phát chỗ giữ,
// luật đối chiếu và bộ dựng đoạn (answer/) đọc chúng. Mô hình chỉ được nhắc giá, giờ, địa chỉ, tên bằng chỗ giữ; máy chủ thay bằng chữ lấy từ DB.
// Hàm thuần: không DB, không mạng, không log.

/** Loại có `id` là id BIGINT dạng CHUỖI. */
export const ID_PLACEHOLDER_KINDS = [
  'CK', // tên chuyên khoa (id chuyên khoa)
  'BS', // chức danh và họ tên bác sĩ (id tài khoản bác sĩ)
  'GIA', // giá khám của bác sĩ, đã cộng phụ phí (id bác sĩ)
  'CN', // tên chi nhánh (id chi nhánh)
  'DC', // địa chỉ chi nhánh (id chi nhánh)
  'GIO', // giờ nhận khám của chi nhánh (id chi nhánh)
  'DV', // tên dịch vụ (id dịch vụ)
  'GIADV', // giá mặc định của dịch vụ (id dịch vụ)
  'COC', // mức cọc (id dịch vụ)
  'TL', // thời lượng (id dịch vụ)
  'HOAN', // mốc hoàn tiền (id dịch vụ)
] as const;
export type IdPlaceholderKind = (typeof ID_PLACEHOLDER_KINDS)[number];

/** Loại có khoá chữ cố định thay cho id. */
export const KEYED_PLACEHOLDER_VALUES = {
  PK: ['hotline', 'email'],
  CS: ['giuCho', 'doiLich'],
} as const;
export type KeyedPlaceholderKind = keyof typeof KEYED_PLACEHOLDER_VALUES;

export type PlaceholderKind = IdPlaceholderKind | KeyedPlaceholderKind;

export interface PlaceholderRef {
  readonly kind: PlaceholderKind;
  /** Id BIGINT dạng chuỗi, hoặc `hotline`/`email`/`giuCho`/`doiLich`. */
  readonly id: string;
}

/** Ký tự thay MỖI chỗ giữ hợp lệ khi chạy các luật chữ: không phải chữ, không phải số, không viết hoa. */
export const PLACEHOLDER_STAND_IN = '';

// Một "ứng viên" là bất kỳ `[[ … ]]` nào không chứa ngoặc vuông bên trong; hình dạng đúng kiểm riêng ở `SHAPE`.
const CANDIDATE = /\[\[[^[\]]*\]\]/g;
const SHAPE = /^\[\[([A-Z]+):([A-Za-z0-9]+)\]\]$/;

const isIdKind = (kind: string): kind is IdPlaceholderKind =>
  (ID_PLACEHOLDER_KINDS as readonly string[]).includes(kind);

const isKeyedKind = (kind: string): kind is KeyedPlaceholderKind =>
  Object.hasOwn(KEYED_PLACEHOLDER_VALUES, kind);

/** Chỗ giữ hợp lệ hay `null`: loại phải có thật, id phải là id BIGINT (loại có id) hoặc đúng một khoá chữ (loại có khoá). */
export function toPlaceholderRef(
  kind: string,
  id: string,
): PlaceholderRef | null {
  if (isIdKind(kind)) return isBigintId(id) ? { kind, id } : null;
  if (isKeyedKind(kind)) {
    const allowed: readonly string[] = KEYED_PLACEHOLDER_VALUES[kind];
    return allowed.includes(id) ? { kind, id } : null;
  }
  return null;
}

export function formatPlaceholder(ref: PlaceholderRef): string {
  return `[[${ref.kind}:${ref.id}]]`;
}

/** Khoá để so sánh và gom trùng: `BS:12`. */
export function placeholderKey(ref: PlaceholderRef): string {
  return `${ref.kind}:${ref.id}`;
}

export type ParsedPlaceholders =
  | {
      readonly ok: true;
      /** Theo thứ tự xuất hiện, có thể trùng nhau. */
      readonly refs: PlaceholderRef[];
      /** Chữ đã thay mỗi chỗ giữ bằng `PLACEHOLDER_STAND_IN`. */
      readonly stripped: string;
    }
  | { readonly ok: false };

/**
 * Phân tích NGHIÊM NGẶT: mọi `[[…]]` phải đúng dạng và đúng loại (chữ thường, khoảng trắng, loại lạ, id không phải số, id có số 0 đầu,
 * id vượt BIGINT đều sai); sau khi bỏ chỗ giữ hợp lệ không được còn `[[` hay `]]` dở dang. Một chỗ sai là cả chuỗi sai (V2).
 */
export function parsePlaceholders(text: string): ParsedPlaceholders {
  // Ba ngoặc liền nhau trở lên không bao giờ là chỗ giữ đúng (`[[[BS:1]]` sau khi bỏ chỗ giữ chỉ còn một `[` nên kiểm trên chữ gốc).
  // Chữ gốc mà đã chứa ký tự giữ chỗ nội bộ thì mô hình đang cố giả một chỗ giữ để lách các luật chữ ("chuyên khoa huyết học")
  if (/\[{3,}|\]{3,}/.test(text) || text.includes(PLACEHOLDER_STAND_IN)) {
    return { ok: false };
  }
  const refs: PlaceholderRef[] = [];
  let stripped = '';
  let cursor = 0;
  for (const match of text.matchAll(CANDIDATE)) {
    const shape = SHAPE.exec(match[0]);
    const ref = shape ? toPlaceholderRef(shape[1] ?? '', shape[2] ?? '') : null;
    if (ref === null) return { ok: false };
    refs.push(ref);
    stripped += text.slice(cursor, match.index) + PLACEHOLDER_STAND_IN;
    cursor = match.index + match[0].length;
  }
  stripped += text.slice(cursor);
  if (stripped.includes('[[') || stripped.includes(']]')) return { ok: false };
  return { ok: true, refs, stripped };
}

/** Gom trùng theo khoá, giữ thứ tự xuất hiện đầu tiên. */
export function uniqueRefs(refs: readonly PlaceholderRef[]): PlaceholderRef[] {
  const seen = new Set<string>();
  const result: PlaceholderRef[] = [];
  for (const ref of refs) {
    const key = placeholderKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}
