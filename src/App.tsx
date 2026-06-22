import { supabase } from "./lib/supabase";
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { 
  Upload, Download, Users, ShieldAlert, BarChart2, FileText, 
  CheckCircle, ChevronDown, ChevronUp, Calendar, Search, 
  Settings, Database, Zap, Cpu, Award, Sparkles,
  ArrowRight, Briefcase, RefreshCw, Bell, Layout, Eye, LogOut, Check, X,
  Mail, Lock, User, Key, ArrowLeft
} from 'lucide-react';


// ==========================================
// SCORING ENGINE PARITY LOGIC (STRICT PYTHON V4)
// ==========================================
const WEIGHTS = {
  career: 0.19, description: 0.18, skills: 0.22, jd_fit: 0.15,
  assessments: 0.13, experience: 0.07, location: 0.03, education: 0.03,
};

const EXP_MIN = 3, EXP_IDEAL_LOW = 6, EXP_IDEAL_HIGH = 8, EXP_MAX = 12;

const REQUIRED_SKILLS = [
  "embeddings", "sentence-transformers", "sentence transformers", "vector database", "vector db", "pinecone", "weaviate", "qdrant", "milvus", "opensearch", "elasticsearch", "faiss", "chroma", "retrieval", "rag", "hybrid search", "dense retrieval", "ranking", "learning to rank", "information retrieval", "nlp", "python", "ndcg", "mrr", "map", "a/b testing", "a/b test", "evaluation framework", "mean average precision",
];

const BONUS_SKILLS = [
  "lora", "qlora", "peft", "fine-tuning", "fine tuning", "llm", "large language model", "xgboost", "neural ranking", "distributed systems", "pytorch", "tensorflow", "open source", "a/b testing", "bm25",
];

const DESCRIPTION_KEYWORDS_HIGH = [
  "embedding", "embeddings", "vector search", "vector db", "vector database", "retrieval", "rag", "ranking", "recommendation", "semantic search", "faiss", "pinecone", "weaviate", "qdrant", "milvus", "opensearch", "sentence-transformers", "dense retrieval", "hybrid search", "information retrieval", "learning to rank", "fine-tuning", "fine-tuned", "lora", "qlora", "llm", "language model", "ml pipeline", "model serving", "model deployment", "bm25", "rerank", "ndcg", "mrr", "map", "mean average precision", "a/b test", "a/b testing", "evaluation framework", "offline evaluation", "online evaluation", "precision@", "recall@", "hit rate", "click-through",
];

const DESCRIPTION_KEYWORDS_MEDIUM = [
  "machine learning", "deep learning", "neural network", "pytorch", "tensorflow", "nlp", "natural language", "text classification", "feature engineering", "model training", "python", "data pipeline",
];

const CORE_JD_TERMS = {
  "ndcg": 3.0, "mrr": 3.0, "mean average precision": 3.0, "map": 2.5, "evaluation framework": 2.5, "offline evaluation": 2.5, "online evaluation": 2.5, "precision@": 2.0, "recall@": 2.0, "hit rate": 2.0, "a/b test": 2.0, "a/b testing": 2.0, "qdrant": 2.5, "weaviate": 2.5, "milvus": 2.5, "faiss": 2.0, "pinecone": 2.0, "learning to rank": 2.0, "dense retrieval": 2.0, "hybrid search": 2.0, "bm25": 2.0, "rerank": 1.8, "vector search": 1.5, "information retrieval": 1.5, "retrieval": 1.0, "ranking": 1.0, "embeddings": 1.0, "rag": 1.2,
};
const CORE_JD_MAX = Object.values(CORE_JD_TERMS).reduce((a, b) => a + b, 0);

const RELEVANT_ASSESSMENTS = [
  "python", "nlp", "machine learning", "deep learning", "information retrieval", "embeddings", "pytorch", "tensorflow", "sql", "data structures", "algorithms",
];

const CONSULTING_COMPANIES = ["tcs", "tata consultancy", "infosys", "wipro", "accenture", "cognizant", "capgemini", "hcl", "tech mahindra", "mindtree", "mphasis", "hexaware", "ltimindtree", "l&t infotech"];
const INDIA_METROS = ["pune", "noida", "delhi", "gurugram", "gurgaon", "bengaluru", "bangalore", "hyderabad", "mumbai", "chennai", "delhi ncr"];
const SENIOR_TITLES = ["senior", "lead", "staff", "principal"];
const ML_ENG_ROLE_KEYWORDS = ["engineer", "scientist", "researcher", "developer", "ml", "ai", "nlp", "search", "ranking", "recommendation", "data", "backend", "platform", "infrastructure"];

const daysSince = (dateStr, referenceDate) => {
  if (!dateStr) return 9999;
  try {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length !== 3) return 9999;
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    if (isNaN(d.getTime())) return 9999;
    const diffTime = referenceDate.getTime() - d.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } catch { return 9999; }
};

const isHoneypot = (c) => {
  const skills = c.skills || [];
  const career = c.career_history || [];
  const yoe = c.profile?.years_of_experience || 0;
  const expertZero = skills.filter(s => s.proficiency === "expert" && (s.duration_months === undefined ? 1 : s.duration_months) === 0).length;
  if (expertZero >= 3) return true;
  const totalMonths = career.reduce((sum, j) => sum + (j.duration_months || 0), 0);
  if (yoe > 3 && totalMonths < yoe * 12 * 0.4) return true;
  const expertCount = skills.filter(s => s.proficiency === "expert").length;
  const expertLimit = Math.max(12, Math.floor(yoe * 2));
  if (expertCount >= expertLimit) return true;
  if (yoe < 3 && expertCount > 8) return true;
  return false;
};

const scoreCareer = (c) => {
  const career = c.career_history || [];
  if (!career.length) return 0.0;
  let weightedScore = 0.0;
  career.forEach(job => {
    const title = (job.title || "").toLowerCase();
    const company = (job.company || "").toLowerCase();
    const industry = (job.industry || "").toLowerCase();
    const size = job.company_size || "";
    const months = job.duration_months || 0;
    const timeWeight = Math.min(months / 24, 2.0);

    let titleScore = 0.0;
    if (["ml engineer", "machine learning", "ai engineer", "applied scientist", "nlp engineer", "search engineer", "ranking", "recommendation"].some(t => title.includes(t))) titleScore = 1.0;
    else if (["data scientist", "research engineer", "software engineer", "backend engineer", "data engineer"].some(t => title.includes(t))) titleScore = 0.6;
    else if (["analyst", "consultant", "manager", "frontend", "qa", "test"].some(t => title.includes(t))) titleScore = 0.1;

    let companyBonus = 0.0;
    const isConsulting = CONSULTING_COMPANIES.some(firm => company.includes(firm));
    if (isConsulting) companyBonus = -0.2; 
    else if (["software", "fintech", "saas", "ai", "ml", "food delivery", "ecommerce", "edtech"].includes(industry)) companyBonus = 0.3;
    else if (["51-200", "201-500", "501-1000"].includes(size)) companyBonus = 0.2;

    weightedScore += (titleScore + companyBonus) * timeWeight;
  });
  const totalTimeWeightSum = career.reduce((sum, job) => sum + Math.min((job.duration_months || 0) / 24, 2.0), 0);
  return Math.max(0.0, Math.min(weightedScore / Math.max(totalTimeWeightSum, 1.0), 1.0));
};

const scoreDescription = (c) => {
  const career = c.career_history || [];
  if (!career.length) return 0.0;
  let totalHigh = 0, totalMedium = 0;
  career.forEach(job => {
    const desc = (job.description || "").toLowerCase();
    const months = job.duration_months !== undefined ? job.duration_months : 1;
    const timeWeight = Math.min(months / 24, 1.5);
    totalHigh += DESCRIPTION_KEYWORDS_HIGH.filter(kw => desc.includes(kw)).length * timeWeight;
    totalMedium += DESCRIPTION_KEYWORDS_MEDIUM.filter(kw => desc.includes(kw)).length * timeWeight;
  });
  return 0.75 * Math.min(totalHigh / 5.0, 1.0) + 0.25 * Math.min(totalMedium / 8.0, 1.0);
};

const scoreSkills = (c) => {
  const skills = c.skills || [];
  if (!skills.length) return 0.0;
  let requiredHits = 0.0, bonusHits = 0.0;
  skills.forEach(skill => {
    const name = (skill.name || "").toLowerCase();
    const proficiency = skill.proficiency || "beginner";
    const months = skill.duration_months || 0;
    const endorsements = skill.endorsements || 0;
    if (["expert", "advanced"].includes(proficiency) && months === 0) return;
    const profMult = { beginner: 0.3, intermediate: 0.6, advanced: 0.85, expert: 1.0 }[proficiency] || 0.5;
    const durationMult = months > 0 ? Math.min(months / 48, 1.0) : 0.2;
    const endorseMult = Math.min(endorsements / 20, 1.0);
    const skillScore = profMult * (0.6 * durationMult + 0.4 * endorseMult);
    if (REQUIRED_SKILLS.some(req => name.includes(req))) requiredHits += skillScore;
    else if (BONUS_SKILLS.some(bon => name.includes(bon))) bonusHits += skillScore * 0.5;
  });
  return 0.8 * Math.min(requiredHits / 3.0, 1.0) + 0.2 * Math.min(bonusHits / 2.0, 1.0);
};

