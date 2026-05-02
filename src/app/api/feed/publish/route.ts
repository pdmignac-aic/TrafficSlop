import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      capture_id?: string;
      visibility?: "general" | "company";
      company_id?: string | null;
      entry_at?: string | null;
      exit_at?: string | null;
    };

    if (!body.capture_id || !body.visibility) {
      return NextResponse.json({ error: "capture_id and visibility required" }, { status: 400 });
    }
    if (body.visibility === "company" && !body.company_id) {
      return NextResponse.json({ error: "company_id required for company feed" }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: cap, error: capErr } = await supabase
      .from("captures")
      .select("id, user_id")
      .eq("id", body.capture_id)
      .single();

    if (capErr || !cap || cap.user_id !== user.id) {
      return NextResponse.json({ error: "capture not found" }, { status: 404 });
    }

    const row = {
      user_id: user.id,
      capture_id: body.capture_id,
      visibility: body.visibility,
      company_id: body.visibility === "company" ? body.company_id : null,
      entry_at: body.entry_at ? new Date(body.entry_at).toISOString() : null,
      exit_at: body.exit_at ? new Date(body.exit_at).toISOString() : null,
    };

    const { data: post, error: pErr } = await supabase.from("feed_posts").insert(row).select("id").single();

    if (pErr) {
      if (pErr.code === "23505") {
        return NextResponse.json({ error: "already published" }, { status: 409 });
      }
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }

    return NextResponse.json({ post });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
