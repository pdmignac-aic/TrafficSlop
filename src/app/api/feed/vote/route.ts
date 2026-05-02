import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { post_id: postId, value } = (await req.json()) as {
      post_id?: string;
      value?: 1 | -1;
    };

    if (!postId || (value !== 1 && value !== -1)) {
      return NextResponse.json({ error: "post_id and value (+1|-1) required" }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { error } = await supabase.from("votes").insert({
      post_id: postId,
      user_id: user.id,
      value,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "already voted" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
