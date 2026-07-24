export async function GET() {
  return Response.json(
    { marco: "polo" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
