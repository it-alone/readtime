# -*- coding: utf-8 -*-
"""批量内容生成入口:语法 3×1120 课 / 阅读 l2 3200 篇(A1 800+A2 1200+B1 1200)+ l3 100 篇(B2)/ 听力 l1 1400 + l2 600。

用法:python3 main.py            # 全量补齐(append-only,跳过已存在 id)
     python3 main.py --dry-run  # 只打印计划不写文件(计数照走)

生成确定性:同一 id 永远生成同一内容(random.Random(id) 播种)。
"""

import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import engine as E  # noqa: E402
import reading_frames as R  # noqa: E402
import listening_frames as LF  # noqa: E402
from grammar_topics import GRAMMAR_STAGES, VARIANT_NAMES  # noqa: E402

TSV = E.TSV_ROOT
DRY = "--dry-run" in sys.argv

LEVEL_RANK = {"A1": 1, "A2": 2, "B1": 3, "B2": 4}
NEXT_LEVEL = {"A1": "A2", "A2": "B1", "B1": "B2", "B2": "B2"}

GRAMMAR_PER_STAGE = 1120                            # 28 话题 × 40 课
READING_NEW = {"A1": 800, "A2": 1200, "B1": 1200}   # l2 追加
READING_L3_NEW = 100                                # B2 追加
LISTENING_L1_NEW = 1400                             # A1/A2 各半
LISTENING_L2_NEW = 600                              # B1

COUNTS = {"grammar": 0, "reading": 0, "listening": 0}


def out(kind, path, lines):
    if not DRY:
        E.write_tsv(path, lines)
    COUNTS[kind] += 1


# ───────────────────────── 语法 ─────────────────────────

def gen_grammar():
    for stage in (1, 2, 3):
        topics = GRAMMAR_STAGES[stage]
        module_dir = TSV / "grammar" / f"stage{stage}"
        seqs = E.existing_seqs(module_dir, f"g-{stage}")
        seq = E.next_seq(seqs)
        for n in range(GRAMMAR_PER_STAGE):
            topic = topics[n % len(topics)]
            rnd = n // len(topics)
            variant = VARIANT_NAMES[rnd % len(VARIANT_NAMES)]
            suffix = "" if rnd < len(VARIANT_NAMES) else f"(第{rnd // len(VARIANT_NAMES) + 1}轮)"
            lid = E.make_id(f"g-{stage}", seq)
            rng = random.Random(lid)
            lines = [
                f"# title\t{E.clean(topic['title'])} · {variant}{suffix}",
                f"# summary\t{E.clean(topic['summary'])}本课为{variant}练习,核心:{E.clean(topic['focus'])}。",
                f"# level\t{topic['level']}",
                f"# points\t{'|'.join(E.clean(p) for p in topic['points'])}",
            ]
            for i, (en_tpl, zh_tpl, correct, wrongs) in enumerate(topic["tpls"]):
                en, zh = E.fill_template(en_tpl, zh_tpl, rng)
                en, zh = E.clean(en), E.clean(zh)
                lines.append(f"# example\t{en}\t{zh}")
                fmt = (n + i) % 3
                if fmt == 0:  # 挖空填词
                    prompt = E.swap_target(en, correct, "_____")
                    if prompt is None:
                        raise RuntimeError(f"{lid} 模板目标词未命中:{en!r} / {correct!r}")
                    q = E.make_question(prompt, correct, list(wrongs),
                                        f"考查{E.clean(topic['focus'])}。此处应为 {correct}。句意:{zh}", rng)
                else:  # 选正确句子 / 中译英
                    wrong_sents = []
                    for w in wrongs:
                        s = E.swap_target(en, correct, w)
                        if s is None:
                            raise RuntimeError(f"{lid} 干扰项替换失败:{en!r} / {w!r}")
                        wrong_sents.append(s)
                    if fmt == 1:
                        q = E.make_question("下面哪一句是正确的?", en, wrong_sents,
                                            f"{E.clean(topic['focus'])}。正确句:{en}", rng)
                    else:
                        q = E.make_question(f"「{zh}」的正确英文是?", en, wrong_sents,
                                            f"考查{E.clean(topic['focus'])}。正确句:{en}", rng)
                lines.append("\t".join(q))
            out("grammar", module_dir / f"{lid}.tsv", lines)
            seq += 1
        print(f"语法 stage{stage}:已有 {len(seqs)} 课,新增 {GRAMMAR_PER_STAGE} 课")


