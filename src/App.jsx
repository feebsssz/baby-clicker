import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FAMILY_CODE = import.meta.env.VITE_FAMILY_CODE;

const headers = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "Prefer": "return=representation",
};

async function dbFetch() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/logs?family_code=eq.${FAMILY_CODE}&order=ts.desc&limit=500`,
    { headers }
  );
  if (!res.ok) throw new Error("Fetch failed");
  return res.json();
}

async function dbInsert(entry) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/logs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: entry.id,
      family_code: FAMILY_CODE,
      type: entry.type,
      drink_type: entry.drinkType || null,
      ts: entry.ts,
      amount: entry.amount || null,
      note: entry.note || null,
    }),
  });
  if (!res.ok) throw new Error("Insert failed");
}

async function dbUpdate(entry) {
  await fetch(`${SUPABASE_URL}/rest/v1/logs?id=eq.${entry.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      type: entry.type,
      drink_type: entry.drinkType || null,
      ts: entry.ts,
      amount: entry.amount || null,
      note: entry.note || null,
    }),
  });
}

async function dbDelete(id) {
  await fetch(`${SUPABASE_URL}/rest/v1/logs?id=eq.${id}`, {
    method: "DELETE",
    headers,
  });
}

const categories = {
  drinking: { label: "Drinking", emoji: "🍼", color: "#e8a598", askAmount: true },
  diaper: { label: "Diapers", emoji: "🩲", color: "#b8d4b8", askAmount: false },
  pump: { label: "Pump", emoji: "🫙", color: "#d4c5e2", askAmount: true },
};

const drinkTypes = [
  { key: "breast", label: "Breast Milk", emoji: "🤱" },
  { key: "formula", label: "Formula", emoji: "🥛" },
  { key: "both", label: "Both", emoji: "🤱+🥛" },
];

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(ts) {
  return new Date(ts).toLocaleDateString("no-NO", { weekday: "short", day: "numeric", month: "short" });
}
function dateKey(ts) {
  return new Date(ts).toLocaleDateString("sv-SE");
}
function todayKey() {
  return dateKey(Date.now());
}
function nowDateTimeLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getCat(type, drinkType) {
  if (type === "diaper_wet") return { label: "Wet Diaper", emoji: "💧", color: "#b8d4b8" };
  if (type === "diaper_solid") return { label: "Dirty Diaper", emoji: "💩", color: "#c4b18a" };
  if (type === "diaper") {
    if (drinkType === "both") return { label: "Diaper", emoji: "💧💩", color: "#b8d4b8" };
    if (drinkType === "solid") return { label: "Dirty Diaper", emoji: "💩", color: "#c4b18a" };
    return { label: "Wet Diaper", emoji: "💧", color: "#b8d4b8" };
  }
  return categories[type] || { label: type, emoji: "❓", color: "#ccc" };
}

function drinkLabel(log) {
  const dt = drinkTypes.find(d => d.key === log.drinkType);
  return dt ? ` · ${dt.emoji} ${dt.label}` : "";
}

function isWet(log) {
  return log.type === "diaper_wet" || (log.type === "diaper" && (log.drinkType === "wet" || log.drinkType === "both"));
}
function isSolid(log) {
  return log.type === "diaper_solid" || (log.type === "diaper" && (log.drinkType === "solid" || log.drinkType === "both"));
}

function normalizeLog(row) {
  return {
    id: row.id,
    type: row.type,
    drinkType: row.drink_type || null,
    ts: row.ts,
    amount: row.amount || null,
    note: row.note || null,
  };
}

