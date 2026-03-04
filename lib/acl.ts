import type { Visibility } from "@/lib/types";
import { hashPrivateToken } from "@/lib/crypto";

interface AccessReportLike {
  visibility: Visibility;
  privateTokenHash: string | null;
  analysis: {
    requesterUserId: string | null;
    requesterSessionId: string;
  };
}

interface AccessViewer {
  userId: string | null;
  sessionId: string;
}

export function isReportOwner(report: AccessReportLike, viewer: AccessViewer): boolean {
  if (viewer.userId && report.analysis.requesterUserId === viewer.userId) {
    return true;
  }

  return report.analysis.requesterSessionId === viewer.sessionId;
}

export function canReadReport(params: {
  report: AccessReportLike;
  viewer: AccessViewer;
  token: string | null;
}): boolean {
  const { report, viewer, token } = params;

  if (report.visibility === "PUBLIC") {
    return true;
  }

  if (isReportOwner(report, viewer)) {
    return true;
  }

  if (!token || !report.privateTokenHash) {
    return false;
  }

  return hashPrivateToken(token) === report.privateTokenHash;
}