# ───────────────────────── 词库嵌入选题 ─────────────────────────

_topic_cache = {}


def pick_embeds(rng, tags, level, n):
    """优先选话题标签词(允许难度+1),不足回退到全库同难度;返回按 term 去重的词条列表。"""
    key = ("+".join(sorted(tags)), NEXT_LEVEL[level])
    if key not in _topic_cache:
        _topic_cache[key] = E.vocab_pool(tags, 3, NEXT_LEVEL[level])
    topic_pool = _topic_cache[key]
    general = [{"term": w["term"], "meaning": w["meaning"], "en": w["examples"][0]["en"],
                "zh": w["examples"][0]["zh"], "level": w["level"]}
               for w in E.load_vocab() if LEVEL_RANK[w["level"]] <= LEVEL_RANK[level]]
    picks, seen = [], set()
    tries = 0
    while len(picks) < n and tries < n * 40:
        tries += 1
        pool = topic_pool if topic_pool and rng.random() < 0.85 else general
        w = rng.choice(pool)
        if w["term"].lower() in seen:
            continue
        seen.add(w["term"].lower())
        picks.append(w)
    if len(picks) < n:
        raise RuntimeError(f"可嵌入词库例句不足({tags},{level}):需要 {n},仅得 {len(picks)}")
    return picks


def vocab_question(rng, word, prompt_prefix):
    """词义题:正确项 = 该词释义首义项,干扰项 = 其他词释义首义项。"""
    correct = E.short_meaning(word["meaning"])
    wrongs, seen = [], {correct}
    tries = 0
    while len(wrongs) < 3 and tries < 60:
        tries += 1
        cand = E.short_meaning(rng.choice(E.load_vocab())["meaning"])
        if cand in seen or len(cand) < 2:
            continue
        seen.add(cand)
        wrongs.append(cand)
    if len(wrongs) < 3:
        raise RuntimeError("词义干扰项不足")
    return E.make_question(f"{prompt_prefix}“{word['term']}”的意思最接近?", correct, wrongs,
                           f"“{word['term']}”({word['level']})意为:{correct}。", rng)


def gist_question(rng, topic, prefix="这篇"):
    others = [t["gist"] for t in R.TOPICS if t["key"] != topic["key"]]
    return E.make_question(f"{prefix}材料主要讲了什么?", topic["gist"], rng.sample(others, 3),
                           f"全文围绕“{topic['topic']}”展开。", rng)


def fact_question(rng, fact, slots):
    en, zh, q_tpl, ans_key, bank = fact
    correct = slots[ans_key][1]
    wrongs = E.bank_distractors(bank, correct, 3, rng)
    q = E.fill_slots("x", q_tpl, slots)[1]
    src_en = E.fill_slots(en, zh, slots)[0]
    return E.make_question(q, correct, list(wrongs), f"原文:“{src_en}”。", rng)


def build_slots(rng, topic):
    slots = E.article_slots(rng)
    kws = rng.sample(topic["kws"], 2)
    slots["kw1"], slots["kw2"] = kws[0], kws[1]
    slots["topic_noun"] = topic["noun"]
    return slots


# ───────────────────────── 阅读 ─────────────────────────

READING_TITLES = {
    "A1": [("A Day at {kw1}", "{kw1_zh}的一天"), ("My Friend {friend}", "我的朋友{friend_zh}"),
           ("{name}'s Favorite Things", "{name_zh}的最爱")],
    "A2": [("A Story about {kw1}", "关于{kw1_zh}的故事"), ("{name} and the {kw2} Plan", "{name_zh}与{kw2_zh}的计划"),
           ("My Life and {topic_noun}", "我的生活与{topic_noun_zh}")],
    "B1": [("Growing up with {topic_noun}", "与{topic_noun_zh}一起成长"), ("A Lesson from {kw1}", "来自{kw1_zh}的一课"),
           ("{name}'s Way of Living", "{name_zh}的生活方式")],
    "B2": [("{topic_noun}: My View", "{topic_noun_zh}:我的看法"), ("Thinking about {topic_noun}", "思考{topic_noun_zh}"),
           ("The Power of {topic_noun}", "{topic_noun_zh}的力量")],
}

READING_SUMMARIES = {
    "A1": "围绕{topic}的{level}短文:介绍{name_zh}的日常、喜好与{kw1_zh}。",
    "A2": "一篇关于{topic}的{level}短文:{name_zh}与{friend_zh}的经历和小计划。",
    "B1": "一篇关于{topic}的{level}记叙文:{name_zh}的经历、感受与成长。",
    "B2": "一篇关于{topic}的议论文:由{kw1_zh}谈起,层层论证并给出建议。",
}


