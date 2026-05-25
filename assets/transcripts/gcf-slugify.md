# 真实运行记录 · 生成-批评-修复配方（GCF）

> 「生成-批评-修复」（Generate-Critique-Fix）配方（第 12 章）的真实运行：让三个 agent 依次「写一版 → 对抗式批评 → 据批评重写」，产出一个健壮的 `slugify()`（标题→锚点，CJK + ASCII）。这是 dogfooding——产物正好用于改进本书前端的 heading-ID 生成。
> 环境：Claude Code v2.1.150，`CLAUDE_CODE_WORKFLOWS=1`，2026-05。

**Run ID**：`wf_7472ceac-daa` ｜ **Task ID**：`wchxy8dbm`

## 脚本（三阶段顺序：Generate → Critique → Fix）

```javascript
export const meta = {
  name: 'gcf-slugify',
  description: 'Generate-Critique-Fix loop producing a robust slugify (CJK + ASCII)',
  phases: [{ title: 'Generate' }, { title: 'Critique' }, { title: 'Fix' }],
}
phase('Generate')
const gen = await agent('Write slugify(text): keep CJK, spaces->hyphens, strip punctuation, ...',
  { label:'generate', schema:{type:'object',properties:{code:{type:'string'}},required:['code']} })
phase('Critique')
const crit = await agent(`Adversarial review for correctness/edge cases. Code:\n${gen.code}`,
  { label:'critique', schema:{type:'object',properties:{issues:{type:'array',items:{type:'string'}}},required:['issues']} })
phase('Fix')
const fixed = await agent(`Rewrite to fix: ${JSON.stringify(crit.issues)}. Original:\n${gen.code}`,
  { label:'fix', schema:{type:'object',properties:{code:{type:'string'},changelog:{type:'string'}},required:['code','changelog']} })
return { issuesFound: crit.issues, finalCode: fixed.code, changelog: fixed.changelog }
```

## 真实用量

`agent_count=3` ｜ `tool_uses=10` ｜ `total_tokens=96468` ｜ `duration_ms=180724`（约 3 分钟）

## 真实产出：批评 agent 揪出的 10 个问题（节选 verbatim 要点）

1. **CRITICAL** — 正则缺 `/u` flag，按 UTF-16 **code unit** 而非 code point 匹配；`豈-﫿` 实际是 U+8C48..U+FAFF，**完整覆盖了代理对区 0xD800–0xDFFF** → emoji 与全部 astral 字符泄漏。实测 `slugify('I love 🍕 pizza') -> 'i-love-🍕-pizza'`。
2. **CRITICAL** — CJK 范围写错/不全：注释声称的全角范围 `＀-￯` 实际只含半角片假名 `ｦ-ﾟ` → 全角拉丁/数字被丢：`slugify('ＨＥＬＬＯ') -> ''`、`slugify('２０２４') -> ''`。
3. **HIGH** — 重音拉丁未 NFKD 规范化即被删/保留不一致 → 同形输入产生不同 slug：预组合 `café` -> `caf`、分解 `café` -> `cafe`；`Straße` -> `strae`（丢了 ß）。
4. **HIGH** — 非 CJK/非拉丁脚本全被清空 → `slugify('Привет мир') -> ''`、阿拉伯语 -> `''`。
5. **HIGH** — 碰撞：`C++`/`C`/`C#` 全部 -> `c-programming`；各种空结果都撞到 `''`。（重复调用是幂等的，问题是不同输入撞 slug。）
6. **MEDIUM** — 非字符串输入：`undefined -> 'undefined'`、`null -> 'null'`、`{} -> 'object-object'`、`[1,2,3] -> '123'`。
7. **MEDIUM** — 下划线保留但不与连字符统一归一：`'foo _ bar' -> 'foo-_-bar'`、`'__init__'` 原样。
8. **MEDIUM** — 零宽/连接符（U+200B/200D/FEFF）不被 `\s` 匹配 → 先替换空白再过滤的顺序使其被删，**静默融合单词**：`'a​b' -> 'ab'`。
9. **LOW** — `toLowerCase()` 区域不敏感（土耳其 İ 等）。
10. **LOW** — 未处理「数字开头」（若用作 HTML id 非法）。

## 真实产出：修复版（节选注释，完整见运行输出）

修复版改用 **`/u` flag**、`\p{Script=Han}` 等 Unicode 脚本转义、**NFKC**（折叠全角→ASCII）+ **NFKD + 剥离 `\p{M}` 组合记号**、零宽/下划线统一折叠为 `-`、非字符串输入返回 `fallback`、可选 `transliterateSymbols`（`C++`->`c-plus-plus`）。

> **要点**：一个看似简单的 `slugify` 被对抗式批评揪出 **10 个真实缺陷**——这正是 GCF 配方的价值：第一版（Generate）几乎总有盲区，独立的 Critique 阶段（换个 agent、明确要求「挑刺」）能系统性暴露它们。本书前端 `index.html` 的 heading-ID 生成正是吸取了「去重 + `/u` + 空值兜底」这几条教训。
