
const categoriesDefault = [
  { name: "食費", icon: "🍴", color: "#0f9864" },
  { name: "日用品", icon: "🛍️", color: "#f59e0b" },
  { name: "交通費", icon: "🚌", color: "#0aa174" },
  { name: "交際費", icon: "🌸", color: "#f55772" },
  { name: "娯楽・趣味", icon: "🎮", color: "#7c5ce1" },
  { name: "美容・衣服", icon: "💄", color: "#ef476f" },
  { name: "医療・保険", icon: "🛡️", color: "#1698a8" },
  { name: "教育・学習", icon: "📘", color: "#369bd6" },
  { name: "その他", icon: "…", color: "#999999" }
];

const yen = n => "¥" + Math.round(Number(n || 0)).toLocaleString("ja-JP");
const ym = (d = new Date()) => d.toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const jpMonth = m => {
  const [y, mo] = m.split("-");
  return `${y}年${Number(mo)}月`;
};

let selectedMonth = ym();
let selectedCategory = "食費";
let graphMode = "monthly";
let state = loadState();

function loadState() {
  const saved = localStorage.getItem("kakeibo-green-v1") || localStorage.getItem("kakeiboStateV2") || localStorage.getItem("kakeiboState");
  if (saved) {
    try {
      const s = JSON.parse(saved);
      if (!s.categoriesMeta) {
        s.categoriesMeta = categoriesDefault;
        if (Array.isArray(s.categories)) {
          s.categoriesMeta = s.categories.map((name, i) => categoriesDefault.find(c => c.name === name) || { name, icon: "●", color: categoriesDefault[i % categoriesDefault.length].color });
        }
      }
      s.months ||= {};
      s.expenses ||= [];
      return s;
    } catch {}
  }
  return { categoriesMeta: categoriesDefault, months: {}, expenses: [] };
}

function saveState() {
  localStorage.setItem("kakeibo-green-v1", JSON.stringify(state));
}

function categoryNames() {
  return state.categoriesMeta.map(c => c.name);
}

function meta(name) {
  return state.categoriesMeta.find(c => c.name === name) || { name, icon: "●", color: "#0f9864" };
}

function ensureMonth(m) {
  if (!state.months[m]) state.months[m] = { income: 0, budgets: {} };
  state.months[m].budgets ||= {};
  categoryNames().forEach(c => {
    if (state.months[m].budgets[c] === undefined) state.months[m].budgets[c] = 0;
  });
}

function monthExpenses(m) {
  return state.expenses.filter(e => e.date && e.date.startsWith(m));
}

function spentByCategory(m, cat) {
  return monthExpenses(m).filter(e => e.category === cat).reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

function totalSpent(m) {
  return monthExpenses(m).reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

function totalBudget(m) {
  ensureMonth(m);
  return categoryNames().reduce((s, c) => s + Number(state.months[m].budgets[c] || 0), 0);
}

function statusClass(budget, spent) {
  if (!budget) return "safe";
  const r = spent / budget;
  if (r >= 1) return "over";
  if (r >= 0.9) return "danger";
  if (r >= 0.7) return "warn";
  return "safe";
}

function changePage(id) {
  closeModal();
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".nav, .bottom").forEach(b => b.classList.toggle("active", b.dataset.page === id));
  render();
  scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", e => {
  const pageBtn = e.target.closest("[data-page]");
  if (pageBtn) changePage(pageBtn.dataset.page);

  const jump = e.target.closest("[data-page-jump]");
  if (jump) changePage(jump.dataset.pageJump);

  const cat = e.target.closest("[data-category]");
  if (cat) openCategoryDetail(cat.dataset.category);

  if (e.target.closest("[data-close-modal]")) closeModal();

  const tab = e.target.closest("[data-graph]");
  if (tab) {
    graphMode = tab.dataset.graph;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.graph === graphMode));
    drawGraph();
  }
});

document.getElementById("expenseDate").value = today();
document.getElementById("filterMonth").value = selectedMonth;
document.getElementById("settingMonth").value = selectedMonth;

document.getElementById("expenseForm").addEventListener("submit", e => {
  e.preventDefault();
  const amount = Number(document.getElementById("expenseAmount").value);
  const date = document.getElementById("expenseDate").value || today();
  const memo = document.getElementById("expenseMemo").value.trim();
  if (!amount || amount <= 0) return message("金額を入力してね");

  state.expenses.push({
    id: String(Date.now()),
    date,
    amount,
    category: selectedCategory,
    memo
  });
  selectedMonth = date.slice(0, 7);
  saveState();

  document.getElementById("expenseAmount").value = "";
  document.getElementById("expenseMemo").value = "";
  message("保存しました");
  render();
});

