# VPS runtime hardening (systemd)

This project is intended to run on VPS with two managed processes:

- `sqr-web`: Next.js production server
- `sqr-worker`: analysis worker

## 1) Install service units

```bash
sudo cp deploy/systemd/sqr-web.service /etc/systemd/system/sqr-web.service
sudo cp deploy/systemd/sqr-worker.service /etc/systemd/system/sqr-worker.service
```

## 2) Create runtime env file

```bash
sudo mkdir -p /etc/sqr
sudo cp .env /etc/sqr/sqr.env
sudo chown root:root /etc/sqr/sqr.env
sudo chmod 600 /etc/sqr/sqr.env
```

Required production values in `/etc/sqr/sqr.env`:

- `NODE_ENV=production`
- `APP_ENV=production`
- `NEXT_PUBLIC_APP_URL=https://<your-domain>`
- `PRIVATE_LINK_SECRET` (non-default, >=32 chars)
- `RECEIPT_CONTRACT_ADDRESS` and Base RPC values

Recommended timeout values:

- `ANALYSIS_TOTAL_TIMEOUT_MS=180000`
- `SCANNER_TIMEOUT_MS=90000`
- `OPENAI_EXEC_SUMMARY_TIMEOUT_MS=20000`
- `OPENAI_AUDIT_TIMEOUT_MS=45000`

## 3) Enable and start services

```bash
sudo systemctl daemon-reload
sudo systemctl enable sqr-web
sudo systemctl enable sqr-worker
sudo systemctl start sqr-web
sudo systemctl start sqr-worker
```

## 4) Check service and logs

```bash
systemctl status sqr-web --no-pager
systemctl status sqr-worker --no-pager
journalctl -u sqr-web -n 100 --no-pager
journalctl -u sqr-worker -n 100 --no-pager
```

## 5) Nginx reverse proxy

```bash
sudo cp deploy/nginx/site.conf.example /etc/nginx/sites-available/<your-domain>
sudo ln -s /etc/nginx/sites-available/<your-domain> /etc/nginx/sites-enabled/<your-domain>
sudo nginx -t
sudo systemctl reload nginx
```

## 6) HTTPS (Let's Encrypt)

Ensure DNS A records for `<your-domain>` (and `www` if needed) point to this VPS.

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <your-domain> -d www.<your-domain>
```

After certificate issuance, verify:

- `NEXT_PUBLIC_APP_URL=https://<your-domain>`
- If Cloudflare is used: SSL mode `Full (strict)`
