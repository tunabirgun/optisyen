import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { exportScores } from "./export.js";
const el = (id) => document.getElementById(id),
  letters = "ABCDEF",
  fmt = (n) => n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
let focusQuestion = 0,
  keyReasons = [],
  editing = null,
  alignedDraft = null;
let dual = false,
  keyPage = 1,
  keyType = "",
  keys = {};
let keyDoc,
  studentDoc,
  blocks = [],
  pending = null,
  source,
  key = [],
  records = [],
  current = -1,
  phase = "setup",
  shifting = false,
  busy = false;
const count = () => Number(el("count").value),
  options = () => Number(el("choices").value);
const status = (message) => (el("status").textContent = message);
const assigned = () =>
  blocks.filter((b) => !b.id).reduce((n, b) => n + b.rows, 0);
function weights() {
  if (el("mode").value === "equal")
    return Array(count()).fill(Number(el("total").value) / count());
  return [...el("weights").querySelectorAll("input")].map((input) =>
    input.value === "" ? NaN : Number(input.value),
  );
}
function settings(rebuild = false) {
  if (!el("count").checkValidity() || !count()) return;
  const custom = el("mode").value === "custom";
  el("total").disabled = custom;
  if (rebuild) {
    const before = [...el("weights").querySelectorAll("input")].map(
      (v) => v.value,
    );
    el("weights").replaceChildren();
    if (custom)
      for (let i = 0; i < count(); i++) {
        const lab = document.createElement("label"),
          input = document.createElement("input");
        lab.textContent = i + 1 + ". soru";
        input.type = "number";
        input.min = 0;
        input.step = "any";
        input.value =
          before[i] ?? (Number(el("total").value) / count()).toFixed(3);
        lab.append(input);
        el("weights").append(lab);
      }
  }
  const w = weights(),
    sum = w.reduce((a, b) => a + b, 0);
  el("summary").textContent = custom
    ? "Toplam: " + fmt(sum) + " puan"
    : count() +
      " soru × " +
      fmt(w[0]) +
      " puan = " +
      fmt(Number(el("total").value)) +
      " puan";
  if (phase === "done") results();
}
for (const id of ["count", "mode", "total", "weights"])
  el(id).addEventListener("input", () =>
    settings(id === "count" || id === "mode"),
  );
const groupMode = () =>
  document.querySelector('input[name="group"]:checked')?.value;