function message(text) {
  const el = document.getElementById("inputMessage");
  el.textContent = text;
  setTimeout(() => el.textContent = "", 1600);
}

["filterMonth", "filterCategory", "filterKeyword"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderHistory);
});

document.getElementById("historyPrev").addEventListener("click", () => {
  document.getElementById("filterMonth").value = shiftMonth(document.getElementById("filterMonth").value || selectedMonth, -1);
  renderHistory();
});

document.getElementById("historyNext").addEventListener("click", () => {
  document.getElementById("filterMonth").value = shiftMonth(document.getElementById("filterMonth").value || selectedMonth, 1);
  renderHistory();
});

function shiftMonth(m, diff) {
  const [y, mo] = m.split("-").map(Number);
  return ym(new Date(y, mo - 1 + diff, 1));
}

document.getElementById("saveMonthSettings").addEventListener("click", () => {
  const m = document.getElementById("settingMonth").value || selectedMonth;
  ensureMonth(m);
  state.months[m].income = Number(document.getElementById("settingIncome").value || 0);
  categoryNames().forEach(c => {
    const input = document.querySelector(`[data-budget="${CSS.escape(c)}"]`);
    state.months[m].budgets[c] = Number(input?.value || 0);
  });
  selectedMonth = m;
  saveState();
  render();
});

document.getElementById("addCategory").addEventListener("click", () => {
  const name = document.getElementById("newCategoryName").value.trim();
  if (!name || categoryNames().includes(name)) return;
  state.categoriesMeta.push({ name, icon: "●", color: "#0f9864" });
  Object.keys(state.months).forEach(m => state.months[m].budgets[name] = 0);
  document.getElementById("newCategoryName").value = "";
  saveState();
  render();
});

document.getElementById("exportData").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kakeibo-backup.json";
  a.click();
});

document.getElementById("importData").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  state = JSON.parse(await file.text());
  saveState();
  render();
});

function render() {
  ensureMonth(selectedMonth);
  renderHome();
  renderInput();
  renderHistory();
  renderSettings();
  drawGraph();
}

function renderHome() {
  const income = Number(state.months[selectedMonth].income || 0);
  const spent = totalSpent(selectedMonth);
  document.getElementById("balanceView").textContent = yen(income - spent);
  document.getElementById("monthLabel").textContent = jpMonth(selectedMonth);

  document.getElementById("categoryCards").innerHTML = categoryNames().map(cat => {
    const m = meta(cat);
    const budget = Number(state.months[selectedMonth].budgets[cat] || 0);
    const used = spentByCategory(selectedMonth, cat);
    const left = budget - used;
    const rate = budget ? used / budget : 0;
    const pct = Math.min(rate * 100, 100);
    const st = statusClass(budget, used);
    return `
      <article class="category-card ${st}" data-category="${cat}">
        <div class="cat-main">
          <div class="cat-icon" style="color:${m.color};background:${hexToSoft(m.color)}">${m.icon}</div>
          <div>
            <div class="cat-name">${cat}</div>
            <div class="cat-left">${yen(left)}</div>
          </div>
          <div class="chevron">›</div>
        </div>
        <div class="progress ${st}"><span style="width:${pct}%; background:${st === "safe" ? "var(--green)" : ""}"></span></div>
        <div class="cat-meta">
          <span>予算 ${yen(budget)}</span>
          <span>使った額 ${yen(used)}</span>
          <span>${Math.round(rate * 100)}%</span>
        </div>
      </article>`;
  }).join("");

  const recent = monthExpenses(selectedMonth).slice(-4).reverse();
  document.getElementById("recentList").innerHTML = recent.map(e => rowHtml(e)).join("") || "<p>まだ支出がありません</p>";
}

function rowHtml(e) {
  const m = meta(e.category);
  return `
    <div class="list-row">
      <div class="cat-icon" style="color:${m.color};background:${hexToSoft(m.color)}">${m.icon}</div>
      <div><strong>${e.category}</strong><small>${e.memo || "メモなし"}　${e.date}</small></div>
      <strong>${yen(e.amount)}</strong>
    </div>`;
}

function renderInput() {
  document.getElementById("categoryPicker").innerHTML = categoryNames().map(cat => {
    const m = meta(cat);
    return `
      <button type="button" class="pick-card ${cat === selectedCategory ? "active" : ""}" data-pick="${cat}">
        <span class="pick-icon">${m.icon}</span>
        <span>${cat}</span>
      </button>`;
  }).join("");

  document.querySelectorAll("[data-pick]").forEach(b => {
    b.onclick = () => {
      selectedCategory = b.dataset.pick;
      renderInput();
    };
  });
}

