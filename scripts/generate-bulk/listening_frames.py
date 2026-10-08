# -*- coding: utf-8 -*-
"""听力素材框架:l1(A1/A2 对话+独白)与 l2(B1 长对话+独白)。

- 对话 = 开场 → 提问 → 事实句(题源)→ 回应 → 收尾;独白复用 reading_frames 的句子池。
- FACT_LINES 与阅读 FACTS 同构:(en, zh, 问句, 答案slot, 干扰bank),句子入料即可出题。
"""

# ---------- A1 对话 ----------

A1_OPENERS = [
    ("Hi, {name}! How are you today?", "嗨,{name_zh}!你今天怎么样?"),
    ("Good morning, {friend}! Nice to see you.", "早上好,{friend_zh}!见到你真高兴。"),
    ("Hello, {name}! What a nice day.", "你好,{name_zh}!天气真好。"),
    ("Hi, {friend}! Are you free now?", "嗨,{friend_zh}!你现在有空吗?"),
]

A1_QUESTIONS = [
    ("What do you like to do after class?", "你课后喜欢做什么?"),
    ("What is your favorite food?", "你最喜欢的食物是什么?"),
    ("Where do you usually go on {weekday}?", "你{weekday_zh}通常去哪里?"),
    ("What is your favorite subject?", "你最喜欢的科目是什么?"),
    ("What do you drink in the morning?", "你早上喝什么?"),
    ("Which city do you want to visit?", "你想去哪座城市看看?"),
]

A1_FACTS = [
    ("I often play {sport} after class.", "我课后经常打{sport_zh}。", "说话者课后经常做什么?", "sport", "sport"),
    ("My favorite food is {food}.", "我最喜欢的食物是{food_zh}。", "说话者最喜欢的食物是什么?", "food", "food"),
    ("I go to {place} every {weekday}.", "我每{weekday_zh}都去{place_zh}。", "说话者每{weekday_zh}去哪里?", "place", "place"),
    ("I like {subject} best.", "我最喜欢{subject_zh}。", "说话者最喜欢什么科目?", "subject", "subject"),
    ("I want to see {city} one day.", "我想有一天去看看{city_zh}。", "说话者想去哪座城市?", "city", "city"),
    ("I drink {drink} every morning.", "我每天早上喝{drink_zh}。", "说话者每天早上喝什么?", "drink", "drink"),
]

A1_RESPONSES = [
    ("That sounds great!", "听起来不错!"),
    ("Really? Tell me more.", "真的吗?多告诉我一些。"),
    ("Me too! I love it.", "我也是!我很喜欢。"),
    ("Wow, you are so good.", "哇,你真棒。"),
    ("I see. That is interesting.", "原来如此,真有趣。"),
]

A1_CLOSERS = [
    ("OK! See you tomorrow!", "好的!明天见!"),
    ("Let us go together next time.", "下次我们一起去吧。"),
    ("Goodbye! Have a nice day!", "再见!祝你今天愉快!"),
    ("Thanks for talking with me!", "谢谢你和我聊天!"),
]

# ---------- A2 对话 ----------

A2_OPENERS = [
    ("Hey {name}, how was your weekend?", "嘿,{name_zh},你周末过得怎么样?"),
    ("Hi {friend}! I did not see you at {kw1} yesterday.", "嗨,{friend_zh}!昨天在{kw1_zh}没看见你。"),
    ("Good afternoon, {name}! You look happy.", "下午好,{name_zh}!你看起来很开心。"),
    ("Hello {friend}, do you have a minute?", "你好{friend_zh},你有时间吗?"),
]

A2_QUESTIONS = [
    ("What did you do last weekend?", "你上周末做了什么?"),
    ("What are you going to do in {month}?", "你{month_zh}打算做什么?"),
    ("What is your plan for the holiday?", "你假期有什么计划?"),
    ("How do you usually spend your evening?", "你通常怎么度过晚上?"),
    ("What is your favorite way to relax?", "你最喜欢的放松方式是什么?"),
]

A2_FACTS = [
    ("I played {sport} with my brother at {place}.", "我和我弟弟在{place_zh}打了{sport_zh}。",
     "说话者上周末在哪里打了{sport_zh}?", "place", "place"),
    ("I am going to visit {city} in {month}.", "我{month_zh}要去看{city_zh}。", "说话者{month_zh}要去哪座城市?", "city", "city"),
    ("I usually have {food} for dinner.", "我晚饭通常吃{food_zh}。", "说话者晚饭通常吃什么?", "food", "food"),
    ("I want to be a {job} when I grow up.", "我长大后想当{job_zh}。", "说话者长大后想做什么?", "job", "job"),
    ("I like {weather} days because I can fly a kite.", "我喜欢{weather_zh}的日子,因为可以放风筝。",
     "说话者喜欢什么样的天气?", "weather", "weather"),
    ("I am learning {subject} hard this term.", "我这学期在努力学{subject_zh}。", "说话者这学期在努力学什么?", "subject", "subject"),
    ("I drink {drink} after running.", "我跑步后喝{drink_zh}。", "说话者跑步后喝什么?", "drink", "drink"),
    ("My favorite animal is the {animal}.", "我最喜欢的动物是{animal_zh}。", "说话者最喜欢的动物是什么?", "animal", "animal"),
]

A2_RESPONSES = [
    ("That sounds like a lot of fun.", "听起来很有意思。"),
    ("Really? I want to try that too.", "真的吗?我也想试试。"),
    ("Great! Maybe I can join you next time.", "太好了!也许下次我能一起去。"),
    ("I did not know that. Thanks for telling me.", "我原来不知道,谢谢你告诉我。"),
    ("Good for you! Keep going.", "真棒!继续加油。"),
]

