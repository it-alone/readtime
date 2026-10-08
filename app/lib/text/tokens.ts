// 阅读生词标注用的段落分词(纯函数):
// 把英文段落切成 token 序列,空格/标点保持原样渲染,单词部分归一化用于查词。

export interface TextToken {
  /** 原文片段(含空格与标点,渲染时原样输出) */
  text: string;
  /** 归一化查词形式(小写、去除边缘标点);null 表示不可点选(纯空白/标点/数字) */
  word: string | null;
}

export function tokenizeParagraph(paragraph: string): TextToken[] {
  return paragraph.split(/(\s+)/).map((chunk) => {
    const stripped = chunk.replace(/^[^A-Za-z]+/, "").replace(/[^A-Za-z]+$/, "");
    return { text: chunk, word: /[A-Za-z]/.test(stripped) ? stripped.toLowerCase() : null };
  });
}