def compose_l2(rng, topic, slots, level, embeds, facts_n, paras_n):
    layout = R.READING_LAYOUT[level]
    fact_pool = {"A1": R.A1_FACTS, "A2": R.A2_FACTS, "B1": R.B1_FACTS}[level]
    filler_pool = {"A1": R.A1_FILLERS, "A2": R.A2_FILLERS, "B1": R.B1_FILLERS}[level]
    facts = rng.sample(fact_pool, facts_n)
    fillers = rng.sample(filler_pool, min(len(filler_pool), paras_n * layout["frame_sents"] - facts_n))
    embed_words = pick_embeds(rng, topic["tags"], level, embeds)
    sents = [("fact", f) for f in facts] + [("fill", t) for t in fillers]
    rng.shuffle(sents)
    paragraphs = []
    idx = 0
    for p in range(paras_n):
        parts = []
        for _ in range(layout["frame_sents"]):
            if idx < len(sents):
                kind, payload = sents[idx]
                en, _ = E.fill_slots(payload[0], payload[1], slots)
                parts.append(E.cap(en))
                idx += 1
        if p < len(embed_words):
            parts.append(E.embed_sentence(embed_words[p], rng))
        paragraphs.append(" ".join(E.clean(x) for x in parts))
    rest = embed_words[paras_n:]
    if rest:
        extra = " ".join(E.clean(E.embed_sentence(w, rng)) for w in rest)
        paragraphs[-1] = paragraphs[-1] + " " + extra
    return paragraphs, facts, embed_words


def compose_b2(rng, topic, slots, embed_n):
    frame_intro = rng.choice(R.B2_INTRO)
    frame_concl = rng.choice(R.B2_CONCLUSION)
    body_pool = list(R.B2_BODY)
    rng.shuffle(body_pool)
    body = [body_pool[i % len(body_pool)] for i in range(24)]
    fact = rng.choice(R.B2_FACTS)
    embed_words = pick_embeds(rng, topic["tags"], "B2", embed_n)

    paragraphs = []
    i_en, _ = E.fill_slots(frame_intro[0], frame_intro[1], slots)
    t_en, _ = E.fill_slots(*topic["thesis"][0], slots)
    paragraphs.append(f"{E.clean(E.cap(i_en))} {E.clean(E.cap(t_en))}")

    e = 0
    for p in range(12):
        parts = []
        for k in range(2):
            tpl = body[p * 2 + k]
            en, _ = E.fill_slots(tpl[0], tpl[1], slots)
            parts.append(E.cap(en))
        for _ in range(3):
            if e < len(embed_words):
                parts.append(E.embed_sentence(embed_words[e], rng))
                e += 1
        paragraphs.append(" ".join(E.clean(x) for x in parts))

    fen, _ = E.fill_slots(fact[0], fact[1], slots)
    c_en, _ = E.fill_slots(frame_concl[0], frame_concl[1], slots)
    t2_en, _ = E.fill_slots(*topic["thesis"][1], slots)
    paragraphs.append(f"{E.clean(E.cap(fen))} {E.clean(E.cap(c_en))} {E.clean(E.cap(t2_en))}")

    def wc():
        return sum(len(p.split()) for p in paragraphs)

    extra_pool = [w for w in pick_embeds(rng, topic["tags"], "B2", embed_n + 80)[embed_n:]
                  if w["term"].lower() not in {x["term"].lower() for x in embed_words}]
    ei = 0
    while wc() < 710 and ei < len(extra_pool):
        en = E.embed_sentence(extra_pool[ei], rng)
        paragraphs[1 + (ei % 12)] = paragraphs[1 + (ei % 12)] + " " + E.clean(en)
        ei += 1
    if wc() < 700:
        raise RuntimeError("B2 字数不足 700")
    return paragraphs, [fact], embed_words


def write_reading(path, topic, level, kind_hint, title_tpl, slots, summary_tpl, paragraphs, embed_words, questions):
    title_en, title_zh = E.fill_slots(title_tpl[0], title_tpl[1], slots)
    summary = E.fill_slots("x", summary_tpl, slots)[1]
    lines = [
        f"# title\t{E.clean(title_zh)}({E.clean(title_en)})",
        f"# topic\t{topic['topic']}",
        f"# summary\t{E.clean(summary)}",
        f"# level\t{level}",
    ]
    lines += [f"# para\t{p}" for p in paragraphs]
    lines += [f"# glossary\t{w['term']}\t{E.clean(E.short_meaning(w['meaning'], 24))}" for w in embed_words]
    lines += ["\t".join(q) for q in questions]
    out("reading", path, lines)


