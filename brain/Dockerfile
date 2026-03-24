FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@latest

RUN npm install -g \
    typescript \
    typescript-language-server \
    eslint \
    @anthropic-ai/sdk \
    @anthropic-ai/claude-code \
    octokit

COPY package.json .
RUN npm install --production

COPY . .

ENV NODE_ENV=production
ENV CPU_LIMIT=2
ENV MEMORY_LIMIT=4Gi

CMD ["node", "src/index.js"]
