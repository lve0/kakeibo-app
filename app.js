
const defaultCategories = ["食費", "日用品", "交通費", "交際費", "趣味", "美容", "固定費"];

const yen = (n) => "¥" + Math.round(Number(n || 0)).toLocaleString("ja-JP");
const ym = (date = new Date()) => date.toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

let state = loadState();

function loadState() {
  const saved = localStorage.getItem("kakeiboState");
  if (saved) return JSON.parse(saved);

  const month = ym();
  return {
    categories: defaultCategories,
    months: {
      [month]: {
        income: 0,
        budgets: Object.fromEntries(defaultCategories.map(c => [c, 0]))
      }
    },
    expenses: [],
    settings: {
      theme: "koreanCafe",
      dailyReminderOn: false,
      dailyReminderTime: "21:00",
      categoryAlerts: {}
    }
  };
}

function saveState() {
  localStorage.setItem("kakeiboState", JSON.stringify(state));
}

function ensureMonth(month) {
  if (!state.months[month]) {
    state.months[month] = {
      income: 0,
      budgets: Object.fromEntries(state.categories.map(c => [c, 0]))
    };
  }
  state.categories.forEach(c => {
    if (state.months[month].budgets[c] === undefined) state.months[month].budgets[c] = 0;
  });
}

let selectedMonth = ym();
let graphMode = "annual";

function setPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
  document.getElementById(pageId).classList.add("active-page");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === pageId));
  render();
}

document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-page]");
  if (nav) setPage(nav.dataset.page);

  const jump = e.target.closest("[data-page-jump]");
  if (jump) setPage(jump.dataset.pageJump);

  const tab = e.target.closest("[data-graph]");
  if (tab) {
    graphMode = tab.dataset.graph;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.graph === graphMode));
    renderGraph();
  }
});

document.getElementById("expenseDate").value = today();
document.getElementById("filterMonth").value = selectedMonth;
document.getElementById("settingMonth").value = selectedMonth;

document.getElementById("saveExpense").addEventListener("click", () => {
  const date = document.getElementById("expenseDate").value || today();
  const amount = Number(document.getElementById("expenseAmount").value);
  const category = document.getElementById("expenseCategory").value;
  const memo = document.getElementById("expenseMemo").value.trim();

  if (!amount || amount <= 0) return showMessage("金額を入力してね");
  if (!category) return showMessage("カテゴリを選んでね");

  state.expenses.push({
    id: crypto.randomUUID(),
    date,
    amount,
    category,
    memo,
    receiptName: document.getElementById("receiptImage").files[0]?.name || ""
  });

  saveState();
  document.getElementById("expenseAmount").value = "";
  document.getElementById("expenseMemo").value = "";
  document.getElementById("receiptImage").value = "";
  showMessage("保存したよ");
  render();
});

function showMessage(text) {
  document.getElementById("inputMessage").textContent = text;
  setTimeout(() => document.getElementById("inputMessage").textContent = "", 1800);
}

document.getElementById("saveMonthSettings").addEventListener("click", () => {
  const month = document.getElementById("settingMonth").value || selectedMonth;
  ensureMonth(month);
  state.months[month].income = Number(document.getElementById("settingIncome").value || 0);
  state.categories.forEach(c => {
    const input = document.querySelector(`[data-budget="${CSS.escape(c)}"]`);
    state.months[month].budgets[c] = Number(input?.value || 0);
  });
  selectedMonth = month;
  saveState();
  render();
});

document.getElementById("addCategory").addEventListener("click", () => {
  const name = document.getElementById("newCategoryName").value.trim();
  if (!name || state.categories.includes(name)) return;
  state.categories.push(name);
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

document.getElementById("importData").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state = JSON.parse(await file.text());
  saveState();
  render();
});

["filterMonth", "filterCategory", "filterKeyword"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderHistory);
});

function monthExpenses(month) {
  return state.expenses.filter(e => e.date.startsWith(month));
}

function categorySpent(month, category) {
  return monthExpenses(month).filter(e => e.category === category).reduce((s, e) => s + Number(e.amount), 0);
}

function render() {
  ensureMonth(selectedMonth);
  renderSelectors();
  renderHome();
  renderHistory();
  renderSettings();
  renderGraph();
}

function renderSelectors() {
  const options = state.categories.map(c => `<option value="${c}">${c}</option>`).join("");
  document.getElementById("expenseCategory").innerHTML = options;
  document.getElementById("filterCategory").innerHTML = `<option value="">すべて</option>${options}`;
}

