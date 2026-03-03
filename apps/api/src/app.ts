import cookieParser from "cookie-parser";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  adminLoginSchema,
  getFlowByIntent,
  leadIntentSchema,
  normalizePhoneToE164,
  privacyRequestCreateSchema,
  startLeadSchema,
  stepAnswerSchema,
  validateStepByIntent
} from "@bbb/shared";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import nodemailer from "nodemailer";
import { pinoHttp } from "pino-http";
import { rateLimit } from "express-rate-limit";
import { stringify } from "csv-stringify/sync";

import { requireAdminAuth } from "./auth.js";
import { logger } from "./logger.js";
import { sanitizeInputMiddleware } from "./sanitize.js";
import { SessionStore } from "./session.js";
import { DrizzleStore, type AppStore, type LeadFilters } from "./store.js";

const isProduction = process.env.NODE_ENV === "production";

export type CreateAppOptions = {
  store?: AppStore;
  sessionStore?: SessionStore;
  serveStatic?: boolean;
};

const parseDateMaybe = (value: unknown): Date | undefined => {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
};

const maskEmail = (email: string | null): string | null => {
  if (!email) {
    return null;
  }

  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return "***";
  }

  if (local.length <= 2) {
    return `${local[0] ?? "*"}*@${domain}`;
  }

  return `${local.slice(0, 2)}***@${domain}`;
};

const maskPhone = (phone: string | null): string | null => {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) {
    return "***";
  }

  return `***-***-${digits.slice(-4)}`;
};

const constantTimeEquals = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
};

const getWebDistPath = (): string | null => {
  const candidates = [
    path.resolve(process.cwd(), "../web/dist"),
    path.resolve(process.cwd(), "apps/web/dist")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const parseLeadFilters = (req: Request): LeadFilters => {
  const rawIntent = typeof req.query.intent === "string" ? req.query.intent : undefined;
  const rawStatus = typeof req.query.status === "string" ? req.query.status : undefined;

  const intentResult = rawIntent ? leadIntentSchema.safeParse(rawIntent) : null;
  const intent = intentResult?.success ? intentResult.data : undefined;

  const status =
    rawStatus === "complete" || rawStatus === "in_progress" || rawStatus === "abandoned"
      ? rawStatus
      : undefined;

  const q = typeof req.query.q === "string" ? req.query.q : undefined;

  const limitRaw = Number(req.query.limit ?? 20);
  const offsetRaw = Number(req.query.offset ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 5000) : 20;
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(Math.floor(offsetRaw), 0)
    : 0;

  const filters: LeadFilters = { limit, offset };

  if (intent) {
    filters.intent = intent;
  }
  if (status) {
    filters.status = status;
  }
  if (q) {
    filters.q = q;
  }

  const fromDate = parseDateMaybe(req.query.from);
  const toDate = parseDateMaybe(req.query.to);

  if (fromDate) {
    filters.from = fromDate;
  }
  if (toDate) {
    filters.to = toDate;
  }

  return filters;
};

const sendPrivacyVerificationEmail = async (
  to: string,
  link: string
): Promise<void> => {
  const {
    SMTP_HOST: host,
    SMTP_PORT: port,
    SMTP_USER: user,
    SMTP_PASS: pass,
    SMTP_FROM: from
  } = process.env;

  if (!host || !port || !user || !pass || !from) {
    throw new Error("SMTP credentials are required in production mode");
  }

  const transport = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: {
      user,
      pass
    }
  });

  await transport.sendMail({
    to,
    from,
    subject: "BBB Connecticut privacy request verification",
    text: `Verify your privacy request using this link: ${link}`
  });
};

