import "server-only";
import { createUserCenterAuth } from "@user-center/next-better-auth/server";
import { prismaAdapter } from "better-auth/adapters/prisma";
import db from "@/db/client";
import { getSdkServerConfiguration } from "@/lib/auth/sdk/config";
import { resolveBusinessUser, type SdkBusinessUser } from "@/lib/auth/sdk/business";
import logger from "@/lib/logger/Logger";

function makeIntegration() {
  const config = getSdkServerConfiguration();
  return createUserCenterAuth<SdkBusinessUser>({
    manifest: config.manifest,
    environment: config.environment,
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    clientSecret: config.clientSecret,
    sessionSecret: config.sessionSecret,
    authUserPolicy: "allow-new",
    sessionTtlSeconds: 86400,
    resolveBusinessUser,
    onEvent(event) {
      logger.log(
        JSON.stringify({
          event: "feline_sdk_auth",
          phase: event.phase,
          code: event.code,
          requestId: event.requestId,
          version: event.version,
        })
      );
    },
  });
}
let integration: ReturnType<typeof makeIntegration> | undefined;
export function getSdkIntegration() {
  return (integration ??= makeIntegration());
}
