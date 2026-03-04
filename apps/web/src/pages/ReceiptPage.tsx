import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiRequest } from "../api";

type ReceiptPayload = {
  receiptId: string;
  sealedAt: string;
  verified: boolean;
  intent: string;
  businessName: string;
  completedAt: string | null;
};

export const ReceiptPage = () => {
  const { receiptId } = useParams<{ receiptId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptPayload | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!receiptId) {
        setError("Missing receipt ID");
        setLoading(false);
        return;
      }

      try {
        const payload = await apiRequest<ReceiptPayload>(
          `/api/receipt/${encodeURIComponent(receiptId)}`
        );
        setReceipt(payload);
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [receiptId]);

  return (
    <section className="mx-auto max-w-2xl panel space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Submission Receipt</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page confirms whether your application receipt signature is valid.
        </p>
      </div>

      {loading ? <p className="text-sm text-slate-700">Loading receipt...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {receipt ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <dl className="space-y-2">
            <div>
              <dt className="font-medium text-slate-700">Receipt ID</dt>
              <dd className="font-semibold text-slate-900">{receipt.receiptId}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Sealed At</dt>
              <dd>{new Date(receipt.sealedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Verified Status</dt>
              <dd>
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                    receipt.verified
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {receipt.verified ? "Verified" : "Unable to verify"}
                </span>
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Business Name</dt>
              <dd>{receipt.businessName}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Application Type</dt>
              <dd>{receipt.intent}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Completed At</dt>
              <dd>{receipt.completedAt ? new Date(receipt.completedAt).toLocaleString() : "-"}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div>
        <Link className="btn-secondary inline-flex" to="/">
          Back to chatbot
        </Link>
      </div>
    </section>
  );
};
