# Finance You — caption-burner (FFmpeg + libass + Inter).
# Budowa:  docker build -t caption-burner services/caption-burner
# Start:   docker run -p 8080:8080 -e CAPTION_BURNER_SECRET=… caption-burner
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg fontconfig fonts-inter fonts-dejavu-core fonts-liberation2 \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs transcode-plan.mjs frame-check.mjs ./

ENV NODE_ENV=production \
    PORT=8080 \
    CAPTION_WORK_DIR=/tmp/caption-burner

EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
