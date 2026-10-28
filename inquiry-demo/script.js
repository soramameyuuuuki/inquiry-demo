"use strict";

// すべてのデータを1つの配列で管理し、変更時にlocalStorageへ保存します。
const STORAGE_KEY = "tsunagu.inquiries.v1";
const STATUSES = ["未対応", "対応中", "完了"];
const STATUS_CLASSES = { "未対応": "status-pending", "対応中": "status-active", "完了": "status-done" };
let inquiries = [];
let currentFilter = "all";
let pendingDeleteId = null;
let storageReadable = true;
let feedbackTimer;

const list = document.querySelector("#inquiry-list");
const form = document.querySelector("#inquiry-form");
const createDialog = document.querySelector("#create-dialog");
const deleteDialog = document.querySelector("#delete-dialog");
const dateInput = document.querySelector("#received-date");
const contentInput = document.querySelector("#inquiry-content");
const assigneeInput = document.querySelector("#assignee");

// UTCではなく、この端末の現地日付を使用します。
function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() > 0 &&
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` === value;
}

function validRecord(item) {
  return item && typeof item.id === "string" && item.id.length > 0 &&
    validDate(item.receivedDate) && typeof item.content === "string" &&
    item.content.trim().length > 0 && item.content.length <= 2000 &&
    typeof item.assignee === "string" && item.assignee.trim().length > 0 &&
    item.assignee.length <= 50 && STATUSES.includes(item.status);
}

function notify(message, isError = false) {
  const feedback = document.querySelector("#feedback");
  clearTimeout(feedbackTimer);
  feedback.textContent = message;
  feedback.className = isError ? "feedback error" : "feedback";
  feedback.hidden = false;
  if (!isError) feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 4500);
}

function loadInquiries() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(validRecord) || new Set(parsed.map(item => item.id)).size !== parsed.length) {
      throw new Error("Invalid saved data");
    }
    inquiries = parsed;
  } catch {
    // 壊れた保存データを空の配列で上書きしないようにします。
    storageReadable = false;
    notify("保存データを読み込めませんでした。データ保護のため更新を停止しています。ブラウザーの保存設定をご確認ください。", true);
  }
}

function saveInquiries(nextInquiries) {
  if (!storageReadable) return false;
  try {
    // 保存に成功してから画面上のデータを変更します。
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextInquiries));
    inquiries = nextInquiries;
    return true;
  } catch {
    notify("保存できませんでした。ブラウザーの保存設定や空き容量をご確認ください。変更は反映されていません。", true);
    return false;
  }
}

function cell(text, className) {
  const td = document.createElement("td");
  // 入力値はHTMLへ埋め込まず、必ずテキストとして表示します。
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function render() {
  const counts = Object.fromEntries(STATUSES.map(status => [status, inquiries.filter(item => item.status === status).length]));
  document.querySelector("#count-all").textContent = inquiries.length;
  document.querySelector("#count-pending").textContent = counts["未対応"];
  document.querySelector("#count-active").textContent = counts["対応中"];
  document.querySelector("#count-done").textContent = counts["完了"];
  document.querySelector("#list-total").textContent = inquiries.length;
  document.querySelectorAll(".filter").forEach(button => {
    const filter = button.dataset.filter;
    const selected = filter === currentFilter;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.querySelector("span").textContent = filter === "all" ? inquiries.length : counts[filter];
  });

  const visible = inquiries.filter(item => currentFilter === "all" || item.status === currentFilter)
    .slice().sort((a, b) => b.receivedDate.localeCompare(a.receivedDate));
  document.querySelector("#visible-count").textContent = `${visible.length}件を表示`;
  list.replaceChildren();

  visible.forEach(item => {
    const row = document.createElement("tr");
    row.append(cell(item.receivedDate.replaceAll("-", "/")), cell(item.content, "inquiry-content"), cell(item.assignee, "assignee-name"));
    const statusCell = document.createElement("td");
    const select = document.createElement("select");
    select.className = `status-select ${STATUS_CLASSES[item.status]}`;
    select.setAttribute("aria-label", `${item.content.slice(0, 30)} の対応状況`);
    select.disabled = !storageReadable;
    STATUSES.forEach(status => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      select.append(option);
    });
    select.value = item.status;
    select.addEventListener("change", () => {
      const nextStatus = select.value;
      if (saveInquiries(inquiries.map(record => record.id === item.id ? { ...record, status: nextStatus } : record))) {
        render();
        // 再描画後もキーボード操作の位置を維持します。
        const remainingRow = [...list.children].find(element => element.dataset.id === item.id);
        if (remainingRow) remainingRow.querySelector("select").focus();
        else document.querySelector(".filter.selected").focus();
        notify(`対応状況を「${nextStatus}」に変更しました。`);
      } else select.value = item.status;
    });
    statusCell.append(select);
    const actionCell = document.createElement("td");
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "delete-button";
    removeButton.setAttribute("aria-label", `${item.content.slice(0, 30)} を削除`);
    removeButton.title = "問い合わせを削除";
    removeButton.disabled = !storageReadable;
    // アイコンの固定SVGにも入力値を使用しません。
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7");
    svg.append(path);
    removeButton.append(svg);
    removeButton.addEventListener("click", () => {
      pendingDeleteId = item.id;
      document.querySelector("#delete-preview").textContent = item.content.length > 120 ? `${item.content.slice(0, 120)}…` : item.content;
      document.querySelector("#delete-error").hidden = true;
      deleteDialog.showModal();
    });
    actionCell.append(removeButton);
    row.dataset.id = item.id;
    row.append(statusCell, actionCell);
    list.append(row);
  });

  document.querySelector("#empty-state").hidden = visible.length !== 0;
  document.querySelector("#empty-title").textContent = inquiries.length ? `「${currentFilter}」の問い合わせはありません` : "問い合わせはまだありません";
  document.querySelector("#empty-description").textContent = inquiries.length ? "ほかの対応状況を選ぶと、問い合わせを確認できます。" : "「問い合わせを登録」から、最初の1件を追加しましょう。";
  document.querySelector("#open-create").disabled = !storageReadable;
}

document.querySelector("#today").textContent = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date());
document.querySelector("#open-create").addEventListener("click", () => {
  form.reset();
  dateInput.value = localDate();
  document.querySelector("#form-error").hidden = true;
  createDialog.showModal();
});
["#close-create", "#cancel-create"].forEach(id => document.querySelector(id).addEventListener("click", () => createDialog.close()));
[contentInput, assigneeInput].forEach(input => input.addEventListener("input", () => input.setCustomValidity("")));

form.addEventListener("submit", event => {
  event.preventDefault();
  const content = contentInput.value.trim();
  const assignee = assigneeInput.value.trim();
  contentInput.setCustomValidity(content ? "" : "問い合わせ内容を入力してください。");
  assigneeInput.setCustomValidity(assignee ? "" : "担当者を入力してください。");
  if (!form.reportValidity()) return;
  if (!validDate(dateInput.value)) {
    document.querySelector("#form-error").textContent = "有効な受付日を入力してください。";
    document.querySelector("#form-error").hidden = false;
    return;
  }
  const record = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    receivedDate: dateInput.value,
    content,
    assignee,
    status: document.querySelector("#initial-status").value
  };
  if (saveInquiries([record, ...inquiries])) {
    currentFilter = "all";
    render();
    createDialog.close();
    notify("問い合わせを登録しました。");
  } else {
    document.querySelector("#form-error").textContent = "保存できませんでした。入力内容は保持しています。ブラウザーの保存設定や空き容量をご確認ください。";
    document.querySelector("#form-error").hidden = false;
  }
});

document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  currentFilter = button.dataset.filter;
  render();
}));
document.querySelector("#cancel-delete").addEventListener("click", () => deleteDialog.close());
deleteDialog.addEventListener("close", () => { pendingDeleteId = null; });
document.querySelector("#confirm-delete").addEventListener("click", () => {
  if (pendingDeleteId === null) return;
  if (saveInquiries(inquiries.filter(item => item.id !== pendingDeleteId))) {
    deleteDialog.close();
    render();
    document.querySelector(".filter.selected").focus();
    notify("問い合わせを削除しました。");
  } else {
    document.querySelector("#delete-error").textContent = "削除を保存できませんでした。データは削除されていません。";
    document.querySelector("#delete-error").hidden = false;
  }
});

// 同じブラウザーの別タブで変更した場合も最新の一覧へ更新します。
window.addEventListener("storage", event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  inquiries = [];
  storageReadable = true;
  loadInquiries();
  deleteDialog.close();
  render();
  if (storageReadable) notify("別のタブでの変更を反映しました。");
});

loadInquiries();
render();
