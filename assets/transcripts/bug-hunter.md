# 真实运行记录 · Bug 猎手 + 对抗验证

> 「Bug 猎手」（第 15 章）+「对抗验证」（第 17 章）的真实运行：猎手读目标文件找 bug，然后每条 bug 派 2 个「唱反调」agent **默认证伪**（refuted-by-default），只保留挺过验证的。
> 目标文件：`assets/samples/buggy-cart.js`（含 5 个有意埋的 bug）。
> 环境：Claude Code v2.1.150，`CLAUDE_CODE_WORKFLOWS=1`，2026-05。

**Run ID**：`wf_53da9a06-915` ｜ **Task ID**：`wsj4ypt3x`

## 脚本结构（Hunt → 每条 bug 并发 2 个证伪者）

```javascript
phase('Hunt')
const hunt = await agent(`Read ${FILE} and find genuine bugs ...`, { label:'hunt', schema:{bugs:[{fn,bug,why}]} })

const verified = await pipeline(hunt.bugs,
  (b) => parallel([1,2].map(i => () =>
    agent(`You are a skeptic. Try to REFUTE this claimed bug ... Default to refuted=true if not certain. Claim: ${b.fn}: ${b.bug}`,
      { label:`refute:${b.fn}:${i}`, phase:'Verify', schema:{refuted:boolean, reason:string} })
  )).then(votes => {
    const v = votes.filter(Boolean)
    const confirms = v.filter(x => !x.refuted).length
    return { ...b, confirmVotes:confirms, refuteVotes:v.length-confirms, confirmed: confirms>=1 }
  })
)
const confirmed = verified.filter(Boolean).filter(b => b.confirmed)
return { hunted: hunt.bugs.length, confirmedCount: confirmed.length, confirmed }
```

## 真实用量

`agent_count=11`（1 猎手 + 5 bug × 2 证伪者）｜ `tool_uses=25` ｜ `total_tokens=311134` ｜ `duration_ms=61660`

## 真实产出

**hunted 5 → confirmed 5**（5 个种子 bug 全部找到，且各以 2:0 通过对抗验证）：

| 函数 | bug | 票数 |
|---|---|---|
| `applyDiscount` | percent 无边界校验，>100 得负价、负 percent 反而抬价 | 2:0 |
| `cartTotal` | off-by-one：`i < items.length-1` 跳过最后一项 | 2:0 |
| `checkout` | 缺 `await`：`gateway.charge()` 返回 Promise 恒真，未付款就清空购物车 | 2:0 |
| `findItem` | `==` 而非 `===`，类型强制致误配 | 2:0 |
| `mergeCarts` | 原地 `a.push()` 修改入参（别名 bug），应返回新数组 | 2:0 |

## 关键观察：对抗验证「反过来纠正了猎手」（实证）

`applyDiscount` 的证伪者在确认 bug 真实的同时，**纠正了猎手（及种子注释）的一处错误推理**——原文称「percent 作字符串会拼接」，证伪者指出：

> "the source comment's 'percent as string concatenates' claim is false — `*` and `/` coerce strings to numbers, so `applyDiscount(100,'10')` correctly returns 90; concatenation would require `+`."

**这正是对抗验证的核心价值**：它不仅过滤假阳性，还能**修正真阳性里的错误论证**。一个只会附和的验证者发现不了这一点；一个被明确要求「默认证伪、不确定就判 refuted」的验证者才会去较真，连带把推理里的瑕疵也揪出来。

> **配方要点**：①验证者必须**独立**（`parallel` 各自判，互不可见）；②**默认证伪**（refuted-by-default + 「不确定就判 refuted」）把举证责任压给「这是真 bug」一方；③用**计票**而非单 agent 拍板；④本例用 2 票、「未被多数否决即保留」，要更严就加票数、改「需多数确认」。