el("groupMode").onchange = () => {
  const ab = groupMode() === "ab";
  el("setup").hidden = false;
  el("keyHelp").textContent = ab
    ? "A ve B cevap anahtarlarını aynı PDF’ye ekleyin. Her sayfada kitapçık türünü işaretleyin."
    : "Tüm öğrenciler için geçerli tek sayfalık cevap anahtarını yükleyin.";
  el("studentHelp").textContent = ab
    ? "A ve B formları karışık sırada olabilir. Her öğrenci için bir sayfa kullanın."
    : "Öğrenci formlarını tek PDF olarak yükleyin. Her öğrenci için bir sayfa kullanın.";
};
function validate() {
  const w = weights();
  if (
    !Number.isInteger(count()) ||
    count() < 1 ||
    count() > 200 ||
    w.length !== count() ||
    w.some((v) => !Number.isFinite(v) || v < 0) ||
    !w.some((v) => v > 0)
  )
    throw Error("Soru sayısını ve puanları kontrol edin.");
}
async function action(fn) {
  if (busy) return;
  busy = true;
  el("work").inert = true;
  el("layout").inert = true;
  el("prepare").disabled = el("demo").disabled = true;
  try {
    await fn();
  } catch (error) {
    status(error.message || String(error));
  } finally {
    busy = false;
    el("work").inert = el("layout").inert = false;
    el("prepare").disabled = el("demo").disabled = false;
  }
}
async function getDoc(file) {
  return pdfjsLib.getDocument({
    data: await file.arrayBuffer(),
    isEvalSupported: false,
    useWasm: false,
    useSystemFonts: true,
    isOffscreenCanvasSupported: false,
  }).promise;
}
async function raster(doc, n) {
  const page = await doc.getPage(n),
    base = page.getViewport({ scale: 1 }),
    v = page.getViewport({ scale: 1550 / Math.max(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(v.width);
  canvas.height = Math.round(v.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport: v }).promise;
  page.cleanup();
  return canvas;
}
async function start(k, s) {
  validate();
  if (!groupMode()) throw Error("Önce sınav düzenini seçin.");
  if (!k || !s) throw Error("Cevap anahtarını ve öğrenci PDF’sini seçin.");
  let kd, sd;
  try {
    kd = await getDoc(k);
    if (kd.numPages !== (groupMode() === "ab" ? 2 : 1))
      throw Error(
        "Tek ortak anahtar için bir, A/B düzeni için iki anahtar sayfası yükleyin.",
      );
    sd = await getDoc(s);
    source = await raster(kd, 1);
  } catch (e) {
    await kd?.destroy();
    await sd?.destroy();
    throw e;
  }
  await keyDoc?.destroy();
  await studentDoc?.destroy();
  keyDoc = kd;
  studentDoc = sd;
  dual = groupMode() === "ab";
  el("groupMode").disabled = true;
  keyPage = 1;
  keyType = "";
  keys = {};
  key = [];
  records = [];
  blocks = [];
  current = -1;
  phase = "layout";
  pending = null;
  shifting = false;
  editing = null;
  alignedDraft = null;
  el("issues").hidden = true;
  el("configDetails").open = false;
  el("reset").hidden = false;
  el("layout").hidden = el("work").hidden = false;
  el("review").hidden = el("results").hidden = true;
  el("count").disabled = el("choices").disabled = true;
  el("pageTitle").textContent = "Cevap anahtarı";
  el("rows").value = count();
  layout();
  paint();
  status(
    sd.numPages +
      " öğrenci sayfası açıldı. İlk soru bloğunu tanımlayın veya kayıtlı düzeni seçin.",
  );
}
el("reset").onclick = () => {
  if (!busy && confirm("Bu sınavı kapatıp yeni sınava geçilsin mi?"))
    location.reload();
};
el("prepare").onclick = () =>
  action(() => start(el("keyFile").files[0], el("students").files[0]));
function layout() {
  el("addName").disabled = blocks.some((b) => b.id === "name");
  el("addBook").hidden = !dual;
  el("addBook").disabled = blocks.some((b) => b.id === "booklet");
  el("layoutInfo").textContent =
    assigned() +
    " / " +
    count() +
    " soru tanımlandı" +
    (blocks.some((b) => b.id === true) ? " · Numara alanı hazır" : "");
  el("read").disabled = assigned() !== count() || !!pending;
  el("saveLayout").disabled = el("read").disabled;
  try {
    el("reuse").hidden = !localStorage.getItem(layoutKey());
  } catch {
    el("reuse").hidden = true;
  }
  el("addBlock").disabled = assigned() >= count();
  el("addId").disabled = blocks.some((b) => b.id === true);
  if (!pending) {
    el("hint").textContent = "Okuma alanları form üzerinde gösterilir.";
    return;
  }
  const i = pending.points.length;
  if (pending.id === "name") {
    const a = pending.alphabet;
    el("hint").textContent =
      [
        "İlk sütundaki " + a[0] + " baloncuğu",
        "Son sütundaki " + a[0] + " baloncuğu",
        "İlk sütundaki " + a.at(-1) + " baloncuğu",
      ][i] + " üzerine tıklayın.";
    return;
  }
  if (pending.id === "booklet") {
    el("hint").textContent =
      (i === 0 ? "A" : "B") + " kitapçığının baloncuğuna tıklayın.";
    return;
  }
  el("hint").textContent = pending.id
    ? [
        "İlk hanenin 0 baloncuğuna tıklayın.",
        "Son hanenin 0 baloncuğuna tıklayın.",
        "İlk hanenin 9 baloncuğuna tıklayın.",
      ][i]
    : [
        "Bu bloktaki ilk sorunun A baloncuğuna tıklayın.",
        "İlk sorunun son şıkkına tıklayın.",
        "Bu bloktaki son sorunun A baloncuğuna tıklayın.",
      ][i];
}
function add(id) {
  let rows, cols, alphabet;
  if (id === "name") {
    alphabet = el("alphabet")
      .value.normalize("NFC")
      .toLocaleUpperCase("tr")
      .replace(/\s+/g, "");
    rows = alphabet.length;
    cols = Number(el("nameCols").value);
    if (
      !/^[\p{L}]{2,60}$/u.test(alphabet) ||
      new Set(alphabet).size !== rows ||
      !el("nameCols").checkValidity() ||
      cols < 1
    ) {
      status("Sütun sayısını ve tekrarsız harf sırasını kontrol edin.");
      return;
    }
  } else if (id === "booklet") {
    rows = 1;
    cols = 2;
  } else if (id === true) {
    rows = 10;
    cols = Number(el("digits").value);
    if (!Number.isInteger(cols) || cols < 1 || cols > 20) {
      status("1 ile 20 arasında hane sayısı girin.");
      return;
    }
  } else {
    rows = Number(el("rows").value);
    cols = options();
    if (!Number.isInteger(rows) || rows < 1 || rows > count() - assigned()) {
      status("Bloktaki soru sayısını kontrol edin.");
      return;
    }
  }
  pending = { id, rows, cols, alphabet, points: [] };
  layout();
}
el("addBlock").onclick = () => add(false);
el("addId").onclick = () => add(true);
el("addName").onclick = () => add("name");
el("addBook").onclick = () => add("booklet");
el("undo").onclick = () => {
  if (!pending) blocks.pop();
  pending = null;
  el("rows").value = Math.max(1, count() - assigned());
  layout();
  paint();
};
function centers(b, shift = [0, 0]) {
  const [a, right, bottom] = b.points;
  return Array.from({ length: b.rows }, (_, r) =>
    Array.from({ length: b.cols }, (_, c) =>
      [0, 1].map(
        (k) =>
          a[k] +
          shift[k] +
          (b.rowOffsets?.[r]?.[k] || 0) +
          ((right[k] - a[k]) * c) / Math.max(1, b.cols - 1) +
          ((bottom[k] - a[k]) * r) / Math.max(1, b.rows - 1),
      ),
    ),
  );
}
function radius(grid, w, h) {
  const a = grid[0][0],
    neighbors = [grid[0][1], grid[1]?.[0]].filter(Boolean);
  return Math.max(
    1.5,
    Math.min(
      15,
      ...neighbors.map(
        (p) => Math.hypot((p[0] - a[0]) * w, (p[1] - a[1]) * h) * 0.22,
      ),
    ),
  );
}
function paint() {
  const c = el("scan");
  c.width = source.width;
  c.height = source.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const record = alignedDraft || records[current];
  const shift = record?.shift || [0, 0];
  let offset = 0;
  for (const b of record?.areas || blocks) {
    const grid = centers(b, shift),
      rad = radius(grid, c.width, c.height);
    grid.forEach((row, r) =>
      row.forEach(([x, y], col) => {
        const v = record ? record.answers : key;
        if (b.id === "booklet" && !dual) return;
        const selected =
          b.id === "name"
            ? record?.rawName[col] === b.alphabet[r]
            : b.id === "booklet"
              ? (record ? record.booklet : keyType) === letters[col]
              : b.id
                ? record?.rawId[col] === String(r)
                : v[offset + r] === letters[col];
        ctx.beginPath();
        ctx.arc(x * c.width, y * c.height, rad, 0, 2 * Math.PI);
        ctx.strokeStyle = selected ? "#08754a" : "#2673a9";
        ctx.lineWidth = selected ? 3 : 1.4;
        ctx.stroke();
      }),
    );
    if (!b.id) offset += b.rows;
  }
  if (!el("review").hidden && (!editing || editing.kind === "question")) {
    const areas = records[current]?.areas || blocks;
    const grid = areas.filter((b) => !b.id).flatMap((b) => centers(b, shift));
    const row = grid[focusQuestion];
    if (row) {
      const xs = row.map((p) => p[0] * c.width),
        ys = row.map((p) => p[1] * c.height);
      const pad = Math.hypot(xs[1] - xs[0], ys[1] - ys[0]) * 0.48;
      ctx.strokeStyle = "#8b571c";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        Math.min(...xs) - pad,
        Math.min(...ys) - pad,
        Math.max(...xs) - Math.min(...xs) + 2 * pad,
        Math.max(...ys) - Math.min(...ys) + 2 * pad,
      );
    }
  }
  for (const p of pending?.points || []) {
    ctx.fillStyle = "#c34d0a";
    ctx.fillRect(p[0] * c.width - 3, p[1] * c.height - 3, 6, 6);
  }
}
function measure(canvas, shift = [0, 0], areas = blocks) {
  const { width: w, height: h } = canvas,
    px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  function mark(point, r, pencil) {
    const x = Math.round(point[0] * w),
      y = Math.round(point[1] * h);
    r = Math.max(1, Math.round(r));
    if (x - r < 0 || x + r >= w || y - r < 0 || y + r >= h) return NaN;
    const gray = (xx, yy) => {
      const i = 4 * (yy * w + xx);
      return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
    };
    // Nearby paper provides a local white level for shadows and grey scans.
    const surround = [];
    for (let a = 0; a < 16; a++) {
      const xx = Math.round(x + 2.35 * r * Math.cos((a * Math.PI) / 8)),
        yy = Math.round(y + 2.35 * r * Math.sin((a * Math.PI) / 8));
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) surround.push(gray(xx, yy));
    }
    surround.sort((a, b) => a - b);
    const paper = surround[Math.floor(surround.length * 0.8)];
    if (!Number.isFinite(paper) || paper < 90) return NaN;
    let sum = 0,
      ink = 0,
      n = 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const contrast = Math.max(0, 1 - gray(x + dx, y + dy) / paper);
        sum += contrast;
        if (contrast > 0.24) ink++;
        n++;
      }
    // Sparse dark pencil strokes should trigger review even on a mostly empty bubble.
    return pencil
      ? Math.max(sum / n, Math.min(0.28, (0.48 * ink) / n))
      : sum / n;
  }
  let reason = "";
  function pick(values, symbols, pencil = false) {
    reason = "";
    if (values.some((v) => !Number.isFinite(v))) {
      reason = "Okuma alanı veya tarama kontrastı yetersiz.";
      return "?";
    }
    const [first, second] = values
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v);
    if (!pencil) {
      if (first.v < 0.16) return "-";
      return first.v < 0.32 || second.v > 0.32 || first.v - second.v < 0.15
        ? "?"
        : symbols[first.i];
    }
    const ordered = [...values].sort((a, b) => a - b);
    const printLevel = ordered.length >= 4 ? ordered[1] : 0;
    if (first.v < 0.075 || (first.v < 0.13 && first.v - printLevel < 0.045))
      return "-";
    if (second.v >= 0.14 || (second.v >= 0.085 && second.v > first.v * 0.36)) {
      reason = "Birden fazla iz var; silinmiş veya çift işaret olabilir.";
      return "?";
    }
    if (first.v < 0.32 || first.v - second.v < 0.18) {
      reason = "İşaret silik veya baloncuk kısmen doldurulmuş.";
      return "?";
    }
    return symbols[first.i];
  }
  const answers = [],
    reasons = [];
  let rawId = "",
    rawName = "",
    booklet = "";
  for (const b of areas) {
    const grid = centers(b, shift),
      r = radius(grid, w, h),
      // Sample the centre to keep preprinted outlines out of the ink measurement.
      values = grid.map((row) =>
        row.map((p) => mark(p, r * (b.id === "booklet" ? 0.5 : 0.72), !b.id)),
      );
    if (b.id === "booklet") {
      const label = pick(values[0], "AB");
      booklet = ["A", "B"].includes(label) ? label : "";
    } else if (b.id === "name") {
      for (let col = 0; col < b.cols; col++)
        rawName += pick(
          values.map((row) => row[col]),
          b.alphabet,
        );
    } else if (b.id) {
      for (let col = 0; col < b.cols; col++)
        rawId += pick(
          values.map((row) => row[col]),
          "0123456789",
        );
    } else
      for (const row of values) {
        const answer = pick(row, letters, true);
        answers.push(answer);
        reasons.push(reason);
      }
  }
  return {
    answers,
    reasons,
    booklet,
    rawId,
    rawName,
    studentName: rawName.replace(/-+/g, " ").trim(),
    areas,
    identity: /^\d+$/.test(rawId) ? rawId : "",
    shift,
  };
}
el("scan").onclick = (e) => {
  const rect = el("scan").getBoundingClientRect(),
    p = [
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
    ];
  if (shifting) {
    const record = records[current],
      areas = record.areas,
      anchor = centers(areas.find((b) => !b.id))[0][0];
    alignedDraft = measure(
      source,
      p.map((v, i) => v - anchor[i]),
      areas,
    );
    el("note").textContent =
      "Halkalar yerindeyse hizalamayı kaydedin. Tekrar denemek için ilk sorunun A baloncuğuna tıklayın.";
    paint();
    return;
  }
  if (!pending) return;
  pending.points.push(p);
  if (pending.cols === 1 && pending.points.length === 1) pending.points.push(p);
  if (pending.rows === 1 && pending.points.length === 2)
    pending.points.push(pending.points[0]);
  if (pending.points.length === 3) {
    const [a, b, c] = pending.points,
      dist = (p, q) =>
        Math.hypot((p[0] - q[0]) * source.width, (p[1] - q[1]) * source.height);
    if (
      (pending.cols > 1 && dist(a, b) / (pending.cols - 1) < 4) ||
      (pending.rows > 1 && dist(a, c) / (pending.rows - 1) < 4)
    ) {
      status("Baloncuklar ayırt edilemiyor. Alanı yeniden işaretleyin.");
      pending.points = [];
    } else {
      blocks.push(pending);
      pending = null;
      el("rows").value = Math.max(1, count() - assigned());
      status("Alan eklendi.");
    }
  }
  layout();
  paint();
};
el("read").onclick = () => {
  const read = measure(source);
  key = read.answers;
  keyReasons = read.reasons;
  keyType = read.booklet;
  focusQuestion = firstIssue(key, true);
  phase = "key";
  el("layout").hidden = true;
  review();
};
function button(parent, title, fn) {
  const b = document.createElement("button");
  b.textContent = title;
  b.onclick = fn;
  parent.append(b);
  return b;
}
function collectIssues() {
  const list = [],
    ids = new Map();
  for (const record of records)
    if (record.identity)
      ids.set(record.identity, (ids.get(record.identity) || 0) + 1);
  records.forEach((record, index) => {
    const add = (kind, label, detail, question) =>
      list.push({ index, kind, label, detail, question });
    if (record.checkAlignment) {
      add("alignment", "Sayfa hizası", "Baloncuk konumları doğrulanamadı.");
      return;
    }
    if (!record.identity && record.areas.some((b) => b.id === true))
      add("id", "Öğrenci numarası", "Numara okunamadı.");
    else if (ids.get(record.identity) > 1)
      add("id", "Öğrenci numarası", "Aynı numara birden fazla formda var.");
    if (
      record.studentName.includes("?") ||
      (!record.studentName && record.areas.some((b) => b.id === "name"))
    )
      add("name", "Adı ve soyadı", record.studentName || "Ad-soyad okunamadı.");
    if (dual && !keys[record.booklet])
      add(
        "book",
        "Kitapçık türü",
        "Kitapçık için bir anahtar eşleştirilemedi.",
      );
    record.answers.forEach((answer, i) => {
      if (answer === "?")
        add("question", i + 1 + ". soru", record.reasons[i], i);
    });
  });
  return list;
}
function listIssues() {
  const list = collectIssues();
  current = -1;
  editing = null;
  alignedDraft = null;
  shifting = false;
  el("work").hidden = el("review").hidden = true;
  el("issueList").replaceChildren();
  el("issues").hidden = !list.length;
  if (!list.length) {
    phase = "done";
    results();
    status(records.length + " form değerlendirildi. Sonuçlar hazır.");
    el("results").scrollIntoView({ block: "start" });
    return;
  }
  phase = "review";
  el("results").hidden = true;
  for (const issue of list) {
    const row = button(el("issueList"), "", () =>
      action(() => openIssue(issue)),
    );
    const label = document.createElement("strong"),
      detail = document.createElement("span");
    label.textContent = issue.index + 1 + ". sayfa · " + issue.label;
    detail.textContent = issue.detail;
    row.append(label, detail);
  }
  const pages = new Set(list.map((issue) => issue.index)).size;
  status(
    records.length +
      " form okundu. " +
      pages +
      " formda " +
      list.length +
      " alan kontrol bekliyor.",
  );
  el("issuesTitle").focus();
}
async function openIssue(issue) {
  const img = await raster(studentDoc, issue.index + 1);
  source = img;
  current = issue.index;
  editing = issue;
  alignedDraft = null;
  shifting = issue.kind === "alignment";
  focusQuestion = issue.question ?? 0;
  el("issues").hidden = true;
  el("work").hidden = false;
  review();
  if (issue.kind === "name") {
    const input = el("studentName");
    input.focus();
    selectUnknownLetter();
  } else {
    el("reviewTitle").tabIndex = -1;
    el("reviewTitle").focus();
  }
}
function selectUnknownLetter() {
  const input = el("studentName"),
    at = input.value.indexOf("?");
  if (at >= 0) input.setSelectionRange(at, at + 1);
}
for (const letter of "ÇĞIİÖŞÜ") {
  const key = button(el("nameLetters"), letter, () => {
    const input = el("studentName");
    input.setRangeText(letter, input.selectionStart, input.selectionEnd, "end");
    input.focus();
    selectUnknownLetter();
  });
  key.setAttribute("aria-label", letter + " harfini yaz");
}
function review() {
  const isKey = !editing,
    rec = records[current],
    kind = editing?.kind;
  el("review").hidden = false;
  el("nav").replaceChildren();
  el("nameLabel").querySelector(".name-scan")?.remove();
  el("bookLabel").hidden = isKey ? !dual : kind !== "book";
  el("bookType").value = isKey ? keyType : rec.booklet;
  el("idLabel").hidden = kind !== "id";
  el("nameLabel").hidden = el("nameLetters").hidden = kind !== "name";
  el("answers").hidden = !isKey && kind !== "question";
  el("confirm").hidden = kind === "question";
  el("reviewTitle").textContent = isKey ? "Anahtarı doğrula" : editing.label;
  el("pageTitle").textContent = isKey
    ? "Cevap anahtarı · " + keyPage + " / " + keyDoc.numPages
    : "Öğrenci formu · " + (current + 1) + " / " + records.length;
  el("hint").textContent =
    kind === "alignment"
      ? "İlk sorunun A baloncuğunun merkezine tıklayın."
      : "Mavi halkalar okuma alanlarını, yeşil halkalar seçilen işaretleri gösterir.";
  if (isKey) {
    if (keyPage === 1)
      button(el("nav"), "Alanları düzelt", () => {
        phase = "layout";
        key = [];
        el("review").hidden = true;
        el("layout").hidden = false;
        layout();
        paint();
      });
  } else {
    button(el("nav"), "Listeye dön", listIssues);
    el("identity").value = rec.identity;
    el("studentName").value = rec.studentName;
    el("nameHint").textContent =
      "Seçili harfi klavyeden veya aşağıdaki harflerden biriyle değiştirebilirsiniz.";
  }
  if (!el("answers").hidden)
    questionEditor(isKey, rec, isKey ? key : rec.answers);
  el("note").textContent = isKey
    ? "Her soru için doğru şıkkı kontrol edin."
    : kind === "question"
      ? "İşareti taramadan kontrol edin. Seçtiğiniz cevap kaydedilir."
      : editing.detail;
  el("confirm").textContent = isKey
    ? keyPage < keyDoc.numPages
      ? "Anahtarı onayla ve sonraki anahtarı aç"
      : "Anahtarı onayla ve formları oku"
    : "Düzeltmeyi kaydet";
  paint();
}
el("bookType").onchange = () => {
  if (!editing) {
    keyType = el("bookType").value;
    paint();
  }
};
el("confirm").onclick = () =>
  action(async () => {
    validate();
    if (current < 0) {
      if (key.some((v) => v === "?" || v === "-"))
        throw Error("Anahtardaki tüm soruların doğru şıkkını belirtin.");
      if (dual) {
        if (!keyType)
          throw Error("Anahtarın kitapçık türünü formdan kontrol edip seçin.");
        if (Object.hasOwn(keys, keyType) && keys[keyType].page !== keyPage)
          throw Error(
            "Bu kitapçık için bir anahtar zaten onaylandı. A ve B seçimlerini kontrol edin.",
          );
        if (keyPage < keyDoc.numPages) {
          const img = await raster(keyDoc, keyPage + 1),
            areas = blocks;
          keys[keyType] = { page: keyPage, answers: [...key] };
          keyPage++;
          source = img;
          blocks = areas;
          const read = measure(img);
          key = read.answers;
          keyReasons = read.reasons;
          keyType = read.booklet;
          focusQuestion = firstIssue(key, true);
          review();
          status("İkinci anahtarı kontrol edin.");
          return;
        }
        keys[keyType] = { page: keyPage, answers: [...key] };
      }
      const template = registrationTemplate(source),
        next = [];
      for (let i = 1; i <= studentDoc.numPages; i++) {
        status(i + " / " + studentDoc.numPages + " öğrenci formu okunuyor…");
        const img = await raster(studentDoc, i);
        try {
          const alignment = autoShift(img, template);
          const record = measure(img, alignment.shift);
          record.checkAlignment = !alignment.reliable;
          next.push(record);
        } finally {
          img.width = img.height = 1;
        }
      }
      records = next;
      listIssues();
      return;
    }
    const rec = records[current];
    switch (editing.kind) {
      case "alignment":
        if (!alignedDraft)
          throw Error("İlk sorunun A baloncuğunun merkezine tıklayın.");
        records[current] = alignedDraft;
        break;
      case "id": {
        const id = el("identity").value.trim();
        const digits = rec.areas.find((b) => b.id === true)?.cols;
        if (!id || (digits && (id.length !== digits || !/^[0-9]+$/.test(id))))
          throw Error(
            digits
              ? digits + " haneli öğrenci numarasını girin."
              : "Öğrenci numarasını girin.",
          );
        if (records.some((r, i) => i !== current && r.identity === id))
          throw Error("Bu numara başka bir formda var.");
        rec.identity = id;
        break;
      }
      case "name": {
        const name = el("studentName").value.trim();
        if (!name || name.includes("?"))
          throw Error("Belirsiz harfleri düzeltip adı ve soyadını girin.");
        rec.studentName = name;
        break;
      }
      case "book":
        if (!keys[el("bookType").value])
          throw Error("Onaylı anahtarı olan bir kitapçık seçin.");
        rec.booklet = el("bookType").value;
        break;
    }
    listIssues();
  });
