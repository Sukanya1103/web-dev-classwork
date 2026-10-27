import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Activity, Stethoscope, Upload, AlertTriangle, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, HeartPulse, Camera, FileText,
  MapPin, ShieldAlert, Info, RotateCcw
} from "lucide-react";

/* ---------------------------------------------------------------
   TOKEN SYSTEM
   Clinical dossier aesthetic: soft paper background, deep teal ink,
   a single restrained teal accent, and semantic red/amber/green
   reserved strictly for urgency — never used decoratively.
--------------------------------------------------------------- */
const C = {
  bg: "#F5F7F5",
  paper: "#FFFFFF",
  border: "#DEE6E2",
  borderSoft: "#EAEFEC",
  ink: "#122824",
  inkSoft: "#5B6E69",
  inkFaint: "#93A29D",
  accent: "#256F5F",
  accentDeep: "#154438",
  accentTint: "#E4EFEC",
  green: "#3E8E5F",
  greenTint: "#E7F3EA",
  amber: "#B9822C",
  amberTint: "#FBF0DE",
  red: "#B34438",
  redTint: "#FBE7E4",
};

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
`;

/* ---------------------------------------------------------------
   DOMAIN DATA — symptom bank, follow-up question logic,
   rule-based scoring weights (stand-in for the trained model
   described in the project plan).
--------------------------------------------------------------- */
const SYMPTOM_BANK = [
  { id: "fever", label: "Fever", group: "General" },
  { id: "fatigue", label: "Fatigue", group: "General" },
  { id: "headache", label: "Headache", group: "General" },
  { id: "nausea", label: "Nausea / vomiting", group: "General" },
  { id: "dizziness", label: "Dizziness", group: "General" },
  { id: "cough", label: "Cough", group: "Respiratory" },
  { id: "sob", label: "Shortness of breath", group: "Respiratory" },
  { id: "chestpain", label: "Chest pain", group: "Respiratory" },
  { id: "sorethroat", label: "Sore throat", group: "Respiratory" },
  { id: "rash", label: "Rash", group: "Skin" },
  { id: "mole", label: "Changed mole / spot", group: "Skin" },
  { id: "wound", label: "Wound not healing", group: "Skin" },
  { id: "itching", label: "Persistent itching", group: "Skin" },
  { id: "abdpain", label: "Abdominal pain", group: "Pain" },
  { id: "jointpain", label: "Joint pain", group: "Pain" },
  { id: "backpain", label: "Back pain", group: "Pain" },
];

const SKIN_TRIGGERS = ["rash", "mole", "wound", "itching"];
const CARDIAC_TRIGGERS = ["chestpain", "sob"];

function buildFollowups(selected) {
  const qs = [];
  if (CARDIAC_TRIGGERS.some((s) => selected.includes(s))) {
    qs.push({
      id: "radiate",
      text: "Does the discomfort spread to your arm, neck, or jaw?",
      redFlagIfYes: true,
    });
    qs.push({
      id: "sweatnausea",
      text: "Is it coming with sweating, nausea, or breathlessness?",
      redFlagIfYes: true,
    });
  }
  if (SKIN_TRIGGERS.some((s) => selected.includes(s))) {
    qs.push({
      id: "changed",
      text: "Has it changed in size, shape, or color in the last few weeks?",
      weightIfYes: 20,
    });
    qs.push({
      id: "painfulSkin",
      text: "Is the area painful, or mostly asymptomatic?",
      weightIfYes: 8,
    });
  }
  if (selected.includes("abdpain")) {
    qs.push({
      id: "sudden",
      text: "Did the pain start suddenly and severely, or build up gradually?",
      weightIfYes: 15,
    });
  }
  if (qs.length === 0) {
    qs.push({
      id: "daily",
      text: "Is this noticeably limiting your daily activities?",
      weightIfYes: 10,
    });
    qs.push({
      id: "before",
      text: "Have you experienced this same issue before?",
      weightIfYes: 0,
    });
  }
  return qs.slice(0, 3);
}

function computeAssessment({ age, symptoms, severity, durationDays, temp, followupAnswers, followupQs, imageVerdict }) {
  const factors = [];
  let score = 0;

  const sevPts = Math.round(Number(severity) * 4.5);
  score += sevPts;
  factors.push({ label: `Reported severity (${severity}/10)`, pts: sevPts });

  if (durationDays >= 7) {
    score += 10;
    factors.push({ label: `Ongoing ${durationDays}+ days`, pts: 10 });
  }

  const symptomWeights = {
    chestpain: 28, sob: 24, fever: 6, mole: 15, wound: 8,
    abdpain: 10, dizziness: 8, rash: 5,
  };
  symptoms.forEach((s) => {
    if (symptomWeights[s]) {
      score += symptomWeights[s];
      const meta = SYMPTOM_BANK.find((b) => b.id === s);
      factors.push({ label: meta ? meta.label : s, pts: symptomWeights[s] });
    }
  });

  if (temp && Number(temp) >= 103) {
    score += 15;
    factors.push({ label: `High temperature (${temp}°F)`, pts: 15 });
  }

  if (age && (Number(age) >= 65 || Number(age) <= 2)) {
    score += 10;
    factors.push({ label: "Age-related risk factor", pts: 10 });
  }

  let redFlag = false;
  followupQs.forEach((q) => {
    const ans = followupAnswers[q.id];
    if (ans === "yes" && q.redFlagIfYes) {
      redFlag = true;
      factors.push({ label: `Red flag: ${q.text}`, pts: 40 });
      score += 40;
    } else if (ans === "yes" && q.weightIfYes) {
      score += q.weightIfYes;
      factors.push({ label: q.text, pts: q.weightIfYes });
    }
  });

  if (imageVerdict && imageVerdict.pts) {
    score += imageVerdict.pts;
    factors.push({ label: imageVerdict.label, pts: imageVerdict.pts });
  }

  score = Math.min(100, score);
  let band = "low";
  if (redFlag || score >= 60) band = "high";
  else if (score >= 30) band = "medium";

  factors.sort((a, b) => b.pts - a.pts);
  const maxPts = Math.max(...factors.map((f) => f.pts), 1);

  return { score, band, redFlag, factors: factors.filter(f => f.pts > 0).slice(0, 6), maxPts };
}

function narrativeFor({ band, redFlag, symptoms, age, sex }) {
  const names = symptoms.map((s) => SYMPTOM_BANK.find((b) => b.id === s)?.label.toLowerCase()).filter(Boolean);
  const symptomText = names.length ? names.join(", ") : "the symptoms described";
  if (redFlag) {
    return `Based on the combination of symptoms reported — particularly the pattern around ${symptomText} — this profile matches presentations that warrant immediate in-person evaluation. This combination is treated as a safety override regardless of the numeric score, and the recommendation is to seek emergency care now rather than wait.`;
  }
  if (band === "high") {
    return `For a ${age || "—"}-year-old ${sex || "patient"} with ${symptomText}, the model places this in the higher-urgency range. This doesn't confirm a diagnosis, but the pattern is significant enough that an in-person visit within the next 24 hours is the safer path.`;
  }
  if (band === "medium") {
    return `The reported combination of ${symptomText} places this in a moderate range — not urgent, but worth a check-in with a clinician in the next few days, especially if anything worsens.`;
  }
  return `Based on what's been reported, ${symptomText} currently falls in the lower-urgency range. Self-care and monitoring are reasonable, but the assessment should be revisited if symptoms change or persist.`;
}

