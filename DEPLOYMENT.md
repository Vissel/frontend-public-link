# Deployment Guide

## Routing: HashRouter vs BrowserRouter

This project uses **React BrowserRouter** for clean, production-friendly URLs.

### URL Comparison

| Feature | HashRouter (`/#/path`) | BrowserRouter (`/path`) |
|---|---|---|
| URL appearance | `/#/link?reqId=...` | `/link?reqId=...` |
| Clean URLs | No | Yes |
| Server config required | No | Yes (404 fallback) |
| SEO | Poor | Good |
| Works on static file servers | Yes | No (without config) |
| Deep linking / bookmarks | Fragile | Clean |

## Tomcat Deployment

React BrowserRouter requires a server-side **404 fallback** to `index.html`. Without it, direct navigation to routes like `/link?reqId=...` returns a 404.

### 1. Build the Frontend

```bash
cd frontend-publiclink
npm run build
```

The built output is in `build/`.

### 2. Copy Configuration

Copy the provided `web.xml` into the build output:

```bash
mkdir -p build/WEB-INF
cp tomcat-config/WEB-INF/web.xml build/WEB-INF/web.xml
```

### 3. Deploy to Tomcat

**Option A — Deploy as exploded war (recommended for development):**

```bash
cp -r build/* $CATALINA_HOME/webapps/publiclink/
```

**Option B — Deploy as WAR archive:**

```bash
cd build && jar -cvf ../publiclink.war . && cd ..
mv publiclink.war $CATALINA_HOME/webapps/
```

The `WEB-INF/web.xml` is automatically picked up by Tomcat from inside the WAR or the exploded directory.

### 4. Verify

Start Tomcat and access:

- Frontend: `http://localhost:8080/publiclink/link?reqId=...&token=...`
- Login: `http://localhost:8080/publiclink/login`

Directly navigating to any route should load the React app and handle routing on the client side.

## Environment Variables

Ensure the following are set in your Tomcat startup script or `.env.production`:

| Variable | Example Value | Description |
|---|---|---|
| `REACT_APP_API_BASE_URL` | `http://localhost:8080` | Backend API base URL |
| `REACT_APP_CONTEXT_PATH` | `/publiclink` | Context path of the frontend (optional, for multi-deploy) |

### Setting in Tomcat (setenv.sh)

```bash
# $CATALINA_HOME/bin/setenv.sh
export REACT_APP_API_BASE_URL=http://localhost:8080
export REACT_APP_CONTEXT_PATH=/publiclink
```

## Troubleshooting

### 404 on direct route access

The `web.xml` 404 fallback is not configured correctly. Verify:
1. `WEB-INF/web.xml` exists inside the deployed WAR/exploded directory
2. The file contains the `<error-page><error-code>404</error-code>...` rule
3. Tomcat restarted after deployment

### API calls return 404

Check that `REACT_APP_API_BASE_URL` points to the correct backend URL (including context path if needed).

### SPA routes work but page refresh returns 404

The 404 fallback is working (it serves index.html), but verify that React Router is correctly mounted at the root or context path. Check the `<base href="...">` tag in `build/index.html` matches the deployed context path.

## Nginx Alternative (for standalone frontend server)

If deploying without Tomcat (e.g., Node.js server or Nginx):

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```
