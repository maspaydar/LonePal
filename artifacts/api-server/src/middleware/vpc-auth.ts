import type { Request, Response, NextFunction } from "express";

const ALLOWED_VPC_RANGES = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "127.0.0.1/32",
  "::1/128",
];

const INTERNAL_VPC_HEADER = "x-vpc-source";
const EXPECTED_VPC_TOKEN = process.env.VPC_AUTH_TOKEN;

function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isInCIDR(ip: string, cidr: string): boolean {
  if (cidr.includes("::")) {
    return ip === "::1" || ip === "::ffff:127.0.0.1";
  }
  const [range, bits] = cidr.split("/");
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ip = (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",")[0].trim();
    return ip;
  }
  const realIp = req.headers["x-real-ip"];
  if (realIp) return typeof realIp === "string" ? realIp : realIp[0];
  return req.socket.remoteAddress || "unknown";
}

export function vpcMaintenanceAuth(req: Request, res: Response, next: NextFunction) {
  const clientIp = extractClientIp(req);
  const normalizedIp = clientIp.replace("::ffff:", "");

  const vpcHeader = req.headers[INTERNAL_VPC_HEADER] as string | undefined;
  if (EXPECTED_VPC_TOKEN && vpcHeader === EXPECTED_VPC_TOKEN) {
    return next();
  }

  const isInternalIp = ALLOWED_VPC_RANGES.some((cidr) => {
    try {
      return isInCIDR(normalizedIp, cidr);
    } catch {
      return false;
    }
  });

  if (isInternalIp) {
    return next();
  }

  return res.status(403).json({
    error: "Access denied: maintenance endpoints restricted to internal VPC network",
    clientIp: normalizedIp,
  });
}