/* ---------------------------------------------------------------
   SMALL UI PRIMITIVES
--------------------------------------------------------------- */
function StepRail({ steps, activeIndex }) {
  return (
    <div className="hidden md:flex flex-col gap-1 w-56 shrink-0 pr-6">
      {steps.map((s, i) => {
        const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "idle";
        return (
          <div key={s} className="flex items-start gap-3 py-2.5">
            <div
              className="flex items-center justify-center rounded-full shrink-0"
              style={{
                width: 22, height: 22, marginTop: 1,
                fontFamily: "IBM Plex Mono, monospace", fontSize: 11,
                background: state === "idle" ? "transparent" : state === "active" ? C.accent : C.accentDeep,
                border: `1px solid ${state === "idle" ? C.border : "transparent"}`,
                color: state === "idle" ? C.inkFaint : "#fff",
              }}
            >
              {state === "done" ? "✓" : i + 1}
            </div>
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13.5,
                fontWeight: state === "active" ? 600 : 500,
                color: state === "idle" ? C.inkFaint : C.ink,
              }}
            >
              {s}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, icon: Icon = ChevronRight }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full px-5 py-3 transition-all"
      style={{
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        fontSize: 14.5,
        background: disabled ? C.borderSoft : C.accentDeep,
        color: disabled ? C.inkFaint : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 6px 16px -6px rgba(21,68,56,0.45)",
      }}
    >
      {children}
      <Icon size={16} />
    </button>
  );
}

function GhostButton({ children, onClick, icon: Icon = ChevronLeft }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full px-4 py-3"
      style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, color: C.inkSoft }}
    >
      <Icon size={16} />
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3.5 py-2 transition-all text-left"
      style={{
        fontFamily: "Inter, sans-serif",
        fontSize: 13.5,
        fontWeight: 500,
        border: `1px solid ${active ? C.accentDeep : C.border}`,
        background: active ? C.accentTint : "#fff",
        color: active ? C.accentDeep : C.inkSoft,
      }}
    >
      {children}
    </button>
  );
}