function scoreRows() {
  const w = weights();
  return records.map((rec, i) => {
    const matchedKey = dual ? keys[rec.booklet].answers : key;
    const pts = rec.answers.map((v, i) => (v === matchedKey[i] ? w[i] : 0));
    return [
      rec.identity || String(i + 1),
      rec.studentName,
      ...(dual ? [rec.booklet] : []),
      ...pts,
      Number(pts.reduce((a, b) => a + b, 0).toFixed(8)),
    ];
  });
}
const headers = () => [
  blocks.some((b) => b.id === true) ? "Öğrenci No" : "Form No",
  "Adı Soyadı",
  ...(dual ? ["Kitapçık"] : []),
  ...key.map((_, i) => i + 1 + ". Soru"),
  "Toplam",
];
function scoreMeans(rows, firstScore) {
  if (!rows.length) return [];
  return rows[0]
    .slice(firstScore)
    .map(
      (_, i) =>
        rows.reduce((sum, row) => sum + row[firstScore + i], 0) / rows.length,
    );
}
function results() {
  el("results").hidden = false;
  const table = document.createElement("table");
  const rows = scoreRows(),
    firstScore = dual ? 3 : 2;
  const head = table.createTHead().insertRow(),
    body = table.createTBody();
  for (const title of headers()) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = title;
    head.append(cell);
  }
  for (const row of rows) {
    const tr = body.insertRow();
    for (const v of row)
      tr.insertCell().textContent = typeof v === "number" ? fmt(v) : v;
  }
  if (rows.length) {
    const footer = table.createTFoot().insertRow(),
      label = document.createElement("th");
    label.scope = "row";
    label.colSpan = firstScore;
    label.textContent = "Ortalama";
    footer.append(label);
    const means = scoreMeans(rows, firstScore);
    means.forEach((mean, i) => {
      const cell = footer.insertCell(),
        total = i === means.length - 1;
      const value = mean.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
      cell.title =
        (total ? "Sınav ortalaması" : i + 1 + ". Soru") +
        " · " +
        value +
        " · " +
        rows.length +
        " geçerli kayıt";
      cell.setAttribute("aria-label", cell.title);
      if (total)
        cell.appendChild(document.createElement("small")).textContent =
          "Sınav ort.";
      cell.append(value);
    });
  }
  el("scores").replaceChildren(table);
}
el("export").onclick = () =>
  action(async () => {
    validate();
    if (phase !== "done") throw Error("Bekleyen alanları düzeltin.");
    const rows = scoreRows(),
      first = dual ? 3 : 2;
    const answerKeys = dual
      ? Object.entries(keys).map(([group, k]) => [
          "",
          "Cevap anahtarı",
          group,
          ...k.answers,
        ])
      : [["", "Cevap anahtarı", ...key]];
    const responses = records.map((r, i) => [
      r.identity || String(i + 1),
      r.studentName,
      ...(dual ? [r.booklet] : []),
      ...r.answers,
    ]);
    const blob = await exportScores(
      headers(),
      rows,
      first,
      scoreMeans(rows, first),
      [...answerKeys, ...responses],
    );
    downloadWorkbook(blob, "Optisyen - Soru Bazında Puanlar.xlsx");
  });
