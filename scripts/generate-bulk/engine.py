# -*- coding: utf-8 -*-
"""Bulk content generation engine: deterministic seeded generation of grammar/reading/listening TSVs.

Raw material strategy:
- All filler slots (names, cities, foods...) come from curated bilingual banks -> sentences are natural.
- Reading/listening embed real vocabulary example sentences (public/data/vocab/*.json),
  and the embedded words form the glossary -> the "glossary terms are in the vocabulary" gate holds naturally.
- Deterministic random numbers (seeded by item id), content stays consistent across repeated runs.

Output follows the TSV contract of scripts/build-content/build.mjs (do not include tabs/newlines/'|' inside cells).
"""

import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VOCAB_JSON = {s: ROOT / f"public/data/vocab/stage{s}.json" for s in (1, 2, 3)}
TSV_ROOT = ROOT / "scripts/build-content"

SLOT_RE = re.compile(r"\{(\w+)\}")


def clean(text):
    """TSV cells forbid tab/newline/'|': normalize them away."""
    return str(text).replace("\t", " ").replace("\n", " ").replace("\r", " ").replace("|", "/").strip()


def short_meaning(meaning, limit=18):
    """Take the first sense of a Chinese definition and compress it for use as a multiple-choice option."""
    first = re.split(r"[;;]", meaning)[0].strip()
    if len(first) > limit:
        cut = first[:limit]
        for sep in ("的", ",", ","):
            if sep in cut:
                cut = cut[: cut.rindex(sep)]
        first = cut
    return clean(first) or clean(meaning)[:limit]

# ---------- Bilingual filler banks: {slot} -> English, {slot_zh} -> Chinese, same index ----------

def _bank(*pairs):
    return {"en": [p[0] for p in pairs], "zh": [p[1] for p in pairs]}

BANKS = {
    "name": _bank(("Amy", "艾米"), ("Ben", "本"), ("Lily", "莉莉"), ("Tom", "汤姆"), ("Kate", "凯特"),
                  ("Leo", "利奥"), ("Mia", "米娅"), ("Sam", "山姆"), ("Eva", "伊娃"), ("Max", "马克斯"),
                  ("Nina", "妮娜"), ("Jack", "杰克"), ("Anna", "安娜"), ("David", "大卫"),
                  ("Grace", "格蕾丝"), ("Owen", "欧文")),
    "sport": _bank(("tennis", "网球"), ("basketball", "篮球"), ("football", "足球"), ("table tennis", "乒乓球"),
                   ("badminton", "羽毛球"), ("volleyball", "排球"), ("baseball", "棒球"), ("chess", "国际象棋")),
    "food": _bank(("noodles", "面条"), ("dumplings", "饺子"), ("rice", "米饭"), ("bread", "面包"),
                  ("fish", "鱼"), ("chicken", "鸡肉"), ("salad", "沙拉"), ("soup", "汤")),
    "drink": _bank(("tea", "茶"), ("milk", "牛奶"), ("coffee", "咖啡"), ("juice", "果汁"), ("water", "水")),
    "place": _bank(("the park", "公园"), ("the library", "图书馆"), ("the museum", "博物馆"), ("the zoo", "动物园"),
                   ("the supermarket", "超市"), ("the cinema", "电影院"), ("the gym", "健身房"), ("the bookstore", "书店")),
    "subject": _bank(("math", "数学"), ("English", "英语"), ("history", "历史"), ("art", "美术"),
                     ("music", "音乐"), ("science", "科学")),
    "color": _bank(("red", "红色"), ("blue", "蓝色"), ("green", "绿色"), ("yellow", "黄色"),
                   ("white", "白色"), ("black", "黑色")),
    "city": _bank(("Chengdu", "成都"), ("London", "伦敦"), ("Paris", "巴黎"), ("Tokyo", "东京"),
                  ("Sydney", "悉尼"), ("Rome", "罗马"), ("Toronto", "多伦多"), ("Xi'an", "西安")),
    "month": _bank(("January", "一月"), ("February", "二月"), ("March", "三月"), ("April", "四月"),
                   ("May", "五月"), ("June", "六月"), ("July", "七月"), ("August", "八月"),
                   ("September", "九月"), ("October", "十月"), ("November", "十一月"), ("December", "十二月")),
    "weekday": _bank(("Monday", "星期一"), ("Tuesday", "星期二"), ("Wednesday", "星期三"), ("Thursday", "星期四"),
                     ("Friday", "星期五"), ("Saturday", "星期六"), ("Sunday", "星期日")),
    "season": _bank(("spring", "春天"), ("summer", "夏天"), ("autumn", "秋天"), ("winter", "冬天")),
    "weather": _bank(("sunny", "晴天"), ("rainy", "雨天"), ("windy", "刮风"), ("cloudy", "多云"), ("snowy", "下雪")),
    "job": _bank(("teacher", "老师"), ("doctor", "医生"), ("nurse", "护士"), ("driver", "司机"),
                 ("cook", "厨师"), ("engineer", "工程师")),
    "animal": _bank(("dog", "狗"), ("cat", "猫"), ("panda", "熊猫"), ("rabbit", "兔子"),
                    ("bird", "鸟"), ("elephant", "大象")),
    "hobby": _bank(("reading", "阅读"), ("swimming", "游泳"), ("drawing", "画画"), ("singing", "唱歌"),
                   ("dancing", "跳舞"), ("cooking", "做饭")),
    "clothes": _bank(("a T-shirt", "一件T恤"), ("a coat", "一件外套"), ("a dress", "一条连衣裙"),
                     ("a hat", "一顶帽子"), ("a sweater", "一件毛衣"), ("a pair of shoes", "一双鞋")),
}