function renderHistory() {
  const m = document.getElementById("filterMonth").value || selectedMonth;
  ensureMonth(m);
  const cat = document.getElementById("filterCategory").value;
  const kw = document.getElementById("filterKeyword").value.trim();
  document.getElementById("historyExpenseTotal").textContent = yen(totalSpent(m));
  document.getElementById("historyIncomeTotal").textContent = yen(state.months[m].income || 0);
  document.getElementById("filterCategory").innerHTML = `<option value="">すべて</option>` + categoryNames().map(c => `<option value="${c}">${c}</option>`).join("");
  document.getElementById("filterCategory").value = cat;

  let items = monthExpenses(m);
  if (cat) items = items.filter(e => e.category === cat);
  if (kw) items = items.filter(e => (e.memo || "").includes(kw));

  document.getElementById("historyList").innerHTML = items.slice().reverse().map(rowHtml).join("") || "<p>該当する支出がありません</p>";
}

function renderSettings() {
  ensureMonth(selectedMonth);
  document.getElementById("settingMonth").value = selectedMonth;
  document.getElementById("settingIncome").value = state.months[selectedMonth].income || 0;

  document.getElementById("budgetInputs").innerHTML = categoryNames().map(cat => {
    const m = meta(cat);
    return `
      <div class="budget-row">
        <strong>${m.icon} ${cat}</strong>
        <input data-budget="${cat}" type="number" inputmode="numeric" value="${state.months[selectedMonth].budgets[cat] || 0}">
      </div>`;
  }).join("");

  document.getElementById("categorySettings").innerHTML = categoryNames().map(cat => {
    const m = meta(cat);
    return `
      <div class="setting-row">
        <span>${m.icon} ${cat}</span>
        <button onclick="deleteCategory('${cat}')">削除</button>
      </div>`;
  }).join("");
}

window.deleteCategory = function(cat) {
  if (categoryNames().length <= 1) return;
  state.categoriesMeta = state.categoriesMeta.filter(c => c.name !== cat);
  Object.keys(state.months).forEach(m => delete state.months[m].budgets[cat]);
  state.expenses = state.expenses.filter(e => e.category !== cat);
  selectedCategory = categoryNames()[0];
  saveState();
  render();
};

function openCategoryDetail(cat) {
  selectedCategory = cat;
  const budget = Number(state.months[selectedMonth].budgets[cat] || 0);
  const used = spentByCategory(selectedMonth, cat);
  const left = budget - used;
  const rate = budget ? used / budget : 0;
  const m = meta(cat);
  const items = monthExpenses(selectedMonth).filter(e => e.category === cat).slice().reverse();

  document.getElementById("detailTitle").textContent = cat;
  document.getElementById("detailContent").innerHTML = `
    <section class="detail-hero">
      <p>今月の残り予算</p>
      <div class="cat-left">${yen(left)}</div>
      <p>予算 ${yen(budget)}　残り ${Math.max(0, Math.round((1-rate)*100))}%</p>
      <div class="progress safe"><span style="width:${Math.min(rate*100,100)}%"></span></div>
    </section>
    <div class="detail-stats">
      <div class="stat"><span>平均/日</span><strong>${yen(used / Math.max(1, new Date().getDate()))}</strong></div>
      <div class="stat"><span>使った金額</span><strong>${yen(used)}</strong></div>
      <div class="stat"><span>残り</span><strong>${yen(left)}</strong></div>
    </div>
    <section class="card">
      <div class="section-title inner">
        <h2>最近の支出</h2>
        <button data-page-jump="history">すべて見る</button>
      </div>
      <div class="list">${items.map(rowHtml).join("") || "<p>このカテゴリの支出はまだありません</p>"}</div>
    </section>
    <section class="card chart-card">
      <h2>支出の推移</h2>
      <canvas id="detailChart"></canvas>
    </section>
  `;
  document.getElementById("detailModal").hidden = false;
  setTimeout(() => drawTrend("detailChart", cat), 30);
}

function closeModal() {
  document.getElementById("detailModal").hidden = true;
}

function setupCanvas(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(window.devicePixelRatio || 1, 2);
  const width = Math.max(280, rect.width);
  const height = Math.max(260, rect.height || 320);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { canvas, ctx, width, height };
}

