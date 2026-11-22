FROM alpine:3.22
RUN apk add --no-cache restic sqlite tzdata bash coreutils supercronic
COPY crontab /etc/crontab
COPY backup.sh restore.sh verify.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh
ENV RESTIC_REPOSITORY=/repo
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["supercronic", "-passthrough-logs", "/etc/crontab"]
