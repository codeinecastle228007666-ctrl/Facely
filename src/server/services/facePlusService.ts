interface FacePlusItem {
  confidence: number;
  value: number;
}

interface FacePlusResult {
  acne: FacePlusItem;
  dark_circle: FacePlusItem;
  skin_spot: FacePlusItem;
  pores_left_cheek: FacePlusItem;
  pores_right_cheek: FacePlusItem;
  pores_forehead: FacePlusItem;
  pores_jaw: FacePlusItem;
  nasolabial_fold: FacePlusItem;
  forehead_wrinkle: FacePlusItem;
  glabella_wrinkle: FacePlusItem;
  crows_feet: FacePlusItem;
  eye_finelines: FacePlusItem;
  eye_pouch: FacePlusItem;
  left_eyelids: FacePlusItem;
  right_eyelids: FacePlusItem;
  blackhead: FacePlusItem;
  mole: FacePlusItem;
  skin_type: {
    details: Record<string, FacePlusItem>;
    skin_type: number;
  };
}

interface FacePlusResponse {
  result: FacePlusResult;
  face_rectangle: { left: number; top: number; width: number; height: number };
  error_message?: string;
  time_used: number;
}

const SKIN_TYPE_MAP: Record<number, string> = {
  0: "сухая",
  1: "жирная",
  2: "комбинированная",
  3: "нормальная",
};

const PROBLEM_MAP: Record<string, string> = {
  acne: "акне",
  dark_circle: "тёмные круги",
  pore: "поры",
  spot: "пигментация",
  wrinkle: "морщины",
  blackhead: "чёрные точки",
  eye_pouch: "мешки под глазами",
  eyelids: "отёчность век",
};

/**
 * ── Scoring model ──────────────────────────────────────────────────────
 * Each Face++ feature has its own severity "value" (0–100; usually
 * 0 / 60 / 100) AND a "confidence" (0–1). The old code averaged values
 * across 8 features blindly, which made one severe problem average
 * out as "excellent". New model:
 *
 *   badness_i    = confidence < MIN_CONFIDENCE ? 0 : value/100
 *   goodness_i   = 1 - badness_i
 *   skin_score   = round( Σ(weight_i × goodness_i) / Σ(weight_i) × 100 )
 *
 * If no feature is informative (all conf < 0.4) → default to 100
 * (no informed signal = no problem detected).
 */
const FEATURE_WEIGHTS: Record<string, number> = {
  acne: 0.22,        // most user-visible
  spot: 0.18,        // pigmentation, fades visibly with care
  wrinkle: 0.18,     // aging
  dark_circle: 0.12,
  pore: 0.10,
  blackhead: 0.08,
  eye_pouch: 0.06,
  eyelids: 0.06,
};
// sum = 1.00

const MIN_CONFIDENCE = 0.4;
// Below this confidence, treat the value as noise.

function severityFromValue(value: number): "лёгкое" | "умеренное" | "выраженное" | null {
  if (value >= 90) return "выраженное";
  if (value >= 60) return "умеренное";
  if (value >= 30) return "лёгкое";
  return null;
}

function badness(value: number, confidence: number): number {
  if (confidence < MIN_CONFIDENCE) return 0;
  return Math.max(0, Math.min(1, value / 100));
}

function weightedSkinScore(features: Record<string, { value: number; confidence: number }>, problems: { severity: "лёгкое" | "умеренное" | "выраженное" }[] = []): number {
  let totalW = 0;
  let goodnessSum = 0;
  for (const [key, { value, confidence }] of Object.entries(features)) {
    const w = FEATURE_WEIGHTS[key];
    if (!w) continue;
    const b = badness(value, confidence);
    totalW += w;
    goodnessSum += w * (1 - b);
  }
  if (totalW === 0) return 100; // no informed signal

  // ── Score-floor: prevent the green-circle-while-problem-listed lie.
  let score = Math.round((goodnessSum / totalW) * 100);
  const hasSevere = problems.some((p) => p.severity === "выраженное");
  const hasModerate = problems.some((p) => p.severity === "умеренное");
  const hasMild = problems.some((p) => p.severity === "лёгкое");
  if (hasSevere) score = Math.min(score, 49);
  else if (hasModerate) score = Math.min(score, 69);
  else if (hasMild) score = Math.min(score, 84);
  return Math.max(0, Math.min(100, score));
}

