# Chapter 14 · Judge Panel: A/B Evaluation

> When you have two (or N) candidate answers, how do you objectively pick the better one? The worst approach is to let **one** agent "see which is better" — a single judge has both preferences and blind spots. This chapter ports the real-world **judge panel** into Workflow: **N candidates → multiple mutually independent judges score against the same rubric → tally and aggregate to decide the winner.** The recipe runs through a real run: two candidate answers, 3 independent judges, a **3:0** verdict for the winner — and the judges did something unexpected yet extremely valuable.

---

## 14.1 Recipe Motivation

"LLM-as-judge" itself is nothing new. The question is **how to judge** reliably. A single judge has three hard flaws:

- **Preference bias.** A single agent has its own taste for "verbose but comprehensive" versus "concise but shallow," and its one verdict mixes in this preference — you can't tell "B really is better" from "this judge just happens to like B's style."
- **Instability.** The same judge on the same pair of candidates might flip with a slight change of wording — you have no way to know how stable the result is.
- **Not tally-able.** One judge gives only one conclusion; you can't get **confidence** information like "what proportion thinks B is better."

The judge panel directly solves these three with **multiple non-communicating independent judges**:

```mermaid
flowchart TB
  q["the same question q"]
  q --> A["draft:A<br/>perspective A (e.g., beginner-friendly)"]
  q --> B["draft:B<br/>perspective B (e.g., performance engineering)"]
  A & B --> BR{{"barrier: both candidates ready"}}
  BR --> J1["judge:1<br/>independently scores against the rubric"]
  BR --> J2["judge:2<br/>independently scores against the rubric"]
  BR --> J3["judge:3<br/>independently scores against the rubric"]
  J1 & J2 & J3 --> T["Tally<br/>votesA vs votesB"]
  T --> W["winner"]
```

Three key designs — the rest of the chapter is their expansion:

1. **Judges must be independent**: use `parallel` to let each judge score **on its own**, unable to see the others' conclusions (otherwise they'll follow the crowd, degenerating into a single judge).
2. **Scoring needs a rubric**: use `schema` to **fix the scoring dimensions (accuracy / clarity / completeness) into numbers**, forcing judges to think structurally rather than give a single "I think B is better."
3. **Aggregate by tally, not by a single agent's call**: the final verdict is **counted out from votes**, not by dispatching another agent to "synthesize everyone's opinions" — the latter would converge the multi-judge independence back to a single point.

---

## 14.2 The Full Script

