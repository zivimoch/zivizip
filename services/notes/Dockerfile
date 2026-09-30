FROM rust:1-bookworm AS build
WORKDIR /app
COPY services/notes/Cargo.toml services/notes/Cargo.lock ./
COPY services/notes/src ./src
RUN cargo test --locked && cargo build --release --locked
FROM debian:bookworm-slim
RUN useradd --uid 10001 --create-home app && mkdir /data && chown app:app /data
COPY --from=build /app/target/release/zivizip-notes /usr/local/bin/zivizip-notes
USER app
EXPOSE 8080
CMD ["zivizip-notes"]
