import { normalizeMessageRow } from "@/lib/chats/normalizeMessage";

describe("normalizeMessageRow", () => {
  it("fills defaults for sparse realtime payloads", () => {
    const msg = normalizeMessageRow({
      id: 42,
      conversation_id: "c1",
      sender_id: "u1",
      created_at: "2026-06-01T12:00:00Z",
    });
    expect(msg).toMatchObject({
      id: "42",
      conversation_id: "c1",
      sender_id: "u1",
      content: "",
      message_type: "text",
      attachments: [],
      delete_type: "none",
      status: "sent",
    });
  });

  it("preserves delete_type and attachment arrays", () => {
    const msg = normalizeMessageRow({
      id: "m1",
      conversation_id: "c1",
      sender_id: "u1",
      content: "hi",
      message_type: "image",
      attachments: [{ url: "https://example.com/a.jpg", type: "image" }],
      delete_type: "for_everyone",
      created_at: "2026-06-01T12:00:00Z",
    });
    expect(msg.message_type).toBe("image");
    expect(msg.delete_type).toBe("for_everyone");
    expect(msg.attachments).toHaveLength(1);
  });
});
