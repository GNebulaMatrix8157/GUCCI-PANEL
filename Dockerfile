FROM alpine:3.19

RUN apk add --no-cache \
    curl \
    bash \
    ca-certificates \
    socat \
    tzdata \
    sqlite \
    nginx \
    gettext \
    && ln -sf /usr/share/zoneinfo/Asia/Tehran /etc/localtime

# دانلود و نصب پنل جدید سنایی نسخه v1.0.8
RUN curl -L https://github.com/mhsanaei/3x-ui/releases/download/v1.0.8/x-ui-linux-amd64.tar.gz -o /tmp/x-ui.tar.gz \
    && tar -xzf /tmp/x-ui.tar.gz -C /usr/local/ \
    && rm /tmp/x-ui.tar.gz \
    && chmod +x /usr/local/x-ui/x-ui

RUN mkdir -p /etc/x-ui /var/log/x-ui /run/nginx

COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE ${PORT}

CMD ["/start.sh"]
