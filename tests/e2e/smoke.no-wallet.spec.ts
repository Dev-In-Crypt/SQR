import { expect, test } from "@playwright/test";

const RISKY_SNIPPET = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.8.20;",
  "",
  "contract RiskyFlow {",
  "    function run(address target) external {",
  "        require(tx.origin == msg.sender, \"origin\");",
  "        (bool ok, ) = target.delegatecall(abi.encodeWithSignature(\"pwn()\"));",
  "        require(ok, \"delegate\");",
  "    }",
  "}"
].join("\n");

const INCOMPLETE_SNIPPET = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.8.20;",
  "contract Broken {",
  "    function run() external {",
  "        if (true) {"
].join("\n");

async function createReportViaUi(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/");

  await page.getByLabel("Solidity snippet (max 200 lines)").fill(RISKY_SNIPPET);
  await page.getByRole("button", { name: "Analyze" }).click();

  await expect(page).toHaveURL(/\/analysis\//);
  const analysisId = new URL(page.url()).pathname.split("/")[2] || "";
  expect(analysisId).not.toBe("");

  let reportId = "";
  let privateToken = "";
  for (let i = 0; i < 90; i += 1) {
    const response = await page.request.get(`/api/v1/analysis/${analysisId}`);
    if (!response.ok()) {
      await page.waitForTimeout(500);
      continue;
    }

    const body = (await response.json()) as {
      reportId: string | null;
      privateToken: string | null;
      status: string;
    };

    if (body.reportId) {
      reportId = body.reportId;
      privateToken = body.privateToken || "";
      break;
    }

    if (body.status === "FAILED") {
      break;
    }

    await page.waitForTimeout(500);
  }

  expect(reportId).not.toBe("");
  const reportUrl = privateToken
    ? `/r/${reportId}?token=${encodeURIComponent(privateToken)}`
    : `/r/${reportId}`;
  await page.goto(reportUrl);
  await expect(page).toHaveURL(/\/r\//);
  await expect(page.getByRole("heading", { name: "Security Report" })).toBeVisible();

  const url = new URL(page.url());
  const reportIdFromUrl = url.pathname.split("/")[2] || "";
  expect(reportIdFromUrl).not.toBe("");
  return reportIdFromUrl;
}

test("suite A smoke: paste -> private link -> publish/unpublish -> filter/expand", async ({
  browser,
  page,
  baseURL
}) => {
  const reportId = await createReportViaUi(page);

  await expect(page.getByText(/reportHash:\s*0x[0-9a-f]{64}/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Findings \(/ })).toBeVisible();

  await page.getByRole("button", { name: "Generate private link" }).click();

  const sharePre = page.locator("pre").filter({ hasText: "/r/" }).first();
  await expect(sharePre).toBeVisible();

  const shareUrl = (await sharePre.textContent())?.trim() || "";
  expect(shareUrl).toContain(`/r/${reportId}`);

  const privateViewerContext = await browser.newContext();
  const privateViewerPage = await privateViewerContext.newPage();
  await privateViewerPage.goto(shareUrl);
  await expect(privateViewerPage.getByRole("heading", { name: "Security Report" })).toBeVisible();
  await privateViewerContext.close();

  await page.getByRole("button", { name: "Publish report" }).click();
  await expect(page.getByRole("button", { name: "Publish report" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Make private" })).toBeEnabled();

  const publicViewerContext = await browser.newContext();
  const publicViewerPage = await publicViewerContext.newPage();
  await publicViewerPage.goto(`${baseURL}/r/${reportId}`);
  await expect(publicViewerPage.getByRole("heading", { name: "Security Report" })).toBeVisible();
  await publicViewerContext.close();

  await page.getByRole("button", { name: "Make private" }).click();
  await expect(page.getByRole("button", { name: "Publish report" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Make private" })).toBeDisabled();

  const deniedContext = await browser.newContext();
  const deniedPage = await deniedContext.newPage();
  await deniedPage.goto(`${baseURL}/r/${reportId}`);
  await expect(deniedPage.getByText("This report is private")).toBeVisible();
  await deniedContext.close();

  await page.getByLabel("Severity filter:").selectOption("HIGH");
  const firstFinding = page.locator("details summary").first();
  await expect(firstFinding).toBeVisible();
  await firstFinding.click();
  await expect(page.getByText("Why it matters:").first()).toBeVisible();
  await firstFinding.click();
});

test("suite A smoke: incomplete snippet is blocked in UI", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Solidity snippet (max 200 lines)").fill(INCOMPLETE_SNIPPET);

  await expect(page.getByText("incomplete snippet, please paste full contract")).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze" })).toBeDisabled();
  await expect(page).not.toHaveURL(/\/analysis\//);
});
