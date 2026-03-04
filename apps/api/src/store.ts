import { randomUUID } from "node:crypto";

import { db, leads, privacyRequests, submissionReceipts } from "@bbb/db";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL
} from "drizzle-orm";

import type {
  AccreditationStatus,
  LeadIntent,
  LeadStatus,
  PrivacyRequestStatus,
  PrivacyRequestType
} from "@bbb/shared";

export type LeadRecord = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: LeadStatus;
  intent: LeadIntent;
  accreditationStatus: AccreditationStatus;
  isCtBusiness: boolean;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  lastStepKey: string | null;
  completedAt: Date | null;
  abandonedAt: Date | null;
  data: Record<string, unknown>;
};

export type PrivacyRequestRecord = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  requestType: PrivacyRequestType;
  email: string;
  leadId: string | null;
  status: PrivacyRequestStatus;
  tokenHash: string;
  tokenExpiresAt: Date;
  verifiedAt: Date | null;
  fulfilledAt: Date | null;
  details: Record<string, unknown>;
};

export type SubmissionReceiptRecord = {
  id: string;
  receiptId: string;
  leadId: string;
  keyId: string;
  payloadJson: Record<string, unknown>;
  payloadHash: string;
  signature: string;
  sealedAt: Date;
  verifiedAt: Date | null;
};

export type LeadFilters = {
  intent?: LeadIntent;
  status?: LeadStatus | "abandoned";
  q?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
};

export type LeadStats = {
  total: number;
  complete: number;
  inProgress: number;
  abandoned: number;
};

export type CreateLeadInput = {
  intent: LeadIntent;
  accreditationStatus: AccreditationStatus;
  isCtBusiness: boolean;
  businessName: string;
  status?: LeadStatus;
};

export type CreatePrivacyRequestInput = {
  requestType: PrivacyRequestType;
  email: string;
  leadId?: string;
  tokenHash: string;
  tokenExpiresAt: Date;
  details?: Record<string, unknown>;
};

export type CreateSubmissionReceiptInput = {
  receiptId: string;
  leadId: string;
  keyId: string;
  payloadJson: Record<string, unknown>;
  payloadHash: string;
  signature: string;
};

export interface AppStore {
  createLead(input: CreateLeadInput): Promise<LeadRecord>;
  getLeadById(id: string): Promise<LeadRecord | null>;
  saveLeadAnswer(
    leadId: string,
    stepKey: string,
    value: unknown
  ): Promise<LeadRecord | null>;
  completeLead(leadId: string): Promise<LeadRecord | null>;
  listLeads(filters: LeadFilters): Promise<{ total: number; items: LeadRecord[] }>;
  getStats(): Promise<LeadStats>;
  markAbandonedOlderThanDays(days: number): Promise<number>;
  createPrivacyRequest(input: CreatePrivacyRequestInput): Promise<PrivacyRequestRecord>;
  getPrivacyRequestByTokenHash(hash: string): Promise<PrivacyRequestRecord | null>;
  updatePrivacyRequest(
    id: string,
    updates: Partial<Omit<PrivacyRequestRecord, "id" | "createdAt" | "tokenHash">>
  ): Promise<PrivacyRequestRecord | null>;
  createSubmissionReceipt(input: CreateSubmissionReceiptInput): Promise<SubmissionReceiptRecord>;
  getSubmissionReceiptByReceiptId(receiptId: string): Promise<SubmissionReceiptRecord | null>;
  getSubmissionReceiptByLeadId(leadId: string): Promise<SubmissionReceiptRecord | null>;
  markSubmissionReceiptVerified(
    receiptId: string,
    verifiedAt: Date
  ): Promise<SubmissionReceiptRecord | null>;
  findLeadsByEmail(email: string, leadId?: string): Promise<LeadRecord[]>;
  anonymizeLeadsByEmail(email: string, leadId?: string): Promise<number>;
}

const mapLead = (row: typeof leads.$inferSelect): LeadRecord => ({
  id: row.id,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  status: row.status,
  intent: row.intent,
  accreditationStatus: row.accreditationStatus,
  isCtBusiness: row.isCtBusiness,
  businessName: row.businessName,
  contactName: row.contactName,
  email: row.email,
  phone: row.phone,
  lastStepKey: row.lastStepKey,
  completedAt: row.completedAt,
  abandonedAt: row.abandonedAt,
  data: (row.data as Record<string, unknown>) ?? {}
});

