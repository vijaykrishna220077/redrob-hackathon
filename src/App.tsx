import { supabase } from './lib/supabase';
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ==========================================
// SUPABASE CLIENT SETUP & SAFETY GATES
// ==========================================
let isRealSupabase = true;
const createMockSupabase = () => {
  const getStorage = (key: string, def: any) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : def;
    } catch { return def; }
  };
  const setStorage = (key: string, val: any) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  };

  return {
    auth: {
      getUser: async () => {
        const session = getStorage('nexus_session', null);
        return { data: { user: session }, error: null };
      },
      signUp: async ({ email, password, options }: any) => {
        const users = getStorage('nexus_users', []);
        if (users.some((u: any) => u.email === email)) {
          return { data: { user: null }, error: { message: "Operator identity already registered." } };
        }
        const newUser = { id: 'usr_' + Math.random().toString(36).substring(2, 11), email, user_metadata: options?.data || {} };
        setStorage('nexus_users', [...users, { ...newUser, password }]);
        setStorage('nexus_session', newUser);
        return { data: { user: newUser }, error: null };
      },
      signInWithPassword: async ({ email, password }: any) => {
        const users = getStorage('nexus_users', []);
        const matched = users.find((u: any) => u.email === email && u.password === password);
        if (!matched) {
          return { data: { user: null }, error: { message: "Invalid credentials or unauthorized terminal clearance." } };
        }
        const sessionUser = { id: matched.id, email: matched.email, user_metadata: matched.user_metadata };
        setStorage('nexus_session', sessionUser);
        return { data: { user: sessionUser }, error: null };
      },
      signOut: async () => {
        setStorage('nexus_session', null);
        return { error: null };
      },
      onAuthStateChange: (callback: any) => {
        return { data: { subscription: { unsubscribe: () => {} } } };
      }
    },
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: any) => ({
          single: async () => {
            if (table === 'user_profiles') {
              const session = getStorage('nexus_session', null);
              if (!session || session.id !== val) return { data: null, error: { code: 'PGRST116' } };
              return {
                data: {
                  user_id: session.id,
                  name: session.user_metadata?.full_name || 'System Architect',
                  email: session.email,
                  role: 'Level 4 (Architect)'
                },
                error: null
              };
            }
            return { data: null, error: null };
          },
          order: () => Promise.resolve({ data: [], error: null })
        }),
        order: () => ({
          eq: (col: string, val: any) => {
            if (table === 'ranking_runs') {
              const runs = getStorage('nexus_runs_' + val, []);
              return Promise.resolve({ data: runs, error: null });
            }
            if (table === 'candidate_workflows') {
              const workflows = getStorage('nexus_workflows_' + val, []);
              return Promise.resolve({ data: workflows, error: null });
            }
            return Promise.resolve({ data: [], error: null });
          }
        })
      }),
      upsert: async (obj: any) => {
        const session = getStorage('nexus_session', null);
        if (session) {
          if (table === 'user_profiles') {
            session.user_metadata = { ...session.user_metadata, full_name: obj.name };
            setStorage('nexus_session', session);
            const users = getStorage('nexus_users', []);
            setStorage('nexus_users', users.map((u: any) => u.id === session.id ? { ...u, user_metadata: session.user_metadata } : u));
          } else if (table === 'candidate_workflows') {
            const key = 'nexus_workflows_' + session.id;
            const current = getStorage(key, []);
            const filtered = current.filter((x: any) => x.candidate_id !== obj.candidate_id);
            setStorage(key, [...filtered, obj]);
          }
        }
        return { error: null };
      },
      insert: async (obj: any) => {
        const session = getStorage('nexus_session', null);
        if (session) {
          if (table === 'ranking_runs') {
            const key = 'nexus_runs_' + session.id;
            const current = getStorage(key, []);
            setStorage(key, [{ id: Date.now(), created_at: new Date().toISOString(), ...obj }, ...current]);
          }
        }
        return { error: null };
      }
    })
  };
};