/**
 * Resolve skin type only when the model is confident.
 */
function determineSkinType(skinType: FacePlusResult["skin_type"] | undefined | null): string {
  const top = skinType?.skin_type ?? 3;
  const conf = skinType?.details?.[String(top)]?.confidence ?? 0;
  const name = SKIN_TYPE_MAP[top] || "нормальная";
  return conf >= MIN_CONFIDENCE ? name : "неопределён";
}

const PROBLEM_DESC: Record<string, string> = {
  acne: "Воспалительные элементы на коже: чёрные точки, папулы, пустулы. Могут быть вызваны гормональными изменениями, неправильным уходом или питанием.",
  dark_circle: "Потемнение кожи под глазами. Причины: нарушение микроциркуляции, недостаток сна, генетическая предрасположенность, истончение кожи.",
  pore: "Расширенные поры — результат избыточной выработки себума и снижения упругости стенок пор. Чаще встречаются в Т-зоне.",
  spot: "Участки гиперпигментации: постакне, солнечные пятна, мелазма. Возникают из-за избыточной выработки меланина под воздействием УФ.",
  wrinkle: "Мимические и возрастные морщины. Появляются из-за снижения выработки коллагена и эластина, обезвоженности, воздействия УФ.",
  blackhead: "Открытые комедоны — результат закупорки пор кожным салом и ороговевшими клетками. Чаще встречаются в Т-зоне.",
  eye_pouch: "Припухлость под глазами: задержка жидкости, усталость, возрастные изменения, нарушение лимфотока.",
  eyelids: "Отёчность век — скопление жидкости в тканях вокруг глаз. Причины: усталость, недосып, задержка соли.",
};

const RECOMMENDATIONS_MAP: Record<string, string[]> = {
  acne: [
    "Сыворотка с салициловой кислотой 2% для проблемной кожи",
    "Лёгкий гель с цинком для успокоения воспалений",
    "Маска с глиной для глубокого очищения пор",
  ],
  dark_circle: [
    "Крем для кожи вокруг глаз с кофеином",
    "Патчи под глаза с гиалуроновой кислотой",
    "Сыворотка с витамином C для осветления",
  ],
  pore: [
    "Сыворотка с ниацинамидом 5% для сужения пор",
    "Энзимная пудра для мягкого отшелушивания",
    "Тонер с AHA-кислотами для выравнивания текстуры",
  ],
  spot: [
    "Сыворотка с витамином C для осветления пигментации",
    "Крем с ретинолом для обновления кожи",
    "SPF 50+ ежедневно для защиты от фотостарения",
  ],
  wrinkle: [
    "Крем с ретинолом для стимуляции коллагена",
    "Сыворотка с пептидами для упругости кожи",
    "Увлажняющий крем с коэнзимом Q10",
  ],
  blackhead: [
    "Сыворотка с салициловой кислотой 2%",
    "Энзимная пудра для умывания",
    "Маска с глиной 2 раза в неделю",
  ],
  eye_pouch: [
    "Крем для век с кофеином",
    "Патчи с гидрогелем под глаза",
    "Лимфодренажный массаж лица",
  ],
  eyelids: [
    "Лёгкий гель для век с экстрактом огурца",
    "Патчи с зелёным чаем для снятия отёчности",
    "Ограничить солёное на ночь",
  ],
};

