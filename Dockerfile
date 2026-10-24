# syntax=docker/dockerfile:1.7
FROM node:22.22.0-alpine AS backend-build
WORKDIR /src/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY backend/ ./
RUN npm run build

FROM node:22.22.0-alpine AS frontend-build
WORKDIR /src/frontend
ARG VITE_API_URL=/api/v1
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_API_URL=$VITE_API_URL \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

FROM node:22.22.0-alpine AS production-dependencies
WORKDIR /src/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22.22.0-alpine AS runtime
ENV NODE_ENV=production \
    STATIC_DIR=/app/frontend \
    PORT=5000
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /src/backend/node_modules ./backend/node_modules
COPY --from=backend-build --chown=node:node /src/backend/dist ./backend
COPY --from=backend-build --chown=node:node /src/backend/package.json ./backend/package.json
COPY --from=frontend-build --chown=node:node /src/frontend/dist ./frontend
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:5000/healthz || exit 1
CMD ["node", "/app/backend/server.js"]