el("groupMode").onchange();
settings(true);

// Use printed bubble outlines as local registration marks. Ignore the central
// answer area so a different set of student answers does not drive alignment.
function registrationTemplate(canvas) {
  const w = canvas.width,
    h = canvas.height,
    px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const pts = [];
  let maxShift = 12;
  for (const block of blocks) {
    const grid = centers(block),
      r = radius(grid, w, h);
    maxShift = Math.min(maxShift, Math.max(2, Math.floor(r)));
    const coords = grid.flat(),
      stride = Math.max(1, Math.floor(coords.length / 40));
    for (let i = 0; i < coords.length; i += stride) {
      const [nx, ny] = coords[i],
        x = Math.round(nx * w),
        y = Math.round(ny * h);
      for (let angle = 0; angle < 6; angle++) {
        const dx = Math.cos((angle * Math.PI) / 3),
          dy = Math.sin((angle * Math.PI) / 3);
        let edge = null,
          best = 45;
        for (let k = Math.max(1, Math.floor(r * 0.8)); k <= r * 2; k++) {
          const ix = Math.round(x + dx * k),
            iy = Math.round(y + dy * k);
          const ox = Math.round(ix + dx * 2),
            oy = Math.round(iy + dy * 2);
          if (
            Math.min(ix, iy, ox, oy) < 0 ||
            Math.max(ix, ox) >= w ||
            Math.max(iy, oy) >= h
          )
            continue;
          const contrast = px[4 * (oy * w + ox)] - px[4 * (iy * w + ix)];
          if (contrast > best) {
            best = contrast;
            edge = [ix / w, iy / h, ox / w, oy / h];
          }
        }
        if (edge) pts.push(edge);
      }
    }
  }
  return { pts, maxShift };
}
function autoShift(canvas, template) {
  if (template.pts.length < 12) return { shift: [0, 0], reliable: false };
  const w = canvas.width,
    h = canvas.height,
    px = canvas.getContext("2d").getImageData(0, 0, w, h).data,
    m = template.maxShift;
  const pairs = template.pts
    .map(([x, y, a, b]) => [
      Math.round(x * w),
      Math.round(y * h),
      Math.round(a * w),
      Math.round(b * h),
    ])
    .filter(
      (v) =>
        v[0] >= m &&
        v[0] < w - m &&
        v[1] >= m &&
        v[1] < h - m &&
        v[2] >= m &&
        v[2] < w - m &&
        v[3] >= m &&
        v[3] < h - m,
    )
    .map(([x, y, a, b]) => [4 * (y * w + x), 4 * (b * w + a)]);
  if (!pairs.length) return { shift: [0, 0], reliable: false };
  function score(x, y) {
    const off = 4 * (y * w + x);
    let n = 0;
    for (const [a, b] of pairs) n += px[b + off] - px[a + off];
    return n / pairs.length;
  }
  let best = score(0, 0),
    dx = 0,
    dy = 0;
  const initial = best;
  for (let y = -m; y <= m; y++)
    for (let x = -m; x <= m; x++) {
      const v = score(x, y);
      if (v > best) {
        best = v;
        dx = x;
        dy = y;
      }
    }
  return {
    shift: best > 40 && best - initial > 12 ? [dx / w, dy / h] : [0, 0],
    reliable: best > 38,
  };
}

