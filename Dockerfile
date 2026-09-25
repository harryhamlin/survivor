# Multi-stage build: keeps devDependencies (tailwind, typescript, etc.) out
# of the final image while still using them to build the app.

# Full install (incl. devDependencies) — needed to run the build below.
FROM node:24-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

# Production-only install, used later for the final image's node_modules.
FROM node:24-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

# Runs the actual build (react-router build), using the devDependencies
# install from above. Produces /app/build (client + server bundles).
FROM node:24-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

# Final image: only the production node_modules and the built output —
# no source files, no devDependencies.
FROM node:24-alpine
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
CMD ["npm", "run", "start"]
