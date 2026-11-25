# One image: Express serves the API and the built React app.
# Build from the Thinkerboard folder:  docker build -t thinkboard .

# 1) Build the React frontend
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2) Install backend production dependencies only
FROM node:20-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# 3) Small runtime image
FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=5001 \
    FRONTEND_DIST=/app/frontend/dist
WORKDIR /app/backend
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY --from=frontend /app/frontend/dist /app/frontend/dist

ARG GIT_SHA=dev
ENV APP_VERSION=$GIT_SHA
RUN echo "$GIT_SHA" > /app/frontend/dist/version.txt

USER node
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD wget -qO- http://localhost:5001/health || exit 1
# node directly (not npm start) so SIGTERM reaches the app for graceful shutdown
CMD ["node", "src/server.js"]
