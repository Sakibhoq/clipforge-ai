FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}
# Build speed / reliability in Docker
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_IGNORE_TYPECHECK=1
ENV NEXT_IGNORE_LINT=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm","run","start","--","-H","0.0.0.0","-p","3000"]
