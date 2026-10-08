#!/usr/bin/env python3
"""完整导出第三年(高阶阶段)全部静态内容为 Markdown。

数据源:public/data/ 下的构建产物
  - vocab/stage3.json            4,000 词(135 单元)
  - grammar/part-12..18.json     第三年 1,142 课(按 index.json 的 stage==3 顺序)
  - reading/l3/part-01.json      B2 深度阅读 116 篇

输出:export/year3/ 下三个 Markdown 文件,字段全量、不截断。
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "public", "data")
OUT = os.path.join(ROOT, "export", "year3")
LETTERS = "ABCDEFGH"


def unit_no(unit: str) -> int:
    return int(unit[1:])


def export_vocab() -> tuple[str, int]:
    words = json.load(open(os.path.join(DATA, "vocab", "stage3.json"), encoding="utf-8"))
    by_unit: dict[str, list] = {}
    for w in words:
        by_unit.setdefault(w["unit"], []).append(w)
    units = sorted(by_unit, key=unit_no)
    lines = [
        "# 第三年 · 高阶阶段词库(stage3)全量导出",
        "",
        "- 来源:`public/data/vocab/stage3.json`",
        f"- 总词数:{len(words)} 词 | 单元数:{len(units)}(u01–u135) | CEFR:B1–C1(以 B2 为主)",
        "- 字段:单词 / 音标 / 释义 / 级别 / 词性·标签 / 例句(英 + 中)",
        "",
    ]
    for u in units:
        list_ = by_unit[u]
        lines.append(f"## Unit {unit_no(u):02d}({u},{len(list_)} 词)")
        lines.append("")
        for w in list_:
            tags = "、".join(w.get("tags", [])) or "-"
            lines.append(f"### {w['term']}  {w['phonetic']}")
            lines.append("")
            lines.append(f"- 释义:{w['meaning']}")
            lines.append(f"- 级别:{w['level']} | ID:{w['id']} | 标签:{tags}")
            for ex in w.get("examples", []):
                lines.append(f"- 例句:{ex['en']}")
                lines.append(f"  - 译:{ex['zh']}")
            lines.append("")
    path = os.path.join(OUT, "year3-词库-stage3-4000词.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return path, len(words)


def export_grammar() -> tuple[str, int]:
    index = json.load(open(os.path.join(DATA, "grammar", "index.json"), encoding="utf-8"))
    order = [i["id"] for i in index["items"] if i["stage"] == 3]
    parts_needed = sorted({i["part"] for i in index["items"] if i["stage"] == 3})
    lessons: dict[str, dict] = {}
    for p in parts_needed:
        for item in json.load(open(os.path.join(DATA, "grammar", f"part-{p:02d}.json"), encoding="utf-8")):
            if item["stage"] == 3:
                lessons[item["id"]] = item
    lines = [
        "# 第三年 · 高阶阶段语法课程全量导出",
        "",
        "- 来源:`public/data/grammar/index.json + part-12..18.json`(stage=3)",
        f"- 总课数:{len(order)} 课 = 手写 15 课(g-301..g-315)+ 批量生成 1,127 课(28 主题 × 10 变体)",
        "- 主题范围:长难句主干提取、非限制性定语从句、同位语从句、虚拟语气×5、倒装×3、强调句、省略、独立主格、衔接词综合演练",
        "- 每课字段:要点 / 例句(英 + 中)/ 练习题(题干、选项 A–D、答案、解析)",
        "",
    ]
    for n, lid in enumerate(order, 1):
        g = lessons[lid]
        lines.append(f"## 第 {n} 课 · {g['id']}:{g['title']}")
        lines.append("")
        lines.append(f"- 级别:{g['level']} | 题数:{len(g['questions'])}")
        lines.append(f"- 摘要:{g['summary']}")
        pts = g.get("points", [])
        if pts:
            lines.append("- 要点:")
            for p in pts:
                lines.append(f"  - {p}")
        exs = g.get("examples", [])
        if exs:
            lines.append("- 例句:")
            for ex in exs:
                lines.append(f"  - {ex['en']}")
                lines.append(f"    - 译:{ex['zh']}")
        lines.append("- 练习题:")
        for qi, q in enumerate(g["questions"], 1):
            lines.append(f"  - **Q{qi}({q['id']})** {q['prompt']}")
            for oi, opt in enumerate(q["options"]):
                lines.append(f"    - {LETTERS[oi]}. {opt}")
            lines.append(f"    - 答案:{LETTERS[q['answerIndex']]}")
            lines.append(f"    - 解析:{q['explanation']}")
        lines.append("")
    path = os.path.join(OUT, "year3-语法-1142课.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return path, len(order)


def export_reading() -> tuple[str, int]:
    items = json.load(open(os.path.join(DATA, "reading", "l3", "part-01.json"), encoding="utf-8"))
    lines = [
        "# 第三年 · B2 深度阅读全量导出",
        "",
        "- 来源:`public/data/reading/l3/index.json + part-01.json`(stage=3,B2)",
        f"- 总篇数:{len(items)} 篇(手写 r3-01..r3-16 + 批量生成,16 大场景,每篇 ≥ 700 词、6 段)",
        "- 每篇字段:标题 / 主题 / 摘要 / 词数 / 正文全段 / 词汇表 / 理解题(题干、选项 A–D、答案、解析)",
        "",
    ]
    for n, a in enumerate(items, 1):
        lines.append(f"## 第 {n} 篇 · {a['id']}:{a['title']}")
        lines.append("")
        lines.append(f"- 主题:{a['topic']} | 级别:{a['level']} | 词数:{a['wordCount']}")
        lines.append(f"- 摘要:{a['summary']}")
        lines.append("- 正文:")
        for pi, para in enumerate(a["paragraphs"], 1):
            lines.append(f"  - **第 {pi} 段**:{para}")
        gl = a.get("glossary", [])
        if gl:
            lines.append("- 词汇表:")
            for gitem in gl:
                lines.append(f"  - {gitem['term']}:{gitem['zh']}")
        lines.append("- 理解题:")
        for qi, q in enumerate(a["questions"], 1):
            lines.append(f"  - **Q{qi}({q['id']})** {q['prompt']}")
            for oi, opt in enumerate(q["options"]):
                lines.append(f"    - {LETTERS[oi]}. {opt}")
            lines.append(f"    - 答案:{LETTERS[q['answerIndex']]}")
            lines.append(f"    - 解析:{q['explanation']}")
        lines.append("")
    path = os.path.join(OUT, "year3-阅读-B2-116篇.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return path, len(items)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    results = []
    for fn in (export_vocab, export_grammar, export_reading):
        path, count = fn()
        size = os.path.getsize(path)
        results.append((path, count, size))
        print(f"OK  {os.path.relpath(path, ROOT)}  条目={count}  大小={size:,} B", file=sys.stderr)
    expect = {"vocab": 4000, "grammar": 1142, "reading": 116}
    got = {"vocab": results[0][1], "grammar": results[1][1], "reading": results[2][1]}
    assert got == expect, f"数量不符:期望 {expect},实际 {got}"
    print("全部校验通过:" + ", ".join(f"{k}={v}" for k, v in got.items()), file=sys.stderr)


if __name__ == "__main__":
    main()
