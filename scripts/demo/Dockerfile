# Demo "server" for screenshots: Ubuntu with sshd, nginx, cron, PM2 apps, ufw and the docker CLI.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-server sudo nginx cron ufw curl ca-certificates procps iproute2 htop nodejs npm docker.io \
    && npm install -g pm2@5 --no-audit --no-fund \
    && rm -rf /var/lib/apt/lists/* /root/.npm \
    && mkdir -p /run/sshd \
    && echo 'root:demo-password' | chpasswd \
    && sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
COPY entry.sh /entry.sh
RUN chmod +x /entry.sh
CMD ["/entry.sh"]
