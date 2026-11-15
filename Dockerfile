# --- Build the frontend ---
FROM node:22-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime: API + built frontend ---
FROM node:22-slim
ENV NODE_ENV=production PORT=3001 TZ=Africa/Nairobi
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
COPY --from=web /app/dist /app/dist
VOLUME /app/server/data
EXPOSE 3001
CMD ["npx", "tsx", "src/index.ts"]
