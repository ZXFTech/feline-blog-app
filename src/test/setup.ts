import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// These tests execute server modules directly. Next's build separately enforces the server boundary.
vi.mock("server-only", () => ({}));

afterEach(() => cleanup());
