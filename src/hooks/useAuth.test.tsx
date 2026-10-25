import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthProviders from "@/providers/AuthProviders";
import { useAuth } from "./useAuth";

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  pathname: "/",
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
  usePathname: () => mocks.pathname,
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
    mocks.pathname = "/";
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

  it("covers: Album AC-1, does not request authentication on the public showcase", async () => {
    mocks.pathname = "/album";
    const fetchSpy = vi.spyOn(window, "fetch");

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });

  it("covers: Album AC-1, resumes authentication checks after leaving the showcase", async () => {
    mocks.pathname = "/album";
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: false, message: "", data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const { rerender, result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(fetchSpy).not.toHaveBeenCalled();

    mocks.pathname = "/todo";
    rerender();

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/auth/me"));
    await waitFor(() => expect(result.current.authLoading).toBe(false));
  });

  it("0003 AC-15 shows a temporary auth outage without claiming an anonymous success", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(Response.json({ message: "retry" }, { status: 503 }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.authUnavailable).toBe(true); expect(result.current.isAuthenticated).toBe(false);
  });

  it.each([
    { status: 401, unavailable: false },
    { status: 503, unavailable: true },
    { status: 500, unavailable: false },
  ])("consumes the $status session response without changing its signed-out state", async ({ status, unavailable }) => {
    const response = new Response("private response text must not be logged", { status });
    vi.spyOn(window, "fetch").mockResolvedValue(response);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(response.bodyUsed).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.authUnavailable).toBe(unavailable);
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("waits for the unauthorized response stream to finish before ending the session check", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(stream) {
        controller = stream;
        stream.enqueue(new TextEncoder().encode("private response text"));
      },
    }), { status: 401 });
    vi.spyOn(window, "fetch").mockResolvedValue(response);
    const { result } = renderHook(() => useAuth(), { wrapper });
    let closed = false;

    try {
      await waitFor(() => expect(response.bodyUsed).toBe(true));
      expect(result.current.authLoading).toBe(true);
      await act(async () => {
        controller.close();
        closed = true;
      });
      await waitFor(() => expect(result.current.authLoading).toBe(false));
      expect(result.current.authUnavailable).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
      expect(mocks.loggerError).not.toHaveBeenCalled();
    } finally {
      if (!closed) controller.close();
    }
  });

  it("treats an unreadable unauthorized response body as unavailable without logging its contents", async () => {
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.error(new Error("private response failure must not be logged"));
      },
    }), { status: 401 });
    vi.spyOn(window, "fetch").mockResolvedValue(response);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.authUnavailable).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(mocks.loggerError).toHaveBeenCalledExactlyOnceWith({ operation: "authSessionRead", code: "AUTH_UNAVAILABLE" });
  });

  it("0003 AC-14 keeps the current identity and page when local logout fails", async () => {
    const user = { id: "test", username: "Original", email: "local@unit.test", role: "USER" };
    vi.spyOn(window, "fetch").mockImplementation(async input => {
      if (input === "/api/auth/me") return Response.json({ data: { user } });
      if (input === "/api/auth/csrf") return Response.json({ data: { csrfToken: "test-csrf" } });
      return Response.json({ message: "退出未完成" }, { status: 503 });
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));
    await act(async () => { await expect(result.current.logout()).rejects.toThrow("退出未完成"); });
    expect(result.current.user?.id).toBe("test"); expect(result.current.authUnavailable).toBe(true);
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });
});
