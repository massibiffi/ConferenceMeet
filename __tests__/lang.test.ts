import { normalize, isRTL, DEFAULT_LANGUAGE } from "@/lib/lang";

describe("normalize", () => {
  it("keeps supported languages", () => {
    expect(normalize("en")).toBe("en");
    expect(normalize("fr")).toBe("fr");
    expect(normalize("es")).toBe("es");
    expect(normalize("ar")).toBe("ar");
  });

  it("strips region subtags", () => {
    expect(normalize("en-US")).toBe("en");
    expect(normalize("fr-CA")).toBe("fr");
    expect(normalize("ar-EG")).toBe("ar");
  });

  it("is case-insensitive", () => {
    expect(normalize("AR")).toBe("ar");
    expect(normalize("Fr-FR")).toBe("fr");
  });

  it("falls back to the default for unsupported or missing codes", () => {
    expect(normalize("de")).toBe(DEFAULT_LANGUAGE);
    expect(normalize("zh-CN")).toBe(DEFAULT_LANGUAGE);
    expect(normalize(undefined)).toBe(DEFAULT_LANGUAGE);
    expect(normalize("")).toBe(DEFAULT_LANGUAGE);
  });
});

describe("isRTL", () => {
  it("is true only for Arabic among supported languages", () => {
    expect(isRTL("ar")).toBe(true);
    expect(isRTL("en")).toBe(false);
    expect(isRTL("fr")).toBe(false);
    expect(isRTL("es")).toBe(false);
  });
});
