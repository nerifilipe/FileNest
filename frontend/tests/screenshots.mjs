import { resolve } from "node:path";

// Normal test runs must not modify the screenshots committed for the README.
export function screenshotPath(name) {
  const directory =
    process.env.FILENEST_UPDATE_SCREENSHOTS === "1"
      ? "../docs"
      : "test-results/screenshots";
  return resolve(directory, name);
}
