# HALL MCP Marketing Site

Standalone static marketing site for HALL MCP, designed to be served at
`hall-mcp.tylerbuilds.com`.

## Local preview

From the repo root:

```bash
python3 -m http.server 8080 --directory site
```

Open `http://localhost:8080`.

## Deploy to VPS (nginx example)

1. Copy `site/` to your web root, for example `/var/www/hall-mcp`.
2. Add an nginx server block:

```nginx
server {
  listen 80;
  server_name hall-mcp.tylerbuilds.com;
  root /var/www/hall-mcp;
  index index.html;

  location / {
    try_files $uri $uri/ =404;
  }
}
```

3. Reload nginx: `sudo nginx -s reload`
4. Verify: `curl -I https://hall-mcp.tylerbuilds.com`

## Links

- GitHub repo: https://github.com/tylerbuilds/hall-mcp
- Download ZIP: https://github.com/tylerbuilds/hall-mcp/archive/refs/heads/main.zip