export default function BabyTracker() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState("home");

  // Quick log modal
  const [modal, setModal] = useState(null);
  const [amount, setAmount] = useState("");
  const [breastAmount, setBreastAmount] = useState("");
  const [formulaAmount, setFormulaAmount] = useState("");
  const [note, setNote] = useState("");
  const [drinkType, setDrinkType] = useState("breast");
  const [diaperWet, setDiaperWet] = useState(true);
  const [diaperSolid, setDiaperSolid] = useState(false);
  const [modalTime, setModalTime] = useState("");
  const [justLogged, setJustLogged] = useState(null);
  const [expanded, setExpanded] = useState(new Set(["drinking", "diaper", "pump"]));

  // Manual entry modal (also used for editing)
  const [manualOpen, setManualOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [manualType, setManualType] = useState("drinking");
  const [manualDateTime, setManualDateTime] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualBreastAmount, setManualBreastAmount] = useState("");
  const [manualFormulaAmount, setManualFormulaAmount] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualDrinkType, setManualDrinkType] = useState("breast");
  const [manualDiaperWet, setManualDiaperWet] = useState(true);
  const [manualDiaperSolid, setManualDiaperSolid] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      const rows = await dbFetch();
      setLogs(rows.map(normalizeLog));
      setError(null);
    } catch {
      setError("Could not load data. Check connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 30000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  function openModal(type) {
    setModal(type);
    setAmount("");
    setBreastAmount("");
    setFormulaAmount("");
    setNote("");
    setDrinkType("breast");
    setDiaperWet(true);
    setDiaperSolid(false);
    setModalTime(nowDateTimeLocal());
  }

  function openManualEntry() {
    setEditingId(null);
    setManualOpen(true);
    setManualType("drinking");
    setManualDateTime(nowDateTimeLocal());
    setManualAmount("");
    setManualBreastAmount("");
    setManualFormulaAmount("");
    setManualNote("");
    setManualDrinkType("breast");
    setManualDiaperWet(true);
    setManualDiaperSolid(false);
  }

  function openEdit(log) {
    setEditingId(log.id);
    setManualType(log.type === "diaper_wet" || log.type === "diaper_solid" ? "diaper" : log.type);
    const d = new Date(log.ts);
    const pad = n => String(n).padStart(2, "0");
    setManualDateTime(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setManualAmount(log.amount ? String(log.amount) : "");
    setManualBreastAmount("");
    setManualFormulaAmount("");
    setManualNote(log.note || "");
    setManualDrinkType(log.type === "drinking" ? (log.drinkType || "breast") : "breast");
    setManualDiaperWet(log.drinkType === "wet" || log.drinkType === "both" || log.type === "diaper_wet");
    setManualDiaperSolid(log.drinkType === "solid" || log.drinkType === "both" || log.type === "diaper_solid");
    setManualOpen(true);
  }

  async function saveEntry(entry) {
    setLogs(prev => {
      const next = [entry, ...prev];
      next.sort((a, b) => b.ts - a.ts);
      return next;
    });
    setJustLogged(entry);
    setTimeout(() => setJustLogged(null), 2500);
    setSyncing(true);
    try {
      await dbInsert(entry);
    } catch {
      setError("Saved locally but couldn't sync. Will retry on refresh.");
    } finally {
      setSyncing(false);
    }
  }

  function buildDrinkEntry({ type, drinkType, breastAmt, formulaAmt, singleAmt, noteText, ts, id }) {
    let totalAmount = null;
    let autoNote = "";
    if (drinkType === "both") {
      const b = parseFloat(breastAmt) || 0;
      const f = parseFloat(formulaAmt) || 0;
      totalAmount = (b + f) || null;
      const parts = [];
      if (b) parts.push(`🤱 ${b}ml`);
      if (f) parts.push(`🥛 ${f}ml`);
      autoNote = parts.join(" + ");
    } else {
      totalAmount = parseFloat(singleAmt) || null;
    }
    const finalNote = [autoNote, noteText].filter(Boolean).join(" · ") || null;
    return { id, type, drinkType, ts, amount: totalAmount, note: finalNote };
  }

  async function confirmLog() {
    const subType = modal === "diaper"
      ? (diaperWet && diaperSolid ? "both" : diaperWet ? "wet" : "solid")
      : null;
    const now = modalTime ? new Date(modalTime).getTime() : Date.now();
    let entry;
    if (modal === "drinking") {
      entry = buildDrinkEntry({
        id: now, type: modal, drinkType, ts: now,
        breastAmt: breastAmount, formulaAmt: formulaAmount,
        singleAmt: amount, noteText: note,
      });
    } else {
      entry = {
        id: now, type: modal,
        drinkType: subType,
        ts: now,
        amount: categories[modal].askAmount ? (parseFloat(amount) || null) : null,
        note,
      };
    }
    setModal(null);
    await saveEntry(entry);
  }

  async function confirmManualLog() {
    if (manualType === "diaper" && !manualDiaperWet && !manualDiaperSolid) return;
    const ts = manualDateTime ? new Date(manualDateTime).getTime() : Date.now();
    const subType = manualType === "diaper"
      ? (manualDiaperWet && manualDiaperSolid ? "both" : manualDiaperWet ? "wet" : "solid")
      : null;
    const id = editingId ?? (Date.now() + Math.floor(Math.random() * 1000));
    let entry;
    if (manualType === "drinking") {
      entry = buildDrinkEntry({
        id, type: manualType, drinkType: manualDrinkType, ts,
        breastAmt: manualBreastAmount, formulaAmt: manualFormulaAmount,
        singleAmt: manualAmount, noteText: manualNote,
      });
    } else {
      entry = {
        id, type: manualType, drinkType: subType, ts,
        amount: manualType === "pump" ? (parseFloat(manualAmount) || null) : null,
        note: manualNote,
      };
    }
    setManualOpen(false);
    setEditingId(null);
    if (editingId) {
      setLogs(prev => prev.map(l => l.id === editingId ? entry : l).sort((a, b) => b.ts - a.ts));
      setSyncing(true);
      try { await dbUpdate(entry); } catch { setError("Could not update on server."); } finally { setSyncing(false); }
    } else {
      await saveEntry(entry);
    }
  }

  function toggleExpanded(key) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function deleteLog(id) {
    setLogs(prev => prev.filter(l => l.id !== id));
    try {
      await dbDelete(id);
    } catch {
      setError("Could not delete from server.");
    }
  }

  const today = todayKey();
  const todayLogs = logs.filter(l => dateKey(l.ts) === today);
  const totalDrinking = todayLogs.filter(l => l.type === "drinking").reduce((s, l) => s + (l.amount || 0), 0);
  const totalPump = todayLogs.filter(l => l.type === "pump").reduce((s, l) => s + (l.amount || 0), 0);
  const wetDiapers = todayLogs.filter(isWet).length;
  const solidDiapers = todayLogs.filter(isSolid).length;

  const grouped = logs.reduce((acc, l) => {
    const d = dateKey(l.ts);
    if (!acc[d]) acc[d] = [];
    acc[d].push(l);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const modalCat = modal ? (categories[modal] || {}) : {};
  const diaperSaveDisabled = modal === "diaper" && !diaperWet && !diaperSolid;
  const manualDiaperSaveDisabled = manualType === "diaper" && !manualDiaperWet && !manualDiaperSolid;

  if (loading) return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, #fdf6f0 0%, #f0f4f8 100%)",
      fontFamily: "'Georgia', serif", color: "#3a3028", gap: 16,
    }}>
      <div style={{ fontSize: 48 }}>👶</div>
      <div style={{ fontSize: 16, color: "#aaa" }}>Loading Léon's tracker…</div>
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #fdf6f0 0%, #f0f4f8 100%)",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      color: "#3a3028", maxWidth: 430, margin: "0 auto", position: "relative",
    }}>
      <div style={{
        padding: "28px 24px 16px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: "bold", letterSpacing: "-0.5px" }}>Léon's Clicker 👶</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
            {new Date().toLocaleDateString("no-NO", { weekday: "long", day: "numeric", month: "long" })}
            {syncing && <span style={{ fontSize: 11, color: "#b8d4b8" }}>● syncing</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <TabBtn active={view === "home"} onClick={() => setView("home")}>Log</TabBtn>
          <TabBtn active={view === "history"} onClick={() => setView("history")}>History</TabBtn>
        </div>
      </div>

      {error && (
        <div style={{
          margin: "12px 20px 0", padding: "10px 14px",
          background: "#fff3f0", borderRadius: 10, fontSize: 13, color: "#c0645a",
        }}>
          ⚠️ {error}
        </div>
      )}

      {view === "home" && (
        <div style={{ padding: "20px 20px 100px" }}>
          <div style={{
            background: "white", borderRadius: 16, padding: "14px 18px",
            marginBottom: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            display: "flex", gap: 12, flexWrap: "wrap",
          }}>
            <Stat label="Drinking" value={totalDrinking ? `${totalDrinking}ml` : "—"} color="#e8a598" />
            <Stat label="Diapers" value={(wetDiapers + solidDiapers) > 0 ? `${wetDiapers}💧 ${solidDiapers}💩` : "—"} color="#b8d4b8" />
            <Stat label="Pump" value={totalPump ? `${totalPump}ml` : "—"} color="#d4c5e2" />
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
              <button onClick={loadLogs} style={{
                background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 4, color: "#ccc",
              }}>↻</button>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <button onClick={() => openModal("drinking")} style={{
              width: "100%", background: "white", border: "2px solid #e8a598",
              borderRadius: 18, padding: "20px 12px", cursor: "pointer", marginBottom: 12,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
              onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
              onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
              onTouchStart={e => e.currentTarget.style.transform = "scale(0.98)"}
              onTouchEnd={e => e.currentTarget.style.transform = "scale(1)"}
            >
              <span style={{ fontSize: 34 }}>🍼</span>
              <span style={{ fontSize: 15, fontWeight: "600" }}>Drinking</span>
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[["diaper", "🩲", "Diapers", "#b8d4b8"], ["pump", "🫙", "Pump", "#d4c5e2"]].map(([key, emoji, label, color]) => (
                <button key={key} onClick={() => openModal(key)} style={{
                  background: "white", border: `2px solid ${color}`,
                  borderRadius: 18, padding: "22px 12px", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                }}
                  onMouseDown={e => e.currentTarget.style.transform = "scale(0.96)"}
                  onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
                  onTouchStart={e => e.currentTarget.style.transform = "scale(0.96)"}
                  onTouchEnd={e => e.currentTarget.style.transform = "scale(1)"}
                >
                  <span style={{ fontSize: 34 }}>{emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: "600" }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1, color: "#aaa", textTransform: "uppercase" }}>
              Today
            </div>
            <button onClick={openManualEntry} style={{
              background: "none", border: "1px solid #ddd", borderRadius: 20, padding: "4px 12px",
              fontSize: 12, color: "#aaa", cursor: "pointer", fontFamily: "inherit", fontWeight: "600",
            }}>
              ＋ Add past entry
            </button>
          </div>
          {todayLogs.length === 0 && (
            <div style={{ color: "#bbb", fontSize: 14, textAlign: "center", padding: "30px 0" }}>
              No entries yet. Tap a button above!
            </div>
          )}
          {["drinking", "diaper", "pump"].map(catKey => {
            const cat = categories[catKey];
            const catLogs = todayLogs.filter(l =>
              catKey === "diaper"
                ? (l.type === "diaper" || l.type === "diaper_wet" || l.type === "diaper_solid")
                : l.type === catKey
            );
            if (catLogs.length === 0) return null;
            const isExp = expanded.has(catKey);

            let summary = "";
            if (catKey === "drinking") {
              const total = catLogs.reduce((s, l) => s + (l.amount || 0), 0);
              summary = `×${catLogs.length}${total ? ` — ${total}ml` : ""}`;
            } else if (catKey === "diaper") {
              const wet = catLogs.filter(isWet).length;
              const solid = catLogs.filter(isSolid).length;
              summary = `×${catLogs.length} — ${wet}💧 ${solid}💩`;
            } else {
              const total = catLogs.reduce((s, l) => s + (l.amount || 0), 0);
              summary = `×${catLogs.length}${total ? ` — ${total}ml` : ""}`;
            }

            return (
              <div key={catKey} style={{
                background: "white", borderRadius: 12, marginBottom: 8,
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)", overflow: "hidden",
              }}>
                <div onClick={() => toggleExpanded(catKey)} style={{
                  display: "flex", alignItems: "center", padding: "12px 14px",
                  cursor: "pointer", gap: 12,
                  borderBottom: isExp ? "1px solid #f0f0f0" : "none",
                }}>
                  <span style={{
                    width: 36, height: 36, borderRadius: "50%", background: cat.color + "33",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
                  }}>{cat.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: "600" }}>{cat.label}</span>
                    <span style={{ fontSize: 12, color: "#aaa", marginLeft: 6 }}>{summary}</span>
                  </div>
                  <span style={{ color: "#ccc", fontSize: 13 }}>{isExp ? "▾" : "▸"}</span>
                </div>
                {isExp && catLogs.map((log, i) => {
                  const logCat = getCat(log.type, log.drinkType);
                  return (
                    <div key={log.id} style={{
                      display: "flex", alignItems: "center", padding: "9px 14px 9px 62px",
                      gap: 10, borderBottom: i < catLogs.length - 1 ? "1px solid #f8f8f8" : "none",
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: "#555" }}>
                          {logCat.emoji}
                          {log.type === "drinking" && log.drinkType && (
                            <span style={{ color: "#bbb" }}>{drinkLabel(log)}</span>
                          )}
                          {log.amount ? ` — ${log.amount}ml` : ""}
                        </div>
                        {log.note && <div style={{ fontSize: 11, color: "#bbb" }}>{log.note}</div>}
                      </div>
                      <div style={{ fontSize: 13, color: "#aaa", fontVariantNumeric: "tabular-nums" }}>{formatTime(log.ts)}</div>
                      <button onClick={() => openEdit(log)} style={{
                        background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 15, padding: "4px", lineHeight: 1,
                      }}>✎</button>
                      <button onClick={() => deleteLog(log.id)} style={{
                        background: "none", border: "none", cursor: "pointer", color: "#ddd", fontSize: 18, padding: "4px", lineHeight: 1,
                      }}>×</button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {view === "history" && (
        <div style={{ padding: "20px 20px 80px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button onClick={openManualEntry} style={{
              background: "#3a3028", color: "white", border: "none", borderRadius: 20, padding: "8px 16px",
              fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: "600",
            }}>
              ＋ Add past entry
            </button>
          </div>
          {sortedDates.length === 0 && (
            <div style={{ color: "#bbb", fontSize: 14, textAlign: "center", padding: "40px 0" }}>No data yet.</div>
          )}
          {sortedDates.map(date => {
            const dayLogs = grouped[date];
            const dDrink = dayLogs.filter(l => l.type === "drinking").reduce((s, l) => s + (l.amount || 0), 0);
            const dBreast = dayLogs.filter(l => l.type === "drinking" && l.drinkType === "breast").reduce((s, l) => s + (l.amount || 0), 0);
            const dFormula = dayLogs.filter(l => l.type === "drinking" && l.drinkType === "formula").reduce((s, l) => s + (l.amount || 0), 0);
            const dPump = dayLogs.filter(l => l.type === "pump").reduce((s, l) => s + (l.amount || 0), 0);
            const dWet = dayLogs.filter(isWet).length;
            const dSolid = dayLogs.filter(isSolid).length;
            return (
              <div key={date} style={{
                background: "white", borderRadius: 16, padding: "16px 18px",
                marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              }}>
                <div style={{ fontWeight: "700", fontSize: 15, marginBottom: 12 }}>
                  {formatDate(new Date(date + "T12:00:00").getTime())}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "flex-start" }}>
                  {dDrink > 0 && (
                    <div>
                      <Stat label="Drinking" value={`${dDrink}ml`} color="#e8a598" />
                      {(dBreast > 0 || dFormula > 0) && (
                        <div style={{ fontSize: 11, color: "#bbb", marginTop: 4, paddingLeft: 2 }}>
                          {dBreast > 0 && `🤱 ${dBreast}ml`}{dBreast > 0 && dFormula > 0 && "  "}{dFormula > 0 && `🥛 ${dFormula}ml`}
                        </div>
                      )}
                    </div>
                  )}
                  {dPump > 0 && <Stat label="Pump" value={`${dPump}ml`} color="#d4c5e2" />}
                  {(dWet + dSolid) > 0 && <Stat label="Diapers" value={`${dWet}💧 ${dSolid}💩`} color="#b8d4b8" />}
                </div>
                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
                  {dayLogs.map(log => {
                    const cat = getCat(log.type, log.drinkType);
                    return (
                      <div key={log.id} style={{
                        display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0", color: "#666",
                      }}>
                        <span>{cat.emoji}</span>
                        <span style={{ flex: 1 }}>
                          {cat.label}
                          {log.type === "drinking" && log.drinkType && <span style={{ color: "#bbb" }}>{drinkLabel(log)}</span>}
                          {log.amount ? ` — ${log.amount}ml` : ""}
                          {log.note ? <span style={{ color: "#bbb" }}> · {log.note}</span> : ""}
                        </span>
                        <span style={{ color: "#bbb", fontVariantNumeric: "tabular-nums" }}>{formatTime(log.ts)}</span>
                        <button onClick={() => openEdit(log)} style={{
                          background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 14, padding: "2px 4px", lineHeight: 1,
                        }}>✎</button>
                        <button onClick={() => deleteLog(log.id)} style={{
                          background: "none", border: "none", cursor: "pointer", color: "#ddd", fontSize: 16, padding: "2px 4px", lineHeight: 1,
                        }}>×</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Log Modal */}
      {modal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
          display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
        }} onClick={() => setModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "white", borderRadius: "24px 24px 0 0",
            padding: "28px 24px 44px", width: "100%", maxWidth: 430,
            boxShadow: "0 -4px 30px rgba(0,0,0,0.1)",
          }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 44, marginBottom: 6 }}>{modalCat.emoji}</div>
              <div style={{ fontSize: 18, fontWeight: "700" }}>{modalCat.label}</div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
                {new Date().toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>

            {modal === "drinking" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 8 }}>Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {drinkTypes.map(dt => (
                    <button key={dt.key} onClick={() => setDrinkType(dt.key)} style={{
                      flex: 1, padding: "10px 6px", borderRadius: 12,
                      border: `2px solid ${drinkType === dt.key ? "#e8a598" : "#eee"}`,
                      background: drinkType === dt.key ? "#e8a59820" : "white",
                      cursor: "pointer", fontSize: 12, fontWeight: "600",
                      color: drinkType === dt.key ? "#3a3028" : "#aaa",
                      fontFamily: "inherit",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    }}>
                      <span style={{ fontSize: 20 }}>{dt.emoji}</span>
                      <span>{dt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modal === "diaper" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 8 }}>Type (select one or both)</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <CheckToggle label="Wet" emoji="💧" checked={diaperWet} onChange={setDiaperWet} color="#b8d4b8" />
                  <CheckToggle label="Solid" emoji="💩" checked={diaperSolid} onChange={setDiaperSolid} color="#c4b18a" />
                </div>
              </div>
            )}

            {modal === "drinking" && drinkType === "both" ? (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 8 }}>Amount (ml)</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", marginBottom: 4 }}>🤱 Breast</div>
                    <input type="number" inputMode="numeric" placeholder="0"
                      value={breastAmount} onChange={e => setBreastAmount(e.target.value)}
                      autoFocus
                      style={{ width: "100%", padding: "14px 8px", borderRadius: 12, border: "2px solid #eee", fontSize: 22, textAlign: "center", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", marginBottom: 4 }}>🥛 Formula</div>
                    <input type="number" inputMode="numeric" placeholder="0"
                      value={formulaAmount} onChange={e => setFormulaAmount(e.target.value)}
                      style={{ width: "100%", padding: "14px 8px", borderRadius: 12, border: "2px solid #eee", fontSize: 22, textAlign: "center", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                    />
                  </div>
                </div>
              </div>
            ) : modalCat.askAmount ? (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 6 }}>Amount (ml)</label>
                <input
                  type="number" inputMode="numeric" placeholder="e.g. 80"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  style={{
                    width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid #eee",
                    fontSize: 22, textAlign: "center", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                  }}
                  autoFocus
                />
              </div>
            ) : null}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 6 }}>Time</label>
              <input
                type="datetime-local"
                value={modalTime}
                onChange={e => setModalTime(e.target.value)}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 12, border: "2px solid #eee",
                  fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 6 }}>Note (optional)</label>
              <input
                type="text" placeholder="e.g. fussy, fell asleep..."
                value={note} onChange={e => setNote(e.target.value)}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 12, border: "2px solid #eee",
                  fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                }}
              />
            </div>

            <button onClick={confirmLog} disabled={diaperSaveDisabled} style={{
              width: "100%", padding: "16px",
              background: diaperSaveDisabled ? "#eee" : modalCat.color,
              border: "none", borderRadius: 14, fontSize: 16, fontWeight: "700",
              color: diaperSaveDisabled ? "#aaa" : "white",
              cursor: diaperSaveDisabled ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}>
              Save Log
            </button>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {manualOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
          display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
        }} onClick={() => setManualOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "white", borderRadius: "24px 24px 0 0",
            padding: "28px 24px 44px", width: "100%", maxWidth: 430,
            boxShadow: "0 -4px 30px rgba(0,0,0,0.1)", maxHeight: "88vh", overflowY: "auto",
          }}>
            <div style={{ fontSize: 18, fontWeight: "700", marginBottom: 20, textAlign: "center" }}>
              {editingId ? "Edit Entry" : "Add Past Entry"}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 8 }}>Category</label>
              <div style={{ display: "flex", gap: 8 }}>
                {Object.entries(categories).map(([key, cat]) => (
                  <button key={key} onClick={() => setManualType(key)} style={{
                    flex: 1, padding: "10px 6px", borderRadius: 12,
                    border: `2px solid ${manualType === key ? cat.color : "#eee"}`,
                    background: manualType === key ? cat.color + "20" : "white",
                    cursor: "pointer", fontSize: 12, fontWeight: "600",
                    color: manualType === key ? "#3a3028" : "#aaa",
                    fontFamily: "inherit",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  }}>
                    <span style={{ fontSize: 20 }}>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 6 }}>Date & Time</label>
              <input
                type="datetime-local"
                value={manualDateTime}
                onChange={e => setManualDateTime(e.target.value)}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 12, border: "2px solid #eee",
                  fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                }}
              />
            </div>

            {manualType === "drinking" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 8 }}>Drink Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {drinkTypes.map(dt => (
                    <button key={dt.key} onClick={() => setManualDrinkType(dt.key)} style={{
                      flex: 1, padding: "10px 6px", borderRadius: 12,
                      border: `2px solid ${manualDrinkType === dt.key ? "#e8a598" : "#eee"}`,
                      background: manualDrinkType === dt.key ? "#e8a59820" : "white",
                      cursor: "pointer", fontSize: 12, fontWeight: "600",
                      color: manualDrinkType === dt.key ? "#3a3028" : "#aaa",
                      fontFamily: "inherit",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    }}>
                      <span style={{ fontSize: 20 }}>{dt.emoji}</span>
                      <span>{dt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {manualType === "diaper" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 8 }}>Diaper Type (select one or both)</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <CheckToggle label="Wet" emoji="💧" checked={manualDiaperWet} onChange={setManualDiaperWet} color="#b8d4b8" />
                  <CheckToggle label="Solid" emoji="💩" checked={manualDiaperSolid} onChange={setManualDiaperSolid} color="#c4b18a" />
                </div>
              </div>
            )}

            {manualType === "drinking" && manualDrinkType === "both" ? (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 8 }}>Amount (ml)</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", marginBottom: 4 }}>🤱 Breast</div>
                    <input type="number" inputMode="numeric" placeholder="0"
                      value={manualBreastAmount} onChange={e => setManualBreastAmount(e.target.value)}
                      style={{ width: "100%", padding: "14px 8px", borderRadius: 12, border: "2px solid #eee", fontSize: 22, textAlign: "center", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", marginBottom: 4 }}>🥛 Formula</div>
                    <input type="number" inputMode="numeric" placeholder="0"
                      value={manualFormulaAmount} onChange={e => setManualFormulaAmount(e.target.value)}
                      style={{ width: "100%", padding: "14px 8px", borderRadius: 12, border: "2px solid #eee", fontSize: 22, textAlign: "center", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                    />
                  </div>
                </div>
              </div>
            ) : (manualType === "drinking" || manualType === "pump") ? (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 6 }}>Amount (ml)</label>
                <input
                  type="number" inputMode="numeric" placeholder="e.g. 80"
                  value={manualAmount} onChange={e => setManualAmount(e.target.value)}
                  style={{
                    width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid #eee",
                    fontSize: 22, textAlign: "center", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                  }}
                />
              </div>
            ) : null}

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: "#888", display: "block", marginBottom: 6 }}>Note (optional)</label>
              <input
                type="text" placeholder="e.g. fussy, fell asleep..."
                value={manualNote} onChange={e => setManualNote(e.target.value)}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 12, border: "2px solid #eee",
                  fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                }}
              />
            </div>

            <button onClick={confirmManualLog} disabled={manualDiaperSaveDisabled} style={{
              width: "100%", padding: "16px",
              background: manualDiaperSaveDisabled ? "#eee" : categories[manualType].color,
              border: "none", borderRadius: 14, fontSize: 16, fontWeight: "700",
              color: manualDiaperSaveDisabled ? "#aaa" : "white",
              cursor: manualDiaperSaveDisabled ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}>
              {editingId ? "Update Entry" : "Save Entry"}
            </button>
          </div>
        </div>
      )}

      {justLogged && (() => {
        const cat = getCat(justLogged.type, justLogged.drinkType);
        return (
          <div style={{
            position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
            background: "#3a3028", color: "white", padding: "12px 22px", borderRadius: 50,
            fontSize: 14, fontWeight: "600", boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            zIndex: 200, whiteSpace: "nowrap",
          }}>
            {cat.emoji} Logged at {formatTime(justLogged.ts)}
          </div>
        );
      })()}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "#3a3028" : "transparent",
      color: active ? "white" : "#aaa",
      border: "none", borderRadius: 20, padding: "6px 14px",
      fontSize: 13, fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
    }}>
      {children}
    </button>
  );
}

function CheckToggle({ label, emoji, checked, onChange, color }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      flex: 1, padding: "14px 10px", borderRadius: 14,
      border: `2px solid ${checked ? color : "#eee"}`,
      background: checked ? color + "30" : "white",
      cursor: "pointer", fontFamily: "inherit",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    }}>
      <span style={{ fontSize: 28 }}>{emoji}</span>
      <span style={{ fontSize: 13, fontWeight: "600", color: checked ? "#3a3028" : "#aaa" }}>{label}</span>
      <span style={{
        width: 20, height: 20, borderRadius: "50%",
        border: `2px solid ${checked ? color : "#ddd"}`,
        background: checked ? color : "white",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, color: "white", fontWeight: "700",
      }}>{checked ? "✓" : ""}</span>
    </button>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: color + "22", borderRadius: 10, padding: "7px 12px", minWidth: 60 }}>
      <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: "700", color: "#3a3028" }}>{value}</div>
    </div>
  );
}
