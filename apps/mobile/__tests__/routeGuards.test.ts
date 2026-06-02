import {
  isAuthRoute,
  isModeRoute,
  resolveRouteAction,
  type RouteGuardInput,
} from "@/lib/routing/guards";

const base: RouteGuardInput = {
  loading: false,
  modeLoading: false,
  hasSession: false,
  path: "",
  activeMode: null,
  permissions: ["events"],
};

describe("isAuthRoute / isModeRoute", () => {
  it("recognizes auth routes", () => {
    expect(isAuthRoute("(auth)/signin")).toBe(true);
    expect(isAuthRoute("(auth)/splash")).toBe(true);
    expect(isAuthRoute("(modes)/romance")).toBe(false);
  });

  it("recognizes mode routes", () => {
    expect(isModeRoute("(modes)/romance/discover")).toBe(true);
    expect(isModeRoute("account/privacy-safety")).toBe(false);
    expect(isModeRoute("(onboarding-personal)/mode-selection")).toBe(false);
  });
});

describe("resolveRouteAction", () => {
  it("does nothing while loading", () => {
    expect(resolveRouteAction({ ...base, loading: true, path: "settings" })).toEqual({ type: "none" });
    expect(resolveRouteAction({ ...base, modeLoading: true, path: "settings" })).toEqual({ type: "none" });
  });

  it("redirects unauthenticated users away from protected routes", () => {
    expect(resolveRouteAction({ ...base, hasSession: false, path: "(modes)/romance" })).toEqual({
      type: "redirect",
      to: "/(auth)/splash",
    });
  });

  it("allows unauthenticated users on auth routes", () => {
    expect(resolveRouteAction({ ...base, hasSession: false, path: "(auth)/signin" })).toEqual({
      type: "none",
    });
  });

  it("redirects to mode-selection when active mode is not permitted", () => {
    expect(
      resolveRouteAction({
        ...base,
        hasSession: true,
        path: "(modes)/romance/discover",
        activeMode: "romance",
        permissions: ["events"],
      })
    ).toEqual({ type: "redirect", to: "/(onboarding-personal)/mode-selection" });
  });

  it("allows a permitted active mode", () => {
    expect(
      resolveRouteAction({
        ...base,
        hasSession: true,
        path: "(modes)/romance/discover",
        activeMode: "romance",
        permissions: ["events", "romance"],
      })
    ).toEqual({ type: "none" });
  });

  it("does nothing for an authenticated user with no active mode", () => {
    expect(
      resolveRouteAction({ ...base, hasSession: true, path: "(modes)/events", activeMode: null })
    ).toEqual({ type: "none" });
  });
});
