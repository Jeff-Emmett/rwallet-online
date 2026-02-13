FROM nginx:alpine

# Copy static files
COPY *.html /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/

# Custom nginx config for SPA-like behavior
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    # Cache static assets (short TTL for JS to allow updates) \
    location ~* \.(png|jpg|jpeg|gif|ico|svg|woff|woff2)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
    location ~* \.(js|css)$ { \
        expires 1h; \
        add_header Cache-Control "public, must-revalidate"; \
    } \
    \
    # Gzip compression \
    gzip on; \
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript; \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