A2_CLOSERS = [
    ("Anyway, I have to go now. See you!", "总之我现在得走了,再见!"),
    ("Let us talk more after class.", "我们课后再聊吧。"),
    ("Have a good evening, {name}!", "{name_zh},晚上愉快!"),
    ("Good luck with your plan!", "祝你的计划顺利!"),
]

# ---------- B1 长对话 ----------

B1_OPENERS = [
    ("Hi {name}, have you got a minute? I need some advice.", "嗨{name_zh},你有时间吗?我需要一些建议。"),
    ("{friend}, you will not believe what happened at {kw1} today.", "{friend_zh},你绝对想不到今天{kw1_zh}发生了什么。"),
    ("Good to see you, {name}. How is everything going?", "见到你真好,{name_zh}。最近怎么样?"),
    ("Hey {friend}, I have been meaning to ask you about {kw1}.", "嘿{friend_zh},我一直想问你{kw1_zh}的事。"),
]

B1_QUESTIONS = [
    ("What would you do if you were in my shoes?", "如果你处在我的位置,你会怎么做?"),
    ("How do you manage your time between study and hobbies?", "你怎么安排学习和爱好的时间?"),
    ("Do you think it is worth trying?", "你觉得值得试一试吗?"),
    ("What is your plan for the coming holiday?", "接下来的假期你有什么计划?"),
    ("How did you get started with it?", "你是怎么开始做这件事的?"),
]

B1_FACTS = [
    ("I have practiced {sport} for three years, but I still feel nervous before matches.",
     "我练{sport_zh}已经三年,但赛前还是会紧张。", "说话者练了三年的项目是什么?", "sport", "sport"),
    ("I am planning to travel to {city} with my family in {month}.",
     "我打算{month_zh}和家人去{city_zh}旅行。", "说话者{month_zh}要和家人去哪座城市?", "city", "city"),
    ("I usually spend my weekend at {place} reading or taking notes.",
     "我周末通常在{place_zh}阅读或记笔记。", "说话者周末通常在哪里度过?", "place", "place"),
    ("I have just started learning {subject} on my own.",
     "我刚开自学{subject_zh}。", "说话者刚开始学什么?", "subject", "subject"),
    ("My dream is to work as a {job} in the future.",
     "我的梦想是将来当{job_zh}。", "说话者的梦想职业是什么?", "job", "job"),
    ("I usually relax by cooking {food} at home.",
     "我通常在家做{food_zh}来放松。", "说话者通常做什么菜来放松?", "food", "food"),
]

B1_RESPONSES = [
    ("That is a good question. Let me think for a second.", "这个问题很好,让我想一下。"),
    ("I had almost the same problem last year.", "我去年也遇到过几乎一样的问题。"),
    ("To be honest, I believe you can handle it.", "说实话,我相信你能处理好。"),
    ("Maybe you could look at it from another side.", "也许你可以从另一个角度看看。"),
    ("That makes sense. Thanks for sharing.", "有道理,谢谢你分享。"),
]

B1_CLOSERS = [
    ("Anyway, thanks a lot for your advice, {friend}.", "总之,非常感谢你的建议,{friend_zh}。"),
    ("Let us catch up again soon.", "我们回头再聊。"),
    ("I feel much better now. Talk later!", "我现在感觉好多了,回头聊!"),
    ("Wish me luck! I will tell you how it goes.", "祝我好运!我会告诉你结果的。"),
]

# 独白复用 reading_frames 池(main.py 中 import),标题/摘要模板如下
TITLES = {
    "A1": [("A Talk about {kw1}", "关于{kw1_zh}的对话"), ("Chatting with {friend}", "和{friend_zh}聊天"),
           ("My Day at {kw1}", "我在{kw1_zh}的一天")],
    "A2": [("Weekend Plans near {kw1}", "{kw1_zh}附近的周末计划"), ("A Chat about {topic_noun}", "关于{topic_noun_zh}的闲聊"),
           ("Talking about {kw2}", "谈论{kw2_zh}")],
    "B1": [("Discussing {topic_noun}", "讨论{topic_noun_zh}"), ("My View on {topic_noun}", "我对{topic_noun_zh}的看法"),
           ("A Conversation at {kw1}", "在{kw1_zh}的一段对话")],
}

MONOLOGUE_TITLES = {
    "A1": [("My Happy Day", "我开心的一天"), ("Something about Me", "关于我的一些事")],
    "A2": [("My Weekend Story", "我的周末故事"), ("A Small Plan", "一个小计划")],
    "B1": [("My Thoughts on {topic_noun}", "我对{topic_noun_zh}的思考"), ("A Lesson I Learned", "我学到的一课")],
}

SUMMARIES = {
    "A1": dict(dialogue="两人在{kw1_zh}附近聊天,谈到各自的喜好与日常。", monologue="说话者用简单英语介绍自己的一天与喜好。"),
    "A2": dict(dialogue="两人聊起周末安排与各自的计划,交换了想法。", monologue="说话者分享一次经历和接下来的计划。"),
    "B1": dict(dialogue="两人就{topic_noun_zh}深入交流,互相给出建议。", monologue="说话者表达对{topic_noun_zh}的观察与思考。"),
}

# 每级听力参数:总句数(不含/含嵌入)、事实句数、嵌入词库例句数、题数
LISTENING_LAYOUT = {
    "A1": dict(lines=7, facts=2, embeds=1, questions=3),
    "A2": dict(lines=8, facts=2, embeds=2, questions=4),
    "B1": dict(lines=9, facts=3, embeds=2, questions=5),
}