const buildVerifyLink = (token: string): string => {
  const base = (process.env.PUBLIC_APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
  return `${base}/privacy-request/verify?token=${encodeURIComponent(token)}`;
};

const tokenToHash = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const createApp = (options: CreateAppOptions = {}): express.Express => {
  const store = options.store ?? new DrizzleStore();
  const sessionStore = options.sessionStore ?? new SessionStore();
  const app = express();

  app.set("trust proxy", 1);

  app.use(pinoHttp({ logger }));

  app.use(
    helmet({
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
          }
        : false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"]
        }
      }
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());
  app.use(sanitizeInputMiddleware);

  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.post("/api/leads/start", async (req: Request, res: Response) => {
    const parsed = startLeadSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid request body"
      });
      return;
    }

    const created = await store.createLead({
      intent: parsed.data.intent,
      accreditationStatus: parsed.data.accreditationStatus,
      isCtBusiness: parsed.data.isCtBusiness,
      businessName: parsed.data.businessName
    });

    res.status(201).json({ lead: created });
  });

  app.post("/api/leads/:id/answer", async (req: Request, res: Response) => {
    const leadId = String(req.params.id ?? "");
    const lead = await store.getLeadById(leadId);

    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const parsed = stepAnswerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid request body"
      });
      return;
    }

    const validation = validateStepByIntent(
      lead.intent,
      parsed.data.stepKey,
      parsed.data.value
    );

    if (!validation.success) {
      res.status(400).json({ error: validation.error });
      return;
    }

    let value = validation.parsed;
    if (parsed.data.stepKey === "phone" && typeof value === "string") {
      try {
        value = normalizePhoneToE164(value);
      } catch {
        res.status(400).json({ error: "Invalid phone number format" });
        return;
      }
    }

    const updated = await store.saveLeadAnswer(leadId, parsed.data.stepKey, value);
    if (!updated) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const flow = getFlowByIntent(updated.intent);
    const currentIndex = flow?.steps.findIndex((entry) => entry.key === parsed.data.stepKey) ?? -1;
    const nextStepKey =
      flow && currentIndex >= 0 && currentIndex < flow.steps.length - 1
        ? flow.steps[currentIndex + 1]?.key ?? null
        : null;

    res.json({ lead: updated, nextStepKey });
  });

  app.post("/api/leads/:id/complete", async (req: Request, res: Response) => {
    const lead = await store.completeLead(String(req.params.id ?? ""));

    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    res.json({ lead });
  });

  app.post("/api/admin/login", (req: Request, res: Response) => {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid email or password format" });
      return;
    }

    const expectedEmail = process.env.ADMIN_EMAIL ?? "";
    const expectedPassword = process.env.ADMIN_PASSWORD ?? "";

    if (
      !constantTimeEquals(parsed.data.email, expectedEmail) ||
      !constantTimeEquals(parsed.data.password, expectedPassword)
    ) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = sessionStore.create(parsed.data.email);

    res.cookie(sessionStore.getCookieName(), token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/"
    });

    res.json({ ok: true });
  });

  app.post("/api/admin/logout", (req: Request, res: Response) => {
    const cookieName = sessionStore.getCookieName();
    const token = req.cookies?.[cookieName] as string | undefined;

    if (token) {
      sessionStore.remove(token);
    }

    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/"
    });

    res.json({ ok: true });
  });

  app.use("/api/admin", requireAdminAuth(sessionStore));

  app.get("/api/admin/stats", async (_req: Request, res: Response) => {
    const stats = await store.getStats();
    res.json(stats);
  });

  app.get("/api/admin/leads", async (req: Request, res: Response) => {
    const filters = parseLeadFilters(req);
    const results = await store.listLeads(filters);

    res.json(results);
  });

  app.get("/api/admin/leads/:id", async (req: Request, res: Response) => {
    const lead = await store.getLeadById(String(req.params.id ?? ""));

    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    res.json({ lead });
  });

  app.get("/api/admin/export.csv", async (req: Request, res: Response) => {
    const filters = parseLeadFilters(req);
    const results = await store.listLeads({ ...filters, limit: 5000, offset: 0 });

    const rows = results.items.map((lead) => ({
      id: lead.id,
      created_at: lead.createdAt.toISOString(),
      updated_at: lead.updatedAt.toISOString(),
      status: lead.status,
      intent: lead.intent,
      accreditation_status: lead.accreditationStatus,
      business_name: lead.businessName,
      contact_name: lead.contactName ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      last_step_key: lead.lastStepKey ?? "",
      completed_at: lead.completedAt?.toISOString() ?? "",
      abandoned_at: lead.abandonedAt?.toISOString() ?? "",
      data_json: JSON.stringify(lead.data)
    }));

    const csv = stringify(rows, { header: true });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=leads-export.csv");
    res.status(200).send(csv);
  });

  app.post("/api/admin/jobs/mark-abandoned", async (_req: Request, res: Response) => {
    const updatedCount = await store.markAbandonedOlderThanDays(7);
    res.json({ ok: true, updatedCount });
  });

  app.post("/api/privacy/request", async (req: Request, res: Response) => {
    const parsed = privacyRequestCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid request body"
      });
      return;
    }

    const token = randomBytes(24).toString("hex");
    const tokenHash = tokenToHash(token);
    const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const createPrivacyInput = {
      requestType: parsed.data.requestType,
      email: parsed.data.email,
      tokenHash,
      tokenExpiresAt,
      ...(parsed.data.leadId ? { leadId: parsed.data.leadId } : {}),
      ...(parsed.data.details ? { details: parsed.data.details } : {})
    };

    const created = await store.createPrivacyRequest(createPrivacyInput);

    const verifyLink = buildVerifyLink(token);

    if (isProduction) {
      await sendPrivacyVerificationEmail(parsed.data.email, verifyLink);
    } else {
      req.log.info({ verifyLink, requestId: created.id }, "Privacy verification link");
    }

    res.status(201).json({
      requestId: created.id,
      message:
        "Verification required. Check your email for the verification link (dev mode logs it to server output)."
    });
  });

  app.get("/api/privacy/verify", async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (!token) {
      res.status(400).json({ error: "Missing token" });
      return;
    }

    const request = await store.getPrivacyRequestByTokenHash(tokenToHash(token));

    if (!request) {
      res.status(404).json({ error: "Privacy request not found" });
      return;
    }

    if (request.tokenExpiresAt < new Date()) {
      await store.updatePrivacyRequest(request.id, { status: "expired" });
      res.status(410).json({ error: "Token expired" });
      return;
    }

    let workingRequest = request;
    if (workingRequest.status === "pending_verification") {
      const updated = await store.updatePrivacyRequest(workingRequest.id, {
        status: "verified",
        verifiedAt: new Date()
      });
      if (updated) {
        workingRequest = updated;
      }
    }

    if (workingRequest.requestType === "delete") {
      const deletedCount = await store.anonymizeLeadsByEmail(
        workingRequest.email,
        workingRequest.leadId ?? undefined
      );

      const fulfilled = await store.updatePrivacyRequest(workingRequest.id, {
        status: "fulfilled",
        fulfilledAt: new Date(),
        details: {
          ...workingRequest.details,
          deletedCount
        }
      });

      res.json({
        requestType: "delete",
        status: fulfilled?.status ?? "fulfilled",
        deletedCount
      });
      return;
    }

    if (workingRequest.requestType === "correct") {
      const fulfilled = await store.updatePrivacyRequest(workingRequest.id, {
        status: "fulfilled",
        fulfilledAt: new Date(),
        details: {
          ...workingRequest.details,
          reviewStatus: "pending_admin_review"
        }
      });

      res.json({
        requestType: "correct",
        status: fulfilled?.status ?? "fulfilled",
        details: fulfilled?.details ?? workingRequest.details
      });
      return;
    }

    const matchedLeads = await store.findLeadsByEmail(
      workingRequest.email,
      workingRequest.leadId ?? undefined
    );

    res.json({
      requestType: "access",
      status: workingRequest.status,
      summary: matchedLeads.map((lead) => ({
        id: lead.id,
        businessName: lead.businessName,
        intent: lead.intent,
        status: lead.status,
        email: maskEmail(lead.email),
        phone: maskPhone(lead.phone),
        updatedAt: lead.updatedAt
      })),
      downloadUrl: `/api/privacy/download?token=${encodeURIComponent(token)}`
    });
  });

  app.get("/api/privacy/download", async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (!token) {
      res.status(400).json({ error: "Missing token" });
      return;
    }

    const request = await store.getPrivacyRequestByTokenHash(tokenToHash(token));

    if (!request) {
      res.status(404).json({ error: "Privacy request not found" });
      return;
    }

    if (request.tokenExpiresAt < new Date()) {
      await store.updatePrivacyRequest(request.id, { status: "expired" });
      res.status(410).json({ error: "Token expired" });
      return;
    }

    if (request.requestType !== "access") {
      res.status(400).json({ error: "Download only available for access requests" });
      return;
    }

    const leads = await store.findLeadsByEmail(request.email, request.leadId ?? undefined);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="privacy-access-${request.id}.json"`
    );

    res.json({
      requestId: request.id,
      email: request.email,
      leads
    });
  });

  const shouldServeStatic =
    options.serveStatic ?? process.env.NODE_ENV === "production";

  if (shouldServeStatic) {
    const webDistPath = getWebDistPath();
    if (webDistPath) {
      app.use(express.static(webDistPath));
      app.get(/^(?!\/api).*/, (_req, res) => {
        res.sendFile(path.join(webDistPath, "index.html"));
      });
    }
  }

  app.use((err: unknown, req: Request, res: Response, _next: unknown) => {
    req.log.error({ err }, "Unhandled API error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
};
