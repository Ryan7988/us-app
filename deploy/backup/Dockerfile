FROM alpine:3.22
# crond 用 busybox 內建的（alpine 一定有），不需要額外套件
RUN apk add --no-cache restic sqlite tzdata bash coreutils
COPY crontab /etc/crontabs/root
COPY backup.sh restore.sh verify.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh
ENV RESTIC_REPOSITORY=/repo
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["crond", "-f", "-l", "6"]
