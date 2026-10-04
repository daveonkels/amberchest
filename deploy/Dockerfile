# JavaScript dependencies are installed through Socket on the build workstation,
# then copied as a production-only pnpm deployment. No installer runs here.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
ENV NODE_ENV=production AMBERCHEST_CONFIG_DIR=/config AMBERCHEST_ARCHIVE_DIR=/archive AMBERCHEST_WEB_ROOT=/app/web AMBERCHEST_HOST=0.0.0.0 AMBERCHEST_PORT=8484 AMBERCHEST_PRIVATE_BACKUP=true
WORKDIR /app
COPY runtime/ ./
COPY web/ ./web/
COPY snapshot.mjs ./snapshot.mjs
USER 3000:3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8484/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/standalone.js"]
