import { describe, expect, it } from "vitest";

import { canReadReport, isReportOwner } from "@/lib/acl";
import { hashPrivateToken } from "@/lib/crypto";

describe("report ACL", () => {
  const viewer = { userId: "user-1", sessionId: "session-1" };

  const privateReport = {
    visibility: "PRIVATE" as const,
    privateTokenHash: hashPrivateToken("token-123"),
    analysis: {
      requesterUserId: "user-2",
      requesterSessionId: "session-2"
    }
  };

  it("allows owner", () => {
    const ownerReport = {
      ...privateReport,
      analysis: {
        requesterUserId: "user-1",
        requesterSessionId: "session-other"
      }
    };

    expect(isReportOwner(ownerReport, viewer)).toBe(true);
    expect(
      canReadReport({
        report: ownerReport,
        viewer,
        token: null
      })
    ).toBe(true);
  });

  it("allows valid private token", () => {
    expect(
      canReadReport({
        report: privateReport,
        viewer,
        token: "token-123"
      })
    ).toBe(true);
  });

  it("denies invalid token", () => {
    expect(
      canReadReport({
        report: privateReport,
        viewer,
        token: "wrong-token"
      })
    ).toBe(false);
  });

  it("allows public visibility", () => {
    expect(
      canReadReport({
        report: {
          ...privateReport,
          visibility: "PUBLIC"
        },
        viewer,
        token: null
      })
    ).toBe(true);
  });
});
