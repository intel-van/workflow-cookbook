// Link / anchor / cross-platform / i18n audit for the workflow-cookbook SPA.
// Cross-platform (Windows/macOS/Linux). Run FROM THE REPO ROOT:
//     node scripts/anchor-audit.mjs
// Expected on a healthy tree: "TOTAL ISSUES: 0".
//
// It replicates index.html's slugify() exactly and checks:
//   - every manifest chapter has both zh+en files, present with EXACT case (Linux/Pages safe)
//   - cross-page links  #/zh|en/<id>  resolve to a real manifest id (route() regex)
//   - in-page anchors    #<frag>      resolve to an h2/h3 heading in the SAME doc
//     (SPA does getElementById(raw) || getElementById(slugify(raw)); only h2/h3 get ids)
//   - referenced image assets exist (exact case)
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

// ---- replicate index.html slugify EXACTLY (see index.html ~line 316) ----
function slugify(text, seen){
  let id = String(text).trim().toLowerCase()
    .replace(/[\s_]+/gu,'-')
    .replace(/[^\p{L}\p{N}-]+/gu,'')
    .replace(/-{2,}/gu,'-').replace(/^-+|-+$/gu,'');
  if(!id) id = 'section';
  if(seen){ if(seen[id]!=null){ id = id+'-'+(++seen[id]); } else { seen[id]=0; } }
  return id;
}
// approximate marked's heading textContent: links/images -> text, strip ` * ~
function headingText(md){
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
    .replace(/[`*~]/g,'')
    .trim();
}

const chapters = [];
for(const part of manifest.parts) for(const ch of part.chapters) chapters.push(ch);
const validIds = new Set(['home', ...chapters.map(c=>c.id)]);

// case-exact existence (Windows fs is case-insensitive and would hide Linux-breaking bugs)
function existsExact(rel){
  const abs = path.join(ROOT, rel);
  if(!fs.existsSync(abs)) return {ok:false, reason:'missing'};
  const parts = rel.split('/');
  let cur = ROOT;
  for(const seg of parts){
    const entries = fs.readdirSync(cur);
    if(!entries.includes(seg)) return {ok:false, reason:'case-mismatch', got:entries.filter(e=>e.toLowerCase()===seg.toLowerCase())};
    cur = path.join(cur, seg);
  }
  return {ok:true};
}

function parseDoc(md){
  const lines = md.split(/\r?\n/);
  let fence=null;
  const headings=[];
  const links=[];
  const seen={};
  for(let i=0;i<lines.length;i++){
    const ln=lines[i];
    const fm = ln.match(/^(\s*)(```+|~~~+)/);
    if(fm){ const mk=fm[2][0]; if(fence===null){ fence=mk; } else if(fence===mk){ fence=null; } continue; }
    if(fence!==null) continue;
    const hm = ln.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if(hm){ headings.push({level:hm[1].length, slug:slugify(headingText(hm[2]), seen), raw:hm[2]}); }
    const re=/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let m;
    while((m=re.exec(ln))){ links.push({text:m[1], target:m[2], line:i+1}); }
  }
  return {headings, links, slugSet:new Set(headings.map(h=>h.slug))};
}

const f={missingFile:[], caseMismatch:[], badCrossPage:[], crossPageAnchorSuffix:[], brokenAnchor:[], missingAsset:[], i18nGap:[]};
let totLinks=0, totAnchors=0, totCross=0, docCount=0;

for(const ch of chapters){
  for(const lang of ['zh','en']){
    const rel = ch.file?.[lang];
    if(!rel){ f.i18nGap.push(`${ch.id} missing file.${lang} in manifest`); continue; }
    const ex = existsExact(rel);
    if(!ex.ok){ (ex.reason==='missing'?f.missingFile:f.caseMismatch).push(`${rel} (${ex.reason}${ex.got?': '+ex.got.join('|'):''})`); continue; }
    docCount++;
    const md = fs.readFileSync(path.join(ROOT, rel),'utf8');
    const {links, slugSet} = parseDoc(md);
    for(const lk of links){
      totLinks++;
      const tgt = lk.target;
      if(/^https?:/i.test(tgt) || /^mailto:/i.test(tgt)) continue;
      if(tgt.startsWith('#/')){
        totCross++;
        const rm = tgt.match(/^#\/(zh|en)\/([^/#]+)(#.*)?$/);
        if(!rm){ f.badCrossPage.push(`${rel}:${lk.line} -> ${tgt} (malformed)`); continue; }
        if(rm[3]){ f.crossPageAnchorSuffix.push(`${rel}:${lk.line} -> ${tgt} (route() can't handle #anchor suffix)`); }
        if(!validIds.has(rm[2])){ f.badCrossPage.push(`${rel}:${lk.line} -> ${tgt} (unknown id '${rm[2]}')`); }
      } else if(tgt.startsWith('#')){
        totAnchors++;
        const raw=decodeURIComponent(tgt.slice(1));
        if(!slugSet.has(raw) && !slugSet.has(slugify(raw))){
          f.brokenAnchor.push(`${rel}:${lk.line} [${lk.text}] -> ${tgt} (no h2/h3 in same doc; slugify='${slugify(raw)}')`);
        }
      } else if(/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(tgt)){
        const arel = tgt.replace(/^\.?\//,'');
        const ax = existsExact(arel);
        if(!ax.ok) f.missingAsset.push(`${rel}:${lk.line} -> ${tgt} (${ax.reason})`);
      } else if(/\.md(#|$)/i.test(tgt)){
        f.badCrossPage.push(`${rel}:${lk.line} -> ${tgt} (raw .md link; SPA needs #/lang/id)`);
      }
    }
  }
}

const n=(a)=>a.length;
console.log('=== ANCHOR/LINK AUDIT ===');
console.log(`docs scanned: ${docCount} | links: ${totLinks} (cross-page ${totCross}, in-page anchors ${totAnchors})`);
const sec=(label,arr)=>{ console.log(`\n-- ${label} (${n(arr)}) --`); arr.forEach(x=>console.log('  '+x)); };
sec('missing files', f.missingFile);
sec('case mismatches [Linux-breaking]', f.caseMismatch);
sec('i18n gaps', f.i18nGap);
sec('bad cross-page links', f.badCrossPage);
sec('cross-page #anchor suffix', f.crossPageAnchorSuffix);
sec('broken in-page anchors', f.brokenAnchor);
sec('missing assets', f.missingAsset);
const total=n(f.missingFile)+n(f.caseMismatch)+n(f.i18nGap)+n(f.badCrossPage)+n(f.crossPageAnchorSuffix)+n(f.brokenAnchor)+n(f.missingAsset);
console.log(`\n=== TOTAL ISSUES: ${total} ===`);
process.exit(total===0?0:1);