MONTH_EN = BANKS["month"]["en"]


def fill_template(en_tpl, zh_tpl, rng):
    """Fill {slot}/{slot_zh} placeholders with the same bank index to guarantee consistency between Chinese and English.

    The same slot appearing multiple times within one template takes the same value (mapping memoization).
    """
    mapping = {}

    def repl(match):
        key = match.group(1)
        base = key[:-3] if key.endswith("_zh") else key
        if base in mapping:
            return mapping[base][1] if key.endswith("_zh") else mapping[base][0]
        bank = BANKS.get(base)
        if bank is None:
            raise KeyError(f"Unknown slot: {{{key}}} (template: {en_tpl})")
        idx = rng.randrange(len(bank["en"]))
        mapping[base] = (bank["en"][idx], bank["zh"][idx])
        return mapping[base][1] if key.endswith("_zh") else mapping[base][0]

    en = SLOT_RE.sub(repl, en_tpl)
    zh = SLOT_RE.sub(repl, zh_tpl) if zh_tpl else ""
    return en, zh


def article_slots(rng):
    """Randomly draw a set of fixed filler values for one article: all slots within the same article keep consistent person/thing (friend differs from name)."""
    slots = {}
    for key, bank in BANKS.items():
        idx = rng.randrange(len(bank["en"]))
        slots[key] = (bank["en"][idx], bank["zh"][idx])
    name_en = slots["name"][0]
    while True:
        idx = rng.randrange(len(BANKS["name"]["en"]))
        if BANKS["name"]["en"][idx] != name_en:
            slots["friend"] = (BANKS["name"]["en"][idx], BANKS["name"]["zh"][idx])
            break
    return slots


def fill_slots(en_tpl, zh_tpl, slots):
    """Fill a template using a pre-drawn article_slots (same facts between paragraph and question)."""

    def repl(match):
        key = match.group(1)
        base = key[:-3] if key.endswith("_zh") else key
        pair = slots.get(base)
        if pair is None:
            raise KeyError(f"Slot not yet drawn: {{{key}}} (template: {en_tpl})")
        return pair[1] if key.endswith("_zh") else pair[0]

    en = SLOT_RE.sub(repl, en_tpl)
    zh = SLOT_RE.sub(repl, zh_tpl) if zh_tpl else ""
    return en, zh


def bank_distractors(bank_key, correct_zh, n, rng):
    """Draw n Chinese distractors from a bank (not equal to the correct option)."""
    bank = BANKS[bank_key]["zh"]
    pool = [z for z in bank if z != correct_zh]
    return rng.sample(pool, n)


