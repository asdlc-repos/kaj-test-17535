#!/bin/sh
# Strip trailing slash — OpenChoreo may inject "http://host:8080/"
BACKEND_API_URL="${BACKEND_API_URL%/}"

# Single-quoted arg protects nginx's own $variables from substitution
envsubst '$BACKEND_API_URL' \
  < /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf

cat <<EOF > /usr/share/nginx/html/env.js
window.RUNTIME_BACKEND_API_URL = "/api";
EOF

exec "$@"
