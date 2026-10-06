FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY server ./server
COPY db ./db
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node","server/index.mjs"]
