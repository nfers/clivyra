FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/types/package.json packages/types/package.json
RUN npm ci

COPY . .

FROM base AS web
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace", "@clivyra/web"]

FROM base AS api
EXPOSE 3001
CMD ["npm", "run", "dev", "--workspace", "@clivyra/api"]
