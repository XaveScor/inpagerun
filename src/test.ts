export type InpagerunTest = (name: string, fn: () => void | Promise<void>) => void;

export function createTest(..._urls: string[]): InpagerunTest {
  throw new Error("createTest can only be used inside inpagerun test.");
}

declare global {
  const expect: Chai.ExpectStatic;
}
