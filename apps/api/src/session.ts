import { randomBytes } from "node:crypto";

type SessionRecord = {
  email: string;
  expiresAt: Date;
};

export class SessionStore {
  private readonly cookieName = "bbb_admin_session";

  private sessions = new Map<string, SessionRecord>();

  getCookieName(): string {
    return this.cookieName;
  }

  create(email: string): string {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    this.sessions.set(token, { email, expiresAt });
    return token;
  }

  remove(token: string): void {
    this.sessions.delete(token);
  }

  verify(token?: string): boolean {
    if (!token) {
      return false;
    }

    const existing = this.sessions.get(token);
    if (!existing) {
      return false;
    }

    if (existing.expiresAt <= new Date()) {
      this.sessions.delete(token);
      return false;
    }

    return true;
  }
}