const scoreJdFit = (c) => {
  let text = (c.career_history || []).map(j => (j.description || "").toLowerCase() + " " + (j.title || "").toLowerCase()).join(" ") +
             (c.skills || []).map(s => (s.name || "").toLowerCase()).join(" ");
  let weightedHits = 0;
  for (const [term, weight] of Object.entries(CORE_JD_TERMS)) {
    if (text.includes(term)) weightedHits += weight;
  }
  return Math.min(weightedHits / (CORE_JD_MAX * 0.35), 1.0);
};

const scoreAssessments = (c) => {
  const assessments = (c.redrob_signals || {}).skill_assessment_scores || {};
  const entries = Object.entries(assessments);
  if (!entries.length) return 0.4;
  const relevantScores = entries.filter(([name]) => RELEVANT_ASSESSMENTS.some(rel => name.toLowerCase().includes(rel))).map(([, score]) => score);
  if (!relevantScores.length) return 0.4;
  return (relevantScores.reduce((a, b) => a + b, 0) / relevantScores.length) / 100.0;
};

const scoreExperience = (c) => {
  const yoe = c.profile?.years_of_experience || 0;
  if (yoe >= EXP_IDEAL_LOW && yoe <= EXP_IDEAL_HIGH) return 1.0;
  if (yoe >= EXP_MIN && yoe < EXP_IDEAL_LOW) return 0.4 + 0.6 * (yoe - EXP_MIN) / (EXP_IDEAL_LOW - EXP_MIN);
  if (yoe > EXP_IDEAL_HIGH && yoe <= EXP_MAX) return 0.9 - 0.4 * (yoe - EXP_IDEAL_HIGH) / (EXP_MAX - EXP_IDEAL_HIGH);
  return 0.2;
};

const scoreLocation = (c) => {
  const profile = c.profile || {};
  const location = (profile.location || "").toLowerCase();
  const country = (profile.country || "").toLowerCase();
  const willing = (c.redrob_signals || {}).willing_to_relocate || false;
  if (country === "india") {
    if (location.includes("pune") || location.includes("noida")) return 1.0;
    if (INDIA_METROS.some(city => location.includes(city))) return 0.85;
    return willing ? 0.6 : 0.4;
  }
  return willing ? 0.5 : 0.15;
};

const scoreEducation = (c) => {
  const edu = c.education || [];
  if (!edu.length) return 0.5;
  const tierScores = { tier_1: 1.0, tier_2: 0.8, tier_3: 0.6, tier_4: 0.4, unknown: 0.5 };
  return Math.max(...edu.map(e => tierScores[e.tier || "unknown"] || 0.5));
};

const promotionScore = (c) => {
  const career = c.career_history || [];
  if (career.length < 2) return 0.5;
  let count = 0;
  career.forEach(job => {
    const title = (job.title || "").toLowerCase();
    if (SENIOR_TITLES.some(x => title.includes(x)) && ML_ENG_ROLE_KEYWORDS.some(x => title.includes(x))) count++;
  });
  return Math.min(count / 3.0, 1.0);
};

const behavioralMultiplier = (c, referenceDate) => {
  const rs = c.redrob_signals || {};
  let multiplier = 1.0;
  const daysActive = daysSince(rs.last_active_date, referenceDate);
  if (daysActive <= 30) multiplier *= 1.2;
  else if (daysActive <= 60) multiplier *= 1.0;
  else if (daysActive <= 180) multiplier *= 0.75;
  else multiplier *= 0.4;

  multiplier *= rs.open_to_work_flag ? 1.1 : 0.85;
  const rr = rs.recruiter_response_rate !== undefined ? rs.recruiter_response_rate : 0;
  if (rr >= 0.7) multiplier *= 1.1;
  else if (rr >= 0.4) multiplier *= 1.0;
  else if (rr >= 0.2) multiplier *= 0.85;
  else multiplier *= 0.6;

  const notice = rs.notice_period_days !== undefined ? rs.notice_period_days : 90;
  if (notice <= 15) multiplier *= 1.15;
  else if (notice <= 30) multiplier *= 1.05;
  else if (notice <= 60) multiplier *= 0.9;
  else multiplier *= 0.75;

  const github = rs.github_activity_score !== undefined ? rs.github_activity_score : -1;
  if (github >= 50) multiplier *= 1.1;
  else if (github >= 20) multiplier *= 1.05;
  else if (github !== -1) multiplier *= 0.95;

  const icr = rs.interview_completion_rate !== undefined ? rs.interview_completion_rate : 0.5;
  if (icr >= 0.8) multiplier *= 1.05;
  else if (icr < 0.4) multiplier *= 0.9;

  const saved = rs.saved_by_recruiters_30d || 0;
  if (saved >= 20) multiplier *= 1.15;
  else if (saved >= 10) multiplier *= 1.08;
  if ((rs.search_appearance_30d || 0) >= 200) multiplier *= 1.05;

  const promo = promotionScore(c);
  if (promo >= 0.8) multiplier *= 1.1;
  else if (promo >= 0.5) multiplier *= 1.05;

  return Math.max(0.5, Math.min(multiplier, 1.2)); 
};

const generateReasoning = (c, score, referenceDate) => {
  const p = c.profile || {};
  const rs = c.redrob_signals || {};
  const skills = c.skills || [];
  const title = p.current_title || "Unknown";
  const yoe = p.years_of_experience || 0;
  const notice = rs.notice_period_days !== undefined ? rs.notice_period_days : 90;
  const responseRate = rs.recruiter_response_rate || 0;
  const activeDays = daysSince(rs.last_active_date, referenceDate);
  const openToWork = rs.open_to_work_flag || false;

  const relevant = skills.filter(s => [...REQUIRED_SKILLS, ...BONUS_SKILLS].some(r => (s.name || "").toLowerCase().includes(r)) && (s.duration_months || 0) > 6).map(s => s.name).slice(0, 3);
  
  let topAssessment = null;
  const entries = Object.entries(rs.skill_assessment_scores || {});
  if (entries.length > 0) {
    const best = entries.reduce((a, b) => a[1] > b[1] ? a : b);
    if (best[1] >= 70) topAssessment = `${best[0]}: ${Math.round(best[1])}/100`;
  }

  let jdText = (c.career_history || []).map(j => (j.description || "").toLowerCase()).join(" ") + " " + skills.map(sk => (sk.name || "").toLowerCase()).join(" ");
  let jdWeighted = 0;
  for (const [t, w] of Object.entries(CORE_JD_TERMS)) {
    if (jdText.includes(t)) jdWeighted += w;
  }
  const jdPct = Math.min(jdWeighted / (CORE_JD_MAX * 0.35), 1.0);

  const parts = [];
  parts.push(`${title} with ${yoe.toFixed(1)} yrs; key skills: ${relevant.length ? relevant.join(", ") : "limited relevant skills"}.`);
  if (jdPct >= 0.75) parts.push(`Strong JD alignment (${Math.round(jdPct * 100)}% of weighted JD score).`);
  else if (jdPct >= 0.40) parts.push(`Partial JD alignment (${Math.round(jdPct * 100)}% of weighted JD score).`);
  if (topAssessment) parts.push(`Platform assessment: ${topAssessment}.`);

  const concerns = [], strengths = [];
  if (notice > 60) concerns.push(`${notice}-day notice period`);
  if (responseRate < 0.3) concerns.push(`low response rate (${Math.round(responseRate * 100)}%)`);
  if (activeDays > 180) concerns.push(`inactive ${activeDays} days`);
  if (!openToWork) concerns.push("not open to work");

  if (responseRate >= 0.7) strengths.push(`high response rate (${Math.round(responseRate * 100)}%)`);
  if (notice <= 30) strengths.push(`short notice (${notice}d)`);
  if ((rs.github_activity_score !== undefined ? rs.github_activity_score : -1) >= 50) strengths.push("strong GitHub");
  if ((rs.saved_by_recruiters_30d || 0) >= 10) strengths.push(`saved by ${rs.saved_by_recruiters_30d} recruiters (30d)`);

  if (concerns.length) parts.push(`Concerns: ${concerns.slice(0, 2).join("; ")}.`);
  if (strengths.length) parts.push(`Strengths: ${strengths.slice(0, 2).join("; ")}.`);

  return parts.join(" ");
};

