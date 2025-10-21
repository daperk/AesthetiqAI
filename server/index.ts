import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
// Raw body for Stripe webhooks (must come before express.json)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
// JSON for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CSP configuration for Stripe compatibility
app.use((req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development' || app.get('env') === 'development';
  console.log(`🔍 [CSP] NODE_ENV: ${process.env.NODE_ENV}, app.get('env'): ${app.get('env')}, isDev: ${isDev}`);
  
  if (isDev) {
    // In development, use permissive CSP to allow Stripe and Vite HMR
    const cspHeader = [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.network",
      "style-src 'self' 'unsafe-inline' https://m.stripe.network https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com",
      "connect-src 'self' ws: wss: https://api.stripe.com https://m.stripe.network https://vitals.vercel-insights.com",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "child-src 'self' blob:",
      "worker-src 'self' blob:"
    ].join('; ');
    console.log(`✅ [CSP] Setting permissive CSP for development`);
    res.setHeader('Content-Security-Policy', cspHeader);
    // Disable Trusted Types requirement in development
    res.removeHeader('Require-Trusted-Types-For');
  } else {
    // In production, use strict CSP with Stripe domains allowed
    const cspHeader = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.network",
      "style-src 'self' 'unsafe-inline' https://m.stripe.network https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com",
      "connect-src 'self' https://api.stripe.com https://m.stripe.network",
      "frame-src https://js.stripe.com https://hooks.stripe.com"
    ].join('; ');
    console.log(`⚠️ [CSP] Setting production CSP`);
    res.setHeader('Content-Security-Policy', cspHeader);
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
