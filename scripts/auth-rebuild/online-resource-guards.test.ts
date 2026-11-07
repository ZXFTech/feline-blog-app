// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawnSync: mock.spawn }));
import { dockerCommand, verifyExistingResources } from "./online-postgres";
import { assertSnapshotEntries } from "./online-migration";
import { onlineDirectory } from "./online-target";
const output = (value: string) => ({ status: 0, stdout: value, stderr: "" });
afterEach(() => {
  vi.unstubAllEnvs();
  mock.spawn.mockReset();
  vi.restoreAllMocks();
});
it("does not create state for a different working directory", () => {
  vi.spyOn(process, "cwd").mockReturnValue("C:/outside-task");
  expect(() => onlineDirectory()).toThrow("ONLINE_LOCAL_WORKDIR_REJECTED");
});
it("rejects an ambient Docker endpoint before any Docker operation", () => {
  vi.stubEnv("DOCKER_HOST", "ssh://remote.example.test");
  expect(() => dockerCommand(["compose", "up", "-d"])).toThrow("DOCKER_ENDPOINT_OVERRIDE_REJECTED");
  expect(mock.spawn).not.toHaveBeenCalled();
});
it("rejects a remote context before a resource can be created", () => {
  vi.stubEnv("DOCKER_HOST", "");
  mock.spawn.mockReturnValueOnce(output("remote-production"));
  expect(() => dockerCommand(["compose", "up", "-d"])).toThrow("NONLOCAL_DOCKER_CONTEXT_REJECTED");
  expect(mock.spawn).toHaveBeenCalledTimes(1);
});
it("rejects a remote endpoint behind a normal context name", () => {
  vi.stubEnv("DOCKER_HOST", "");
  mock.spawn
    .mockReturnValueOnce(output("default"))
    .mockReturnValueOnce(output("tcp://remote.example.test:2376"));
  expect(() => dockerCommand(["compose", "up", "-d"])).toThrow("NONLOCAL_DOCKER_ENDPOINT_REJECTED");
  expect(mock.spawn).toHaveBeenCalledTimes(2);
});
it("pins commands to the validated local Docker Desktop context", () => {
  vi.stubEnv("DOCKER_HOST", "");
  mock.spawn
    .mockReturnValueOnce(output("desktop-linux"))
    .mockReturnValueOnce(output("npipe:////./pipe/dockerDesktopLinuxEngine"))
    .mockReturnValueOnce(output("local"));
  expect(dockerCommand(["ps"])).toBe("local");
  expect(mock.spawn.mock.calls[2][1]).toEqual(["--context", "desktop-linux", "ps"]);
});
it("does not execute a migration left outside the reviewed snapshot", () => {
  expect(() => assertSnapshotEntries(["reviewed"], ["reviewed", "unexpected-migration"])).toThrow(
    "ONLINE_LOCAL_SNAPSHOT_REJECTED"
  );
  expect(() => assertSnapshotEntries(["reviewed"], ["reviewed", "unexpected.sql"])).toThrow(
    "ONLINE_LOCAL_SNAPSHOT_REJECTED"
  );
});
it("records unrelated container changes without weakening blog/database preservation", () => {
  const previous = {
    existingContainers: ["old-blog feline-blog-sdk-postgres", "other unrelated-interface"],
    existingVolumes: ["feline_blog_sdk_postgres_data"],
  };
  const volumes = new Set(previous.existingVolumes);
  expect(
    verifyExistingResources(previous, new Set([previous.existingContainers[0]]), volumes)
  ).toMatchObject({
    protectedResourcesPreserved: true,
    existingResourcesPreserved: false,
    unrelatedContainerChanges: 1,
  });
  expect(() => verifyExistingResources(previous, new Set(), volumes)).toThrow(
    "EXISTING_PROTECTED_RESOURCES_CHANGED"
  );
  expect(() =>
    verifyExistingResources(previous, new Set(previous.existingContainers), new Set())
  ).toThrow("EXISTING_PROTECTED_RESOURCES_CHANGED");
});