el("demo").onclick = () =>
  action(async () => {
    const ab = groupMode() === "ab";
    const { PDFDocument, rgb } = await import("pdf-lib");
    async function sample(isKey) {
      const doc = await PDFDocument.create(),
        pages = isKey && !ab ? 1 : 2;
      for (let k = 0; k < pages; k++) {
        const page = doc.addPage([600, 800]),
          shift = k && !isKey ? 2 : 0;
        page.drawText(isKey ? "Cevap anahtari" : "Optik form " + (k + 1), {
          x: 48,
          y: 748,
          size: 20,
        });
        function bubble(x, y, marked) {
          page.drawCircle({
            x: x + shift,
            y: 800 - y - shift,
            size: 5,
            borderColor: rgb(0.2, 0.2, 0.2),
            borderWidth: 0.7,
            color: marked ? rgb(0.05, 0.05, 0.05) : rgb(1, 1, 1),
          });
        }
        if (ab) {
          for (let t = 0; t < 2; t++) {
            page.drawText(letters[t], { x: 359 + 30 * t, y: 410, size: 11 });
            bubble(362 + 30 * t, 405, t === k);
          }
        }
        for (let q = 0; q < 25; q++) {
          page.drawText(String(q + 1), {
            x: 56,
            y: 800 - (145 + q * 22) - 4,
            size: 10,
          });
          for (let a = 0; a < 5; a++)
            bubble(
              100 + a * 28,
              145 + q * 22,
              isKey || !k
                ? a === (q + (ab ? k : 0)) % 5
                : q === 0
                  ? false
                  : q === 1
                    ? a === 1 || a === 2
                    : a === (q + (ab ? k : 0)) % 5,
            );
        }
        for (let a = 0; a < 5; a++)
          page.drawText(letters[a], { x: 97 + a * 28, y: 676, size: 11 });
        const id = k ? "000102" : "000101";
        for (let digit = 0; digit < 10; digit++) {
          page.drawText(String(digit), {
            x: 335,
            y: 800 - (145 + digit * 21) - 4,
            size: 10,
          });
          for (let col = 0; col < 6; col++)
            bubble(
              362 + col * 22,
              145 + digit * 21,
              !isKey && Number(id[col]) === digit,
            );
        }
      }
      return new File(
        [await doc.save()],
        isKey ? "Anahtar.pdf" : "Öğrenci formları.pdf",
        { type: "application/pdf" },
      );
    }
    el("count").value = 25;
    el("choices").value = 5;
    el("mode").value = "equal";
    el("total").value = 100;
    settings(true);
    await start(await sample(true), await sample(false));
    const pt = (x, y) => [x / 600, y / 800];
    blocks = [
      {
        id: false,
        rows: 25,
        cols: 5,
        points: [pt(100, 145), pt(212, 145), pt(100, 673)],
      },
      {
        id: true,
        rows: 10,
        cols: 6,
        points: [pt(362, 145), pt(472, 145), pt(362, 334)],
      },
    ];
    if (ab)
      blocks.push({
        id: "booklet",
        rows: 1,
        cols: 2,
        points: [pt(362, 405), pt(392, 405), pt(362, 405)],
      });
    layout();
    paint();
    status(
      "Örnek sınav · 25 soru, 2 öğrenci. Alanlar hazır. Anahtarı okuyarak başlayın.",
    );
  });
