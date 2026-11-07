export function GET() {
  return Response.json({ status: "available" }, { headers: { "Cache-Control": "no-store" } });
}
