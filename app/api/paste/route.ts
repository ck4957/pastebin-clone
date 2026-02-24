import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { savePaste, getPaste } from "@/lib/storage";

const EXPIRY_OPTIONS: Record<string, number | null> = {
  never: null,
  "10m": 10 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, content, language, expiry } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    if (content.length > 500_000) {
      return NextResponse.json({ error: "Content too large (max 500KB)" }, { status: 400 });
    }

    const ttlMs = EXPIRY_OPTIONS[expiry as string] ?? null;
    const id = nanoid(10);

    const paste = {
      id,
      title: (typeof title === "string" ? title.slice(0, 200) : "") || "Untitled",
      content: content.trim(),
      language: typeof language === "string" ? language : "plaintext",
      createdAt: Date.now(),
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    };

    await savePaste(paste);

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/paste error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const paste = await getPaste(id);
    if (!paste) {
      return NextResponse.json({ error: "Paste not found or expired" }, { status: 404 });
    }
    return NextResponse.json(paste);
  } catch (err) {
    console.error("GET /api/paste error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
