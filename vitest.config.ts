import { defineConfig, mergeConfig } from "vitest/config";
import { defineViteConfig } from "smartbundle";

export default defineConfig(async () => {
  const smartbundleConfig = await defineViteConfig();

  if ("error" in smartbundleConfig) {
    throw new Error(smartbundleConfig.errors.join("\n"));
  }

  return mergeConfig(
    smartbundleConfig,
    defineConfig({
      test: {
        include: ["test/**/*.test.ts"],
        testTimeout: 60_000,
      },
    }),
  );
});
