# Web Apps, Nginx & SSL Management

7Server simplifies exposing web applications, configuring reverse proxies, and issuing SSL certificates across your servers.

---

## Reverse Proxy Topology

Visualizing domains, listening ports, and proxy passes:
- Automatically detects active Nginx sites (`/etc/nginx/sites-enabled/*`) and listening web sockets.
- Displays upstream destination ports (e.g. `example.com -> 127.0.0.1:3000`).

---

## Automated Let's Encrypt SSL

- **One-Click Certificate Provisioning**: Issues free TLS certificates using Certbot over ACME challenges.
- **Auto-Renewal Verification**: Monitors expiration dates and displays warnings when certificates are within 30 days of expiring.
- **SSL Hardening**: Automatically configures modern TLS 1.2/1.3 ciphers, HSTS headers, and HTTP-to-HTTPS redirects.

