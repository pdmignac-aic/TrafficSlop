import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { slug } = (await req.json()) as { slug?: string };
    if (!slug?.trim()) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: company, error: fErr } = await supabase
      .from("companies")
      .select("id, name, slug")
      .eq("slug", slug.trim().toLowerCase())
      .maybeSingle();

    if (fErr || !company) {
      return NextResponse.json({ error: "company not found" }, { status: 404 });
    }

    const { error: iErr } = await supabase.from("company_members").insert({
      company_id: company.id,
      user_id: user.id,
    });

    if (iErr) {
      if (iErr.code === "23505") {
        return NextResponse.json({ ok: true, company, alreadyMember: true });
      }
      return NextResponse.json({ error: iErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, company });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
