FROM node:22-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /app

FROM base AS dev

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . ./

EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "5173"]

FROM base AS build

ARG VITE_APP_VERSION=dev
ARG VITE_GIT_SHA=
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_GIT_SHA=$VITE_GIT_SHA

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . ./
RUN pnpm build

FROM nginx:1.27-alpine AS prod

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