def gen_reading():
    module_dir = TSV / "reading" / "l2"
    seqs = E.existing_seqs(module_dir, "r2-")
    seq = E.next_seq(seqs)
    for level, count in READING_NEW.items():
        for n in range(count):
            topic = R.TOPICS[n % len(R.TOPICS)]
            aid = E.make_id("r2-", seq)
            rng = random.Random(aid)
            slots = build_slots(rng, topic)
            layout = R.READING_LAYOUT[level]
            paragraphs, facts, embed_words = compose_l2(
                rng, topic, slots, level, layout["embeds"], layout["facts"], layout["paras"])
            questions = [gist_question(rng, topic)]
            questions += [fact_question(rng, f, slots) for f in facts]
            questions.append(vocab_question(rng, rng.choice(embed_words), "文中"))
            if level == "B1":
                q, correct, wrongs = topic["infer"]
                questions.append(E.make_question(q, correct, list(wrongs),
                                                 f"文中整体基调积极,可推断:{correct}。", rng))
            if not 3 <= len(questions) <= 8:
                raise RuntimeError(f"{aid} 题数越界:{len(questions)}")
            summary_tpl = READING_SUMMARIES[level].replace("{topic}", topic["topic"]).replace("{level}", level)
            write_reading(module_dir / f"{aid}.tsv", topic, level, None, rng.choice(READING_TITLES[level]),
                          slots, summary_tpl, paragraphs, embed_words, questions)
            seq += 1
        print(f"阅读 l2 {level}:新增 {count} 篇")

    module_dir = TSV / "reading" / "l3"
    seqs = E.existing_seqs(module_dir, "r3-")
    seq = E.next_seq(seqs)
    for n in range(READING_L3_NEW):
        topic = R.TOPICS[n % len(R.TOPICS)]
        aid = E.make_id("r3-", seq)
        rng = random.Random(aid)
        slots = build_slots(rng, topic)
        paragraphs, facts, embed_words = compose_b2(rng, topic, slots, 36)
        questions = [gist_question(rng, topic)]
        questions += [fact_question(rng, f, slots) for f in facts]
        for v in rng.sample(embed_words, 4):
            questions.append(vocab_question(rng, v, "文中"))
        q, correct, wrongs = topic["infer"]
        questions.append(E.make_question(q, correct, list(wrongs),
                                         f"作者整体论证理性积极,可推断:{correct}。", rng))
        q, correct, wrongs = topic["purpose"]
        questions.append(E.make_question(q, correct, list(wrongs),
                                         f"议论文常见目的:{correct}。", rng))
        if not 3 <= len(questions) <= 8:
            raise RuntimeError(f"{aid} 题数越界:{len(questions)}")
        summary_tpl = READING_SUMMARIES["B2"].replace("{topic}", topic["topic"])
        write_reading(module_dir / f"{aid}.tsv", topic, "B2", None, rng.choice(READING_TITLES["B2"]),
                      slots, summary_tpl, paragraphs, embed_words, questions)
        seq += 1
    print(f"阅读 l3 B2:新增 {READING_L3_NEW} 篇")


# ───────────────────────── 听力 ─────────────────────────

POOLS = {
    "A1": (LF.A1_OPENERS, LF.A1_QUESTIONS, LF.A1_FACTS, LF.A1_RESPONSES, LF.A1_CLOSERS),
    "A2": (LF.A2_OPENERS, LF.A2_QUESTIONS, LF.A2_FACTS, LF.A2_RESPONSES, LF.A2_CLOSERS),
    "B1": (LF.B1_OPENERS, LF.B1_QUESTIONS, LF.B1_FACTS, LF.B1_RESPONSES, LF.B1_CLOSERS),
}
MONO_FILLERS = {"A1": R.A1_FILLERS, "A2": R.A2_FILLERS, "B1": R.B1_FILLERS}


