import { NextResponse } from "next/server";
import { generateOpenApiDocument } from "@/lib/openapi/registry";

// Import route registrations to ensure they're loaded
import "@/lib/openapi/routes";

export async function GET() {
  const doc = generateOpenApiDocument();

  return NextResponse.json(doc, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
