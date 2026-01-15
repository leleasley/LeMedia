export async function GET() {
  return new Response(
    [
      "Contact: mailto:security@leleasley.uk",
      "Expires: 2025-12-31T23:59:59.000Z",
      "Preferred-Languages: en",
      "Canonical: https://media.leleasley.uk/.well-known/security.txt",
    ].join("\n"),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    }
  );
}
