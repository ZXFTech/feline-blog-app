import { DatabaseToolError } from "./errors";

export function normalizeForwardedArguments(args: readonly string[]): string[] {
  return args[0] === "--" ? args.slice(1) : [...args];
}

export function parseRecoveryOperationId(args: readonly string[]): string | undefined {
  if (args.length === 0) return undefined;
  const operationId = args[1];
  if (
    args.length !== 2 ||
    args[0] !== "--operation" ||
    !operationId ||
    !/^[a-f0-9]{32}$/.test(operationId)
  ) {
    throw new DatabaseToolError(
      "CONFIG_CONFLICT",
      "local recover accepts only --operation followed by a 32 character lowercase hexadecimal id."
    );
  }
  return operationId;
}
