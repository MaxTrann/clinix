import { createContext, useContext } from 'react';
import { httpArticleApi, type ArticleApi } from './article-api';

// Trang lấy lớp API qua context để test thay bằng bản giả (nếp `ChatbotApiContext`). Mặc định là bản chạy thật nên không cần Provider ở bản chạy thật.
export const ArticleApiContext = createContext<ArticleApi>(httpArticleApi);

export function useArticleApi(): ArticleApi {
  return useContext(ArticleApiContext);
}
