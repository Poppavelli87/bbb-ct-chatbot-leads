import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "../api";

type LeadStatus = "in_progress" | "complete";
type IntentFilter =
  | ""
  | "accreditation"
  | "advertising"
  | "ignite"
  | "both"
  | "out_of_scope"
  | "redirect_bbb_org";
type StatusFilter = "" | "in_progress" | "complete" | "abandoned";

type LeadRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: LeadStatus;
  intent: string;
  accreditationStatus: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  lastStepKey: string | null;
  completedAt: string | null;
  abandonedAt: string | null;
  data: Record<string, unknown>;
};

type Stats = {
  total: number;
  complete: number;
  inProgress: number;
  abandoned: number;
};

const abandonedCutoffMs = 30 * 60 * 1000;

const queryStringFrom = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") {
      continue;
    }
    search.set(key, String(value));
  }

  return search.toString();
};

export const AdminPage = () => {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);

  const [intent, setIntent] = useState<IntentFilter>("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const currentPage = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  const filtersQuery = useMemo(
    () =>
      queryStringFrom({
        intent,
        status,
        q: query,
        from: fromDate,
        to: toDate,
        limit,
        offset
      }),
    [fromDate, intent, limit, offset, query, status, toDate]
  );

  const exportUrl = `/api/admin/export.csv?${queryStringFrom({
    intent,
    status,
    q: query,
    from: fromDate,
    to: toDate
  })}`;

  const fetchStats = async () => {
    const payload = await apiRequest<Stats>("/api/admin/stats");
    setStats(payload);
  };

  const fetchRows = async () => {
    setLoadingRows(true);
    try {
      const payload = await apiRequest<{ total: number; items: LeadRow[] }>(
        `/api/admin/leads?${filtersQuery}`
      );
      setRows(payload.items);
      setTotal(payload.total);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    const verify = async () => {
      try {
        await fetchStats();
        setAuthenticated(true);
      } catch {
        setAuthenticated(false);
      } finally {
        setCheckingAuth(false);
      }
    };

    void verify();
  }, []);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    void fetchRows();
    void fetchStats();
  }, [authenticated, filtersQuery]);

  const submitLogin = async () => {
    setAuthError(null);

    try {
      await apiRequest("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      setAuthenticated(true);
      await fetchStats();
      await fetchRows();
    } catch (error) {
      setAuthError((error as Error).message);
    }
  };

  const logout = async () => {
    await apiRequest("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setRows([]);
    setStats(null);
  };

  const openLead = async (leadId: string) => {
    const payload = await apiRequest<{ lead: LeadRow }>(`/api/admin/leads/${leadId}`);
    setSelectedLead(payload.lead);
  };

  if (checkingAuth) {
    return <div className="panel">Checking admin session...</div>;
  }

  if (!authenticated) {
    return (
      <section className="mx-auto max-w-md panel">
        <h1 className="text-2xl font-semibold text-slate-900">Admin Login</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use your administrator username and password.
        </p>
        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitLogin();
          }}
        >
          <input
            type="text"
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="btn-primary w-full" type="submit">
            Sign in
          </button>
          {authError ? <p className="text-sm text-red-600">{authError}</p> : null}
        </form>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="panel flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Lead Dashboard</h1>
        <div className="flex gap-2">
          <a className="btn-secondary" href={exportUrl} target="_blank" rel="noreferrer">
            Export CSV
          </a>
          <button className="btn-secondary" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel stat-card">
          <span>Total</span>
          <strong>{stats?.total ?? 0}</strong>
        </div>
        <div className="panel stat-card">
          <span>Complete</span>
          <strong>{stats?.complete ?? 0}</strong>
        </div>
        <div className="panel stat-card">
          <span>In Progress</span>
          <strong>{stats?.inProgress ?? 0}</strong>
        </div>
        <div className="panel stat-card">
          <span>Abandoned</span>
          <strong>{stats?.abandoned ?? 0}</strong>
        </div>
      </div>

      <div className="panel grid gap-3 lg:grid-cols-6">
        <select
          className="rounded-xl border border-slate-300 px-3 py-2"
          value={intent}
          onChange={(event) => {
            setOffset(0);
            setIntent(event.target.value as IntentFilter);
          }}
        >
          <option value="">All intents</option>
          <option value="accreditation">Accreditation</option>
          <option value="advertising">Advertising</option>
          <option value="ignite">Ignite</option>
          <option value="both">Both</option>
          <option value="out_of_scope">Out of scope</option>
          <option value="redirect_bbb_org">Redirected to bbb.org</option>
        </select>
        <select
          className="rounded-xl border border-slate-300 px-3 py-2"
          value={status}
          onChange={(event) => {
            setOffset(0);
            setStatus(event.target.value as StatusFilter);
          }}
        >
          <option value="">All statuses</option>
          <option value="in_progress">In progress</option>
          <option value="complete">Complete</option>
          <option value="abandoned">Abandoned (30m)</option>
        </select>
        <input
          className="rounded-xl border border-slate-300 px-3 py-2 lg:col-span-2"
          value={query}
          onChange={(event) => {
            setOffset(0);
            setQuery(event.target.value);
          }}
          placeholder="Search business name, email, phone"
        />
        <input
          className="rounded-xl border border-slate-300 px-3 py-2"
          type="date"
          value={fromDate}
          onChange={(event) => {
            setOffset(0);
            setFromDate(event.target.value);
          }}
        />
        <input
          className="rounded-xl border border-slate-300 px-3 py-2"
          type="date"
          value={toDate}
          onChange={(event) => {
            setOffset(0);
            setToDate(event.target.value);
          }}
        />
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Business</th>
              <th className="px-3 py-2">Intent</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Last step</th>
              <th className="px-3 py-2">View</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => {
              const stale =
                lead.status === "in_progress" &&
                Date.now() - new Date(lead.updatedAt).getTime() > abandonedCutoffMs;

              return (
                <tr key={lead.id} className="border-t border-slate-200">
                  <td className="px-3 py-2">{new Date(lead.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{lead.businessName}</td>
                  <td className="px-3 py-2">{lead.intent}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        stale
                          ? "bg-amber-100 text-amber-800"
                          : lead.status === "complete"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {stale ? "abandoned" : lead.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{lead.email ?? "-"}</td>
                  <td className="px-3 py-2">{lead.phone ?? "-"}</td>
                  <td className="px-3 py-2">{lead.lastStepKey ?? "-"}</td>
                  <td className="px-3 py-2">
                    <button className="btn-secondary" onClick={() => void openLead(lead.id)}>
                      Details
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loadingRows && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  No leads match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="panel flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Page {currentPage} of {pageCount}
        </p>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            disabled={offset === 0}
            onClick={() => setOffset((previous) => Math.max(0, previous - limit))}
          >
            Previous
          </button>
          <button
            className="btn-secondary"
            disabled={offset + limit >= total}
            onClick={() => setOffset((previous) => previous + limit)}
          >
            Next
          </button>
        </div>
      </div>

      {selectedLead ? (
        <div className="fixed inset-0 z-20 bg-slate-900/35 p-4" onClick={() => setSelectedLead(null)}>
          <div
            className="ml-auto h-full w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Lead Detail</h2>
              <button className="btn-secondary" onClick={() => setSelectedLead(null)}>
                Close
              </button>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="font-medium text-slate-700">ID</dt>
                <dd className="break-all text-slate-900">{selectedLead.id}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Business</dt>
                <dd>{selectedLead.businessName}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Intent</dt>
                <dd>{selectedLead.intent}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Status</dt>
                <dd>{selectedLead.status}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Email</dt>
                <dd>{selectedLead.email ?? "-"}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Phone</dt>
                <dd>{selectedLead.phone ?? "-"}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Last Step</dt>
                <dd>{selectedLead.lastStepKey ?? "-"}</dd>
              </div>
            </dl>
            <h3 className="mt-4 text-sm font-semibold text-slate-700">Captured Data</h3>
            <pre className="mt-2 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(selectedLead.data, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </section>
  );
};
