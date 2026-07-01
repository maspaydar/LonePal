import rateLimit from "express-rate-limit";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Strict limiter for authentication endpoints (login / 2FA / emergency reset).
 * Slows credential-stuffing and brute-force attempts. Limits are looser in
 * development so local testing is not throttled.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isProduction ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

/**
 * Looser limiter for public registration + email-verification endpoints, to
 * curb automated signup abuse without blocking legitimate onboarding.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: isProduction ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
