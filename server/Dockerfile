# Builds the Axiom server into a small image. Build from the repo root:
#   docker build -f server/Dockerfile -t axiom-server .

FROM rust:1-bookworm AS build
WORKDIR /app
COPY . .
# Full LTO makes the desktop app small but the server build slow; it isn't
# worth it here.
ENV CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16
RUN cargo build --release --locked -p axiom-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/axiom-server /usr/local/bin/axiom-server
USER nobody
ENV PORT=8787
EXPOSE 8787
CMD ["axiom-server"]
