FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server server
COPY shared shared
COPY public public
COPY data data
COPY scripts scripts
# Ads Manager parity. A non-zero exit fails this image, so the platform does not deploy it.
RUN node scripts/reconcile-meta.js
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server/index.js"]