function drawGraph() {
  const title = document.getElementById("graphTitle");
  if (!title) return;
  if (graphMode === "monthly") {
    title.textContent = "カテゴリ別 支出割合";
    drawPie("graphCanvas");
  } else if (graphMode === "annual") {
    title.textContent = "月別 支出の推移";
    drawBars("graphCanvas");
  } else {
    title.textContent = `${selectedCategory}の推移`;
    drawTrend("graphCanvas", selectedCategory);
  }
}

function drawPie(id) {
  const c = setupCanvas(id);
  if (!c) return;
  const { ctx, width, height } = c;
  const vals = categoryNames().map(cat => spentByCategory(selectedMonth, cat));
  const total = vals.reduce((a,b) => a+b, 0);
  const cx = width * 0.34;
  const cy = height * 0.48;
  const r = Math.min(width, height) * 0.26;

  if (!total) {
    drawText(ctx, "データなし", width/2 - 40, height/2, 16, "#777", "700");
    return;
  }

  let start = -Math.PI / 2;
  vals.forEach((v, i) => {
    if (!v) return;
    const angle = v / total * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.fillStyle = meta(categoryNames()[i]).color;
    ctx.fill();
    start += angle;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, r * .48, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();

  drawText(ctx, "合計", cx - 16, cy - 4, 12, "#777", "800");
  drawText(ctx, yen(total), cx - 45, cy + 20, 17, "#111", "900");

  const lx = width < 460 ? 24 : width * 0.63;
  const ly = width < 460 ? height - 105 : height * 0.25;
  categoryNames().forEach((cat, i) => {
    if (!vals[i]) return;
    const y = ly + i * 22;
    if (y > height - 10) return;
    ctx.fillStyle = meta(cat).color;
    ctx.beginPath();
    ctx.arc(lx, y - 5, 5, 0, Math.PI * 2);
    ctx.fill();
    drawText(ctx, cat, lx + 12, y, 12, "#333", "700");
    drawText(ctx, `${Math.round(vals[i]/total*1000)/10}%`, lx + 105, y, 12, "#777", "700");
  });
}

function drawBars(id) {
  const c = setupCanvas(id);
  if (!c) return;
  const { ctx, width, height } = c;
  const year = selectedMonth.slice(0,4);
  const vals = Array.from({length:12}, (_,i) => totalSpent(`${year}-${String(i+1).padStart(2,"0")}`));
  const max = Math.max(...vals, 1);
  const left = 36, right = 14, top = 28, bottom = 34;
  const w = width - left - right;
  const h = height - top - bottom;

  grid(ctx, left, top, w, h);
  const gap = w / 12;
  const barW = Math.min(28, gap * .5);
  vals.forEach((v,i) => {
    const bh = v / max * h;
    const x = left + gap*i + (gap-barW)/2;
    const y = top + h - bh;
    roundRect(ctx, x, y, barW, bh, 8, "#67c899");
    drawText(ctx, `${i+1}月`, x-2, height-12, 11, "#777", "700");
  });
}

function drawTrend(id, cat) {
  const c = setupCanvas(id);
  if (!c) return;
  const { ctx, width, height } = c;
  const year = selectedMonth.slice(0,4);
  const vals = Array.from({length:12}, (_,i) => spentByCategory(`${year}-${String(i+1).padStart(2,"0")}`, cat));
  const max = Math.max(...vals, 1);
  const left = 36, right = 14, top = 28, bottom = 34;
  const w = width - left - right;
  const h = height - top - bottom;
  grid(ctx, left, top, w, h);

  ctx.strokeStyle = meta(cat).color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  vals.forEach((v,i) => {
    const x = left + w * i / 11;
    const y = top + h - v / max * h;
    if (i === 0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  vals.forEach((v,i) => {
    const x = left + w * i / 11;
    const y = top + h - v / max * h;
    ctx.fillStyle = meta(cat).color;
    ctx.beginPath();
    ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fill();
    if (i % 2 === 0) drawText(ctx, `${i+1}`, x-4, height-12, 11, "#777", "700");
  });
}

function grid(ctx, left, top, w, h) {
  ctx.strokeStyle = "#e9eee9";
  ctx.lineWidth = 1;
  for (let i=0;i<=4;i++) {
    const y = top + h*i/4;
    ctx.beginPath();
    ctx.moveTo(left,y);
    ctx.lineTo(left+w,y);
    ctx.stroke();
  }
}

function drawText(ctx, text, x, y, size=14, color="#111", weight="700") {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillText(text, x, y);
}

function roundRect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
  ctx.fill();
}

function hexToSoft(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0,2),16);
  const g = parseInt(clean.slice(2,4),16);
  const b = parseInt(clean.slice(4,6),16);
  return `rgba(${r},${g},${b},0.12)`;
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 100);
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

render();
