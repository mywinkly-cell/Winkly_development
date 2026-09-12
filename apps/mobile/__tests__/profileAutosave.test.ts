import AsyncStorage from "@react-native-async-storage/async-storage";
import { AutosaveEngine } from "@/lib/profile/autosaveEngine";

describe("AutosaveEngine", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("debounces rapid edits into a single save call with the latest value", async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const engine = new AutosaveEngine<{ name: string }>({
      initialValues: { name: "" },
      onSave,
      debounceMs: 1000,
    });

    engine.update({ name: "A" });
    await jest.advanceTimersByTimeAsync(400);
    engine.update({ name: "Al" });
    await jest.advanceTimersByTimeAsync(400);
    engine.update({ name: "Ali" });
    await jest.advanceTimersByTimeAsync(400);
    engine.update({ name: "Alice" });

    // Still inside the debounce window from the very first edit -> no save yet.
    expect(onSave).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1000);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ name: "Alice" }, { name: "Alice" });

    engine.dispose();
  });

  it("never saves fields that didn't change", async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const engine = new AutosaveEngine<{ name: string; city: string }>({
      initialValues: { name: "Alex", city: "Munich" },
      onSave,
      debounceMs: 500,
    });

    engine.update({ name: "Alexa", city: "Munich" });
    await jest.advanceTimersByTimeAsync(500);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ name: "Alexa" }, { name: "Alexa", city: "Munich" });

    engine.dispose();
  });

  it("keeps the pending draft and retries after a failed save, never losing input", async () => {
    const onSave = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const draftKey = "test:profile-autosave-draft";
    await AsyncStorage.removeItem(draftKey);

    const engine = new AutosaveEngine<{ bio: string }>({
      initialValues: { bio: "" },
      onSave,
      debounceMs: 500,
      retryDelaysMs: [2000],
      draftStorageKey: draftKey,
    });

    engine.update({ bio: "Hello there" });
    await jest.advanceTimersByTimeAsync(500);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(engine.getStatus()).toBe("error");
    expect(engine.hasPendingChanges()).toBe(true);

    // The unsent change survives the failure — a killed app could reload it.
    const draftDuringFailure = await AsyncStorage.getItem(draftKey);
    expect(JSON.parse(draftDuringFailure ?? "{}")).toEqual({ bio: "Hello there" });

    await jest.advanceTimersByTimeAsync(2000);

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(engine.getStatus()).toBe("saved");
    expect(engine.hasPendingChanges()).toBe(false);
    expect(await AsyncStorage.getItem(draftKey)).toBeNull();

    engine.dispose();
  });

  it("hydrates a diff persisted before a restart and retries it", async () => {
    const draftKey = "test:profile-autosave-hydrate";
    await AsyncStorage.setItem(draftKey, JSON.stringify({ occupation: "Engineer" }));

    const onSave = jest.fn().mockResolvedValue(undefined);
    const engine = new AutosaveEngine<{ occupation: string }>({
      initialValues: { occupation: "" },
      onSave,
      draftStorageKey: draftKey,
    });

    await engine.hydrate();
    await jest.advanceTimersByTimeAsync(0);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ occupation: "Engineer" }, { occupation: "" });
    expect(engine.hasPendingChanges()).toBe(false);

    engine.dispose();
  });
});