const rankCandidates = (candidates, referenceDate) => {
  const scored = candidates.map(c => {
    if (isHoneypot(c)) return { candidate: c, score: 0.01, breakdown: { honeypot: true } };
    const breakdown = {
      career: scoreCareer(c), description: scoreDescription(c), skills: scoreSkills(c),
      jd_fit: scoreJdFit(c), assessments: scoreAssessments(c), experience: scoreExperience(c),
      location: scoreLocation(c), education: scoreEducation(c)
    };
    const base = Object.keys(WEIGHTS).reduce((sum, key) => sum + WEIGHTS[key] * breakdown[key], 0);
    const bm = behavioralMultiplier(c, referenceDate);
    breakdown.behavioral_mult = bm; breakdown.base_score = base;
    return { candidate: c, score: Number((base * bm).toFixed(6)), breakdown };
  });

  scored.sort((a, b) => Math.abs(b.score - a.score) > 1e-9 ? b.score - a.score : (a.candidate.candidate_id || "").localeCompare(b.candidate.candidate_id || ""));

  const realScores = scored.filter(x => x.score > 0.01).map(x => x.score);
  let normalizedByCandidateId = {};
  if (realScores.length > 0) {
    const maxScore = Math.max(...realScores), minScore = Math.min(...realScores), scoreRange = maxScore - minScore;
    scored.forEach(item => {
      const cid = item.candidate.candidate_id;
      if (item.score <= 0.01) normalizedByCandidateId[cid] = item.score;
      else normalizedByCandidateId[cid] = scoreRange < 1e-9 ? item.score : Number(((item.score - minScore) / scoreRange).toFixed(6));
    });
  } else {
    scored.forEach(item => normalizedByCandidateId[item.candidate.candidate_id] = item.score);
  }

  const finalResults = scored.map(item => ({ candidate: item.candidate, score: normalizedByCandidateId[item.candidate.candidate_id], breakdown: item.breakdown }));
  finalResults.sort((a, b) => Math.abs(b.score - a.score) > 1e-9 ? b.score - a.score : (a.candidate.candidate_id || "").localeCompare(b.candidate.candidate_id || ""));

  return finalResults.map((item, index) => ({
    rank: index + 1, candidate_id: item.candidate.candidate_id, score: item.score,
    reasoning: generateReasoning(item.candidate, item.score, referenceDate),
    breakdown: item.breakdown, rawProfile: item.candidate
  }));
};


const INITIAL_CANDIDATES = [
  {
    candidate_id: "cand-f89a2b91",
    profile: { current_title: "Senior ML Engineer", years_of_experience: 7.2, location: "Bengaluru, India", country: "India" },
    skills: [
      { name: "embeddings", proficiency: "expert", duration_months: 36, endorsements: 18 },
      { name: "python", proficiency: "expert", duration_months: 72, endorsements: 45 },
      { name: "rag", proficiency: "expert", duration_months: 28, endorsements: 22 },
      { name: "ndcg", proficiency: "intermediate", duration_months: 18, endorsements: 8 }
    ],
    career_history: [
      { title: "Senior Machine Learning Engineer", company: "NextGen AI", industry: "ai", duration_months: 36, description: "Built vector search systems and sparse-dense hybrid RAG pipelines using Milvus. Assessed evaluation pipelines with NDCG and MRR metrics." }
    ],
    education: [{ tier: "tier_1", degree: "B.Tech in Computer Science" }],
    redrob_signals: { last_active_date: "2024-12-15", open_to_work_flag: true, recruiter_response_rate: 0.92, notice_period_days: 15, skill_assessment_scores: { "python": 94, "nlp": 88 }, willing_to_relocate: true }
  },
  {
    candidate_id: "cand-cb91a27e",
    profile: { current_title: "AI Specialist", years_of_experience: 5.5, location: "Pune, India", country: "India" },
    skills: [
      { name: "qdrant", proficiency: "advanced", duration_months: 18, endorsements: 9 },
      { name: "python", proficiency: "expert", duration_months: 60, endorsements: 33 }
    ],
    career_history: [{ title: "Machine Learning Specialist", company: "Cognizant Technology Solutions", industry: "it services", duration_months: 30, description: "Maintained deep learning classifiers and open-source LLM wrappers." }],
    education: [{ tier: "tier_2", degree: "M.Tech in AI" }],
    redrob_signals: { last_active_date: "2024-11-20", open_to_work_flag: false, recruiter_response_rate: 0.55, notice_period_days: 60, skill_assessment_scores: { "python": 81 }, willing_to_relocate: true }
  }
];


// ==========================================
// NEO-BRUTALIST COMPONENTS
// ==========================================

