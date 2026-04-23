function goToQuestion(qIdx){
  switchTab('questions');
  setTimeout(() => {
    const el = document.getElementById('qa-'+qIdx);
    if(el){
      el.classList.add('open');
      el.scrollIntoView({behavior:'smooth', block:'center'});
    }
  }, 150);
}

function toggleQCard(qi){
  const el = document.getElementById('qa-'+qi);
  if(el) el.classList.toggle('open');
}

function populateDeptFilter(){
  const deptEl = document.getElementById('qFilterDept');
  if(!deptEl) return;
  const depts = new Set();
  state.domains.forEach(d => { if(d.dept) depts.add(d.dept); });
  const current = deptEl.value;
  deptEl.innerHTML = '<option value="">الكل</option>' + [...depts].map(d => `<option ${d===current?'selected':''}>${d}</option>`).join('');
  if(![...depts].includes(current)) deptEl.value = '';
}

function renderKpiDepts(){
  const el = document.getElementById('kpiDepts');
  if(!el) return;

  // Group domains by department
  const deptMap = {};
  state.domains.forEach((d, dIdx) => {
    if(!d.dept) return;
    if(!deptMap[d.dept]) deptMap[d.dept] = [];
    const details = state.domainDetails?.[dIdx] || {};
    const qs = getDomainQuestions(d);
    const answeredQs = qs.filter(q => q.current !== null);
    const ev = getDomainEvidence(d);
    deptMap[d.dept].push({
      ...d, _i:dIdx,
      target: details.target || null,
      barriers: details.barriers || '',
      avgScore: answeredQs.length ? answeredQs.reduce((s,q)=>s+q.current,0)/answeredQs.length : null,
      qAnswered: answeredQs.length,
      qTotal: qs.length,
      evDone: ev.done,
      evTotal: ev.total
    });
  });

  const deptList = Object.entries(deptMap).map(([name, domains]) => {
    const assessed = domains.filter(d => d.avgScore !== null);
    const avg = assessed.length ? assessed.reduce((s,d)=>s+d.avgScore,0)/assessed.length : null;
    const targetsSet = domains.filter(d => d.target !== null);
    const avgTarget = targetsSet.length ? targetsSet.reduce((s,d)=>s+d.target,0)/targetsSet.length : null;
    const gap = (avg !== null && avgTarget !== null) ? Math.max(0, avgTarget - avg) : null;
    const allBarriers = domains.map(d => d.barriers).filter(b => b).join(' · ');
    const totalEvDone = domains.reduce((s,d)=>s+d.evDone,0);
    const totalEvReq = domains.reduce((s,d)=>s+d.evTotal,0);

    return {
      name, domains, avg, avgTarget, gap, barriers: allBarriers,
      domainsCount: domains.length,
      assessedCount: assessed.length,
      targetsCount: targetsSet.length,
      evDone: totalEvDone, evTotal: totalEvReq
    };
  }).sort((a,b) => (a.avg===null?99:a.avg) - (b.avg===null?99:b.avg));

  el.innerHTML = deptList.map(dept => {
    const scoreColor = dept.avg===null ? 'var(--muted)' : dept.avg>=4 ? 'var(--brand-green)' : dept.avg>=2.5 ? 'var(--brand-cyan)' : dept.avg>=1 ? 'var(--warn)' : 'var(--bad)';
    const evPct = dept.evTotal ? Math.round(dept.evDone/dept.evTotal*100) : 0;

    return `
      <div class="dept-perf-card">
        <div class="dept-perf-header">
          <h4>${dept.name}</h4>
          <div class="dept-perf-score" style="color:${scoreColor}">${dept.avg===null ? '—' : dept.avg.toFixed(2)}</div>
        </div>
        <div class="dept-perf-grid">
          <div class="dept-perf-item">
            <span class="dept-perf-key">المجالات</span>
            <span class="dept-perf-val">${dept.assessedCount} / ${dept.domainsCount} مُقيَّم</span>
          </div>
          <div class="dept-perf-item">
            <span class="dept-perf-key">المستهدف</span>
            <span class="dept-perf-val">${dept.avgTarget===null ? '— لم يُحدد' : 'L'+Math.round(dept.avgTarget)+' (متوسط)'}</span>
          </div>
          <div class="dept-perf-item">
            <span class="dept-perf-key">الفجوة</span>
            <span class="dept-perf-val ${dept.gap!==null && dept.gap>0 ? 'dept-gap-warn' : ''}">${dept.gap===null ? '—' : dept.gap>0 ? '+'+dept.gap.toFixed(1) : '0'}</span>
          </div>
          <div class="dept-perf-item">
            <span class="dept-perf-key">الأدلة</span>
            <span class="dept-perf-val">${dept.evDone}/${dept.evTotal} (${evPct}%)</span>
          </div>
        </div>
        ${dept.barriers ? `<div class="dept-perf-barriers"><b>المعوقات:</b> ${dept.barriers}</div>` : ''}
        <div class="dept-perf-domains">
          ${dept.domains.map(d => `<span class="dept-dom-chip ${d.avgScore!==null?'assessed':''}" title="${d.sub} – ${d.name}">${d.name} ${d.avgScore!==null?'<b>L'+Math.round(d.avgScore)+'</b>':''}</span>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function setDomainDept(dIdx, val){
  state.domains[dIdx].dept = val || '';
  saveState();
  renderDomains(); // Re-render to update dept filter and reflect change
}

function setDomainTarget(dIdx, val){
  if(!state.domainDetails[dIdx]) state.domainDetails[dIdx] = {};
  state.domainDetails[dIdx].target = val === '' ? null : parseInt(val);
  saveState();
  renderDomains();
}

function setDomainBarriers(dIdx, val){
  if(!state.domainDetails[dIdx]) state.domainDetails[dIdx] = {};
  state.domainDetails[dIdx].barriers = val;
  saveState();
}

function getDomainEvidence(d){
  const qs = getDomainQuestions(d);
  let total=0, done=0;
  qs.forEach(q => {
    q.levels.forEach((lv,n) => {
      if(n>0 && lv.evidence && !lv.evidence.includes('ليست هناك')){
        total++;
        if(state.questionEvidence?.[q.code]?.[n]?.has) done++;
      }
    });
  });
  return {total, done};
}