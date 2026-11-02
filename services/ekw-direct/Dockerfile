FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY capture.mjs server.mjs ./
ENV PORT=8789
ENV EKW_DIRECT_BIND=0.0.0.0
USER pwuser
EXPOSE 8789
CMD ["node", "server.mjs"]
