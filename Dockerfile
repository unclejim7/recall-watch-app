FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

RUN useradd --system --create-home appuser \
  && chown -R appuser:appuser /app
USER appuser

# Mount a volume over /app (or set DB_PATH to a mounted path) so data.sqlite
# survives container restarts — see README.md "Deploying".
CMD ["node", "src/server.js"]