const mapPrivacyRequest = (
  row: typeof privacyRequests.$inferSelect
): PrivacyRequestRecord => ({
  id: row.id,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  requestType: row.requestType,
  email: row.email,
  leadId: row.leadId,
  status: row.status,
  tokenHash: row.tokenHash,
  tokenExpiresAt: row.tokenExpiresAt,
  verifiedAt: row.verifiedAt,
  fulfilledAt: row.fulfilledAt,
  details: (row.details as Record<string, unknown>) ?? {}
});

const mapSubmissionReceipt = (
  row: typeof submissionReceipts.$inferSelect
): SubmissionReceiptRecord => ({
  id: row.id,
  receiptId: row.receiptId,
  leadId: row.leadId,
  keyId: row.keyId,
  payloadJson: (row.payloadJson as Record<string, unknown>) ?? {},
  payloadHash: row.payloadHash,
  signature: row.signature,
  sealedAt: row.sealedAt,
  verifiedAt: row.verifiedAt
});

const nowMinusMinutes = (minutes: number): Date =>
  new Date(Date.now() - minutes * 60 * 1000);

export class DrizzleStore implements AppStore {
  async createLead(input: CreateLeadInput): Promise<LeadRecord> {
    const [created] = await db
      .insert(leads)
      .values({
        intent: input.intent,
        accreditationStatus: input.accreditationStatus,
        isCtBusiness: input.isCtBusiness,
        businessName: input.businessName,
        status: input.status ?? "in_progress",
        data: {}
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create lead");
    }

    return mapLead(created);
  }

  async getLeadById(id: string): Promise<LeadRecord | null> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead ? mapLead(lead) : null;
  }

  async saveLeadAnswer(
    leadId: string,
    stepKey: string,
    value: unknown
  ): Promise<LeadRecord | null> {
    const existing = await this.getLeadById(leadId);
    if (!existing) {
      return null;
    }

    const nextData = {
      ...(existing.data ?? {}),
      [stepKey]: value
    };

    const updatePayload: Partial<typeof leads.$inferInsert> = {
      data: nextData,
      lastStepKey: stepKey,
      updatedAt: new Date()
    };

    if (stepKey === "contact_name" && typeof value === "string") {
      updatePayload.contactName = value;
    }

    if (stepKey === "email" && typeof value === "string") {
      updatePayload.email = value;
    }

    if (stepKey === "phone" && typeof value === "string") {
      updatePayload.phone = value;
    }

    const [updated] = await db
      .update(leads)
      .set(updatePayload)
      .where(eq(leads.id, leadId))
      .returning();

    return updated ? mapLead(updated) : null;
  }