function renderHome() {
  const month = selectedMonth;
  const data = state.months[month];
  const expenses = monthExpenses(month);
  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);

  document.getElementById("currentMonthLabel").textContent = month;
  document.getElementById("incomeView").textContent = yen(data.income);
  document.getElementById("expenseView").textContent = yen(totalExpense);
  document.getElementById("balanceView").textContent = yen(data.income - totalExpense);

  document.getElementById("categoryCards").innerHTML = state.categories.map(c => {
    const budget = Number(data.budgets[c] || 0);
    const spent = categorySpent(month, c);
    const left = budget - spent;
    const rate = budget ? Math.min(spent / budget, 1) : 0;
    const status = budget && spent >= budget ? "danger" : budget && spent >= budget * 0.8 ? "warn" : "";
    return `
      <div class="category-card ${status}">
        <span>${c}</span>
        <strong>${yen(left)}</strong>
        <small>予算 ${yen(budget)} / 使用 ${yen(spent)}</small>
        <div class="progress"><span style="width:${rate * 100}%"></span></div>
      </div>
    `;
  }).join("");

  document.getElementById("recentList").innerHTML = expenses.slice(-5).reverse().map(e => `
    <div class="list-item"><span>${e.date} ${e.memo || e.category}</span><strong>${yen(e.amount)}</strong></div>
  `).join("") || `<p class="muted">まだ支出がありません</p>`;

  drawPie("pieCanvas", state.categories.map(c => categorySpent(month, c)));
}

function renderHistory() {
  const month = document.getElementById("filterMonth").value || selectedMonth;
  const cat = document.getElementById("filterCategory").value;
  const keyword = document.getElementById("filterKeyword").value.trim();

  let items = monthExpenses(month);
  if (cat) items = items.filter(e => e.category === cat);
  if (keyword) items = items.filter(e => (e.memo || "").includes(keyword));

  document.getElementById("monthlyTotals").innerHTML = state.categories.map(c => `
    <div class="list-item"><span>${c}</span><strong>${yen(categorySpent(month, c))}</strong></div>
  `).join("");

  document.getElementById("historyList").innerHTML = items.slice().reverse().map(e => `
    <div class="list-item">
      <span>${e.date}｜${e.category}｜${e.memo || "メモなし"}</span>
      <strong>${yen(e.amount)}</strong>
    </div>
  `).join("") || `<p class="muted">該当する支出がありません</p>`;
}

function renderSettings() {
  ensureMonth(selectedMonth);
  document.getElementById("settingMonth").value = selectedMonth;
  document.getElementById("settingIncome").value = state.months[selectedMonth].income;

  document.getElementById("budgetInputs").innerHTML = state.categories.map(c => `
    <label>${c}<input data-budget="${c}" type="number" value="${state.months[selectedMonth].budgets[c] || 0}" /></label>
  `).join("");

  document.getElementById("categorySettings").innerHTML = state.categories.map(c => `
    <div class="list-item">
      <span>${c}</span>
      <button onclick="deleteCategory('${c}')">削除</button>
    </div>
  `).join("");
}

window.deleteCategory = function(name) {
  if (state.categories.length <= 1) return;
  state.categories = state.categories.filter(c => c !== name);
  Object.keys(state.months).forEach(m => delete state.months[m].budgets[name]);
  state.expenses = state.expenses.filter(e => e.category !== name);
  saveState();
  render();
}

function renderGraph() {
  const canvas = document.getElementById("graphCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#2f2f2f";
  ctx.font = "22px sans-serif";

  if (graphMode === "monthly") {
    ctx.fillText("月間カテゴリ割合", 30, 40);
    drawPie("graphCanvas", state.categories.map(c => categorySpent(selectedMonth, c)), true);
    return;
  }

  if (graphMode === "trend") {
    drawTrend(ctx, canvas);
    return;
  }

  drawAnnual(ctx, canvas);
}

function drawAnnual(ctx, canvas) {
  ctx.fillText("年間支出", 30, 40);
  const year = selectedMonth.slice(0, 4);
  const values = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, "0")}`;
    return monthExpenses(m).reduce((s, e) => s + Number(e.amount), 0);
  });
  const max = Math.max(...values, 1);
  const w = 48;
  values.forEach((v, i) => {
    const h = (v / max) * 280;
    const x = 60 + i * 65;
    const y = 360 - h;
    ctx.fillStyle = "#b9aa9a";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#7d7066";
    ctx.font = "14px sans-serif";
    ctx.fillText(`${i + 1}月`, x + 8, 390);
  });
}

function drawTrend(ctx, canvas) {
  ctx.fillText("カテゴリ推移", 30, 40);
  const year = selectedMonth.slice(0, 4);
  const cat = state.categories[0];
  const values = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, "0")}`;
    return categorySpent(m, cat);
  });
  const max = Math.max(...values, 1);
  ctx.strokeStyle = "#7d7066";
  ctx.lineWidth = 4;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = 70 + i * 70;
    const y = 360 - (v / max) * 280;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = "#8b837a";
  ctx.font = "16px sans-serif";
  ctx.fillText(`表示中：${cat}`, 30, 75);
}

function drawPie(canvasId, values, large = false) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!large) ctx.clearRect(0, 0, canvas.width, canvas.height);
  const total = values.reduce((a, b) => a + b, 0);
  const cx = large ? 450 : 180;
  const cy = large ? 230 : 130;
  const r = large ? 130 : 85;

  if (!total) {
    ctx.fillStyle = "#8b837a";
    ctx.font = "16px sans-serif";
    ctx.fillText("データなし", cx - 35, cy);
    return;
  }

  const colors = ["#b9aa9a", "#d5c7b6", "#a9b0a3", "#c7b0a1", "#d8d0c8", "#9b9288", "#e8d8c7"];
  let start = -Math.PI / 2;
  values.forEach((v, i) => {
    const angle = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    start += angle;
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

render();