def cap(sentence):
    """Capitalize the first letter of a sentence (filler slots like {kw1} may produce lowercase sentence starts)."""
    s = sentence.strip()
    return s[0].upper() + s[1:] if s and s[0].islower() else s


def swap_target(sentence, old, new):
    """Whole-word replace the first old (letters/digits/_/' are not allowed on both sides as word boundaries); return None if no match.

    Directly using str.replace would corrupt substrings like "is" inside "This".
    """
    i = sentence.find(old)
    while i != -1:
        j = i + len(old)
        before_ok = i == 0 or not (sentence[i - 1].isalnum() or sentence[i - 1] in "'_")
        after_ok = j >= len(sentence) or not (sentence[j].isalnum() or sentence[j] in "'_")
        if before_ok and after_ok:
            return sentence[:i] + new + sentence[j:]
        i = sentence.find(old, i + 1)
    return None


# ---------- Vocabulary embedding (reading/listening shared) ----------

_vocab_words = None


def load_vocab():
    global _vocab_words
    if _vocab_words is None:
        words = []
        for s in (1, 2, 3):
            data = json.loads(VOCAB_JSON[s].read_text(encoding="utf-8"))
            words.extend(data)
        _vocab_words = words
    return _vocab_words


def vocab_pool(tags, max_stage, max_level):
    """Words filtered by topic tags / year / difficulty level; each entry (term, meaning, en, zh, level)."""
    level_rank = {"A1": 1, "A2": 2, "B1": 3, "B2": 4}
    out = []
    for w in load_vocab():
        if w["stage"] > max_stage:
            continue
        if level_rank[w["level"]] > level_rank[max_level]:
            continue
        if not (set(w["tags"]) & set(tags)):
            continue
        ex = w["examples"][0]
        out.append({"term": w["term"], "meaning": w["meaning"], "en": ex["en"], "zh": ex["zh"],
                    "level": w["level"], "stage": w["stage"]})
    return out


CONNECTORS = ["Also, ", "In fact, ", "For example, ", "What's more, ", "Best of all, "]


def embed_sentence(word, rng, connect=True):
    """Use the vocabulary example sentence as the embedded sentence in the text; optionally add a connective."""
    s = word["en"].strip()
    if connect and rng.random() < 0.6:
        c = rng.choice(CONNECTORS)
        if s.startswith("I ") or s.startswith("I'"):
            return c + s
        return c + s[0].lower() + s[1:]
    return s


# ---------- Question construction ----------

def make_question(prompt, correct, wrongs, explanation, rng):
    """Return TSV question row: [prompt, opt1|opt2|…, answer index starting from 1, explanation]."""
    wrongs = [w for w in wrongs if w and w != correct]
    options = [correct] + wrongs
    if len(set(options)) != len(options):
        raise AssertionError(f"Repeated options: {options} ({prompt})")
    for c in [prompt, explanation, *options]:
        if "\t" in c or "\n" in c or "|" in c:
            raise AssertionError(f"Illegal character in cell: {c!r}")
    rng.shuffle(options)
    ans = options.index(correct) + 1
    return [prompt, "|".join(options), str(ans), explanation]


def write_tsv(path, lines):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------- Existing id scanning (append-only, protect existing content/progress) ----------

def existing_seqs(module_dir, prefix):
    """Scan the numeric sequence section of existing TSV ids in a directory (the part after the stage prefix)."""
    seqs = set()
    if not module_dir.exists():
        return seqs
    for f in module_dir.glob("*.tsv"):
        stem = f.stem
        if not stem.startswith(prefix):
            raise RuntimeError(f"Unexpected file name: {f}")
        num = stem[len(prefix):]
        seqs.add(int(num))
    return seqs


def next_seq(seqs, start=1):
    n = start
    while n in seqs:
        n += 1
    return n


def make_id(stem_prefix, seq):
    """ids zero-padded to three digits, naturally four digits after exceeding 999: g-1023 / r2-3250 / ls1-1432."""
    return f"{stem_prefix}{seq:03d}" if seq < 1000 else f"{stem_prefix}{seq}"
