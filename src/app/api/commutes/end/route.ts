import { NextRequest, NextResponse } from "next/server";
import { sendCommuteEmail } from "@/lib/email";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { commute_id: commuteId } = (await req.json()) as { commute_id?: string };
    if (!commuteId) {
      return NextResponse.json({ error: "commute_id required" }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: commute, error: cErr } = await supabase
      .from("commutes")
      .select("id, user_id, ended_at")
      .eq("id", commuteId)
      .single();

    if (cErr || !commute || commute.user_id !== user.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (commute.ended_at) {
      return NextResponse.json({ error: "already ended" }, { status: 400 });
    }

    const { error: uErr } = await supabase
      .from("commutes")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", commuteId);

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    const { data: caps } = await supabase
      .from("captures")
      .select("label, storage_path, captured_at")
      .eq("commute_id", commuteId)
      .order("captured_at", { ascending: true });

    const email = user.email;
    if (email && caps && caps.length > 0) {
      try {
        await sendCommuteEmail({
          to: email,
          items: caps.map((c) => ({
            label: c.label,
            url: supabase.storage.from("captures").getPublicUrl(c.storage_path).data.publicUrl,
            at: new Date(c.captured_at).toLocaleString(),
          })),
        });
        await supabase.from("commutes").update({ email_sent_at: new Date().toISOString() }).eq("id", commuteId);
      } catch (mailErr) {
        console.error("email failed", mailErr);
        return NextResponse.json(
          {
            ok: true,
            emailed: false,
            warning: mailErr instanceof Error ? mailErr.message : "email failed",
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json({ ok: true, emailed: Boolean(email && caps && caps.length) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
