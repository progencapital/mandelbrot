FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY server.js ./
COPY frontend/ ./frontend/
EXPOSE 80 443
CMD ["node", "server.js"]
