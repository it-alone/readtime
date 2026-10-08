import { describe, expect, it } from "vitest";
import { tokenizeParagraph } from "~/lib/text/tokens";

// 阅读生词标注的分词器:空格/标点原样保留,单词归一化用于查词

describe("tokenizeParagraph", () => {
  it("普通句子里每个单词可点,空格原样保留", () => {
    const tokens = tokenizeParagraph("I love English");
    expect(tokens.map((t) => t.text).join("")).toBe("I love English");
    expect(tokens.filter((t) => t.word !== null).map((t) => t.word)).toEqual(["i", "love", "english"]);
  });

  it("剥离边缘标点,保留词内撇号/连字符", () => {
    const tokens = tokenizeParagraph("don't shout; it's twenty-four!");
    const words = tokens.filter((t) => t.word !== null).map((t) => t.word);
    expect(words).toEqual(["don't", "shout", "it's", "twenty-four"]);
    // 原文(含标点)不被破坏
    expect(tokens.map((t) => t.text).join("")).toBe("don't shout; it's twenty-four!");
  });

  it("纯标点/数字/空白不可点", () => {
    const tokens = tokenizeParagraph("Wow! 100 ... really?");
    const words = tokens.filter((t) => t.word !== null).map((t) => t.word);
    expect(words).toEqual(["wow", "really"]);
    expect(tokens.map((t) => t.text).join("")).toBe("Wow! 100 ... really?");
  });
});
