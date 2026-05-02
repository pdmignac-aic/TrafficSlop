import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      storage_path: string;
      camera_id: string;
      label: string;
      captured_at: string;
      commute_id?: string | null;
    };

    if (!body?.storage_path || !body?.camera_id || !body?.label || !body?.captured_at) {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const prefix = `${user.id}/`;
    if (!body.storage_path.startsWith(prefix)) {
      return NextResponse.json({ error: "invalid storage path" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("captures")
      .insert({
        user_id: user.id,
        commute_id: body.commute_id || null,
        camera_id: body.camera_id,
        label: body.label,
        storage_path: body.storage_path,
        captured_at: new Date(Number(body.captured_at)).toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const pub = supabase.storage.from("captures").getPublicUrl(body.storage_path);

    return NextResponse.json({ id: data.id, public_url: pub.data.publicUrl });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
