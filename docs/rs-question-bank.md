# RS 原创题库与语音生成

60 句为本项目自编的校园、教学、研究场景句子，未使用第三方题库或预测数据。`seeds/rs/questions.json` 保存题号、原文、难度和声音。

- 长度档：8–11、12–15、16–20 个按空格分隔的词，每档 20 句。
- 口音：en-US、en-GB、en-AU 各 20 句，神经声音默认语速，REST 输出 16 kHz 单声道 MP3。
- Azure [官方定价](https://azure.microsoft.com/en-us/pricing/details/speech/)（2026-10-09 核实）给出 F0 神经语音每月 500,000 字符免费；[限额](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits)为每 60 秒 20 次，脚本默认逐条间隔 3.2 秒。
- [REST 文档](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech)支持 eastasia；密钥只从本地环境读取，不提交。

```sh
node scripts/rs-build-question-bank.js
node scripts/rs-build-question-bank.js --apply
```

默认 dry-run 不调用合成、上传或写库。`--apply` 使用按题号、原文、声音计算的音频文件名，缓存到忽略目录 `output/rs-audio/`，上传到 `question-audio/rs/`，按题号 upsert。原文或声音未改变时再次运行复用缓存，不增加题目数量。缓存删除后重跑会再次合成，须查看实际用量报告。

字符、合成调用和缓存命中统计写入 `output/rs-audio/report-apply.json`。数字是本次请求的朗读文本字符数，不代表 Azure 账单或该资源当月累计消耗；原文中的英文标点和空格也计入本报告。全部生成与抽样核验完成后追加实际结果。