function layoutKey() {
  return (
    "optisyen-public:grid:1:" + groupMode() + ":" + count() + ":" + options()
  );
}
el("saveLayout").onclick = () => {
  try {
    localStorage.setItem(layoutKey(), JSON.stringify(blocks));
    layout();
    status("Bu soru ve şık sayısı için form düzeni saklandı.");
  } catch {
    status("Tarayıcı düzeni saklayamadı. Bu sınava devam edebilirsiniz.");
  }
};
el("reuse").onclick = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(layoutKey()));
    if (
      !Array.isArray(saved) ||
      !saved.length ||
      saved.some(
        (b) =>
          !Number.isInteger(b.rows) ||
          b.rows < 1 ||
          b.rows > 200 ||
          !Number.isInteger(b.cols) ||
          b.cols < 1 ||
          b.cols > (b.id === "name" ? 60 : 20) ||
          (b.id === "name" &&
            (typeof b.alphabet !== "string" || b.alphabet.length !== b.rows)) ||
          b.points?.length !== 3 ||
          b.points.some(
            (p) =>
              p.length !== 2 ||
              p.some((v) => !Number.isFinite(v) || v < 0 || v > 1),
          ),
      ) ||
      saved.filter((b) => !b.id).reduce((n, b) => n + b.rows, 0) !== count()
    )
      throw Error();
    blocks = saved;
    pending = null;
    layout();
    paint();
    status(
      "Saklanan düzen yüklendi. Halkaların bu formdaki baloncuklara oturduğunu kontrol edin.",
    );
  } catch {
    status("Saklanan düzen okunamadı. Alanları yeniden tanımlayın.");
  }
};

