FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8177
COPY package.json ./
COPY src ./src
COPY scripts/preflight.js ./scripts/preflight.js
COPY config.example.json ./config.example.json
COPY data/facts.json ./data/facts.json
COPY data/presets-manifest.json ./data/presets-manifest.json
COPY data/projects ./data/projects
RUN node scripts/preflight.js && chown -R node:node /app
USER node
EXPOSE 8177
HEALTHCHECK --interval=20s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8177/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server/index.js"]