  async completeLead(leadId: string): Promise<LeadRecord | null> {
    const [updated] = await db
      .update(leads)
      .set({
        status: "complete",
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(leads.id, leadId))
      .returning();

    return updated ? mapLead(updated) : null;
  }

  async createSubmissionReceipt(
    input: CreateSubmissionReceiptInput
  ): Promise<SubmissionReceiptRecord> {
    const [created] = await db
      .insert(submissionReceipts)
      .values({
        receiptId: input.receiptId,
        leadId: input.leadId,
        keyId: input.keyId,
        payloadJson: input.payloadJson,
        payloadHash: input.payloadHash,
        signature: input.signature
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create submission receipt");
    }

    return mapSubmissionReceipt(created);
  }

  async getSubmissionReceiptByReceiptId(
    receiptId: string
  ): Promise<SubmissionReceiptRecord | null> {
    const [row] = await db
      .select()
      .from(submissionReceipts)
      .where(eq(submissionReceipts.receiptId, receiptId));

    return row ? mapSubmissionReceipt(row) : null;
  }

  async getSubmissionReceiptByLeadId(leadId: string): Promise<SubmissionReceiptRecord | null> {
    const [row] = await db
      .select()
      .from(submissionReceipts)
      .where(eq(submissionReceipts.leadId, leadId));

    return row ? mapSubmissionReceipt(row) : null;
  }

  async markSubmissionReceiptVerified(
    receiptId: string,
    verifiedAt: Date
  ): Promise<SubmissionReceiptRecord | null> {
    const [updated] = await db
      .update(submissionReceipts)
      .set({
        verifiedAt
      })
      .where(eq(submissionReceipts.receiptId, receiptId))
      .returning();

    return updated ? mapSubmissionReceipt(updated) : null;
  }

  async listLeads(filters: LeadFilters): Promise<{ total: number; items: LeadRecord[] }> {
    const conditions: SQL[] = [];

    if (filters.intent) {
      conditions.push(eq(leads.intent, filters.intent));
    }

    if (filters.status === "abandoned") {
      conditions.push(eq(leads.status, "in_progress"));
      conditions.push(lt(leads.updatedAt, nowMinusMinutes(30)));
    } else if (filters.status) {
      conditions.push(eq(leads.status, filters.status));
    }

    if (filters.q) {
      const likeQuery = `%${filters.q}%`;
      const textFilter = or(
        ilike(leads.businessName, likeQuery),
        ilike(leads.email, likeQuery),
        ilike(leads.phone, likeQuery)
      );
      if (textFilter) {
        conditions.push(textFilter);
      }
    }

    if (filters.from) {
      conditions.push(gte(leads.createdAt, filters.from));
    }

    if (filters.to) {
      conditions.push(lte(leads.createdAt, filters.to));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.createdAt))
      .limit(filters.limit)
      .offset(filters.offset);

    const [countRow] = await db
      .select({ total: sql<number>`count(*)` })
      .from(leads)
      .where(whereClause);

    return {
      total: Number(countRow?.total ?? 0),
      items: rows.map(mapLead)
    };
  }

  async getStats(): Promise<LeadStats> {
    const [total] = await db.select({ value: sql<number>`count(*)` }).from(leads);
    const [complete] = await db
      .select({ value: sql<number>`count(*)` })
      .from(leads)
      .where(eq(leads.status, "complete"));
    const [inProgress] = await db
      .select({ value: sql<number>`count(*)` })
      .from(leads)
      .where(eq(leads.status, "in_progress"));
    const [abandoned] = await db
      .select({ value: sql<number>`count(*)` })
      .from(leads)
      .where(and(eq(leads.status, "in_progress"), lt(leads.updatedAt, nowMinusMinutes(30))));

    return {
      total: Number(total?.value ?? 0),
      complete: Number(complete?.value ?? 0),
      inProgress: Number(inProgress?.value ?? 0),
      abandoned: Number(abandoned?.value ?? 0)
    };
  }

  async markAbandonedOlderThanDays(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const updated = await db
      .update(leads)
      .set({
        abandonedAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(leads.status, "in_progress"),
          lt(leads.updatedAt, cutoff),
          isNull(leads.abandonedAt)
        )
      )
      .returning({ id: leads.id });

    return updated.length;
  }

  async createPrivacyRequest(
    input: CreatePrivacyRequestInput
  ): Promise<PrivacyRequestRecord> {
    const [created] = await db
      .insert(privacyRequests)
      .values({
        requestType: input.requestType,
        email: input.email,
        leadId: input.leadId,
        tokenHash: input.tokenHash,
        tokenExpiresAt: input.tokenExpiresAt,
        details: input.details ?? {}
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create privacy request");
    }

    return mapPrivacyRequest(created);
  }

  async getPrivacyRequestByTokenHash(
    hash: string
  ): Promise<PrivacyRequestRecord | null> {
    const [record] = await db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.tokenHash, hash));

    return record ? mapPrivacyRequest(record) : null;
  }

  async updatePrivacyRequest(
    id: string,
    updates: Partial<Omit<PrivacyRequestRecord, "id" | "createdAt" | "tokenHash">>
  ): Promise<PrivacyRequestRecord | null> {
    const setPayload: Partial<typeof privacyRequests.$inferInsert> = {
      updatedAt: new Date()
    };

    if (updates.status) {
      setPayload.status = updates.status;
    }
    if (updates.verifiedAt !== undefined) {
      setPayload.verifiedAt = updates.verifiedAt;
    }
    if (updates.fulfilledAt !== undefined) {
      setPayload.fulfilledAt = updates.fulfilledAt;
    }
    if (updates.details) {
      setPayload.details = updates.details;
    }
    if (updates.leadId !== undefined) {
      setPayload.leadId = updates.leadId;
    }
    if (updates.email) {
      setPayload.email = updates.email;
    }
    if (updates.requestType) {
      setPayload.requestType = updates.requestType;
    }
    if (updates.tokenExpiresAt) {
      setPayload.tokenExpiresAt = updates.tokenExpiresAt;
    }

    const [updated] = await db
      .update(privacyRequests)
      .set(setPayload)
      .where(eq(privacyRequests.id, id))
      .returning();

    return updated ? mapPrivacyRequest(updated) : null;
  }

