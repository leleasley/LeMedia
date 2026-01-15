import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    openapi: "3.0.0",
    info: {
      title: "LeMedia API",
      version: "1.0.0",
    },
    servers: [
      {
        url: process.env.APP_BASE_URL || "http://localhost:3010",
      },
    ],
    paths: {},
  });
}
