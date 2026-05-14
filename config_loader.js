// config_loader.js / SSoT: 04_CDSS/config/*
const CDSS_CONFIG = { calibration:null, thresholds:null, panels:null, ready:false };

async function loadCDSSConfig(base='./config') {
  const [cal, thr, pan] = await Promise.all([
    fetch(`${base}/calibration_map.json`).then(r=>r.json()),
    fetch(`${base}/thresholds.json`).then(r=>r.json()),
    fetch(`${base}/disease_panels.json`).then(r=>r.json())
  ]);
  Object.assign(CDSS_CONFIG, { calibration:cal, thresholds:thr, panels:pan, ready:true });
  return CDSS_CONFIG;
}

function plattProb(disease, score) {
  const c = CDSS_CONFIG.calibration?.[disease];
  if (!canDisplayProbability(disease)) return null;
  const z = c.coef * score + c.intercept;
  return 1 / (1 + Math.exp(-z));
}

function canDisplayProbability(disease) {
  const c = CDSS_CONFIG.calibration?.[disease];
  if (!c) return false;
  const displayFlag = c.prob_display ?? c.probability_display_allowed;
  return displayFlag === true &&
    c.status === 'validated' &&
    Number.isFinite(Number(c.coef)) &&
    Number.isFinite(Number(c.intercept));
}

function getPanelStatus(disease) {
  const p = CDSS_CONFIG.panels?.[disease];
  if (!p) return { label:'unknown', auc:null, badge:'gray' };
  const status = p.status ?? p.panel_status;  // PT-NEW-154 両対応
  const badge = { validated:'green', weak_signal:'amber', underpowered:'red' }[status] ?? 'gray';
  return { label:status, auc:p.AUC ?? p.auc, badge };
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getDiseaseThresholds(disease) {
  const t = CDSS_CONFIG.thresholds?.[disease] ?? {};
  return {
    thr_sens90: finiteNumber(t.thr_sens90),
    thr_spec90: finiteNumber(t.thr_spec90),
    thr_youden: finiteNumber(t.thr_youden ?? t.youden ?? t.threshold ?? t.optimal),
    thr_sens90_ci95: Array.isArray(t.thr_sens90_ci95) ? t.thr_sens90_ci95 : null,
    thr_spec90_ci95: Array.isArray(t.thr_spec90_ci95) ? t.thr_spec90_ci95 : null,
    thr_youden_ci95: Array.isArray(t.thr_youden_ci95) ? t.thr_youden_ci95 : null
  };
}

function bandExplanation(disease, band) {
  const tpl = CDSS_CONFIG.thresholds?._explanation_template?.[band];
  return typeof tpl === 'string' ? tpl.replaceAll('{disease}', disease) : null;
}

function integrityWarning(disease, entry, thresholds) {
  if (entry?.integrity_warning) return String(entry.integrity_warning);
  if (entry?.integrity_ok !== false) return null;
  const parts = [];
  if (thresholds.thr_sens90 !== null && thresholds.thr_youden !== null && thresholds.thr_spec90 !== null) {
    parts.push(`expected thr_sens90 <= thr_youden <= thr_spec90; got ${thresholds.thr_sens90} <= ${thresholds.thr_youden} <= ${thresholds.thr_spec90}`);
  }
  return `${disease}: threshold integrity check failed${parts.length ? ` (${parts.join('; ')})` : ''}. Interpret band with caution.`;
}

function classifyProbabilityBand(disease, p_oof) {
  const t = getDiseaseThresholds(disease);
  const p = finiteNumber(p_oof);
  if (p === null || t.thr_sens90 === null || t.thr_spec90 === null) {
    return { band:'Unknown', risk_class:'unknown_risk', thresholds:t };
  }
  if (p < t.thr_sens90) return { band:'Low', risk_class:'low_risk', thresholds:t };
  if (p < t.thr_spec90) return { band:'Mid', risk_class:'mid_risk', thresholds:t };
  return { band:'High', risk_class:'high_risk', thresholds:t };
}

function checkScoreOrientation(disease, score, threshold) {
  if (!Number.isFinite(Number(threshold))) return 'unknown_risk';
  const o = CDSS_CONFIG.thresholds?.[disease]?.orientation ?? 'higher_worse';
  return o === 'higher_worse'
    ? (score >= threshold ? 'high_risk' : 'low_risk')
    : (score <= threshold ? 'high_risk' : 'low_risk');
}

function renderRiskBlock(disease, p_oof) {
  const panel = getPanelStatus(disease);
  const t = CDSS_CONFIG.thresholds?.[disease] ?? {};
  const classified = classifyProbabilityBand(disease, p_oof);
  const prob = canDisplayProbability(disease) ? plattProb(disease, p_oof) : null;
  const warning = integrityWarning(disease, t, classified.thresholds);
  return {
    disease,
    p_oof,
    score: p_oof,
    threshold: classified.thresholds.thr_youden,
    thresholds: classified.thresholds,
    band: classified.band,
    risk_class: classified.risk_class,
    band_explanation: bandExplanation(disease, classified.band),
    band_definitions: CDSS_CONFIG.thresholds?._band_definitions ?? null,
    policy: CDSS_CONFIG.thresholds?._policy ?? null,
    precision_anchor: CDSS_CONFIG.thresholds?._precision_anchor ?? null,
    integrity_ok: t.integrity_ok ?? null,
    ...(warning ? { integrity_warning: warning } : {}),
    boundary_proximity_score: t.boundary_proximity_score ?? null,
    event_rate: t.event_rate ?? null,
    n_oof: t.n_oof ?? null,
    youden_j_max: t.youden_j_max ?? null,
    probability: prob,
    probability_display_allowed: prob !== null,
    panel_status: panel.label,
    panel_auc: panel.auc,
    badge: panel.badge,
    panel_badge: panel.badge
  };
}

window.CDSS = { loadCDSSConfig, plattProb, canDisplayProbability, getPanelStatus, getDiseaseThresholds, classifyProbabilityBand, checkScoreOrientation, renderRiskBlock, CONFIG: CDSS_CONFIG };
