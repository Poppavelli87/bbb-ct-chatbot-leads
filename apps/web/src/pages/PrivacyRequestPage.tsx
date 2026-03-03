import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { apiRequest } from "../api";

type RequestType = "access" | "correct" | "delete";

type VerifyResponse = {
  requestType: RequestType;
  status: string;
  summary?: Array<{
    id: string;
    businessName: string;
    intent: string;
    status: string;
    email: string | null;
    phone: string | null;
    updatedAt: string;
  }>;
  downloadUrl?: string;
  details?: Record<string, unknown>;
  deletedCount?: number;
};

export const PrivacyRequestPage = () => {
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [requestType, setRequestType] = useState<RequestType>("access");
  const [leadId, setLeadId] = useState("");
  const [details, setDetails] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerifyResponse | null>(null);
  const [loadingVerify, setLoadingVerify] = useState(false);

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const rawToken = params.get("token");
    return rawToken && rawToken.length > 0 ? rawToken : null;
  }, [location.search]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const verify = async () => {
      setLoadingVerify(true);
      setErrorMessage(null);
      try {
        const payload = await apiRequest<VerifyResponse>(
          `/api/privacy/verify?token=${encodeURIComponent(token)}`
        );
        setVerificationResult(payload);
      } catch (error) {
        setErrorMessage((error as Error).message);
      } finally {
        setLoadingVerify(false);
      }
    };

    void verify();
  }, [token]);

  const submitRequest = async () => {
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const payload = await apiRequest<{ requestId: string; message: string }>(
        "/api/privacy/request",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            requestType,
            leadId: leadId || undefined,
            details: details.trim() ? { note: details.trim() } : undefined
          })
        }
      );

      setStatusMessage(`${payload.message} Request ID: ${payload.requestId}`);
      setDetails("");
      setLeadId("");
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <section className="panel">
        <h1 className="text-2xl font-semibold text-slate-900">Privacy Request</h1>
        <p className="mt-2 text-sm text-slate-600">
          Submit an access, correction, or deletion request. You’ll verify ownership via
          secure token link.
        </p>

        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitRequest();
          }}
        >
          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <select
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
            value={requestType}
            onChange={(event) => setRequestType(event.target.value as RequestType)}
          >
            <option value="access">Access</option>
            <option value="correct">Correct</option>
            <option value="delete">Delete</option>
          </select>

          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
            placeholder="Lead ID (optional)"
            value={leadId}
            onChange={(event) => setLeadId(event.target.value)}
          />

          <textarea
            className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2"
            placeholder="Correction details or notes (optional)"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />

          <button className="btn-primary" type="submit">
            Submit request
          </button>
        </form>

        {statusMessage ? <p className="mt-3 text-sm text-emerald-700">{statusMessage}</p> : null}
        {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}
      </section>

      <section className="panel">
        <h2 className="text-xl font-semibold text-slate-900">Verification</h2>
        <p className="mt-2 text-sm text-slate-600">
          Open this page from your emailed link (`/privacy-request/verify?token=...`) to
          verify and process your request.
        </p>

        {loadingVerify ? <p className="mt-4 text-sm">Verifying token...</p> : null}

        {verificationResult ? (
          <div className="mt-4 space-y-3 text-sm">
            <p>
              Type: <strong>{verificationResult.requestType}</strong>
            </p>
            <p>
              Status: <strong>{verificationResult.status}</strong>
            </p>

            {verificationResult.requestType === "access" && verificationResult.summary ? (
              <div className="space-y-2">
                <h3 className="font-semibold text-slate-800">Masked lead summary</h3>
                <div className="space-y-2">
                  {verificationResult.summary.map((lead) => (
                    <div key={lead.id} className="rounded-xl border border-slate-200 p-3">
                      <p className="font-medium text-slate-900">{lead.businessName}</p>
                      <p>{lead.intent}</p>
                      <p>{lead.email ?? "-"}</p>
                      <p>{lead.phone ?? "-"}</p>
                    </div>
                  ))}
                </div>
                {verificationResult.downloadUrl ? (
                  <a className="btn-secondary inline-flex" href={verificationResult.downloadUrl}>
                    Download JSON
                  </a>
                ) : null}
              </div>
            ) : null}

            {verificationResult.requestType === "delete" ? (
              <p>Deleted records: {verificationResult.deletedCount ?? 0}</p>
            ) : null}

            {verificationResult.requestType === "correct" ? (
              <pre className="rounded-xl bg-slate-100 p-3 text-xs text-slate-800">
                {JSON.stringify(verificationResult.details, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
};