def compose_lines(rng, level, kind, slots, layout):
    """返回 (双语句子列表, 用于出题的事实句列表)。"""
    openers, questions_pool, facts_pool, responses, closers = POOLS[level]
    if kind == "dialogue":
        facts = rng.sample(facts_pool, layout["facts"])
        tpls = [rng.choice(openers), rng.choice(questions_pool)] + list(facts) + [rng.choice(responses)]
        filler_bank = MONO_FILLERS[level]
        while len(tpls) + layout["embeds"] < layout["lines"] - 1:
            tpls.append(rng.choice(filler_bank))
        tpls.append(rng.choice(closers))
    else:
        facts = rng.sample(facts_pool, layout["facts"])
        n_filler = min(len(MONO_FILLERS[level]), layout["lines"] - layout["facts"] - layout["embeds"])
        tpls = list(facts) + rng.sample(MONO_FILLERS[level], max(n_filler, 1))
        rng.shuffle(tpls)
    lines = []
    for t in tpls:
        en, zh = E.fill_slots(t[0], t[1], slots)
        lines.append([E.clean(E.cap(en)), E.clean(zh)])
    return lines, facts


def gen_one_listening(module_dir, prefix, seq, topic, level, idx):
    iid = E.make_id(prefix, seq)
    rng = random.Random(iid)
    slots = build_slots(rng, topic)
    layout = LF.LISTENING_LAYOUT[level]
    kind = "dialogue" if idx % 3 != 2 else "monologue"
    embed_words = pick_embeds(rng, topic["tags"], level, layout["embeds"])
    lines, facts = compose_lines(rng, level, kind, slots, layout)
    embed_lines = [[E.clean(E.embed_sentence(w, rng)), E.clean(w["zh"])] for w in embed_words]
    if kind == "dialogue":
        insert_at = max(1, len(lines) - 1)
        lines = lines[:insert_at] + embed_lines + lines[insert_at:]
    else:
        lines = lines + embed_lines
    if not 3 <= len(lines) <= 10:
        raise RuntimeError(f"{iid} 句数越界:{len(lines)}")
    questions = [gist_question(rng, topic, "这段")]
    questions += [fact_question(rng, f, slots) for f in facts[:2]]
    if layout["questions"] >= 4:
        questions.append(vocab_question(rng, embed_words[0], "听力材料中"))
    if level == "B1":
        q, correct, wrongs = topic["infer"]
        questions.append(E.make_question(q, correct, list(wrongs),
                                         f"材料整体基调积极,可推断:{correct}。", rng))
    if not 3 <= len(questions) <= 5:
        raise RuntimeError(f"{iid} 题数越界:{len(questions)}")
    title_bank = LF.TITLES[level] if kind == "dialogue" else LF.MONOLOGUE_TITLES[level]
    title_en, title_zh = E.fill_slots(*rng.choice(title_bank), slots)
    summary = E.fill_slots("x", LF.SUMMARIES[level][kind].replace("{topic_noun_zh}", topic["noun"][1]), slots)[1]
    tsv = [
        f"# title\t{E.clean(title_zh)}({E.clean(title_en)})",
        f"# topic\t{topic['topic']}",
        f"# summary\t{E.clean(summary)}",
        f"# level\t{level}",
        f"# type\t{kind}",
    ]
    tsv += [f"# s\t{en}\t{zh}" for en, zh in lines]
    tsv += ["\t".join(q) for q in questions]
    out("listening", module_dir / f"{iid}.tsv", tsv)


def gen_listening():
    module_dir = TSV / "listening" / "l1"
    seqs = E.existing_seqs(module_dir, "ls1-")
    seq = E.next_seq(seqs)
    for n in range(LISTENING_L1_NEW):
        topic = R.TOPICS[n % len(R.TOPICS)]
        level = "A1" if n % 2 == 0 else "A2"
        gen_one_listening(module_dir, "ls1-", seq, topic, level, n)
        seq += 1
    print(f"听力 l1:新增 {LISTENING_L1_NEW} 篇(A1/A2 各半,对话:独白 = 2:1)")

    module_dir = TSV / "listening" / "l2"
    seqs = E.existing_seqs(module_dir, "ls2-")
    seq = E.next_seq(seqs)
    for n in range(LISTENING_L2_NEW):
        topic = R.TOPICS[n % len(R.TOPICS)]
        gen_one_listening(module_dir, "ls2-", seq, topic, "B1", n)
        seq += 1
    print(f"听力 l2:新增 {LISTENING_L2_NEW} 篇(B1)")


def main():
    gen_grammar()
    gen_reading()
    gen_listening()
    print(f"完成:语法 {COUNTS['grammar']} 课,阅读 {COUNTS['reading']} 篇,听力 {COUNTS['listening']} 篇(dry-run={DRY})")


if __name__ == "__main__":
    main()