function buildRoutine(
  skinType: string,
  problems: string[],
  hasAcne: boolean,
): string {
  const parts: string[] = [];

  parts.push(
    hasAcne
      ? "Очищение: мягкий гель с салициловой кислотой"
      : "Очищение: мягкая пенка для умывания",
  );
  parts.push("Тонизирование: успокаивающий тонер без спирта");

  if (problems.includes("морщины")) {
    parts.push("Сыворотка: увлажняющая с гиалуроновой кислотой");
  }
  if (problems.includes("акне") || problems.includes("поры")) {
    parts.push("Сыворотка: матирующая с ниацинамидом");
  }
  if (problems.includes("пигментация")) {
    parts.push("Сыворотка: с витамином C");
  }

  if (skinType === "жирная" || skinType === "комбинированная") {
    parts.push("Увлажнение: лёгкий гелевый крем");
  } else {
    parts.push("Увлажнение: питательный крем");
  }
  parts.push("Защита: SPF 50+ ежедневно");

  const morning = parts.join(" → ");
  const evening: string[] = [];

  evening.push("Демакияж: мицеллярная вода");
  evening.push(hasAcne ? "Умывание: гель с салициловой кислотой" : "Умывание: мягкая пенка");
  evening.push("Тонизирование");
  if (problems.includes("пигментация") || problems.includes("морщины")) {
    evening.push("Сыворотка: с ретинолом (через день)");
  }
  evening.push("Ночной крем: питательный с церамидами");

  return `Утром: ${morning}\nВечером: ${evening.join(" → ")}`;
}

function determineMood(
  problems: string[],
): "позитивный" | "нейтральный" | "тревожный" {
  if (problems.length >= 3) return "тревожный";
  if (problems.length >= 1) return "нейтральный";
  return "позитивный";
}

function generateProductLinks(
  problems: string[],
): Array<{ name: string; reason: string; effect: string }> {
  const PRODUCTS: Record<string, Array<{ name: string; reason: string; effect: string }>> = {
    акне: [
      { name: "Сыворотка с салициловой кислотой 2%", reason: "Глубоко очищает поры и уменьшает воспаления", effect: "Через 2 недели воспаления станут заметно меньше, кожа успокоится" },
      { name: "Гель с цинком", reason: "Успокаивает и подсушивает высыпания", effect: "Новые прыщи будут появляться реже, краснота уйдёт за 3-4 дня" },
    ],
    поры: [
      { name: "Сыворотка с ниацинамидом 5%", reason: "Сужает поры и выравнивает тон", effect: "Через месяц поры станут менее заметными, тон кожи выровняется" },
      { name: "Энзимная пудра для умывания", reason: "Мягко отшелушивает и очищает", effect: "Текстура кожи станет более гладкой уже через неделю" },
    ],
    "тёмные круги": [
      { name: "Крем для глаз с кофеином", reason: "Улучшает микроциркуляцию", effect: "Тёмные круги станут светлее через 2 недели регулярного применения" },
      { name: "Патчи с гиалуроновой кислотой", reason: "Интенсивно увлажняют и освежают", effect: "Экспресс-эффект — кожа вокруг глаз выглядит отдохнувшей сразу" },
    ],
    пигментация: [
      { name: "Сыворотка с витамином C", reason: "Осветляет пигментные пятна", effect: "Пигментация станет заметно светлее через 3-4 недели" },
      { name: "SPF 50+ ежедневно", reason: "Защищает от появления новых пятен", effect: "Предотвращает потемнение существующих пятен и появление новых" },
    ],
    морщины: [
      { name: "Крем с ретинолом", reason: "Стимулирует выработку коллагена", effect: "Мелкие морщины разгладятся через месяц, глубокие станут менее заметными" },
      { name: "Сыворотка с пептидами", reason: "Повышает упругость кожи", effect: "Кожа станет более упругой и подтянутой через 2-3 недели" },
    ],
    "чёрные точки": [
      { name: "Сыворотка с салициловой кислотой 2%", reason: "Растворяет пробки в порах", effect: "Чёрные точки станут заметно светлее и меньше через 2 недели" },
      { name: "Энзимная пудра", reason: "Мягко отшелушивает без травмирования", effect: "Поры очистятся, текстура выровняется через 3-4 применения" },
    ],
    "мешки под глазами": [
      { name: "Крем для век с кофеином", reason: "Улучшает микроциркуляцию и отток жидкости", effect: "Отёчность уменьшится утром после первого же применения" },
      { name: "Патчи гидрогелевые", reason: "Охлаждают и увлажняют тонкую кожу век", effect: "Мешки заметно уменьшатся после 15 минут, взгляд станет свежее" },
    ],
    "отёчность век": [
      { name: "Гель для век с экстрактом огурца", reason: "Охлаждает и снимает припухлость", effect: "Отёчность спадает через 10-15 минут после нанесения" },
      { name: "Патчи с зелёным чаем", reason: "Антиоксиданты и кофеин тонизируют кожу век", effect: "Веки выглядят менее припухшими, взгляд открытый" },
    ],
  };

  const links: Array<{ name: string; reason: string; effect: string }> = [];

  for (const [problem, items] of Object.entries(PRODUCTS)) {
    if (problems.some((p) => p.startsWith(problem))) {
      links.push(...items);
    }
  }

  if (links.length === 0) {
    links.push(
      { name: "Мягкая пенка для умывания", reason: "Мягкое очищение без пересушивания", effect: "Кожа остаётся чистой и увлажнённой после каждого умывания" },
      { name: "Увлажняющий крем с гиалуроновой кислотой", reason: "Интенсивно увлажняет", effect: "Спустя неделю кожа станет более упругой и сияющей" },
      { name: "SPF 50+ для лица", reason: "Защита от фотостарения", effect: "Предотвращает преждевременное старение и пигментацию" },
    );
  }

  return links;
}

