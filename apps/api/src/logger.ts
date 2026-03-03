import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const loggerOptions: Parameters<typeof pino>[0] = {
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
};

if (!isProduction) {
  loggerOptions.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard"
    }
  };
}

if (isProduction) {
  loggerOptions.redact = {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "req.body",
      "req.query.token",
      "req.params.token"
    ],
    censor: "[Redacted]"
  };
}

export const logger = pino(loggerOptions);
