FROM node:22-alpine
WORKDIR /app

# Install Python yang dibutuhkan oleh package yt-dlp-exec / dependensi terkait
RUN apk add --no-cache python3 py3-pip

COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3001
CMD ["npm", "start"]
