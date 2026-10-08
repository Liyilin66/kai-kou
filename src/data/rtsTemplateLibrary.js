export const RTS_TEMPLATE_CATEGORIES = [
  {
    "key": "academic",
    "label": "学业事务",
    "tag": "Academic"
  },
  {
    "key": "daily",
    "label": "日常安排",
    "tag": "Daily"
  },
  {
    "key": "service",
    "label": "服务沟通",
    "tag": "Service"
  },
  {
    "key": "social",
    "label": "社交协作",
    "tag": "Social"
  }
];

export const RTS_TEMPLATE_CATEGORY_ORDER = RTS_TEMPLATE_CATEGORIES.map((item) => item.key);

export const RTS_TEMPLATE_CATEGORY_LABELS = RTS_TEMPLATE_CATEGORIES.reduce((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {});

export const RTS_TEMPLATE_LIBRARY = [
  {
    "id": "RTS_TEMPLATE_001",
    "serial": 1,
    "category": "academic",
    "categoryLabel": "学业事务",
    "title": "向教授申请延期交作业",
    "content": "Hello Professor [Name]. I am writing to tell you that I cannot finish my [paper/assignment] by next week. My computer suddenly broke down yesterday and I lost some of my files. Could you please give me a few more days to finish it? I promise to work hard. Thank you."
  },
  {
    "id": "RTS_TEMPLATE_002",
    "serial": 2,
    "category": "academic",
    "categoryLabel": "学业事务",
    "title": "错过课程向同学借笔记",
    "content": "Hi [Name], how are you doing? I missed the class this morning because I was feeling really sick and had to go to the hospital. I know you always take very good notes. Would you mind lending your notebook to me? I will return it to you as soon as I finish copying."
  },
  {
    "id": "RTS_TEMPLATE_003",
    "serial": 3,
    "category": "academic",
    "categoryLabel": "学业事务",
    "title": "向老师请教不懂的问题",
    "content": "Excuse me, Mr./Ms. [Name]. Do you have a free minute? I was reading the book you gave us, but I don't really understand the part about [the history project]. It seems a bit too difficult for me. Could you please explain it to me again when you have time? Thank you so much."
  },
  {
    "id": "RTS_TEMPLATE_004",
    "serial": 4,
    "category": "academic",
    "categoryLabel": "学业事务",
    "title": "告知老师突发状况无法上课/开会",
    "content": "Hello Mr./Ms. [Name], I am so sorry to bother you. I was on my way to our meeting, but there is a big traffic jam right now. I think I will be late for about twenty minutes. Could we maybe change our meeting to tomorrow afternoon? I am really sorry for the trouble."
  },
  {
    "id": "RTS_TEMPLATE_005",
    "serial": 5,
    "category": "academic",
    "categoryLabel": "学业事务",
    "title": "建议同学退课或寻求老师帮助",
    "content": "Hey [Name], I heard you want to take [the math course]. To be honest, I took it last year and it was super difficult. You have to spend lots of time on it. I strongly suggest you go and talk to the teacher first before you make the decision. It is better to be careful."
  },
  {
    "id": "RTS_TEMPLATE_006",
    "serial": 6,
    "category": "academic",
    "categoryLabel": "学业事务",
    "title": "向导师请求作业反馈",
    "content": "Hello Professor [Name], I hope you have a good day. I just finished writing my assignment and I have checked it twice. However, I am still not very sure about my writing. If you are not too busy, could you please read it and give me some advice? I really want to get a good grade."
  },
  {
    "id": "RTS_TEMPLATE_007",
    "serial": 7,
    "category": "academic",
    "categoryLabel": "学业事务",
    "title": "通知同学换教室（突发情况）",
    "content": "Hi [Name], this is [Your Name]. Are you still on your way to school? I just arrived at our usual classroom, but there is a notice on the door. It says the computer is broken, so we need to move to [Room 302]. Please come to the new room directly. See you soon!"
  },
  {
    "id": "RTS_TEMPLATE_008",
    "serial": 8,
    "category": "academic",
    "categoryLabel": "学业事务",
    "title": "小组讨论忘带东西",
    "content": "Hi everyone, I am so sorry for making you wait. We are supposed to start working on our group project now, but I just realized I left my laptop at home. I live very close to the school. Please give me ten minutes to go back and get it. I will run as fast as I can!"
  },
  {
    "id": "RTS_TEMPLATE_009",
    "serial": 9,
    "category": "academic",
    "categoryLabel": "学业事务",
    "title": "上课迟到打断说明情况",
    "content": "Excuse me, Professor. I am really sorry for interrupting your class. I left my notebook at home and I had to go back to get it, so I am late for my speech. Can I please do my presentation at the end of the class? I am fully prepared and I promise it won't happen again."
  },
  {
    "id": "RTS_TEMPLATE_010",
    "serial": 10,
    "category": "academic",
    "categoryLabel": "学业事务",
    "title": "询问选课或学校项目建议",
    "content": "Hello Professor, I saw the poster about the [holiday research project] and I am very interested in it. I really want to join your team. Could you please tell me when exactly the project starts? Also, do I need to travel to other cities? I want to make sure I have enough time for it."
  },
  {
    "id": "RTS_TEMPLATE_011",
    "serial": 11,
    "category": "daily",
    "categoryLabel": "日常安排",
    "title": "路上遇阻导致迟到",
    "content": "Hi [Name], I am calling to say sorry. I am on my way to [the cinema], but a big tree just fell down and blocked the road. The police are trying to clear it now. I might be half an hour late. Could you please wait for me at the coffee shop nearby? I will be there soon."
  },
  {
    "id": "RTS_TEMPLATE_012",
    "serial": 12,
    "category": "daily",
    "categoryLabel": "日常安排",
    "title": "临时改变约会时间",
    "content": "Hey [Name], we are supposed to study together this Saturday, right? But my teacher just told me I have to attend an important meeting on that day. I cannot miss it. Is it possible for us to change our study time to Friday afternoon instead? Please let me know if that is okay for you."
  },
  {
    "id": "RTS_TEMPLATE_013",
    "serial": 13,
    "category": "daily",
    "categoryLabel": "日常安排",
    "title": "更正之前说错的时间",
    "content": "Hi [Name], it is me again. I am calling because I made a stupid mistake just now. I told you our exam is at three o'clock tomorrow. But I checked my email again, and it is actually at two o'clock this afternoon! Please hurry up and get ready. I am so sorry for the wrong information."
  },
  {
    "id": "RTS_TEMPLATE_014",
    "serial": 14,
    "category": "daily",
    "categoryLabel": "日常安排",
    "title": "场地被占，提议换地方",
    "content": "Hey [Name], bad news. I just arrived at the library, but the study room we booked is already taken by other students. They said the school made a mistake. It is too noisy here anyway. Why don't we go to the cafe next to the school? The coffee there is great and it is very quiet."
  },
  {
    "id": "RTS_TEMPLATE_015",
    "serial": 15,
    "category": "daily",
    "categoryLabel": "日常安排",
    "title": "询问派对/活动的具体安排",
    "content": "Hi [Name], I am so excited about the class party this weekend. I know you are the one preparing the food. I want to help you because you must be very busy. What can I buy for you from the supermarket? Also, what time should I arrive at your house? I want to be there early to help."
  },
  {
    "id": "RTS_TEMPLATE_016",
    "serial": 16,
    "category": "daily",
    "categoryLabel": "日常安排",
    "title": "提醒室友打扫卫生/做家务",
    "content": "Hey [Name], do you have a minute? I want to talk about our cleaning schedule. It is your turn to clean the living room this week, but it is still quite dirty. I know you are busy with your exams, but we all need to keep the house clean. Could you please clean it tonight? Thanks."
  },
  {
    "id": "RTS_TEMPLATE_017",
    "serial": 17,
    "category": "daily",
    "categoryLabel": "日常安排",
    "title": "无法赴约，礼貌取消",
    "content": "Hi [Name], thank you so much for inviting me to your birthday party. I really want to come and celebrate with you. But unfortunately, my computer was broken yesterday and I have a very important paper to finish this weekend. I really don't have the time. I hope you have a great party, and happy birthday!"
  },
  {
    "id": "RTS_TEMPLATE_018",
    "serial": 18,
    "category": "daily",
    "categoryLabel": "日常安排",
    "title": "出门忘带钥匙求助",
    "content": "Hello, is this the school management team? This is [Your Name] from Room [number]. I am calling for help. I walked out of my room just now but I forgot to bring my keys. The door is locked and my roommate is not here. Could you please send someone to open the door for me? Thank you."
  },
  {
    "id": "RTS_TEMPLATE_019",
    "serial": 19,
    "category": "daily",
    "categoryLabel": "日常安排",
    "title": "给别人留便签说明安排",
    "content": "Hi [Name], I came to your room but you were out. I am leaving this note to say a big thank you for agreeing to do the interview for my course. The interview will be on Wednesday afternoon at 3 PM, and it will only take about one hour. See you then and thanks again!"
  },
  {
    "id": "RTS_TEMPLATE_020",
    "serial": 20,
    "category": "daily",
    "categoryLabel": "日常安排",
    "title": "提醒朋友带必需品",
    "content": "Hey [Name], we are going hiking this weekend, and I am so excited! But I remember you only have running shoes. The mountain road can be very dangerous. You really need to wear proper hiking boots so you won't get hurt. Let's go to the store and buy a pair tomorrow afternoon, okay?"
  },
  {
    "id": "RTS_TEMPLATE_021",
    "serial": 21,
    "category": "service",
    "categoryLabel": "服务沟通",
    "title": "报告设备损坏寻求帮助（图书馆/打印店）",
    "content": "Excuse me, I need some help here. I am trying to copy some important papers for my class, but this machine is not working at all. There is a red light flashing next to the button. Could you please come and check it for me? Or can I use another machine? Thank you very much."
  },
  {
    "id": "RTS_TEMPLATE_022",
    "serial": 22,
    "category": "service",
    "categoryLabel": "服务沟通",
    "title": "手机没电无法验票解释情况",
    "content": "Hello sir. I am very sorry, but my phone just died completely. I bought two tickets online yesterday, and the electronic tickets are saved in my phone. I have my ID card with me right now. Can you please check my name in your computer system? I can prove that I already paid."
  },
  {
    "id": "RTS_TEMPLATE_023",
    "serial": 23,
    "category": "service",
    "categoryLabel": "服务沟通",
    "title": "归还破损书籍说明情况",
    "content": "Hi, I am here to return this book. But I need to tell you something first. When I opened the book yesterday, I found that two pages in the middle were already torn out. I promise I did not do it. I just want to tell you this so I won't be charged for the damage."
  },
  {
    "id": "RTS_TEMPLATE_024",
    "serial": 24,
    "category": "service",
    "categoryLabel": "服务沟通",
    "title": "询问兼职工作详细信息",
    "content": "Hello, I am a student here. I saw your advertisement on the wall for a part-time job in the cafeteria. I am very interested in it because I need some extra money. Could you please tell me how many hours I need to work every week? And what exactly do I need to do? Thank you."
  },
  {
    "id": "RTS_TEMPLATE_025",
    "serial": 25,
    "category": "service",
    "categoryLabel": "服务沟通",
    "title": "向学校食堂提建议改进食物",
    "content": "Hello, I am writing to give some advice about our school cafeteria. To be honest, I think the food here is not healthy enough. We have too much fried chicken and sweet drinks. I suggest you cook more green vegetables and offer some fresh fruits. This will be much better for students' health."
  },
  {
    "id": "RTS_TEMPLATE_026",
    "serial": 26,
    "category": "service",
    "categoryLabel": "服务沟通",
    "title": "报告宿舍/校园墙壁或设施损坏",
    "content": "Hello, I am calling to report a problem. I saw the notice asking students to report broken things. I just walked past the library, and I noticed that the wall at the corner is badly damaged. The bricks are falling off and it looks quite dangerous. You might need to send someone to fix it soon."
  },
  {
    "id": "RTS_TEMPLATE_027",
    "serial": 27,
    "category": "service",
    "categoryLabel": "服务沟通",
    "title": "东西忘在某处请求保管",
    "content": "Hello, is this the library front desk? I am calling because I just went home, but I suddenly realized I left my black winter coat on the chair on the second floor. It is very cold outside. Could you please help me find it and keep it safe for me? I will come and get it tomorrow morning."
  },
  {
    "id": "RTS_TEMPLATE_028",
    "serial": 28,
    "category": "service",
    "categoryLabel": "服务沟通",
    "title": "图书丢失询问解决办法",
    "content": "Excuse me, I have a problem and I hope you can help me. I borrowed a history book from here last month, but I cannot find it anywhere in my house. I think I have lost it. I am very sorry for my mistake. Could you please tell me how much I need to pay for a new one?"
  },
  {
    "id": "RTS_TEMPLATE_029",
    "serial": 29,
    "category": "service",
    "categoryLabel": "服务沟通",
    "title": "住宿费交不起请求宽限",
    "content": "Hello sir, I am here to ask for your help. I applied for a bank loan to pay my room fee, but the money will arrive very late. I only have a little money from my part-time job now, so I cannot pay you all at once. Could I please pay half of it first and give you the rest next month?"
  },
  {
    "id": "RTS_TEMPLATE_030",
    "serial": 30,
    "category": "service",
    "categoryLabel": "服务沟通",
    "title": "向市政/后勤报告交通灯坏了",
    "content": "Hello, is this the road maintenance team? I am calling to report a problem on my way to school. The red traffic light at the corner of Main Street is completely broken. Cars are moving very fast and it is super dangerous for people to cross the street. Please send someone to fix it as quickly as possible."
  },
  {
    "id": "RTS_TEMPLATE_031",
    "serial": 31,
    "category": "social",
    "categoryLabel": "社交协作",
    "title": "礼貌提醒邻居/室友太吵",
    "content": "Hi [Name], I am really sorry to bother you at night. Your music sounds great, but it is a bit too loud for me. I have a very important exam early tomorrow morning, and I really need to get some good sleep. Could you please turn down the volume just a little bit? Thank you for understanding."
  },
  {
    "id": "RTS_TEMPLATE_032",
    "serial": 32,
    "category": "social",
    "categoryLabel": "社交协作",
    "title": "沟通室友偷吃东西/乱拿物品",
    "content": "Hey [Name], can we talk for a minute? I noticed that some of my food in the fridge is missing. Maybe your friends ate it when they visited. I don't mind sharing, but it makes me feel bad when people take my things without asking. Next time, could you please tell me first? Thank you."
  },
  {
    "id": "RTS_TEMPLATE_033",
    "serial": 33,
    "category": "social",
    "categoryLabel": "社交协作",
    "title": "催促小组同伴干活",
    "content": "Hi [Name], I am calling about our group presentation. The teacher is pushing us to hand in the work. I have finished my part, but you haven't sent me your part yet. The deadline is tomorrow. Are you having any trouble with it? Let me know if you need any help, we really need to finish this soon."
  },
  {
    "id": "RTS_TEMPLATE_034",
    "serial": 34,
    "category": "social",
    "categoryLabel": "社交协作",
    "title": "邀请朋友吃饭并询问忌口",
    "content": "Hey [Name], my wife and I are going to hold a dinner party at our house this Saturday evening. We would love to invite you and your wife to come. We are planning to cook some nice dishes. Before we buy the food, is there anything you cannot eat? Please let me know your favorite food too!"
  },
  {
    "id": "RTS_TEMPLATE_035",
    "serial": 35,
    "category": "social",
    "categoryLabel": "社交协作",
    "title": "礼貌拒绝朋友的俱乐部/活动邀请",
    "content": "Hi [Name], thank you so much for asking me to join your sports club. It sounds really interesting and I love playing sports. But to be honest, this is my final year at the university. I have so many classes and papers to finish every day. I really don't have extra time. Maybe next year!"
  },
  {
    "id": "RTS_TEMPLATE_036",
    "serial": 36,
    "category": "social",
    "categoryLabel": "社交协作",
    "title": "安慰将要演讲/考试紧张的朋友",
    "content": "Hey [Name], don't be so worried! I know you are feeling very nervous about your speech today. But trust me, you have practiced it so many times and your English is excellent. Just take a deep breath, speak slowly, and smile to the teacher. I know you will do a great job. Good luck!"
  },
  {
    "id": "RTS_TEMPLATE_037",
    "serial": 37,
    "category": "social",
    "categoryLabel": "社交协作",
    "title": "和朋友商量给别人买礼物",
    "content": "Hi guys, since Mary is moving to a new apartment for college next week, we should buy her a nice present to say goodbye. How about we buy her a beautiful coffee machine? She loves drinking coffee every morning, so I think it will be very useful for her new life. What do you guys think?"
  },
  {
    "id": "RTS_TEMPLATE_038",
    "serial": 38,
    "category": "social",
    "categoryLabel": "社交协作",
    "title": "上课时提醒旁边朋友不要说话",
    "content": "Hey [Name], I am really sorry, but could we please stop talking for a while? The teacher is talking about some very important points for our final exam. I cannot hear him clearly when we are chatting. We can talk about this after the class is over. Thanks for understanding."
  },
  {
    "id": "RTS_TEMPLATE_039",
    "serial": 39,
    "category": "social",
    "categoryLabel": "社交协作",
    "title": "主动帮助受伤的同学",
    "content": "Hi [Name], I heard you hurt your leg yesterday. Are you feeling better now? I noticed you have some library books on your desk. Since it is hard for you to walk, do you want me to return these books for you? I am going to the library this afternoon anyway. Just let me help you."
  },
  {
    "id": "RTS_TEMPLATE_040",
    "serial": 40,
    "category": "social",
    "categoryLabel": "社交协作",
    "title": "忘记带朋友的东西道歉",
    "content": "Hi Tom, I am so sorry. I know you need your book today, but I was in such a hurry this morning that I totally forgot to bring it. It is still on my desk at home. I feel really bad about this. How about I go back and get it for you right after our morning classes? I promise."
  }
];

export const RTS_TEMPLATE_LIBRARY_BY_CATEGORY = RTS_TEMPLATE_CATEGORY_ORDER.reduce((acc, key) => {
  acc[key] = RTS_TEMPLATE_LIBRARY.filter((item) => item.category === key);
  return acc;
}, {});

export const RTS_TEMPLATE_COUNTS = RTS_TEMPLATE_CATEGORY_ORDER.reduce((acc, key) => {
  acc[key] = RTS_TEMPLATE_LIBRARY_BY_CATEGORY[key].length;
  return acc;
}, {});

