import { resolve } from "node:path";

// Full-page captures can offset fixed navigation after Playwright auto-scrolls.
// Keep the review readable in the README by capturing the actual viewport.
export async function captureReview(page, name) {
  await page.locator(".results").evaluate((element) => {
    window.scrollTo({
      top: element.getBoundingClientRect().top + window.scrollY - 24,
      behavior: "instant",
    });
  });
  await page.screenshot({
    path: screenshotPath(name),
    fullPage: false,
    animations: "disabled",
  });
}

// Normal test runs must not modify the screenshots committed for the README.
export function screenshotPath(name) {
  const directory =
    process.env.FILENEST_UPDATE_SCREENSHOTS === "1"
      ? "../docs"
      : "test-results/screenshots";
  return resolve(directory, name);
}
