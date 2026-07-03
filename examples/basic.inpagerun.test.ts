import { createTest } from "inpagerun/test";

const test = createTest("https://example.com");

test("has the expected page title", () => {
  expect(document.title).to.equal("Example Domain");
});

test("has the example domain heading", () => {
  const heading = document.querySelector("h1");

  expect(heading?.textContent).to.equal("Example Domain");
});

test("links to the IANA reserved domains page", () => {
  const link = document.querySelector<HTMLAnchorElement>("a");

  expect(link?.href).to.equal("https://www.iana.org/domains/example");
});