const BrutalButton = ({ children, onClick, className = "", variant = "primary", disabled = false, type="button" }) => {
  const base = "font-bold py-3 px-6 rounded-xl border-4 border-slate-900 transition-all flex items-center justify-center gap-2";
  const active = disabled ? "opacity-50 cursor-not-allowed" : "hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#0f172a] active:translate-y-1 active:translate-x-1 active:shadow-none shadow-[4px_4px_0px_0px_#0f172a]";
  
  const variants = {
    primary: "bg-blue-500 text-white",
    secondary: "bg-white text-slate-900",
    outline: "bg-transparent text-slate-900 border-2",
    success: "bg-emerald-400 text-slate-900",
    purple: "bg-purple-500 text-white",
    yellow: "bg-yellow-300 text-slate-900",
    pink: "bg-pink-500 text-white"
  };

  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${active} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const CleanCard = ({ children, className = "" }) => (
  <div className={`bg-white border-4 border-slate-900 rounded-2xl shadow-[6px_6px_0px_0px_#0f172a] ${className}`}>
    {children}
  </div>
);

const StatCard = ({ title, value, sub, icon: Icon, trend }) => (
  <motion.div 
    whileHover={{ y: -4, x: -4, shadow: "8px 8px 0px 0px #0f172a" }}
    className="bg-white border-4 border-slate-900 p-6 rounded-2xl shadow-[4px_4px_0px_0px_#0f172a] transition-all"
  >
    <div className="flex justify-between items-start mb-4">
      <div className="w-12 h-12 bg-yellow-300 border-2 border-slate-900 text-slate-900 rounded-xl flex items-center justify-center shadow-[2px_2px_0px_0px_#0f172a]">
        <Icon size={24} />
      </div>
      {trend !== undefined && (
        <span className={`text-xs font-black px-2.5 py-1 rounded-full border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] ${trend > 0 ? 'bg-emerald-300 text-slate-900' : 'bg-rose-300 text-slate-900'}`}>
          {trend > 0 ? '↑ High' : '↓ Low'}
        </span>
      )}
    </div>
    <span className="text-4xl font-black text-slate-900 block tracking-tight mb-1">{value}</span>
    <span className="text-sm font-black text-slate-500 uppercase tracking-wider block">{title}</span>
    <span className="text-xs font-bold text-slate-400 mt-2 block">{sub}</span>
  </motion.div>
);

const ProgressBar = ({ label, value, colorClass = "bg-blue-500" }) => (
  <div className="space-y-2">
    <div className="flex justify-between text-xs font-black uppercase tracking-wider text-slate-600">
      <span>{label}</span>
      <span>{(value * 100).toFixed(0)}%</span>
    </div>
    <div className="h-4 w-full bg-slate-100 rounded-full border-2 border-slate-900 overflow-hidden shadow-inner">
      <motion.div 
        initial={{ width: 0 }}
        animate={{ width: `${Math.round(value * 100)}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
        className={`h-full ${colorClass} border-r-2 border-slate-900`} 
      />
    </div>
  </div>
);

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === 'error' ? 'bg-rose-400' : 'bg-emerald-400';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className={`fixed bottom-6 right-6 ${bg} text-slate-900 border-4 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] px-6 py-4 rounded-2xl flex items-center gap-3 z-50`}
    >
      {type === 'error' ? <ShieldAlert size={20} className="shrink-0" /> : <CheckCircle size={20} className="shrink-0" />}
      <span className="font-bold text-sm">{message}</span>
      <button onClick={onClose} className="ml-4 hover:bg-slate-900/10 p-1 rounded-lg transition-colors"><X size={16} /></button>
    </motion.div>
  );
};

// ==========================================
// AUTHENTICATION VIEWS (NEO-BRUTALIST)
// ==========================================

const AuthInput = ({ label, type = "text", placeholder, icon: Icon, name }) => (
  <div className="space-y-2 mb-5 w-full text-left">
    <label className="font-black text-sm uppercase tracking-wider text-slate-700">{label}</label>
    <div className="relative">
      {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />}
      <input 
        name={name}
        type={type} 
        placeholder={placeholder} 
        className={`w-full bg-white border-4 border-slate-900 rounded-xl py-3.5 px-4 focus:outline-none focus:ring-4 focus:ring-yellow-300 transition-all font-bold text-slate-900 placeholder:text-slate-400 shadow-[4px_4px_0px_0px_#0f172a] ${Icon ? 'pl-12' : ''}`} 
        required
      />
    </div>
  </div>
);

const AuthLayout = ({ children, title, subtitle, setView }) => (
  <div className="min-h-screen flex text-slate-900 font-sans selection:bg-blue-300 bg-[#f8fafc] bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:24px_24px]">
    <button 
      onClick={() => setView('landing')} 
      className="absolute top-6 left-6 flex items-center gap-2 font-black uppercase tracking-widest text-sm text-slate-600 hover:text-slate-900 transition-colors z-20"
    >
      <ArrowLeft size={20} /> Back
    </button>
    
    {/* Left Side - Graphic (Hidden on mobile) */}
    <div className="hidden lg:flex w-1/2 bg-blue-500 border-r-4 border-slate-900 flex-col justify-center items-center p-12 relative overflow-hidden">
       {/* Background pattern */}
       <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#000_2px,transparent_2px)] [background-size:20px_20px]" />
       
       <div className="relative z-10 text-center space-y-6 max-w-lg">
          <div className="w-24 h-24 bg-yellow-300 rounded-3xl flex items-center justify-center border-4 border-slate-900 shadow-[8px_8px_0px_0px_#0f172a] mx-auto mb-8 transform -rotate-6 hover:rotate-0 transition-transform">
             <Cpu size={48} className="text-slate-900" />
          </div>
          <h1 className="text-5xl xl:text-6xl font-black tracking-tighter text-white drop-shadow-[4px_4px_0px_#0f172a] leading-tight">
             Unlock the <br/>
             <span className="text-yellow-300">Engine.</span>
          </h1>
          <p className="text-lg font-bold text-blue-100 border-l-4 border-pink-400 pl-4 text-left">
             Access the V4 scoring model. Manage candidate pipelines, deploy configurations, and export parity-locked telemetry.
          </p>
       </div>

       {/* Floating decorations */}
       <div className="absolute top-20 right-20 w-16 h-16 bg-pink-500 rounded-full border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] animate-bounce" style={{ animationDuration: '3s' }} />
       <div className="absolute bottom-20 left-20 w-20 h-20 bg-emerald-400 border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] transform rotate-12" />
    </div>

    {/* Right Side - Form */}
    <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl border-4 border-slate-900 shadow-[12px_12px_0px_0px_#0f172a]"
      >
        <div className="mb-10 text-center">
          <h2 className="text-4xl font-black tracking-tighter text-slate-900 mb-2 uppercase">{title}</h2>
          <p className="text-slate-500 font-bold">{subtitle}</p>
        </div>
        {children}
      </motion.div>
    </div>
  </div>
);

const LoginView = ({ setView, onLogin }) => (
  <AuthLayout title="Welcome Back" subtitle="Enter your credentials to access the workspace." setView={setView}>
    <form onSubmit={(e) => { 
      e.preventDefault(); 
      const formData = new FormData(e.currentTarget);
      onLogin(formData.get('email'), formData.get('password')); 
    }}>
      <AuthInput name="email" label="Email Address" type="email" placeholder="agent@nexus.ai" icon={Mail} />
      <AuthInput name="password" label="Password" type="password" placeholder="••••••••" icon={Lock} />
      
      <div className="flex items-center justify-between mt-2 mb-8">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-5 h-5 border-4 border-slate-900 rounded bg-white text-blue-500 focus:ring-yellow-300 focus:ring-offset-0 transition-all checked:bg-blue-500" />
          <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">Remember Me</span>
        </label>
        <button type="button" onClick={() => setView('forgotPassword')} className="text-sm font-black text-pink-500 hover:text-pink-600 hover:underline uppercase tracking-wider transition-colors">
          Lost Key?
        </button>
      </div>

      <BrutalButton type="submit" variant="primary" className="w-full py-4 text-lg">
        Initialize Session <ArrowRight size={24} />
      </BrutalButton>
    </form>

    <div className="mt-8 text-center pt-6 border-t-4 border-slate-100">
      <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
        No clearance?{' '}
        <button type="button" onClick={() => setView('signup')} className="text-blue-600 hover:text-blue-700 font-black hover:underline transition-colors">
          Request Access
        </button>
      </p>
    </div>
  </AuthLayout>
);

const SignupView = ({ setView, onSignup }) => (
  <AuthLayout title="Create Profile" subtitle="Register a new operator identity." setView={setView}>
    <form onSubmit={(e) => { 
      e.preventDefault(); 
      const formData = new FormData(e.currentTarget);
      onSignup(formData.get('fullName'), formData.get('email'), formData.get('password')); 
    }}>
      <AuthInput name="fullName" label="Full Name" type="text" placeholder="Jane Doe" icon={User} />
      <AuthInput name="email" label="Email Address" type="email" placeholder="agent@nexus.ai" icon={Mail} />
      <AuthInput name="password" label="Password" type="password" placeholder="••••••••" icon={Lock} />
      
      <BrutalButton type="submit" variant="pink" className="w-full py-4 text-lg mt-6">
        Generate Identity <Zap size={24} />
      </BrutalButton>
    </form>

    <div className="mt-8 text-center pt-6 border-t-4 border-slate-100">
      <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
        Already registered?{' '}
        <button type="button" onClick={() => setView('login')} className="text-blue-600 hover:text-blue-700 font-black hover:underline transition-colors">
          Return to Login
        </button>
      </p>
    </div>
  </AuthLayout>
);

const ForgotPasswordView = ({ setView }) => (
  <AuthLayout title="System Reset" subtitle="We'll send a recovery link to your terminal." setView={setView}>
    <form onSubmit={(e) => { e.preventDefault(); setView('login'); }}>
      <AuthInput name="email" label="Email Address" type="email" placeholder="agent@nexus.ai" icon={Mail} />
      <BrutalButton type="submit" variant="yellow" className="w-full py-4 text-lg mt-6">
        Transmit Link <ArrowRight size={24} />
      </BrutalButton>
    </form>
    <div className="mt-8 text-center pt-6 border-t-4 border-slate-100">
      <button type="button" onClick={() => setView('login')} className="text-sm font-black text-slate-600 hover:text-slate-900 uppercase tracking-wider hover:underline transition-colors">
        Cancel Reset Sequence
      </button>
    </div>
  </AuthLayout>
);

// ==========================================
// MAIN APPLICATION ENTRY
// ==========================================

export default function App() {
  // Navigation State: 'landing', 'login', 'signup', 'forgotPassword', 'dashboard'
  const [view, setView] = useState('landing');
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [sidebarOpen, setSidebarOpen] = useState(true); 
  const [candidates, setCandidates] = useState(INITIAL_CANDIDATES);
  const [refDateString, setRefDateString] = useState("2025-01-01");
  const [searchQuery, setSearchQuery] = useState("");
  const [comparisonMode, setComparisonMode] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [toast, setToast] = useState(null); 
  const [isUploading, setIsUploading] = useState(false);

  // --- AUTH STATE & POPUP ---
  const [currentUser, setCurrentUser] = useState(null);
  const [registeredUsers, setRegisteredUsers] = useState([{ email: 'agent@nexus.ai', name: 'Nexus Agent' }]);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
  const loadUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      setCurrentUser({
        email: user.email,
        name: user.email.split("@")[0],
        initials: user.email.substring(0, 2).toUpperCase(),
      });

      setView("dashboard");
    }
  };

  loadUser();
}, []);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '??';
  };

  const handleLogin = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  setCurrentUser({
    email: data.user.email,
    name: data.user.email.split("@")[0],
    initials: data.user.email.substring(0, 2).toUpperCase(),
  });

  setView("dashboard");
  showToast("Login successful");
};

  const handleSignup = (name, email, password) => {
    if (!name || !email || !password) {
      showToast("Please fill out all identity fields.", "error");
      return;
    }
    const existing = registeredUsers.find(u => u.email === email);
    if (existing) {
      showToast("Identity already exists. Please return to login.", "error");
    } else {
      const newUser = { email, name };
      setRegisteredUsers([...registeredUsers, newUser]);
      setCurrentUser({ ...newUser, initials: getInitials(name) });
      setView('dashboard');
      showToast("Identity generated successfully.");
    }
  };

  const referenceDate = useMemo(() => {
    const parts = refDateString.split("-");
    if (parts.length !== 3) return new Date("2025-01-01T00:00:00Z");
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    return isNaN(d.getTime()) ? new Date("2025-01-01T00:00:00Z") : d;
  }, [refDateString]);

  const rankedData = useMemo(() => rankCandidates(candidates, referenceDate), [candidates, referenceDate]);

  const filteredRankedData = useMemo(() => {
    return rankedData.filter(c => 
      c.candidate_id.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.reasoning.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.rawProfile.profile?.current_title || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [rankedData, searchQuery]);

  const stats = useMemo(() => {
    const honeypots = filteredRankedData.filter(r => r.score <= 0.01).length;
    const scores = filteredRankedData.filter(r => r.score > 0.01).map(r => r.score);
    return {
      total: filteredRankedData.length,
      honeypots,
      valid: filteredRankedData.length - honeypots,
      avgScore: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3) : "0.000"
    };
  }, [filteredRankedData]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      // Yield to main thread to allow "Processing..." UI to render
      setTimeout(() => {
        const text = event.target.result;
        let parsed = [];
        try {
          const data = JSON.parse(text);
          parsed = Array.isArray(data) ? data : [data];
        } catch (err) {
          const lines = text.split(/\r?\n/); 
          for (const line of lines) {
            if (line.trim()) {
              try { 
                parsed.push(JSON.parse(line)); 
              } catch (e) {
                console.warn("Skipping invalid JSON line:", line);
              }
            }
          }
        }
        if (parsed.length > 0) {
          setCandidates(parsed);
          showToast(`Successfully loaded ${parsed.length} candidates.`);
        } else {
          showToast("No valid JSON candidates found in file.", "error");
        }
        setIsUploading(false);
      }, 50);
    };
    reader.readAsText(file);
    e.target.value = null; 
  };

  const seedMoreCandidates = () => {
    const generated = [...INITIAL_CANDIDATES];
    const titles = ["ML Architect", "Deep Learning Eng", "Data Engineer", "Python Backend"];
    for (let i = 1; i <= 40; i++) {
      const yoe = Number((3 + Math.random() * 8).toFixed(1));
      generated.push({
        candidate_id: `cand-gen-${Math.random().toString(36).substr(2, 6)}`,
        profile: { current_title: titles[Math.floor(Math.random() * titles.length)], years_of_experience: yoe, location: "Bengaluru, India", country: "India" },
        skills: [{ name: "python", proficiency: "expert", duration_months: Math.floor(yoe * 12), endorsements: 20 }, { name: "embeddings", proficiency: "advanced", duration_months: 24, endorsements: 12 }],
        career_history: [{ title: titles[Math.floor(Math.random() * titles.length)], company: "Tech Corp", industry: "software", duration_months: Math.floor(yoe * 6), description: "Built RAG systems and optimized elasticsearch." }],
        education: [{ tier: "tier_1", degree: "B.Tech" }],
        redrob_signals: { last_active_date: "2024-11-05", open_to_work_flag: true, recruiter_response_rate: 0.8, notice_period_days: 30, skill_assessment_scores: { "python": 85 }, willing_to_relocate: true }
      });
    }
    setCandidates(generated);
    showToast("Generated 40 mock candidate profiles.");
  };

  const downloadSubmissionCsv = () => {
    if (!filteredRankedData || filteredRankedData.length === 0) return;
    const header = ["candidate_id", "rank", "score", "reasoning"];
    const rows = filteredRankedData.slice(0, 100).map(c => [
      c.candidate_id, c.rank, c.score.toFixed(6), `"${c.reasoning.replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `submission_${refDateString}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text) => {
    const tempTextArea = document.createElement("textarea");
    tempTextArea.value = text;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    try {
      document.execCommand('copy');
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 2000);
      showToast("Copied to clipboard!");
    } catch (err) {
      showToast("Failed to copy", "error");
    }
    document.body.removeChild(tempTextArea);
  };

  const dottedGrid = {
    backgroundColor: '#f8fafc',
    backgroundImage: `radial-gradient(#94a3b8 1px, transparent 1px)`,
    backgroundSize: '24px 24px'
  };

  const NavItem = ({ id, label, icon: Icon }) => (
    <button 
      onClick={() => setActiveTab(id)} 
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-black text-sm uppercase tracking-wider
        ${activeTab === id 
          ? 'bg-blue-500 text-white border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] translate-x-1' 
          : 'bg-white text-slate-600 border-4 border-transparent hover:border-slate-900 hover:shadow-[4px_4px_0px_0px_#0f172a] hover:text-slate-900 hover:-translate-y-1'
        }
      `}
    >
      <Icon size={20} className="shrink-0" />
      {sidebarOpen && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );

  // --- ROUTING RENDERER ---
  const renderContent = () => {
    if (view === 'login') return <LoginView setView={setView} onLogin={handleLogin} />;
    if (view === 'signup') return <SignupView setView={setView} onSignup={handleSignup} />;
    if (view === 'forgotPassword') return <ForgotPasswordView setView={setView} />;

    if (view === 'landing') {
      return (
        <div className="min-h-screen text-slate-900 font-sans selection:bg-blue-300 relative overflow-hidden" style={dottedGrid}>
          
          {/* Navigation - Neo-Brutalist */}
          <nav className="fixed top-6 inset-x-0 mx-auto w-[95%] max-w-6xl bg-white border-4 border-slate-900 rounded-2xl px-6 py-4 flex justify-between items-center z-50 shadow-[8px_8px_0px_0px_#0f172a]">
              <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-300 rounded-xl flex items-center justify-center border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a]">
                      <Cpu size={24} className="text-slate-900" />
                  </div>
                  <span className="font-black text-2xl tracking-tighter uppercase">Nexus AI</span>
              </div>
              <div className="hidden md:flex gap-8 text-sm font-black uppercase tracking-widest text-slate-600">
                  <button className="hover:text-blue-600 hover:-translate-y-1 transition-all">Platform</button>
                  <button className="hover:text-pink-500 hover:-translate-y-1 transition-all">Engine</button>
              </div>
              <BrutalButton type="button" onClick={() => setView('login')} variant="primary" className="py-2.5 px-6 text-sm">
                  Login / Enter
              </BrutalButton>
          </nav>

          {/* Hero Section */}
          <section className="relative pt-48 pb-20 px-6 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16 min-h-screen">
              <div className="flex-1 space-y-8 z-10 text-center lg:text-left">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-pink-300 border-4 border-slate-900 rounded-xl font-black text-xs uppercase tracking-widest text-slate-900 shadow-[4px_4px_0px_0px_#0f172a] transform -rotate-2">
                      <Sparkles size={16} /> Parity Lock V4 Active
                  </div>
                  
                  <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9] text-slate-900 drop-shadow-md">
                    Precision <br/>
                    <span className="text-blue-600 inline-block mt-2">Talent Routing.</span>
                  </h1>
                  
                  <p className="text-xl font-bold text-slate-600 max-w-xl mx-auto lg:mx-0 border-l-4 border-yellow-300 pl-4">
                      The intelligence of a massive SaaS platform wrapped in a tactile, responsive workspace. 100% logic alignment with offline predictive models.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-6">
                      <BrutalButton type="button" onClick={() => setView('login')} variant="primary" className="text-xl py-4 px-8">
                          Launch Dashboard <ArrowRight size={24} />
                      </BrutalButton>
                      <BrutalButton type="button" onClick={seedMoreCandidates} variant="yellow" className="text-lg py-4 px-8">
                          <Database size={20} /> Load Mock Data
                      </BrutalButton>
                  </div>
              </div>

              {/* Floating UI Elements */}
              <div className="flex-1 relative w-full h-[500px] hidden lg:block perspective-1000">
                  <motion.div 
                    animate={{ y: [0, -15, 0], rotate: [3, 5, 3] }} 
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-10 right-10 bg-white border-4 border-slate-900 p-6 rounded-2xl shadow-[12px_12px_0px_0px_#0f172a] w-80 z-20"
                  >
                    <div className="flex justify-between items-center mb-6 border-b-4 border-slate-900 pb-4">
                      <span className="font-black text-sm uppercase text-slate-900 tracking-wider">Live Evaluation</span>
                      <span className="w-4 h-4 bg-emerald-400 rounded-full animate-pulse border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a]" />
                    </div>
                    <div className="space-y-4">
                      {rankedData.slice(0, 2).map((c, i) => (
                        <div key={i} className="flex justify-between items-center bg-slate-100 p-3 rounded-xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a]">
                          <span className="font-bold text-sm text-slate-800 truncate max-w-[150px]">{c.rawProfile.profile?.current_title}</span>
                          <span className="font-black text-blue-600 bg-blue-100 px-2 py-1 rounded-md border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a]">{c.score.toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  <motion.div 
                    animate={{ y: [0, 15, 0], rotate: [-6, -4, -6] }} 
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute bottom-20 left-10 bg-purple-500 text-white border-4 border-slate-900 p-6 rounded-2xl shadow-[12px_12px_0px_0px_#0f172a] w-64 z-10"
                  >
                     <Award size={40} className="mb-4 text-yellow-300" />
                     <h3 className="font-black text-2xl mb-2 tracking-tight">Zero Bias</h3>
                     <p className="text-sm font-bold opacity-90 leading-tight">Anonymized, skill-centric evaluation vectors running locally.</p>
                  </motion.div>
              </div>
          </section>
        </div>
      );
    }

    return (
      <div className="min-h-screen text-slate-900 font-sans flex overflow-hidden selection:bg-blue-300" style={dottedGrid}>
        
        {/* Floating Sidebar (Neo-Brutalist) */}
        <div className={`p-4 transition-all duration-300 ${sidebarOpen ? 'w-72' : 'w-24 shrink-0'}`}>
          <aside className="bg-white border-4 border-slate-900 h-full rounded-2xl shadow-[8px_8px_0px_0px_#0f172a] flex flex-col z-20 overflow-hidden relative">
            
            <div className="h-24 flex items-center px-6 justify-between shrink-0 border-b-4 border-slate-900 bg-yellow-300">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a]">
                  <Cpu size={24} className="text-slate-900" />
                </div>
                {sidebarOpen && <span className="font-black text-xl tracking-tighter uppercase whitespace-nowrap text-slate-900">Nexus AI</span>}
              </div>
            </div>
            
            <nav className="flex-1 py-6 px-4 space-y-3 overflow-y-auto">
              <NavItem id="dashboard" label="Overview" icon={Layout} />
              <NavItem id="candidates" label="Shortlist" icon={Users} />
              <NavItem id="settings" label="Parameters" icon={Settings} />
            </nav>

            <div className="p-4 shrink-0 border-t-4 border-slate-900 bg-slate-100">
              <button onClick={() => { setView('landing'); setCurrentUser(null); }} className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 hover:text-white bg-white hover:bg-rose-500 rounded-xl transition-all font-black text-sm uppercase tracking-wider border-4 border-slate-900 hover:shadow-[4px_4px_0px_0px_#0f172a]">
                <LogOut size={20} className="shrink-0" />
                {sidebarOpen && <span className="whitespace-nowrap">Sign Out</span>}
              </button>
            </div>
          </aside>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden pt-4 pr-4 pb-4">
          
          {/* Top Floating Navbar */}
          <header className="h-20 bg-white border-4 border-slate-900 rounded-2xl px-6 flex items-center justify-between z-10 shrink-0 shadow-[8px_8px_0px_0px_#0f172a] mb-6">
            <div className="flex items-center gap-6 flex-1 min-w-0">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-10 h-10 bg-slate-100 border-4 border-slate-900 rounded-xl flex items-center justify-center hover:bg-yellow-300 hover:shadow-[4px_4px_0px_0px_#0f172a] transition-all shrink-0 active:translate-y-1 active:shadow-none">
                <Layout size={20} className="text-slate-900" />
              </button>
              <div className="relative max-w-md w-full hidden md:block group">
                <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Query profiles by ID, text..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-100 border-4 border-slate-900 focus:bg-white text-sm rounded-xl pl-12 pr-4 py-3 text-slate-900 placeholder-slate-500 font-bold focus:outline-none transition-all shadow-[4px_4px_0px_0px_#0f172a]"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="flex items-center gap-2 bg-pink-200 border-4 border-slate-900 px-4 py-2 rounded-xl shadow-[4px_4px_0px_0px_#0f172a]">
                <Calendar size={18} className="text-slate-900" />
                <input type="date" value={refDateString} onChange={e => setRefDateString(e.target.value)} className="bg-transparent border-none text-sm text-slate-900 font-black focus:outline-none tracking-wider" />
              </div>
              
              <div className="relative">
                <div 
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="w-12 h-12 rounded-xl bg-purple-500 border-4 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] flex items-center justify-center font-black text-white cursor-pointer hover:-translate-y-1 transition-transform"
                >
                  {currentUser?.initials || 'AD'}
                </div>

                <AnimatePresence>
                  {profileOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-16 w-64 bg-white border-4 border-slate-900 rounded-2xl shadow-[8px_8px_0px_0px_#0f172a] z-50 overflow-hidden flex flex-col"
                      >
                        <div className="p-4 border-b-4 border-slate-900 bg-yellow-300">
                          <p className="font-black text-slate-900 truncate">{currentUser?.name || 'Admin User'}</p>
                          <p className="text-xs font-bold text-slate-600 truncate">{currentUser?.email || 'admin@nexus.ai'}</p>
                        </div>
                        <div className="p-2 bg-slate-50">
                           <button onClick={() => { setProfileOpen(false); setActiveTab('profile'); }} className="w-full text-left px-4 py-2 font-bold text-sm text-slate-700 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors">View Profile</button>
                           <button onClick={() => { setProfileOpen(false); setActiveTab('settings'); }} className="w-full text-left px-4 py-2 font-bold text-sm text-slate-700 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors">Account Settings</button>
                        </div>
                        <div className="p-2 border-t-4 border-slate-900 bg-rose-100">
                          <button 
                            onClick={() => { setProfileOpen(false); setCurrentUser(null); setView('landing'); }}
                            className="w-full flex items-center gap-2 px-4 py-2 font-black text-sm text-rose-600 hover:bg-rose-200 rounded-lg transition-colors"
                          >
                            <LogOut size={16} /> Sign Out
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
            <AnimatePresence mode="wait">
              
              {/* --- DASHBOARD TAB --- */}
              {activeTab === 'dashboard' && (
                <motion.div key="dashboard" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-8 max-w-6xl mx-auto">
                  <div>
                    <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter drop-shadow-sm">System Overview</h1>
                    <p className="text-slate-500 font-bold mt-2 text-lg">Executing offline Python v4 logic securely in browser.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard title="Processed" value={stats.total} sub="Local index" icon={Database} />
                    <StatCard title="Valid" value={stats.valid} sub="Passed honeypots" icon={CheckCircle} trend={1} />
                    <StatCard title="Trapped" value={stats.honeypots} sub="Rules triggered" icon={ShieldAlert} />
                    <StatCard title="Avg Score" value={stats.avgScore} sub="Pool quality" icon={Award} trend={1} />
                  </div>

                  <div className="grid lg:grid-cols-3 gap-6">
                    {/* Action Panel */}
                    <CleanCard className="lg:col-span-2 p-8 flex flex-col justify-between bg-emerald-50">
                      <div>
                        <h3 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tighter flex items-center gap-3">
                          <Zap size={32} className="text-emerald-500 fill-emerald-500"/> Pipeline Controls
                        </h3>
                        <p className="text-sm font-bold text-slate-600 mb-8 max-w-md">Deploy configuration matrices. Upload JSONL structures to execute strict parity scoring locally.</p>
                      </div>
                      
                      <div className="flex flex-wrap gap-4">
                        <label className={`cursor-pointer font-bold py-3 px-6 rounded-xl border-4 border-slate-900 transition-all flex items-center justify-center gap-2 ${isUploading ? 'bg-slate-400 text-slate-800 opacity-70 cursor-wait' : 'bg-blue-500 text-white hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#0f172a] active:translate-y-1 active:translate-x-1 active:shadow-none shadow-[4px_4px_0px_0px_#0f172a]'}`}>
                           {isUploading ? <RefreshCw size={20} className="animate-spin" /> : <Upload size={20} />} 
                           {isUploading ? "Processing..." : "Upload JSONL"}
                           <input type="file" accept=".jsonl,.json,.txt" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                        </label>
                        <BrutalButton onClick={downloadSubmissionCsv} variant="secondary" className="py-4">
                          <Download size={20} /> Export Filtered CSV
                        </BrutalButton>
                      </div>
                    </CleanCard>

                    {/* Config Snapshot */}
                    <CleanCard className="p-8 bg-blue-50">
                      <h3 className="text-sm font-black text-blue-600 uppercase tracking-widest mb-6 pb-4 border-b-4 border-slate-900">Math Weights</h3>
                      <div className="space-y-4 font-black text-sm">
                        <div className="flex justify-between text-slate-700"><span className="uppercase">Skills</span><span className="text-slate-900 bg-white border-4 border-slate-900 px-2 py-0.5 rounded-md shadow-[2px_2px_0px_0px_#0f172a]">22%</span></div>
                        <div className="flex justify-between text-slate-700"><span className="uppercase">Career</span><span className="text-slate-900 bg-white border-4 border-slate-900 px-2 py-0.5 rounded-md shadow-[2px_2px_0px_0px_#0f172a]">19%</span></div>
                        <div className="flex justify-between text-slate-700"><span className="uppercase">JD Fit</span><span className="text-slate-900 bg-white border-4 border-slate-900 px-2 py-0.5 rounded-md shadow-[2px_2px_0px_0px_#0f172a]">15%</span></div>
                        <div className="flex justify-between text-slate-700"><span className="uppercase">Assessments</span><span className="text-slate-900 bg-white border-4 border-slate-900 px-2 py-0.5 rounded-md shadow-[2px_2px_0px_0px_#0f172a]">13%</span></div>
                        <div className="pt-4 mt-4 border-t-4 border-slate-900 flex justify-between text-slate-700">
                          <span className="uppercase mt-1">Clamp limits</span><span className="text-purple-600 bg-white border-4 border-slate-900 px-2 py-1 rounded-md shadow-[4px_4px_0px_0px_#0f172a]">[0.5, 1.2]</span>
                        </div>
                      </div>
                    </CleanCard>
                  </div>
                </motion.div>
              )}

              {/* --- CANDIDATES TAB --- */}
              {activeTab === 'candidates' && (
                <motion.div key="candidates" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6 max-w-7xl mx-auto">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                    <div>
                      <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter">Candidate Index</h1>
                      <p className="text-slate-500 font-bold mt-2 text-lg">Select any row to view expanded math telemetry.</p>
                    </div>
                    <div className="flex bg-white p-2 rounded-xl border-4 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] shrink-0 gap-2">
                      <button onClick={() => setComparisonMode(false)} className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${!comparisonMode ? 'bg-blue-500 text-white shadow-[2px_2px_0px_0px_#0f172a] border-4 border-slate-900' : 'text-slate-600 hover:bg-slate-100 border-4 border-transparent'}`}>Standard UI</button>
                      <button onClick={() => setComparisonMode(true)} className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${comparisonMode ? 'bg-pink-400 text-slate-900 shadow-[2px_2px_0px_0px_#0f172a] border-4 border-slate-900' : 'text-slate-600 hover:bg-slate-100 border-4 border-transparent'}`}>Hacker Grid</button>
                    </div>
                  </div>

                  <CleanCard className="overflow-hidden p-0 border-4 border-slate-900 shadow-[8px_8px_0px_0px_#0f172a] bg-white">
                    <div className="overflow-x-auto">
                      {!comparisonMode ? (
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-slate-100 border-b-4 border-slate-900">
                              <th className="p-3 sm:p-5 w-24 text-center font-black text-sm uppercase tracking-widest text-slate-900">Rank</th>
                              <th className="p-3 sm:p-5 font-black text-sm uppercase tracking-widest text-slate-900">Identity</th>
                              <th className="p-3 sm:p-5 w-32 font-black text-sm uppercase tracking-widest text-slate-900">Score</th>
                              <th className="p-3 sm:p-5 font-black text-sm uppercase tracking-widest text-slate-900 hidden md:table-cell">Reasoning Log</th>
                              <th className="p-3 sm:p-5 w-20 text-center"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y-4 divide-slate-100">
                            {filteredRankedData.slice(0, 100).map((c) => {
                              const isExpanded = expandedRow === c.rank;
                              const bd = c.breakdown;
                              return (
                                <React.Fragment key={c.candidate_id}>
                                  <tr onClick={() => setExpandedRow(isExpanded ? null : c.rank)} className={`hover:bg-yellow-50 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}>
                                    <td className="p-3 sm:p-5 text-center">
                                      <div className="w-12 h-12 rounded-xl bg-white border-4 border-slate-900 flex items-center justify-center text-lg font-black text-slate-900 shadow-[4px_4px_0px_0px_#0f172a] mx-auto">
                                        {c.rank}
                                      </div>
                                    </td>
                                    <td className="p-3 sm:p-5">
                                      <div className="font-black text-lg text-slate-900 truncate max-w-[200px] sm:max-w-[250px]">{c.rawProfile.profile?.current_title || 'Unknown Role'}</div>
                                      <div className="flex items-center gap-3 mt-2">
                                        <span className="text-xs font-bold font-mono text-slate-500 bg-slate-200 px-2 py-1 rounded-md border-2 border-slate-300">
                                          {c.candidate_id.substring(0, 12)}...
                                        </span>
                                        <button 
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); copyToClipboard(c.candidate_id); }}
                                          className="text-slate-400 hover:text-blue-600 transition-colors bg-white border-2 border-slate-300 p-1 rounded-md shadow-sm"
                                          title="Copy Candidate ID"
                                        >
                                          <FileText size={14} />
                                        </button>
                                      </div>
                                    </td>
                                    <td className="p-3 sm:p-5">
                                      <span className="px-4 py-2 bg-emerald-100 text-emerald-800 border-4 border-emerald-900 rounded-xl font-black text-lg block w-fit shadow-[4px_4px_0px_0px_#064e3b]">
                                        {c.score.toFixed(6)}
                                      </span>
                                    </td>
                                    <td className="p-3 sm:p-5 text-sm font-bold text-slate-600 max-w-md hidden md:table-cell leading-relaxed border-l-4 border-slate-100 pl-6">
                                      {c.reasoning}
                                    </td>
                                    <td className="p-3 sm:p-5 text-slate-400 text-center">
                                      <button 
                                        type="button"
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          setExpandedRow(isExpanded ? null : c.rank);
                                        }}
                                        className="w-10 h-10 inline-flex items-center justify-center rounded-xl border-4 border-slate-900 bg-white hover:bg-yellow-300 shadow-[4px_4px_0px_0px_#0f172a] transition-all cursor-pointer active:translate-y-1 active:shadow-none"
                                        aria-label={isExpanded ? "Close Row" : "Expand Row"}
                                      >
                                        {isExpanded ? <ChevronUp size={24} className="text-slate-900" /> : <ChevronDown size={24} className="text-slate-900" />}
                                      </button>
                                    </td>
                                  </tr>
                                  
                                  {isExpanded && (
                                    <tr>
                                      <td colSpan={5} className="p-0 border-b-4 border-slate-900 bg-slate-50 relative">
                                        <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
                                        <motion.div 
                                          initial={{ opacity: 0, y: -10 }} 
                                          animate={{ opacity: 1, y: 0 }} 
                                          className="p-4 sm:p-8 overflow-hidden"
                                        >
                                          {bd.honeypot ? (
                                            <div className="flex items-center gap-6 bg-white border-4 border-rose-400 p-6 rounded-2xl shadow-[6px_6px_0px_0px_#fb7185] text-rose-600">
                                              <div className="bg-rose-100 p-4 rounded-xl border-4 border-rose-400 shadow-inner"><ShieldAlert size={32} /></div>
                                              <div>
                                                <h4 className="font-black uppercase tracking-wider text-lg mb-2 text-rose-500 drop-shadow-sm">Honeypot Triggered</h4>
                                                <p className="font-bold text-slate-700 leading-relaxed max-w-3xl">Metadata values declare expert qualifications despite conflicting duration history. Baseline floor scoring enforced.</p>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="flex flex-col xl:flex-row gap-8">
                                              {/* Left: Math & Telemetry */}
                                              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
                                                <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] space-y-6">
                                                  <h4 className="text-sm font-black text-blue-600 uppercase tracking-widest border-b-4 border-slate-900 pb-3 flex items-center gap-2"><Briefcase size={18}/> Core Dimensions</h4>
                                                  <ProgressBar label="Career Profile" value={bd.career} />
                                                  <ProgressBar label="Skills Density" value={bd.skills} />
                                                  <ProgressBar label="Experience Match" value={bd.experience} />
                                                  <ProgressBar label="Education Tier" value={bd.education} />
                                                </div>

                                                <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] space-y-6">
                                                  <h4 className="text-sm font-black text-pink-500 uppercase tracking-widest border-b-4 border-slate-900 pb-3 flex items-center gap-2"><CheckCircle size={18}/> Fit Indicators</h4>
                                                  <ProgressBar label="JD Fit (IDF Rare)" value={bd.jd_fit} colorClass="bg-pink-400" />
                                                  <ProgressBar label="Descriptions" value={bd.description} colorClass="bg-pink-400" />
                                                  <ProgressBar label="Assessments" value={bd.assessments} colorClass="bg-pink-400" />
                                                  <ProgressBar label="Location" value={bd.location} colorClass="bg-pink-400" />
                                                </div>

                                                <div className="md:col-span-2 bg-yellow-300 p-6 rounded-2xl border-4 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] flex flex-col sm:flex-row justify-between items-center gap-6">
                                                  <div className="flex-1 w-full space-y-3">
                                                    <div className="flex justify-between items-center border-b-4 border-slate-900 pb-2 bg-white/50 px-4 py-2 rounded-xl">
                                                      <span className="text-xs uppercase font-black tracking-widest">Raw Base Math</span>
                                                      <span className="font-mono text-lg font-bold bg-white border-2 border-slate-900 px-2 rounded">{bd.base_score.toFixed(6)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center border-b-4 border-slate-900 pb-2 bg-white/50 px-4 py-2 rounded-xl">
                                                      <span className="text-xs uppercase font-black tracking-widest">Behavioral Mod</span>
                                                      <span className="font-mono text-lg font-bold text-blue-600 bg-white border-2 border-blue-600 px-2 rounded">{bd.behavioral_mult.toFixed(4)}x</span>
                                                    </div>
                                                  </div>
                                                  <div className="shrink-0 text-center bg-white border-4 border-slate-900 rounded-2xl p-4 shadow-inner min-w-[160px]">
                                                    <span className="text-xs uppercase font-black tracking-widest text-slate-500 block mb-1">Norm. Output</span>
                                                    <span className="text-4xl font-black text-emerald-500 tracking-tighter drop-shadow-md">{c.score.toFixed(6)}</span>
                                                  </div>
                                                </div>
                                              </div>

                                              {/* Right: AI Synthesis Panel */}
                                              <div className="w-full xl:w-1/3 bg-slate-900 text-white rounded-2xl border-4 border-slate-900 shadow-[8px_8px_0px_0px_#fde047] p-6 relative overflow-hidden flex flex-col">
                                                <div className="absolute top-0 right-0 bg-yellow-300 text-slate-900 font-black px-4 py-1 rounded-bl-xl border-l-4 border-b-4 border-slate-900 text-xs uppercase tracking-widest flex items-center gap-1">
                                                  <Sparkles size={14}/> Nexus Engine
                                                </div>
                                                
                                                <h4 className="text-2xl font-black text-yellow-300 uppercase tracking-tighter mb-4 mt-2">
                                                  AI Justification
                                                </h4>
                                                
                                                <div className="space-y-4 flex-1">
                                                  <p className="text-sm font-bold leading-relaxed text-slate-300">
                                                    I have positioned this candidate at <span className="text-white bg-blue-600 px-2 py-0.5 rounded border border-blue-400 shadow-sm">Rank #{c.rank}</span> with a final confidence score of <span className="text-white bg-emerald-600 px-2 py-0.5 rounded border border-emerald-400 shadow-sm">{c.score.toFixed(4)}</span>.
                                                  </p>
                                                  
                                                  <div className="p-4 bg-slate-800 border-l-4 border-yellow-300 rounded-r-xl text-sm font-medium text-slate-200 leading-relaxed shadow-inner">
                                                    {c.reasoning}
                                                  </div>
                                                  
                                                  <p className="text-xs font-bold leading-relaxed text-slate-400">
                                                    <strong>Key Drivers:</strong> The positioning is heavily influenced by their {(bd.skills * 100).toFixed(0)}% skill density match and a behavioral multiplier of {bd.behavioral_mult.toFixed(2)}x, placing them {c.rank <= 10 ? 'in the top percentile' : 'within the standard distribution'} of the evaluated pool.
                                                  </p>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </motion.div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        /* TERMINAL MODE (Playground Vibe) */
                        <table className="w-full text-left font-mono text-sm font-bold bg-slate-900 text-slate-300">
                          <thead>
                            <tr className="bg-black text-[11px] uppercase tracking-widest text-yellow-300 border-b-4 border-slate-700">
                              <th className="p-4 border-r-4 border-slate-800">Rnk</th>
                              <th className="p-4 border-r-4 border-slate-800 w-32">ID</th>
                              <th className="p-4 border-r-4 border-slate-800">Car</th>
                              <th className="p-4 border-r-4 border-slate-800">Desc</th>
                              <th className="p-4 border-r-4 border-slate-800">Skl</th>
                              <th className="p-4 border-r-4 border-slate-800">JD</th>
                              <th className="p-4 border-r-4 border-slate-800">Asst</th>
                              <th className="p-4 border-r-4 border-slate-800">Exp</th>
                              <th className="p-4 border-r-4 border-slate-800">Loc</th>
                              <th className="p-4 border-r-4 border-slate-800">Edu</th>
                              <th className="p-4 text-pink-400 border-r-4 border-slate-800">B.Mult</th>
                              <th className="p-4 bg-slate-800 border-r-4 border-slate-700">Base</th>
                              <th className="p-4 bg-blue-600 text-white font-black">Norm Output</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y-4 divide-slate-800">
                            {filteredRankedData.slice(0, 100).map(c => {
                              const bd = c.breakdown;
                              if (bd.honeypot) return (
                                <tr key={c.candidate_id} className="bg-rose-950 text-rose-400">
                                  <td className="p-4 border-r-4 border-slate-800">#{c.rank}</td>
                                  <td className="p-4 truncate max-w-[100px] border-r-4 border-slate-800">{c.candidate_id}</td>
                                  <td colSpan={10} className="p-4 text-center tracking-widest border-r-4 border-slate-800 bg-rose-900/50 font-black">|| HONEYPOT ALERT ||</td>
                                  <td className="p-4 font-black">0.010000</td>
                                </tr>
                              );
                              return (
                                <tr key={c.candidate_id} className="hover:bg-slate-800">
                                  <td className="p-4 border-r-4 border-slate-800 text-white">#{c.rank}</td>
                                  <td className="p-4 truncate max-w-[100px] border-r-4 border-slate-800 text-yellow-300" title={c.candidate_id}>{c.candidate_id.substring(0,8)}..</td>
                                  <td className="p-4 border-r-4 border-slate-800">{bd.career.toFixed(3)}</td>
                                  <td className="p-4 border-r-4 border-slate-800">{bd.description.toFixed(3)}</td>
                                  <td className="p-4 border-r-4 border-slate-800">{bd.skills.toFixed(3)}</td>
                                  <td className="p-4 border-r-4 border-slate-800">{bd.jd_fit.toFixed(3)}</td>
                                  <td className="p-4 border-r-4 border-slate-800">{bd.assessments.toFixed(3)}</td>
                                  <td className="p-4 border-r-4 border-slate-800">{bd.experience.toFixed(3)}</td>
                                  <td className="p-4 border-r-4 border-slate-800">{bd.location.toFixed(3)}</td>
                                  <td className="p-4 border-r-4 border-slate-800">{bd.education.toFixed(3)}</td>
                                  <td className="p-4 border-r-4 border-slate-800 text-pink-400 font-black">{bd.behavioral_mult.toFixed(3)}</td>
                                  <td className="p-4 bg-slate-800 border-r-4 border-slate-700 text-white">{bd.base_score.toFixed(5)}</td>
                                  <td className="p-4 bg-blue-600/20 text-blue-300 text-base font-black">{c.score.toFixed(6)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </CleanCard>
                </motion.div>
              )}

              {/* --- SETTINGS TAB --- */}
              {activeTab === 'settings' && (
                <motion.div key="settings" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-8 max-w-4xl mx-auto">
                   <div>
                    <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter drop-shadow-sm">Configurations</h1>
                    <p className="text-slate-500 font-bold mt-2 text-lg">Locked parameters ensuring strict Python v4 parity.</p>
                  </div>
                  <CleanCard className="p-10 bg-white">
                    <div className="flex items-center gap-6 mb-10 pb-8 border-b-4 border-slate-900">
                      <div className="w-20 h-20 bg-rose-200 border-4 border-slate-900 rounded-2xl flex items-center justify-center text-slate-900 shadow-[6px_6px_0px_0px_#0f172a] shrink-0 transform -rotate-6">
                        <ShieldAlert size={40} />
                      </div>
                      <p className="text-slate-700 font-bold max-w-xl text-lg leading-relaxed">These core algorithmic weights are immutable in the browser environment to guarantee exact math execution matching your terminal scripts.</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      {Object.entries(WEIGHTS).map(([key, w]) => (
                        <div key={key} className="bg-slate-50 p-6 rounded-2xl border-4 border-slate-900 text-center shadow-[6px_6px_0px_0px_#0f172a] hover:-translate-y-1 hover:shadow-[10px_10px_0px_0px_#0f172a] transition-all">
                          <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">{key}</div>
                          <div className="text-4xl font-black text-slate-900 drop-shadow-sm">{(w * 100).toFixed(0)}%</div>
                        </div>
                      ))}
                    </div>
                  </CleanCard>
                </motion.div>
              )}

              {/* --- PROFILE TAB --- */}
              {activeTab === 'profile' && (
                <motion.div key="profile" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-8 max-w-4xl mx-auto">
                   <div>
                    <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter drop-shadow-sm">Operator Profile</h1>
                    <p className="text-slate-500 font-bold mt-2 text-lg">Identity and access management.</p>
                  </div>
                  <CleanCard className="p-10 bg-white">
                    <div className="flex items-center gap-8 mb-10 pb-8 border-b-4 border-slate-900">
                      <div className="w-32 h-32 bg-purple-500 border-4 border-slate-900 rounded-2xl flex items-center justify-center text-white text-5xl font-black shadow-[8px_8px_0px_0px_#0f172a] shrink-0 transform rotate-3">
                        {currentUser?.initials || 'AD'}
                      </div>
                      <div>
                        <h2 className="text-4xl font-black text-slate-900 mb-2">{currentUser?.name || 'Admin User'}</h2>
                        <p className="text-xl font-bold text-slate-500 flex items-center gap-2">
                          <Mail size={20} /> {currentUser?.email || 'admin@nexus.ai'}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="bg-slate-50 p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a]">
                        <h3 className="font-black text-sm uppercase tracking-widest text-slate-500 mb-4">Clearance Level</h3>
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 border-4 border-emerald-900 rounded-xl font-black text-emerald-800 shadow-[4px_4px_0px_0px_#064e3b]">
                          <ShieldAlert size={18} /> Level 4 (Architect)
                        </div>
                      </div>
                      
                      <div className="bg-slate-50 p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a]">
                        <h3 className="font-black text-sm uppercase tracking-widest text-slate-500 mb-4">Account Status</h3>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <p className="font-bold text-slate-900">Active Terminal Session</p>
                            <p className="text-sm font-bold text-slate-500 mt-1">Parity engine connected securely.</p>
                          </div>
                          <CheckCircle size={32} className="text-emerald-500" />
                        </div>
                      </div>
                    </div>
                  </CleanCard>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </main>
      </div>
    );
  };

  return (
    <>
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
      {renderContent()}
    </>
  );
}