import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1] === "image/jpg" ? "image/jpeg" : match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      data_url?: string;
      camera_id?: string;
      label?: string;
      captured_at?: number;
    };

    const parsed = body.data_url ? parseDataUrl(body.data_url) : null;
    if (!parsed) {
      return NextResponse.json({ error: "valid image data_url required" }, { status: 400 });
    }

    const cameraId = body.camera_id || "local";
    const label = body.label?.trim() || "Traffic camera";
    const capturedAt = Number.isFinite(body.captured_at) ? Number(body.captured_at) : Date.now();

    const supabase = await createServerSupabase();
    const writeClient = createAdminSupabase() ?? supabase;
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const ext = parsed.contentType === "image/png" ? "png" : parsed.contentType === "image/webp" ? "webp" : "jpg";
    const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await writeClient.storage
      .from("captures")
      .upload(storagePath, parsed.buffer, { contentType: parsed.contentType, upsert: false });
    if (uploadErr) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 });
    }

    const captureId = crypto.randomUUID();
    const { error: insertErr } = await writeClient
      .from("captures")
      .insert({
        id: captureId,
        user_id: user.id,
        camera_id: cameraId,
        label,
        storage_path: storagePath,
        captured_at: new Date(capturedAt).toISOString(),
      });
    if (insertErr) {
      return NextResponse.json({ error: `Capture row insert failed: ${insertErr.message}` }, { status: 500 });
    }

    const pub = writeClient.storage.from("captures").getPublicUrl(storagePath);
    return NextResponse.json({
      id: captureId,
      camera_id: cameraId,
      label,
      captured_at: capturedAt,
      public_url: pub.data.publicUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "server error" },
      { status: 500 },
    );
  }
}
