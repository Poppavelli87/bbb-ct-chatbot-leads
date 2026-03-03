import { sanitizeText } from "@bbb/shared";
import type { NextFunction, Request, Response } from "express";

const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return sanitizeText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = sanitizeValue(entry);
    }
    return next;
  }

  return value;
};

export const sanitizeInputMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  req.body = sanitizeValue(req.body);

  const queryObject = req.query as Record<string, unknown>;
  for (const key of Object.keys(queryObject)) {
    queryObject[key] = sanitizeValue(queryObject[key]);
  }

  const paramObject = req.params as Record<string, unknown>;
  for (const key of Object.keys(paramObject)) {
    paramObject[key] = sanitizeValue(paramObject[key]);
  }

  next();
};
