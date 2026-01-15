# Imagem base Node.js
FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Definir diretório de trabalho
WORKDIR /app

# Copiar package.json e instalar dependências do bot
COPY package*.json ./
RUN npm ci --only=production

# Copiar dependências do painel web
COPY web/package*.json ./web/
RUN cd web && npm ci

# Copiar código fonte
COPY . .

# Build do frontend
RUN cd web && npm run build && npm prune --production

# Expor porta do servidor web
EXPOSE 27015

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV WEB_PORT=27015

# Comando de inicialização
CMD ["node", "src/web/server.js"]
