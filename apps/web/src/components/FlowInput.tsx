import { useMemo, useState } from "react";

import type { StepDefinition } from "@bbb/shared";

type FlowInputProps = {
  step: StepDefinition;
  disabled?: boolean;
  onSubmit: (value: unknown, displayText: string) => Promise<void>;
};

const formatDisplay = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return value.toString();
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return JSON.stringify(value);
};

export const FlowInput = ({ step, disabled, onSubmit }: FlowInputProps) => {
  const [textValue, setTextValue] = useState("");
  const [multiValues, setMultiValues] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [pending, setPending] = useState(false);

  const interactiveDisabled = disabled || pending;

  const submit = async (value: unknown, displayText = formatDisplay(value)) => {
    setPending(true);
    try {
      await onSubmit(value, displayText);
      setTextValue("");
      setMultiValues([]);
      setOtherText("");
      setAddressLine1("");
      setAddressLine2("");
    } finally {
      setPending(false);
    }
  };

  const objectInput = useMemo(() => {
    if (step.type !== "object") {
      return null;
    }

    if (step.key === "industry_type") {
      return (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const selected = multiValues[0];
            if (!selected) {
              return;
            }
            void submit({ value: selected, otherText }, selected);
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {step.options?.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={interactiveDisabled}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  multiValues[0] === option.value
                    ? "border-orange-500 bg-orange-100"
                    : "border-slate-300 bg-white hover:border-orange-300 hover:bg-orange-50 hover:shadow-sm"
                }`}
                onClick={() => setMultiValues([option.value])}
              >
                {option.label}
              </button>
            ))}
          </div>
          {multiValues[0] === "other" ? (
            <input
              className="rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Please specify"
              value={otherText}
              onChange={(event) => setOtherText(event.target.value)}
              disabled={interactiveDisabled}
            />
          ) : null}
          <button
            className="btn-primary"
            type="submit"
            disabled={interactiveDisabled || multiValues.length === 0}
          >
            Submit
          </button>
        </form>
      );
    }

    if (step.key === "advertising_interests") {
      return (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (multiValues.length === 0) {
              return;
            }
            void submit(
              { values: multiValues, otherText },
              multiValues.join(", ")
            );
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {step.options?.map((option) => {
              const selected = multiValues.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={interactiveDisabled}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    selected
                      ? "border-orange-500 bg-orange-100"
                      : "border-slate-300 bg-white hover:border-orange-300 hover:bg-orange-50 hover:shadow-sm"
                  }`}
                  onClick={() => {
                    setMultiValues((previous) =>
                      selected
                        ? previous.filter((entry) => entry !== option.value)
                        : [...previous, option.value]
                    );
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {multiValues.includes("other") ? (
            <input
              className="rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Please specify"
              value={otherText}
              onChange={(event) => setOtherText(event.target.value)}
              disabled={interactiveDisabled}
            />
          ) : null}
          <button
            className="btn-primary"
            type="submit"
            disabled={interactiveDisabled || multiValues.length === 0}
          >
            Submit
          </button>
        </form>
      );
    }

    if (step.key === "address_lines") {
      return (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!addressLine1.trim()) {
              return;
            }
            void submit(
              {
                addressLine1,
                addressLine2
              },
              `${addressLine1}${addressLine2 ? `, ${addressLine2}` : ""}`
            );
          }}
        >
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            placeholder="Address line 1"
            value={addressLine1}
            onChange={(event) => setAddressLine1(event.target.value)}
            disabled={interactiveDisabled}
          />
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            placeholder="Address line 2 (optional)"
            value={addressLine2}
            onChange={(event) => setAddressLine2(event.target.value)}
            disabled={interactiveDisabled}
          />
          <button
            className="btn-primary"
            type="submit"
            disabled={interactiveDisabled || !addressLine1.trim()}
          >
            Submit
          </button>
        </form>
      );
    }

    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!textValue.trim()) {
            return;
          }
          void submit(textValue, textValue);
        }}
      >
        <textarea
          value={textValue}
          onChange={(event) => setTextValue(event.target.value)}
          className="min-h-24 rounded-xl border border-slate-300 px-3 py-2"
          disabled={interactiveDisabled}
        />
        <button className="btn-primary" type="submit" disabled={interactiveDisabled}>
          Submit
        </button>
      </form>
    );
  }, [
    addressLine1,
    addressLine2,
    interactiveDisabled,
    multiValues,
    onSubmit,
    otherText,
    step,
    textValue
  ]);

  if (step.type === "select") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {step.options?.map((option) => (
          <button
            key={option.value}
            className="option-btn"
            type="button"
            disabled={interactiveDisabled}
            onClick={() => {
              void submit(option.value, option.label);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  if (step.type === "boolean") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="option-btn"
          type="button"
          disabled={interactiveDisabled}
          onClick={() => {
            void submit(true, "Yes");
          }}
        >
          Yes
        </button>
        <button
          className="option-btn"
          type="button"
          disabled={interactiveDisabled}
          onClick={() => {
            void submit(false, "No");
          }}
        >
          No
        </button>
      </div>
    );
  }

  if (step.type === "multi_select") {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (multiValues.length === 0) {
            return;
          }
          void submit(multiValues, multiValues.join(", "));
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {step.options?.map((option) => {
            const selected = multiValues.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  selected
                    ? "border-orange-500 bg-orange-100"
                    : "border-slate-300 bg-white hover:border-orange-300 hover:bg-orange-50 hover:shadow-sm"
                }`}
                onClick={() =>
                  setMultiValues((previous) =>
                    selected
                      ? previous.filter((entry) => entry !== option.value)
                      : [...previous, option.value]
                  )
                }
                disabled={interactiveDisabled}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <button
          className="btn-primary"
          type="submit"
          disabled={interactiveDisabled || multiValues.length === 0}
        >
          Submit
        </button>
      </form>
    );
  }

  if (step.type === "object") {
    return objectInput;
  }

  const htmlType =
    step.type === "email"
      ? "email"
      : step.type === "phone"
        ? "tel"
        : step.type === "url"
          ? "url"
          : step.type === "number"
            ? "number"
            : "text";

  if (step.type === "textarea") {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(textValue, textValue);
        }}
      >
        <textarea
          className="min-h-24 rounded-xl border border-slate-300 px-3 py-2"
          value={textValue}
          placeholder={step.placeholder ?? "Type your answer"}
          onChange={(event) => setTextValue(event.target.value)}
          disabled={interactiveDisabled}
        />
        <button className="btn-primary" type="submit" disabled={interactiveDisabled}>
          Submit
        </button>
      </form>
    );
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const normalized = step.type === "number" ? Number(textValue) : textValue;
        void submit(normalized, textValue);
      }}
    >
      <input
        className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2"
        type={htmlType}
        value={textValue}
        placeholder={step.placeholder ?? "Type your answer"}
        onChange={(event) => setTextValue(event.target.value)}
        disabled={interactiveDisabled}
      />
      <button className="btn-primary" type="submit" disabled={interactiveDisabled}>
        Send
      </button>
    </form>
  );
};
