import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      camera_id?: string;
      label?: string;
      commute_id?: string | null;
    };
    const cameraId = body.camera_id;
    const label = body.label?.trim() || "Traffic camera";

    if (!cameraId || !/^[0-9a-f-]{36}$/i.test(cameraId)) {
      return NextResponse.json({ error: "valid camera_id required" }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const imageRes = await fetch(`https://webcams.nyctmc.org/api/cameras/${cameraId}/image`, {
      cache: "no-store",
      headers: { Accept: "image/*" },
    });
    if (!imageRes.ok) {
      return NextResponse.json({ error: "camera image unavailable" }, { status: 502 });
    }

    const now = Date.now();
    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const blob = await imageRes.blob();
    const storagePath = `${user.id}/${crypto.randomUUID()}.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from("captures")
      .upload(storagePath, blob, { contentType, upsert: false });
    if (uploadErr) {
      console.error("[capture-from-camera upload]", uploadErr);
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    const { data, error: insertErr } = await supabase
      .from("captures")
      .insert({
        user_id: user.id,
        commute_id: body.commute_id || null,
        camera_id: cameraId,
        label,
        storage_path: storagePath,
        captured_at: new Date(now).toISOString(),
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[capture-from-camera insert]", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    const pub = supabase.storage.from("captures").getPublicUrl(storagePath);
    return NextResponse.json({
      id: data.id,
      camera_id: cameraId,
      label,
      captured_at: now,
      public_url: pub.data.publicUrl,
    });
  } catch (err) {
    console.error("[capture-from-camera]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