export type AnalysisVerdict = {
  skin_type: string;
  problems: string[];
  skin_score: number;
  recommendations: string[];
  daily_routine: string;
  mood: "позитивный" | "нейтральный" | "тревожный";
  product_links: Array<{
    name: string;
    reason: string;
    effect: string;
  }>;
  /**
   * Internal: full Face++ response passed back to the service layer so
   * it can persist into SkinAnalysis.rawFacePlus. Stripped before
   * sending to the client.
   *
   * History: Jun-25 rolled Groq severity refinement back (JSON parse
   * failures); Jun-25 evening rolled Groq `analyzeProblemPositions`
   * back too — vision LLM was misclassifying nostrils / eyebrows / lips
   * as inflammatory lesions. We rely solely on Face++ structured data
   * with confidence gating for objectivity.
   */
  _rawResponse: FacePlusResult;
};

export async function analyzeSkinWithFacePlus(
  imageBase64: string,
): Promise<AnalysisVerdict> {
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const sizeKB = Math.round((cleanBase64.length * 3) / 4 / 1024);
  if (sizeKB < 10) {
    throw new Error("Фото слишком маленькое. Сделайте новый снимок.");
  }

  const buffer = Buffer.from(cleanBase64, "base64");
  const formData = new FormData();
  formData.append("api_key", process.env.FACE_PLUS_KEY!);
  formData.append("api_secret", process.env.FACE_PLUS_SECRET!);
  formData.append("image_file", new Blob([buffer], { type: "image/jpeg" }), "photo.jpg");
  formData.append("return_attributes", "skin_status,skin_health");

  let response: Response;
  try {
    response = await fetch(
      "https://api-us.faceplusplus.com/facepp/v1/skinanalyze",
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(20000),
      },
    );
  } catch (e: any) {
    console.error(`[Face++] Network error: ${e.message}`);
    throw new Error("Не удалось подключиться к серверу анализа. Проверьте интернет и попробуйте снова.");
  }

  const raw = await response.text();
  let data: FacePlusResponse;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error(`[Face++] Raw response: ${raw.slice(0, 1000)}`);
    throw new Error("Некорректный ответ от Face++ API");
  }

  console.log(`[Face++] Full response:`, JSON.stringify(data));

  if (data.error_message) {
    console.log(`[Face++] API error: ${data.error_message}`);
    const knownErrors: Record<string, string> = {
      "FACE_NO_FACE": "Не видно лица. Сфотографируйтесь анфас при хорошем освещении, без макияжа, уберите волосы с лица.",
      "FACE_MULTIPLE_FACES": "На фото несколько лиц. Сделайте снимок только своего лица.",
      "FACE_OCCLUDED": "Лицо частично закрыто. Уберите волосы, руки, маску — лицо должно быть полностью видно.",
      "INVALID_IMAGE_SIZE": "Фото слишком большого размера. Сделайте новый снимок.",
      "INVALID_IMAGE_FORMAT": "Формат фото не поддерживается. Используйте JPEG или PNG.",
      "IMAGE_SIZE_TOO_SMALL": "Фото слишком маленькое. Сделайте снимок крупнее, лицо должно занимать большую часть кадра.",
    };
    const userMessage = knownErrors[data.error_message] || `Не удалось проанализировать фото. Пожалуйста, сделайте новый снимок с хорошим освещением.\n(Код ошибки: ${data.error_message})`;
    throw new Error(userMessage);
  }

  if (!data.result) {
    throw new Error("Face++ не смог проанализировать кожу. Попробуйте другое фото.");
  }

  const r = data.result;

  // Aggregate pore score (max-confidence across 4 zones — see commit
  // "pore max-conf" for rationale).
  const poreEntries = [
    r.pores_left_cheek,
    r.pores_right_cheek,
    r.pores_forehead,
    r.pores_jaw,
  ].map((v) => v ?? { confidence: 0, value: 0 });
  const bestPore = poreEntries.reduce((best, cur) =>
    cur.confidence > best.confidence ? cur : best,
  );
  const poreConfidence = bestPore.confidence;
  const poreValue = bestPore.value;

  // Aggregate wrinkle as max across types.
  const wrinkleValues = [
    r.nasolabial_fold,
    r.forehead_wrinkle,
    r.glabella_wrinkle,
    r.crows_feet,
    r.eye_finelines,
  ].map((v) => v ?? { confidence: 0, value: 0 });
  const wrinkleEntry = wrinkleValues.reduce((worst, cur) =>
    cur.value > worst.value ? cur : worst,
  );

  // Aggregate eyelids as average across both eyes.
  const eyelidConfidence =
    ((r.left_eyelids?.confidence ?? 0) + (r.right_eyelids?.confidence ?? 0)) / 2;
  const eyelidValue =
    ((r.left_eyelids?.value ?? 0) + (r.right_eyelids?.value ?? 0)) / 2;

  // Build feature bag for weighted scoring.
  const features: Record<string, { value: number; confidence: number }> = {
    acne: { value: r.acne?.value ?? 0, confidence: r.acne?.confidence ?? 0 },
    dark_circle: { value: r.dark_circle?.value ?? 0, confidence: r.dark_circle?.confidence ?? 0 },
    pore: { value: poreValue, confidence: poreConfidence },
    spot: { value: r.skin_spot?.value ?? 0, confidence: r.skin_spot?.confidence ?? 0 },
    wrinkle: { value: wrinkleEntry.value, confidence: wrinkleEntry.confidence },
    blackhead: { value: r.blackhead?.value ?? 0, confidence: r.blackhead?.confidence ?? 0 },
    eye_pouch: { value: r.eye_pouch?.value ?? 0, confidence: r.eye_pouch?.confidence ?? 0 },
    eyelids: { value: eyelidValue, confidence: eyelidConfidence },
  };

  // Build problem list from Face++.
  const problemEntries: { name: string; severity: "лёгкое" | "умеренное" | "выраженное" }[] = [];
  const recommendations: string[] = [];
  for (const [key, { value, confidence }] of Object.entries(features)) {
    if (confidence < MIN_CONFIDENCE) continue;
    const sev = severityFromValue(value);
    if (sev === null) continue;
    const problemName = PROBLEM_MAP[key];
    if (!problemName) continue;
    problemEntries.push({ name: problemName, severity: sev });
    const recs = RECOMMENDATIONS_MAP[key];
    if (recs) recommendations.push(...recs);
  }

  const skinType = determineSkinType(r.skin_type);
  const skinScore = weightedSkinScore(features, problemEntries);
  const problems = problemEntries.map((p) => `${p.name} (${p.severity})`);

  const hasAcne = problemEntries.some((p) => p.name === "акне");

  const mood = determineMood(problems);
  const dailyRoutine = buildRoutine(skinType, problems, hasAcne);
  const productLinks = generateProductLinks(problems);

  return {
    skin_type: skinType,
    problems,
    skin_score: skinScore,
    recommendations,
    daily_routine: dailyRoutine,
    mood,
    product_links: productLinks,
    _rawResponse: r,
  };
}
