import { Fragment } from 'react';
import {
  parseArticleContent,
  type ArticleBlock,
} from './parse-article-content';

// MỘT component dựng nội dung bài viết, dùng chung cho "Xem trước" ở trang quản trị và trang chi tiết công khai (PLAN article T8).
// An toàn nhờ cách dựng: chỉ tạo phần tử React với con là CHUỖI (React tự thoát ký tự), không HTML thô, không liên kết, không ảnh.
// `<script>`, `<img onerror>`, `javascript:` và URL đều hiện thành chữ. Tiêu đề bài (`h1`) do trang chứa component này đặt, nên ở đây chỉ có `h2`.
function BlockView({ block }: { block: ArticleBlock }) {
  if (block.type === 'heading') {
    return (
      <h2 className="mt-6 mb-2 text-xl font-semibold text-gray-900">
        {block.text}
      </h2>
    );
  }
  if (block.type === 'list') {
    return (
      <ul className="my-3 list-disc space-y-1 pl-6">
        {block.items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <p className="my-3">
      {block.lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </p>
  );
}

export function ArticleContent({ text }: { text: string }) {
  return (
    // `break-words` và `overflow-wrap:anywhere`: từ rất dài (không có khoảng trắng) không làm tràn ngang ở 375 px
    <div className="leading-relaxed break-words text-gray-800 [overflow-wrap:anywhere]">
      {parseArticleContent(text).map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}
