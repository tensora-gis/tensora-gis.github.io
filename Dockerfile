# syntax=docker/dockerfile:1

# --- Build stage: compile the Vite SPA ---
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Runtime stage: Express API + static SPA ---
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY tsconfig.json ./
COPY src ./src

EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
