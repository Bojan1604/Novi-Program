# Noćne kopije cijele baze (pg_dump) i slanje izvan poslužitelja (rclone: S3, SFTP, Google Drive…).
FROM postgres:17-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends rclone ca-certificates && rm -rf /var/lib/apt/lists/*
COPY kopiraj.sh /usr/local/bin/kopiraj.sh
RUN chmod +x /usr/local/bin/kopiraj.sh
CMD ["/usr/local/bin/kopiraj.sh"]
