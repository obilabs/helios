# Putting Helios on a domain, or reaching it by IP address

Out of the box Helios answers on `http://localhost` on the machine it runs on.
This guide covers the two other ways people reach it:

- **A. A domain name over HTTPS**, with your own reverse proxy or tunnel in
  front. This is the one to use for anything reachable from the internet.
- **B. An IP address or host name over plain HTTP**, on a network you trust.

Both need the same one setting. Open `.env` and set `PUBLIC_URL` to exactly
what people will type in the browser, then run `docker compose up -d`.

| How people reach it | `PUBLIC_URL` | `TRUST_PROXY` |
|---|---|---|
| On the server itself, port 80 | leave empty | leave as is |
| On the server itself, another port | `http://localhost:8083` | leave as is |
| A. Domain, your proxy or tunnel in front | `https://helios.example.com` | `2` |
| B. IP address, nothing in front | `http://192.168.1.20` | leave as is |
| B. IP address on another port | `http://192.168.1.20:8080` | leave as is |

Sign-in, links in emails, public image links and passkeys all follow
`PUBLIC_URL`. You do not need to set `FRONTEND_URL`, `APP_URL`,
`PASSKEY_RP_ID` or `PASSKEY_ORIGIN`; leave them empty unless you have a reason.

If sign-in is refused after a change, look at what the backend trusts:

```bash
docker compose logs backend | grep 'trusted origins'
```

The address in your browser's address bar must be in that list.

## A. A domain name over HTTPS

Helios ships its own small proxy (nginx) that listens on plain HTTP. Put the
thing that holds your certificate in front of it and send traffic to it.

1. Keep Helios off the public network interface. In `.env`:

   ```
   HTTP_PORT=127.0.0.1:8083
   PUBLIC_URL=https://helios.example.com
   TRUST_PROXY=2
   ```

2. Point your proxy at `http://127.0.0.1:8083`.

   **Caddy** (gets and renews the certificate itself):

   ```
   helios.example.com {
       reverse_proxy 127.0.0.1:8083
   }
   ```

   **nginx:**

   ```nginx
   server {
       listen 443 ssl;
       server_name helios.example.com;
       ssl_certificate     /etc/letsencrypt/live/helios.example.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/helios.example.com/privkey.pem;

       location / {
           proxy_pass http://127.0.0.1:8083;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

   **A tunnel** (Cloudflare Tunnel and similar): point the route at the Helios
   proxy. If the tunnel connector runs in Docker, attach it to the Helios
   network and use `http://helios_nginx:80` as the service.

3. Restart: `docker compose up -d`.

### Why `TRUST_PROXY=2`

Helios records the address a request came from in the audit log, counts
requests per address for the rate limit, and checks it for API keys that are
restricted to an address. With a proxy in front, the real address is one step
further back than Helios assumes. `TRUST_PROXY` is the number of proxies
between the visitor and the backend:

- `1` (the default): only the proxy shipped with Helios.
- `2`: one proxy or tunnel of yours in front of it.
- `3`: two of yours (for example a CDN, then your own proxy).

To check it, sign in and open the audit log. The sign-in entry should show
your own address. If it shows an address starting `172.` or `10.`, the number
is too low. Do not set it higher than the real count: a visitor could then
claim any address they like.

### Things your proxy should do

- Redirect HTTP to HTTPS.
- Send a `Strict-Transport-Security` header once you are sure HTTPS works.

Helios sets these on its API responses but not on the pages themselves.

## B. An IP address or host name over plain HTTP

For a lab or an office network with no domain name.

```
HTTP_PORT=80
PUBLIC_URL=http://192.168.1.20
```

Then `docker compose up -d`, and browse to that address.

What changes when `PUBLIC_URL` starts with `http://` and is not this machine:

- **Sign-in cookies are sent without the Secure flag.** A browser refuses a
  Secure cookie over plain HTTP, and sign-in would otherwise loop back to the
  sign-in form.
- **Passwords and session cookies cross the network unencrypted.** Anyone who
  can watch that network can read them. Use this on a network you control, not
  across the internet. The backend logs a warning at start-up as a reminder.
- **Passkeys do not work.** Browsers only allow them over HTTPS or on
  `localhost`.

If the server has more than one address, people must use the one in
`PUBLIC_URL`. To allow a second address, add it to `TRUSTED_ORIGINS`
(comma-separated), for example `TRUSTED_ORIGINS=http://helios.lan`.

## Changing the address later

Change `PUBLIC_URL` and run `docker compose up -d`. Two things do not follow
automatically:

- **Passkeys** are tied to the host name they were registered on. After a
  change of host name, people register them again.
- **Image links already placed in email signatures** keep the old address.
  Deploy the signatures again so they pick up the new one.
