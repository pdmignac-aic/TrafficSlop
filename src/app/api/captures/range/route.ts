import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json({ error: "from and to (ISO) required" }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: rows, error } = await supabase
      .from("captures")
      .select("id, camera_id, label, captured_at, storage_path")
      .eq("user_id", user.id)
      .gte("captured_at", from)
      .lte("captured_at", to)
      .order("captured_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (rows ?? []).map((r) => ({
      id: r.id,
      camera_id: r.camera_id,
      label: r.label,
      captured_at: new Date(r.captured_at).getTime(),
      public_url: supabase.storage.from("captures").getPublicUrl(r.storage_path).data.publicUrl,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