import { 
  Upload, Download, Users, ShieldAlert, BarChart2, FileText, 
  CheckCircle, ChevronDown, ChevronUp, Calendar, Search, 
  Settings, Database, Zap, Cpu, Award, Sparkles, Brain, Filter,
  ArrowRight, Briefcase, RefreshCw, Bell, Layout, Eye, LogOut, Check, X,
  Mail, Lock, User, Key, ArrowLeft, AlertTriangle, ThumbsUp, ThumbsDown, Clock, ClipboardList, DatabaseZap,
  MessageSquare, Send, Bot, Loader2, Trash2, GitCompare, FileSearch2, Wand2
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

const daysSince = (dateStr: string, referenceDate: Date) => {
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

const isHoneypot = (c: any) => {
  const skills = c.skills || [];
  const career = c.career_history || [];
  const yoe = c.profile?.years_of_experience || 0;
  const expertZero = skills.filter((s: any) => s.proficiency === "expert" && (s.duration_months === undefined ? 1 : s.duration_months) === 0).length;
  if (expertZero >= 3) return true;
  const totalMonths = career.reduce((sum: number, j: any) => sum + (j.duration_months || 0), 0);
  if (yoe > 3 && totalMonths < yoe * 12 * 0.4) return true;
  const expertCount = skills.filter((s: any) => s.proficiency === "expert").length;
  const expertLimit = Math.max(12, Math.floor(yoe * 2));
  if (expertCount >= expertLimit) return true;
  if (yoe < 3 && expertCount > 8) return true;
  return false;
};

const scoreCareer = (c: any) => {
  const career = c.career_history || [];
  if (!career.length) return 0.0;
  let weightedScore = 0.0;
  career.forEach((job: any) => {
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
  const totalTimeWeightSum = career.reduce((sum: number, job: any) => sum + Math.min((job.duration_months || 0) / 24, 2.0), 0);
  return Math.max(0.0, Math.min(weightedScore / Math.max(totalTimeWeightSum, 1.0), 1.0));
};

const scoreDescription = (c: any) => {
  const career = c.career_history || [];
  if (!career.length) return 0.0;
  let totalHigh = 0, totalMedium = 0;
  career.forEach((job: any) => {
    const desc = (job.description || "").toLowerCase();
    const months = job.duration_months !== undefined ? job.duration_months : 1;
    const timeWeight = Math.min(months / 24, 1.5);
    totalHigh += DESCRIPTION_KEYWORDS_HIGH.filter(kw => desc.includes(kw)).length * timeWeight;
    totalMedium += DESCRIPTION_KEYWORDS_MEDIUM.filter(kw => desc.includes(kw)).length * timeWeight;
  });
  return 0.75 * Math.min(totalHigh / 5.0, 1.0) + 0.25 * Math.min(totalMedium / 8.0, 1.0);
};

const scoreSkills = (c: any) => {
  const skills = c.skills || [];
  if (!skills.length) return 0.0;
  let requiredHits = 0.0, bonusHits = 0.0;
  skills.forEach((skill: any) => {
    const name = (skill.name || "").toLowerCase();
    const proficiency = skill.proficiency || "beginner";
    const months = skill.duration_months || 0;
    const endorsements = skill.endorsements || 0;
    if (["expert", "advanced"].includes(proficiency) && months === 0) return;
    const profMult = ({ beginner: 0.3, intermediate: 0.6, advanced: 0.85, expert: 1.0 } as any)[proficiency] || 0.5;
    const durationMult = months > 0 ? Math.min(months / 48, 1.0) : 0.2;
    const endorseMult = Math.min(endorsements / 20, 1.0);
    const skillScore = profMult * (0.6 * durationMult + 0.4 * endorseMult);
    if (REQUIRED_SKILLS.some(req => name.includes(req))) requiredHits += skillScore;
    else if (BONUS_SKILLS.some(bon => name.includes(bon))) bonusHits += skillScore * 0.5;
  });
  return 0.8 * Math.min(requiredHits / 3.0, 1.0) + 0.2 * Math.min(bonusHits / 2.0, 1.0);
};

const scoreJdFit = (c: any) => {
  let text = (c.career_history || []).map((j: any) => (j.description || "").toLowerCase() + " " + (j.title || "").toLowerCase()).join(" ") +
             (c.skills || []).map((s: any) => (s.name || "").toLowerCase()).join(" ");
  let weightedHits = 0;
  for (const [term, weight] of Object.entries(CORE_JD_TERMS)) {
    if (text.includes(term)) weightedHits += weight;
  }
  return Math.min(weightedHits / (CORE_JD_MAX * 0.35), 1.0);
};

const scoreAssessments = (c: any) => {
  const assessments = (c.redrob_signals || {}).skill_assessment_scores || {};
  const entries = Object.entries(assessments);
  if (!entries.length) return 0.4;
  const relevantScores = entries.filter(([name]) => RELEVANT_ASSESSMENTS.some(rel => name.toLowerCase().includes(rel))).map(([, score]: any) => score);
  if (!relevantScores.length) return 0.4;
  return (relevantScores.reduce((a: number, b: number) => a + b, 0) / relevantScores.length) / 100.0;
};

const scoreExperience = (c: any) => {
  const yoe = c.profile?.years_of_experience || 0;
  if (yoe >= EXP_IDEAL_LOW && yoe <= EXP_IDEAL_HIGH) return 1.0;
  if (yoe >= EXP_MIN && yoe < EXP_IDEAL_LOW) return 0.4 + 0.6 * (yoe - EXP_MIN) / (EXP_IDEAL_LOW - EXP_MIN);
  if (yoe > EXP_IDEAL_HIGH && yoe <= EXP_MAX) return 0.9 - 0.4 * (yoe - EXP_IDEAL_HIGH) / (EXP_MAX - EXP_IDEAL_HIGH);
  return 0.2;
};

const scoreLocation = (c: any) => {
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

const scoreEducation = (c: any) => {
  const edu = c.education || [];
  if (!edu.length) return 0.5;
  const tierScores = { tier_1: 1.0, tier_2: 0.8, tier_3: 0.6, tier_4: 0.4, unknown: 0.5 } as any;
  return Math.max(...edu.map((e: any) => tierScores[e.tier || "unknown"] || 0.5));
};

const promotionScore = (c: any) => {
  const career = c.career_history || [];
  if (career.length < 2) return 0.5;
  let count = 0;
  career.forEach((job: any) => {
    const title = (job.title || "").toLowerCase();
    if (SENIOR_TITLES.some(x => title.includes(x)) && ML_ENG_ROLE_KEYWORDS.some(x => title.includes(x))) count++;
  });
  return Math.min(count / 3.0, 1.0);
};

const behavioralMultiplier = (c: any, referenceDate: Date) => {
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

const generateReasoning = (c: any, score: number, referenceDate: Date) => {
  const p = c.profile || {};
  const rs = c.redrob_signals || {};
  const skills = c.skills || [];
  const title = p.current_title || "Unknown";
  const yoe = p.years_of_experience || 0;
  const notice = rs.notice_period_days !== undefined ? rs.notice_period_days : 90;
  const responseRate = rs.recruiter_response_rate || 0;
  const activeDays = daysSince(rs.last_active_date, referenceDate);
  const openToWork = rs.open_to_work_flag || false;

  const relevant = skills.filter((s: any) => [...REQUIRED_SKILLS, ...BONUS_SKILLS].some(r => (s.name || "").toLowerCase().includes(r)) && (s.duration_months || 0) > 6).map((s: any) => s.name).slice(0, 3);
  
  let topAssessment = null;
  const entries = Object.entries(rs.skill_assessment_scores || {});
  if (entries.length > 0) {
    const best: any = entries.reduce((a: any, b: any) => a[1] > b[1] ? a : b);
    if (best[1] >= 70) topAssessment = `${best[0]}: ${Math.round(best[1])}/100`;
  }

  let jdText = (c.career_history || []).map((j: any) => (j.description || "").toLowerCase()).join(" ") + " " + skills.map((sk: any) => (sk.name || "").toLowerCase()).join(" ");
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

const rankCandidates = (candidates: any[], referenceDate: Date) => {
  const scored = candidates.map(c => {
    if (isHoneypot(c)) return { candidate: c, score: 0.01, breakdown: { honeypot: true } };
    const breakdown = {
      career: scoreCareer(c), description: scoreDescription(c), skills: scoreSkills(c),
      jd_fit: scoreJdFit(c), assessments: scoreAssessments(c), experience: scoreExperience(c),
      location: scoreLocation(c), education: scoreEducation(c)
    } as any;
    const base = Object.keys(WEIGHTS).reduce((sum, key) => sum + (WEIGHTS as any)[key] * breakdown[key], 0);
    const bm = behavioralMultiplier(c, referenceDate);
    breakdown.behavioral_mult = bm; breakdown.base_score = base;
    return { candidate: c, score: Number((base * bm).toFixed(6)), breakdown };
  });

  scored.sort((a, b) => Math.abs(b.score - a.score) > 1e-9 ? b.score - a.score : (a.candidate.candidate_id || "").localeCompare(b.candidate.candidate_id || ""));

  const realScores = scored.filter(x => x.score > 0.01).map(x => x.score);
  let normalizedByCandidateId = {} as any;
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

// ==========================================
// HOISTED UTILITY COMPONENTS (SAFETY ARTIFACTS)
// ==========================================
function BrutalButton({ children, onClick, className = "", variant = "primary", disabled = false, type = "button" }: any) {
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
  } as any;

  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${active} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function CleanCard({ children, className = "" }: any) {
  return (
    <div className={`bg-white border-4 border-slate-900 rounded-2xl shadow-[6px_6px_0px_0px_#0f172a] ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ title, value, sub, icon: Icon, trend }: any) {
  return (
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
}

function ProgressBar({ label, value, colorClass = "bg-blue-500" }: any) {
  return (
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
}

function FunnelStep({ label, count, color }: any) {
  return (
    <div className="bg-white border-4 border-slate-900 p-4 rounded-xl shadow-[4px_4px_0px_0px_#0f172a] text-center w-full min-h-[110px] flex flex-col justify-center">
      <div className={`text-xl lg:text-2xl font-black ${color}`}>
        {count.toLocaleString()}
      </div>

      <div className="text-[9px] md:text-[10px] font-black uppercase tracking-tight text-slate-500 text-center leading-tight mt-2 break-words">
        {label}
      </div>
    </div>
  );
}

function Toast({ message, type, onClose }: any) {
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
}

function NavItem({ id, label, icon: Icon, activeTab, setActiveTab, sidebarOpen }: any) {
  return (
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
}

// ==========================================
// COMPREHENSIVE CANDIDATE DRAWER (ATS)
// ==========================================
function CandidateExpandedPanel({ c, bd, workflow, updateWorkflow, showToast }: any) {
  const [tab, setTab] = useState('analysis');
  const [localNotes, setLocalNotes] = useState(workflow?.notes || '');
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  
  const status = workflow?.status || 'none';
  
  const handleStatusChange = async (newStatus: string) => {
    setIsSavingWorkflow(true);
    await updateWorkflow(c.candidate_id, newStatus, localNotes);
    setIsSavingWorkflow(false);
  };

  const handleNotesSave = async () => {
    setIsSavingWorkflow(true);
    await updateWorkflow(c.candidate_id, status, localNotes);
    setIsSavingWorkflow(false);
  };
  
  const p = c.rawProfile.profile || {};
  const rs = c.rawProfile.redrob_signals || {};
  
  const risks = [];
  if (bd.honeypot) risks.push("Honeypot Triggered: Inconsistent expert skill claims against total experience duration.");
  if (rs.notice_period_days > 60) risks.push(`Long Notice Period: ${rs.notice_period_days} days.`);
  if (!rs.open_to_work_flag) risks.push("Passive Candidate: Not actively marked as open to work.");
  if ((rs.recruiter_response_rate !== undefined ? rs.recruiter_response_rate : 1) < 0.4) risks.push(`Low Response Rate: ${((rs.recruiter_response_rate || 0)*100).toFixed(0)}% historic platform response rate.`);

  return (
    <div className="flex flex-col bg-white border-4 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] rounded-2xl overflow-hidden mt-2 mb-4">
       <div className="flex flex-col sm:flex-row bg-slate-100 border-b-4 border-slate-900 font-black uppercase tracking-wider text-xs sm:text-sm">
          <button onClick={() => setTab('analysis')} className={`flex-1 py-4 px-2 border-b-4 sm:border-b-0 sm:border-r-4 border-slate-900 transition-colors flex items-center justify-center gap-2 ${tab === 'analysis' ? 'bg-yellow-300' : 'hover:bg-slate-200'}`}><Brain size={18}/> AI Analysis</button>
          <button onClick={() => setTab('profile')} className={`flex-1 py-4 px-2 border-b-4 sm:border-b-0 sm:border-r-4 border-slate-900 transition-colors flex items-center justify-center gap-2 ${tab === 'profile' ? 'bg-blue-300' : 'hover:bg-slate-200'}`}><User size={18}/> Full Profile</button>
          <button onClick={() => setTab('workflow')} className={`flex-1 py-4 px-2 transition-colors flex items-center justify-center gap-2 ${tab === 'workflow' ? 'bg-pink-300' : 'hover:bg-slate-200'}`}><ClipboardList size={18}/> Recruiter Workflow</button>
       </div>
       
       <div className="p-6 bg-slate-50">
          {tab === 'analysis' && (
             bd.honeypot ? (
               <div className="flex items-center gap-6 bg-white border-4 border-rose-400 p-6 rounded-2xl shadow-[6px_6px_0px_0px_#fb7185] text-rose-600">
                 <div className="bg-rose-100 p-4 rounded-xl border-4 border-rose-400 shadow-inner"><ShieldAlert size={32} /></div>
                 <div>
                   <h4 className="font-black uppercase tracking-wider text-lg mb-2 text-rose-500 drop-shadow-sm">Honeypot Triggered</h4>
                   <p className="font-bold text-slate-700 leading-relaxed max-w-3xl">Metadata values declare expert qualifications despite conflicting duration history. Baseline floor scoring enforced.</p>
                 </div>
               </div>
             ) : (
               <div className="flex flex-col xl:flex-row gap-8">
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
                         <span className="font-mono text-lg font-bold bg-white border-4 border-slate-900 px-2 rounded">{bd.base_score.toFixed(6)}</span>
                       </div>
                       <div className="flex justify-between items-center border-b-4 border-slate-900 pb-2 bg-white/50 px-4 py-2 rounded-xl">
                         <span className="text-xs uppercase font-black tracking-widest">Behavioral Mod</span>
                         <span className="font-mono text-lg font-bold text-blue-600 bg-white border-4 border-blue-600 px-2 rounded">{bd.behavioral_mult.toFixed(4)}x</span>
                       </div>
                     </div>
                     <div className="shrink-0 text-center bg-white border-4 border-slate-900 rounded-2xl p-4 shadow-inner min-w-[160px]">
                       <span className="text-xs uppercase font-black tracking-widest text-slate-500 block mb-1">Norm. Output</span>
                       <span className="text-4xl font-black text-emerald-500 tracking-tighter drop-shadow-md">{c.score.toFixed(6)}</span>
                     </div>
                   </div>
                 </div>

                 <div className="w-full xl:w-1/3 bg-slate-900 text-white rounded-2xl border-4 border-slate-900 shadow-[8px_8px_0px_0px_#fde047] p-6 relative overflow-hidden flex flex-col">
                   <div className="absolute top-0 right-0 bg-yellow-300 text-slate-900 font-black px-4 py-1 rounded-bl-xl border-l-4 border-b-4 border-slate-900 text-xs uppercase tracking-widest flex items-center gap-1">
                     <Sparkles size={14}/> Nexus Engine
                   </div>
                   <h4 className="text-2xl font-black text-yellow-300 uppercase tracking-tighter mb-4 mt-2">AI Justification</h4>
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
             )
          )}

          {tab === 'profile' && (
            <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {/* ── HEADER ── */}
              <div style={{ background: '#0f172a', borderRadius: 16, padding: '28px 32px', display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 20, border: '4px solid #0f172a', boxShadow: '6px 6px 0 #fde047' }}>
                <div style={{ width: 64, height: 64, borderRadius: 12, background: '#a855f7', border: '3px solid #fde047', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: 'white', flexShrink: 0, letterSpacing: -1 }}>
                  {(p.anonymized_name || p.current_title || '??').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#fde047', letterSpacing: -0.5, lineHeight: 1.1 }}>{p.anonymized_name || 'Unknown Candidate'}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>{p.current_title || 'No Title'}{p.current_company ? ` · ${p.current_company}` : ''}</div>
                  <div style={{ fontSize: 13, color: '#60a5fa', marginTop: 2, fontWeight: 600 }}>{p.location || 'Location unknown'}{p.years_of_experience ? ` · ${p.years_of_experience} yrs experience` : ''}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginTop: 12 }}>
                    {rs.open_to_work_flag && <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.07em', border: '2px solid #34d399', background: '#d1fae5', color: '#065f46' }}>Open to work</span>}
                    {rs.notice_period_days !== undefined && <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.07em', border: '2px solid #fbbf24', background: '#fef9c3', color: '#713f12' }}>{rs.notice_period_days}-day notice</span>}
                    {rs.willing_to_relocate !== undefined && <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.07em', border: '2px solid #60a5fa', background: '#dbeafe', color: '#1e40af' }}>{rs.willing_to_relocate ? 'Open to relocate' : 'Not relocating'}</span>}
                    {(c.rawProfile.education?.[0]?.tier) && <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.07em', border: '2px solid #a78bfa', background: '#ede9fe', color: '#5b21b6' }}>{c.rawProfile.education[0].tier.replace('_', ' ')} Education</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 4 }}>Candidate ID</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fde047', fontFamily: 'monospace' }}>{c.candidate_id || 'CAND_???'}</div>
                  {rs.last_active_date && (<>
                    <div style={{ fontSize: 10, color: '#475569', marginTop: 8, fontWeight: 600 }}>Last active</div>
                    <div style={{ fontSize: 12, color: '#6ee7b7', fontWeight: 700 }}>{new Date(rs.last_active_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </>)}
                </div>
              </div>

              {/* ── PROFESSIONAL SUMMARY ── */}
              {p.summary && (
                <div style={{ background: 'white', border: '4px solid #3b82f6', borderRadius: 16, boxShadow: '5px 5px 0 #3b82f6', marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '3px solid #0f172a', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.1em', background: '#eff6ff', color: '#1e40af' }}>
                    <User size={16} style={{ color: '#3b82f6' }} /> Professional Summary
                  </div>
                  <div style={{ padding: 20 }}>
                    <p style={{ fontSize: 13, lineHeight: 1.7, color: '#334155', fontWeight: 500, margin: 0 }}>{p.summary}</p>
                  </div>
                </div>
              )}

              {/* ── EXPERIENCE TIMELINE ── */}
              <div style={{ background: 'white', border: '4px solid #0f172a', borderRadius: 16, boxShadow: '5px 5px 0 #0f172a', marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '3px solid #0f172a', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.1em', background: '#f8fafc' }}>
                  <Briefcase size={16} style={{ color: '#6366f1' }} /> Experience Timeline
                </div>
                <div style={{ padding: 20 }}>
                  {(c.rawProfile.career_history || []).length === 0 && <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>No career history provided.</p>}
                  {(c.rawProfile.career_history || []).map((job: any, idx: number) => {
                    const isFirst = idx === 0;
                    const isLast = idx === (c.rawProfile.career_history.length - 1);
                    return (
                      <div key={idx} style={{ display: 'flex', gap: 16, marginBottom: isLast ? 0 : 24 }}>
                        <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flexShrink: 0 }}>
                          <div style={{ width: 14, height: 14, borderRadius: '50%', border: '3px solid #0f172a', background: isFirst ? '#10b981' : '#6366f1', marginTop: 3 }} />
                          {!isLast && <div style={{ flex: 1, width: 2, background: '#e2e8f0', marginTop: 4, minHeight: 20 }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>{job.title}</div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '3px 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            {job.company}{job.industry ? ` · ${job.industry}` : ''}{job.company_size ? ` · ${job.company_size}` : ''}
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, border: '2px solid #0f172a', background: isFirst ? '#d1fae5' : '#fef9c3', color: isFirst ? '#065f46' : '#713f12' }}>
                              {isFirst ? 'Current · ' : ''}{job.duration_months} mo
                            </span>
                          </div>
                          {job.description && <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.65, fontWeight: 500, background: '#f8fafc', padding: '10px 14px', borderRadius: 8, borderLeft: '3px solid #3b82f6', margin: 0 }}>{job.description}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── SKILLS ── */}
              <div style={{ background: 'white', border: '4px solid #0f172a', borderRadius: 16, boxShadow: '5px 5px 0 #0f172a', marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '3px solid #0f172a', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.1em', background: '#f8fafc' }}>
                  <Award size={16} style={{ color: '#f59e0b' }} /> Skills
                </div>
                <div style={{ padding: 20 }}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 8 }}>Legend</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, fontSize: 10, fontWeight: 700 }}>
                      {[['Expert', '#fde047', '#0f172a'], ['Advanced', '#6ee7b7', '#0f172a'], ['Intermediate', '#e0e7ff', '#3730a3'], ['Beginner', '#f1f5f9', '#475569']].map(([label, bg, color]) => (
                        <span key={label} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, border: '2.5px solid #0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.04em', background: bg, color }}>{label}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                    {(c.rawProfile.skills || []).length === 0 && <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>No structured skills logged.</p>}
                    {(c.rawProfile.skills || []).map((s: any, idx: number) => {
                      const profMap: any = { expert: ['#fde047', '#0f172a'], advanced: ['#6ee7b7', '#0f172a'], intermediate: ['#e0e7ff', '#3730a3'], beginner: ['#f1f5f9', '#475569'] };
                      const [bg, color] = profMap[s.proficiency] || profMap.beginner;
                      return (
                        <span key={idx} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, border: '2.5px solid #0f172a', boxShadow: '2px 2px 0 #0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.04em', background: bg, color }}>
                          {s.name} {s.duration_months ? <span style={{ fontSize: 9, opacity: 0.7 }}>{s.duration_months}mo{s.endorsements ? ` · ${s.endorsements} end.` : ''}</span> : null}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── EDUCATION + PLATFORM ASSESSMENTS (two-col) ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {/* Education */}
                <div style={{ background: 'white', border: '4px solid #0f172a', borderRadius: 16, boxShadow: '5px 5px 0 #0f172a', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '3px solid #0f172a', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.1em', background: '#f8fafc' }}>
                    <Database size={16} style={{ color: '#8b5cf6' }} /> Education
                  </div>
                  <div style={{ padding: 20 }}>
                    {(c.rawProfile.education || []).length === 0 && <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>No education data.</p>}
                    {(c.rawProfile.education || []).map((edu: any, idx: number) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', border: '2.5px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 8 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#dbeafe', border: '2px solid #0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Layout size={18} style={{ color: '#3b82f6' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{edu.degree}</div>
                          {edu.institution && <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginTop: 2 }}>{edu.institution}</div>}
                          <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                            {edu.tier && <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.07em', border: '2px solid #a78bfa', background: '#ede9fe', color: '#5b21b6' }}>{edu.tier.replace('_', ' ')}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Platform Assessments */}
                <div style={{ background: 'white', border: '4px solid #0f172a', borderRadius: 16, boxShadow: '5px 5px 0 #0f172a', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '3px solid #0f172a', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.1em', background: '#f8fafc' }}>
                    <BarChart2 size={16} style={{ color: '#e11d48' }} /> Platform Assessments
                  </div>
                  <div style={{ padding: 20 }}>
                    {Object.keys(rs.skill_assessment_scores || {}).length === 0 && <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>No verified assessments.</p>}
                    {Object.entries(rs.skill_assessment_scores || {}).map(([key, val]: any) => {
                      const pct = Math.min(val, 100);
                      const barColor = pct >= 70 ? '#10b981' : pct >= 50 ? '#3b82f6' : pct >= 35 ? '#f59e0b' : '#e11d48';
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1.5px solid #f1f5f9' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', width: 140, flexShrink: 0, textTransform: 'capitalize' as const }}>{key.replace(/_/g, ' ')}</div>
                          <div style={{ flex: 1, height: 10, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden', border: '1.5px solid #cbd5e1' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 900, width: 40, textAlign: 'right' as const, color: barColor }}>{Math.round(val)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── PLATFORM SIGNALS ── */}
              <div style={{ background: 'white', border: '4px solid #0f172a', borderRadius: 16, boxShadow: '5px 5px 0 #0f172a', marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '3px solid #0f172a', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.1em', background: '#f8fafc' }}>
                  <Zap size={16} style={{ color: '#0ea5e9' }} /> Platform Signals
                </div>
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
                    {[
                      { label: 'Recruiter response rate', value: rs.recruiter_response_rate !== undefined ? `${Math.round(rs.recruiter_response_rate * 100)}%` : '—', pct: rs.recruiter_response_rate !== undefined ? rs.recruiter_response_rate * 100 : null, barColor: rs.recruiter_response_rate >= 0.7 ? '#10b981' : '#f59e0b', sub: rs.recruiter_response_rate >= 0.7 ? 'Above average' : 'Below average' },
                      { label: 'GitHub activity', value: rs.github_activity_score !== undefined ? `${rs.github_activity_score} / 100` : '—', pct: rs.github_activity_score, barColor: (rs.github_activity_score || 0) >= 50 ? '#10b981' : '#e11d48', sub: (rs.github_activity_score || 0) >= 50 ? 'Strong open-source' : 'Low open-source footprint' },
                      { label: 'Interview completion', value: rs.interview_completion_rate !== undefined ? `${Math.round(rs.interview_completion_rate * 100)}%` : '—', pct: rs.interview_completion_rate !== undefined ? rs.interview_completion_rate * 100 : null, barColor: '#10b981', sub: rs.interview_completion_rate >= 0.8 ? 'Excellent' : 'Solid completion rate' },
                      { label: 'Saved by recruiters (30d)', value: rs.saved_by_recruiters_30d !== undefined ? String(rs.saved_by_recruiters_30d) : '—', pct: null, sub: (rs.saved_by_recruiters_30d || 0) >= 10 ? 'High recruiter interest' : 'Low recruiter interest' },
                      { label: 'Search appearances (30d)', value: rs.search_appearance_30d !== undefined ? String(rs.search_appearance_30d) : '—', pct: null, sub: (rs.search_appearance_30d || 0) >= 200 ? 'Good discoverability' : 'Limited discoverability' },
                    ].map(({ label, value, pct, barColor, sub }) => (
                      <div key={label} style={{ background: '#f8fafc', border: '2.5px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>{value}</div>
                        {pct !== null && pct !== undefined && (
                          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, border: '1.5px solid #cbd5e1', overflow: 'hidden', marginTop: 6 }}>
                            <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                          </div>
                        )}
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginTop: 2 }}>{sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Quick flags */}
                  <div style={{ borderTop: '3px solid #f1f5f9', paddingTop: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 10 }}>Quick Flags</div>
                    {risks.length === 0 && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, lineHeight: 1.4, marginBottom: 6, background: '#d1fae5', color: '#065f46', border: '2px solid #34d399' }}>
                        <Check size={14} style={{ flexShrink: 0, marginTop: 1 }} /> Clean profile — no major risk flags detected.
                      </div>
                    )}
                    {risks.map((r: string, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, lineHeight: 1.4, marginBottom: 6, background: '#fef9c3', color: '#713f12', border: '2px solid #fbbf24' }}>
                        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {r}
                      </div>
                    ))}
                    {rs.open_to_work_flag && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, lineHeight: 1.4, marginBottom: 6, background: '#d1fae5', color: '#065f46', border: '2px solid #34d399' }}>
                        <Check size={14} style={{ flexShrink: 0, marginTop: 1 }} /> Open to work — actively seeking
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'workflow' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h4 className="font-black text-2xl uppercase tracking-tighter text-slate-900">Recruiter Decision</h4>
                  <p className="font-bold text-slate-500 text-sm mt-1">Assign a status to route this candidate in the ATS pipeline (Saves to Database).</p>
                </div>
                
                <div className="space-y-4">
                  <button 
                    disabled={isSavingWorkflow}
                    onClick={() => handleStatusChange('strong')} 
                    className={`w-full flex items-center justify-between p-4 rounded-xl border-4 transition-all font-black uppercase tracking-widest ${status === 'strong' ? 'bg-emerald-400 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] translate-x-1 translate-y-1' : 'bg-white border-emerald-400 text-emerald-700 hover:bg-emerald-50'}`}
                  >
                    <div className="flex items-center gap-3"><ThumbsUp size={20}/> Strong Fit</div>
                    {status === 'strong' && <CheckCircle size={20} className="text-slate-900" />}
                  </button>
                  
                  <button 
                    disabled={isSavingWorkflow}
                    onClick={() => handleStatusChange('review')} 
                    className={`w-full flex items-center justify-between p-4 rounded-xl border-4 transition-all font-black uppercase tracking-widest ${status === 'review' ? 'bg-yellow-300 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] translate-x-1 translate-y-1' : 'bg-white border-yellow-400 text-yellow-700 hover:bg-yellow-50'}`}
                  >
                    <div className="flex items-center gap-3"><Clock size={20}/> Review Later</div>
                    {status === 'review' && <CheckCircle size={20} className="text-slate-900" />}
                  </button>

                  <button 
                    disabled={isSavingWorkflow}
                    onClick={() => handleStatusChange('reject')} 
                    className={`w-full flex items-center justify-between p-4 rounded-xl border-4 transition-all font-black uppercase tracking-widest ${status === 'reject' ? 'bg-rose-400 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] translate-x-1 translate-y-1' : 'bg-white border-rose-400 text-rose-700 hover:bg-rose-50'}`}
                  >
                    <div className="flex items-center gap-3"><ThumbsDown size={20}/> Reject Candidate</div>
                    {status === 'reject' && <CheckCircle size={20} className="text-slate-900" />}
                  </button>
                </div>
              </div>

              <div className="space-y-4 flex flex-col h-full bg-white border-4 border-slate-900 p-6 rounded-2xl shadow-[6px_6px_0px_0px_#0f172a]">
                 <h4 className="font-black text-xl uppercase tracking-tighter flex items-center gap-2"><FileText size={20}/> Evaluation Notes</h4>
                 <textarea 
                    value={localNotes}
                    onChange={(e) => setLocalNotes(e.target.value)}
                    placeholder="Add context on technical screening, behavioral red flags, or specific JD alignment notes..."
                    className="w-full flex-1 min-h-[150px] p-4 bg-slate-50 border-4 border-slate-900 rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-pink-300 transition-all resize-none"
                 />
                 <BrutalButton 
                    disabled={isSavingWorkflow}
                    onClick={handleNotesSave} 
                    variant="primary" 
                    className="w-full py-4 mt-2"
                  >
                    {isSavingWorkflow ? (
                      <><RefreshCw size={20} className="animate-spin" /> Transmitting...</>
                    ) : (
                      "Save Pipeline Notes to DB"
                    )}
                 </BrutalButton>
              </div>
            </div>
          )}
       </div>
    </div>
  );
}

// ==========================================
// NEO-BRUTALIST ERROR & ONBOARDING PAGE
// ==========================================
function SupabaseFallbackConfigView({ onBypass }: { onBypass: () => void }) {
  return (
    <div className="min-h-screen text-slate-900 bg-slate-100 flex flex-col items-center justify-center p-6 selection:bg-rose-300 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:24px_24px]">
      <div className="max-w-2xl w-full bg-white border-4 border-slate-900 rounded-3xl p-8 sm:p-10 shadow-[12px_12px_0px_0px_#000] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-4 bg-rose-400 border-b-4 border-slate-900" />
        
        <div className="flex items-center gap-4 mb-6 mt-4">
          <div className="w-16 h-16 bg-rose-400 border-4 border-slate-900 rounded-2xl flex items-center justify-center text-slate-900 shadow-[4px_4px_0px_0px_#0f172a] transform -rotate-6">
            <ShieldAlert size={36} />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight">Supabase Connection Required</h1>
            <p className="text-slate-500 font-bold text-xs uppercase tracking-wider mt-1">Status: Unconfigured Environment Parameters</p>
          </div>
        </div>

        <div className="bg-slate-50 p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] mb-8 space-y-4">
          <p className="font-bold text-sm text-slate-700 leading-relaxed">
            The workspace was unable to establish a secure handshake with the Supabase client library. For security, detailed telemetry auditing, and pipeline persistence, configuration parameters are required for production.
          </p>

          <h3 className="font-black text-xs uppercase tracking-widest text-slate-500 pt-2">Database Setup instructions:</h3>
          <ol className="list-decimal list-inside text-xs font-bold text-slate-600 space-y-2 pl-2">
            <li>Ensure <code className="bg-slate-200 px-1 py-0.5 rounded text-rose-600 font-mono">./lib/supabase</code> is correctly exported.</li>
            <li>Run the required schema migrations within your Supabase SQL Editor.</li>
            <li>Restart the workspace development compiler.</li>
          </ol>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center pt-4 border-t-4 border-slate-100">
          <div className="text-left w-full sm:w-auto">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">Demonstration Bypass</span>
            <span className="text-xs font-bold text-slate-500 block">Runs localized isomorphic offline parity matrix only.</span>
          </div>
          <BrutalButton onClick={onBypass} variant="yellow" className="w-full sm:w-auto py-3 px-6 text-sm">
            Bypass to Local Storage Sandbox <ArrowRight size={18} />
          </BrutalButton>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MAIN WORKSPACE INTERFACE
// ==========================================
// ==========================================
// AI RECRUITING COPILOT (NEXUS AI)
// ==========================================

// Lightweight markdown renderer so we don't pull in a new dependency.
// Handles **bold**, bullet lists (lines starting with "- " or "• "), and line breaks.
function renderMarkdownLite(text: string) {
  const lines = (text || "").split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length) {
      blocks.push(
        <ul key={key} className="list-disc pl-5 space-y-1 my-1">
          {listBuffer.map((item, i) => (
            <li key={i}>{inlineFormat(item)}</li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };

  function inlineFormat(line: string) {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={i} className="font-black text-slate-900">{p.slice(2, -2)}</strong>
      ) : (
        <React.Fragment key={i}>{p}</React.Fragment>
      )
    );
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      listBuffer.push(trimmed.replace(/^[-•]\s+/, ""));
      return;
    }
    flushList(`list-${idx}`);
    if (trimmed.length === 0) {
      blocks.push(<div key={idx} className="h-2" />);
    } else if (/^#{1,4}\s/.test(trimmed)) {
      blocks.push(
        <div key={idx} className="font-black text-slate-900 uppercase tracking-tight mt-1">
          {inlineFormat(trimmed.replace(/^#{1,4}\s/, ""))}
        </div>
      );
    } else {
      blocks.push(<p key={idx} className="leading-relaxed">{inlineFormat(trimmed)}</p>);
    }
  });
  flushList("list-end");
  return blocks;
}

type CopilotMessage = { id: string; role: 'user' | 'assistant'; content: string; pending?: boolean };

const COPILOT_QUICK_ACTIONS = [
  { label: "Why ranked #1?", icon: Award, prompt: "Why is the top-ranked candidate in the current list ranked first? Break down the scoring." },
  { label: "Compare candidates", icon: GitCompare, prompt: "Compare the top two candidates in the current list across skills, experience, assessments, and behavioral signals. Tell me who's stronger and why." },
  { label: "Generate email", icon: Mail, prompt: "Draft a warm interview invitation email for the top-ranked candidate." },
  { label: "Interview questions", icon: ClipboardList, prompt: "Generate 5 technical interview questions tailored to the top-ranked candidate's skill profile." },
  { label: "Resume summary", icon: FileSearch2, prompt: "Summarize the top-ranked candidate's resume in 5 concise bullet points." },
  { label: "Hire recommendation", icon: ThumbsUp, prompt: "Should I hire the top-ranked candidate? Give a recommendation with confidence %, reasons, and concerns." },
];

function AICopilot({ rankedData, stats, funnelStats, refDateString, currentUser, expandedCandidateId }: any) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_copilot_history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem('nexus_copilot_history', JSON.stringify(messages.slice(-40))); } catch {}
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Build a compact, relevant context payload from live app state instead of mock data.
  const buildContext = () => {
    const focusCandidate = expandedCandidateId
      ? rankedData.find((r: any) => r.candidate_id === expandedCandidateId)
      : null;

    const topCandidates = rankedData.slice(0, 15).map((r: any) => ({
      rank: r.rank,
      candidate_id: r.candidate_id,
      score: r.score,
      title: r.rawProfile?.profile?.current_title,
      years_of_experience: r.rawProfile?.profile?.years_of_experience,
      location: r.rawProfile?.profile?.location,
      notice_period_days: r.rawProfile?.redrob_signals?.notice_period_days,
      recruiter_response_rate: r.rawProfile?.redrob_signals?.recruiter_response_rate,
      open_to_work: r.rawProfile?.redrob_signals?.open_to_work_flag,
      github_activity_score: r.rawProfile?.redrob_signals?.github_activity_score,
      skills: (r.rawProfile?.skills || []).map((s: any) => s.name).slice(0, 12),
      breakdown: r.breakdown,
      reasoning: r.reasoning,
    }));

    return {
      reference_date: refDateString,
      pipeline_stats: stats,
      funnel_stats: funnelStats,
      focus_candidate: focusCandidate ? {
        candidate_id: focusCandidate.candidate_id,
        rank: focusCandidate.rank,
        score: focusCandidate.score,
        breakdown: focusCandidate.breakdown,
        reasoning: focusCandidate.reasoning,
        profile: focusCandidate.rawProfile?.profile,
        skills: focusCandidate.rawProfile?.skills,
        career_history: focusCandidate.rawProfile?.career_history,
        redrob_signals: focusCandidate.rawProfile?.redrob_signals,
      } : null,
      top_candidates: topCandidates,
    };
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setInput("");

    const userMsg: CopilotMessage = { id: 'u_' + Date.now(), role: 'user', content: trimmed };
    const assistantId = 'a_' + Date.now();
    const history = [...messages, userMsg];
    setMessages([...history, { id: assistantId, role: 'assistant', content: '', pending: true }]);
    setLoading(true);

    try {
  console.log("📤 Sending request...");

  const res = await fetch("/api/copilot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      context: buildContext(),
    }),
  });

  console.log("📥 Status:", res.status);

  if (!res.ok) {
    const errText = await res.text().catch(() => "Request failed");
    throw new Error(errText);
  }

  const data = await res.json();

  console.log("📦 Response:", data);

  if (!data.success) {
    throw new Error(data.error);
  }

  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantId
        ? {
            ...m,
            content: data.text,
            pending: false,
          }
        : m
    )
  );
} catch (e: any) {
  console.error(e);

  setError(e?.message || "The copilot couldn't respond.");
  setMessages((prev) => prev.filter((m) => m.id !== assistantId));
} finally {
  setLoading(false);
}
};
  const clearChat = () => {
    setMessages([]);
    try { localStorage.removeItem('nexus_copilot_history'); } catch {}
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-16 h-16 rounded-2xl bg-yellow-300 border-4 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] flex items-center justify-center hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[8px_8px_0px_0px_#0f172a] active:translate-y-0 active:translate-x-0 active:shadow-[4px_4px_0px_0px_#0f172a] transition-all"
        title="Nexus AI Copilot"
      >
        {open ? <X size={26} className="text-slate-900" /> : <Bot size={28} className="text-slate-900" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-28 right-6 z-50 w-[420px] max-w-[92vw] h-[600px] max-h-[78vh] bg-white border-4 border-slate-900 rounded-2xl shadow-[8px_8px_0px_0px_#0f172a] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="h-16 bg-yellow-300 border-b-4 border-slate-900 flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-white rounded-lg border-4 border-slate-900 flex items-center justify-center">
                  <Sparkles size={16} className="text-slate-900" />
                </div>
                <div>
                  <div className="font-black text-sm uppercase tracking-tight text-slate-900 leading-none">Nexus AI Recruiter</div>
                  <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Recruiting Copilot</div>
                </div>
              </div>
              <button onClick={clearChat} title="Clear conversation" className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-slate-900 bg-white hover:bg-rose-100 transition-colors">
                <Trash2 size={14} className="text-slate-900" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ask anything about your pipeline</div>
                  <div className="grid grid-cols-2 gap-2">
                    {COPILOT_QUICK_ACTIONS.map((qa) => (
                      <button
                        key={qa.label}
                        onClick={() => sendMessage(qa.prompt)}
                        className="text-left text-xs font-bold p-2.5 bg-white border-2 border-slate-900 rounded-xl hover:bg-blue-50 hover:-translate-y-0.5 transition-all flex items-center gap-2"
                      >
                        <qa.icon size={14} className="text-blue-600 shrink-0" />
                        <span className="leading-tight">{qa.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm border-2 border-slate-900 ${
                    m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-slate-900'
                  }`}>
                    {m.role === 'assistant' ? (
                      m.content ? renderMarkdownLite(m.content) : (
                        <span className="flex items-center gap-2 text-slate-400">
                          <Loader2 size={14} className="animate-spin" /> Thinking…
                        </span>
                      )
                    ) : (
                      <span>{m.content}</span>
                    )}
                  </div>
                </div>
              ))}

              {error && (
                <div className="text-xs font-bold text-rose-600 bg-rose-50 border-2 border-rose-300 rounded-lg p-2 flex items-center gap-2">
                  <ShieldAlert size={14} className="shrink-0" /> {error}
                </div>
              )}
            </div>

            {/* Suggested follow-ups when a conversation is active */}
            {messages.length > 0 && (
              <div className="px-3 pt-2 flex gap-1.5 overflow-x-auto shrink-0 bg-slate-50">
                {COPILOT_QUICK_ACTIONS.slice(0, 4).map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => sendMessage(qa.prompt)}
                    disabled={loading}
                    className="shrink-0 text-[11px] font-bold px-2.5 py-1.5 bg-white border-2 border-slate-900 rounded-lg hover:bg-blue-50 disabled:opacity-40 whitespace-nowrap"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
              className="border-t-4 border-slate-900 p-3 flex items-center gap-2 bg-white shrink-0"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything..."
                className="flex-1 text-sm font-medium px-3 py-2 rounded-lg border-2 border-slate-900 outline-none focus:ring-2 focus:ring-blue-400"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="w-10 h-10 shrink-0 bg-blue-500 text-white rounded-lg border-2 border-slate-900 flex items-center justify-center disabled:opacity-40 hover:-translate-y-0.5 transition-all"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function App() {
  const [view, setView] = useState('landing');
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [sidebarOpen, setSidebarOpen] = useState(true); 
  const [candidates, setCandidates] = useState<any[]>([]); // Default initialized empty as requested
  const [refDateString, setRefDateString] = useState("2025-01-01");
  const [searchQuery, setSearchQuery] = useState("");
  const [comparisonMode, setComparisonMode] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type?: string } | null>(null); 
  const [isUploading, setIsUploading] = useState(false);
  
  // Execution Control plane representation
  const [executionPlane, setExecutionPlane] = useState<'local' | 'remote'>('local');

  // Sandbox indicator flags
  const [isSandboxMode, setIsSandboxMode] = useState(false);

  // Authentication Sequence Gatekeeper
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Recruiter Workflow State
  const [candidateWorkflows, setCandidateWorkflows] = useState<any>({});
  
  // Selected Historical Run View State
  const [activeHistoricalRun, setActiveHistoricalRun] = useState<any | null>(null);

  // Backend States
  const [rankingRuns, setRankingRuns] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const showToast = (message: string, type = 'success') => setToast({ message, type });

  // Custom database router abstraction
  const currentDb = useMemo(() => {
    if (supabase) return supabase;
    return createMockSupabase();
  }, []);

  // Check if supabase variables are actually missing
  useEffect(() => {
    if (!supabase) {
      // Autodeclares sandbox environment status to enable immediate preview
      console.warn("Nexus Platform initialized inside preview-isolated sandbox. LocalStorage drivers enabled.");
    }
  }, []);

  // ==========================================
  // SYNC CANDIDATE WORKFLOW STATUS FROM LOCAL NOTES
  // ==========================================
  const updateWorkflow = (id: string, newStatus: string, notes: string) => {
    setCandidateWorkflows((prev: any) => {
      const updated = { ...prev, [id]: { status: newStatus, notes } };
      // Persist workflow changes directly to DB/Sandbox
      saveWorkflowToDb(id, newStatus, notes);
      return updated;
    });
  };

  const saveWorkflowToDb = async (candidateId: string, status: string, notes: string) => {
    if (!currentUser) return;
    try {
      const { error } = await currentDb
        .from('candidate_workflows')
        .upsert({
          user_id: currentUser.id,
          candidate_id: candidateId,
          status,
          notes,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error("Error saving workflow status to Supabase:", error);
      } else {
        showToast("Workflow telemetry securely synchronized to backend.");
      }
    } catch (err) {
      console.error("saveWorkflowToDb Catch:", err);
    }
  };

  const loadWorkflowsFromDb = async (userId: string) => {
    try {
      const { data, error } = await currentDb
        .from('candidate_workflows')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        const workflowMap = {} as any;
        data.forEach((w: any) => {
          workflowMap[w.candidate_id] = {
            status: w.status,
            notes: w.notes
          };
        });
        setCandidateWorkflows(workflowMap);
      }
    } catch (e) {
      console.error("loadWorkflows error:", e);
    }
  };

  // ==========================================
  // LOAD USER PROFILE FROM DATABASE
  // ==========================================
  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await currentDb
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error("Profile load error:", error);
        return null;
      }

      if (data) {
        const profile = { id: userId, name: data.name, email: data.email || '', role: data.role || 'Level 4 (Architect)' };
        setUserProfile(profile);
        return profile;
      }
    } catch (error) {
      console.error("loadUserProfile error:", error);
    }
    return null;
  };

  // ==========================================
  // BACKEND SESSION SYNC (PREVENTS RACING FLASHER)
  // ==========================================
  useEffect(() => {
    const restoreSession = async () => {
      setIsAuthLoading(true);
      try {
        const { data: { user } } = await currentDb.auth.getUser();
        if (user) {
          const profile = await loadUserProfile(user.id);
          if (profile) {
            setCurrentUser(profile);
            await loadWorkflowsFromDb(user.id);
            setView('dashboard');
          }
        }
      } catch (error) {
        console.error("Session restore error:", error);
      } finally {
        // Safe timeout representation for UX loading loop
        setTimeout(() => {
          setIsAuthLoading(false);
        }, 1200);
      }
    };
    restoreSession();

    const { data: { subscription } } = currentDb.auth.onAuthStateChange(async (event: any, session: any) => {
      if (session?.user) {
        const profile = await loadUserProfile(session.user.id);
        if (profile) {
          setCurrentUser(profile);
          await loadWorkflowsFromDb(session.user.id);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  // ==========================================
  // LOAD RANKING RUNS FROM DATABASE
  // ==========================================
  const fetchRuns = async () => {
    if (!currentUser) return;
    try {
      const { data, error } = await currentDb
        .from('ranking_runs')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Ranking runs fetch error:", error);
        return;
      }

      if (data) {
        const runs = data.map((r: any) => ({
          id: r.id,
          date: r.created_at ? r.created_at.split('T')[0] : '',
          timestamp: new Date(r.created_at).getTime(),
          candidates: r.total_candidates,
          topScore: r.top_score,
          status: 'Completed',
          filename: r.filename,
          top_results: r.top_results // Telemetry JSON payload
        }));
        setRankingRuns(runs);
      }
    } catch (error) {
      console.error("Ranking runs error:", error);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchRuns();
    }
  }, [currentUser]);

  // ==========================================
  // REGISTER / LOGIN / LOGOUT HANDLERS
  // ==========================================
  const handleSignup = async (name: string, email: string, password: string) => {
    if (!name || !email || !password) {
      showToast("Please provide all required fields.", "error");
      return;
    }
    try {
      const { data, error } = await currentDb.auth.signUp({ email, password, options: { data: { full_name: name } } });

      if (error) {
        showToast(error.message || "Registration failed.", "error");
        return;
      }

      if (data.user) {
        const { error: profileError } = await currentDb
          .from('user_profiles')
          .upsert({
            user_id: data.user.id,
            name,
            email,
            role: 'Level 4 (Architect)',
            created_at: new Date().toISOString()
          });

        if (profileError) console.error("Profile sync error:", profileError);

        const profile = { id: data.user.id, name, email, role: 'Level 4 (Architect)' };
        setCurrentUser(profile);
        setUserProfile(profile);
        setView('dashboard');
        showToast("Identity registered securely.");
      }
    } catch (err) {
      showToast("Registration failed.", "error");
      console.error(err);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    if (!email || !password) {
      showToast("Please provide both email and password.", "error");
      return;
    }
    try {
      const { data, error } = await currentDb.auth.signInWithPassword({ email, password });

      if (error) {
        showToast("Invalid credentials or unregistered identity.", "error");
        return;
      }

      if (data.user) {
        const profile = await loadUserProfile(data.user.id);
        if (profile) setCurrentUser(profile);
        setView('dashboard');
        showToast(`Terminal Authorized. Welcome back!`);
      }
    } catch (err) {
      showToast("Authentication failed.", "error");
      console.error(err);
    }
  };

  const handleLogout = async () => {
    try {
      await currentDb.auth.signOut();
      showToast("Session terminated.");
    } catch (e) {
      console.error("Logout failed:", e);
    }
    setCurrentUser(null);
    setUserProfile(null);
    setCandidates([]);
    setRankingRuns([]);
    setActiveHistoricalRun(null);
    setView('landing');
  };

  // ==========================================
  // SAVE RUN HISTORY TO DATABASE (WITH FULL TELEMETRY JSON)
  // ==========================================
  const saveRankingRun = async (filename: string, candidatesCount: number, maxScore: string, topResults: any[]) => {
    if (!currentUser) return;
    try {
      const { error } = await currentDb
        .from('ranking_runs')
        .insert({
          user_id: currentUser.id,
          filename: filename || 'upload',
          total_candidates: candidatesCount,
          top_score: parseFloat(parseFloat(maxScore).toFixed(6)),
          top_results: topResults, // Saved top results array payload
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error("Failed to save ranking run telemetry:", error);
      } else {
        await fetchRuns(); // reload runs immediately
      }
    } catch (err) {
      console.error("saveRankingRun error:", err);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'AD';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AD';
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

  const funnelStats = useMemo(() => {
    if (rankedData.length === 0) {
      return { uploaded: 0, qualified: 0, shortlisted: 0, interviewReady: 0, finalists: 0 };
    }
    return {
      uploaded: rankedData.length,
      qualified: rankedData.filter(c => c.score >= 0.50).length,
      shortlisted: rankedData.filter(c => c.score >= 0.75).length,
      interviewReady: rankedData.filter(c => c.score >= 0.90).length,
      finalists: rankedData.filter(c => c.score >= 0.95).length
    };
  }, [rankedData]);

  // ==========================================
  // PIPELINE FILE PARSING
  // ==========================================
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setActiveHistoricalRun(null); // Clear historical state upon new evaluation input

    try {
      const CHUNK_SIZE = 512 * 1024; 
      let offset = 0;
      let leftover = '';
      let parsed: any[] = [];

      while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const text = await slice.text();
        const lines = (leftover + text).split(/\r?\n/);
        leftover = lines.pop() || ''; 

        for (const line of lines) {
          if (line.trim()) {
            try { parsed.push(JSON.parse(line)); } catch(e) {}
          }
        }
        offset += CHUNK_SIZE;
        await new Promise(r => setTimeout(r, 0)); 
      }
      if (leftover.trim()) {
         try { parsed.push(JSON.parse(leftover)); } catch(e) {}
      }

      if (parsed.length > 0) {

      const isValidCandidate = (c: any) =>
        c?.candidate_id &&
        c?.profile &&
        c?.skills &&
        c?.career_history;

        if (!parsed.every(isValidCandidate)) {
          showToast(
            "Invalid candidate file. Please upload a valid candidate JSONL dataset.",
            "error"
          );
          return;
        }

        const tempRanked = rankCandidates(parsed, referenceDate);
        
        const maxScore = tempRanked.length > 0 ? Math.max(...tempRanked.map(r => r.score)) : 0;

        // Extrapolate detailed top results array for database save telemetry
        const top100Results = tempRanked.slice(0, 100).map(r => ({
          candidate_id: r.candidate_id,
          rank: r.rank,
          score: r.score,
          reasoning: r.reasoning,
          breakdown: r.breakdown,
          rawProfile: r.rawProfile
        }));

        await saveRankingRun(file.name, parsed.length, maxScore.toFixed(4), top100Results);

        setCandidates(parsed);
        showToast(`Successfully evaluated ${parsed.length} candidates.`);
      } else {
        showToast("No valid JSON candidates found in file.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to process file.", "error");
    } finally {
      setIsUploading(false);
      e.target.value = ''; 
    }
  };

  // ==========================================
  // CONTROLLED DEMO MODE GENERATOR (ISOLATED)
  // ==========================================
  const seedMoreCandidates = async () => {
    setActiveHistoricalRun(null); // Clear history run focus state
    const generated = [];
    const titles = ["ML Architect", "Deep Learning Eng", "Data Engineer", "Python Backend"];
    for (let i = 1; i <= 25; i++) {
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
    const tempRanked = rankCandidates(generated, referenceDate);
    const maxScore = tempRanked.length > 0 ? Math.max(...tempRanked.map(r => r.score)) : 0;

    const top10Results = tempRanked.slice(0, 10).map(r => ({
      candidate_id: r.candidate_id,
      rank: r.rank,
      score: r.score,
      reasoning: r.reasoning,
      breakdown: r.breakdown,
      rawProfile: r.rawProfile
    }));

    await saveRankingRun('Demo Synthetic Pool', generated.length, maxScore.toFixed(4), top10Results);
    showToast("Generated synthetic candidate pool & stored telemetry to Supabase.");
  };

  const handleSelectHistoricalRun = (run: any) => {
    if (run.top_results && Array.isArray(run.top_results) && run.top_results.length > 0) {
      setActiveHistoricalRun(run);
      showToast(`Viewing historical results from: ${run.filename}`);
      setActiveTab('candidates');
    } else {
      showToast("Selected run has no stored candidate telemetry. Metadata only.", "error");
    }
  };

  const downloadSubmissionCsv = () => {
    const dataToExport = activeHistoricalRun ? activeHistoricalRun.top_results : filteredRankedData;
    if (!dataToExport || dataToExport.length === 0) return;
    const header = ["candidate_id", "rank", "score", "reasoning"];
    const rows = dataToExport.slice(0, 100).map((c: any) => [
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

  const copyToClipboard = (text: string) => {
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

  // Redirect to configurations fallback panel if supabase is missing and override is unselected
  if (!supabase && !isSandboxMode) {
    return <SupabaseFallbackConfigView onBypass={() => {
      setIsSandboxMode(true);
      showToast("Offline local sandbox mode activated successfully.", "yellow");
    }} />;
  }

  // Initializing state layout
  if (isAuthLoading) {
    return null;
  }

  const renderContent = () => {
    if (view === 'login') return <LoginView setView={setView} onLogin={handleLogin} currentUser={currentUser} />;
    if (view === 'signup') return <SignupView setView={setView} onSignup={handleSignup} currentUser={currentUser} />;
    if (view === 'forgotPassword') return <ForgotPasswordView setView={setView} currentUser={currentUser} />;

    if (view === 'landing') {
      return (
        <div className="min-h-screen text-slate-900 font-sans selection:bg-blue-300 relative overflow-hidden" style={dottedGrid}>
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
              <BrutalButton type="button" onClick={() => {
                if (currentUser) setView('dashboard');
                else setView('login');
              }} variant="primary" className="py-2.5 px-6 text-sm">
                  Login / Enter
              </BrutalButton>
          </nav>

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
                      <BrutalButton type="button" onClick={() => {
                          if (currentUser) setView('dashboard');
                          else setView('login');
                      }} variant="primary" className="text-xl py-4 px-8">
                          Launch Dashboard <ArrowRight size={24} />
                      </BrutalButton>
                      <BrutalButton type="button" onClick={seedMoreCandidates} variant="yellow" className="text-lg py-4 px-8">
                          <Database size={20} /> Load Mock Data
                      </BrutalButton>
                  </div>
              </div>

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
                    <div className="space-y-4 font-bold">
                      <div className="flex justify-between items-center bg-slate-100 p-3 rounded-xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a]">
                        <span className="font-bold text-sm text-slate-800 truncate max-w-[150px]">Senior ML Engineer</span>
                        <span className="font-black text-blue-600 bg-blue-100 px-2 py-1 rounded-md border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a]">0.985</span>
                      </div>
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
        
        {/* Global offline alert banner */}
        {isSandboxMode && (
          <div className="fixed top-0 inset-x-0 h-8 bg-yellow-300 border-b-4 border-slate-900 z-50 flex items-center justify-center font-black uppercase text-xs tracking-wider gap-2 select-none shadow-md">
             <AlertTriangle size={14}/> Warning: Sandbox Mode Active. Telemetry saved locally.
          </div>
        )}

        <div className={`p-4 transition-all duration-300 ${sidebarOpen ? 'w-72' : 'w-24 shrink-0'} ${isSandboxMode ? 'pt-12' : ''}`}>
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
              <NavItem id="dashboard" label="Overview" icon={Layout} activeTab={activeTab} setActiveTab={setActiveTab} sidebarOpen={sidebarOpen} />
              <NavItem id="candidates" label="Shortlist" icon={Users} activeTab={activeTab} setActiveTab={setActiveTab} sidebarOpen={sidebarOpen} />
              <NavItem id="profile" label="Operator Profile" icon={User} activeTab={activeTab} setActiveTab={setActiveTab} sidebarOpen={sidebarOpen} />
              <NavItem id="settings" label="Parameters" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} sidebarOpen={sidebarOpen} />
            </nav>

            <div className="p-4 shrink-0 border-t-4 border-slate-900 bg-slate-100">
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 hover:text-white bg-white hover:bg-rose-500 rounded-xl transition-all font-black text-sm uppercase tracking-wider border-4 border-slate-900 hover:shadow-[4px_4px_0px_0px_#0f172a]">
                <LogOut size={20} className="shrink-0" />
                {sidebarOpen && <span className="whitespace-nowrap">Sign Out</span>}
              </button>
            </div>
          </aside>
        </div>

        <main className={`flex-1 flex flex-col h-screen overflow-hidden pt-4 pr-4 pb-4 ${isSandboxMode ? 'pt-12' : ''}`}>
          <header className="h-20 bg-white border-4 border-slate-900 rounded-2xl px-6 flex items-center justify-between z-10 shrink-0 shadow-[8px_8px_0px_0px_#0f172a] mb-6">
            <div className="flex items-center gap-6 flex-1 min-w-0">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-10 h-10 bg-slate-100 border-4 border-slate-900 rounded-xl flex items-center justify-center hover:bg-yellow-300 hover:shadow-[4px_4px_0px_0px_#0f172a] transition-all shrink-0 active:translate-y-1 active:shadow-none">
                <Layout size={20} className="text-slate-900" />
              </button>
              <div className="relative max-w-md w-full hidden md:block group text-slate-900">
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
                  {getInitials(userProfile?.name)}
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
                          <p className="font-black text-slate-900 truncate">{userProfile?.name || 'Admin User'}</p>
                          <p className="text-xs font-bold text-slate-600 truncate">{userProfile?.email || 'admin@nexus.ai'}</p>
                        </div>
                        <div className="p-2 bg-slate-50">
                           <button onClick={() => { setProfileOpen(false); setActiveTab('profile'); }} className="w-full text-left px-4 py-2 font-bold text-sm text-slate-700 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors">View Profile</button>
                           <button onClick={() => { setProfileOpen(false); setActiveTab('settings'); }} className="w-full text-left px-4 py-2 font-bold text-sm text-slate-700 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors">Account Settings</button>
                        </div>
                        <div className="p-2 border-t-4 border-slate-900 bg-rose-100">
                          <button 
                            onClick={handleLogout}
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

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
            <AnimatePresence mode="wait">
              
              {/* --- DASHBOARD TAB --- */}
              {activeTab === 'dashboard' && (
                <motion.div key="dashboard" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-8 max-w-6xl mx-auto text-slate-900">
                  
                  {/* --- PRODUCTION ENGINE ALIGNMENT ALERT --- */}
                  <div className="bg-blue-50 border-4 border-blue-500 rounded-2xl p-6 shadow-[6px_6px_0px_0px_#3b82f6] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
                     <div className="absolute top-0 right-0 h-full w-24 bg-blue-100 opacity-20 transform skew-x-12" />
                     <div className="space-y-1">
                        <div className="flex items-center gap-2">
                           <span className="px-2 py-0.5 bg-blue-600 text-white rounded font-black text-[10px] uppercase tracking-wider">Production Architecture</span>
                           <h4 className="font-black text-sm uppercase tracking-wider text-blue-900">Execution Plane Allocation</h4>
                        </div>
                        <p className="font-bold text-xs text-blue-700 leading-relaxed max-w-2xl">
                           Demo executes candidate rankings locally on the isomorphic Client-Side Engine (V4 Parity) for up to 5,000 files. Production configurations offload datasets containing up to 100,000 items asynchronously to Python clusters running <code className="bg-blue-100 border border-blue-300 px-1 py-0.5 rounded font-mono text-blue-900 font-black">rank.py</code>.
                        </p>
                     </div>
                     <div className="flex items-center gap-2 shrink-0">
                        <button 
                           onClick={() => setExecutionPlane('local')}
                           className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase border-2 transition-all ${executionPlane === 'local' ? 'bg-blue-600 border-slate-900 text-white shadow-[2px_2px_0px_0px_#000]' : 'bg-white border-slate-300 text-slate-500'}`}
                        >
                           Demo Engine
                        </button>
                        <button 
                           onClick={() => {
                             setExecutionPlane('remote');
                             showToast("Offloaded backend calculations (rank.py simulator locked for sandbox evaluation).", "yellow");
                           }}
                           className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase border-2 transition-all ${executionPlane === 'remote' ? 'bg-indigo-600 border-slate-900 text-white shadow-[2px_2px_0px_0px_#000]' : 'bg-white border-slate-300 text-slate-500'}`}
                        >
                           Remote rank.py
                        </button>
                     </div>
                  </div>

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

                  <div className="grid lg:grid-cols-2 gap-6">
                    <CleanCard className="p-8 bg-white">
                      <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tighter flex items-center gap-2 font-black">
                        <Filter size={24} className="text-blue-600"/> Recruitment Funnel
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                         <FunnelStep label="Uploaded" count={funnelStats.uploaded} color="text-slate-900" />
                         <FunnelStep label="Qualified" count={funnelStats.qualified} color="text-blue-600" />
                         <FunnelStep label="Shortlist" count={funnelStats.shortlisted} color="text-purple-600" />
                         <FunnelStep label="Interview Ready" count={funnelStats.interviewReady} color="text-pink-500" />
                         <FunnelStep label="Finalists" count={funnelStats.finalists} color="text-emerald-500" />
                      </div>
                    </CleanCard>
                    
                    <CleanCard className="p-8 bg-blue-50 flex flex-col h-full max-h-[300px]">
                      <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tighter flex items-center gap-2 font-black">
                        <Calendar size={24} className="text-blue-600"/> Previous Ranking Runs
                      </h3>
                      <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {rankingRuns.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 opacity-70 mt-10">
                             <Database size={32} className="mb-3 text-slate-400" />
                             <p className="font-black text-sm uppercase tracking-wider">No historical runs.</p>
                             <p className="text-xs font-bold mt-1">Upload JSONL to execute a new run and save to DB.</p>
                          </div>
                        ) : (
                          rankingRuns.map((run: any) => (
                            <div 
                              onClick={() => handleSelectHistoricalRun(run)}
                              key={run.id} 
                              className="bg-white border-4 border-slate-900 p-4 rounded-xl shadow-[4px_4px_0px_0px_#0f172a] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#3b82f6] transition-all cursor-pointer group"
                            >
                              <div className="flex justify-between items-center mb-2">
                                <span className="font-black text-sm text-slate-900 group-hover:text-blue-600 transition-colors">{run.date} - {run.filename}</span>
                                <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded border-2 border-emerald-900">Completed & Telemetry Saved</span>
                              </div>
                              <div className="flex justify-between text-xs font-bold text-slate-500">
                                <span>{run.candidates} Candidates</span>
                                <span>Top: {run.topScore}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CleanCard>
                  </div>

                  <div className="grid lg:grid-cols-3 gap-6">
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

                    <CleanCard className="p-8 bg-pink-50 flex flex-col justify-center h-full">
                      <h3 className="text-sm font-black text-pink-600 uppercase tracking-widest mb-6 pb-4 border-b-4 border-slate-900">Math Weights</h3>
                      <div className="space-y-4 font-black text-sm">
                        <div className="flex justify-between text-slate-700"><span className="uppercase">Skills</span><span className="text-slate-900 bg-white border-4 border-slate-900 px-2 py-0.5 rounded-md shadow-[2px_2px_0px_0px_#0f172a]">22%</span></div>
                        <div className="flex justify-between text-slate-700"><span className="uppercase">Career</span><span className="text-slate-900 bg-white border-4 border-slate-900 px-2 py-0.5 rounded-md shadow-[2px_2px_0px_0px_#0f172a]">19%</span></div>
                        <div className="flex justify-between text-slate-700"><span className="uppercase">JD Fit</span><span className="text-slate-900 bg-white border-4 border-slate-900 px-2 py-0.5 rounded-md shadow-[2px_2px_0px_0px_#0f172a]">15%</span></div>
                        <div className="flex justify-between text-slate-700"><span className="uppercase">Assessments</span><span className="text-slate-900 bg-white border-4 border-slate-900 px-2 py-0.5 rounded-md shadow-[2px_2px_0px_0px_#0f172a]">13%</span></div>
                        <div className="pt-4 mt-4 border-t-4 border-slate-900 flex justify-between text-slate-700">
                          <span className="uppercase mt-1 font-black">Clamp limits</span><span className="text-purple-600 bg-white border-4 border-slate-900 px-2 py-1 rounded-md shadow-[4px_4px_0px_0px_#0f172a]">[0.5, 1.2]</span>
                        </div>
                      </div>
                    </CleanCard>

                    <CleanCard className="lg:col-span-3 p-8 bg-purple-50">
                      <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tighter flex items-center gap-2">
                        <BarChart2 size={24} className="text-purple-600"/> Candidate Source Analytics
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] flex flex-col items-center justify-center text-center hover:-translate-y-1 transition-transform cursor-default">
                          <span className="text-3xl font-black text-slate-900 mb-2">45%</span>
                          <span className="text-sm font-black uppercase tracking-widest text-blue-600">LinkedIn</span>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] flex flex-col items-center justify-center text-center hover:-translate-y-1 transition-transform cursor-default">
                          <span className="text-3xl font-black text-slate-900 mb-2">25%</span>
                          <span className="text-sm font-black uppercase tracking-widest text-emerald-600">Naukri</span>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] flex flex-col items-center justify-center text-center hover:-translate-y-1 transition-transform cursor-default">
                          <span className="text-3xl font-black text-slate-900 mb-2">20%</span>
                          <span className="text-sm font-black uppercase tracking-widest text-purple-600">Referral</span>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] flex flex-col items-center justify-center text-center hover:-translate-y-1 transition-transform cursor-default">
                          <span className="text-3xl font-black text-slate-900 mb-2">10%</span>
                          <span className="text-sm font-black uppercase tracking-widest text-slate-500">Indeed</span>
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
                      <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter">
                         {activeHistoricalRun ? "Historical Telemetry" : "Candidate Index"}
                      </h1>
                      <p className="text-slate-500 font-bold mt-2 text-lg">
                         {activeHistoricalRun ? `Inspecting telemetry audit: ${activeHistoricalRun.filename}` : "Select any row to view expanded math telemetry."}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-4 shrink-0">
                      {activeHistoricalRun && (
                         <BrutalButton 
                           onClick={() => {
                             setActiveHistoricalRun(null);
                             showToast("Returned to real-time evaluations index.");
                           }} 
                           variant="pink" 
                           className="py-2.5 px-4 text-xs font-black uppercase"
                         >
                            <ArrowLeft size={14}/> Back to Current Index
                         </BrutalButton>
                      )}

                      <div className="flex bg-white p-2 rounded-xl border-4 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] shrink-0 gap-2 font-bold">
                        <button onClick={() => setComparisonMode(false)} className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${!comparisonMode ? 'bg-blue-500 text-white shadow-[2px_2px_0px_0px_#0f172a] border-4 border-slate-900' : 'text-slate-600 hover:bg-slate-100 border-4 border-transparent'}`}>Standard UI</button>
                        <button onClick={() => setComparisonMode(true)} className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${comparisonMode ? 'bg-pink-400 text-slate-900 shadow-[2px_2px_0px_0px_#0f172a] border-4 border-slate-900' : 'text-slate-600 hover:bg-slate-100 border-4 border-transparent'}`}>Hacker Grid</button>
                      </div>
                    </div>
                  </div>

                  {/* Empty state gate if candidates array is empty and not inspecting history */}
                  {candidates.length === 0 && !activeHistoricalRun ? (
                    <div className="text-center py-20 bg-slate-50 border-4 border-dashed border-slate-400 rounded-3xl p-8 max-w-lg mx-auto shadow-[4px_4px_0px_0px_#0f172a] mt-10">
                      <Upload className="mx-auto text-slate-400 mb-6" size={48} />
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">No Active Candidate Index</h3>
                      <p className="font-bold text-slate-500 mt-2 text-sm leading-relaxed">
                         Upload a structured candidate file (.jsonl) on the dashboard or invoke Demo Mode below to explore model evaluations.
                      </p>
                      
                      {/* --- CLEAR DEMO MODE BUTTON ISOLATION --- */}
                      <div className="mt-8 p-4 border-4 border-dashed border-yellow-400 bg-yellow-50 rounded-2xl font-bold">
                         <span className="text-[10px] font-black uppercase tracking-widest text-yellow-600 block mb-2">🔧 Developer Demo Protocol</span>
                         <BrutalButton onClick={seedMoreCandidates} variant="yellow" className="w-full py-3 text-xs">
                            Generate Demo Pool (Anonymized)
                         </BrutalButton>
                      </div>
                    </div>
                  ) : (
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
                              {(activeHistoricalRun ? activeHistoricalRun.top_results : filteredRankedData).slice(0, 100).map((c: any) => {
                                const isExpanded = expandedRow === c.rank;
                                const bd = c.breakdown;
                                const rowStatus = candidateWorkflows[c.candidate_id]?.status;
                                const rowColorMap = { strong: 'bg-emerald-50 hover:bg-emerald-100', review: 'bg-yellow-50 hover:bg-yellow-100', reject: 'bg-rose-50 hover:bg-rose-100 opacity-60' } as any;
                                const bgClass = rowColorMap[rowStatus] || 'hover:bg-yellow-50';

                                return (
                                  <React.Fragment key={c.candidate_id}>
                                    <tr onClick={() => setExpandedRow(isExpanded ? null : c.rank)} className={`${bgClass} transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}>
                                      <td className="p-3 sm:p-5 text-center">
                                        <div className="w-12 h-12 rounded-xl bg-white border-4 border-slate-900 flex items-center justify-center text-lg font-black text-slate-900 shadow-[4px_4px_0px_0px_#0f172a] mx-auto">
                                          {c.rank}
                                        </div>
                                      </td>
                                      <td className="p-3 sm:p-5">
                                        <div className="font-black text-lg text-slate-900 truncate max-w-[200px] sm:max-w-[250px] flex items-center gap-2">
                                          {c.rawProfile?.profile?.current_title || 'Unknown Role'}
                                          {rowStatus === 'strong' && <ThumbsUp size={16} className="text-emerald-500" />}
                                        </div>
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
                                            <CandidateExpandedPanel c={c} bd={bd} workflow={candidateWorkflows[c.candidate_id]} updateWorkflow={updateWorkflow} showToast={showToast} />
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
                          <table className="w-full text-left font-mono text-sm font-bold bg-slate-900 text-slate-300">
                            <thead>
                              <tr className="bg-black text-[11px] uppercase tracking-widest text-yellow-300 border-b-4 border-slate-700 font-bold">
                                <th className="p-4 border-r-4 border-slate-800 font-bold">Rnk</th>
                                <th className="p-4 border-r-4 border-slate-800 w-32 font-bold">ID</th>
                                <th className="p-4 border-r-4 border-slate-800 font-bold">Car</th>
                                <th className="p-4 border-r-4 border-slate-800 font-bold">Desc</th>
                                <th className="p-4 border-r-4 border-slate-800 font-bold">Skl</th>
                                <th className="p-4 border-r-4 border-slate-800 font-bold">JD</th>
                                <th className="p-4 border-r-4 border-slate-800 font-bold">Asst</th>
                                <th className="p-4 border-r-4 border-slate-800 font-bold">Exp</th>
                                <th className="p-4 border-r-4 border-slate-800 font-bold">Loc</th>
                                <th className="p-4 border-r-4 border-slate-800 font-bold">Edu</th>
                                <th className="p-4 text-pink-400 border-r-4 border-slate-800 font-bold">B.Mult</th>
                                <th className="p-4 bg-slate-800 border-r-4 border-slate-700 font-bold">Base</th>
                                <th className="p-4 bg-blue-600 text-white font-black">Norm Output</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y-4 divide-slate-800">
                              {(activeHistoricalRun ? activeHistoricalRun.top_results : filteredRankedData).slice(0, 100).map((c: any) => {
                                const bd = c.breakdown;
                                if (bd.honeypot) return (
                                  <tr key={c.candidate_id} className="bg-rose-950 text-rose-400">
                                    <td className="p-4 border-r-4 border-slate-800">#{c.rank}</td>
                                    <td className="p-4 truncate max-w-[100px] border-r-4 border-slate-800">{c.candidate_id}</td>
                                    <td colSpan={10} className="p-4 text-center tracking-widest border-r-4 border-slate-800 bg-rose-900/50 font-black">|| HONEYPOT ALERT ||</td>
                                    <td className="p-4 font-black text-rose-300">0.010000</td>
                                  </tr>
                                );
                                return (
                                  <tr key={c.candidate_id} className="hover:bg-slate-800">
                                    <td className="p-4 border-r-4 border-slate-800 text-white">#{c.rank}</td>
                                    <td className="p-4 truncate max-w-[100px] border-r-4 border-slate-800 text-yellow-300 text-xs" title={c.candidate_id}>{c.candidate_id.substring(0,8)}..</td>
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
                  )}
                </motion.div>
              )}

              {/* --- SETTINGS TAB --- */}
              {activeTab === 'settings' && (
                <motion.div key="settings" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-8 max-w-4xl mx-auto">
                   <div>
                    <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter drop-shadow-sm">Configurations</h1>
                    <p className="text-slate-500 font-bold mt-2 text-lg">Locked parameters ensuring strict Python v4 parity.</p>
                  </div>
                  
                  {/* --- DEMO SEED PROTOCOL INSIDE CONFIG --- */}
                  <div className="p-6 border-4 border-dashed border-yellow-400 bg-yellow-50 rounded-2xl shadow-[4px_4px_0px_0px_#eab308] font-bold">
                     <h3 className="font-black text-lg uppercase tracking-tight text-slate-900 flex items-center gap-2 mb-2">
                        <DatabaseZap size={24} className="text-yellow-600"/> Synthetic Generator Protocol (Demo Mode)
                     </h3>
                     <p className="font-bold text-xs text-slate-600 leading-relaxed max-w-xl mb-4">
                        For system validations without pre-packaged datasets, activate the seeding sequence. This spawns 25 realistic, anonymized vector search engineers conforming strictly to V4 core dimensions.
                     </p>
                     <BrutalButton onClick={seedMoreCandidates} variant="yellow" className="py-3 px-6 text-sm">
                        Inject Synthetic Candidates to Supabase
                     </BrutalButton>
                  </div>

                  <CleanCard className="p-10 bg-white">
                    <div className="flex items-center gap-6 mb-10 pb-8 border-b-4 border-slate-900">
                      <div className="w-20 h-20 bg-rose-200 border-4 border-slate-900 rounded-2xl flex items-center justify-center text-slate-900 shadow-[6px_6px_0px_0px_#0f172a] shrink-0 transform -rotate-6">
                        <ShieldAlert size={40} />
                      </div>
                      <p className="text-slate-700 font-bold max-w-xl text-lg leading-relaxed">These core algorithmic weights are immutable in the browser environment to guarantee exact math execution matching your terminal scripts.</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 font-bold">
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

              {/* --- OPERATOR PROFILE TAB --- */}
              {activeTab === 'profile' && (
                <motion.div key="profile" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-8 max-w-6xl mx-auto">
                   <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center justify-between">
                     <div>
                      <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter drop-shadow-sm">Operator Identity</h1>
                      <p className="text-slate-500 font-bold mt-2 text-lg">Performance telemetry and platform engagement.</p>
                    </div>
                    <div className="flex bg-white p-4 rounded-2xl border-4 border-slate-900 shadow-[6px_6px_0px_0px_#0f172a] gap-6 items-center shrink-0">
                      <div className="w-20 h-20 bg-purple-500 border-4 border-slate-900 rounded-xl flex items-center justify-center text-white text-3xl font-black shadow-[4px_4px_0px_0px_#0f172a] transform -rotate-3 hover:rotate-0 transition-transform font-bold">
                        {getInitials(userProfile?.name)}
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{userProfile?.name || 'Admin User'}</h2>
                        <p className="text-sm font-bold text-slate-500 flex items-center gap-1 mt-1">
                          <Mail size={14} /> {userProfile?.email || 'admin@nexus.ai'}
                        </p>
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 border-2 border-emerald-900 rounded mt-2 font-black text-emerald-800 text-[10px] uppercase tracking-widest shadow-sm">
                           <ShieldAlert size={10} /> {userProfile?.role || 'Level 4 (Architect)'}
                        </div>
                      </div>
                    </div>
                   </div>

                  <div className="grid lg:grid-cols-3 gap-6">
                    <div className="space-y-6">
                      <CleanCard className="p-8 bg-slate-900 text-white border-4 border-slate-900">
                        <div className="absolute top-0 right-0 bg-yellow-300 text-slate-900 font-black px-3 py-1 rounded-bl-xl border-l-4 border-b-4 border-slate-900 text-[10px] uppercase tracking-widest">
                           Nexus Evaluation
                        </div>
                        <h3 className="text-lg font-black text-yellow-300 mb-6 uppercase tracking-tighter flex items-center gap-2 mt-2">
                          <Brain size={20} className="text-pink-400" /> Recruiter Intelligence
                        </h3>
                        <div className="flex items-center gap-6 mb-6 border-b-4 border-slate-800 pb-6">
                          <div className="text-6xl font-black tracking-tighter text-white drop-shadow-md font-bold">92<span className="text-2xl text-slate-500 font-normal">/100</span></div>
                        </div>
                        <div className="space-y-3 text-sm font-bold text-slate-300">
                          <div className="flex items-center gap-2"><CheckCircle size={16} className="text-emerald-400 shrink-0"/> Candidate selection accuracy</div>
                          <div className="flex items-center gap-2"><CheckCircle size={16} className="text-emerald-400 shrink-0"/> Interview success rate</div>
                          <div className="flex items-center gap-2"><CheckCircle size={16} className="text-emerald-400 shrink-0"/> Offer acceptance rate</div>
                          <div className="flex items-center gap-2"><CheckCircle size={16} className="text-emerald-400 shrink-0"/> AI recommendation utilization</div>
                        </div>
                      </CleanCard>

                      <CleanCard className="p-6 bg-pink-50">
                        <h3 className="text-sm font-black text-pink-600 uppercase tracking-widest mb-4 border-b-4 border-slate-900 pb-2 flex items-center gap-2">
                          <Award size={16}/> Operator Badges
                        </h3>
                        <div className="grid grid-cols-2 gap-4 font-bold text-slate-700">
                           <div className="bg-white p-3 rounded-xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] text-center flex flex-col items-center gap-2 hover:-translate-y-1 transition-transform">
                              <div className="w-10 h-10 bg-yellow-300 rounded-full border-4 border-slate-900 flex items-center justify-center"><Award size={20} className="text-slate-900"/></div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Top Recruiter</span>
                           </div>
                           <div className="bg-white p-3 rounded-xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] text-center flex flex-col items-center gap-2 hover:-translate-y-1 transition-transform">
                              <div className="w-10 h-10 bg-blue-400 rounded-full border-4 border-slate-900 flex items-center justify-center text-white"><Users size={20}/></div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">100K Processed</span>
                           </div>
                           <div className="bg-white p-3 rounded-xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] text-center flex flex-col items-center gap-2 hover:-translate-y-1 transition-transform">
                              <div className="w-10 h-10 bg-purple-500 rounded-full border-4 border-slate-900 flex items-center justify-center text-white"><Zap size={20}/></div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">AI Power User</span>
                           </div>
                           <div className="bg-white p-3 rounded-xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] text-center flex flex-col items-center gap-2 hover:-translate-y-1 transition-transform">
                              <div className="w-10 h-10 bg-emerald-400 rounded-full border-4 border-slate-900 flex items-center justify-center text-slate-900"><RefreshCw size={20}/></div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Fastest Team</span>
                           </div>
                        </div>
                      </CleanCard>
                    </div>

                    <div className="space-y-6 lg:col-span-2">
                       <CleanCard className="p-8 bg-blue-50">
                        <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tighter flex items-center gap-2 font-black">
                          <BarChart2 size={24} className="text-blue-600"/> Lifetime Performance Metrics
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 font-bold">
                           <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] flex flex-col justify-center">
                            <span className="text-3xl font-black text-slate-900 mb-1">102,450</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Candidates Processed</span>
                          </div>
                          <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] flex flex-col justify-center">
                            <span className="text-3xl font-black text-slate-900 mb-1">{rankingRuns.length || 124}</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Ranking Runs</span>
                          </div>
                          <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] flex flex-col justify-center">
                            <span className="text-3xl font-black text-slate-900 mb-1">320</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-purple-600">Interviews Scheduled</span>
                          </div>
                          <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] flex flex-col justify-center">
                            <span className="text-3xl font-black text-slate-900 mb-1">
                              {rankingRuns.length > 0 ? Math.max(...rankingRuns.map(r => parseFloat(r.topScore) || 0)).toFixed(3) : '0.985'}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-pink-600">Top Score Found</span>
                          </div>
                          <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] flex flex-col justify-center bg-emerald-100">
                            <span className="text-3xl font-black text-emerald-800 mb-1">78%</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Success Rate</span>
                          </div>
                           <div className="bg-white p-6 rounded-2xl border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] flex flex-col justify-center">
                            <span className="text-3xl font-black text-slate-900 mb-1">45</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Offers Made</span>
                          </div>
                        </div>
                      </CleanCard>

                      <div className="grid md:grid-cols-2 gap-6">
                        <CleanCard className="p-6 bg-white flex flex-col">
                          <h3 className="text-sm font-black text-slate-600 uppercase tracking-widest mb-4 border-b-4 border-slate-900 pb-2 flex items-center gap-2">
                            <Search size={16}/> Saved Filters
                          </h3>
                          <div className="space-y-3 font-bold text-sm">
                            <button className="w-full text-left bg-slate-50 hover:bg-yellow-50 border-4 border-slate-900 p-3 rounded-xl flex items-center gap-2 shadow-[2px_2px_0px_0px_#0f172a] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#0f172a] transition-all">
                              <CheckCircle size={16} className="text-emerald-500"/> Senior Python Engineers
                            </button>
                            <button className="w-full text-left bg-slate-50 hover:bg-yellow-50 border-4 border-slate-900 p-3 rounded-xl flex items-center gap-2 shadow-[2px_2px_0px_0px_#0f172a] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#0f172a] transition-all">
                              <CheckCircle size={16} className="text-emerald-500"/> RAG Specialists
                            </button>
                            <button className="w-full text-left bg-slate-50 hover:bg-yellow-50 border-4 border-slate-900 p-3 rounded-xl flex items-center gap-2 shadow-[2px_2px_0px_0px_#0f172a] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#0f172a] transition-all">
                              <CheckCircle size={16} className="text-emerald-500"/> ML Engineers - Bangalore
                            </button>
                          </div>
                        </CleanCard>

                        <CleanCard className="p-6 bg-white flex flex-col h-full max-h-72 overflow-hidden">
                           <h3 className="text-sm font-black text-slate-600 uppercase tracking-widest mb-4 border-b-4 border-slate-900 pb-2 flex items-center gap-2 shrink-0">
                            <Layout size={16}/> Activity Timeline
                          </h3>
                          <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                             {rankingRuns.slice(0, 3).map((run: any, i: number) => (
                               <div key={run.id}>
                                 <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest block mb-2">{i === 0 ? 'Latest' : run.date}</span>
                                 <div className="flex items-center gap-3 font-bold text-sm text-slate-700 bg-slate-50 p-2 border-l-4 border-slate-900 rounded">
                                   <div className="w-2 h-2 rounded-full bg-slate-900 shrink-0"/> Ranked {run.candidates} candidates
                                 </div>
                               </div>
                             ))}
                             {rankingRuns.length === 0 && (
                               <>
                                 <div>
                                   <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest block mb-2">Today</span>
                                   <div className="flex items-center gap-3 font-bold text-sm text-slate-700 bg-slate-50 p-2 border-l-4 border-slate-900 rounded">
                                     <div className="w-2 h-2 rounded-full bg-slate-900 shrink-0"/> Ranked 10,000 candidates
                                   </div>
                                 </div>
                                 <div>
                                   <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest block mb-2">Yesterday</span>
                                   <div className="flex items-center gap-3 font-bold text-sm text-slate-700 bg-slate-50 p-2 border-l-4 border-slate-900 rounded mb-2">
                                     <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"/> Shortlisted 120 candidates
                                   </div>
                                 </div>
                               </>
                             )}
                          </div>
                        </CleanCard>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </main>
      </div>
    );
  };

  const showCopilot = !['landing', 'login', 'signup', 'forgotPassword'].includes(view);
  const expandedCandidateId = expandedRow != null
    ? filteredRankedData.find((r: any) => r.rank === expandedRow)?.candidate_id
    : null;

  return (
    <>
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
      {renderContent()}
      {showCopilot && (
        <AICopilot
          rankedData={filteredRankedData}
          stats={stats}
          funnelStats={funnelStats}
          refDateString={refDateString}
          currentUser={currentUser}
          expandedCandidateId={expandedCandidateId}
        />
      )}
    </>
  );
}

// ==========================================
// OPERATOR AUTHENTICATION ROUTERS
// ==========================================
function LoginView({ setView, onLogin, currentUser }: any) {
  return (
    <AuthLayout title="Welcome Back" subtitle="Enter your credentials to access the workspace." setView={setView} currentUser={currentUser}>
      <form onSubmit={(e) => { 
        e.preventDefault(); 
        const formData = new FormData(e.currentTarget);
        onLogin(formData.get('email'), formData.get('password')); 
      }}>
        <AuthInput name="email" label="Email Address" type="email" placeholder="agent@nexus.ai" icon={Mail} />
        <AuthInput name="password" label="Password" type="password" placeholder="••••••••" icon={Lock} />
        
        <div className="flex items-center justify-between mt-2 mb-8 font-bold">
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
            Sign Up
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}

function SignupView({ setView, onSignup, currentUser }: any) {
  return (
    <AuthLayout title="Create Profile" subtitle="Register a new operator identity for the DB." setView={setView} currentUser={currentUser}>
      <form onSubmit={(e) => { 
        e.preventDefault(); 
        const formData = new FormData(e.currentTarget);
        onSignup(formData.get('fullName'), formData.get('email'), formData.get('password')); 
      }}>
        <AuthInput name="fullName" label="Full Name" type="text" placeholder="Jane Doe" icon={User} />
        <AuthInput name="email" label="Email Address" type="email" placeholder="agent@nexus.ai" icon={Mail} />
        <AuthInput name="password" label="Password" type="password" placeholder="••••••••" icon={Lock} />

        <BrutalButton type="submit" variant="pink" className="w-full py-4 text-lg mt-6">
          Complete Profile <Zap size={24} />
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
}

function ForgotPasswordView({ setView, currentUser }: any) {
  return (
    <AuthLayout title="System Reset" subtitle="We'll send a recovery link to your terminal." setView={setView} currentUser={currentUser}>
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
}

function AuthInput({ label, type = "text", placeholder, icon: Icon, name }: any) {
  return (
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
}

function AuthLayout({ children, title, subtitle, setView, currentUser }: any) {
  return (
    <div className="min-h-screen w-full flex text-slate-900 font-sans selection:bg-blue-300 bg-[#f8fafc] bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:24px_24px]">
      <button 
        onClick={() => {
          if (currentUser) setView('dashboard');
          else setView('landing');
        }} 
        className="absolute top-6 left-6 flex items-center gap-2 font-black uppercase tracking-widest text-sm text-slate-600 hover:text-slate-900 transition-colors z-20 font-bold"
      >
        <ArrowLeft size={20} /> Back
      </button>
      
      <div className="hidden lg:flex w-1/2 bg-blue-500 border-r-4 border-slate-900 flex-col justify-center items-center p-12 relative overflow-hidden">
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

         <div className="absolute top-20 right-20 w-16 h-16 bg-pink-500 rounded-full border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] animate-bounce" style={{ animationDuration: '3s' }} />
         <div className="absolute bottom-20 left-20 w-20 h-20 bg-emerald-400 border-4 border-slate-900 shadow-[4px_4px_0px_0px_#0f172a] transform rotate-12" />
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl border-4 border-slate-900 shadow-[12px_12px_0px_0px_#1e293b]"
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
}
