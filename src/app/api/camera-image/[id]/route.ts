import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return new Response("Invalid camera id", { status: 400 });
    }

    const upstream = `https://webcams.nyctmc.org/api/cameras/${id}/image`;
    const res = await fetch(upstream, {
      cache: "no-store",
      headers: { Accept: "image/*" },
    });
    if (!res.ok) {
      return new Response(null, { status: res.status === 404 ? 404 : 502 });
    }

    const buf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/jpeg";

    return new Response(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[camera-image]", err);
    return new Response("Upstream error", { status: 502 });
  }
}
