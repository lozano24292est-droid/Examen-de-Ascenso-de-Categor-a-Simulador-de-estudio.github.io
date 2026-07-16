/* ===========================================================
   Examen de Ascenso de Categoría — lógica de la aplicación
   Vanilla JS, sin dependencias externas. Persiste en localStorage.
   =========================================================== */

(function(){
  "use strict";

  const STORAGE_KEY = "ddep_exam_attempts_v1";
  const MAX_ATTEMPTS = 4;
  const QUESTIONS_PER_SESSION = 50;

  const CAT_COLORS = [
    "#5B8FA8", // Neurociencia
    "#B8862F", // Currículum
    "#7A6BA6", // Convivencia
    "#3D7A54", // Innovación/TIC
    "#C0644A", // Estilos de aprendizaje
    "#A6472F", // Violencia intrafamiliar/género
    "#2E6E68", // Gestión de institutos
    "#8A9A4E", // Educación inclusiva
    "#D19A3D", // Motivación
    "#6C5B7B", // Anticorrupción
    "#7C7460", // Fundamentos generales
  ];

  const root = document.getElementById("view-root");

  // ---------- Utilidades ----------
  function shuffle(arr){
    const a = arr.slice();
    for(let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i+1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sample(arr, n){
    return shuffle(arr).slice(0, n);
  }

  function loadAttempts(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){ return []; }
  }

  function saveAttempts(list){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }catch(e){}
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }

  function catCounts(){
    const counts = new Array(CATEGORIES.length).fill(0);
    QUESTION_BANK.forEach(item => counts[item[1]]++);
    return counts;
  }

  // ---------- Muestreo estratificado por tema ----------
  function buildSessionQuestions(){
    const byCat = {};
    QUESTION_BANK.forEach(item => {
      (byCat[item[1]] = byCat[item[1]] || []).push(item);
    });
    const totalQ = QUESTION_BANK.length;
    const catIdxs = Object.keys(byCat).map(Number);

    // cuota proporcional por tema
    let quotas = {};
    let assigned = 0;
    catIdxs.forEach(ci => {
      const q = Math.floor(QUESTIONS_PER_SESSION * (byCat[ci].length / totalQ));
      quotas[ci] = q;
      assigned += q;
    });
    // repartir el resto entre los temas con más preguntas
    let remainder = QUESTIONS_PER_SESSION - assigned;
    const sortedByReste = catIdxs.slice().sort((a,b) => byCat[b].length - byCat[a].length);
    let i = 0;
    while(remainder > 0 && sortedByReste.length){
      const ci = sortedByReste[i % sortedByReste.length];
      if(quotas[ci] < byCat[ci].length){ quotas[ci]++; remainder--; }
      i++;
      if(i > 500) break;
    }

    let selected = [];
    catIdxs.forEach(ci => {
      selected = selected.concat(sample(byCat[ci], Math.min(quotas[ci], byCat[ci].length)));
    });

    // si faltan por redondeos, completar con aleatorios del resto
    if(selected.length < QUESTIONS_PER_SESSION){
      const selectedIds = new Set(selected.map(s => s[0]));
      const rest = QUESTION_BANK.filter(q => !selectedIds.has(q[0]));
      selected = selected.concat(sample(rest, QUESTIONS_PER_SESSION - selected.length));
    }

    return shuffle(selected).slice(0, QUESTIONS_PER_SESSION);
  }

  function buildOptionsFor(question){
    const [id, catIdx, q, a] = question;
    const sameCat = QUESTION_BANK.filter(item => item[1] === catIdx && item[0] !== id);
    let distractorPool = sameCat.length >= 3 ? sameCat : QUESTION_BANK.filter(item => item[0] !== id);
    const distractors = sample(distractorPool, 3).map(item => item[3]);
    const options = shuffle([a, ...distractors]);
    return options;
  }

  // ---------- Estado de sesión de examen ----------
  let session = null; // {questions, options[], index, records[]}

  function startExam(){
    const questions = buildSessionQuestions();
    session = {
      questions,
      optionsByIndex: questions.map(buildOptionsFor),
      index: 0,
      records: [],
      answered: false,
    };
    renderQuiz();
  }

  function selectOption(optIdx){
    if(session.answered) return;
    const q = session.questions[session.index];
    const options = session.optionsByIndex[session.index];
    const correctText = q[3];
    const chosenText = options[optIdx];
    const isCorrect = chosenText === correctText;

    session.answered = true;
    session.records.push({
      id: q[0], catIdx: q[1], q: q[2], correctText, chosenText, isCorrect
    });

    const optionEls = document.querySelectorAll(".option");
    optionEls.forEach((el, idx) => {
      el.disabled = true;
      if(options[idx] === correctText) el.classList.add("correct");
      else if(idx === optIdx) el.classList.add("incorrect");
      else el.classList.add("dimmed");
    });

    const note = document.getElementById("feedback-note");
    note.classList.add("show", isCorrect ? "ok" : "no");
    note.innerHTML = isCorrect
      ? `<b>Correcto</b>${escapeHtml(correctText)}`
      : `<b>Respuesta correcta</b>${escapeHtml(correctText)}`;

    const nextBtn = document.getElementById("next-btn");
    nextBtn.disabled = false;
    nextBtn.focus();
  }

  function nextQuestion(){
    if(session.index < session.questions.length - 1){
      session.index++;
      session.answered = false;
      renderQuiz();
    }else{
      finishExam();
    }
  }

  function finishExam(){
    const attempts = loadAttempts();
    const byCat = {};
    session.records.forEach(r => {
      byCat[r.catIdx] = byCat[r.catIdx] || {correct:0, total:0};
      byCat[r.catIdx].total++;
      if(r.isCorrect) byCat[r.catIdx].correct++;
    });
    const correctCount = session.records.filter(r => r.isCorrect).length;
    const attempt = {
      date: new Date().toISOString(),
      total: session.records.length,
      correct: correctCount,
      byCat,
      missed: session.records.filter(r => !r.isCorrect).map(r => ({
        id: r.id, q: r.q, chosenText: r.chosenText, correctText: r.correctText, catIdx: r.catIdx
      })),
    };
    attempts.push(attempt);
    saveAttempts(attempts.slice(0, MAX_ATTEMPTS));
    renderResults(attempt, attempts.length);
  }

  // ---------- Vistas ----------
  function renderHome(){
    const attempts = loadAttempts();
    const counts = catCounts();
    const usedUp = attempts.length >= MAX_ATTEMPTS;

    let dots = "";
    for(let i = 0; i < MAX_ATTEMPTS; i++){
      const cls = i < attempts.length ? "used" : (i === attempts.length ? "current" : "");
      dots += `<div class="attempt-dot ${cls}">${i+1}</div>`;
    }

    let catGrid = "";
    CATEGORIES.forEach((name, idx) => {
      catGrid += `<div class="cat-chip">
        <span class="dot" style="background:${CAT_COLORS[idx]}"></span>
        <span class="name">${escapeHtml(name)}</span>
        <span class="count">${counts[idx]}</span>
      </div>`;
    });

    root.innerHTML = `
      <section class="card">
        <p class="section-title">Practica con calma, hasta cuatro veces</p>
        <p class="muted">Cada intento toma ${QUESTIONS_PER_SESSION} preguntas al azar de las ${QUESTION_BANK.length} del banco oficial, repartidas proporcionalmente entre todos los temas. Al terminar, verás qué ramo necesita más repaso.</p>
        <div class="attempts-row">${dots}</div>
        <p class="muted" style="margin-top:6px;">Intentos usados: ${attempts.length} de ${MAX_ATTEMPTS}</p>
        ${usedUp ? `
          <div class="locked-note">Ya usaste tus ${MAX_ATTEMPTS} intentos. Revisa tu reporte final por ramo en el historial, o reinicia el ciclo si quieres volver a practicar desde cero.</div>
          <div class="btn-row">
            <button class="btn btn-primary" id="btn-history">Ver reporte final</button>
            <button class="btn btn-ghost" id="btn-reset">Reiniciar intentos</button>
          </div>
        ` : `
          <div class="btn-row">
            <button class="btn btn-primary" id="btn-start">Iniciar intento ${attempts.length+1}</button>
            ${attempts.length > 0 ? `<button class="btn btn-ghost" id="btn-history">Ver historial</button>` : ""}
          </div>
        `}
      </section>

      <section class="card">
        <p class="section-title">Modo estudio libre</p>
        <p class="muted">Repasa las preguntas y respuestas del banco sin calificación, por tema o todas mezcladas. Ideal antes de un intento formal.</p>
        <div class="btn-row"><button class="btn btn-gold" id="btn-study">Abrir modo estudio</button></div>
      </section>

      <section class="card">
        <p class="section-title">Temas del banco de preguntas</p>
        <p class="muted">${QUESTION_BANK.length} preguntas en total, distribuidas así:</p>
        <div class="cat-grid">${catGrid}</div>
      </section>
    `;

    const startBtn = document.getElementById("btn-start");
    if(startBtn) startBtn.addEventListener("click", startExam);
    const historyBtn = document.getElementById("btn-history");
    if(historyBtn) historyBtn.addEventListener("click", renderHistory);
    const studyBtn = document.getElementById("btn-study");
    if(studyBtn) studyBtn.addEventListener("click", () => renderStudy());
    const resetBtn = document.getElementById("btn-reset");
    if(resetBtn) resetBtn.addEventListener("click", () => {
      if(confirm("Esto borrará tus 4 intentos guardados y tu progreso. ¿Continuar?")){
        saveAttempts([]);
        renderHome();
      }
    });
  }

  function renderQuiz(){
    const q = session.questions[session.index];
    const options = session.optionsByIndex[session.index];
    const catName = CATEGORIES[q[1]];
    const pct = Math.round((session.index) / session.questions.length * 100);

    root.innerHTML = `
      <button class="top-link" id="btn-exit">&larr; Salir del intento</button>
      <section class="card">
        <div class="quiz-progress-wrap">
          <div class="quiz-progress-track"><div class="quiz-progress-fill" style="width:${pct}%"></div></div>
          <span class="quiz-progress-label">${session.index+1} / ${session.questions.length}</span>
        </div>
        <span class="cat-tag">${escapeHtml(catName)}</span>
        <p class="question-text">${escapeHtml(q[2])}</p>
        <div class="options" id="options-wrap">
          ${options.map((opt, i) => `
            <button class="option" data-idx="${i}">
              <span class="letter">${String.fromCharCode(65+i)}</span>
              <span>${escapeHtml(opt)}</span>
            </button>
          `).join("")}
        </div>
        <div class="feedback-note" id="feedback-note"></div>
        <div class="btn-row">
          <button class="btn btn-primary" id="next-btn" disabled>
            ${session.index === session.questions.length - 1 ? "Finalizar examen" : "Siguiente pregunta"}
          </button>
        </div>
      </section>
    `;

    document.querySelectorAll(".option").forEach(el => {
      el.addEventListener("click", () => selectOption(Number(el.dataset.idx)));
    });
    document.getElementById("next-btn").addEventListener("click", nextQuestion);
    document.getElementById("btn-exit").addEventListener("click", () => {
      if(confirm("Si sales ahora, este intento no se guardará. ¿Salir?")){
        session = null;
        renderHome();
      }
    });
  }

  function verdictFor(pct){
    if(pct >= 85) return "Excelente dominio general. Repasa solo los temas más débiles antes del examen real.";
    if(pct >= 70) return "Buen nivel. Con un repaso enfocado en los ramos más bajos, llegas lista o listo.";
    if(pct >= 50) return "Vas en camino. Conviene reforzar varios temas con el modo estudio antes del siguiente intento.";
    return "Este es un buen punto de partida. Usa el modo estudio por tema y vuelve a intentarlo con calma.";
  }

  function renderBreakdown(byCat, totalByCat){
    const rows = Object.keys(byCat)
      .map(Number)
      .sort((a,b) => (byCat[a].correct/byCat[a].total) - (byCat[b].correct/byCat[b].total))
      .map(ci => {
        const {correct, total} = byCat[ci];
        const pct = Math.round((correct/total) * 100);
        return `
          <div class="breakdown-row">
            <div class="breakdown-top">
              <span class="cat-name">${escapeHtml(CATEGORIES[ci])}</span>
              <span class="cat-score">${correct}/${total} · ${pct}%</span>
            </div>
            <div class="breakdown-track"><div class="breakdown-fill" style="width:${pct}%; background:${CAT_COLORS[ci]}"></div></div>
          </div>
        `;
      }).join("");
    return `<div class="breakdown-list">${rows}</div>`;
  }

  function renderResults(attempt, attemptNumber){
    const pct = Math.round((attempt.correct / attempt.total) * 100);
    const circumference = 2 * Math.PI * 80;
    const offset = circumference * (1 - pct/100);

    const missedHtml = attempt.missed.map(m => `
      <div class="review-item">
        <div class="q">${escapeHtml(m.q)}</div>
        <div class="your-a"><span class="label">Tu respuesta</span>${escapeHtml(m.chosenText)}</div>
        <div class="right-a"><span class="label">Correcta</span>${escapeHtml(m.correctText)}</div>
      </div>
    `).join("");

    const attempts = loadAttempts();
    const isLast = attemptNumber >= MAX_ATTEMPTS;

    root.innerHTML = `
      <section class="card">
        <div class="score-hero">
          <div class="score-ring-wrap">
            <svg viewBox="0 0 180 180">
              <circle class="score-ring-bg" cx="90" cy="90" r="80"/>
              <circle class="score-ring-fill" cx="90" cy="90" r="80"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/>
            </svg>
            <div class="score-ring-number">
              <span class="pct">${pct}%</span>
              <span class="frac">${attempt.correct} / ${attempt.total}</span>
            </div>
          </div>
          <p class="section-title" style="margin-top:10px;">Intento ${attemptNumber} de ${MAX_ATTEMPTS}</p>
          <p class="score-verdict">${verdictFor(pct)}</p>
        </div>
      </section>

      <section class="card">
        <p class="section-title">Resultado por ramo</p>
        <p class="muted">De más débil a más fuerte, para saber dónde enfocar tu repaso.</p>
        ${renderBreakdown(attempt.byCat)}
      </section>

      ${attempt.missed.length ? `
      <section class="card">
        <button class="review-toggle" id="toggle-review">Ver las ${attempt.missed.length} preguntas que fallaste ↓</button>
        <div class="review-list" id="review-list" style="display:none;">${missedHtml}</div>
      </section>` : ""}

      ${isLast ? renderConsolidatedSection(attempts) : ""}

      <div class="btn-row">
        <button class="btn btn-primary" id="btn-home">Volver al inicio</button>
        ${!isLast ? `<button class="btn btn-gold" id="btn-again">Iniciar intento ${attemptNumber+1}</button>` : ""}
        <button class="btn btn-ghost" id="btn-study2">Repasar en modo estudio</button>
      </div>
    `;

    const toggle = document.getElementById("toggle-review");
    if(toggle){
      toggle.addEventListener("click", () => {
        const list = document.getElementById("review-list");
        const open = list.style.display !== "none";
        list.style.display = open ? "none" : "flex";
        toggle.textContent = open
          ? `Ver las ${attempt.missed.length} preguntas que fallaste ↓`
          : `Ocultar preguntas falladas ↑`;
      });
    }
    document.getElementById("btn-home").addEventListener("click", renderHome);
    const againBtn = document.getElementById("btn-again");
    if(againBtn) againBtn.addEventListener("click", startExam);
    document.getElementById("btn-study2").addEventListener("click", () => renderStudy());

    // animar el anillo
    requestAnimationFrame(() => {
      const ring = document.querySelector(".score-ring-fill");
      if(ring){ ring.style.strokeDashoffset = offset; }
    });
  }

  function renderConsolidatedSection(attempts){
    const combined = {};
    attempts.forEach(a => {
      Object.keys(a.byCat).forEach(ci => {
        combined[ci] = combined[ci] || {correct:0, total:0};
        combined[ci].correct += a.byCat[ci].correct;
        combined[ci].total += a.byCat[ci].total;
      });
    });
    const totalCorrect = attempts.reduce((s,a) => s + a.correct, 0);
    const totalQ = attempts.reduce((s,a) => s + a.total, 0);
    const overallPct = Math.round((totalCorrect/totalQ) * 100);

    return `
      <section class="card">
        <p class="section-title">Reporte final ponderado — tus ${attempts.length} intentos</p>
        <p class="muted">Promedio general: <b style="color:var(--forest)">${overallPct}%</b> sobre ${totalQ} preguntas respondidas en total. Este es el desglose combinado por ramo, para saber exactamente dónde reforzar antes del examen real.</p>
        ${renderBreakdown(combined)}
      </section>
    `;
  }

  function renderHistory(){
    const attempts = loadAttempts();
    if(!attempts.length){ renderHome(); return; }

    const rows = attempts.map((a, i) => {
      const pct = Math.round((a.correct/a.total)*100);
      const date = new Date(a.date);
      return `<tr>
        <td>Intento ${i+1}</td>
        <td>${date.toLocaleDateString("es-BO", {day:"2-digit", month:"short", year:"numeric"})}</td>
        <td>${a.correct}/${a.total}</td>
        <td>${pct}%</td>
      </tr>`;
    }).join("");

    root.innerHTML = `
      <button class="top-link" id="btn-back">&larr; Volver al inicio</button>
      <section class="card">
        <p class="section-title">Historial de intentos</p>
        <table class="history-table">
          <thead><tr><th>Intento</th><th>Fecha</th><th>Aciertos</th><th>Puntaje</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
      ${renderConsolidatedSection(attempts)}
      <div class="btn-row">
        <button class="btn btn-ghost" id="btn-reset2">Reiniciar intentos</button>
      </div>
    `;
    document.getElementById("btn-back").addEventListener("click", renderHome);
    document.getElementById("btn-reset2").addEventListener("click", () => {
      if(confirm("Esto borrará tus intentos guardados y tu progreso. ¿Continuar?")){
        saveAttempts([]);
        renderHome();
      }
    });
  }

  // ---------- Modo estudio (flashcards) ----------
  let studyState = null;

  function renderStudy(catFilter){
    const filterIdx = (catFilter === undefined || catFilter === "all") ? "all" : Number(catFilter);
    const pool = filterIdx === "all" ? QUESTION_BANK : QUESTION_BANK.filter(q => q[1] === filterIdx);

    if(!studyState || studyState.filterIdx !== filterIdx){
      studyState = { filterIdx, order: shuffle(pool), pos: 0, flipped: false };
    }

    const options = `<option value="all" ${filterIdx==="all"?"selected":""}>Todos los temas (${QUESTION_BANK.length})</option>` +
      CATEGORIES.map((name, idx) => {
        const count = QUESTION_BANK.filter(q => q[1]===idx).length;
        return `<option value="${idx}" ${filterIdx===idx?"selected":""}>${escapeHtml(name)} (${count})</option>`;
      }).join("");

    const card = studyState.order[studyState.pos];

    root.innerHTML = `
      <button class="top-link" id="btn-back">&larr; Volver al inicio</button>
      <section class="card">
        <p class="section-title">Modo estudio libre</p>
        <p class="muted">Sin calificación. Toca la tarjeta para ver la respuesta.</p>
        <div class="study-toolbar">
          <select id="cat-select">${options}</select>
        </div>
        ${card ? `
        <div class="flashcard ${studyState.flipped ? "flipped" : ""}" id="flashcard">
          <span class="fc-label">${studyState.flipped ? "Respuesta" : "Pregunta · " + CATEGORIES[card[1]]}</span>
          <p class="fc-text">${escapeHtml(studyState.flipped ? card[3] : card[2])}</p>
          <span class="fc-hint">Toca para ${studyState.flipped ? "ver la pregunta" : "revelar la respuesta"}</span>
        </div>
        <div class="study-nav">
          <button class="btn btn-ghost" id="btn-prev" ${studyState.pos===0?"disabled":""}>← Anterior</button>
          <span class="study-count">${studyState.pos+1} / ${studyState.order.length}</span>
          <button class="btn btn-primary" id="btn-next" ${studyState.pos===studyState.order.length-1?"disabled":""}>Siguiente →</button>
        </div>
        ` : `<p class="muted">No hay preguntas en este tema.</p>`}
      </section>
    `;

    document.getElementById("btn-back").addEventListener("click", () => { studyState = null; renderHome(); });
    document.getElementById("cat-select").addEventListener("change", (e) => renderStudy(e.target.value));
    const fc = document.getElementById("flashcard");
    if(fc) fc.addEventListener("click", () => {
      studyState.flipped = !studyState.flipped;
      renderStudy(filterIdx);
    });
    const prevBtn = document.getElementById("btn-prev");
    if(prevBtn) prevBtn.addEventListener("click", () => {
      studyState.pos = Math.max(0, studyState.pos - 1);
      studyState.flipped = false;
      renderStudy(filterIdx);
    });
    const nextBtn = document.getElementById("btn-next");
    if(nextBtn) nextBtn.addEventListener("click", () => {
      studyState.pos = Math.min(studyState.order.length - 1, studyState.pos + 1);
      studyState.flipped = false;
      renderStudy(filterIdx);
    });
  }

  // ---------- Arranque ----------
  document.addEventListener("DOMContentLoaded", renderHome);
})();
