import { AutosaveController, type AutosaveStatus, type SaveResult } from "@/lib/profile/autosaveController";
import { emptyDraft, type ProfileDraft, type ProfilePatch } from "@/lib/profile/profileAutosave";

const draft = (profile: ProfileDraft["profile"] = {}, modes: ProfileDraft["modes"] = {}): ProfileDraft => ({
  profile: { first_name: "Anna", last_name: "K", ...profile },
  modes,
});
const saved = draft();

function setup(save: (patch: ProfilePatch) => Promise<SaveResult>) {
  const statuses: AutosaveStatus[] = [];
  const controller = new AutosaveController(save, (s) => statuses.push(s), 1500);
  controller.setBaseline(saved);
  controller.setReady(true);
  return { controller, statuses };
}

const ok = (patch: ProfilePatch): Promise<SaveResult> => Promise.resolve({ persisted: patch, failed: false });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("AutosaveController", () => {
  it("debounces: a burst of edits becomes one save of only the changed columns", async () => {
    const save = jest.fn(ok);
    const { controller, statuses } = setup(save);

    controller.update(draft({ occupation: "N" }));
    await jest.advanceTimersByTimeAsync(1000);
    controller.update(draft({ occupation: "Nu" }));
    await jest.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled(); // debounce restarted by the second edit

    await jest.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ profile: { occupation: "Nu" }, modes: {} });
    expect(statuses).toEqual(["saving", "saved"]);
  });

  it("does nothing before ready (hydration) and nothing when the draft equals what is saved", async () => {
    const save = jest.fn(ok);
    const controller = new AutosaveController(save, () => {}, 1500);
    controller.setBaseline(saved);
    controller.update(draft({ occupation: "N" })); // not ready yet
    await jest.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();

    controller.setReady(true);
    controller.update(saved);
    await jest.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it("an edit reverted before the debounce fires cancels the save", async () => {
    const save = jest.fn(ok);
    const { controller, statuses } = setup(save);
    controller.update(draft({ occupation: "N" }));
    controller.update(saved);
    await jest.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
    expect(statuses).toEqual(["saving", "saved"]);
  });

  it("flush saves immediately, awaits the write and resolves true", async () => {
    const save = jest.fn(ok);
    const { controller } = setup(save);
    controller.update(draft({ occupation: "N" }));
    await expect(controller.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1); // the pending debounce was cancelled
  });

  it("flush with nothing pending is a cheap no-op", async () => {
    const save = jest.fn(ok);
    const { controller, statuses } = setup(save);
    await expect(controller.flush()).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);
  });

  it("is single-flight: an edit made during a write is saved afterwards, never concurrently", async () => {
    let resolveFirst!: (r: SaveResult) => void;
    let inFlight = 0;
    let maxInFlight = 0;
    const save = jest.fn((patch: ProfilePatch) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const done = <T>(v: T) => {
        inFlight -= 1;
        return v;
      };
      if (save.mock.calls.length === 1) {
        return new Promise<SaveResult>((res) => {
          resolveFirst = (r) => res(done(r));
        });
      }
      return Promise.resolve(done({ persisted: patch, failed: false }));
    });
    const { controller } = setup(save);

    controller.update(draft({ occupation: "N" }));
    const flushing = controller.flush();
    controller.update(draft({ occupation: "N", education: "PhD" })); // typed while the first write is in flight
    resolveFirst({ persisted: { profile: { occupation: "N" }, modes: {} }, failed: false });

    await expect(flushing).resolves.toBe(true); // flush waited for the follow-up write too
    expect(maxInFlight).toBe(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ profile: { education: "PhD" }, modes: {} });
  });

  it("shows an error, retries with exponential backoff, then recovers", async () => {
    const save = jest
      .fn<Promise<SaveResult>, [ProfilePatch]>()
      .mockResolvedValueOnce({ persisted: emptyDraft(), failed: true })
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementation(ok);
    const { controller, statuses } = setup(save);

    controller.update(draft({ occupation: "N" }));
    await jest.advanceTimersByTimeAsync(1500); // first attempt fails
    expect(controller.getStatus()).toBe("error");
    expect(save).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1999);
    expect(save).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1); // +2s → second attempt (throws)
    expect(save).toHaveBeenCalledTimes(2);
    expect(controller.getStatus()).toBe("error");

    await jest.advanceTimersByTimeAsync(3999);
    expect(save).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1); // +4s → third attempt succeeds
    expect(save).toHaveBeenCalledTimes(3);
    expect(controller.getStatus()).toBe("saved");
    expect(statuses).toEqual(["saving", "error", "saved"]);
  });

  it("keeps typing unblocked: edits during an error window are picked up by the next attempt", async () => {
    const save = jest
      .fn<Promise<SaveResult>, [ProfilePatch]>()
      .mockResolvedValueOnce({ persisted: emptyDraft(), failed: true })
      .mockImplementation(ok);
    const { controller } = setup(save);

    controller.update(draft({ occupation: "N" }));
    await jest.advanceTimersByTimeAsync(1500);
    expect(controller.getStatus()).toBe("error");

    controller.update(draft({ occupation: "Nurse" })); // status stays "error" until it actually saves
    expect(controller.getStatus()).toBe("error");
    await jest.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenLastCalledWith({ profile: { occupation: "Nurse" }, modes: {} });
    expect(controller.getStatus()).toBe("saved");
  });

  it("after a partial failure only the unsaved remainder is retried", async () => {
    const both = draft({ occupation: "N" }, { romance: { bio: "Hi" } });
    const save = jest
      .fn<Promise<SaveResult>, [ProfilePatch]>()
      .mockImplementationOnce((patch) => Promise.resolve({ persisted: { profile: patch.profile, modes: {} }, failed: true }))
      .mockImplementation(ok);
    const { controller } = setup(save);

    controller.update(both);
    await jest.advanceTimersByTimeAsync(1500);
    await jest.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ profile: {}, modes: { romance: { bio: "Hi" } } });
  });

  it("flush during the backoff window retries immediately", async () => {
    const save = jest
      .fn<Promise<SaveResult>, [ProfilePatch]>()
      .mockResolvedValueOnce({ persisted: emptyDraft(), failed: true })
      .mockImplementation(ok);
    const { controller } = setup(save);
    controller.update(draft({ occupation: "N" }));
    await jest.advanceTimersByTimeAsync(1500);
    await expect(controller.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("resolves false (and keeps retrying) when a flush fails", async () => {
    const save = jest.fn(async (): Promise<SaveResult> => ({ persisted: emptyDraft(), failed: true }));
    const { controller } = setup(save);
    controller.update(draft({ occupation: "N" }));
    await expect(controller.flush()).resolves.toBe(false);
    expect(controller.getStatus()).toBe("error");
    await jest.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("dispose stops retries and further status updates", async () => {
    const save = jest.fn(async (): Promise<SaveResult> => ({ persisted: emptyDraft(), failed: true }));
    const { controller, statuses } = setup(save);
    controller.update(draft({ occupation: "N" }));
    await jest.advanceTimersByTimeAsync(1500);
    const seen = statuses.length;
    controller.dispose();
    await jest.advanceTimersByTimeAsync(60000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses.length).toBe(seen);
  });

  it("a flush started right before dispose (unmount) still completes its write", async () => {
    const save = jest.fn(ok);
    const { controller } = setup(save);
    controller.update(draft({ occupation: "N" }));
    const flushing = controller.flush();
    controller.dispose();
    await expect(flushing).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("stays inert while not ready, even for flush", async () => {
    const save = jest.fn(ok);
    const controller = new AutosaveController(save, () => {}, 1500);
    controller.update(draft({ occupation: "N" }));
    await expect(controller.flush()).resolves.toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