function downloadWorkbook(blob, name) {
  const link = document.createElement("a"),
    url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function firstIssue(answers, isKey) {
  return Math.max(
    0,
    answers.findIndex((v) => v === "?" || (isKey && v === "-")),
  );
}
function questionEditor(isKey, rec, answers) {
  const panel = el("answers"),
    i = Math.min(focusQuestion, answers.length - 1);
  const isIssue = (v) => v === "?" || (isKey && v === "-");
  const issues = answers.flatMap((v, k) => (isIssue(v) ? [k] : []));
  const regions = (rec?.areas || blocks)
    .filter((b) => !b.id)
    .flatMap((b) => centers(b, rec?.shift));
  const row = regions[i];
  panel.replaceChildren();
  const head = document.createElement("div");
  head.className = "question-head";
  const title = document.createElement("h3");
  title.textContent = i + 1 + ". soru";
  head.append(title);
  const remaining = document.createElement("span");
  remaining.textContent = issues.length
    ? issues.length + " soru kontrol bekliyor"
    : "Cevaplar okunabilir";
  head.append(remaining);
  panel.append(head);
  if (row) {
    const xs = row.map((p) => p[0] * source.width),
      ys = row.map((p) => p[1] * source.height);
    const pitch = Math.hypot(xs[1] - xs[0], ys[1] - ys[0]);
    const x = Math.max(0, Math.min(...xs) - pitch * 0.75),
      y = Math.max(0, Math.min(...ys) - pitch * 0.52);
    const width = Math.min(
        source.width - x,
        Math.max(...xs) + pitch * 0.75 - x,
      ),
      height = Math.min(source.height - y, Math.max(...ys) + pitch * 0.52 - y);
    if (width > 0 && height > 0) {
      const crop = document.createElement("canvas");
      crop.className = "question-scan";
      crop.setAttribute("aria-label", i + 1 + ". sorunun orijinal taraması");
      crop.width = Math.ceil(width * 3);
      crop.height = Math.ceil(height * 3);
      crop
        .getContext("2d")
        .drawImage(source, x, y, width, height, 0, 0, crop.width, crop.height);
      panel.append(crop);
    }
  }
  const reason = document.createElement("p");
  reason.className = "question-reason";
  reason.textContent = isIssue(answers[i])
    ? (rec?.reasons || keyReasons)[i] || "İşareti taramadan kontrol edin."
    : answers[i] === "-"
      ? "Okunan cevap: Boş"
      : "Seçili cevap: " + answers[i];
  panel.append(reason);
  const choices = document.createElement("div");
  choices.className = "bubble-choices";
  panel.append(choices);
  for (const value of [
    ...letters.slice(0, options()),
    ...(isKey ? [] : ["-"]),
  ]) {
    const isIssueBefore = isIssue(answers[i]);
    const control = button(choices, value === "-" ? "Boş" : value, () => {
      answers[i] = value;
      if (!isKey) {
        listIssues();
        return;
      }
      const next = issues.find((k) => k > i) ?? issues.find((k) => k !== i);
      if (isIssueBefore && next !== undefined) focusQuestion = next;
      review();
      el("answers")
        .querySelector(".bubble-choices button")
        ?.focus({ preventScroll: true });
    });
    control.dataset.value = value;
    control.setAttribute("aria-pressed", String(answers[i] === value));
  }
  if (!isKey) return;
  const nav = document.createElement("div");
  nav.className = "question-nav";
  panel.append(nav);
  const move = (k) => {
    focusQuestion = k;
    review();
  };
  button(nav, "Önceki soru", () => move(i - 1)).disabled = i === 0;
  if (issues.some((k) => k !== i))
    button(nav, "Belirsiz soruya git", () => move(issues.find((k) => k !== i)));
  button(nav, "Sonraki soru", () => move(i + 1)).disabled =
    i === answers.length - 1;
  const jump = document.createElement("select");
  jump.setAttribute("aria-label", "Soruya git");
  answers.forEach((v, k) =>
    jump.add(
      new Option(
        k +
          1 +
          ". soru · " +
          (v === "?" ? "Kontrol gerekli" : v === "-" ? "Boş" : v),
        k,
      ),
    ),
  );
  jump.value = i;
  jump.onchange = () => move(Number(jump.value));
  nav.append(jump);
}
