import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function POST(req: NextRequest) {
  try {
    const { name, slug: rawSlug } = (await req.json()) as { name?: string; slug?: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const slug = slugify(rawSlug?.trim() || name);

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: company, error: cErr } = await supabase
      .from("companies")
      .insert({ name: name.trim(), slug, created_by: user.id })
      .select("id, name, slug")
      .single();

    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 400 });
    }

    const { error: mErr } = await supabase.from("company_members").insert({
      company_id: company.id,
      user_id: user.id,
    });

    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }

    return NextResponse.json({ company });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
