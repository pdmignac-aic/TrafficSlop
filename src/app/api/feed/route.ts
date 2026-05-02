import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const scope = req.nextUrl.searchParams.get("scope") ?? "general";
    const companyId = req.nextUrl.searchParams.get("company_id");

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let q = supabase
      .from("feed_posts")
      .select(
        "id, score, published_at, visibility, entry_at, exit_at, user_id, capture_id, company_id, captures(storage_path, label, captured_at)",
      )
      .order("score", { ascending: false });

    if (scope === "general") {
      q = q.eq("visibility", "general");
    } else if (scope === "company" && companyId) {
      q = q.eq("visibility", "company").eq("company_id", companyId);
    } else {
      return NextResponse.json({ error: "invalid scope" }, { status: 400 });
    }

    const { data: posts, error } = await q.limit(120);
    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (posts ?? []).sort(
      (a, b) =>
        (b.score ?? 0) - (a.score ?? 0) ||
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
    );
    const userIds = [...new Set(rows.map((p) => p.user_id))];
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
    const nameByUser = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]));

    const postIds = rows.map((p) => p.id);
    let myVotes: { post_id: string; value: number }[] = [];
    if (postIds.length) {
      const { data: v } = await supabase
        .from("votes")
        .select("post_id, value")
        .eq("user_id", user.id)
        .in("post_id", postIds);
      myVotes = v ?? [];
    }

    const voteMap = Object.fromEntries(myVotes.map((v) => [v.post_id, v.value]));

    const items = rows.map((p) => {
      const cap = p.captures as unknown as {
        storage_path: string;
        label: string;
        captured_at: string;
      } | null;
      const path = cap?.storage_path ?? "";
      const url = path ? supabase.storage.from("captures").getPublicUrl(path).data.publicUrl : "";
      return {
        id: p.id,
        score: p.score,
        published_at: p.published_at,
        visibility: p.visibility,
        entry_at: p.entry_at,
        exit_at: p.exit_at,
        author: nameByUser[p.user_id] ?? "Unknown",
        capture_id: p.capture_id,
        label: cap?.label ?? "",
        captured_at: cap?.captured_at ?? null,
        image_url: url,
        my_vote: voteMap[p.id] ?? null,
      };
    });

    return NextResponse.json({ items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
