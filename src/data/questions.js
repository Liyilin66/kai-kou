export const questions = {
  RA: [],

  RS: [
    { id: "RS_001", content: "The conference has been postponed until further notice due to unforeseen circumstances.", difficulty: 2 },
    { id: "RS_002", content: "Students are required to submit their assignments before the end of the semester.", difficulty: 1 },
    {
      id: "RS_003",
      content: "The research findings suggest a strong correlation between regular exercise and improved mental health outcomes.",
      difficulty: 3
    },
    {
      id: "RS_004",
      content: "All library books must be returned within two weeks or a late fee will be charged to your account.",
      difficulty: 1
    },
    { id: "RS_005", content: "The government announced a new policy to address the rising cost of living in major cities.", difficulty: 2 },
    {
      id: "RS_006",
      content: "Please make sure you have read all the course materials before attending the tutorial session.",
      difficulty: 1
    },
    { id: "RS_007", content: "The experiment demonstrated that temperature significantly affects the rate of chemical reactions.", difficulty: 2 },
    {
      id: "RS_008",
      content: "International students must provide evidence of sufficient funds to cover their tuition and living expenses.",
      difficulty: 2
    },
    {
      id: "RS_009",
      content: "The professor asked the class to consider the ethical implications of artificial intelligence in healthcare.",
      difficulty: 3
    },
    { id: "RS_010", content: "Vaccination programmes have been highly effective in reducing the spread of infectious diseases worldwide.", difficulty: 2 },
    {
      id: "RS_011",
      content: "The university library will be closed for maintenance this weekend and will reopen on Monday morning.",
      difficulty: 1
    },
    {
      id: "RS_012",
      content: "Economic growth in emerging markets has slowed considerably due to rising inflation and supply chain disruptions.",
      difficulty: 3
    },
    {
      id: "RS_013",
      content: "Students who wish to appeal their grades must do so within ten working days of receiving their results.",
      difficulty: 2
    },
    {
      id: "RS_014",
      content: "The seminar will focus on strategies for managing stress and maintaining wellbeing during examination periods.",
      difficulty: 2
    },
    {
      id: "RS_015",
      content: "Researchers have discovered a new species of deep sea fish that produces its own bioluminescent light.",
      difficulty: 3
    }
  ],

  RL: [
    {
      id: "RL_001",
      content: "Topic: Social media and mental health. Key points: anxiety link, comparison effect, healthy usage limits.",
      topic: "Social Media and Mental Health",
      imageKeyword: "social media smartphone",
      audioScript:
        "Today's lecture examines the relationship between social media use and mental health, especially among young people. Research shows that excessive social media use is associated with increased anxiety and low mood. One major reason is social comparison, where users compare themselves with carefully edited online highlights. At the same time, social media can provide support communities and access to useful health information. Experts recommend limiting daily social media use and taking regular digital breaks.",
      keyPoints: ["anxiety and low mood", "social comparison", "limit use and take breaks"],
      difficulty: 2
    },
    {
      id: "RL_002",
      content: "Topic: Climate change solutions. Key points: renewable energy, carbon pricing, international cooperation.",
      topic: "Climate Change Solutions",
      imageKeyword: "renewable energy solar wind",
      audioScript:
        "This lecture outlines key strategies for addressing climate change. The first strategy is accelerating the shift to renewable energy, such as wind and solar power. The second strategy is carbon pricing, which gives businesses financial incentives to reduce emissions. The speaker also highlights international cooperation, including climate agreements that set shared targets. Finally, individual actions like reducing waste and choosing public transport can support broader policy efforts.",
      keyPoints: ["renewable energy transition", "carbon pricing", "international agreements", "individual action"],
      difficulty: 2
    },
    {
      id: "RL_003",
      content: "Topic: The history of the internet. Key points: ARPANET, World Wide Web, global impact.",
      topic: "The History of the Internet",
      imageKeyword: "internet network technology",
      audioScript:
        "The internet began as ARPANET in nineteen sixty nine, funded by the United States Department of Defense. In nineteen eighty nine, Tim Berners Lee introduced the World Wide Web, making online information far easier to access. During the nineteen nineties, commercial internet use expanded rapidly and changed communication around the world. Today, billions of people use the internet for study, work, shopping, and entertainment.",
      keyPoints: ["ARPANET in 1969", "World Wide Web in 1989", "commercial growth in the 1990s", "global daily use"],
      difficulty: 1
    },
    {
      id: "RL_004",
      content: "Topic: Urbanisation and city planning. Key points: population growth, pressure on services, sustainable design.",
      topic: "Urbanisation and City Planning",
      imageKeyword: "city skyline urban planning",
      audioScript:
        "Urbanisation is one of the biggest demographic trends of this century. More than half of the global population already lives in cities, and this proportion is expected to rise further by twenty fifty. Rapid growth creates pressure on housing, transport, and public services. Sustainable urban planning includes mixed use development, improved public transport, and greener buildings. These measures help cities stay efficient and liveable.",
      keyPoints: ["more people in cities", "housing and transport pressure", "sustainable planning measures"],
      difficulty: 2
    },
    {
      id: "RL_005",
      content: "Topic: Artificial intelligence in medicine. Key points: imaging, prediction, drug discovery, ethics.",
      topic: "Artificial Intelligence in Medicine",
      imageKeyword: "medical technology AI healthcare",
      audioScript:
        "Artificial intelligence is transforming healthcare in multiple ways. AI systems can analyse medical images and detect patterns that support faster diagnosis. Hospitals also use predictive tools to identify patients at risk of sudden deterioration. In pharmaceutical research, AI helps screen large numbers of compounds and can shorten drug development timelines. However, the lecture stresses that privacy, bias, and human oversight remain essential.",
      keyPoints: ["image analysis", "risk prediction", "faster drug research", "privacy and bias concerns"],
      difficulty: 3
    },
    {
      id: "RL_006",
      content: "Topic: Biodiversity and ecosystems. Key points: ecosystem services, extinction risks, conservation.",
      topic: "Biodiversity and Ecosystems",
      imageKeyword: "rainforest biodiversity nature",
      audioScript:
        "Biodiversity describes the variety of living organisms on Earth. Ecosystems rely on biodiversity to maintain services like pollination, soil fertility, and water purification. Human activity, including habitat loss and pollution, is causing species decline at an alarming rate. The lecturer explains that conservation requires protected areas, restoration programmes, and coordinated international policy.",
      keyPoints: ["what biodiversity means", "ecosystem services", "human driven species loss", "conservation actions"],
      difficulty: 2
    },
    {
      id: "RL_007",
      content: "Topic: Psychology of learning. Key points: spaced repetition, active recall, sleep.",
      topic: "The Psychology of Learning",
      imageKeyword: "education students studying",
      audioScript:
        "Educational psychology identifies several methods that improve long term learning. Spaced repetition helps memory by reviewing material over increasing intervals. Active recall, such as self testing, is more effective than passive rereading. Interleaving topics can also improve flexible understanding, although it feels harder at first. The lecturer adds that sleep is vital because deep sleep supports memory consolidation.",
      keyPoints: ["spaced repetition", "active recall", "interleaving", "sleep and consolidation"],
      difficulty: 2
    },
    {
      id: "RL_008",
      content: "Topic: Global water crisis. Key points: scarcity, agriculture use, technology and policy responses.",
      topic: "Global Water Crisis",
      imageKeyword: "water scarcity drought river",
      audioScript:
        "Fresh water scarcity is becoming a major global challenge. Population growth and climate variability are increasing pressure on limited water supplies, especially in dry regions. Agriculture uses most available fresh water, so improving irrigation efficiency is critical. The lecture also mentions desalination, wastewater recycling, and better governance as practical solutions. Without coordinated action, water insecurity may threaten food systems and economic stability.",
      keyPoints: ["increasing scarcity pressure", "agriculture water demand", "technology and policy solutions"],
      difficulty: 3
    }
  ],

  // WE source is now unified in seeds/we/*.json via src/lib/we-data.js.
  WE: [],

  WFD: []
};

const usedQuestionIdsByTask = new Map();

export function getRandomQuestion(taskType) {
  const list = questions[taskType] || [];
  if (!list.length) return null;

  let usedSet = usedQuestionIdsByTask.get(taskType);
  if (!usedSet) {
    usedSet = new Set();
    usedQuestionIdsByTask.set(taskType, usedSet);
  }

  if (usedSet.size >= list.length) {
    usedSet.clear();
  }

  const available = list.filter((q) => !usedSet.has(q.id));
  const pool = available.length ? available : list;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  usedSet.add(picked.id);
  return picked;
}

export function resetQuestionCycle(taskType) {
  if (!taskType) {
    usedQuestionIdsByTask.clear();
    return;
  }

  usedQuestionIdsByTask.delete(taskType);
}
