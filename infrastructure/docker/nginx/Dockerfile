ARG NGINX_VERSION=1.30.6
ARG ALPINE_VERSION=3.24.3

# Build stage for VTS module
FROM alpine:${ALPINE_VERSION} AS build-stage

ARG NGINX_VERSION
ARG VTS_VERSION=v0.2.7

# Install build dependencies
RUN apk add --no-cache \
    gcc \
    g++ \
    make \
    pcre-dev \
    zlib-dev \
    openssl-dev \
    linux-headers \
    curl \
    git \
    libxslt-dev \
    gd-dev \
    geoip-dev

# Download and extract nginx source
RUN curl -fSL "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" -o nginx.tar.gz \
    && tar -xzf nginx.tar.gz

# Clone VTS module at a pinned tag
WORKDIR /nginx-module-vts
RUN git clone --branch ${VTS_VERSION} --depth 1 https://github.com/vozlt/nginx-module-vts.git /nginx-module-vts

# Build nginx with VTS module as dynamic
WORKDIR /nginx-${NGINX_VERSION}
RUN ./configure \
    --with-compat \
    --add-dynamic-module=/nginx-module-vts \
    && make modules

# Final stage - using official nginx alpine image with native OpenTelemetry module
FROM nginx:${NGINX_VERSION}-alpine-otel

ARG NGINX_VERSION

# Copy VTS module from build stage
COPY --from=build-stage /nginx-${NGINX_VERSION}/objs/ngx_http_vhost_traffic_status_module.so /etc/nginx/modules/

# Forward logs to Docker log collector
RUN ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log
