# -*- coding: utf-8 -*-
"""短语库生成入口:phrase_frames*.py 多内容源 → scripts/build-content/phrases/stage{1,2,3}/pXX.tsv。

「根据三年的词汇量补充对应的短语」的落点:
- 每条短语的内容词须命中对应 stage 的累积词库(第 2 年含第 1 年,依此类推),
  命中词写入 words 列,零命中则丢弃并告警——短语与三年 30,000 词直接挂钩;
- 难度对齐各学年:stage1 = A1/A2、stage2 = A2/B1、stage3 = B1/B2。

内容源分层(全部静态 curated,重跑结果一致):
- phrase_frames.py   FIXED:各 stage 基础 4 组(动词短语/介词短语/习惯表达/场景搭配);
- phrase_frames2.py  SUPP:stage1 日常高频补充 8 组(口语/校园/起居/饮食/出行/情感/时间/运动);
- phrase_frames3.py  SUPP:stage2 补充 8 组(口语应答/职场/观点衔接/人际/时间计划/消费/数字生活/天气);
- phrase_frames4.py  SUPP:stage3 补充 6 组(高阶动词短语/学术论证/社会话题/习语谚语/让步对比/高频搭配)。
同 stage 内补充组追加在基础组之后,p 编号稳定;跨文件短语重复由全局查重兜底报错。

用法:python3 gen_phrases.py            # 重建短语 TSV
     python3 gen_phrases.py --dry-run  # 只打印校验统计,不写文件

与 main.py 解耦:短语板块独立再生成,不会触发语法/阅读/听力的 append-only 扩容。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import engine as E  # noqa: E402
from phrase_frames import FIXED as _BASE  # noqa: E402
from phrase_frames2 import SUPP as _S2  # noqa: E402
from phrase_frames3 import SUPP as _S3  # noqa: E402
from phrase_frames4 import SUPP as _S4  # noqa: E402

# 多源合并:基础组在前,补充组按文件序追加
FIXED = {
    s: _BASE[s] + _S2.get(s, []) + _S3.get(s, []) + _S4.get(s, [])
    for s in (1, 2, 3)
}

DRY = "--dry-run" in sys.argv

# 虚词不入 words 列(它们几乎都在词库里,但不构成短语的"核心词")
STOPWORDS = {
    "a", "an", "the", "of", "in", "on", "at", "to", "for", "with", "by", "from",
    "up", "down", "out", "off", "into", "onto", "over", "under", "as", "than",
    "and", "or", "but", "so", "not", "no", "yes", "please", "all", "each",
    "be", "is", "are", "am", "was", "were", "do", "does", "did", "done",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "its", "our", "their", "mine", "yours",
    "let", "don", "t", "s", "re", "ve", "ll", "one", "ones",
}


def base_forms(w):
    """词形还原候选:原形优先,再试复数/三单/ies→y 及 ed/er/ing 的屈折变化(词库收的是原形)。

    覆盖日常短语里的常见屈折:sooner→soon、bigger→big(双写辅音折叠)、making→make(去 ing 补 e)、
    based→base(去 ed 补 e / 去 d)。候选仅用于词库命中,不要求形态学精确,误还原自然查不到即跳过。
    """
    forms = [w]
    if w.endswith("ies") and len(w) > 3:
        forms.append(w[:-3] + "y")
    if w.endswith("es") and len(w) > 3:
        forms.append(w[:-2])
    if w.endswith("s") and len(w) > 2:
        forms.append(w[:-1])
    if w.endswith("ed") and len(w) > 3:
        stem = w[:-2]
        forms += [w[:-1], stem, stem + "e"]  # based→base / worked→work / liked→like
    if w.endswith("er") and len(w) > 4:
        stem = w[:-2]
        forms += [stem, stem + "e"]  # sooner→soon / larger→large
        if len(stem) > 2 and stem[-1] == stem[-2]:
            forms.append(stem[:-1])  # bigger→big(双写辅音折叠)
    if w.endswith("ing") and len(w) > 4:
        stem = w[:-3]
        forms += [stem, stem + "e"]  # waiting→wait / making→make
        if len(stem) > 2 and stem[-1] == stem[-2]:
            forms.append(stem[:-1])  # running→run(双写辅音折叠)
    return forms


def content_words(phrase, vocab_set):
    """短语的内容词(按词库命中过滤,保留出现顺序;大小写不敏感;屈折变化回退到原形)。"""
    words, seen = [], set()
    for token in phrase.split():
        w = "".join(ch for ch in token if ch.isalpha()).lower()
        if len(w) < 2 or w in STOPWORDS:
            continue
        hit = next((f for f in base_forms(w) if f in vocab_set), None)
        if hit and hit not in seen:
            seen.add(hit)
            words.append(hit)
    return words


def main():
    # 累积词库:stage2 覆盖 = stage1 ∪ stage2,stage3 同理
    by_stage = {s: set() for s in (1, 2, 3)}
    for w in E.load_vocab():
        by_stage[w["stage"]].add(w["term"].lower())
    cumulative = {1: by_stage[1], 2: by_stage[1] | by_stage[2], 3: by_stage[1] | by_stage[2] | by_stage[3]}

    seen_global = set()
    total, dropped = 0, 0
    for stage in (1, 2, 3):
        vocab = cumulative[stage]
        for gi, (group, entries) in enumerate(FIXED[stage], start=1):
            lines = [f"# group\t{group}"]
            for phrase, meaning, level, ex_en, ex_zh, tags in entries:
                key = phrase.lower()
                if key in seen_global:
                    raise RuntimeError(f"短语重复:{phrase}(stage{stage} {group})")
                words = content_words(phrase, vocab)
                if not words:
                    dropped += 1
                    print(f"· 丢弃(核心词零命中 stage{stage} 累积词库):{phrase}")
                    continue
                seen_global.add(key)
                total += 1
                # 先清洗各字段再拼接:clean 会把 | 换成 /,tags/words 的 | 分隔符必须在清洗后加入
                cells = [
                    E.clean(phrase), E.clean(meaning), level, E.clean(ex_en), E.clean(ex_zh),
                    "|".join(t.strip() for t in tags.split(",") if t.strip()),
                    "|".join(words),
                ]
                if any(("\t" in c) or ("\n" in c) for c in cells):
                    raise RuntimeError(f"字段含制表符/换行:{phrase}")
                lines.append("\t".join(cells))
            unit = f"p{gi:02d}"
            path = E.TSV_ROOT / "phrases" / f"stage{stage}" / f"{unit}.tsv"
            if not DRY:
                E.write_tsv(path, lines)
            else:
                print(f"[dry] {path}({len(lines) - 1} 条,{group})")
    print(f"完成:短语 {total} 条,丢弃 {dropped} 条(dry-run={DRY})")


if __name__ == "__main__":
    main()
