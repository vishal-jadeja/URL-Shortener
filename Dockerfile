FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS dev
RUN npm ci
COPY . .
CMD ["node", "src/server.js"]

FROM base AS production
COPY . .
CMD ["node", "src/server.js"]
