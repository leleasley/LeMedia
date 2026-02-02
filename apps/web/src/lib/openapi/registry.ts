import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// Create the global registry
export const registry = new OpenAPIRegistry();

// Register security scheme for cookie-based auth
registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "lemedia_session",
  description: "Session cookie authentication",
});

// Common error response schema
export const ErrorResponseSchema = z.object({
  error: z.string().describe("Error message"),
});

// Register common schemas
registry.register("Error", ErrorResponseSchema);

/**
 * Helper to register an API route with the OpenAPI registry.
 */
export function registerRoute(config: {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  request?: {
    params?: z.ZodObject<z.ZodRawShape>;
    query?: z.ZodObject<z.ZodRawShape>;
    body?: z.ZodTypeAny;
  };
  responses: Record<
    string,
    {
      description: string;
      schema?: z.ZodTypeAny;
    }
  >;
  security?: boolean;
}) {
  registry.registerPath({
    method: config.method,
    path: config.path,
    summary: config.summary,
    description: config.description,
    tags: config.tags,
    security: config.security ? [{ cookieAuth: [] }] : undefined,
    request: config.request
      ? {
          params: config.request.params,
          query: config.request.query,
          body: config.request.body
            ? {
                content: {
                  "application/json": {
                    schema: config.request.body,
                  },
                },
              }
            : undefined,
        }
      : undefined,
    responses: Object.fromEntries(
      Object.entries(config.responses).map(([code, { description, schema }]) => [
        code,
        {
          description,
          content: schema
            ? {
                "application/json": {
                  schema,
                },
              }
            : undefined,
        },
      ])
    ),
  });
}

/**
 * Generate the OpenAPI document from all registered routes.
 */
export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "LeMedia API",
      version: "1.0.0",
      description:
        "LeMedia is a media request management platform that integrates with TMDB, Sonarr, Radarr, and Jellyfin to help users discover, request, and track media availability.",
      contact: {
        name: "LeMedia",
      },
    },
    servers: [
      {
        url: "/api",
        description: "API endpoints",
      },
    ],
    tags: [
      { name: "Auth", description: "Authentication endpoints" },
      { name: "Profile", description: "User profile management" },
      { name: "Users", description: "User administration (admin only)" },
      { name: "Requests", description: "Media request operations" },
      { name: "Search", description: "Media search and discovery" },
      { name: "Media", description: "Media details and information" },
      { name: "TMDB", description: "TMDB integration endpoints" },
      { name: "Settings", description: "Application settings" },
      { name: "Notifications", description: "Notification management" },
      { name: "Admin", description: "Administrative operations" },
      { name: "Health", description: "System health and status" },
    ],
  });
}
