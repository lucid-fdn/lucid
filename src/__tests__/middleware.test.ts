import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/middleware-edge", () => ({
  getAuthToken: vi.fn(() => null),
  redirectToLogin: vi.fn((req: NextRequest) => {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return Response.redirect(url);
  }),
  redirectToDashboard: vi.fn((req: NextRequest) => {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return Response.redirect(url);
  }),
}));

vi.mock("@/lib/maintenance-mode", () => ({
  isMaintenanceModeEnabled: vi.fn(() => false),
  isValidBypassToken: vi.fn(() => false),
  isPathAccessible: vi.fn(() => false),
}));

import { middleware } from "../middleware";

describe("middleware canonical host handling", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://www.lucid.foundation";
    delete process.env.APP_URL;
  });

  it("redirects Railway UI login requests to the canonical Privy-allowed host", () => {
    const req = new NextRequest(
      "https://lucid-production-e9b8.up.railway.app/login?next=%2Fe2e-workspace%2Fmission-control%2Fdoctor",
    );

    const response = middleware(req);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://www.lucid.foundation/login?next=%2Fe2e-workspace%2Fmission-control%2Fdoctor",
    );
  });

  it("does not redirect Railway health checks", () => {
    const req = new NextRequest("https://lucid-production-e9b8.up.railway.app/ready");

    const response = middleware(req);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("falls back to the Lucid canonical host if Railway env still points at Railway", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://lucid-production-e9b8.up.railway.app";
    const req = new NextRequest("https://internal.proxy/login", {
      headers: { host: "lucid-production-e9b8.up.railway.app" },
    });

    const response = middleware(req);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://www.lucid.foundation/login");
  });
});