**(An illustrative script fleshed out from the transcript skeleton — not run verbatim; the actual run's Run ID and usage are in 14.3.)** Below is the script of this real run (its structure is consistent with `assets/transcripts/judge-panel.md`). The two schemas `answer` and `SCORE` are elided with `{...}` in the transcript; here they are **completed into a runnable form** and annotated inline as "(illustrative completion)"; the parts that genuinely exist in the transcript (`meta`, `q`, the `parallel` drafting, the 3-judge `parallel` scoring, the Tally count and `return`) are left as-is.

```javascript
export const meta = {
  name: 'judge-panel',
  description: 'A/B evaluation: two candidates scored by 3 independent judges, then tallied',
  phases: [{ title: 'Draft' }, { title: 'Judge' }, { title: 'Tally' }],
}

const q = 'When should you use parallel() vs pipeline() in a Claude Code Workflow?'

// The candidate answer schema (illustrative completion: elided with {...answer} in the transcript)
const ANSWER = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
}

phase('Draft')
// Two candidates produced concurrently, deliberately from different perspectives, to create a real quality difference
const [a, b] = await parallel([
  () => agent(`${q} Write a thorough answer from a beginner-friendly angle.`,
    { label: 'draft:A', phase: 'Draft', schema: ANSWER }),
  () => agent(`${q} Write a thorough answer from a performance-engineering angle.`,
    { label: 'draft:B', phase: 'Draft', schema: ANSWER }),
])

phase('Judge')
// The rubric fixed into a schema: three scoring dimensions + winner enum + reason (illustrative completion of SCORE)
const SCORE = {
  type: 'object',
  properties: {
    scoreA: {
      type: 'object',
      properties: {
        accuracy: { type: 'number' },
        clarity: { type: 'number' },
        completeness: { type: 'number' },
      },
      required: ['accuracy', 'clarity', 'completeness'],
    },
    scoreB: {
      type: 'object',
      properties: {
        accuracy: { type: 'number' },
        clarity: { type: 'number' },
        completeness: { type: 'number' },
      },
      required: ['accuracy', 'clarity', 'completeness'],
    },
    winner: { type: 'string', enum: ['A', 'B'] },
    reason: { type: 'string' },
  },
  required: ['scoreA', 'scoreB', 'winner', 'reason'],
}

// 3 judges each score independently: parallel barrier, none can see another's verdict
const judges = await parallel(
  [1, 2, 3].map((i) => () =>
    agent(
      `Independently score answers A and B on accuracy, clarity, completeness (0-10 each), ` +
        `then pick the better overall.\nA: ${a.answer}\nB: ${b.answer}`,
      { label: `judge:${i}`, phase: 'Judge', schema: SCORE }
    )
  )
)

phase('Tally')
// Tally aggregation: count votes, don't let an agent "synthesize everyone's opinions"
const valid = judges.filter(Boolean)
const votesA = valid.filter((j) => j.winner === 'A').length
const votesB = valid.filter((j) => j.winner === 'B').length
return {
  votesA,
  votesB,
  winner: votesA > votesB ? 'A' : 'B',
  judgeReasons: valid.map((j) => j.reason),
}
```

Note that this structure and Chapter 11's Multi-dimension PR Review are **alike in form but different in spirit**: both use the `parallel` barrier to run concurrently, but —

- Chapter 11: each agent looks at a **different** dimension (division of labor), and finally **synthesizes** their outputs.
- This chapter: each judge looks at the **same pair** of candidates (repeated judgment), and finally **tallies** their votes.

**"Synthesize after division of labor" uses an agent; "tally after repetition" uses code.** This is the soul of the judge panel — demoting aggregation from "call another agent to make the call" to a piece of **deterministic vote-counting code**, thereby preserving each judge's independence.

---

## 14.3 Real Run Results

> **Real run**: Run ID `wf_f5b69668-b18`, Task ID `w7rykwriv`. See `assets/transcripts/judge-panel.md` for the raw record.
> Real usage: `agent_count=5` (2 drafts + 3 judges) ｜ `tool_uses=26` ｜ `total_tokens=201852` ｜ `duration_ms=79462`.

### Tally Result: 3:0 for B

The script's real return value:

```json
{
  "votesA": 0,
  "votesB": 3,
  "winner": "B",
  "judgeReasons": [ "...three detailed reasons..." ]
}
```

**The 3 judges unanimously (3:0) ruled B the winner.** The reasons converged clearly: B (performance-engineering perspective) was overwhelmingly ahead on **completeness** — it included **real measurement data** and the core anti-pattern of "back-to-back parallel barrier waste" (the very topic of Chapter 08); A (beginner perspective) edged ahead on **clarity**, but lacked decisive depth. Across the three dimensions, the gap in completeness outweighed clarity's small advantage.

<div class="callout tip">

**Note how `agent_count=5` maps to the script structure.** 2 drafts + 3 judges = 5 agents, matching the real usage precisely (confirming Chapter 08's rule of thumb "tokens ≈ agent count × per-agent context": `201852 / 5 ≈ 40K/agent`). `tool_uses=26` is on the high side; the next section reveals why — the judges did something extra.

</div>

### Two Unexpected Yet Extremely Valuable Observations

The most interesting part of this run isn't "B won," but **how** the judges arrived at their judgment:

<div class="callout info">

**Observation 1 · Judges proactively verify.** All 3 judges stated in their respective reasons: they **actually read `docs/en/p2-08-parallel-vs-pipeline.md` and `assets/_grounding.md` to cross-check**, verifying the numbers in the candidate answers item by item — `8.4s / 78844 token`, `26.7s / 158982 token`, the `3×5.5≈16.5s` baseline, the `min(16, cores−2)` concurrency cap, the `1000` agent fallback. All three judges' independent conclusions were "zero factual errors, every number matches precisely."

This explains why `tool_uses=26` is so high: the judges didn't "score from impression," but **really went and read the source of facts.** **A side effect**: this amounts to **verifying in passing that all of this book's Chapter p2-08 real data is accurate** — a single judge-panel run came with a free fact-check.

**Observation 2 · Independent judges converge.** Three **non-communicating** judges independently arrived at exactly the same conclusion (3:0). This is precisely the judge panel's core value cashed in: for candidates of "clearly differing quality," multiple independent perspectives will **stably converge**; whereas if the candidates' quality is close, you'd see 2:1 or even split scores — which itself is a signal that "these two are about the same."

</div>

These two observations together show: **a structured rubric (schema) leads judges to do serious verification rather than offer pleasantries.** When the schema requires it to give a concrete number for `accuracy`, a conscientious judge will naturally go verify the facts — this is the "side-effect dividend" of schema constraints.

---

## 14.4 Design Points

**① Judge independence is a non-negotiable red line.** Use `parallel` to let judges score **concurrently and unable to see** each other's verdicts. The moment you write "judge 2 scores after seeing judge 1's score," the panel degenerates into "one judge + a few echoers," and the value of multi-perspective bias reduction goes to zero.

<div class="callout warn">

**Counter-example**: don't feed conclusions serially like this —

```javascript
// ✗ Wrong: judges 2/3 can see the prior verdicts → follow the crowd, independence lost
let prev = null
for (const i of [1, 2, 3]) {
  prev = await agent(`Previous judge said: ${JSON.stringify(prev)}. Now you score...`, { schema: SCORE })
}
```

The correct way is the `parallel([1,2,3].map(...))` in the script — three judges run at the same time, none can see another.

</div>

**② The rubric must be fixed into numbers with a schema.** Having judges give a `number` each for `accuracy / clarity / completeness` is far better than having them write a paragraph of "overall feel": numbers are comparable, explainable (you can see "B won on completeness"), and weightable (Variant B). The schema is validated at the tool-call layer (Chapter 07), and a non-conforming judge is asked to re-score — this turns "scoring" from a soft suggestion into a hard structure.

**③ Aggregate by tally, never with a "synthesize agent."** The final `Tally` stage is **pure JavaScript** — `filter` + counting votes. **Don't** insert an agent here to "synthesize the three judges' opinions into a final conclusion": that would crush the three independent signals back into a single-point judgment, throwing away the independence so carefully preserved earlier. **Tallying is deterministic, reproducible, zero extra tokens** — this is exactly the part the Workflow "deterministic skeleton" should bear (echoing Chapter 02).

**④ Candidates should create a real difference.** This example deliberately has A take the "beginner perspective" and B the "performance-engineering perspective," thereby producing a distinguishable quality difference. If the two candidates are nearly identical, the judges can only force a pick in the noise, and the result has no reference value. Candidates can come from **different prompts, different models, different temperatures, or multiple samples of the same prompt.**

**⑤ Use an odd number of judges.** 3, 5, 7… an odd number of judges avoids ties. In this example 3 is enough to stably converge when "quality clearly differs"; if the candidates are evenly matched or the stakes are high, going to 5 further reduces single-judge noise (at the cost of linearly growing tokens, but the wall clock is still bounded by the barrier and does not grow linearly with the number of judges).

---

## 14.5 Variants

<div class="callout info">

**Variant A · N-candidate tournament**: when there are more than two candidates, the schema's `winner` expands from `enum:['A','B']` to `enum:['A','B','C',...]`, and the judge picks the best directly; or have each judge **rank** all candidates (returning a ranking array), and the Tally stage decides the winner with a rank-aggregation method like Borda count.

**Variant B · Weighted rubric**: give different dimensions weights (e.g., `accuracy×3 + completeness×2 + clarity×1`), and in the Tally stage compute a weighted sum of each judge's `scoreA/scoreB` before comparing — upgrading "voting" into "weighted scoring," suitable for scenarios where dimensions differ in importance.

**Variant C · Judge + veto**: add a `disqualify: boolean` field to the schema (e.g., "contains a factual error," "out of scope"). At Tally, any judge's veto immediately eliminates that candidate — separating "scoring" from a "red-line check," echoing Chapter 17's adversarial verification.

**Variant D · After GCF / generation (best-of-N)**: this is exactly the landing spot for Chapter 12 GCF's "Variant C" — in the Generate stage use `parallel` to produce N candidates, **use this chapter's judge panel to pick the best**, then run Critique→Fix on the winner. The judge panel is the **convergence gate** of any "diverge first, then converge" pipeline.

**Variant E · Graft-style synthesis (don't discard the runners-up's good ideas)**: a stronger convergence doesn't just "pick the winner" — it **synthesizes from the winning candidate as the trunk, grafting in the good ideas unique to the losing candidates.** Losing ≠ all lost — a candidate that came second overall might be better on some specific dimension (e.g., an edge case the winner missed, a more precise phrasing). The approach: after tallying to pick the winner, **add one synthesis agent**, feeding it "the winner's full text + the runners-up, plus the strengths the judges noted in each," and have it produce a final draft that "uses the winner as the skeleton and selectively absorbs the runners-up's strengths."

```javascript
// (illustrative, not run) — after tallying to pick the winner, graft-style synthesis
const winnerDraft = votesA > votesB ? a.answer : b.answer
const final = await agent(
  // Synthesize from the winner as the trunk, grafting in good ideas unique to the losing candidate — don't waste the insight in the runners-up
  `Rewrite a final answer using the following as the trunk:\n${winnerDraft}\n\n` +
    `From the losing candidate below, absorb only its unique strengths the winner lacks (e.g., a missed edge case, a more precise phrasing):\n${votesA > votesB ? b.answer : a.answer}`,
  { label: 'synthesize', phase: 'Tally', schema: ANSWER }
)
```

Note that this synthesis agent is **added after the tally**, not replacing it — the verdict is still decided by §14.4's "③ Aggregate by tally" deterministic code, and synthesis happens only after "the trunk is fixed," so it doesn't break judge independence. It is essentially different from "letting one agent synthesize everyone's opinions to decide the winner" (that red line): **the former uses an agent to assemble text; the latter uses an agent to make the verdict call.**

</div>

---

## 14.6 Chapter Summary

- Judge panel = **N candidates → multiple independent judges score against the same rubric → tally and aggregate**, using multiple perspectives to reduce a single judge's preference bias and instability.
- Three red lines: judges **independent** (`parallel`, each scoring, unable to see others), the rubric **fixed into numbers with a schema**, and aggregation **by vote-counting code** rather than a "synthesize agent" making the call.
- Alike in form but different in spirit from Chapter 11: PR review is "synthesize after division of labor (use an agent)," the judge panel is "tally after repetition (use code)."
- Real run: `agent_count=5`, `total_tokens=201852`, `duration_ms=79462`; 2 candidates, 3 judges, **3:0 for B**.
- Two empirical observations: judges **proactively read `docs/en/p2-08` and `_grounding.md` to cross-check** (the source of `tool_uses=26`, verifying in passing that this book's p2-08 data is all correct); three non-communicating judges **independently converged to the same conclusion**.
- Variants: N-candidate tournament, weighted rubric, veto, best-of-N after generation/GCF, **graft-style synthesis** (use the winner as the trunk and absorb the runners-up's unique good ideas, not wasting the insight in losing drafts).

The next chapter enters the "Bug Hunter" recipe: a self-respawning finder pool flowing into adversarial verification, to dig out a branch's latent defects with high precision.

> Continue reading: [Chapter 15 · Bug Hunter](#/en/p3-15)
