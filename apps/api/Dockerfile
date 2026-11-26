# Yêu cầu: apps/api là project NestJS (npm), có script `start:dev` và `build`.
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./

# --- dev: hot reload, dùng với docker-compose.yml ---
FROM base AS dev
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# --- build ---
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

# --- prod: image nhỏ, chạy non-root ---
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Thư mục tệp đính kèm của chat (chat P3; ADR 0005), thuộc người dùng `node`: volume trống gắn vào đây lần đầu nhận quyền này
RUN mkdir -p /data/chat && chown node:node /data/chat
ENV CHAT_FILES_DIR=/data/chat
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main.js"]
