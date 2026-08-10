import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../useAuth";
import { api } from "../../api/client";
import { clearUserToken, getUserToken } from "../../api/userToken";

vi.mock("../../api/client", () => ({
  api: {
    login: vi.fn(),
    verify2fa: vi.fn(),
    register: vi.fn(),
    me: vi.fn(),
  },
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

const mockedApi = vi.mocked(api, true);

describe("useAuth", () => {
  beforeEach(() => {
    clearUserToken();
    vi.clearAllMocks();
  });

  it("logs in directly when the account has no 2FA enabled", async () => {
    mockedApi.login.mockResolvedValue({
      access_token: "session-token",
      user: { id: "u1", email: "a@b.com", display_name: "", role: "user", is_active: true, email_verified: true, totp_enabled: false, plan: "decouverte", created_at: "" },
      requires_2fa: false,
      pending_token: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let loginResult;
    await act(async () => {
      loginResult = await result.current.login("a@b.com", "password123");
    });

    expect(loginResult).toEqual({ requires2fa: false });
    expect(result.current.user?.email).toBe("a@b.com");
    expect(getUserToken()).toBe("session-token");
  });

  it("does not set a session token and reports requires2fa when 2FA is enabled", async () => {
    mockedApi.login.mockResolvedValue({
      access_token: null,
      user: null,
      requires_2fa: true,
      pending_token: "pending-abc",
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let loginResult;
    await act(async () => {
      loginResult = await result.current.login("a@b.com", "password123");
    });

    expect(loginResult).toEqual({ requires2fa: true, pendingToken: "pending-abc" });
    expect(result.current.user).toBeNull();
    expect(getUserToken()).toBeNull();
  });

  it("completes login after a successful 2FA code verification", async () => {
    mockedApi.verify2fa.mockResolvedValue({
      access_token: "session-token-after-2fa",
      user: { id: "u1", email: "a@b.com", display_name: "", role: "user", is_active: true, email_verified: true, totp_enabled: true, plan: "decouverte", created_at: "" },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.verify2fa("pending-abc", "123456");
    });

    expect(mockedApi.verify2fa).toHaveBeenCalledWith("pending-abc", "123456");
    expect(result.current.user?.email).toBe("a@b.com");
    expect(getUserToken()).toBe("session-token-after-2fa");
  });

  it("clears the session on logout", async () => {
    mockedApi.login.mockResolvedValue({
      access_token: "session-token",
      user: { id: "u1", email: "a@b.com", display_name: "", role: "user", is_active: true, email_verified: true, totp_enabled: false, plan: "decouverte", created_at: "" },
      requires_2fa: false,
      pending_token: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login("a@b.com", "password123");
    });
    expect(getUserToken()).toBe("session-token");

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(getUserToken()).toBeNull();
  });
});