function Card({ children, style }) {
  return (
    <div
      className="rounded-2xl p-6 md:p-8"
      style={{ background: C.paper, border: `1px solid ${C.borderSoft}`, boxShadow: "0 1px 2px rgba(18,40,36,0.04)", ...style }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }) {
  return (
    <div
      className="mb-2"
      style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.accent }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN APP
--------------------------------------------------------------- */
const STEPS = ["Intake", "Follow-up", "Visual check", "Assessment", "Report"];

export default function HealthTriagePrototype() {
  const [stepIdx, setStepIdx] = useState(0);
  const [form, setForm] = useState({ age: "", sex: "", symptoms: [], severity: 5, durationDays: 2, temp: "" });
  const [followupAnswers, setFollowupAnswers] = useState({});
  const [imageFile, setImageFile] = useState(null);
  const [imageURL, setImageURL] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const fileRef = useRef(null);

  const followupQs = useMemo(() => buildFollowups(form.symptoms), [form.symptoms]);
  const needsImageStep = SKIN_TRIGGERS.some((s) => form.symptoms.includes(s));

  const visibleSteps = needsImageStep ? STEPS : STEPS.filter((s) => s !== "Visual check");
  const currentLabel = visibleSteps[stepIdx];

  function toggleSymptom(id) {
    setForm((f) => ({
      ...f,
      symptoms: f.symptoms.includes(id) ? f.symptoms.filter((s) => s !== id) : [...f.symptoms, id],
    }));
  }

  function goNext() {
    if (currentLabel === "Follow-up") {
      if (needsImageStep) setStepIdx((i) => i + 1);
      else runAnalysis();
      return;
    }
    if (currentLabel === "Visual check") {
      runAnalysis();
      return;
    }
    setStepIdx((i) => i + 1);
  }

  function goBack() {
    setStepIdx((i) => Math.max(0, i - 1));
  }

  function runAnalysis() {
    const nextIdx = visibleSteps.indexOf("Assessment");
    setStepIdx(nextIdx);
    setAnalyzing(true);
    setTimeout(() => {
      let imageVerdict = null;
      if (imageFile) {
        const changed = followupAnswers.changed === "yes";
        const painful = followupAnswers.painfulSkin === "yes";
        if (changed) imageVerdict = { label: "Visual pattern flagged as changed/atypical", pts: 22, verdictText: "Recommend dermatologist review" };
        else if (painful) imageVerdict = { label: "Visual pattern shows irritation markers", pts: 10, verdictText: "Monitor closely, follow up if it persists" };
        else imageVerdict = { label: "Visual pattern appears stable", pts: 3, verdictText: "Likely benign — continue monitoring" };
      }
      const result = computeAssessment({
        age: form.age, symptoms: form.symptoms, severity: form.severity,
        durationDays: Number(form.durationDays), temp: form.temp,
        followupAnswers, followupQs, imageVerdict,
      });
      setAssessment({ ...result, imageVerdict, narrative: narrativeFor({ band: result.band, redFlag: result.redFlag, symptoms: form.symptoms, age: form.age, sex: form.sex }) });
      setAnalyzing(false);
      setTimeout(() => setStepIdx(visibleSteps.indexOf("Report")), 550);
    }, 1900);
  }

  function reset() {
    setForm({ age: "", sex: "", symptoms: [], severity: 5, durationDays: 2, temp: "" });
    setFollowupAnswers({});
    setImageFile(null);
    setImageURL(null);
    setAssessment(null);
    setStepIdx(0);
  }

  useEffect(() => () => { if (imageURL) URL.revokeObjectURL(imageURL); }, [imageURL]);

  const bandColors = {
    low: { c: C.green, t: C.greenTint, label: "Low urgency" },
    medium: { c: C.amber, t: C.amberTint, label: "Moderate urgency" },
    high: { c: C.red, t: C.redTint, label: "High urgency" },
  };

  return (
    <div style={{ background: C.bg, minHeight: "100%", fontFamily: "Inter, sans-serif", color: C.ink }}>
      <style>{FONT_IMPORT}</style>

      {/* Top strip */}
      <div style={{ borderBottom: `1px solid ${C.borderSoft}`, background: C.paper }}>
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg flex items-center justify-center" style={{ width: 30, height: 30, background: C.accentDeep }}>
              <HeartPulse size={16} color="#fff" />
            </div>
            <div>
              <div style={{ fontFamily: "Source Serif 4, serif", fontWeight: 600, fontSize: 16.5, lineHeight: 1 }}>Sentinel Check</div>
              <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: C.inkFaint, letterSpacing: "0.04em" }}>AI SCREENING · NOT A DIAGNOSIS</div>
            </div>
          </div>
          {assessment && (
            <button onClick={reset} className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: C.inkSoft, fontFamily: "Inter, sans-serif" }}>
              <RotateCcw size={13} /> Start over
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 md:px-8 py-10">
        <div className="flex">
          <StepRail steps={visibleSteps} activeIndex={stepIdx} />

          <div className="flex-1 min-w-0">
            {/* STEP 0 — INTRO / INTAKE */}
            {currentLabel === "Intake" && (
              <Card>
                <Eyebrow>Step 1 · Tell us what's going on</Eyebrow>
                <h1 style={{ fontFamily: "Source Serif 4, serif", fontSize: 26, fontWeight: 600, marginBottom: 6 }}>
                  Start your checkup
                </h1>
                <p style={{ fontSize: 14, color: C.inkSoft, marginBottom: 24, maxWidth: 520 }}>
                  A few basics first. This stays on your device for this demo and is never a substitute for professional care.
                </p>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>Age</label>
                    <input
                      type="number" value={form.age}
                      onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                      placeholder="e.g. 34"
                      className="w-full mt-1.5 rounded-lg px-3 py-2.5 outline-none"
                      style={{ border: `1px solid ${C.border}`, fontSize: 14 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>Sex</label>
                    <div className="flex gap-2 mt-1.5">
                      {["Female", "Male", "Other"].map((v) => (
                        <Chip key={v} active={form.sex === v} onClick={() => setForm((f) => ({ ...f, sex: v }))}>{v}</Chip>
                      ))}
                    </div>
                  </div>
                </div>

                <label style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>What are you experiencing? (select all that apply)</label>
                <div className="flex flex-wrap gap-2 mt-2 mb-6">
                  {SYMPTOM_BANK.map((s) => (
                    <Chip key={s.id} active={form.symptoms.includes(s.id)} onClick={() => toggleSymptom(s.id)}>{s.label}</Chip>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-4 mb-2">
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>Severity: {form.severity}/10</label>
                    <input
                      type="range" min={0} max={10} value={form.severity}
                      onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                      className="w-full mt-3" style={{ accentColor: C.accentDeep }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>Duration (days)</label>
                    <input
                      type="number" value={form.durationDays}
                      onChange={(e) => setForm((f) => ({ ...f, durationDays: e.target.value }))}
                      className="w-full mt-1.5 rounded-lg px-3 py-2.5 outline-none"
                      style={{ border: `1px solid ${C.border}`, fontSize: 14 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>Temp °F (optional)</label>
                    <input
                      type="number" value={form.temp}
                      onChange={(e) => setForm((f) => ({ ...f, temp: e.target.value }))}
                      placeholder="—"
                      className="w-full mt-1.5 rounded-lg px-3 py-2.5 outline-none"
                      style={{ border: `1px solid ${C.border}`, fontSize: 14 }}
                    />
                  </div>
                </div>

                <div className="flex justify-end mt-6">
                  <PrimaryButton disabled={form.symptoms.length === 0 || !form.age} onClick={goNext}>Continue</PrimaryButton>
                </div>
              </Card>
            )}

            {/* STEP — FOLLOW UP */}
            {currentLabel === "Follow-up" && (
              <Card>
                <Eyebrow>Step 2 · A couple of targeted questions</Eyebrow>
                <h1 style={{ fontFamily: "Source Serif 4, serif", fontSize: 24, fontWeight: 600, marginBottom: 6 }}>
                  Based on what you told us
                </h1>
                <p style={{ fontSize: 14, color: C.inkSoft, marginBottom: 24 }}>
                  These questions are chosen dynamically from your symptoms — not a fixed form.
                </p>
                <div className="flex flex-col gap-5">
                  {followupQs.map((q) => (
                    <div key={q.id} className="pb-5" style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                      <div style={{ fontSize: 14.5, fontWeight: 500, marginBottom: 10 }}>{q.text}</div>
                      <div className="flex gap-2">
                        {["yes", "no"].map((v) => (
                          <Chip key={v} active={followupAnswers[q.id] === v} onClick={() => setFollowupAnswers((a) => ({ ...a, [q.id]: v }))}>
                            {v === "yes" ? "Yes" : "No"}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-6">
                  <GhostButton onClick={goBack}>Back</GhostButton>
                  <PrimaryButton disabled={followupQs.some((q) => !followupAnswers[q.id])} onClick={goNext}>
                    {needsImageStep ? "Continue" : "Run assessment"}
                  </PrimaryButton>
                </div>
              </Card>
            )}

            {/* STEP — IMAGE */}
            {currentLabel === "Visual check" && (
              <Card>
                <Eyebrow>Step 3 · Optional visual check</Eyebrow>
                <h1 style={{ fontFamily: "Source Serif 4, serif", fontSize: 24, fontWeight: 600, marginBottom: 6 }}>
                  Add a photo, if you can
                </h1>
                <p style={{ fontSize: 14, color: C.inkSoft, marginBottom: 24, maxWidth: 480 }}>
                  Since a skin-related symptom was mentioned, a clear photo lets the visual model contribute to the assessment. This step is optional.
                </p>

                <input
                  ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setImageFile(f); setImageURL(URL.createObjectURL(f)); }
                  }}
                />

                {!imageURL ? (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-2xl flex flex-col items-center justify-center gap-2 py-14"
                    style={{ border: `1.5px dashed ${C.border}`, background: C.accentTint }}
                  >
                    <Camera size={22} color={C.accent} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.accentDeep }}>Upload a photo</span>
                    <span style={{ fontSize: 12, color: C.inkFaint }}>JPG or PNG</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-4">
                    <img src={imageURL} alt="uploaded" className="rounded-xl object-cover" style={{ width: 140, height: 140, border: `1px solid ${C.border}` }} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{imageFile?.name}</div>
                      <button onClick={() => fileRef.current?.click()} style={{ fontSize: 12.5, color: C.accent, marginTop: 6 }}>Replace photo</button>
                    </div>
                  </div>
                )}

                <div className="flex justify-between mt-8">
                  <GhostButton onClick={goBack}>Back</GhostButton>
                  <PrimaryButton onClick={goNext}>{imageURL ? "Run assessment" : "Skip and run assessment"}</PrimaryButton>
                </div>
              </Card>
            )}

            {/* STEP — ANALYZING */}
            {currentLabel === "Assessment" && (
              <Card style={{ minHeight: 340 }}>
                <div className="h-full flex flex-col items-center justify-center py-16 text-center">
                  <div className="rounded-full flex items-center justify-center mb-5" style={{ width: 54, height: 54, background: C.accentTint }}>
                    <Loader2 size={24} color={C.accentDeep} className="animate-spin" />
                  </div>
                  <div style={{ fontFamily: "Source Serif 4, serif", fontSize: 19, fontWeight: 600, marginBottom: 6 }}>
                    Scoring your intake
                  </div>
                  <div style={{ fontSize: 13.5, color: C.inkSoft, maxWidth: 340 }}>
                    Running the symptom-triage model{imageFile ? " and the visual classifier" : ""}, then weighing safety overrides against the result.
                  </div>
                </div>
              </Card>
            )}

            {/* STEP — REPORT */}
            {currentLabel === "Report" && assessment && (
              <div className="flex flex-col gap-5">
                <Card>
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div>
                      <Eyebrow>Screening report</Eyebrow>
                      <h1 style={{ fontFamily: "Source Serif 4, serif", fontSize: 24, fontWeight: 600 }}>Your assessment</h1>
                    </div>
                    <div
                      className="flex items-center gap-2 rounded-full px-4 py-2"
                      style={{ background: bandColors[assessment.band].t, color: bandColors[assessment.band].c }}
                    >
                      {assessment.band === "high" ? <AlertTriangle size={15} /> : assessment.band === "medium" ? <Info size={15} /> : <CheckCircle2 size={15} />}
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{bandColors[assessment.band].label}</span>
                    </div>
                  </div>

                  {assessment.redFlag && (
                    <div className="flex items-start gap-3 rounded-xl px-4 py-3.5 mt-5" style={{ background: C.redTint }}>
                      <ShieldAlert size={18} color={C.red} className="mt-0.5 shrink-0" />
                      <div style={{ fontSize: 13.5, color: C.red, fontWeight: 500 }}>
                        Safety override active — this symptom combination always triggers an urgent recommendation, independent of the numeric score.
                      </div>
                    </div>
                  )}

                  <p style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.65, marginTop: 18, maxWidth: 640 }}>
                    {assessment.narrative}
                  </p>

                  <div className="flex items-center gap-4 mt-6 pt-5" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                    <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 28, fontWeight: 500, color: bandColors[assessment.band].c }}>
                      {assessment.score}
                    </div>
                    <div style={{ fontSize: 12, color: C.inkSoft, maxWidth: 200 }}>composite urgency score out of 100 (illustrative rule-based stand-in for the trained model)</div>
                  </div>
                </Card>

                <Card>
                  <Eyebrow>Why this result</Eyebrow>
                  <div style={{ fontFamily: "Source Serif 4, serif", fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Contributing factors</div>
                  <div className="flex flex-col gap-3">
                    {assessment.factors.map((f, i) => (
                      <div key={i}>
                        <div className="flex justify-between mb-1.5">
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{f.label}</span>
                          <span style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: C.inkSoft }}>+{f.pts}</span>
                        </div>
                        <div className="rounded-full overflow-hidden" style={{ height: 7, background: C.borderSoft }}>
                          <div style={{ height: "100%", width: `${(f.pts / assessment.maxPts) * 100}%`, background: bandColors[assessment.band].c, borderRadius: 999 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 14 }}>
                    Stand-in for SHAP feature-importance output from the trained triage model.
                  </div>
                </Card>

                {imageURL && assessment.imageVerdict && (
                  <Card>
                    <Eyebrow>Visual model</Eyebrow>
                    <div className="flex gap-5 items-center flex-wrap">
                      <div className="relative rounded-xl overflow-hidden" style={{ width: 160, height: 160, border: `1px solid ${C.border}` }}>
                        <img src={imageURL} alt="analyzed" className="w-full h-full object-cover" />
                        <div
                          className="absolute inset-0"
                          style={{ background: `radial-gradient(circle at 55% 45%, ${bandColors[assessment.band].c}55, transparent 60%)` }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>{assessment.imageVerdict.verdictText}</div>
                        <div style={{ fontSize: 12.5, color: C.inkSoft, maxWidth: 320 }}>
                          Overlay simulates a Grad-CAM attention map — illustrative only, standing in for the real heatmap the trained CNN would produce.
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                <Card style={{ background: bandColors[assessment.band].t, border: "none" }}>
                  <div className="flex items-start gap-3">
                    <MapPin size={18} color={bandColors[assessment.band].c} className="mt-0.5 shrink-0" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: bandColors[assessment.band].c, marginBottom: 2 }}>
                        {assessment.band === "high" ? "Seek in-person care as soon as possible" :
                         assessment.band === "medium" ? "Book a clinician visit in the next few days" :
                         "Self-care and monitoring is reasonable"}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.inkSoft }}>
                        This is a screening tool, not a diagnosis. If symptoms worsen or new red-flag symptoms appear, seek care immediately.
                      </div>
                    </div>
                  </div>
                </Card>

                <div className="flex justify-center">
                  <GhostButton onClick={reset} icon={RotateCcw}>Run a new checkup</GhostButton>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-center pb-8" style={{ fontSize: 11, color: C.inkFaint, fontFamily: "IBM Plex Mono, monospace" }}>
        PROTOTYPE · SCORING LOGIC IS RULE-BASED, STANDING IN FOR THE TRAINED MODEL
      </div>
    </div>
  );
}
