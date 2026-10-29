# Imagen de la app para el servidor propio (ver deploy/README.md).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Se fija al compilar porque Next.js reemplaza las variables NEXT_PUBLIC_* en el código.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 \
    # Más que los 2 min que Caddy guarda las conexiones ociosas; si no, algunos POST vuelven 502.
    KEEP_ALIVE_TIMEOUT=150000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Para correr la migración dentro del contenedor: node scripts/migrate.mjs
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/db ./db
USER node
EXPOSE 3000
CMD ["node", "server.js"]
