/** Runtime settings from environment (no secrets in repo). */
export const config = {
  port: Number(process.env.PORT ?? "3000"),
  host: process.env.HOST ?? "0.0.0.0",
} as const;
