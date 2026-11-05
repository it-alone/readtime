import { describe, expect, it } from "vitest";
import { hashString, shuffleSeeded } from "~/lib/random";

describe("shuffleSeeded", () => {
  it("同 seed 产出同一序列(选项稳定,便于复习重现)", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const seed = hashString("word-42");
    expect(shuffleSeeded(arr, seed)).toEqual(shuffleSeeded(arr, seed));
  });

  it("返回新数组,不修改原数组", () => {
    const arr = [1, 2, 3, 4];
    const seed = hashString("word-42");
    shuffleSeeded(arr, seed);
    expect(arr).toEqual([1, 2, 3, 4]);
  });

  it("内容不变(仅重排)", () => {
    for (let n = 0; n < 50; n++) {
      const arr = Array.from({ length: 8 }, (_, i) => i);
      const out = shuffleSeeded(arr, hashString("seed-" + n));
      expect([...out].sort((a, b) => a - b)).toEqual(arr);
    }
  });

  // 回归:普通 * 乘法在 s≈2^31 时超出浮点安全整数范围,低位丢失后 j 恒为 0,
  // 正确项永远停在第 4 位——大 seed 下各位置都应能出现
  it("大 seed 下打乱结果分布到多个不同排列", () => {
    const layouts = new Set<string>();
    for (let n = 0; n < 200; n++) {
      const arr = [1, 2, 3, 4];
      layouts.add(shuffleSeeded(arr, hashString("word-" + n)).join(","));
    }
    expect(layouts.size).toBeGreaterThan(4);
  });

  it("首个元素会被移动过(排除固定排列)", () => {
    const staysFirst = Array.from({ length: 200 }, (_, n) => {
      const arr = [1, 2, 3, 4];
      return shuffleSeeded(arr, hashString("word-" + n))[0] === 1;
    }).filter(Boolean).length;
    // 若洗牌退化,首位永远不变;正常随机下 200 次里首位保持的约 50 次
    expect(staysFirst).toBeLessThan(120);
  });
});
