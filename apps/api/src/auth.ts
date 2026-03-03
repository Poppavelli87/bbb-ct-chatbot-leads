import type { NextFunction, Request, Response } from "express";

import type { SessionStore } from "./session.js";

export const requireAdminAuth = (sessionStore: SessionStore) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const cookieName = sessionStore.getCookieName();
    const token = req.cookies?.[cookieName] as string | undefined;

    if (!sessionStore.verify(token)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
};
