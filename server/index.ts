import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
// Raw body for Stripe webhooks (must come before express.json)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
// JSON for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CSP configuration following Stripe's official requirements
// https://docs.stripe.com/security/guide#content-security-policy
app.use((req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development' || app.get('env') === 'development';
  
  if (isDev) {
    // Development CSP: permissive for Vite HMR + Stripe's required domains including m.stripe.network
    res.setHeader('Content-Security-Policy', [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' ws: wss: https://api.stripe.com https://m.stripe.network",
      "frame-src 'self' https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.js.stripe.com https://m.stripe.network",
      "img-src 'self' data: blob: https: https://*.stripe.com",
      "font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "worker-src 'self' blob:"
    ].join('; '));
  } else {
    // Production CSP: stricter with Stripe's required domains including m.stripe.network
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "connect-src 'self' https://api.stripe.com https://m.stripe.network",
      "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
      "script-src 'self' https://js.stripe.com https://*.js.stripe.com https://m.stripe.network",
      "img-src 'self' data: https://*.stripe.com",
      "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "worker-src 'self' blob:"
    ].join('; '));
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