  async findLeadsByEmail(email: string, leadId?: string): Promise<LeadRecord[]> {
    const conditions: SQL[] = [eq(leads.email, email)];

    if (leadId) {
      conditions.push(eq(leads.id, leadId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db.select().from(leads).where(whereClause);
    return rows.map(mapLead);
  }

  async anonymizeLeadsByEmail(email: string, leadId?: string): Promise<number> {
    const conditions: SQL[] = [eq(leads.email, email)];
    if (leadId) {
      conditions.push(eq(leads.id, leadId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const updated = await db
      .update(leads)
      .set({
        data: {},
        contactName: null,
        email: null,
        phone: null,
        updatedAt: new Date()
      })
      .where(whereClause)
      .returning({ id: leads.id });

    return updated.length;
  }
}

export class MemoryStore implements AppStore {
  private leadRows: LeadRecord[] = [];

  private privacyRows: PrivacyRequestRecord[] = [];

  private submissionReceiptRows: SubmissionReceiptRecord[] = [];

  async createLead(input: CreateLeadInput): Promise<LeadRecord> {
    const now = new Date();
    const row: LeadRecord = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: input.status ?? "in_progress",
      intent: input.intent,
      accreditationStatus: input.accreditationStatus,
      isCtBusiness: input.isCtBusiness,
      businessName: input.businessName,
      contactName: null,
      email: null,
      phone: null,
      lastStepKey: null,
      completedAt: null,
      abandonedAt: null,
      data: {}
    };

    this.leadRows.unshift(row);
    return { ...row };
  }

  async getLeadById(id: string): Promise<LeadRecord | null> {
    const found = this.leadRows.find((row) => row.id === id);
    return found ? { ...found, data: { ...found.data } } : null;
  }

  async saveLeadAnswer(
    leadId: string,
    stepKey: string,
    value: unknown
  ): Promise<LeadRecord | null> {
    const existing = this.leadRows.find((row) => row.id === leadId);
    if (!existing) {
      return null;
    }

    existing.data = {
      ...existing.data,
      [stepKey]: value
    };
    existing.lastStepKey = stepKey;
    existing.updatedAt = new Date();

    if (stepKey === "contact_name" && typeof value === "string") {
      existing.contactName = value;
    }
    if (stepKey === "email" && typeof value === "string") {
      existing.email = value;
    }
    if (stepKey === "phone" && typeof value === "string") {
      existing.phone = value;
    }

    return { ...existing, data: { ...existing.data } };
  }

  async completeLead(leadId: string): Promise<LeadRecord | null> {
    const existing = this.leadRows.find((row) => row.id === leadId);
    if (!existing) {
      return null;
    }

    existing.status = "complete";
    existing.completedAt = new Date();
    existing.updatedAt = new Date();

    return { ...existing, data: { ...existing.data } };
  }

  async createSubmissionReceipt(
    input: CreateSubmissionReceiptInput
  ): Promise<SubmissionReceiptRecord> {
    const row: SubmissionReceiptRecord = {
      id: randomUUID(),
      receiptId: input.receiptId,
      leadId: input.leadId,
      keyId: input.keyId,
      payloadJson: { ...input.payloadJson },
      payloadHash: input.payloadHash,
      signature: input.signature,
      sealedAt: new Date(),
      verifiedAt: null
    };

    this.submissionReceiptRows.push(row);
    return { ...row, payloadJson: { ...row.payloadJson } };
  }

  async getSubmissionReceiptByReceiptId(
    receiptId: string
  ): Promise<SubmissionReceiptRecord | null> {
    const row = this.submissionReceiptRows.find((entry) => entry.receiptId === receiptId);
    return row ? { ...row, payloadJson: { ...row.payloadJson } } : null;
  }

  async getSubmissionReceiptByLeadId(leadId: string): Promise<SubmissionReceiptRecord | null> {
    const row = this.submissionReceiptRows.find((entry) => entry.leadId === leadId);
    return row ? { ...row, payloadJson: { ...row.payloadJson } } : null;
  }

  async markSubmissionReceiptVerified(
    receiptId: string,
    verifiedAt: Date
  ): Promise<SubmissionReceiptRecord | null> {
    const row = this.submissionReceiptRows.find((entry) => entry.receiptId === receiptId);
    if (!row) {
      return null;
    }

    row.verifiedAt = verifiedAt;
    return { ...row, payloadJson: { ...row.payloadJson } };
  }

  async listLeads(filters: LeadFilters): Promise<{ total: number; items: LeadRecord[] }> {
    let results = [...this.leadRows];

    if (filters.intent) {
      results = results.filter((item) => item.intent === filters.intent);
    }

    if (filters.status === "abandoned") {
      const cutoff = nowMinusMinutes(30);
      results = results.filter(
        (item) => item.status === "in_progress" && item.updatedAt < cutoff
      );
    } else if (filters.status) {
      results = results.filter((item) => item.status === filters.status);
    }

    if (filters.q) {
      const query = filters.q.toLowerCase();
      results = results.filter((item) => {
        return [item.businessName, item.email ?? "", item.phone ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
    }

    if (filters.from) {
      results = results.filter((item) => item.createdAt >= filters.from!);
    }

    if (filters.to) {
      results = results.filter((item) => item.createdAt <= filters.to!);
    }

    const total = results.length;
    const items = results.slice(filters.offset, filters.offset + filters.limit);

    return {
      total,
      items: items.map((item) => ({ ...item, data: { ...item.data } }))
    };
  }

  async getStats(): Promise<LeadStats> {
    const cutoff = nowMinusMinutes(30);
    return {
      total: this.leadRows.length,
      complete: this.leadRows.filter((item) => item.status === "complete").length,
      inProgress: this.leadRows.filter((item) => item.status === "in_progress").length,
      abandoned: this.leadRows.filter(
        (item) => item.status === "in_progress" && item.updatedAt < cutoff
      ).length
    };
  }

  async markAbandonedOlderThanDays(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let count = 0;

    for (const lead of this.leadRows) {
      if (
        lead.status === "in_progress" &&
        lead.updatedAt < cutoff &&
        lead.abandonedAt === null
      ) {
        lead.abandonedAt = new Date();
        count += 1;
      }
    }

    return count;
  }

  async createPrivacyRequest(
    input: CreatePrivacyRequestInput
  ): Promise<PrivacyRequestRecord> {
    const now = new Date();
    const row: PrivacyRequestRecord = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      requestType: input.requestType,
      email: input.email,
      leadId: input.leadId ?? null,
      status: "pending_verification",
      tokenHash: input.tokenHash,
      tokenExpiresAt: input.tokenExpiresAt,
      verifiedAt: null,
      fulfilledAt: null,
      details: input.details ?? {}
    };

    this.privacyRows.push(row);
    return { ...row, details: { ...row.details } };
  }

  async getPrivacyRequestByTokenHash(hash: string): Promise<PrivacyRequestRecord | null> {
    const row = this.privacyRows.find((entry) => entry.tokenHash === hash);
    return row ? { ...row, details: { ...row.details } } : null;
  }

  async updatePrivacyRequest(
    id: string,
    updates: Partial<Omit<PrivacyRequestRecord, "id" | "createdAt" | "tokenHash">>
  ): Promise<PrivacyRequestRecord | null> {
    const row = this.privacyRows.find((entry) => entry.id === id);
    if (!row) {
      return null;
    }

    Object.assign(row, updates);
    row.updatedAt = new Date();

    return { ...row, details: { ...row.details } };
  }

  async findLeadsByEmail(email: string, leadId?: string): Promise<LeadRecord[]> {
    return this.leadRows
      .filter((lead) => lead.email === email && (!leadId || lead.id === leadId))
      .map((row) => ({ ...row, data: { ...row.data } }));
  }

  async anonymizeLeadsByEmail(email: string, leadId?: string): Promise<number> {
    const rows = this.leadRows.filter(
      (lead) => lead.email === email && (!leadId || lead.id === leadId)
    );

    for (const row of rows) {
      row.data = {};
      row.contactName = null;
      row.email = null;
      row.phone = null;
      row.updatedAt = new Date();
    }

    return rows.length;
  }
}
