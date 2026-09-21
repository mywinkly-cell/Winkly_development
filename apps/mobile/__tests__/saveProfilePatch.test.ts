import { saveProfilePatch } from "@/lib/profile/saveProfilePatch";
import type { ProfilePatch } from "@/lib/profile/profileAutosave";

type Call = { table: string; op: string; payload?: any; opts?: any; filters: [string, unknown][] };

const mockCalls: Call[] = [];
const mockState: {
  session: { user: { id: string } } | null;
  existingMeta: Record<string, unknown> | null;
  updatedRows: unknown[];
  failOn: string | null; // "table.op"
} = { session: { user: { id: "u1" } }, existingMeta: null, updatedRows: [{ id: "u1" }], failOn: null };

function mockChain(table: string, op: string, payload?: any, opts?: any) {
  const call: Call = { table, op, payload, opts, filters: [] };
  mockCalls.push(call);
  const failing = mockState.failOn === `${table}.${op}`;
  const result = () => {
    if (failing) return { data: null, error: { message: "boom" } };
    if (op === "read") return { data: mockState.existingMeta ? { meta: mockState.existingMeta } : null, error: null };
    if (table === "user_profiles" && op === "update") return { data: mockState.updatedRows, error: null };
    return { data: null, error: null };
  };
  const chain: any = {
    eq: (col: string, val: unknown) => {
      call.filters.push([col, val]);
      return chain;
    },
    select: () => chain,
    maybeSingle: () => Promise.resolve(result()),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
  };
  return chain;
}

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: mockState.session } }) },
    from: (table: string) => ({
      upsert: (payload: unknown, opts: unknown) => mockChain(table, "upsert", payload, opts),
      update: (payload: unknown) => mockChain(table, "update", payload),
      select: () => mockChain(table, "read"),
    }),
  },
}));

const patch = (p: Partial<ProfilePatch>): ProfilePatch => ({ profile: {}, modes: {}, ...p });
const ops = () => mockCalls.map((c) => `${c.table}.${c.op}`);

beforeEach(() => {
  mockCalls.length = 0;
  mockState.session = { user: { id: "u1" } };
  mockState.existingMeta = null;
  mockState.updatedRows = [{ id: "u1" }];
  mockState.failOn = null;
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("saveProfilePatch", () => {
  it("updates an existing profile row with ONLY the changed columns (a partial upsert would trip NOT NULL names)", async () => {
    const res = await saveProfilePatch(patch({ profile: { occupation: "Nurse" } }));
    expect(res).toEqual({ persisted: { profile: { occupation: "Nurse" }, modes: {} }, failed: false });
    expect(ops()).toEqual(["user_profiles.update"]);
    expect(mockCalls[0].payload).toEqual({ occupation: "Nurse" });
    expect(mockCalls[0].filters).toEqual([["id", "u1"]]);
  });

  it("upserts when both names are in the patch (new row), and mirrors the core columns to profiles_core", async () => {
    await saveProfilePatch(patch({ profile: { first_name: "Anna", last_name: "K", occupation: "Nurse", city: "Berlin" } }));
    expect(ops()).toEqual(["user_profiles.upsert", "profiles_core.upsert"]);
    expect(mockCalls[0].payload).toEqual({ id: "u1", first_name: "Anna", last_name: "K", occupation: "Nurse", city: "Berlin" });
    expect(mockCalls[0].opts).toEqual({ onConflict: "id" });
    // only the mirrored subset, not occupation
    expect(mockCalls[1].payload).toMatchObject({ id: "u1", first_name: "Anna", last_name: "K", city: "Berlin" });
    expect(mockCalls[1].payload).not.toHaveProperty("occupation");
  });

  it("does not touch profiles_core when no mirrored column changed", async () => {
    await saveProfilePatch(patch({ profile: { gender: "Female", birthday: "1990-05-15" } }));
    expect(ops()).toEqual(["user_profiles.update"]);
  });

  it("fails (and keeps the columns dirty) when the update matched no row", async () => {
    mockState.updatedRows = [];
    const res = await saveProfilePatch(patch({ profile: { occupation: "Nurse" } }));
    expect(res.failed).toBe(true);
    expect(res.persisted.profile).toEqual({});
  });

  it("keeps mirrored columns dirty if only the profiles_core write fails", async () => {
    mockState.failOn = "profiles_core.upsert";
    const res = await saveProfilePatch(patch({ profile: { first_name: "Anna", last_name: "K", occupation: "Nurse" } }));
    expect(res.failed).toBe(true);
    expect(res.persisted.profile).toEqual({ occupation: "Nurse" });
  });

  it("merges a meta change onto the server meta so uploaded videos survive", async () => {
    mockState.existingMeta = { videos: ["https://cdn/v.mp4"], food: "Vegan" };
    const res = await saveProfilePatch(patch({ modes: { romance: { meta: { food: "Vegetarian", height: "170" } } } }));
    expect(res.failed).toBe(false);
    const subWrite = mockCalls.find((c) => c.table === "sub_profiles" && c.op === "upsert")!;
    expect(subWrite.payload).toEqual({
      user_id: "u1",
      mode: "romance",
      meta: { videos: ["https://cdn/v.mp4"], food: "Vegetarian", height: "170" },
    });
    expect(subWrite.opts).toEqual({ onConflict: "user_id,mode" });
  });

  it("sends no meta (and skips the read) when only the bio changed", async () => {
    await saveProfilePatch(patch({ modes: { friends: { bio: "Yo" } } }));
    expect(ops()).toEqual(["sub_profiles.upsert", "profiles_mode.update"]);
    expect(mockCalls[0].payload).toEqual({ user_id: "u1", mode: "friends", bio: "Yo" });
  });

  it("only UPDATES profiles_mode (never creates the discover-facing row)", async () => {
    await saveProfilePatch(patch({ modes: { romance: { bio: "Hi" } } }));
    const modeCall = mockCalls.find((c) => c.table === "profiles_mode")!;
    expect(modeCall.op).toBe("update");
    expect(modeCall.filters).toEqual([["user_id", "u1"], ["mode", "romance"]]);
    expect(modeCall.payload).toMatchObject({ bio: "Hi" });
  });

  it("never writes photo/video columns", async () => {
    await saveProfilePatch(
      patch({ profile: { occupation: "N" }, modes: { romance: { bio: "x", meta: { food: "y" } } } })
    );
    const written = JSON.stringify(mockCalls.map((c) => c.payload));
    expect(written).not.toMatch(/photo|video/i);
  });

  it("a failing mode does not block the others, and only the ok parts are reported persisted", async () => {
    mockState.failOn = "sub_profiles.upsert";
    const res = await saveProfilePatch(patch({ profile: { occupation: "N" }, modes: { romance: { bio: "x" } } }));
    expect(res.failed).toBe(true);
    expect(res.persisted).toEqual({ profile: { occupation: "N" }, modes: {} });
  });

  it("fails cleanly with no session", async () => {
    mockState.session = null;
    const res = await saveProfilePatch(patch({ profile: { occupation: "N" } }));
    expect(res.failed).toBe(true);
    expect(mockCalls).toHaveLength(0);
  });
});
