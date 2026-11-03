import { test, expect } from "@playwright/test";
test("complete playable flow, IndexedDB resume and portable save", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "승리의 역사를, 당신의 손으로." }),
  ).toBeVisible();
  await expect(page.locator(".club-card")).toHaveCount(10);
  await page.locator(".club-card").first().click();
  await expect(
    page.getByRole("heading", { name: "구단의 내일을 설계하세요." }),
  ).toBeVisible();
  await expect(page.locator(".roster-grid .player-card")).toHaveCount(5);
  await page
    .getByRole("button", { name: "이적시장", exact: false })
    .first()
    .click();
  const candidate = page.locator(".market-card").first();
  const name = await candidate.locator("h3").innerText();
  await candidate.getByRole("button", { name: "계약 제안 →" }).click();
  await expect(
    page
      .locator(".market-card h3")
      .filter({ hasText: new RegExp(`^${name}$`) }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "선수단 · 훈련", exact: false })
    .first()
    .click();
  await expect(
    page.locator(".roster-grid").nth(1).locator(".player-card"),
  ).toHaveCount(6);
  const signing = page
    .locator(".player-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await signing
    .getByRole("button", { name: "1군 콜업 · 동일 포지션 교체" })
    .click();
  await expect(
    page
      .locator(".roster-grid")
      .first()
      .getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  await page.getByLabel("팀 전략", { exact: true }).selectOption("바텀 중심");
  await page
    .getByRole("button", { name: "구단 홈", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: "정규시즌 전체 진행" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "전체 자동 진행 →" }).click();
  await expect(
    page.getByRole("heading", { name: "정규시즌 최종 순위" }),
  ).toBeVisible();
  await expect(page.locator(".panel table tbody tr").first()).toBeVisible();
  for (const label of [
    "플레이오프 1라운드 진행 ↗",
    "플레이오프 4강 진행 ↗",
    "플레이오프 결승 진행 ↗",
  ]) {
    await page.getByRole("button", { name: label }).click();
    await page.getByRole("button", { name: "전체 자동 진행 →" }).click();
  }
  await expect(page.locator(".champion")).toBeVisible();
  await expect(page.locator(".match-box")).toHaveCount(5);
  await expect(page.locator(".topbar")).toContainText("스프링 결산");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "저장 파일 내보내기" }).click();
  await expect((await download).suggestedFilename()).toMatch(
    /LCK-t1-complete.json/,
  );
  await page.reload();
  await expect(page.locator(".topbar")).toContainText("스프링 결산");
  await page
    .getByRole("button", { name: "대회 · 평가", exact: false })
    .first()
    .click();
  await expect(page.locator(".champion")).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("mobile selection, layout and save controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({
    path: "test-results/selection-mobile.png",
    fullPage: true,
  });
  await page.locator(".club-card").last().click();
  await expect(
    page.getByRole("heading", { name: "구단의 내일을 설계하세요." }),
  ).toBeVisible();
  await expect(page.locator(".mobile-save")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
});
test("bad save leaves active game intact; valid save restores a new context", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".club-card").first().click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":99}'),
    });
  await expect(page.getByRole("alert")).toContainText("손상된 저장 파일");
  await expect(page.locator(".sidebar-club")).toContainText("T1");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "저장 파일 내보내기" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  await page
    .getByRole("button", { name: "새 게임", exact: false })
    .first()
    .click();
  await page.locator(".club-card").last().click();
  await expect(page.locator(".sidebar-club")).toContainText("Hanwha");
  await page.locator("input[type=file]").setInputFiles(path!);
  await expect(page.locator(".sidebar-club")).toContainText("T1");
});
