import type { RefundTier } from '../../api/booking-types';

// Câu "Chính sách hoàn cọc khi hủy lịch" của Bước 5 (booking F5; Figma `451:2` chưa có, nhóm bổ sung theo Q46; câu chữ là [đề xuất]). Hàm thuần: chỉ ghép chữ từ số nguyên của
// `tomTat.chinhSachHoan`, KHÔNG tính tiền. Ba dạng của API:
//   null     cọc 0đ: không có chính sách ⇒ không hiện khối (trả null)
//   []       cọc > 0 mà chưa có mốc nào ⇒ không hoàn (Q15)
//   [mốc…]   mảng sắp GIẢM DẦN theo số giờ; mỗi mốc một dòng
// Cách backend áp mốc (`calculateRefund`): lấy mốc có số giờ LỚN NHẤT mà thời gian còn lại ≥ số giờ; không mốc nào ⇒ 0%. Nên mốc thứ i phủ khoảng [số giờ của nó, số giờ của mốc
// đứng trước), và nếu mốc thấp nhất lớn hơn 0 giờ thì phía dưới nó là "không hoàn".
export const NO_REFUND_POLICY_TEXT = 'Không hoàn cọc khi hủy lịch.';

function rangeText(lower: number, upper: number | null): string {
  if (upper === null) {
    return lower === 0
      ? 'bất kỳ lúc nào'
      : `từ ${lower} giờ trở lên trước giờ hẹn`;
  }
  return lower === 0
    ? `dưới ${upper} giờ trước giờ hẹn`
    : `từ ${lower} đến dưới ${upper} giờ trước giờ hẹn`;
}

const refundText = (tyLeHoan: number) =>
  tyLeHoan === 0 ? 'không hoàn' : `hoàn ${tyLeHoan}%`;

export function refundPolicyLines(
  tiers: readonly RefundTier[] | null,
): string[] | null {
  if (tiers === null) return null;
  if (tiers.length === 0) return [NO_REFUND_POLICY_TEXT];

  const lines = tiers.map((tier, index) => {
    const upper = index === 0 ? null : tiers[index - 1].soGioTruocToiThieu;
    return `Hủy ${rangeText(tier.soGioTruocToiThieu, upper)}: ${refundText(tier.tyLeHoan)}`;
  });
  const lowest = tiers[tiers.length - 1].soGioTruocToiThieu;
  if (lowest > 0) {
    lines.push(`Hủy dưới ${lowest} giờ trước giờ hẹn: không hoàn`);
  }
  return lines;
}
