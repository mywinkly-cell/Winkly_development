import * as FileSystem from "expo-file-system/legacy";
import {
  MAX_UPLOAD_BYTES,
  validateMediaForUpload,
  validatePickerAsset,
} from "@/lib/mediaValidation";

jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: jest.fn(),
}));

describe("validateMediaForUpload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects unsupported image MIME types", async () => {
    const result = await validateMediaForUpload({
      uri: "file:///photo.gif",
      kind: "image",
      mimeType: "image/gif",
      size: 1024,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Unsupported file type/);
  });

  it("rejects files larger than the upload ceiling", async () => {
    const result = await validateMediaForUpload({
      uri: "file:///big.jpg",
      kind: "image",
      mimeType: "image/jpeg",
      size: MAX_UPLOAD_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too large/i);
    expect(result.bytes).toBe(MAX_UPLOAD_BYTES + 1);
  });

  it("accepts a valid image with known size", async () => {
    const result = await validateMediaForUpload({
      uri: "file:///ok.jpg",
      kind: "image",
      mimeType: "image/jpeg",
      size: 2048,
    });
    expect(result).toEqual({ ok: true, bytes: 2048 });
  });

  it("resolves size from the filesystem when picker omits fileSize", async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, size: 4096 });
    const result = await validatePickerAsset({ uri: "file:///picked.jpg", mimeType: "image/png" }, "image");
    expect(result).toEqual({ ok: true, bytes: 4096 });
    expect(FileSystem.getInfoAsync).toHaveBeenCalledWith("file:///picked.jpg");
  });
});
