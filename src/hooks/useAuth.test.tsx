import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthProviders from "@/providers/AuthProviders";
import { useAuth } from "./useAuth";

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("@/lib/logger/Logger", () => ({
  default: { error: mocks.loggerError },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProviders initialUser={null}>{children}</AuthProviders>;
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.loggerError.mockClear();
    mocks.routerPush.mockClear();
  });

  it("keeps an anonymous 200 response signed out without logging an error", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: false, message: "", data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
